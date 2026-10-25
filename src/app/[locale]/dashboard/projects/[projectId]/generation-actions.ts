"use server";

import { revalidatePath } from "next/cache";

import { isSupportedLocale, type AppLocale } from "@/i18n/routing";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import {
  compositeLockedProduct,
  preparePixelLockInput,
  verifyLockedProduct,
} from "@/lib/generation/fidelity/pixel-lock";
import { ProductMaskCacheRepository } from "@/lib/generation/fidelity/product-mask-cache-repository";
import {
  resolveProductMask,
  segmentationCacheIdentity,
  type ProductMaskResolution,
} from "@/lib/generation/fidelity/product-mask-resolver";
import { getImageGenerationProvider } from "@/lib/generation/registry";
import {
  buildCreativePresetDirection,
  createCreativePresetMetadata,
} from "@/lib/creative-presets/creative-preset-context";
import {
  getCreativePreset,
  getPresetFamily,
  getPresetFamilyForPresetId,
  getHistoricalCreativePreset,
  resolvePresetVariantWithHistory,
  buildPresetVariantDirection,
  getPresetVariationMetadata,
  PRESET_SYSTEM_VERSION,
  getPresetPresentationMode,
  getPresetVariantsForPresentationMode,
  isProductOnlyPresentationMode,
} from "@/lib/creative-presets/creative-presets";
import { getPresentationModeContract } from "@/lib/creative-presets/presentation-mode-contracts";
import {
  getProjectReferenceAssets,
  isReferenceImageMimeType,
  MAX_PROJECT_REFERENCE_IMAGES,
} from "@/lib/assets/reference-assets";
import { getProjectProductAssets } from "@/lib/assets/product-assets";
import { MAX_PROJECT_PRODUCT_IMAGES } from "@/lib/assets/product-asset-constraints";
import {
  analyzeReferenceImages,
  getReferenceAnalysisModel,
  REFERENCE_ANALYSIS_VERSION,
} from "@/lib/generation/references/reference-analysis";
import { readReferenceAnalysisCache } from "@/lib/generation/references/reference-analysis-cache";
import { createCostTelemetry, createProviderUsageEvent, createUnknownOperationEvent } from "@/lib/generation/cost-telemetry";
import { toUsageUnits, type CostUsageEvent } from "@/lib/generation/cost/cost-accounting";
import { getOpenAIResponseTelemetry } from "@/lib/openai/response-telemetry";
import { buildGenerationFailureTelemetry } from "@/lib/generation/failure-telemetry";
import { resolveReferenceMatch } from "@/lib/generation/references/resolve-reference-match";
import { getReferenceShotProfile, REFERENCE_MATCH_VERSION, type ReferenceMode } from "@/lib/generation/references/reference-shot-profile";
import { buildReferenceReplacementPrompt, orderGenerationImages, orderReferenceReplacementImages, orderImageEditImages } from "@/lib/generation/image-roles";
import { buildProductIdentityManifest } from "@/lib/product-identity/build-product-identity-manifest";
import { resolveApparelArtworkRegion, buildApparelFidelityBenchmarkPrompts, compileApparelArtworkLock } from "@/lib/product-identity/apparel-identity-manifest";
import { evaluateApparelProductFidelity, resolveApparelFidelityMode } from "@/lib/product-identity/resolve-apparel-fidelity-mode";
import { PRODUCT_IDENTITY_LOCK_VERSION } from "@/lib/product-identity/identity-lock-version";
import { resolveAspectRatioForGeneration, resolveImageGenerationOutputCanvas } from "@/lib/generation/output-canvas";
import {
  buildImageGenerationPromptWithPolicy,
  compileOutputFormatGuidance,
  watchOnWristInstructions,
} from "@/lib/generation/prompts/build-image-generation-prompt";
import { enhanceCreativeDirection } from "@/lib/generation/prompts/enhance-creative-direction";
import { getPromptEnhancementModel } from "@/lib/generation/prompts/prompt-enhancer-config";
import {
  getGenerationStrategyCategory,
  resolveGenerationStrategy,
} from "@/lib/generation/strategy/generation-strategy";
import { validateGenerationPolicy } from "@/lib/generation/strategy/validate-generation-policy";
import { getSafeProviderErrorDiagnostics } from "@/lib/generation/providers/provider-error-diagnostics";
import { mergeProviderFailureMetadata } from "@/lib/generation/providers/merge-provider-failure-metadata";
import { getImageModelCapabilities } from "@/lib/generation/providers/image-model-capabilities";
import { FalBirefnetProvider } from "@/lib/generation/segmentation/providers/fal-birefnet-provider";
import type {
  AspectRatio,
  FidelityStatus,
  GenerationProvider,
  ImageGenerationQuality,
  ProductPreservationMode,
} from "@/lib/generation/types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveCanonicalProductProfile } from "@/lib/product-understanding/canonical-product-profile";
import { compileProductProfilePrompt } from "@/lib/product-understanding/compile-product-profile-prompt";
import { resolveSceneSuitability } from "@/lib/scene-suitability/resolve-scene-suitability";
import { SCENE_SUITABILITY_VERSION } from "@/lib/scene-suitability/types";
import { resolveComposition } from "@/lib/composition-intelligence/resolve-composition";
import { COMPOSITION_INTELLIGENCE_VERSION } from "@/lib/composition-intelligence/types";
import { resolveCreativeCompliance } from "@/lib/creative-direction-compliance/resolve-compliance";
import { CREATIVE_DIRECTION_COMPLIANCE_VERSION } from "@/lib/creative-direction-compliance/compliance-version";
import { getFidelityValidationModel, validateGeneratedImageBestEffort } from "@/lib/fidelity-validation/validate-generated-image";
import { compileRepairInstructions } from "@/lib/auto-repair/compile-repair-instructions";
import { resolveRepairPlan } from "@/lib/auto-repair/resolve-repair-plan";
import { mapGenerationTerminalDecisionToStatus, resolveFinalCandidateSelection, resolveGenerationTerminalDecision } from "@/lib/auto-repair/select-final-attempt";
import { AUTO_REPAIR_VERSION } from "@/lib/auto-repair/repair-version";
import type { GenerationAttempt, RepairMetadata } from "@/lib/auto-repair/types";
import { logGenerationInsertFailure, resolveCreativeDirectionSnapshot, resolveGenerationInsertResult, serializeGenerationMetadata } from "@/lib/generation/generation-create-boundary";
import { resolveHumanRealismPolicy } from "@/lib/human-realism/human-realism-policy";
import { HUMAN_REALISM_VERSION } from "@/lib/human-realism/human-realism-version";
import { compileHumanRealismPrompt } from "@/lib/human-realism/compile-human-realism-prompt";
import type { HumanRealismMetadata } from "@/lib/generation/types";
import { resolveApparelArtworkCropEligibility, resolveHybridProjectionEligibility } from "@/lib/generation/strategy/generation-strategy";
import { resolveGenerationExecutionPolicy } from "@/lib/generation/execution-policy/resolve-generation-execution-policy";
import { resolveRepairEligibility } from "@/lib/generation/execution-policy/resolve-repair-eligibility";
import { GENERATION_EXECUTION_POLICY_VERSION } from "@/lib/generation/execution-policy/execution-policy-version";
import { createGenerationPerformanceRecorder } from "@/lib/generation/performance";
import { DEFAULT_GENERATION_ASPECT_RATIO } from "@/lib/generation/aspect-ratios";
import { createNotification } from "@/lib/notifications/create-notification";
import { compileApparelFitPreservationPrompt } from "@/lib/apparel-fit-preservation/compile-apparel-fit-prompt";
import { finalizeCommercialFashionProviderPrompt, resolveCommercialFashionSafetyLayer } from "@/lib/generation/prompts/commercial-fashion-normalizer";
import { createModerationInputSummary } from "@/lib/generation/moderation-input-summary";
import { classifyHumanReferenceFashion, isProviderModerationBlocked, type KlayReferenceClassification } from "@/lib/generation/reference-fashion-classification";
import { APPAREL_FIT_PRESERVATION_VERSION } from "@/lib/apparel-fit-preservation/apparel-fit-version";
import { awaitGenerationPipeline } from "@/lib/generation/await-generation-pipeline";
import { getOpenAIBetaPolicy } from "@/lib/openai/beta-policy";
import { createImageEdit as createImageEditService } from "@/lib/generation/image-worker-service";
import { isProviderOutcomeAmbiguous } from "@/lib/generation/providers/provider-error-diagnostics";

export type RegisterProductAssetResult = {
  status: "error" | "success";
};

export type RegisterReferenceAssetResult = {
  status: "error" | "limit" | "success";
};

export type UpdateCreativeDirectionState = {
  status: "error" | "idle" | "success" | "validation";
};

type CreateQueuedImageGenerationError =
  | "creationFailed"
  | "missingCreativeDirection"
  | "missingProductImage"
  | "invalidAspectRatio"
  | "generationUnavailable";

export type CreateQueuedImageGenerationResult =
  | { ok: false; message: CreateQueuedImageGenerationError | "generationFailed" }
  | { ok: true; generationId: string; status: "queued" | "processing" | "succeeded" | "failed" | "reconciliation_required" };

export type CreateImageEditResult = { ok: false; error: string; code: "creationFailed" | "missingEditInstruction" | "missingOutput" | "admissionUnavailable" } | { ok: true; generationId: string; status: "succeeded" };

export async function createImageEdit(
  locale: AppLocale,
  projectId: string,
  baseGenerationId: string,
  instruction: string,
  submissionId: string,
): Promise<CreateImageEditResult> {
  return createImageEditService(locale, projectId, baseGenerationId, instruction, submissionId);
}

type RunQueuedImageGenerationError = "generationFailed" | "notQueued";

export type RunQueuedImageGenerationResult =
  | { ok: false; message: RunQueuedImageGenerationError; retryable?: boolean; failureCategory?: string }
  | { ok: true };

const projectGenerationFields = "id, user_id, title, creative_direction";
const queuedGenerationFields = [
  "id",
  "project_id",
  "input_asset_id",
  "generation_type",
  "status",
  "provider",
  "model",
  "quality",
  "aspect_ratio",
  "preservation_mode",
  "creative_direction_snapshot",
  "provider_metadata",
].join(", ");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const generatedAssetsBucket = "generated-assets";

function logDevelopmentGenerationEvent(
  event: string,
  details: Record<string, boolean | number | string | string[] | null>,
) {
  if (process.env.NODE_ENV === "development") {
    console.info(`[generation] ${event}`, details);
  }
}

type QueuedImageGenerationRow = {
  id: string;
  project_id: string;
  input_asset_id: string | null;
  generation_type: "image" | "video";
  status: "queued" | "processing" | "succeeded" | "failed";
  provider: GenerationProvider;
  model: string;
  quality: ImageGenerationQuality | null;
  aspect_ratio: AspectRatio | null;
  preservation_mode: ProductPreservationMode | null;
  creative_direction_snapshot: string;
  provider_metadata: Record<string, unknown> | null;
};

function hasValidObjectPath(userId: string, projectId: string, objectPath: string) {
  const segments = objectPath.split("/");

  return (
    segments.length === 3 &&
    segments[0] === userId &&
    segments[1] === projectId &&
    segments[2].length > 0
  );
}

function isGenerationProvider(value: unknown): value is GenerationProvider {
  return value === "openai";
}

function resolveSubmittedGenerationStatus(value: unknown): "queued" | "processing" | "succeeded" | "failed" | "reconciliation_required" {
  if (value === "queued" || value === "processing" || value === "succeeded" || value === "failed" || value === "reconciliation_required") return value;
  return "processing";
}

function safeGenerationEvent(scope: "create" | "queue" | "dispatch" | "provider", event: string, fields: Record<string, boolean | number | string | null> = {}) {
  console.info(`[generation-${scope}] ${event}`, fields);
}

function getSafeGenerationErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return { name: "UnknownError", message: "Unknown generation error", code: null, details: null, hint: null };
  }

  const value = error as Record<string, unknown>;
  return {
    name: typeof value.name === "string" ? value.name : "GenerationError",
    message: typeof value.message === "string" ? value.message.slice(0, 500) : "Unknown generation error",
    code: typeof value.code === "string" ? value.code : null,
    details: typeof value.details === "string" ? value.details.slice(0, 500) : null,
    hint: typeof value.hint === "string" ? value.hint.slice(0, 500) : null,
  };
}

function resolvePreservationMode(value: unknown): ProductPreservationMode {
  return value === "pixel_lock" ? "pixel_lock" : "reference_edit";
}

