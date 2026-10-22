import "server-only";

import sharp from "sharp";

import { getOpenAIClient } from "@/lib/openai/client";
import { getOpenAIDiagnostic } from "@/lib/openai/response-diagnostics";
import { structuredResponseText } from "@/lib/openai/structured-response";
import { getReferenceAnalysisModel } from "@/lib/generation/references/reference-analysis";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createProductAnalysisInput,
  productAnalysisModelOutputSchema,
  getProductAnalysisOutputErrorPaths,
  normalizeProductVertical,
  validateProductAnalysisModelOutput,
  type ProductAnalysisOutputValidation,
} from "./product-analysis-model-output";
import { decideProductAnalysisCache, isCurrentProductAnalysisCacheStatus, type ProductAnalysisCacheStatus } from "./product-analysis-cache";

import {
  isProductProfile,
  PRODUCT_PROFILE_ANALYSIS_VERSION,
  PRODUCT_PROFILE_SCHEMA_VERSION,
  type ProductProfile,
} from "./product-profile";

export { PRODUCT_PROFILE_ANALYSIS_VERSION, PRODUCT_PROFILE_SCHEMA_VERSION } from "./product-profile";

type AnalysisAsset = {
  id: string;
  bucketId: string;
  objectPath: string;
  productProfile: unknown;
  productAnalysisStatus?: unknown;
};

type ProductAnalysisStatus = ProductAnalysisCacheStatus & {
  attemptedAt: string;
  inferredCategory?: string | null;
};

type ProductUnderstandingRepository = {
  findOwnedProductAsset(userId: string, assetId: string): Promise<AnalysisAsset | null>;
  downloadAsset(asset: AnalysisAsset): Promise<{ data: Buffer; mimeType: string } | null>;
  saveProfile(userId: string, assetId: string, profile: ProductProfile): Promise<boolean>;
  saveAnalysisStatus?(userId: string, assetId: string, status: ProductAnalysisStatus): Promise<boolean>;
};

export type ProductAnalysisClient = {
  analyze(input: { assetId: string; image: { data: Buffer; mimeType: string } }): Promise<ProductAnalysisOutputValidation | unknown>;
};

export type ProductAnalysisFailureReason = "asset_not_found" | "asset_unavailable" | "analysis_failed" | "provider_empty_response" | "response_shape_mismatch" | "json_parse_failed" | "schema_validation_failed" | "id_mismatch" | "persistence_failed";

export type ProductAnalysisResult =
  | { status: "supported"; profile: ProductProfile; reused: boolean }
  | { status: "unsupported"; inferredCategory: string | null; unsupportedReason: string; reason: "unsupported_product" }
  | { status: "failed"; reason: ProductAnalysisFailureReason };

export type AnalyzeProductAssetOptions = {
  assetId: string;
  force?: boolean;
  userId: string;
  /** Used only by the durable manual-reanalysis admission service. */
  providerLifecycle?: {
    beforeProviderSubmission(): Promise<boolean>;
    providerResponseReceived(): Promise<boolean>;
  };
};

function normalizeUnsupportedClassification(input: { rawCategory: string | null; reason: string | null; assetId: string }): ProductAnalysisOutputValidation {
  const validation = validateProductAnalysisModelOutput({
    status: "unsupported", vertical: null, rawCategory: input.rawCategory ?? "", subcategory: null,
    unsupportedReason: input.reason ?? "", profile: null,
  }, { assetId: input.assetId, model: getProductUnderstandingModel(), analyzedAt: new Date().toISOString() });
  if (validation.output && !("status" in validation.output)) {
    logAnalysis("unsupported_recovered", { assetId: input.assetId, rawCategory: input.rawCategory, resolvedVertical: validation.output.vertical, reason: "Supported category evidence overrides contradictory unsupported status." });
  }
  return validation;
}

const analysisImageMaximum = 2048;

function isCurrentProfile(value: unknown): value is ProductProfile {
  return isProductProfile(value)
    && value.schemaVersion === PRODUCT_PROFILE_SCHEMA_VERSION
    && value.analysisVersion === PRODUCT_PROFILE_ANALYSIS_VERSION;
}

function isUnsupportedResponse(value: unknown): value is { status: "unsupported"; inferredCategory: string | null } {
  return Boolean(
    value && typeof value === "object" && "status" in value && (value as { status?: unknown }).status === "unsupported",
  );
}

function logAnalysis(event: string, details: Record<string, string | number | boolean | null>) {
  if (process.env.NODE_ENV === "development") {
    console.info(`[product-understanding] ${event}`, details);
  }
}