export async function createQueuedImageGeneration(
  locale: AppLocale,
  projectId: string,
  _previousState: CreateQueuedImageGenerationResult | null,
  formData?: FormData,
): Promise<CreateQueuedImageGenerationResult> {
  let createPhase: "before_insert" | "inserting" | "inserted" = "before_insert";
  let insertedGenerationId: string | null = null;
  safeGenerationEvent("create", "entered");
  const enhancementEnabled = formData ? formData.get("enhance_with_ai") === "on" : true;
  const rawAspectRatio = formData?.get("aspect_ratio") ?? DEFAULT_GENERATION_ASPECT_RATIO;
  const aspectRatio = resolveAspectRatioForGeneration(rawAspectRatio);

  if (!aspectRatio) return { ok: false, message: "invalidAspectRatio" };

  if (!isSupportedLocale(locale) || typeof projectId !== "string" || !uuidPattern.test(projectId)) {
    return { ok: false, message: "creationFailed" };
  }

  const submissionId = formData?.get("client_submission_id");
  if (typeof submissionId !== "string" || !uuidPattern.test(submissionId)) {
    return { ok: false, message: "creationFailed" };
  }

  const userId = await getAuthenticatedUserId();
  safeGenerationEvent("create", "auth_resolved", { authenticated: Boolean(userId) });
  if (!userId) {
    return { ok: false, message: "creationFailed" };
  }
  if (!getOpenAIBetaPolicy(userId)) return { ok: false, message: "generationUnavailable" };

  try {
    const supabase = await createClient();
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select(projectGenerationFields)
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (projectError || !project || project.user_id !== userId) {
      return { ok: false, message: "creationFailed" };
    }
    safeGenerationEvent("create", "project_loaded");

    const userCreativeDirection = project.creative_direction?.trim() ?? "";
    const preset = getCreativePreset(formData?.get("preset_id"));
    const presetFamily = preset ? getPresetFamily(preset.id) : null;
    const selectedPresentationMode = getPresetPresentationMode(presetFamily?.id, formData?.get("presentation_mode"))?.id ?? null;
    const creativeDirection = buildCreativePresetDirection(userCreativeDirection, preset);
    const creativeDirectionSnapshot = resolveCreativeDirectionSnapshot(
      creativeDirection,
      userCreativeDirection || `Preset: ${preset?.title ?? "selected"}`,
    );
    if (!creativeDirectionSnapshot) {
      return { ok: false, message: "missingCreativeDirection" };
    }
    safeGenerationEvent("create", "inputs_validated");
    const strategyResolution = resolveGenerationStrategy({
      preset,
      userPrompt: userCreativeDirection || creativeDirection,
    });

    const productAssets = await getProjectProductAssets(userId, project.id);
    const asset = productAssets[0] ?? null;

    if (
      !asset ||
      asset.bucket_id !== "product-assets"
    ) {
      return { ok: false, message: "missingProductImage" };
    }
    safeGenerationEvent("create", "product_asset_loaded");

    const references = await getProjectReferenceAssets(userId, project.id);
    const admin = getSupabaseAdminClient();
    const { data: existingGeneration, error: existingGenerationError } = await admin
      .from("generations")
      .select("id,status")
      .eq("owner_id", userId)
      .eq("project_id", project.id)
      .eq("generation_type", "image")
      .eq("client_submission_id", submissionId)
      .maybeSingle();
    if (!existingGenerationError && existingGeneration) {
      revalidatePath(`/${locale}/dashboard/projects/${project.id}`, "page");
      const status = resolveSubmittedGenerationStatus(existingGeneration.status);
      return { ok: true, generationId: existingGeneration.id, status };
    }
    const providerMetadata = serializeGenerationMetadata({
      outputFormat: { requestedAspectRatio: aspectRatio, version: "output-format-v1" },
      prompt_enhancement: {
        enabled: enhancementEnabled,
        enhanced_prompt: null,
        succeeded: false,
        user_prompt: userCreativeDirection,
      },
      ...(preset ? { preset: { ...createCreativePresetMetadata(preset), ...(presetFamily ? { variantSeed: crypto.randomUUID(), variationSource: "generation_seed", selectedPresetFamily: presetFamily.id, selectedPresentationMode, presentationModeSource: selectedPresentationMode ? "user" : "automatic" } : {}) } } : {}),
      strategy: {
        effective_preservation_mode: strategyResolution.effectivePreservationMode,
        reason: strategyResolution.reason,
        selected: strategyResolution.strategy,
      },
      references: {
        mode: "inspired" satisfies ReferenceMode,
        requested_count: references.length,
        usable_count: 0,
        asset_ids: references.map((reference) => reference.id),
        referenceGuidance: {
          version: "reference-priority-v1",
          primaryReferenceId: references[0]?.id ?? null,
          supportingReferenceIds: references.slice(1).map((reference) => reference.id),
          primaryAuthority: ["scene", "composition", "pose", "camera", "framing"],
          supportingAuthority: ["lighting", "mood", "color", "styling", "atmosphere"],
        },
        analysis: {
          enabled: references.length > 0,
          succeeded: false,
          model: references.length > 0 ? getReferenceAnalysisModel() : null,
          version: REFERENCE_ANALYSIS_VERSION,
        },
      },
      product_images: {
        version: "multi-view-product-input-v1",
        asset_ids: productAssets.map(({ id }) => id),
        primary_asset_id: asset.id,
        supporting_asset_ids: productAssets.slice(1).map(({ id }) => id),
        same_physical_product: true,
      },
    });
    createPhase = "inserting";
    safeGenerationEvent("create", "insert_start");
    const insertResult = await admin
      .from("generations")
      .insert({
        owner_id: userId,
        client_submission_id: submissionId,
        project_id: project.id,
        input_asset_id: asset.id,
        generation_type: "image",
        status: "queued",
        provider: "openai",
        model: process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2.5-sunburst",
        quality: "high",
        aspect_ratio: aspectRatio,
        preservation_mode: strategyResolution.effectivePreservationMode,
        fidelity_status:
          strategyResolution.effectivePreservationMode === "reference_edit"
            ? "not_available"
            : "not_checked",
        creative_direction_snapshot: creativeDirectionSnapshot,
        provider_metadata: providerMetadata,
      })
      .select("id")
      .single();
    const resolvedInsert = resolveGenerationInsertResult(insertResult);
    if (!resolvedInsert.ok) {
      if (insertResult.error?.code === "23505") {
        const { data: duplicate } = await admin
          .from("generations")
          .select("id,status")
          .eq("owner_id", userId)
          .eq("project_id", project.id)
          .eq("generation_type", "image")
          .eq("client_submission_id", submissionId)
          .maybeSingle();
        if (duplicate) {
          const status = resolveSubmittedGenerationStatus(duplicate.status);
          return { ok: true, generationId: duplicate.id, status };
        }
      }
      return { ok: false, message: "creationFailed" };
    }
    const generation = resolvedInsert.generation;
    insertedGenerationId = generation.id;
    createPhase = "inserted";

    safeGenerationEvent("create", "insert_success", { generationId: generation.id });
    safeGenerationEvent("queue", "created", { generationId: generation.id });
    let dispatchSucceeded = false;
    try {
      dispatchSucceeded = await awaitGenerationPipeline(generation.id, runQueuedImageGeneration);
    } catch (error) {
      const safeError = error instanceof Error ? error.message.slice(0, 500) : "unknown dispatch error";
      safeGenerationEvent("dispatch", "failed", { generationId: generation.id, error: safeError });
    }
    if (!dispatchSucceeded) {
      const completedAt = new Date();
      const { data: failedGeneration, error: dispatchFailureError } = await admin.from("generations").update({ status: "failed", error_message: "dispatch_failed", processing_completed_at: completedAt.toISOString() })
        .eq("id", generation.id).eq("status", "queued").select("id").maybeSingle();
      if (dispatchFailureError) safeGenerationEvent("dispatch", "terminal_state_persist_failed", { generationId: generation.id });
      else if (failedGeneration) {
        safeGenerationEvent("dispatch", "status_transition", { generationId: generation.id, status: "failed" });
        await createNotification({ userId, type: "generation_failed", projectId: project.id, projectName: project.title, generationId: generation.id });
      }
      revalidatePath(`/${locale}/dashboard/projects/${project.id}`, "page");
      const { data: terminalGeneration } = await admin.from("generations").select("status").eq("id", generation.id).eq("owner_id", userId).maybeSingle();
      return { ok: true, generationId: generation.id, status: resolveSubmittedGenerationStatus(terminalGeneration?.status) };
    }

    revalidatePath(`/${locale}/dashboard/projects/${project.id}`, "page");

    return { ok: true, generationId: generation.id, status: "succeeded" };
  } catch (error) {
    if (createPhase === "inserting") {
      logGenerationInsertFailure(error);
      try {
        const { data: insertedGeneration } = await getSupabaseAdminClient().from("generations").select("id,status")
          .eq("owner_id", userId).eq("project_id", projectId).eq("generation_type", "image").eq("client_submission_id", submissionId).maybeSingle();
        if (insertedGeneration) return { ok: true, generationId: insertedGeneration.id, status: resolveSubmittedGenerationStatus(insertedGeneration.status) };
      } catch { /* Preserve the submission key in the client so a retry resolves the same insert. */ }
    } else if (createPhase === "inserted" && insertedGenerationId) {
      console.error("[generation-create] action_failed", { phase: createPhase, message: error instanceof Error ? error.message.slice(0, 500) : "unknown creation error" });
      try {
        const { data: savedGeneration } = await getSupabaseAdminClient().from("generations").select("status").eq("id", insertedGenerationId).eq("owner_id", userId).maybeSingle();
        return { ok: true, generationId: insertedGenerationId, status: resolveSubmittedGenerationStatus(savedGeneration?.status ?? "processing") };
      } catch { return { ok: true, generationId: insertedGenerationId, status: "processing" }; }
    } else {
      console.error("[generation-create] action_failed", { phase: createPhase, message: error instanceof Error ? error.message.slice(0, 500) : "unknown creation error" });
    }
    return { ok: false, message: "creationFailed" };
  }
}