export async function prepareProductAnalysisImage(
  image: { data: Buffer; mimeType: string },
): Promise<{ data: Buffer; mimeType: "image/jpeg" } | null> {
  try {
    const metadata = await sharp(image.data, { limitInputPixels: 50_000_000 }).metadata();
    if (!metadata.width || !metadata.height) return null;

    return {
      data: await sharp(image.data, { limitInputPixels: 50_000_000 })
        .rotate()
        .resize({ width: analysisImageMaximum, height: analysisImageMaximum, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer(),
      mimeType: "image/jpeg",
    };
  } catch {
    return null;
  }
}

export async function analyzeProductAssetWithDependencies(
  options: AnalyzeProductAssetOptions,
  dependencies: { client: ProductAnalysisClient; repository: ProductUnderstandingRepository },
): Promise<ProductAnalysisResult> {
  const asset = await dependencies.repository.findOwnedProductAsset(options.userId, options.assetId);
  if (!asset) return { status: "failed", reason: "asset_not_found" };

  const priorStatus = asset.productAnalysisStatus && typeof asset.productAnalysisStatus === "object" ? asset.productAnalysisStatus as Partial<ProductAnalysisStatus> : null;
  const priorVersion = isCurrentProfile(asset.productProfile) ? asset.productProfile.analysisVersion : priorStatus?.analyzerVersion ?? null;
  const previousState = isCurrentProfile(asset.productProfile) ? "supported" : priorStatus?.status ?? "uncached";
  if (options.force) logAnalysis("forced_reanalysis", { assetId: asset.id, previousState, previousVersion: priorVersion, newVersion: PRODUCT_PROFILE_ANALYSIS_VERSION });

  const cacheDecision = decideProductAnalysisCache({
    force: Boolean(options.force), currentProfile: isCurrentProfile(asset.productProfile), status: asset.productAnalysisStatus,
    identity: { assetId: asset.id, objectPath: asset.objectPath, model: getProductUnderstandingModel() },
  });
  if (cacheDecision === "reuse_supported" && isCurrentProfile(asset.productProfile)) {
    logAnalysis("cache_decision", { assetId: asset.id, decision: "hit", state: "supported", version: PRODUCT_PROFILE_ANALYSIS_VERSION });
    return { status: "supported", profile: asset.productProfile, reused: true };
  }
  if (cacheDecision === "reuse_unsupported" && isCurrentProductAnalysisCacheStatus(asset.productAnalysisStatus, { assetId: asset.id, objectPath: asset.objectPath, analyzerVersion: PRODUCT_PROFILE_ANALYSIS_VERSION, schemaVersion: PRODUCT_PROFILE_SCHEMA_VERSION, model: getProductUnderstandingModel() })) {
    const cachedStatus = asset.productAnalysisStatus as ProductAnalysisStatus;
    logAnalysis("cache_decision", { assetId: asset.id, decision: "hit", state: "unsupported", version: PRODUCT_PROFILE_ANALYSIS_VERSION });
    return { status: "unsupported", inferredCategory: cachedStatus.inferredCategory ?? null, unsupportedReason: "Previously classified as unsupported.", reason: "unsupported_product" };
  }
  if (cacheDecision === "respect_retry_window") {
    logAnalysis("cache_decision", { assetId: asset.id, decision: "hit", state: "failed_transient", version: PRODUCT_PROFILE_ANALYSIS_VERSION });
    return { status: "failed", reason: "analysis_failed" };
  }
  logAnalysis("cache_decision", { assetId: asset.id, decision: options.force ? "forced_miss" : "miss", state: previousState, version: PRODUCT_PROFILE_ANALYSIS_VERSION });

  const saveStatus = async (status: ProductAnalysisStatus["status"], inferredCategory?: string | null) => {
    const attemptedAt = new Date();
    await dependencies.repository.saveAnalysisStatus?.(options.userId, asset.id, {
      status, assetId: asset.id, objectPath: asset.objectPath, analyzerVersion: PRODUCT_PROFILE_ANALYSIS_VERSION,
      schemaVersion: PRODUCT_PROFILE_SCHEMA_VERSION, model: getProductUnderstandingModel(), attemptedAt: attemptedAt.toISOString(),
      ...(inferredCategory === undefined ? {} : { inferredCategory }),
      ...(status === "failed_transient" ? { retryAfter: new Date(attemptedAt.getTime() + 6 * 60 * 60 * 1000).toISOString() } : {}),
    });
  };

  const downloaded = await dependencies.repository.downloadAsset(asset);
  if (!downloaded) return { status: "failed", reason: "asset_unavailable" };
  const prepared = await prepareProductAnalysisImage(downloaded);
  if (!prepared) return { status: "failed", reason: "asset_unavailable" };

  let response: unknown;
  let responseDiagnostics: { responseCategory: string; topLevelKeys: string; outputTextPresent: boolean; outputArrayPresent: boolean; choicesArrayPresent: boolean; contentArrayPresent: boolean; parsedJsonPresent: boolean; profileFieldPresent: boolean; validatedOutputKind: string; validatedOutputStatus: string | null; validatedOutputVertical: string | null; validatedProfilePresent: boolean };
  try {
    logAnalysis("provider_request_start", { assetId: asset.id, model: getProductUnderstandingModel(), imageMimeType: prepared.mimeType, imageBytes: prepared.data.length });
    if (options.providerLifecycle && !await options.providerLifecycle.beforeProviderSubmission()) {
      return { status: "failed", reason: "analysis_failed" };
    }
    response = await dependencies.client.analyze({ assetId: asset.id, image: prepared });
    if (options.providerLifecycle && !await options.providerLifecycle.providerResponseReceived()) {
      return { status: "failed", reason: "analysis_failed" };
    }
    const record = response && typeof response === "object" && !Array.isArray(response) ? response as Record<string, unknown> : null;
    const validatedOutput = record && "output" in record ? record.output : null;
    const validatedRecord = validatedOutput && typeof validatedOutput === "object" && !Array.isArray(validatedOutput) ? validatedOutput as Record<string, unknown> : null;
    const rawRecord = validatedRecord ?? record;
    const providerSummary = record?.providerSummary && typeof record.providerSummary === "object" ? record.providerSummary as Record<string, unknown> : null;
    const rawVertical = typeof providerSummary?.rawVertical === "string" ? providerSummary.rawVertical : typeof rawRecord?.vertical === "string" ? rawRecord.vertical : null;
    const rawCategory = typeof providerSummary?.rawCategory === "string" ? providerSummary.rawCategory : typeof rawRecord?.rawCategory === "string" ? rawRecord.rawCategory : typeof rawRecord?.inferredCategory === "string" ? rawRecord.inferredCategory : null;
    const normalizedVertical = normalizeProductVertical(rawVertical, rawCategory, providerSummary?.rawSubcategory ?? rawRecord?.subcategory);
    responseDiagnostics = {
      responseCategory: response && typeof response === "object" ? Array.isArray(response) ? "array" : "object" : response === null ? "null" : typeof response,
      topLevelKeys: record ? Object.keys(record).join(",").slice(0, 300) : "",
      outputTextPresent: Boolean(record && typeof record.output_text === "string"),
      outputArrayPresent: Boolean(record && Array.isArray(record.output)),
      choicesArrayPresent: Boolean(record && Array.isArray(record.choices)),
      contentArrayPresent: Boolean(record && Array.isArray(record.content)),
      parsedJsonPresent: Boolean(record && "parsed" in record),
      profileFieldPresent: Boolean(record && "profile" in record),
      validatedOutputKind: validatedOutput === null ? "null" : Array.isArray(validatedOutput) ? "array" : typeof validatedOutput,
      validatedOutputStatus: typeof validatedRecord?.status === "string" ? validatedRecord.status : null,
      validatedOutputVertical: typeof validatedRecord?.vertical === "string" ? validatedRecord.vertical : null,
      validatedProfilePresent: isProductProfile(validatedOutput),
    };
    logAnalysis("provider_structured_output", {
      assetId: asset.id,
      status: typeof providerSummary?.status === "string" ? providerSummary.status : typeof rawRecord?.status === "string" ? rawRecord.status : null,
      rawVertical, rawCategory,
      rawSubcategory: typeof providerSummary?.rawSubcategory === "string" ? providerSummary.rawSubcategory : typeof rawRecord?.subcategory === "string" ? rawRecord.subcategory : null,
      hasProfile: typeof providerSummary?.hasProfile === "boolean" ? providerSummary.hasProfile : Boolean(rawRecord && rawRecord.profile && typeof rawRecord.profile === "object"),
      confidence: typeof providerSummary?.confidence === "number" ? providerSummary.confidence : rawRecord?.profile && typeof rawRecord.profile === "object" && "confidence" in rawRecord.profile ? Number((rawRecord.profile as { confidence?: unknown }).confidence) || null : null,
      schemaErrorPaths: record && Array.isArray(record.errorPaths) ? record.errorPaths.filter((path): path is string => typeof path === "string").slice(0, 12).join(",") : "",
      normalizationResult: normalizedVertical,
    });
    if (providerSummary?.status === "unsupported" && normalizedVertical && isProductProfile(validatedOutput)) {
      logAnalysis("unsupported_recovered", { assetId: asset.id, rawCategory, resolvedVertical: normalizedVertical, reason: "Supported category evidence overrides contradictory unsupported status." });
    }
  } catch (error) {
    const diagnostic = getOpenAIDiagnostic(error);
    logAnalysis("openai_error", {
      assetId: asset.id,
      status: diagnostic.status,
      code: diagnostic.errorCode,
      type: diagnostic.errorType,
      param: diagnostic.param,
      message: diagnostic.safeMessage,
      model: getProductUnderstandingModel(),
      analysisVersion: PRODUCT_PROFILE_ANALYSIS_VERSION,
    });
    await saveStatus("failed_transient");
    return { status: "failed", reason: "analysis_failed" };
  }
  logAnalysis("provider_response_received", { assetId: asset.id, ...responseDiagnostics });

  if (isUnsupportedResponse(response)) {
    response = normalizeUnsupportedClassification({ rawCategory: response.inferredCategory, reason: "Provider classified the image as unsupported.", assetId: asset.id });
  }

  if (!response || typeof response !== "object" || Array.isArray(response)) {
    logAnalysis("failed", {
      assetId: asset.id,
      reason: response === null || response === undefined ? "provider_empty_response" : "response_shape_mismatch",
      topLevelKeys: "",
      profileFieldPresent: false,
    });
    return { status: "failed", reason: response === null || response === undefined ? "provider_empty_response" : "response_shape_mismatch" };
  }

  const directEnvelope = response as Record<string, unknown>;
  if (directEnvelope.status === "unsupported") {
    const nestedOutput = directEnvelope.output && typeof directEnvelope.output === "object" ? directEnvelope.output as Record<string, unknown> : null;
    const rawCategory = typeof directEnvelope.inferredCategory === "string" ? directEnvelope.inferredCategory : typeof nestedOutput?.inferredCategory === "string" ? nestedOutput.inferredCategory : typeof directEnvelope.rawCategory === "string" ? directEnvelope.rawCategory : null;
    const reason = typeof directEnvelope.unsupportedReason === "string" ? directEnvelope.unsupportedReason : typeof nestedOutput?.unsupportedReason === "string" ? nestedOutput.unsupportedReason : null;
    response = normalizeUnsupportedClassification({ rawCategory, reason, assetId: asset.id });
  }

  const envelope = response as ProductAnalysisOutputValidation;
  // Injected clients may provide the normalized profile envelope directly. Production
  // uses validateProductAnalysisModelOutput in the provider adapter above.
  if ("status" in envelope && envelope.status === "supported" && "profile" in envelope) {
    const profile = envelope.profile;
    if (!isCurrentProfile(profile)) {
      logAnalysis("failed", { assetId: asset.id, reason: "schema_validation_failed", schemaErrorPaths: "$.profile" });
      return { status: "failed", reason: "schema_validation_failed" };
    }
    if (profile.productId !== asset.id) {
      logAnalysis("failed", { assetId: asset.id, reason: "id_mismatch", expectedProductId: asset.id, matchingIdFieldPresent: false });
      return { status: "failed", reason: "id_mismatch" };
    }
    response = { output: profile, errorPaths: [] } satisfies ProductAnalysisOutputValidation;
  }
  let normalizedEnvelope = response as ProductAnalysisOutputValidation;
  if (!normalizedEnvelope.output) {
    const paths = normalizedEnvelope.errorPaths;
    if (paths.includes("$.json")) {
      logAnalysis("failed", { assetId: asset.id, reason: "json_parse_failed", schemaErrorPaths: "$.json" });
      return { status: "failed", reason: "json_parse_failed" };
    }
    const shapeMismatch = paths.includes("$") || paths.includes("$.status");
    const category = shapeMismatch ? "response_shape_mismatch" : "schema_validation_failed";
    logAnalysis("failed", { assetId: asset.id, reason: category, schemaErrorPaths: paths.slice(0, 12).join(",") });
    return { status: "failed", reason: category };
  }
  if ("status" in normalizedEnvelope.output) {
    const inferredCategory = normalizedEnvelope.output.inferredCategory;
    const canonical = normalizeUnsupportedClassification({ rawCategory: inferredCategory, reason: normalizedEnvelope.output.unsupportedReason, assetId: asset.id });
    if (!canonical.output) {
      logAnalysis("failed", { assetId: asset.id, reason: "schema_validation_failed", schemaErrorPaths: canonical.errorPaths.slice(0, 12).join(",") });
      return { status: "failed", reason: "schema_validation_failed" };
    }
    if (!("status" in canonical.output)) {
      normalizedEnvelope = canonical;
    } else {
      logAnalysis("unsupported", { assetId: asset.id, inferredCategory, analysisVersion: PRODUCT_PROFILE_ANALYSIS_VERSION });
      await saveStatus("unsupported", inferredCategory);
      return { status: "unsupported", inferredCategory, unsupportedReason: canonical.output.unsupportedReason, reason: "unsupported_product" };
    }
  }
  const candidate = normalizedEnvelope.output;
  if (!candidate || "status" in candidate) {
    logAnalysis("failed", { assetId: asset.id, reason: "schema_validation_failed", schemaErrorPaths: "$.profile" });
    return { status: "failed", reason: "schema_validation_failed" };
  }
  const finalCandidate: ProductProfile = candidate;
  logAnalysis("classification_normalized", { assetId: asset.id, vertical: finalCandidate.vertical, resolvedVertical: finalCandidate.vertical, subcategory: finalCandidate.subcategory, status: "supported" });
  logAnalysis("profile_validation_result", { assetId: asset.id, valid: isCurrentProfile(finalCandidate), profilePresent: true, validatedProfilePresent: true, confidence: finalCandidate.confidence.overall });
  if (!isCurrentProfile(finalCandidate)) {
    const errorPaths = getProductAnalysisOutputErrorPaths(finalCandidate);
    logAnalysis("failed", { assetId: asset.id, reason: "schema_validation_failed", schemaErrorPaths: errorPaths.slice(0, 12).join(",") });
    return { status: "failed", reason: "schema_validation_failed" };
  }
  if (finalCandidate.productId !== asset.id) {
    logAnalysis("failed", { assetId: asset.id, reason: "id_mismatch", expectedProductId: asset.id, matchingIdFieldPresent: Boolean("productId" in finalCandidate && finalCandidate.productId === asset.id) });
    return { status: "failed", reason: "id_mismatch" };
  }

  const profile: ProductProfile = {
    ...finalCandidate,
    // Server values are authoritative even if a model echoes a different source record.
    source: {
      ...finalCandidate.source,
      analysisVersion: PRODUCT_PROFILE_ANALYSIS_VERSION,
      model: getProductUnderstandingModel(),
      analyzedAt: new Date().toISOString(),
    },
  };
  logAnalysis("validated", {
    assetId: asset.id,
    vertical: profile.vertical,
    subcategory: profile.subcategory,
  });
  if (!await dependencies.repository.saveProfile(options.userId, asset.id, profile)) {
    logAnalysis("failed", { assetId: asset.id, reason: "persistence_failed" });
    return { status: "failed", reason: "persistence_failed" };
  }
  await saveStatus("valid");
  logAnalysis("persisted", { assetId: asset.id });

  logAnalysis("analyzed", {
    assetId: asset.id,
    status: "supported",
    vertical: profile.vertical,
    subcategory: profile.subcategory,
    model: profile.source.model,
    schemaVersion: profile.schemaVersion,
    analysisVersion: profile.analysisVersion,
  });
  return { status: "supported", profile, reused: false };
}

/**
 * This repository deliberately creates a fresh direct Supabase client for
 * every operation. It must never share the request/cookie-aware SSR client:
 * a user access token would replace the secret-key Authorization header.
 */
export class SupabaseProductUnderstandingRepository implements ProductUnderstandingRepository {
  async findOwnedProductAsset(userId: string, assetId: string): Promise<AnalysisAsset | null> {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from("assets")
      .select("id, bucket_id, object_path, product_profile, product_analysis_status")
      .eq("id", assetId)
      .eq("user_id", userId)
      .eq("asset_type", "product")
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      bucketId: data.bucket_id,
      objectPath: data.object_path,
      productProfile: data.product_profile,
      productAnalysisStatus: data.product_analysis_status,
    };
  }

  async downloadAsset(asset: AnalysisAsset) {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.storage.from(asset.bucketId).download(asset.objectPath);
    if (error || !data) return null;
    return { data: Buffer.from(await data.arrayBuffer()), mimeType: data.type || "image/png" };
  }

  async saveProfile(userId: string, assetId: string, profile: ProductProfile) {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from("assets")
      // ProductProfile was validated immediately before this call. The query
      // also constrains the privileged write to the owned product row only.
      .update({ product_profile: profile })
      .eq("id", assetId)
      .eq("user_id", userId)
      .eq("asset_type", "product")
      .select("id")
      .maybeSingle();
    if (error) {
      const diagnostic = getOpenAIDiagnostic(error);
      logAnalysis("persist_error", {
        assetId,
        code: diagnostic.errorCode,
        message: diagnostic.safeMessage,
      });
    }
    return !error && Boolean(data);
  }

  async saveAnalysisStatus(userId: string, assetId: string, status: ProductAnalysisStatus) {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.from("assets").update({ product_analysis_status: status }).eq("id", assetId).eq("user_id", userId).eq("asset_type", "product").select("id").maybeSingle();
    return !error && Boolean(data);
  }
}

const regionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["description", "location"],
  properties: { description: { type: "string" }, location: { type: "string" } },
} as const;

/** Retained as a domain reference; model requests use the flat schema above. */
export const legacyProductProfileSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "profile", "inferredCategory"],
  properties: {
    status: { type: "string", enum: ["supported", "unsupported"] },
    inferredCategory: { type: ["string", "null"] },
    profile: { anyOf: [{ type: "null" }, {
      type: "object",
      additionalProperties: false,
      required: ["productId", "schemaVersion", "analysisVersion", "vertical", "subcategory", "wearability", "rigidity", "materials", "dominantColors", "productShape", "identityCriticalAttributes", "visibleBranding", "interactionTargets", "allowedTransformations", "forbiddenTransformations", "sceneAffinities", "confidence", "source", "verticalAttributes"],
      properties: {
        productId: { type: "string" }, schemaVersion: { type: "number" }, analysisVersion: { type: "string" },
        vertical: { type: "string", enum: ["apparel", "jewelry", "watches", "cosmetics", "footwear", "bags"] }, subcategory: { type: ["string", "null"] },
        wearability: { type: "string", enum: ["wearable", "non_wearable", "context_dependent"] }, rigidity: { type: "string", enum: ["rigid", "semi_rigid", "deformable"] },
        materials: { type: "array", items: { type: "string" } }, dominantColors: { type: "array", items: { type: "string" } }, productShape: { type: "string" },
        identityCriticalAttributes: { type: "array", items: { type: "object", additionalProperties: false, required: ["attribute", "rationale", "regions"], properties: { attribute: { type: "string" }, rationale: { type: "string" }, regions: { type: "array", items: regionSchema } } } },
        visibleBranding: { type: "object", additionalProperties: false, required: ["hasLogo", "hasReadableText", "hasArtwork", "logoRegions", "textRegions", "artworkRegions"], properties: { hasLogo: { type: "boolean" }, hasReadableText: { type: "boolean" }, hasArtwork: { type: "boolean" }, logoRegions: { type: "array", items: regionSchema }, textRegions: { type: "array", items: regionSchema }, artworkRegions: { type: "array", items: regionSchema } } },
        interactionTargets: { type: "array", items: { type: "string", enum: ["finger", "wrist", "neck", "ear", "foot", "torso", "hand", "none"] } },
        allowedTransformations: { type: "array", items: { type: "string", enum: ["natural_fabric_deformation", "perspective_change", "lighting_or_reflection_change", "body_fitting", "natural_pose_flex", "none"] } },
        forbiddenTransformations: { type: "array", items: { type: "string", enum: ["recolor", "logo_movement", "geometry_redesign", "gemstone_count_change", "dial_layout_change", "outsole_redesign", "label_redesign", "text_or_artwork_change", "packaging_redesign"] } },
        sceneAffinities: { type: "object", additionalProperties: false, required: ["recommendedSceneTags", "discouragedSceneTags"], properties: { recommendedSceneTags: { type: "array", items: { type: "string" } }, discouragedSceneTags: { type: "array", items: { type: "string" } } } },
        confidence: { type: "object", additionalProperties: false, required: ["overall", "fields"], properties: { overall: { type: "number", minimum: 0, maximum: 1 }, fields: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, properties: { vertical: { type: "number" }, subcategory: { type: "number" }, materials: { type: "number" }, wearability: { type: "number" }, rigidity: { type: "number" }, visibleBranding: { type: "number" }, verticalAttributes: { type: "number" } } }] } } },
        source: { type: "object", additionalProperties: false, required: ["model", "analysisVersion", "analyzedAt"], properties: { model: { type: "string" }, analysisVersion: { type: "string" }, analyzedAt: { type: "string" } } },
        verticalAttributes: { anyOf: [
          { type: "object", additionalProperties: false, required: ["vertical", "details"], properties: { vertical: { const: "apparel" }, details: { type: "object", additionalProperties: false, required: ["garmentType", "primaryColor", "artworkOrLogoLocations", "closures", "pocketStructure", "hoodOrCollar", "constructionDetails", "identitySides"], properties: { garmentType: { type: "string" }, primaryColor: { type: ["string", "null"] }, artworkOrLogoLocations: { type: "array", items: regionSchema }, closures: { type: "array", items: { type: "string" } }, pocketStructure: { type: "array", items: { type: "string" } }, hoodOrCollar: { type: ["string", "null"] }, constructionDetails: { type: "array", items: { type: "string" } }, identitySides: { type: "array", items: { type: "string", enum: ["front", "back"] } } } } } },
          { type: "object", additionalProperties: false, required: ["vertical", "details"], properties: { vertical: { const: "jewelry" }, details: { type: "object", additionalProperties: false, required: ["jewelryType", "metalColorOrMaterial", "centerStone", "centerStoneShape", "centerStoneColor", "stoneCount", "stoneLayout", "settingStyle", "bandOrChainStructure", "bodyPlacementTarget"], properties: { jewelryType: { type: "string" }, metalColorOrMaterial: { type: ["string", "null"] }, centerStone: { type: ["boolean", "null"] }, centerStoneShape: { type: ["string", "null"] }, centerStoneColor: { type: ["string", "null"] }, stoneCount: { type: ["number", "null"] }, stoneLayout: { type: ["string", "null"] }, settingStyle: { type: ["string", "null"] }, bandOrChainStructure: { type: ["string", "null"] }, bodyPlacementTarget: { type: "string", enum: ["finger", "wrist", "neck", "ear", "other", "none"] } } } } },
          { type: "object", additionalProperties: false, required: ["vertical", "details"], properties: { vertical: { const: "watches" }, details: { type: "object", additionalProperties: false, required: ["caseShape", "caseMaterialOrColor", "dialColor", "bezel", "crownSide", "pushers", "braceletOrStrap", "indicesOrMarkers", "dateWindow", "subdials", "dialBrandingRegions"], properties: { caseShape: { type: ["string", "null"] }, caseMaterialOrColor: { type: ["string", "null"] }, dialColor: { type: ["string", "null"] }, bezel: { type: ["string", "null"] }, crownSide: { type: "string", enum: ["left", "right", "other", "not_visible"] }, pushers: { type: ["string", "null"] }, braceletOrStrap: { type: ["string", "null"] }, indicesOrMarkers: { type: ["string", "null"] }, dateWindow: { type: ["string", "null"] }, subdials: { type: ["string", "null"] }, dialBrandingRegions: { type: "array", items: regionSchema } } } } },
          { type: "object", additionalProperties: false, required: ["vertical", "details"], properties: { vertical: { const: "cosmetics" }, details: { type: "object", additionalProperties: false, required: ["packageType", "packageGeometry", "containerForm", "closureOrDispenser", "materialOpacity", "liquidVisibility", "labelRegions", "logoRegions"], properties: { packageType: { type: "string" }, packageGeometry: { type: ["string", "null"] }, containerForm: { type: "string", enum: ["bottle", "jar", "tube", "compact", "other"] }, closureOrDispenser: { type: "string", enum: ["cap", "pump", "dropper", "spray", "other", "none"] }, materialOpacity: { type: "string", enum: ["transparent", "translucent", "opaque", "mixed"] }, liquidVisibility: { type: "string", enum: ["visible", "not_visible", "not_applicable"] }, labelRegions: { type: "array", items: regionSchema }, logoRegions: { type: "array", items: regionSchema } } } } },
          { type: "object", additionalProperties: false, required: ["vertical", "details"], properties: { vertical: { const: "footwear" }, details: { type: "object", additionalProperties: false, required: ["shoeType", "silhouette", "upperMaterial", "outsole", "midsole", "panelStructure", "lacing", "tongue", "heel", "logoRegions", "colorBlocking"], properties: { shoeType: { type: "string" }, silhouette: { type: ["string", "null"] }, upperMaterial: { type: "array", items: { type: "string" } }, outsole: { type: ["string", "null"] }, midsole: { type: ["string", "null"] }, panelStructure: { type: "array", items: { type: "string" } }, lacing: { type: ["string", "null"] }, tongue: { type: ["string", "null"] }, heel: { type: ["string", "null"] }, logoRegions: { type: "array", items: regionSchema }, colorBlocking: { type: "array", items: { type: "string" } } } } } },
        ] },
      },
    }] },
  },
} as const;