async function runQueuedImageGeneration(
  generationId: string,
): Promise<RunQueuedImageGenerationResult> {
  safeGenerationEvent("dispatch", "pipeline_entered", { generationId });
  if (!uuidPattern.test(generationId)) {
    return { ok: false, message: "generationFailed" };
  }

  const admin = getSupabaseAdminClient();
  const { data: jobGeneration } = await admin.from("generations").select("project_id").eq("id", generationId).maybeSingle();
  if (!jobGeneration) {
    return { ok: false, message: "generationFailed" };
  }
  const projectId = jobGeneration.project_id;
  const { data: owningProject } = await admin.from("projects").select("user_id").eq("id", projectId).maybeSingle();
  if (!owningProject) return { ok: false, message: "generationFailed" };
  const userId = owningProject.user_id;

  let processingStartedAt: Date | null = null;
  const generationStartedAt = Date.now();
  let performance: ReturnType<typeof createGenerationPerformanceRecorder> | null = null;
  const executionCounts = { imageGenerationCalls: 0, visionValidationCalls: 0, promptEnhancementCalls: 0, productAnalysisCalls: 0, referenceAnalysisCalls: 0, artworkAnalysisCalls: 0, segmentationCalls: 0, projectionAnalysisCalls: 0, repairCalls: 0 };
  // This is deliberately bounded at persistence time. It contains neither prompt nor media data.
  const costEvents: CostUsageEvent[] = [];
  let inputProductImageCount: number | null = null;
  let inputReferenceCount: number | null = null;
  safeGenerationEvent("queue", "processor_entered", { generationId });
  let providerDiagnosticContext: { provider: GenerationProvider; model: string; imageCount: number; preservationMode: string; strategy: string; sceneFamily: string | null; klayClassification: KlayReferenceClassification } | null = null;
  let outputStored = false;
  let terminalSuccessPersisted = false;
  let postStorageStep = "storage";
  let postStorageError: unknown = null;
  let persistedProviderMetadata: Record<string, unknown> | null = null;
  let terminalFailureReason: string | null = null;
  let providerOutcomeAmbiguous = false;

  async function captureProviderSubmission<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      providerOutcomeAmbiguous ||= isProviderOutcomeAmbiguous(error);
      throw error;
    }
  }

  try {
    const supabase = admin;
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, user_id, title")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (projectError || !project || project.user_id !== userId) {
      return { ok: false, message: "generationFailed" };
    }

    const { data: generation, error: generationError } = await supabase
      .from("generations")
      .select(queuedGenerationFields)
      .eq("id", generationId)
      .eq("project_id", project.id)
      .maybeSingle();
    const queuedGeneration = generation as unknown as QueuedImageGenerationRow | null;

    if (
      generationError ||
      !queuedGeneration ||
      queuedGeneration.project_id !== project.id ||
      queuedGeneration.generation_type !== "image" ||
      queuedGeneration.status !== "queued" ||
      !isGenerationProvider(queuedGeneration.provider) ||
      !queuedGeneration.input_asset_id
    ) {
      return { ok: false, message: "notQueued" };
    }
    persistedProviderMetadata = queuedGeneration.provider_metadata;

    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .select("id, user_id, project_id, bucket_id, object_path, product_profile")
      .eq("id", queuedGeneration.input_asset_id)
      .eq("project_id", project.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (
      assetError ||
      !asset ||
      asset.user_id !== userId ||
      asset.project_id !== project.id ||
      asset.bucket_id !== "product-assets" ||
      !hasValidObjectPath(userId, project.id, asset.object_path)
    ) {
      return { ok: false, message: "generationFailed" };
    }

    const productImageMetadata = queuedGeneration.provider_metadata?.product_images;
    const snapshotProductIds = productImageMetadata && typeof productImageMetadata === "object" && "asset_ids" in productImageMetadata && Array.isArray(productImageMetadata.asset_ids)
      ? productImageMetadata.asset_ids.filter((id: unknown): id is string => typeof id === "string" && uuidPattern.test(id)).slice(0, MAX_PROJECT_PRODUCT_IMAGES)
      : [];
    const requestedProductIds = [asset.id, ...snapshotProductIds.filter((id) => id !== asset.id)].slice(0, MAX_PROJECT_PRODUCT_IMAGES);
    const { data: productAssetRows, error: productAssetsError } = await supabase
      .from("assets")
      .select("id, user_id, project_id, bucket_id, object_path, product_profile, product_role, sort_order")
      .eq("project_id", project.id)
      .eq("user_id", userId)
      .eq("asset_type", "product")
      .in("id", requestedProductIds);
    if (productAssetsError) return { ok: false, message: "generationFailed" };
    const orderedProductAssets = requestedProductIds.map((id) => productAssetRows?.find((row) => row.id === id)).filter((row): row is NonNullable<typeof productAssetRows>[number] => Boolean(row && row.bucket_id === "product-assets" && hasValidObjectPath(userId, project.id, row.object_path)));
    if (!orderedProductAssets.length || orderedProductAssets[0]?.id !== asset.id) return { ok: false, message: "generationFailed" };

    const outputObjectPath = `${userId}/${project.id}/${queuedGeneration.id}.png`;
    if (!hasValidObjectPath(userId, project.id, outputObjectPath)) {
      return { ok: false, message: "generationFailed" };
    }

    processingStartedAt = new Date();
    performance = createGenerationPerformanceRecorder(queuedGeneration.id, generationStartedAt);
    const { data: processingGeneration, error: processingError } = await admin
      .from("generations")
      .update({
        status: "processing",
        error_message: null,
        processing_started_at: processingStartedAt.toISOString(),
        processing_completed_at: null,
        processing_duration_ms: null,
      })
      .eq("id", queuedGeneration.id)
      .eq("project_id", project.id)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();

    if (processingError || !processingGeneration) {
      return { ok: false, message: "notQueued" };
    }
    safeGenerationEvent("queue", "claim_success", { generationId, duration: Date.now() - generationStartedAt });
    safeGenerationEvent("queue", "status_transition", { generationId, status: "processing" });

    const productDownloads = await performance.measure("asset_load", () => Promise.all(orderedProductAssets.map(async (productAsset) => {
      const { data, error } = await admin.storage.from(productAsset.bucket_id).download(productAsset.object_path);
      if (error || !data || !isReferenceImageMimeType(data.type) || data.size > 20 * 1024 * 1024) return null;
      return { asset: productAsset, blob: data, data: Buffer.from(await data.arrayBuffer()), mimeType: data.type };
    })));
    const usableProductImages = productDownloads.filter((image): image is NonNullable<typeof image> => image !== null);
    inputProductImageCount = usableProductImages.length;
    const primaryProductImage = usableProductImages.find(({ asset: productAsset }) => productAsset.id === asset.id);
    if (!primaryProductImage) {
      throw new Error("Unable to download the input image.");
    }
    const inputImage = primaryProductImage.blob;

    const metadataPreset = queuedGeneration.provider_metadata?.preset;
    const presetId =
      metadataPreset &&
      typeof metadataPreset === "object" &&
      "familyId" in metadataPreset &&
      typeof metadataPreset.familyId === "string"
        ? metadataPreset.familyId
        : metadataPreset && typeof metadataPreset === "object" && "id" in metadataPreset && typeof metadataPreset.id === "string"
          ? metadataPreset.id
        : null;
    // A queued generation can reference a preset that has since left the active UI.
    // Resolve it only for replaying that historical generation, never for new selection.
    let preset = getCreativePreset(presetId) ?? getHistoricalCreativePreset(presetId);
    let resolvedVariantId: string | null = null;
    let resolvedPresetVariant: import("@/lib/creative-presets/creative-presets").PresetVariant | null = null;
    let selectedPresentationMode: string | null = null;
    let presentationModeOverrideReason: "reference_authority" | null = null;
    const presetFamily = getPresetFamilyForPresetId(presetId);
    if (presetFamily) {
      const metadataVariantSeed = queuedGeneration.provider_metadata?.preset && typeof queuedGeneration.provider_metadata.preset === "object" && "variantSeed" in queuedGeneration.provider_metadata.preset && typeof queuedGeneration.provider_metadata.preset.variantSeed === "string"
        ? queuedGeneration.provider_metadata.preset.variantSeed : queuedGeneration.id;
      const { data: recentGenerations } = await admin.from("generations").select("provider_metadata").eq("project_id", project.id).eq("generation_type", "image").eq("status", "succeeded").neq("id", queuedGeneration.id).order("created_at", { ascending: false }).limit(30);
      const history = (recentGenerations ?? []).flatMap(({ provider_metadata }) => {
        const metadata = provider_metadata && typeof provider_metadata === "object" ? provider_metadata.preset : null;
        return metadata && typeof metadata === "object" && (metadata.familyId === presetFamily.id || metadata.id === presetFamily.id) ? [metadata as import("@/lib/creative-presets/creative-presets").PresetVariationHistory] : [];
      });
      const previousVariantId = history[0]?.variantId;
      const refMeta = queuedGeneration.provider_metadata?.references;
      const sceneLockedReference = refMeta && typeof refMeta === "object" && "mode" in refMeta && refMeta.mode === "match";
      const promptMeta = queuedGeneration.provider_metadata?.prompt_enhancement;
      const userDirection = promptMeta && typeof promptMeta === "object" && "user_prompt" in promptMeta && typeof promptMeta.user_prompt === "string" ? promptMeta.user_prompt : "";
      selectedPresentationMode = metadataPreset && typeof metadataPreset === "object" && "selectedPresentationMode" in metadataPreset
        ? getPresetPresentationMode(presetFamily.id, metadataPreset.selectedPresentationMode)?.id ?? null
        : null;
      const explicitContinuity = /same\s+(?:model|person|scene|location)|keep\s+(?:the\s+)?same|preserve\s+(?:the\s+)?scene/i.test(userDirection);
      const continuityVariant = explicitContinuity || sceneLockedReference ? presetFamily.variants.find(({ id }) => id === previousVariantId) : null;
      presentationModeOverrideReason = null;
      const eligibleVariants = selectedPresentationMode
        ? getPresetVariantsForPresentationMode(presetFamily, selectedPresentationMode)
        : presetFamily.variants;
      const variantFamily = eligibleVariants.length === presetFamily.variants.length ? presetFamily : { ...presetFamily, variants: eligibleVariants };
      const variant = continuityVariant && eligibleVariants.some(({ id }) => id === continuityVariant.id)
        ? continuityVariant
        : resolvePresetVariantWithHistory(variantFamily, metadataVariantSeed, typeof previousVariantId === "string" ? previousVariantId : null, sceneLockedReference || explicitContinuity ? [] : history);
      resolvedPresetVariant = variant;
      resolvedVariantId = variant.id;
      if (preset) preset = buildPresetVariantDirection(preset, variant);
      console.info("[preset] resolved", { generationId, selectedPresetId: presetFamily.id, selectedPresetFamily: presetFamily.id, selectedPresentationMode, resolvedPresentationMode: variant.presentationMode ?? null, presentationModeSource: selectedPresentationMode ? presentationModeOverrideReason ? "reference_authority" : "user" : "automatic", presentationModeOverrideReason, selectedVariantId: variant.id, allowedSceneTypes: presetFamily.allowedSceneTypes, disallowedSceneTypes: presetFamily.disallowedSceneTypes, overrideReason: presentationModeOverrideReason, variationSource: "generation_seed" });
    }
    const metadataEnhancement = queuedGeneration.provider_metadata?.prompt_enhancement;
    const metadataReferences = queuedGeneration.provider_metadata?.references;
    const referenceMatchMode: ReferenceMode = metadataReferences && typeof metadataReferences === "object" && "mode" in metadataReferences && metadataReferences.mode === "match" ? "match" : "inspired";
    if (metadataReferences && typeof metadataReferences === "object" && "referenceMode" in metadataReferences && metadataReferences.referenceMode === "composition") {
      terminalFailureReason = "unsupported_legacy_composition_reference_mode";
      throw new Error("unsupported_legacy_composition_reference_mode");
    }
    const requestedReferenceAssetIds = metadataReferences && typeof metadataReferences === "object" && "asset_ids" in metadataReferences && Array.isArray(metadataReferences.asset_ids)
      ? metadataReferences.asset_ids.filter((id): id is string => typeof id === "string").slice(0, MAX_PROJECT_REFERENCE_IMAGES)
      : [];
    const projectReferences = requestedReferenceAssetIds.length
      ? (await getProjectReferenceAssets(userId, project.id)).filter((reference) => requestedReferenceAssetIds.includes(reference.id))
      : [];
    const referenceImages = await Promise.all(projectReferences.map(async (reference) => {
      try {
        const { data, error } = await admin.storage.from(reference.bucket_id).download(reference.object_path);
        if (error || !data || !isReferenceImageMimeType(data.type)) return null;
        return { asset: reference, data: Buffer.from(await data.arrayBuffer()), mimeType: data.type };
      } catch {
        return null;
      }
    }));
    const usableReferenceImages = referenceImages.filter(
      (image): image is NonNullable<typeof image> => image !== null,
    );
    inputReferenceCount = usableReferenceImages.length;
    if (requestedReferenceAssetIds.length && process.env.NODE_ENV === "development") {
      console.info("[reference] analysis_started", { generationId: queuedGeneration.id, requestedCount: requestedReferenceAssetIds.length, usableCount: usableReferenceImages.length });
    }
    const referenceCacheKey = { version: REFERENCE_ANALYSIS_VERSION, model: getReferenceAnalysisModel(), orderedAssetIds: usableReferenceImages.map(({ asset: reference }) => reference.id) };
    const cachedReferenceAnalysis = readReferenceAnalysisCache(usableReferenceImages[0]?.asset.reference_analysis_cache, referenceCacheKey);
    const referenceAnalysis = cachedReferenceAnalysis
      ? { diagnostic: null, styleBrief: cachedReferenceAnalysis.styleBrief, usableCount: usableReferenceImages.length, telemetry: null }
      : await analyzeReferenceImages(usableReferenceImages.map(({ data, mimeType }) => ({ data, mimeType })));
    if (!cachedReferenceAnalysis && usableReferenceImages.length) executionCounts.referenceAnalysisCalls += 1;
    if (!cachedReferenceAnalysis && usableReferenceImages.length) {
      costEvents.push(referenceAnalysis.telemetry ? createProviderUsageEvent({ operation: "reference_analysis", model: getReferenceAnalysisModel(), phase: "supporting", requestId: referenceAnalysis.telemetry.requestId, usage: referenceAnalysis.telemetry.usage }) : createUnknownOperationEvent({ operation: "reference_analysis", provider: "openai", model: getReferenceAnalysisModel() }));
    }
    if (!cachedReferenceAnalysis && referenceAnalysis.styleBrief && usableReferenceImages[0]) {
      await admin.from("assets").update({ reference_analysis_cache: { ...referenceCacheKey, styleBrief: referenceAnalysis.styleBrief, analyzedAt: new Date().toISOString() } }).eq("id", usableReferenceImages[0].asset.id).eq("user_id", userId).eq("asset_type", "reference_image");
    }
    if (process.env.NODE_ENV === "development" && requestedReferenceAssetIds.length) {
      console.info(referenceAnalysis.styleBrief ? "[reference] analysis_completed" : "[reference] analysis_failed", {
        generationId: queuedGeneration.id,
        model: getReferenceAnalysisModel(),
        ...(referenceAnalysis.diagnostic ?? {}),
        version: REFERENCE_ANALYSIS_VERSION,
      });
    }
    const metadataUserPrompt =
      metadataEnhancement &&
      typeof metadataEnhancement === "object" &&
      "user_prompt" in metadataEnhancement &&
      typeof metadataEnhancement.user_prompt === "string"
        ? metadataEnhancement.user_prompt.trim()
        : queuedGeneration.creative_direction_snapshot.trim();
    const fallbackCreativeDirection = buildCreativePresetDirection(metadataUserPrompt, preset);
    if (!fallbackCreativeDirection) {
      throw new Error("The generation prompt is unavailable.");
    }

    // This read validates both ownership and the persisted JSON before it can
    // influence routing. A missing/invalid profile deliberately keeps legacy
    // preset and prompt fallbacks available.
    const productProfile = await performance.measure("product_understanding", async () => resolveCanonicalProductProfile(orderedProductAssets.map((productAsset) => productAsset.product_profile)));
    let cachedLocalization: Record<string, unknown> | null = null;
    const priorArtwork = queuedGeneration.provider_metadata?.apparelArtwork;
    if (priorArtwork && typeof priorArtwork === "object" && "assetId" in priorArtwork && priorArtwork.assetId === asset.id && "version" in priorArtwork && priorArtwork.version === "apparel-artwork-localization-v1") cachedLocalization = priorArtwork as Record<string, unknown>;
    const identityManifest = buildProductIdentityManifest(productProfile);
    const apparelIdentityManifest = resolveApparelArtworkRegion({ profile: productProfile });
    const apparelFidelityMode = resolveApparelFidelityMode({ vertical: productProfile?.vertical ?? null, manifest: apparelIdentityManifest, userPrompt: metadataUserPrompt || fallbackCreativeDirection });
    let apparelArtwork: { data: Buffer; identitySource: import("@/lib/generation/types").ApparelArtworkIdentitySource; side: "front" | "back" | "unknown" } | null = null;
    if (resolveApparelArtworkCropEligibility({ vertical: productProfile?.vertical ?? null, exactProductApparel: apparelFidelityMode.exactProductApparel, artworkPresent: Boolean(apparelIdentityManifest?.artworkPresent) })) {
      const { localizeApparelArtwork, createApparelArtworkCrop } = await import("@/lib/product-identity/apparel-artwork-localization");
      const sourcePixels = Buffer.from(await inputImage.arrayBuffer());
      const cachedBoxValue = cachedLocalization?.boundingBox;
      const cachedBox = cachedBoxValue && typeof cachedBoxValue === "object" && "x" in cachedBoxValue && "y" in cachedBoxValue && "width" in cachedBoxValue && "height" in cachedBoxValue && [cachedBoxValue.x, cachedBoxValue.y, cachedBoxValue.width, cachedBoxValue.height].every((value) => typeof value === "number")
        ? { x: cachedBoxValue.x as number, y: cachedBoxValue.y as number, width: cachedBoxValue.width as number, height: cachedBoxValue.height as number }
        : null;
      const localized = cachedLocalization
        ? { detected: cachedLocalization.detected === true, side: (cachedLocalization.side === "front" || cachedLocalization.side === "back" || cachedLocalization.side === "unknown" ? cachedLocalization.side : "unknown") as "front" | "back" | "unknown", boundingBox: cachedBox, confidence: typeof cachedLocalization.confidence === "number" ? cachedLocalization.confidence : 0, containsText: cachedLocalization.containsText === true, multipleRegions: cachedLocalization.multipleRegions === true }
        : await performance.measure("artwork_localization", () => localizeApparelArtwork(sourcePixels));
      if (!cachedLocalization) executionCounts.artworkAnalysisCalls += 1;
      if (!cachedLocalization) {
        const artworkTelemetry = getOpenAIResponseTelemetry(localized);
        costEvents.push(artworkTelemetry ? createProviderUsageEvent({ operation: "artwork_analysis", model: getReferenceAnalysisModel(), phase: "supporting", requestId: artworkTelemetry.requestId, usage: artworkTelemetry.usage }) : createUnknownOperationEvent({ operation: "artwork_analysis", provider: "openai", model: getReferenceAnalysisModel() }));
      }
      if (localized?.detected && localized.boundingBox) {
        const crop = await createApparelArtworkCrop({ data: sourcePixels, assetId: asset.id, side: localized.side, boundingBox: localized.boundingBox, confidence: localized.confidence, containsText: localized.containsText, detected: localized.detected });
        if (crop) apparelArtwork = { data: crop.data, identitySource: crop.identitySource, side: localized.side };
      }
      if (localized) {
        if (apparelIdentityManifest) Object.assign(apparelIdentityManifest, {
          artworkSide: localized.side,
          artworkBoundingRegion: localized.boundingBox ? { ...localized.boundingBox, confidence: "source_localization" as const } : null,
        });
      }
      logDevelopmentGenerationEvent("apparel_artwork_localization", { generationId: queuedGeneration.id, detected: Boolean(localized?.detected), localized: Boolean(apparelArtwork), side: localized?.side ?? "unknown", confidence: localized?.confidence ?? 0 });
    }
    if (apparelIdentityManifest) {
      logDevelopmentGenerationEvent("apparel_identity_lock", {
        generationId: queuedGeneration.id,
        artworkPresent: apparelIdentityManifest.artworkPresent,
        mode: apparelFidelityMode.mode,
        generationMode: apparelFidelityMode.generationMode,
        exactProductMode: apparelFidelityMode.exactProductApparel,
        artworkSide: apparelIdentityManifest.artworkSide,
      });
      logDevelopmentGenerationEvent("apparel_artwork_region_resolved", {
        generationId: queuedGeneration.id,
        artworkPresent: apparelIdentityManifest.artworkPresent,
        region: apparelIdentityManifest.artworkBoundingRegion ? JSON.stringify(apparelIdentityManifest.artworkBoundingRegion) : null,
        artworkSide: apparelIdentityManifest.artworkSide,
      });
      logDevelopmentGenerationEvent("product_fidelity_benchmark", {
        generationId: queuedGeneration.id,
        status: queuedGeneration.provider_metadata?.apparel_product_fidelity_benchmark === "passed" ? "passed" : "not_run",
        availableVariants: buildApparelFidelityBenchmarkPrompts().map(({ key }) => key),
      });
    }
    const referenceInteraction = referenceAnalysis.styleBrief
      ? getReferenceShotProfile(referenceAnalysis.styleBrief).interaction
      : null;
    const presentationModeContract = getPresentationModeContract(presetFamily?.id, resolvedPresetVariant?.presentationMode);
    const referenceShot = referenceAnalysis.styleBrief ? getReferenceShotProfile(referenceAnalysis.styleBrief) : null;
    const referenceHumanPresent = Boolean(referenceShot?.humanPose || (referenceShot?.interaction && ["held", "worn", "near_face"].includes(referenceShot.interaction)));
    const referenceFashionClassification = classifyHumanReferenceFashion({ hasReference: usableReferenceImages.length > 0, humanDetected: referenceHumanPresent, styleBrief: referenceAnalysis.styleBrief, userDirection: metadataUserPrompt });
    logDevelopmentGenerationEvent("human_reference_classified", { generationId: queuedGeneration.id, humanReferenceClassification: referenceFashionClassification.humanReferenceClassification, klayClassification: referenceFashionClassification.klayClassification, explicitSexualEvidence: referenceFashionClassification.explicitSexualEvidence });
    const referenceSpecifiedFields = referenceShot ? [
      referenceShot.background || referenceShot.environment ? "environment" : null,
      referenceShot.cameraDistance && referenceShot.cameraDistance !== "unknown" ? "cameraDistance" : null,
      referenceShot.cameraAngle && referenceShot.cameraAngle !== "unknown" ? "cameraAngle" : null,
      referenceShot.framing ? "framing" : null,
      referenceShot.subjectPlacement && referenceShot.subjectPlacement !== "unknown" ? "subjectPlacement" : null,
      referenceShot.interaction && referenceShot.interaction !== "unknown" ? "interactionMode" : null,
      referenceShot.lighting && referenceShot.lighting !== "unknown" ? "lighting" : null,
      referenceShot.surfaces ? "surface" : null,
      referenceShot.props ? "propLanguage" : null,
    ].filter((field): field is import("@/lib/creative-presets/presentation-mode-contracts").PresentationContractField => field !== null) : [];
    const referenceOverriddenFields = referenceSpecifiedFields.filter((field) => !presentationModeContract?.referenceProtectedFields.includes(field));
    const contractFields: import("@/lib/creative-presets/presentation-mode-contracts").PresentationContractField[] = [
      "sceneType", "environment", "cameraDistance", "cameraAngle", "framing", "subjectScale", "subjectPlacement",
      "productOrientation", "physicalSupport", "gravityBehavior", "humanPresence", "interactionMode", "surface",
      "propLanguage", "lighting", "captureProfile", "productCount", "targetDetail",
    ];
    const presetPreservedFields = presentationModeContract
      ? contractFields.filter((field) => !referenceOverriddenFields.includes(field))
      : [];
    const strictProductOnlyStudio = presetFamily?.id === "apparel-studio"
      && isProductOnlyPresentationMode(resolvedPresetVariant?.presentationMode);
    const strategyResolution = resolveGenerationStrategy({
      preset,
      productProfile,
      requestedPreservationMode: resolvePreservationMode(queuedGeneration.preservation_mode),
      referenceInteraction,
      referenceHumanPresent,
      presetFamilyId: presetFamily?.id ?? null,
      hasReference: usableReferenceImages.length > 0,
      presentationMode: resolvedPresetVariant?.presentationMode ?? null,
      presentationHumanPresence: resolvedPresetVariant?.humanPresence ?? null,
      explicitUserPrompt: metadataUserPrompt,
      userPrompt: metadataUserPrompt || fallbackCreativeDirection,
    });
    const strategyCategory = getGenerationStrategyCategory(strategyResolution.strategy);
    const qualityUseCase = preset?.useCase ?? strategyCategory;
    const initialPreservationMode = strategyResolution.effectivePreservationMode;
    const sceneSuitability = resolveSceneSuitability({
      preset: preset ? { ...preset, ...(presetFamily ? { allowedSceneTypes: presetFamily.allowedSceneTypes, disallowedSceneTypes: presetFamily.disallowedSceneTypes } : {}) } : null,
      productProfile,
      strategy: strategyResolution.strategy,
      // The fallback contains rendered preset prose. It is not an explicit user
      // request and must not be reinterpreted as a carry or lifestyle instruction.
      userPrompt: metadataUserPrompt,
      vertical: qualityUseCase === "product" ? null : qualityUseCase,
      presetAuthority: usableReferenceImages.length === 0 ? "strong" : "supporting",
      reference: referenceAnalysis.styleBrief,
      referenceAuthority: usableReferenceImages.length > 0,
      strictProductOnlyStudio,
      presentationModeContract,
    });
    const strategyPolicy = validateGenerationPolicy({
      strategy: strategyResolution.strategy,
      sceneFamily: sceneSuitability?.selectedSceneFamily,
      preservationMode: initialPreservationMode,
      // Mask availability is established below; this pass only resolves strategy/scene conflicts.
      hasUsableMask: true,
      vertical: productProfile?.vertical ?? null,
    });
    const strategy = strategyPolicy.strategy;
    const requestedPreservationMode = strategyPolicy.preservationMode;
    const composition = resolveComposition({
      productProfile,
      sceneFamily: sceneSuitability?.selectedSceneFamily,
      strategy,
      userPrompt: metadataUserPrompt,
      referenceStyle: referenceAnalysis.styleBrief,
      presetId: preset?.id,
      referenceAuthority: usableReferenceImages.length > 0,
      strictProductOnlyStudio,
      presentationModeContract,
    });
    const customNote = Boolean(metadataUserPrompt && metadataUserPrompt !== fallbackCreativeDirection);
    const strongPreset = Boolean(preset?.creativeDirection && composition?.source !== "safe_fallback");
    const artworkAreaRatio = apparelIdentityManifest?.artworkBoundingRegion ? apparelIdentityManifest.artworkBoundingRegion.width * apparelIdentityManifest.artworkBoundingRegion.height : 0;
    const artworkComplexity = !apparelIdentityManifest?.artworkPresent ? "none" : apparelIdentityManifest.artworkCategory === "text" || apparelIdentityManifest.artworkCategory === "mixed" || artworkAreaRatio >= .08 ? "complex_artwork" : "simple_logo";
    const executionPolicy = resolveGenerationExecutionPolicy({ productProfile, hasReference: usableReferenceImages.length > 0, referenceReplacement: usableReferenceImages.length > 0 && referenceMatchMode === "match", exactProduct: apparelFidelityMode.exactProductApparel, artworkLocalized: Boolean(apparelArtwork), artworkComplexity, strategy, presetConfidence: strongPreset ? "high" : "low", hasCustomNote: customNote, ambiguousNote: customNote && !composition });
    console.info("[generation] execution_policy_resolved", { generationId, quality: executionPolicy.quality, difficulty: executionPolicy.difficulty, reasons: executionPolicy.reasons, promptEnhancement: executionPolicy.promptEnhancement, validationRequired: executionPolicy.validationRequired, repairEligible: executionPolicy.repairEligible });
    const creativeCompliance = resolveCreativeCompliance({
      userPrompt: metadataUserPrompt || fallbackCreativeDirection,
      productProfile,
      composition,
    });
    const referenceMatch = resolveReferenceMatch({
      productProfile,
      sceneFamily: sceneSuitability?.selectedSceneFamily,
      composition,
      creativeCompliance,
      reference: referenceAnalysis.styleBrief,
      mode: referenceMatchMode,
    });
    const usesReferenceReplacement = usableReferenceImages.length > 0;
    logDevelopmentGenerationEvent("reference_replacement_resolved", {
      generationId: queuedGeneration.id,
      enabled: usesReferenceReplacement,
      vertical: productProfile?.vertical ?? null,
      referenceCount: usableReferenceImages.length,
      replacementMode: usesReferenceReplacement ? "reference_product_replacement" : null,
    });
    const usesReferenceEditing = requestedPreservationMode === "reference_edit";
    logDevelopmentGenerationEvent("placement_strategy_resolved", {
      generationId: queuedGeneration.id,
      strategy: "single_pass",
    });
    logDevelopmentGenerationEvent("strategy_resolved", {
      effectivePreservationMode: requestedPreservationMode,
      generationId: queuedGeneration.id,
      presetId: preset?.id ?? null,
      productProfileVertical: productProfile?.vertical ?? null,
      reason: strategyResolution.reason,
      strategy,
    });
    if (sceneSuitability) {
      logDevelopmentGenerationEvent("scene_suitability_resolved", {
        confidence: sceneSuitability.confidence,
        generationId: queuedGeneration.id,
        selectedSceneFamily: sceneSuitability.selectedSceneFamily,
        source: sceneSuitability.source,
        subcategory: productProfile?.subcategory ?? null,
        suitableFamilyCount: sceneSuitability.suitableSceneFamilies.length,
        vertical: productProfile?.vertical ?? qualityUseCase,
      });
    }
    if (composition) {
      logDevelopmentGenerationEvent("composition_resolved", {
        cameraDistance: composition.cameraDistance,
        depthOfField: composition.depthOfField,
        framing: composition.framing,
        generationId: queuedGeneration.id,
        productDominance: composition.productDominance,
        sceneFamily: sceneSuitability?.selectedSceneFamily ?? null,
        source: composition.source,
        subjectScale: composition.subjectScale,
      });
    }
    logDevelopmentGenerationEvent("creative_compliance_resolved", {
      adjustedCompositionCount: creativeCompliance.adjustedForComposition.length,
      appliedCount: creativeCompliance.applied.length,
      generationId: queuedGeneration.id,
      rejectedIdentityCount: creativeCompliance.requirements.filter(({ status }) => status === "rejected_identity_conflict").length,
      totalRequirements: creativeCompliance.requirements.length,
    });
    if (referenceMatch) {
      logDevelopmentGenerationEvent("reference_match_resolved", {
        generationId: queuedGeneration.id,
        mode: referenceMatch.mode,
        compatible: referenceMatch.compatible,
        appliedCategories: [...new Set([
          referenceMatch.compositionAdjustments.length ? "composition" : "",
          referenceMatch.interactionAdjustments.length ? "interaction" : "",
          referenceMatch.styleAdjustments.length ? "style" : "",
        ].filter(Boolean))],
      });
    }
    const userAllowsEnhancement = !(
      metadataEnhancement &&
      typeof metadataEnhancement === "object" &&
      "enabled" in metadataEnhancement &&
      metadataEnhancement.enabled === false
    );
    const enhancementEnabled = userAllowsEnhancement && executionPolicy.promptEnhancement;
    const promptEnhancement = await performance.measure("prompt_enhancement", () => enhanceCreativeDirection({
      enabled: enhancementEnabled,
      generationType: queuedGeneration.generation_type,
      preservationMode: requestedPreservationMode,
      productCategory: qualityUseCase,
      userCreativeDirection: metadataUserPrompt,
      presetId: preset?.id,
      presetTitle: preset?.title,
      presetDescription: preset?.shortDescription,
      presetCreativeDirection: preset?.creativeDirection,
      referenceStyle: referenceAnalysis.styleBrief,
      useCase: qualityUseCase,
      generationMode: preset?.generationMode,
    }));
    if (enhancementEnabled && promptEnhancement.succeeded) executionCounts.promptEnhancementCalls += 1;
    if (enhancementEnabled && promptEnhancement.telemetry) {
      costEvents.push(promptEnhancement.telemetry ? createProviderUsageEvent({ operation: "prompt_enhancement", model: getPromptEnhancementModel(), phase: "supporting", requestId: promptEnhancement.telemetry.requestId, usage: promptEnhancement.telemetry.usage }) : createUnknownOperationEvent({ operation: "prompt_enhancement", provider: "openai", model: getPromptEnhancementModel() }));
    }
    logDevelopmentGenerationEvent("prompt_enhanced", {
      captureProfile: preset?.creativeDirection.capture?.profile ?? null,
      enabled: enhancementEnabled,
      generationId: queuedGeneration.id,
      presetId: preset?.id ?? null,
      success: promptEnhancement.succeeded,
      userNote: promptEnhancement.userPrompt || null,
    });
    let effectivePreservationMode = requestedPreservationMode;
    let fidelityStatus: FidelityStatus = usesReferenceEditing ? "not_available" : "not_checked";
    let fidelityScore: number | null = null;
    const fidelityMetadata: {
      effective_mode: ProductPreservationMode;
      guaranteed: boolean;
      mask_cached?: boolean;
      mask_failure_reason?:
        | Exclude<ProductMaskResolution["failureReason"], null>
        | "mask_preparation_failed";
      mask_source?: Exclude<ProductMaskResolution["source"], null>;
      product_placement?: { height: number; left: number; top: number; width: number };
      requested_mode: ProductPreservationMode;
      unavailable_reason?:
        | "reference_edit_strategy"
        | "mask_not_available"
        | "preparation_failed"
        | "verification_failed";
      verification_score?: number;
    } = {
      requested_mode: requestedPreservationMode,
      effective_mode: effectivePreservationMode,
      guaranteed: false,
      ...(usesReferenceEditing ? { unavailable_reason: "reference_edit_strategy" as const } : {}),
    };
    const aspectRatio = resolveAspectRatioForGeneration(queuedGeneration.aspect_ratio) ?? DEFAULT_GENERATION_ASPECT_RATIO;
    const outputCanvas = resolveImageGenerationOutputCanvas(aspectRatio);
    let pixelLockInput = null;
    const logPixelLockFallback = () => logDevelopmentGenerationEvent("preservation_mode_fallback", {
      generationId: queuedGeneration.id,
      requested: "pixel_lock",
      effective: "reference_edit",
      reason: "mask_unavailable",
    });

    if (requestedPreservationMode === "pixel_lock" && !usesReferenceReplacement) {
      try {
        const sourceImage = Buffer.from(await inputImage.arrayBuffer());
        const maskResolution = await resolveProductMask({
          sourceImage,
          mimeType: inputImage.type || "image/png",
          cache: new ProductMaskCacheRepository({
            ...segmentationCacheIdentity,
            projectId: project.id,
            sourceAssetId: asset.id,
            userId,
          }),
          segmentationProvider: new FalBirefnetProvider(),
        });
        if (maskResolution.source === "automatic" || maskResolution.failureReason === "segmentation_provider_unavailable" || maskResolution.failureReason === "empty_mask") executionCounts.segmentationCalls += 1;
        if (maskResolution.source === "automatic" || maskResolution.failureReason === "segmentation_provider_unavailable" || maskResolution.failureReason === "empty_mask") {
          costEvents.push(createUnknownOperationEvent({ operation: "segmentation", provider: "fal", model: "fal-ai/birefnet/v2" }));
        }

        if (!maskResolution.mask || !maskResolution.source) {
          effectivePreservationMode = "reference_edit";
          fidelityStatus = "not_available";
          fidelityMetadata.mask_failure_reason =
            maskResolution.failureReason ?? "segmentation_provider_unavailable";
          fidelityMetadata.unavailable_reason = "mask_not_available";
          logDevelopmentGenerationEvent("mask_unavailable", {
            generationId: queuedGeneration.id,
            maskFailureReason: fidelityMetadata.mask_failure_reason ?? null,
            preservationMode: requestedPreservationMode,
          });
          logPixelLockFallback();
        } else {
          fidelityMetadata.mask_source = maskResolution.source;
          fidelityMetadata.mask_cached = maskResolution.cached;
          logDevelopmentGenerationEvent("mask_resolved", {
            generationId: queuedGeneration.id,
            maskCached: maskResolution.cached,
            maskSource: maskResolution.source,
            preservationMode: requestedPreservationMode,
          });
          pixelLockInput = await preparePixelLockInput({
            mask: maskResolution.mask,
            originalProduct: sourceImage,
            targetWidth: outputCanvas.width,
            targetHeight: outputCanvas.height,
          });
          if (!pixelLockInput) {
            effectivePreservationMode = "reference_edit";
            fidelityStatus = "not_available";
            fidelityMetadata.mask_failure_reason = "mask_preparation_failed";
            fidelityMetadata.unavailable_reason = "preparation_failed";
            logPixelLockFallback();
          } else {
            fidelityMetadata.product_placement = pixelLockInput.placement;
          }
        }
      } catch {
        effectivePreservationMode = "reference_edit";
        fidelityStatus = "not_available";
        fidelityMetadata.mask_failure_reason = "mask_preparation_failed";
        fidelityMetadata.unavailable_reason = "preparation_failed";
        logPixelLockFallback();
      }
    }

    fidelityMetadata.effective_mode = effectivePreservationMode;
    const providerProductAsset = {
      id: asset.id,
      bucketId: asset.bucket_id,
      objectPath: asset.object_path,
      data: pixelLockInput?.productCanvas ?? inputImage,
      mimeType: pixelLockInput ? "image/png" : inputImage.type || "image/png",
    };
    const providerProductAssets = [
      providerProductAsset,
      ...usableProductImages.filter(({ asset: productAsset }) => productAsset.id !== asset.id).map(({ asset: productAsset, data, mimeType }) => ({
        id: productAsset.id,
        bucketId: productAsset.bucket_id,
        objectPath: productAsset.object_path,
        data,
        mimeType,
      })),
    ];
    const generationImages = usableReferenceImages.length > 0
      ? orderReferenceReplacementImages({
        id: usableReferenceImages[0].asset.id,
        bucketId: usableReferenceImages[0].asset.bucket_id,
        objectPath: usableReferenceImages[0].asset.object_path,
        data: usableReferenceImages[0].data,
        mimeType: usableReferenceImages[0].mimeType,
      }, providerProductAssets)
      : orderGenerationImages(providerProductAssets, usableReferenceImages.map(({ asset: reference, data, mimeType }) => ({
      id: reference.id,
      bucketId: reference.bucket_id,
      objectPath: reference.object_path,
      data,
      mimeType,
    })), apparelArtwork ? { id: asset.id, bucketId: asset.bucket_id, objectPath: asset.object_path, data: apparelArtwork.data, mimeType: "image/png" } : null);
    const visibleHuman = !strictProductOnlyStudio && !/\b(?:no|without)\s+(?:visible\s+)?(?:person|people|human|model|body|skin|hands?)\b/i.test(metadataUserPrompt) && (referenceHumanPresent || ["fashion_on_model", "jewelry_on_model", "watch_on_wrist", "footwear_on_model", "bags_on_model"].includes(strategy) || /\b(?:person|woman|man|model|hand|arm|leg|foot|feet|face|wrist|neck|ear|body)\b/i.test(metadataUserPrompt) || ["held", "worn", "near_face"].includes(referenceInteraction ?? ""));
    const finalPrompt = buildImageGenerationPromptWithPolicy(
      promptEnhancement.prompt,
      effectivePreservationMode,
      { strategy, useCase: qualityUseCase, productProfile, sceneSuitability, composition, creativeCompliance, referenceMatch, identityManifest, generationImages, apparelIdentityManifest, exactProductApparel: apparelFidelityMode.exactProductApparel, aspectRatio, presetFamilyId: presetFamily?.id ?? null, presetRules: presetFamily ? { allowedSceneTypes: presetFamily.allowedSceneTypes, disallowedSceneTypes: presetFamily.disallowedSceneTypes, hardRules: presetFamily.hardRules, softRules: presetFamily.softRules, variantId: resolvedVariantId, presentationMode: resolvedPresetVariant?.presentationMode ?? null, humanPresence: resolvedPresetVariant?.humanPresence ?? null, modeContract: presentationModeContract, referenceOverriddenFields, presetPreservedFields } : null, referenceAuthority: usableReferenceImages.length > 0, referenceStyle: referenceAnalysis.styleBrief, strictProductOnlyStudio, visibleHuman, referenceHumanPresent, interactionMode: resolvedPresetVariant?.interactionMode ?? referenceInteraction },
    );
    if (presetFamily) {
      console.info("[preset] validator_context", { generationId, selectedPresetId: presetFamily.id, selectedPresetFamily: presetFamily.id, selectedVariantId: resolvedVariantId, allowedSceneTypes: presetFamily.allowedSceneTypes, disallowedSceneTypes: presetFamily.disallowedSceneTypes, overrideReason: usableReferenceImages.length > 0 ? "reference_authority" : strategyResolution.reason !== "preset_strategy_hint" ? strategyResolution.reason : null, variationSource: "generation_seed" });
    }
    console.info("[generation] authority_resolved", {
      generationId,
      referenceCount: usableReferenceImages.length,
      referenceAuthorityActive: usableReferenceImages.length > 0,
      primaryReferenceId: usableReferenceImages[0]?.asset.id ?? null,
      sceneAuthoritySource: sceneSuitability?.source === "reference_authority" ? "reference_1" : sceneSuitability?.source === "trusted_preset" ? "preset" : sceneSuitability?.source ?? null,
      compositionAuthoritySource: composition?.source === "reference_authority" ? "reference_1" : composition?.source === "preset_hint" || composition?.source === "scene_template" ? "preset" : composition?.source ?? null,
      presetOverrideReason: usableReferenceImages.length > 0 ? "reference_authority" : null,
      referenceOverriddenFields,
      presetPreservedFields,
      referenceReplacementMode: usesReferenceReplacement ? "reference_product_replacement" : null,
      referenceVertical: productProfile?.vertical ?? qualityUseCase,
      resolvedSceneFamily: sceneSuitability?.selectedSceneFamily ?? null,
    });
    logDevelopmentGenerationEvent("product_identity_lock", {
      generationId: queuedGeneration.id,
      vertical: identityManifest.vertical,
      identityAnchorCount: identityManifest.immutableAttributes.length + identityManifest.geometryAnchors.length + identityManifest.colorMaterialAnchors.length + identityManifest.brandingAnchors.length,
      sourceImageRoleApplied: generationImages[0]?.role === "product_identity_source",
      referenceCount: usableReferenceImages.length,
      productImageCount: providerProductAssets.length,
      version: PRODUCT_IDENTITY_LOCK_VERSION,
    });
    logDevelopmentGenerationEvent("product_profile_prompt", {
      generationId: queuedGeneration.id,
      vertical: productProfile?.vertical ?? null,
      subcategory: productProfile?.subcategory ?? null,
      identityRuleCount: finalPrompt.layers.productProfileApplied && productProfile
        ? compileProductProfilePrompt(productProfile).identity.length : 0,
      interactionRuleCount: finalPrompt.layers.productProfileApplied && productProfile
        ? compileProductProfilePrompt(productProfile).interaction.length : 0,
      forbiddenRuleCount: finalPrompt.layers.productProfileApplied && productProfile
        ? compileProductProfilePrompt(productProfile).forbidden.length : 0,
      status: finalPrompt.layers.productProfileApplied ? "applied" : asset.product_profile === null ? "missing" : "invalid",
    });
    logDevelopmentGenerationEvent("generation_policy_resolved", {
      footwear_v2: finalPrompt.layers.footwearV2Applied,
      generationId: queuedGeneration.id,
      jewelry_v2: finalPrompt.layers.jewelryV2Applied,
      resolvedStrategy: strategy,
      resolvedVertical: finalPrompt.layers.vertical,
      watch_v2: finalPrompt.layers.watchV2Applied,
    });
    logDevelopmentGenerationEvent("watch_wrist_integration_resolved", {
      active: finalPrompt.layers.watchWristIntegrationActive,
      directReference: finalPrompt.layers.watchWristIntegrationActive && usableReferenceImages.length > 0,
      wristGeometryAvailable: Boolean(referenceAnalysis.styleBrief?.poseLanguage && /wrist|arm|hand/i.test(referenceAnalysis.styleBrief.poseLanguage)),
      placementContractResolved: finalPrompt.layers.watchWristIntegrationActive,
      sourceIdentityPreserved: (productProfile?.vertical ?? finalPrompt.layers.vertical) === "watches",
    });
    const finalPolicy = validateGenerationPolicy({
      strategy,
      sceneFamily: sceneSuitability?.selectedSceneFamily,
      preservationMode: effectivePreservationMode,
      hasUsableMask: pixelLockInput !== null,
      vertical: productProfile?.vertical ?? null,
    });
    if (effectivePreservationMode === "pixel_lock" && finalPolicy.preservationMode === "reference_edit") {
      logDevelopmentGenerationEvent("preservation_mode_fallback", {
        generationId: queuedGeneration.id, requested: "pixel_lock", effective: "reference_edit", reason: "mask_unavailable",
      });
      fidelityStatus = "not_available";
      fidelityMetadata.unavailable_reason = "mask_not_available";
    }
    effectivePreservationMode = finalPolicy.preservationMode;
    fidelityMetadata.effective_mode = effectivePreservationMode;
    const commercialFashionSafetyInput = {
      vertical: productProfile?.vertical ?? finalPrompt.layers.vertical,
      requiresCommercialFashionSafety: finalPrompt.layers.requiresCommercialFashionSafety,
    };
    const commercialFashionSafety = resolveCommercialFashionSafetyLayer(commercialFashionSafetyInput);
    const providerCreativeDirection = promptEnhancement.prompt;
    logDevelopmentGenerationEvent("commercial_fashion_safety_resolved", { generationId: queuedGeneration.id, applied: commercialFashionSafety.applied, referenceReplacement: usesReferenceReplacement });
    let activePrompt = usesReferenceReplacement
      ? `${buildReferenceReplacementPrompt(providerCreativeDirection, commercialFashionSafety.applied ? { commercialFashionSafetyContext: commercialFashionSafety.context } : undefined)}\n\n${compileOutputFormatGuidance(aspectRatio)}${strategy === "watch_on_wrist" ? `\n\n${watchOnWristInstructions}` : ""}${apparelIdentityManifest ? `\n\n${compileApparelArtworkLock(apparelIdentityManifest)}` : ""}`
      : finalPrompt.prompt;
    const humanRealismPolicy = resolveHumanRealismPolicy({ strategy, vertical: productProfile?.vertical ?? finalPrompt.layers.vertical, visibleHuman, referenceHumanPresent, interactionMode: resolvedPresetVariant?.interactionMode ?? referenceInteraction, expectsHuman: finalPrompt.layers.requiresHumanRealism });
    const humanRealismDirection = compileHumanRealismPrompt(humanRealismPolicy, productProfile?.vertical ?? finalPrompt.layers.vertical);
    if (humanRealismDirection && !activePrompt.includes(humanRealismDirection)) activePrompt = `${activePrompt}\n\n${humanRealismDirection}`;
    const apparelFitPolicy = { active: finalPrompt.layers.apparelFitPreservationActive, profile: finalPrompt.layers.apparelFitProfile };
    const apparelFitDirection = compileApparelFitPreservationPrompt(apparelFitPolicy, usableReferenceImages.length > 0);
    if (apparelFitDirection && !activePrompt.includes(apparelFitDirection)) activePrompt = `${activePrompt}\n\n${apparelFitDirection}`;
    if (referenceFashionClassification.promptContext && !activePrompt.includes(referenceFashionClassification.promptContext)) activePrompt = `${activePrompt}\n\n${referenceFashionClassification.promptContext}`;
    const finalProviderPrompt = finalizeCommercialFashionProviderPrompt(activePrompt, commercialFashionSafetyInput);
    activePrompt = finalProviderPrompt.prompt;
    logDevelopmentGenerationEvent("apparel_fit_profile_resolved", {
      generationId: queuedGeneration.id,
      version: APPAREL_FIT_PRESERVATION_VERSION,
      active: apparelFitPolicy.active,
      authoritySource: apparelFitPolicy.profile?.authoritySource ?? null,
      profileCompleteness: apparelFitPolicy.profile ? `${Object.values(apparelFitPolicy.profile).filter((value) => value !== null && value !== "" && (!Array.isArray(value) || value.length > 0)).length}/ ${Object.keys(apparelFitPolicy.profile).length} known fields` : "unavailable",
      summary: apparelFitPolicy.profile ? JSON.stringify({ garmentCategory: apparelFitPolicy.profile.garmentCategory, silhouette: apparelFitPolicy.profile.silhouette, fitType: apparelFitPolicy.profile.fitType, bodyLength: apparelFitPolicy.profile.bodyLength, materialClass: apparelFitPolicy.profile.materialClass, drapeBehavior: apparelFitPolicy.profile.drapeBehavior, sourceViewCount: apparelFitPolicy.profile.sourceViewCount }) : null,
    });
    let hybridProjectionMetadata: Record<string, unknown> | null = null;

    if (usesReferenceReplacement) {
      logDevelopmentGenerationEvent("reference_replacement_inputs", {
        generationId: queuedGeneration.id,
        baseSceneCount: 1,
        productIdentityCount: 1,
      });
    }

    const moderationInputSummary = createModerationInputSummary({
      images: generationImages,
      humanReferenceDetected: referenceHumanPresent,
      commercialSafetyApplied: finalProviderPrompt.applied,
      referenceFreeTextIncluded: Boolean(referenceAnalysis.styleBrief),
    });
    logDevelopmentGenerationEvent("moderation_input_summary", moderationInputSummary);

    providerDiagnosticContext = {
      provider: queuedGeneration.provider, model: queuedGeneration.model, imageCount: generationImages.length,
      preservationMode: effectivePreservationMode, strategy: finalPolicy.strategy,
      sceneFamily: finalPolicy.sceneFamily, klayClassification: referenceFashionClassification.klayClassification,
    };
    const imageModelCapabilities = getImageModelCapabilities(queuedGeneration.model);
    logDevelopmentGenerationEvent("image_model_capabilities", {
      generationId: queuedGeneration.id,
      model: queuedGeneration.model,
      explicitInputFidelity: imageModelCapabilities.supportsExplicitInputFidelity,
      imageCount: generationImages.length,
    });
    safeGenerationEvent("provider", "request_start", { generationId: queuedGeneration.id, provider: queuedGeneration.provider, model: queuedGeneration.model });
    executionCounts.imageGenerationCalls += 1;
    const result = await performance.measure("provider_initial", () => captureProviderSubmission(() => getImageGenerationProvider(queuedGeneration.provider).generate({
      generationId: queuedGeneration.id,
      projectId: project.id,
      sourceAsset: providerProductAsset,
      images: generationImages,
      prompt: activePrompt,
      provider: queuedGeneration.provider,
      model: queuedGeneration.model,
      quality: executionPolicy.quality,
      aspectRatio,
      ...(usesReferenceReplacement ? { operation: "reference_product_replacement" as const } : {}),
    })));
    costEvents.push(createProviderUsageEvent({
      operation: "image_initial",
      model: queuedGeneration.model,
      phase: "initial",
      requestId: typeof result.providerMetadata?.requestId === "string" ? result.providerMetadata.requestId : null,
      usage: toUsageUnits(result.usage),
    }));
    console.info("[generation] output_format_resolved", { requestedAspectRatio: aspectRatio, providerWidth: outputCanvas.width, providerHeight: outputCanvas.height, exactRatio: outputCanvas.width * Number(aspectRatio.split(":")[1]) === outputCanvas.height * Number(aspectRatio.split(":")[0]) });
    providerDiagnosticContext = null;

    let finalImageData = result.imageData;
    if (pixelLockInput && effectivePreservationMode === "pixel_lock") {
      try {
        finalImageData = await compositeLockedProduct({
          generatedImage: result.imageData,
          preparedInput: pixelLockInput,
        });
        const verification = await verifyLockedProduct({
          expectedProductCanvas: pixelLockInput.productCanvas,
          finalImage: finalImageData,
          mask: pixelLockInput.mask,
        });
        fidelityScore = verification.score;
        fidelityMetadata.verification_score = verification.score;
        fidelityStatus = verification.score >= 0.999 ? "locked" : "failed";
        fidelityMetadata.guaranteed = fidelityStatus === "locked";
        logDevelopmentGenerationEvent("fidelity_verified", {
          fidelityScore: verification.score,
          generationId: queuedGeneration.id,
          fidelityStatus,
        });
      } catch {
        finalImageData = result.imageData;
        effectivePreservationMode = "reference_edit";
        fidelityStatus = "failed";
        fidelityMetadata.effective_mode = effectivePreservationMode;
        fidelityMetadata.unavailable_reason = "verification_failed";
      }
    }

    const originalMimeType = pixelLockInput && effectivePreservationMode === "pixel_lock" ? "image/png" : result.mimeType;
    const inputPixels = Buffer.from(await inputImage.arrayBuffer());
    let variationHistory: { recentVariantIds: string[]; repeatedSceneCount: number } | null = null;
    if (presetFamily) {
      const { data: recentPresetGenerations } = await admin.from("generations").select("provider_metadata").eq("project_id", project.id).eq("generation_type", "image").eq("status", "succeeded").neq("id", queuedGeneration.id).order("created_at", { ascending: false }).limit(5);
      const recent = (recentPresetGenerations ?? []).flatMap(({ provider_metadata }) => { const value = provider_metadata && typeof provider_metadata === "object" ? provider_metadata.preset : null; return value && typeof value === "object" && value.familyId === presetFamily.id ? [value] : []; });
      const recentVariantIds = recent.map((value) => value.variantId).filter((value): value is string => typeof value === "string");
      const selected = presetFamily.variants.find(({ id }) => id === resolvedVariantId);
      const current = selected ? getPresetVariationMetadata(selected) : null;
      const dimensions = ["environment", "timeOfDay", "weather", "lighting", "pose", "framing", "cameraAngle", "captureProfile"] as const;
      const repeatedDimensionCount = current ? Math.max(0, ...recent.map((previous) => dimensions.filter((key) => previous[key] === current[key]).length)) : 0;
      variationHistory = { recentVariantIds, repeatedSceneCount: repeatedDimensionCount >= 5 ? repeatedDimensionCount : 0 };
    }
    const fidelityValidation = await performance.measure("validation_initial", () => validateGeneratedImageBestEffort({
      originalProduct: inputPixels,
      supportingProducts: usableProductImages.filter(({ asset: productAsset }) => productAsset.id !== asset.id).map(({ data, mimeType }) => ({ data, mimeType })),
      generatedImage: finalImageData,
      originalMimeType: inputImage.type || "image/png",
      ...(usesReferenceReplacement ? { referenceBaseScene: usableReferenceImages[0].data, referenceBaseSceneMimeType: usableReferenceImages[0].mimeType } : {}),
      generatedMimeType: originalMimeType,
      productProfile,
      vertical: productProfile?.vertical ?? (strategyCategory === "product" ? "product" : strategyCategory),
      strategy: finalPolicy.strategy,
      humanRealism: humanRealismPolicy,
      apparelFit: apparelFitPolicy,
      sceneSuitability,
      composition,
      creativeCompliance,
      referenceStyleContext: referenceAnalysis.styleBrief ? JSON.stringify(referenceAnalysis.styleBrief) : null,
      referenceAuthority: usableReferenceImages.length > 0,
      referenceMatch,
      identityManifest,
      preset: presetFamily ? { familyId: presetFamily.id, variantId: resolvedVariantId, allowedSceneTypes: presetFamily.allowedSceneTypes, disallowedSceneTypes: presetFamily.disallowedSceneTypes, hardRules: presetFamily.hardRules, softRules: presetFamily.softRules, presentationMode: resolvedPresetVariant?.presentationMode ?? null, humanPresence: resolvedPresetVariant?.humanPresence ?? null, interactionMode: resolvedPresetVariant?.interactionMode ?? null, strictProductOnlyStudio, modeContract: presentationModeContract, referenceOverriddenFields, presetPreservedFields } : null,
      variationHistory,
      ...(apparelArtwork ? { apparelArtworkIdentity: { data: apparelArtwork.data, mimeType: "image/png", containsText: apparelArtwork.identitySource.containsText, side: apparelArtwork.side, confidence: apparelArtwork.identitySource.confidence } } : {}),
      apparelArtworkEvidence: apparelIdentityManifest ? { artworkPresent: apparelIdentityManifest.artworkPresent, artworkSide: apparelIdentityManifest.artworkSide } : null,
      exactProductApparel: apparelFidelityMode.exactProductApparel,
    }));
    executionCounts.visionValidationCalls += 1;
    costEvents.push(fidelityValidation.telemetry ? createProviderUsageEvent({ operation: "fidelity_validation", model: getFidelityValidationModel(), phase: "supporting", requestId: fidelityValidation.telemetry.requestId, usage: fidelityValidation.telemetry.usage }) : createUnknownOperationEvent({ operation: "fidelity_validation", provider: "openai", model: getFidelityValidationModel() }));
    const hybridEligible = resolveHybridProjectionEligibility({ vertical: productProfile?.vertical ?? null, artworkPresent: Boolean(apparelArtwork), exactProductApparel: apparelFidelityMode.exactProductApparel, artworkSide: apparelArtwork?.side ?? "unknown", localized: Boolean(apparelArtwork) });
    if (hybridEligible && apparelArtwork && apparelIdentityManifest?.artworkBoundingRegion) {
      try {
        const projection = await import("@/lib/apparel-projection/project-artwork");
        const artworkBox = apparelIdentityManifest.artworkBoundingRegion;
        const projected = await performance.measure("hybrid_projection", () => projection.projectApparelArtwork({ sourceImage: inputPixels, artworkCrop: apparelArtwork.data, artworkBox, generatedImage: finalImageData, side: apparelArtwork.side as "front" | "back", generationId: queuedGeneration.id, onAnalysisCall: () => { executionCounts.projectionAnalysisCalls += 1; costEvents.push(createUnknownOperationEvent({ operation: "projection_analysis", provider: "openai", model: getReferenceAnalysisModel() })); }, log: (event, fields) => console.info(`[hybrid-projection] ${event}`, fields) }));
        finalImageData = projected.image;
        hybridProjectionMetadata = { ...projected.metadata };
      } catch (error) {
        if (error instanceof Error && error.name === "SharpRuntimeUnavailableError") {
          console.warn("[hybrid-projection] runtime_unavailable");
          hybridProjectionMetadata = { enabled: true, applied: false, fallbackReason: "runtime_unavailable", version: "hybrid-apparel-projection-v1", artworkExtractionMode: "unavailable", garmentSurfaceConfidence: 0, warpMode: "unavailable", validationStatus: "unavailable" };
        } else throw error;
      }
    }
    const originalValidationIssueCounts = {
      critical: fidelityValidation.issues.filter(({ severity }) => severity === "critical").length,
      major: fidelityValidation.issues.filter(({ severity }) => severity === "major").length,
      minor: fidelityValidation.issues.filter(({ severity }) => severity === "minor").length,
    };
    const originalIdentityIssueCounts = {
      critical: fidelityValidation.issues.filter(({ identityImpact, severity }) => identityImpact === "critical" && severity === "critical").length,
      major: fidelityValidation.issues.filter(({ identityImpact, severity }) => identityImpact === "major" && severity === "major").length,
    };
    console.info("[generation] calibrated_validation", {
      status: fidelityValidation.status,
      commerciallyUsable: fidelityValidation.commerciallyUsable,
      criticalIssueCount: originalValidationIssueCounts.critical,
      majorIssueCount: originalValidationIssueCounts.major,
      minorIssueCount: originalValidationIssueCounts.minor,
      identityCriticalIssueCount: originalIdentityIssueCounts.critical,
      identityMajorIssueCount: originalIdentityIssueCounts.major,
      apparelFitIssues: fidelityValidation.issues.filter(({ category }) => category === "apparel_fit").map(({ code }) => code),
      presetMismatchFields: fidelityValidation.issues.filter(({ code }) => code.toLowerCase().startsWith("preset_")).flatMap(({ presetMismatchFields }) => presetMismatchFields ?? []),
    });
    if (fidelityValidation.status === "validation_unavailable") {
      logDevelopmentGenerationEvent("fidelity_validation_unavailable", {
        generationId: queuedGeneration.id,
        reason: fidelityValidation.summary,
      });
    } else {
      logDevelopmentGenerationEvent("fidelity_validation", {
        generationId: queuedGeneration.id,
        status: fidelityValidation.status,
        criticalIssueCount: originalValidationIssueCounts.critical,
        majorIssueCount: originalValidationIssueCounts.major,
        minorIssueCount: originalValidationIssueCounts.minor,
        identityCriticalIssueCount: originalIdentityIssueCounts.critical,
        identityMajorIssueCount: originalIdentityIssueCounts.major,
        retryRecommended: fidelityValidation.retryRecommended,
      });
    }
    if (usesReferenceReplacement) {
      logDevelopmentGenerationEvent("reference_preservation_validation", {
        generationId: queuedGeneration.id,
        status: fidelityValidation.status,
        changedSceneAreas: fidelityValidation.issues.filter(({ category }) => category === "reference_match").map(({ code }) => code).slice(0, 8),
        productIdentityStatus: originalIdentityIssueCounts.critical + originalIdentityIssueCounts.major === 0 ? "pass" : "issues_found",
      });
    }

    const projectionReady = hybridProjectionMetadata?.applied === true;
    const repairEligibility = resolveRepairEligibility({ validation: fidelityValidation, exactProduct: apparelFidelityMode.exactProductApparel, hybridProjectionApplied: hybridProjectionMetadata?.applied === true, hybridProjectionEnabled: hybridEligible, hybridProjectionReady: projectionReady, maximumAttemptsRemaining: true });
    const mappedRepairPlan = resolveRepairPlan(fidelityValidation);
    logDevelopmentGenerationEvent("repair_input_normalized", {
      issueCodes: fidelityValidation.issues.map(({ code }) => code),
      severities: fidelityValidation.issues.map(({ severity }) => severity),
      confidences: fidelityValidation.issues.map(({ confidence }) => String(confidence ?? 0.9)),
      repairableIssueCodes: mappedRepairPlan.repairableIssueCodes,
    });
    const repairPlan = repairEligibility.eligible ? mappedRepairPlan : { ...mappedRepairPlan, shouldRetry: false, categories: [], repairInstructions: [] };
    const watchIssueCodes = fidelityValidation.issues.filter(({ code }) => code.toLowerCase().startsWith("watch_")).map(({ code }) => code);
    logDevelopmentGenerationEvent("watch_wrist_validation_summary", { issueCodes: watchIssueCodes, hardFailure: fidelityValidation.status === "fail" && watchIssueCodes.length > 0, repairEligible: repairPlan.shouldRetry && watchIssueCodes.length > 0 });
    const jewelryReferenceRepair = productProfile?.vertical === "jewelry" && usableReferenceImages.length > 0 && repairPlan.shouldRetry && repairPlan.issueCodes.every((code) => code.toLowerCase().startsWith("jewelry_"));
    if (productProfile?.vertical === "jewelry" && usableReferenceImages.length > 0 && fidelityValidation.status !== "validation_unavailable") {
      const criticalIssueCount = fidelityValidation.issues.filter(({ category, severity }) => category === "product_identity" && severity === "critical").length;
      const majorIssueCount = fidelityValidation.issues.filter(({ category, severity }) => category === "product_identity" && severity === "major").length;
      console.info("[generation] jewelry_reference_identity", { identityStatus: criticalIssueCount ? "critical_drift" : majorIssueCount ? "major_drift" : "clear", criticalIssueCount, majorIssueCount, referenceProductContamination: fidelityValidation.issues.some(({ code }) => code.toLowerCase() === "jewelry_reference_product_contamination"), repairEligible: jewelryReferenceRepair });
    }
    logDevelopmentGenerationEvent("auto_repair_decision", {
      generationId: queuedGeneration.id,
      shouldRetry: repairPlan.shouldRetry,
      issueCodes: repairPlan.issueCodes,
      presetValidationIssues: fidelityValidation.issues.filter(({ code }) => code.toLowerCase().startsWith("preset_") || code.toLowerCase() === "bag_preset_scene_mismatch").map(({ code }) => code),
      repairEligiblePresetIssues: repairEligibility.eligible ? repairPlan.issueCodes.filter((code) => code.toLowerCase().startsWith("preset_") || code.toLowerCase() === "bag_preset_scene_mismatch") : [],
      categories: repairPlan.categories,
      repairExpectedValue: repairEligibility.repairExpectedValue,
      apparelFitActive: apparelFitPolicy.active,
      apparelFitIssues: fidelityValidation.issues.filter(({ category }) => category === "apparel_fit").map(({ code }) => code),
      reason: repairEligibility.reason,
      quality: executionPolicy.repairQuality,
    });

    const originalAttempt: GenerationAttempt = {
      attempt: 0,
      imageData: finalImageData,
      mimeType: originalMimeType,
      validation: fidelityValidation,
      providerRequestId: typeof result.providerMetadata?.requestId === "string" ? result.providerMetadata.requestId : null,
      preservationMode: effectivePreservationMode,
    };
    let repairAttempt: GenerationAttempt | null = null;
    let selectedProviderResult = result;

    if (repairPlan.shouldRetry) {
      logDevelopmentGenerationEvent("auto_repair_started", {
        generationId: queuedGeneration.id,
        attempt: 1,
      });
      try {
        executionCounts.repairCalls = 1;
        executionCounts.imageGenerationCalls += 1;
        const repairResult = await performance.measure("provider_repair", () => captureProviderSubmission(() => getImageGenerationProvider(queuedGeneration.provider).generate({
          generationId: queuedGeneration.id,
          projectId: project.id,
          sourceAsset: providerProductAsset,
          images: jewelryReferenceRepair
            ? orderImageEditImages({ id: queuedGeneration.id, bucketId: generatedAssetsBucket, objectPath: `repair-base/${queuedGeneration.id}`, data: finalImageData, mimeType: originalMimeType }, providerProductAsset)
            : generationImages,
          prompt: jewelryReferenceRepair
            ? `JEWELRY-ONLY TARGETED REPAIR. Image 1 is the current generated result; keep its scene, hand, anatomy, pose, framing, camera, lighting, background, and every non-jewelry pixel unchanged. Image 2 is the authoritative source jewelry product. Edit only the jewelry region to restore its exact source identity, including stone shape/count, prongs, setting, halo and side stones, band geometry, metal color, and proportions. Do not use jewelry from the original visual reference as a design source.\n${compileRepairInstructions(activePrompt, repairPlan)}`
            : compileRepairInstructions(activePrompt, repairPlan),
          provider: queuedGeneration.provider,
          model: queuedGeneration.model,
          quality: executionPolicy.repairQuality,
          aspectRatio,
          ...(jewelryReferenceRepair ? { operation: "image_edit" as const } : usesReferenceReplacement ? { operation: "reference_product_replacement" as const } : {}),
        })));
        costEvents.push(createProviderUsageEvent({
          operation: "image_repair",
          model: queuedGeneration.model,
          phase: "repair",
          requestId: typeof repairResult.providerMetadata?.requestId === "string" ? repairResult.providerMetadata.requestId : null,
          usage: toUsageUnits(repairResult.usage),
        }));
        let repairImageData = repairResult.imageData;
        let repairMimeType = repairResult.mimeType;
        if (pixelLockInput && effectivePreservationMode === "pixel_lock") {
          try {
            repairImageData = await compositeLockedProduct({ generatedImage: repairResult.imageData, preparedInput: pixelLockInput });
            await verifyLockedProduct({ expectedProductCanvas: pixelLockInput.productCanvas, finalImage: repairImageData, mask: pixelLockInput.mask });
            repairMimeType = "image/png";
          } catch {
            repairImageData = repairResult.imageData;
          }
        }
        const repairValidation = await performance.measure("validation_repair", () => validateGeneratedImageBestEffort({
          originalProduct: inputPixels,
          supportingProducts: usableProductImages.filter(({ asset: productAsset }) => productAsset.id !== asset.id).map(({ data, mimeType }) => ({ data, mimeType })),
          generatedImage: repairImageData,
          originalMimeType: inputImage.type || "image/png",
          ...(usesReferenceReplacement ? { referenceBaseScene: usableReferenceImages[0].data, referenceBaseSceneMimeType: usableReferenceImages[0].mimeType } : {}),
          generatedMimeType: repairMimeType,
          productProfile,
          vertical: productProfile?.vertical ?? (strategyCategory === "product" ? "product" : strategyCategory),
          strategy: finalPolicy.strategy,
          humanRealism: humanRealismPolicy,
          apparelFit: apparelFitPolicy,
          sceneSuitability,
          composition,
          creativeCompliance,
          referenceStyleContext: referenceAnalysis.styleBrief ? JSON.stringify(referenceAnalysis.styleBrief) : null,
          referenceAuthority: usableReferenceImages.length > 0,
          referenceMatch,
          identityManifest,
          preset: presetFamily ? { familyId: presetFamily.id, variantId: resolvedVariantId, allowedSceneTypes: presetFamily.allowedSceneTypes, disallowedSceneTypes: presetFamily.disallowedSceneTypes, hardRules: presetFamily.hardRules, softRules: presetFamily.softRules, presentationMode: resolvedPresetVariant?.presentationMode ?? null, humanPresence: resolvedPresetVariant?.humanPresence ?? null, interactionMode: resolvedPresetVariant?.interactionMode ?? null, strictProductOnlyStudio, modeContract: presentationModeContract, referenceOverriddenFields, presetPreservedFields } : null,
          ...(apparelArtwork ? { apparelArtworkIdentity: { data: apparelArtwork.data, mimeType: "image/png", containsText: apparelArtwork.identitySource.containsText, side: apparelArtwork.side, confidence: apparelArtwork.identitySource.confidence } } : {}),
          apparelArtworkEvidence: apparelIdentityManifest ? { artworkPresent: apparelIdentityManifest.artworkPresent, artworkSide: apparelIdentityManifest.artworkSide } : null,
          exactProductApparel: apparelFidelityMode.exactProductApparel,
        }));
        executionCounts.visionValidationCalls += 1;
        costEvents.push(repairValidation.telemetry ? createProviderUsageEvent({ operation: "repair_validation", model: getFidelityValidationModel(), phase: "repair", requestId: repairValidation.telemetry.requestId, usage: repairValidation.telemetry.usage }) : createUnknownOperationEvent({ operation: "repair_validation", provider: "openai", model: getFidelityValidationModel(), phase: "repair" }));
        const repairIssueCounts = {
          critical: repairValidation.issues.filter(({ severity }) => severity === "critical").length,
          major: repairValidation.issues.filter(({ severity }) => severity === "major").length,
          minor: repairValidation.issues.filter(({ severity }) => severity === "minor").length,
        };
        const repairIdentityIssueCounts = {
          critical: repairValidation.issues.filter(({ category, severity }) => category === "product_identity" && severity === "critical").length,
          major: repairValidation.issues.filter(({ category, severity }) => category === "product_identity" && severity === "major").length,
        };
        logDevelopmentGenerationEvent("auto_repair_validated", {
          generationId: queuedGeneration.id,
          status: repairValidation.status,
          criticalIssueCount: repairIssueCounts.critical,
          majorIssueCount: repairIssueCounts.major,
          minorIssueCount: repairIssueCounts.minor,
          identityCriticalIssueCount: repairIdentityIssueCounts.critical,
          identityMajorIssueCount: repairIdentityIssueCounts.major,
        });
        repairAttempt = {
          attempt: 1,
          imageData: repairImageData,
          mimeType: repairMimeType,
          validation: repairValidation,
          providerRequestId: typeof repairResult.providerMetadata?.requestId === "string" ? repairResult.providerMetadata.requestId : null,
          preservationMode: effectivePreservationMode,
        };
      } catch (repairError) {
        if (providerOutcomeAmbiguous) throw repairError;
        logDevelopmentGenerationEvent("auto_repair_validated", {
          generationId: queuedGeneration.id,
          status: "validation_unavailable",
          criticalIssueCount: 0,
          majorIssueCount: 0,
          minorIssueCount: 0,
        });
      }
    }

    const finalSelection = resolveFinalCandidateSelection(originalAttempt, repairAttempt, (attempt) => {
      const statusAccepted = (attempt.validation.status === "pass" || attempt.validation.status === "pass_with_warnings") && attempt.validation.commerciallyUsable === true;
      if (!apparelFidelityMode.productFidelityFirst || !apparelIdentityManifest || attempt.validation.status === "validation_unavailable") return statusAccepted;
      const gate = evaluateApparelProductFidelity({ validationStatus: attempt.validation.status, issueCodes: attempt.validation.issues.map(({ code }) => code), benchmarkStatus: queuedGeneration.provider_metadata?.apparel_product_fidelity_benchmark === "passed" ? "passed" : "not_run" });
      return statusAccepted && gate.qualityGatePassed;
    });
    const selectedAttempt = finalSelection.attempt;
    if (selectedAttempt.attempt === 1 && repairAttempt) selectedProviderResult = { ...result, providerMetadata: repairAttempt.providerRequestId ? { requestId: repairAttempt.providerRequestId } : undefined };
    finalImageData = selectedAttempt.imageData;
    const selectedMimeType = selectedAttempt.mimeType;
    const selectedValidation = selectedAttempt.validation;
    const apparelFidelityGate = apparelFidelityMode.productFidelityFirst
      ? evaluateApparelProductFidelity({
        validationStatus: selectedValidation.status,
        issueCodes: selectedValidation.issues.map(({ code }) => code),
        benchmarkStatus: queuedGeneration.provider_metadata?.apparel_product_fidelity_benchmark === "passed" ? "passed" : "not_run",
      })
      : null;
    const qualityGatePassed = selectedValidation.status === "validation_unavailable" ? null : finalSelection.qualityGatePassed && (apparelFidelityGate?.qualityGatePassed ?? true);
    const terminalDecision = resolveGenerationTerminalDecision({ validationStatus: selectedValidation.status, qualityGatePassed, commerciallyUsable: selectedValidation.commerciallyUsable });
    const finalQualityAccepted = terminalDecision !== "rejected";
    if (selectedValidation.status === "validation_unavailable") fidelityStatus = "not_available";
    else if (selectedValidation.status === "fail" || !qualityGatePassed) fidelityStatus = "failed";
    else if (fidelityStatus !== "locked") fidelityStatus = selectedValidation.status === "pass" || selectedValidation.status === "pass_with_warnings" ? "locked" : "not_checked";
    if (apparelFidelityGate) {
      logDevelopmentGenerationEvent("product_fidelity_quality_gate", {
        generationId: queuedGeneration.id,
        productFidelityReady: apparelFidelityGate.productFidelityReady,
        qualityGatePassed: apparelFidelityGate.qualityGatePassed,
        failedCodes: apparelFidelityGate.failedCodes.slice(0, 8),
      });
    }
    const repairMetadata: RepairMetadata = {
      version: AUTO_REPAIR_VERSION,
      attempted: repairPlan.shouldRetry,
      selectedAttempt: selectedAttempt.attempt,
      repairCategories: repairPlan.categories,
      originalValidationStatus: fidelityValidation.status,
      repairValidationStatus: repairAttempt?.validation.status ?? null,
    };
    logDevelopmentGenerationEvent("final_candidate_selected", {
      generationId: queuedGeneration.id,
      selectedAttempt: selectedAttempt.attempt,
      reason: finalSelection.reason,
      initialValidationStatus: fidelityValidation.status,
      repairValidationStatus: repairAttempt?.validation.status ?? null,
      qualityGatePassed,
      terminalDecision,
      commerciallyUsable: selectedValidation.commerciallyUsable,
      finalValidationStatus: selectedValidation.status,
      apparelFitActive: apparelFitPolicy.active,
      apparelFitIssues: selectedValidation.issues.filter(({ category }) => category === "apparel_fit").map(({ code }) => code),
    });
    if (!finalQualityAccepted) {
      logDevelopmentGenerationEvent("quality_gate_rejected_terminal", {
        generationId: queuedGeneration.id,
        qualityGatePassed,
        commerciallyUsable: selectedValidation.commerciallyUsable,
        finalValidationStatus: selectedValidation.status,
        apparelFitIssues: selectedValidation.issues.filter(({ category }) => category === "apparel_fit").map(({ code }) => code),
        issueCodes: selectedValidation.issues.map(({ code }) => code).slice(0, 20),
      });
      throw new Error("Generated candidate rejected by quality gate.");
    }
    const validationIssueCounts = {
      critical: selectedValidation.issues.filter(({ severity }) => severity === "critical").length,
      major: selectedValidation.issues.filter(({ severity }) => severity === "major").length,
      minor: selectedValidation.issues.filter(({ severity }) => severity === "minor").length,
    };

    const { error: uploadError } = await performance.measure("storage", () => admin.storage
      .from(generatedAssetsBucket)
      .upload(outputObjectPath, finalImageData, {
        contentType:
          selectedMimeType,
        upsert: false,
      }));
    if (uploadError) {
      throw new Error("Unable to upload the generated image.");
    }
    outputStored = true;

    const processingCompletedAt = new Date();
    const humanRealismMetadata: HumanRealismMetadata = {
      version: HUMAN_REALISM_VERSION,
      expected: humanRealismPolicy.expected,
      applied: humanRealismPolicy.applied,
      focusAreas: humanRealismPolicy.focusAreas,
      issues: selectedValidation.issues.filter(({ category }) => category === "human_realism").map((issue) => ({ issueCode: issue.issueCode ?? issue.code, confidence: issue.confidence ?? 0.9, severity: issue.severity, region: issue.region ?? "unspecified", repairable: issue.repairable ?? false, commercialImpact: issue.commercialImpact ?? "none" })),
      hardFailure: selectedValidation.issues.some((issue) => issue.category === "human_realism" && issue.severity === "critical" && (issue.confidence ?? 0.9) >= 0.75),
      repairEligible: repairPlan.shouldRetry && repairPlan.categories.some((category) => category.endsWith("_repair")),
      repairTriggered: selectedAttempt.attempt === 1,
      repairCategory: selectedAttempt.attempt === 1 ? repairPlan.categories.find((category) => category.endsWith("_repair")) ?? null : null,
      validationResult: selectedValidation.status,
      repairType: selectedAttempt.attempt === 1 ? repairPlan.categories.join(",") || "repair" : null,
    };
    postStorageStep = "persist_terminal_state";
    console.info("[generation-post-storage] step_start", { generationId, step: postStorageStep });
    const stageDurations = performance.finish();
    const { data: completedGeneration, error: completionError } = await admin
      .from("generations")
      .update({
        status: mapGenerationTerminalDecisionToStatus(terminalDecision),
        output_bucket_id: generatedAssetsBucket,
        output_object_path: outputObjectPath,
        output_mime_type:
          selectedMimeType,
        provider_request_id:
          typeof selectedProviderResult.providerMetadata?.requestId === "string"
            ? selectedProviderResult.providerMetadata.requestId
            : null,
        preservation_mode: effectivePreservationMode,
        fidelity_status: fidelityStatus,
        fidelity_score: fidelityScore,
      provider_metadata: {
          ...(selectedProviderResult.providerMetadata ?? {}),
          ...(presetFamily ? { preset: { ...(createCreativePresetMetadata(getCreativePreset(presetId), resolvedVariantId) ?? {}), version: PRESET_SYSTEM_VERSION, familyId: presetFamily.id, selectedPresetFamily: presetFamily.id, selectedPresentationMode, resolvedPresentationMode: resolvedPresetVariant?.presentationMode ?? null, presentationModeSource: selectedPresentationMode ? "user" : "automatic", presentationModeOverrideReason, referenceOverriddenFields, presetPreservedFields, variantId: resolvedVariantId, allowedSceneTypes: presetFamily.allowedSceneTypes, disallowedSceneTypes: presetFamily.disallowedSceneTypes, ...(presetFamily.variants.find(({ id }) => id === resolvedVariantId) ? getPresetVariationMetadata(presetFamily.variants.find(({ id }) => id === resolvedVariantId)!) : {}) } } : {}),
          outputFormat: { requestedAspectRatio: aspectRatio, providerWidth: outputCanvas.width, providerHeight: outputCanvas.height, version: "output-format-v1" },
          execution: { version: GENERATION_EXECUTION_POLICY_VERSION, imageGenerationCalls: executionCounts.imageGenerationCalls, visionValidationCalls: executionCounts.visionValidationCalls, promptEnhancementCalls: executionCounts.promptEnhancementCalls, productAnalysisCalls: executionCounts.productAnalysisCalls, artworkAnalysisCalls: executionCounts.artworkAnalysisCalls, repairCalls: executionCounts.repairCalls, repairSuppressed: !repairPlan.shouldRetry && fidelityValidation.status === "fail", repairSuppressionReason: !repairPlan.shouldRetry && fidelityValidation.status === "fail" ? repairEligibility.reason : null, avoidedImageGenerationCalls: !repairPlan.shouldRetry && fidelityValidation.status === "fail" ? 1 : 0, totalDurationMs: stageDurations.total, stages: stageDurations, quality: executionPolicy.quality, difficulty: executionPolicy.difficulty, reasons: executionPolicy.reasons, repairQuality: repairPlan.shouldRetry ? executionPolicy.repairQuality : null, repairExpectedValue: repairEligibility.repairExpectedValue },
          costTelemetry: createCostTelemetry({ productUnderstandingCalls: executionCounts.productAnalysisCalls, referenceAnalysisCalls: executionCounts.referenceAnalysisCalls, imageGenerationCalls: executionCounts.imageGenerationCalls - executionCounts.repairCalls, validationCalls: executionCounts.visionValidationCalls, repairGenerationCalls: executionCounts.repairCalls, promptEnhancementCalls: executionCounts.promptEnhancementCalls, artworkAnalysisCalls: executionCounts.artworkAnalysisCalls, segmentationCalls: executionCounts.segmentationCalls, projectionAnalysisCalls: executionCounts.projectionAnalysisCalls, inputProductImageCount: usableProductImages.length, inputReferenceCount: usableReferenceImages.length, repairAttempted: repairAttempt !== null, finalOutcome: fidelityValidation.status === "validation_unavailable" ? "unverified" : "succeeded", validationOutcome: selectedAttempt.validation.status, providerUsage: selectedProviderResult.usage, events: costEvents }),
          ...(apparelIdentityManifest ? { apparelArtwork: { version: "apparel-artwork-localization-v1", assetId: asset.id, detected: apparelArtwork !== null, side: apparelIdentityManifest.artworkSide, boundingBox: apparelIdentityManifest.artworkBoundingRegion ? { x: apparelIdentityManifest.artworkBoundingRegion.x, y: apparelIdentityManifest.artworkBoundingRegion.y, width: apparelIdentityManifest.artworkBoundingRegion.width, height: apparelIdentityManifest.artworkBoundingRegion.height } : null, confidence: apparelArtwork?.identitySource.confidence ?? 0, containsText: apparelArtwork?.identitySource.containsText ?? false, multipleRegions: false, identitySource: apparelArtwork?.identitySource ?? null } } : {}),
          providerStatus: "succeeded",
          qualityGatePassed,
          qualityRejected: finalSelection.validationStatus === "validation_unavailable" ? false : qualityGatePassed === false,
          validationUnavailable: finalSelection.validationStatus === "validation_unavailable",
          validationStatus: selectedValidation.status,
          verificationStatus: terminalDecision === "succeeded_unverified" ? "unverified" : "verified",
          humanRealism: humanRealismMetadata,
          apparelFitProfileVersion: APPAREL_FIT_PRESERVATION_VERSION,
          apparelFitPreservationActive: apparelFitPolicy.active,
          apparelFitAuthoritySource: apparelFitPolicy.profile?.authoritySource ?? null,
          apparelFitIssues: selectedValidation.issues.filter(({ category }) => category === "apparel_fit").map((issue) => ({ issueCode: issue.issueCode ?? issue.code, confidence: issue.confidence ?? 0.9, severity: issue.severity, region: issue.region ?? "garment", repairable: issue.repairable ?? false, commercialImpact: issue.commercialImpact ?? "none" })),
          apparelFitRepairAttempted: selectedAttempt.attempt === 1 && repairPlan.categories.some((category) => category.startsWith("apparel_")),
          ...(apparelArtwork ? { apparelArtwork: { version: "apparel-artwork-identity-source-v2", detected: true, side: apparelArtwork.side, identitySource: apparelArtwork.identitySource } } : apparelIdentityManifest ? { apparelArtwork: { version: "apparel-artwork-identity-source-v2", detected: false, side: apparelIdentityManifest.artworkSide, identitySource: null } } : {}),
          ...(hybridEligible ? { apparelProjection: hybridProjectionMetadata ?? { enabled: true, applied: false, fallbackReason: "projection_unavailable", version: "hybrid-apparel-projection-v1", artworkExtractionMode: "unavailable", garmentSurfaceConfidence: 0, warpMode: "unavailable", validationStatus: "not_applied" } } : {}),
          ...(apparelIdentityManifest ? { apparel_identity: {
            manifest: apparelIdentityManifest,
            artworkPresent: apparelIdentityManifest.artworkPresent,
            artworkRegion: apparelIdentityManifest.artworkBoundingRegion,
            artworkSide: apparelIdentityManifest.artworkSide,
            fidelityGate: apparelFidelityGate?.productFidelityReady ?? null,
            exactProductModeEnabled: apparelFidelityMode.exactProductApparel,
            productFidelityFirst: apparelFidelityMode.productFidelityFirst,
            fidelityMode: apparelFidelityMode.mode,
            generationMode: apparelFidelityMode.generationMode,
          } } : {}),
          ...(usesReferenceReplacement ? { referenceReplacement: {
            version: "reference-product-replacement-v1",
            enabled: true,
            baseScenePreserved: selectedValidation.status === "pass",
            productReplacementApplied: selectedValidation.status !== "validation_unavailable",
          } } : {}),
          ...(productProfile?.vertical === "jewelry" && usableReferenceImages.length > 0 ? { jewelryReferenceFidelity: {
            version: "jewelry-reference-fidelity-v2",
            sourceIdentityAuthority: true,
            referenceJewelryIgnored: true,
            jewelryIdentityStatus: selectedValidation.issues.some(({ category, severity }) => category === "product_identity" && severity === "critical") ? "critical_drift" : selectedValidation.issues.some(({ category, severity }) => category === "product_identity" && severity === "major") ? "major_drift" : selectedValidation.status === "validation_unavailable" ? "validation_unavailable" : "clear",
            detectedIssues: selectedValidation.issues.filter(({ code }) => code.toLowerCase().startsWith("jewelry_")).map(({ code }) => code).slice(0, 12),
            repairAttempted: jewelryReferenceRepair && repairAttempt !== null,
          } } : {}),
          fidelity: fidelityMetadata,
          fidelity_validation: {
            version: selectedValidation.version,
            status: selectedValidation.status,
            commerciallyUsable: selectedValidation.commerciallyUsable,
            criticalIssueCount: validationIssueCounts.critical,
            majorIssueCount: validationIssueCounts.major,
            minorIssueCount: validationIssueCounts.minor,
            retryRecommended: selectedValidation.retryRecommended,
            issueCodes: selectedValidation.issues.map(({ code }) => code).slice(0, 20),
            warnings: selectedValidation.issues.filter(({ severity }) => severity === "minor" || severity === "major" && selectedValidation.status !== "fail").map(({ code, finding }) => ({ code, finding })).slice(0, 20),
          },
          validation: {
            version: selectedValidation.version,
            status: selectedValidation.status,
            commerciallyUsable: selectedValidation.commerciallyUsable,
            criticalIssueCount: validationIssueCounts.critical,
            majorIssueCount: validationIssueCounts.major,
            minorIssueCount: validationIssueCounts.minor,
            warnings: selectedValidation.issues.filter(({ severity }) => severity === "minor" || severity === "major" && selectedValidation.status !== "fail").map(({ code, finding, confidence, likelyCause }) => ({ code, finding, confidence, likelyCause })).slice(0, 20),
            issueCodes: selectedValidation.issues.map(({ issueCode, code }) => issueCode ?? code).slice(0, 20),
          },
          auto_repair: repairMetadata,
          product_identity_lock: {
            version: PRODUCT_IDENTITY_LOCK_VERSION,
            vertical: identityManifest.vertical,
            identityAnchorCount: identityManifest.immutableAttributes.length + identityManifest.geometryAnchors.length + identityManifest.colorMaterialAnchors.length + identityManifest.brandingAnchors.length,
            imageOrderingVersion: "generation-image-order-v1",
            placementStrategy: "single_pass",
          },
          placement: {
            version: "single-pass-placement-v1",
            strategy: "single_pass",
          },
          ...(referenceMatch ? {
            reference_match: {
              version: REFERENCE_MATCH_VERSION,
              mode: referenceMatch.mode,
              compatible: referenceMatch.compatible,
              primaryReferenceAssetId: requestedReferenceAssetIds[0] ?? null,
              appliedAttributeCategories: [...new Set([
                referenceMatch.compositionAdjustments.length ? "composition" : "",
                referenceMatch.interactionAdjustments.length ? "interaction" : "",
                referenceMatch.styleAdjustments.length ? "style" : "",
              ].filter(Boolean))],
            },
          } : {}),
          prompt_enhancement: {
            enabled: enhancementEnabled,
            enhanced_prompt: promptEnhancement.enhancedPrompt,
            succeeded: promptEnhancement.succeeded,
            user_prompt: promptEnhancement.userPrompt,
          },
          ...(preset ? { preset: { ...createCreativePresetMetadata(preset, resolvedVariantId), ...(presetFamily ? { selectedPresetFamily: presetFamily.id, selectedPresentationMode, resolvedPresentationMode: resolvedPresetVariant?.presentationMode ?? null, presentationModeSource: selectedPresentationMode ? "user" : "automatic", presentationModeOverrideReason, referenceOverriddenFields, presetPreservedFields, resolvedSceneFamily: sceneSuitability?.selectedSceneFamily ?? null, sceneAuthoritySource: sceneSuitability?.source ?? null, humanPresence: resolvedPresetVariant?.humanPresence ?? null, interactionMode: resolvedPresetVariant?.interactionMode ?? null, presentationModeCategory: strictProductOnlyStudio ? "product_only" : resolvedPresetVariant?.humanPresence === "full" ? "on_model" : "lifestyle", referenceSceneSuppressedByPresentationMode: strictProductOnlyStudio && usableReferenceImages.length > 0, variationSource: "generation_seed", variationHistory } : {}) } } : {}),
          strategy: {
            effective_preservation_mode: effectivePreservationMode,
            reason: strategyResolution.reason,
            selected: finalPolicy.strategy,
          },
          ...(sceneSuitability ? { scene_suitability: {
            version: SCENE_SUITABILITY_VERSION,
            selectedSceneFamily: sceneSuitability.selectedSceneFamily,
            source: sceneSuitability.source,
          } } : {}),
          ...(composition ? { composition: {
            version: COMPOSITION_INTELLIGENCE_VERSION,
            framing: composition.framing,
            productDominance: composition.productDominance,
            source: composition.source,
          } } : {}),
          creative_compliance: {
            version: CREATIVE_DIRECTION_COMPLIANCE_VERSION,
            totalRequirements: creativeCompliance.requirements.length,
            appliedCount: creativeCompliance.applied.length,
            rejectedCount: creativeCompliance.rejected.length,
          },
          ...(productProfile ? { product_profile: {
            assetId: asset.id,
            schemaVersion: productProfile.schemaVersion,
            analysisVersion: productProfile.analysisVersion,
            vertical: productProfile.vertical,
            subcategory: productProfile.subcategory,
          } } : {}),
          product_images: {
            version: "multi-view-product-input-v1",
            asset_ids: orderedProductAssets.map(({ id }) => id),
            primary_asset_id: asset.id,
            supporting_asset_ids: orderedProductAssets.filter(({ id }) => id !== asset.id).map(({ id }) => id),
            requested_count: requestedProductIds.length,
            usable_count: usableProductImages.length,
            same_physical_product: true,
          },
          references: {
            mode: referenceMatchMode,
            requested_count: requestedReferenceAssetIds.length,
            usable_count: referenceAnalysis.usableCount,
            asset_ids: requestedReferenceAssetIds,
            referenceGuidance: {
              version: "reference-priority-v1",
              primaryReferenceId: requestedReferenceAssetIds[0] ?? null,
              supportingReferenceIds: requestedReferenceAssetIds.slice(1),
              primaryAuthority: ["scene", "composition", "pose", "camera", "framing"],
              supportingAuthority: ["lighting", "mood", "color", "styling", "atmosphere"],
              referenceOverriddenFields,
              presetPreservedFields,
            },
            analysis: {
              enabled: requestedReferenceAssetIds.length > 0,
              succeeded: referenceAnalysis.styleBrief !== null,
              model: requestedReferenceAssetIds.length > 0 ? getReferenceAnalysisModel() : null,
              version: REFERENCE_ANALYSIS_VERSION,
            },
            ...(referenceMatch ? {
              reference_match: {
                version: REFERENCE_MATCH_VERSION,
                mode: referenceMatch.mode,
                compatible: referenceMatch.compatible,
                primaryReferenceAssetId: requestedReferenceAssetIds[0] ?? null,
                appliedAttributeCategories: [...new Set([
                  referenceMatch.compositionAdjustments.length ? "composition" : "",
                  referenceMatch.interactionAdjustments.length ? "interaction" : "",
                  referenceMatch.styleAdjustments.length ? "style" : "",
                ].filter(Boolean))],
              },
            } : {}),
            ...(referenceAnalysis.styleBrief ? { style_brief: referenceAnalysis.styleBrief } : {}),
          },
        },
        processing_completed_at: processingCompletedAt.toISOString(),
        processing_duration_ms: processingCompletedAt.getTime() - processingStartedAt.getTime(),
        cost_usd: null,
        error_message: null,
      })
      .eq("id", queuedGeneration.id)
      .eq("status", "processing")
      .select("id")
      .maybeSingle();
    if (completionError || !completedGeneration) {
      postStorageError = completionError ?? new Error("Terminal generation update did not match a processing row.");
      console.error("[generation] terminal_persistence_failed", {
        generationId,
        outputStored,
        ...getSafeGenerationErrorDetails(postStorageError),
      });
      throw postStorageError;
    }
    terminalSuccessPersisted = true;
    console.info("[generation-post-storage] step_success", { generationId, step: postStorageStep });
    safeGenerationEvent("queue", "status_transition", { generationId, status: "succeeded" });

    postStorageStep = "create_notification";
    console.info("[generation-post-storage] step_start", { generationId, step: postStorageStep });
    try {
      const notificationCreated = await createNotification({ userId, type: "generation_completed", projectId: project.id, projectName: project.title, generationId: queuedGeneration.id });
      if (!notificationCreated) console.warn("[generation-post-storage] step_warning", { generationId, step: postStorageStep, reason: "notification_not_created" });
      else console.info("[generation-post-storage] step_success", { generationId, step: postStorageStep });
    } catch (error) {
      console.warn("[generation-post-storage] step_warning", { generationId, step: postStorageStep, ...getSafeGenerationErrorDetails(error) });
    }

    postStorageStep = "emit_success_events";
    console.info("[generation-post-storage] step_start", { generationId, step: postStorageStep });
    logDevelopmentGenerationEvent("succeeded", {
      effectivePreservationMode,
      fidelityStatus,
      generationId: queuedGeneration.id,
      requestedPreservationMode,
    });
    safeGenerationEvent("queue", "processor_exit", { generationId, status: "succeeded" });
    console.info("[generation-post-storage] step_success", { generationId, step: postStorageStep });

    return { ok: true };
  } catch (error) {
    if (terminalSuccessPersisted) {
      console.warn("[generation] post_storage_exception", {
        generationId,
        outputStored,
        terminalSuccessPersisted,
        step: postStorageStep,
        ...getSafeGenerationErrorDetails(error),
      });
      safeGenerationEvent("queue", "processor_exit", { generationId, status: "succeeded" });
      return { ok: true };
    }
    if (outputStored || postStorageError) {
      console.error("[generation] post_storage_exception", {
        generationId,
        outputStored,
        terminalSuccessPersisted,
        step: postStorageStep,
        ...getSafeGenerationErrorDetails(postStorageError ?? error),
      });
    }
    if (providerDiagnosticContext) {
      safeGenerationEvent("queue", "provider_error", { generationId, provider: providerDiagnosticContext.provider, model: providerDiagnosticContext.model });
      console.error("[generation] provider_error", getSafeProviderErrorDiagnostics(error, {
        generationId, ...providerDiagnosticContext,
      }));
    }
    logDevelopmentGenerationEvent("failed", { generationId });
    const terminalStatus = providerOutcomeAmbiguous ? "reconciliation_required" : "failed";
    safeGenerationEvent("queue", "processor_exit", { generationId, status: terminalStatus });
    const completedAt = new Date();
    const providerModerationBlocked = providerDiagnosticContext !== null && isProviderModerationBlocked(error);
    const failureCategory = providerModerationBlocked ? "provider_moderation_blocked" : providerOutcomeAmbiguous ? "provider_submission_ambiguous" : "generation_failed";
    const failureDiagnostics = providerDiagnosticContext
      ? getSafeProviderErrorDiagnostics(error, { generationId, ...providerDiagnosticContext })
      : null;
    const failureStageDurations = performance?.finish();
    const capturedImageEvents = costEvents.filter((event) => event.operation === "image_initial" || event.operation === "image_repair").length;
    if (capturedImageEvents < executionCounts.imageGenerationCalls) {
      costEvents.push(createUnknownOperationEvent({
        operation: executionCounts.repairCalls > 0 ? "image_repair" : "image_initial",
        provider: "openai",
        model: providerDiagnosticContext?.model ?? "unknown",
        phase: executionCounts.repairCalls > 0 ? "repair" : "initial",
        ambiguous: true,
      }));
    }
    const failureTelemetry = buildGenerationFailureTelemetry({
      executionCounts,
      inputProductImageCount,
      inputReferenceCount,
      stageDurations: failureStageDurations,
      events: costEvents,
    });
    const failureMetadata = providerDiagnosticContext
      ? mergeProviderFailureMetadata(persistedProviderMetadata, {
        category: failureCategory,
        code: failureDiagnostics?.code ?? null,
        status: failureDiagnostics?.status ?? null,
        providerDecision: providerModerationBlocked ? "moderation_blocked" : "provider_error",
        klayClassification: providerDiagnosticContext.klayClassification,
        providerFalsePositiveCandidate: providerModerationBlocked && providerDiagnosticContext.klayClassification === "adult_editorial_fashion",
      })
      : { ...(persistedProviderMetadata ?? {}) };
    const { data: failedGeneration, error: failurePersistenceError } = await admin.from("generations").update({
      status: terminalStatus,
      error_message: terminalFailureReason ?? failureCategory,
      provider_metadata: {
        ...failureMetadata,
        execution: failureTelemetry.execution,
        costTelemetry: failureTelemetry.costTelemetry,
        providerStatus: providerOutcomeAmbiguous ? "unknown" : "failed",
        ...(providerOutcomeAmbiguous ? { providerOutcome: "ambiguous" } : {}),
      },
      processing_completed_at: completedAt.toISOString(),
      ...(processingStartedAt ? { processing_duration_ms: completedAt.getTime() - processingStartedAt.getTime() } : {}),
    }).eq("id", generationId).in("status", ["queued", "processing"]).select("id, project_id").maybeSingle();
    if (failurePersistenceError) {
      safeGenerationEvent("queue", "failure_persist_error", { generationId });
    } else if (failedGeneration) {
      const { data: failedProject } = await admin.from("projects").select("user_id, title").eq("id", failedGeneration.project_id).maybeSingle();
      if (failedProject) {
        try {
          await createNotification({ userId: failedProject.user_id, type: "generation_failed", projectId: failedGeneration.project_id, projectName: failedProject.title, generationId });
        } catch (notificationError) {
          console.warn("[generation] failure_notification_failed", { generationId, reason: notificationError instanceof Error ? notificationError.name : "notification_error" });
        }
      }
      safeGenerationEvent("queue", "status_transition", { generationId, status: terminalStatus });
    }
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : "";
    const retryable = /network|timeout|temporar|rate limit|download|upload|database|fetch failed|econn|5\d\d/.test(errorMessage);
    return { ok: false, message: "generationFailed", retryable: providerModerationBlocked || providerOutcomeAmbiguous ? false : retryable, failureCategory: providerModerationBlocked ? "provider_moderation_blocked" : providerOutcomeAmbiguous ? "provider_submission_ambiguous" : retryable ? "transient_infrastructure" : "generation_failed" };
  }
}