const analyzerInstructions = [
  "Analyze the supplied image as a product-understanding task. Follow two stages in order.",
  "STEP 1 — CLASSIFY: choose exactly one supported vertical whenever the visible product reasonably matches apparel (garments worn on the body), jewelry (rings, necklaces, earrings, bracelets, pendants, chains), watches (wristwatches/timepieces), cosmetics (beauty packaging/products), footwear (shoes, sneakers, boots, sandals, heels), or bags (handbags, backpacks, shoulder/crossbody bags, totes, clutches). Classification should be conservative but decisive, not require perfect certainty.",
  "Return unsupported only if the image is unusable, visibility prevents safe classification, or the product clearly falls outside all six verticals. Never downgrade a supported product because its subcategory, branding, material, fit, or construction detail is unknown, or because only one view is supplied. Unsupported requires a concise reason and attempted rawCategory evidence.",
  "STEP 2 — PROFILE: after choosing a vertical, fill the partial-safe profile from visible evidence. Unknown details are null or empty. At minimum provide confidence, visibleProductCount, identitySummary, and sourceObservations. Optional material, silhouette, closure, and interactionRules may be null/empty.",
  "The source image is authoritative. Do not invent hidden attributes, brand, material composition, gemstone chemistry, exact color names, product function, or unreadable text. Use cautious visual wording such as silver-colored metal.",
].join("\n");

export function getProductUnderstandingModel() {
  return process.env.OPENAI_PRODUCT_UNDERSTANDING_MODEL?.trim() || getReferenceAnalysisModel();
}

class OpenAIProductAnalysisClient implements ProductAnalysisClient {
  async analyze({ assetId, image }: Parameters<ProductAnalysisClient["analyze"]>[0]): Promise<ProductAnalysisOutputValidation> {
    const response = await getOpenAIClient().responses.create({
      model: getProductUnderstandingModel(),
      instructions: analyzerInstructions,
      input: createProductAnalysisInput({ assetId, image }),
      max_output_tokens: 2200,
      store: false,
      text: structuredResponseText({
        type: "json_schema",
        name: "product_analysis",
        description: "Supported product profile or safe unsupported result.",
        schema: productAnalysisModelOutputSchema,
        strict: true,
      }),
    });
    const output = response.output_text?.trim();
    if (!output) return { output: null, errorPaths: response.output?.length ? ["$.output_text"] : ["$"] };
    let parsed: unknown;
    try {
      parsed = JSON.parse(output) as unknown;
    } catch {
      return { output: null, errorPaths: ["$.json"] };
    }
    return validateProductAnalysisModelOutput(parsed, {
      assetId,
      analyzedAt: new Date().toISOString(),
      model: getProductUnderstandingModel(),
    });
  }
}

export async function analyzeProductAsset(options: AnalyzeProductAssetOptions): Promise<ProductAnalysisResult> {
  logAnalysis("analyzer_entered", { assetId: options.assetId, force: Boolean(options.force) });
  try {
    return await analyzeProductAssetWithDependencies(options, {
      client: new OpenAIProductAnalysisClient(),
      repository: new SupabaseProductUnderstandingRepository(),
    });
  } catch (error) {
    const diagnostic = getOpenAIDiagnostic(error);
    logAnalysis("failed", {
      assetId: options.assetId,
      reason: "analysis_failed",
      status: diagnostic.status,
      model: getProductUnderstandingModel(),
    });
    return { status: "failed", reason: "analysis_failed" };
  }
}

export function getProductProfileFromStoredValue(value: unknown): ProductProfile | null {
  return isProductProfile(value) ? value : null;
}

/** Returns only a validated profile for an asset owned by the requesting user. */
export async function getProductProfileForAsset(userId: string, assetId: string): Promise<ProductProfile | null> {
  try {
    const repository = new SupabaseProductUnderstandingRepository();
    const asset = await repository.findOwnedProductAsset(userId, assetId);
    return asset ? getProductProfileFromStoredValue(asset.productProfile) : null;
  } catch {
    return null;
  }
}
