import {
  PRODUCT_PROFILE_ANALYSIS_VERSION,
  PRODUCT_PROFILE_SCHEMA_VERSION,
  isProductProfile,
  type ProductProfile,
} from "@/lib/product-understanding/product-profile";
import { logVideoDiagnostic, safeOpenAIStatus } from "./diagnostics";

export type VideoProductAnalysisStatus = "supported" | "unsupported" | "quota_limited" | "budget_unavailable" | "configuration_error" | "provider_failed" | "pending";
export type VideoProductAnalysisResult = {
  status: VideoProductAnalysisStatus;
  profile: ProductProfile | null;
  inferredCategory?: string | null;
};

export type VideoProductAnalysisClaim =
  | { kind: "claimed"; id: string; leaseToken: string }
  | { kind: "supported"; profile: unknown }
  | { kind: "unsupported"; inferredCategory: string | null }
  | { kind: "pending" }
  | { kind: "retry_wait"; failureCode: string | null };

export type VideoProductAnalysisStore = {
  claim(input: { ownerId: string; sourceAssetId: string; sha256: string; model: string; analysisVersion: string; schemaVersion: number; leaseToken: string }): Promise<VideoProductAnalysisClaim>;
  complete(input: { ownerId: string; id: string; leaseToken: string; status: "supported" | "unsupported" | "failed_transient"; profile: ProductProfile | null; inferredCategory: string | null; failureCode: string | null; retryAfter: string | null }): Promise<boolean>;
};

export type VideoProductAnalyzer = (input: { sourceAssetId: string; model: string; image: Buffer }) => Promise<unknown>;

function validatedProfile(value: unknown, sourceAssetId: string, model: string): ProductProfile | null {
  if (!isProductProfile(value) || value.analysisVersion !== PRODUCT_PROFILE_ANALYSIS_VERSION
    || value.schemaVersion !== PRODUCT_PROFILE_SCHEMA_VERSION) return null;
  return { ...value, productId: sourceAssetId, source: { ...value.source, model,
    analysisVersion: PRODUCT_PROFILE_ANALYSIS_VERSION, analyzedAt: new Date().toISOString() } };
}

/** Hash/version keyed, durable cache with an atomic database lease around provider I/O. */
export async function analyzeVideoProductSource(input: {
  ownerId: string;
  sourceAssetId: string;
  sha256: string;
  model: string;
  image: Buffer;
}, dependencies: { store: VideoProductAnalysisStore; analyze: VideoProductAnalyzer; makeLeaseToken(): string; now(): number; correlationId?: string }) : Promise<VideoProductAnalysisResult> {
  const startedAt = dependencies.now();
  const log = (stage: string, result: "success" | "failed" | "skipped" | "cache_hit" | "fallback", fields: Record<string, string | number | null | undefined> = {}) => {
    if (dependencies.correlationId) logVideoDiagnostic(dependencies.correlationId, stage, result, { model: input.model, durationMs: dependencies.now() - startedAt, ...fields });
  };
  log("analysis_start", "success");
  const leaseToken = dependencies.makeLeaseToken();
  let claim: VideoProductAnalysisClaim;
  try {
    log("product_analysis_cache_lookup", "success");
    claim = await dependencies.store.claim({ ...input, analysisVersion: PRODUCT_PROFILE_ANALYSIS_VERSION,
      schemaVersion: PRODUCT_PROFILE_SCHEMA_VERSION, leaseToken });
  } catch (error) {
    const diagnostic = safeOpenAIStatus(error);
    log("product_analysis_claim", "failed", diagnostic);
    throw error;
  }
  if (claim.kind === "supported") {
    const profile = validatedProfile(claim.profile, input.sourceAssetId, input.model);
    log("product_analysis_cache_hit", profile ? "cache_hit" : "failed", { code: profile ? null : "invalid_cached_profile" });
    return profile ? { status: "supported", profile } : { status: "provider_failed", profile: null };
  }
  if (claim.kind === "unsupported") { log("product_analysis_cache_hit", "cache_hit", { code: "unsupported" }); return { status: "unsupported", profile: null, inferredCategory: claim.inferredCategory }; }
  if (claim.kind === "pending") { log("product_analysis_cache_wait", "skipped"); return { status: "pending", profile: null }; }
  if (claim.kind === "retry_wait") return {
    status: claim.failureCode === "quota_limited" || claim.failureCode === "budget_unavailable" || claim.failureCode === "configuration_error"
      ? claim.failureCode : "provider_failed",
    profile: null,
  };

  log("product_analysis_cache_miss", "success");
  log("product_analysis_claim", "success");

  try {
    log("product_analysis_provider_request_start", "success");
    const response = await dependencies.analyze({ sourceAssetId: input.sourceAssetId, model: input.model, image: input.image });
    log("product_analysis_provider_response", "success");
    const envelope = response && typeof response === "object" ? response as { output?: unknown; errorPaths?: unknown[] } : null;
    const output = envelope?.output;
    if (output && typeof output === "object" && "status" in output && (output as { status?: unknown }).status === "unsupported") {
      const inferred = (output as { inferredCategory?: unknown }).inferredCategory;
      const inferredCategory = typeof inferred === "string" ? inferred : null;
      const saved = await dependencies.store.complete({ ownerId: input.ownerId, id: claim.id, leaseToken, status: "unsupported",
        profile: null, inferredCategory, failureCode: null, retryAfter: null });
      log("product_analysis_finalize", saved ? "success" : "failed", { code: saved ? null : "cache_finalize_failed" });
      log("product_analysis_result", saved ? "success" : "failed", { code: "unsupported" });
      return { status: "unsupported", profile: null, inferredCategory };
    }
    const profile = validatedProfile(output, input.sourceAssetId, input.model);
    if (!profile) {
      const saved = await dependencies.store.complete({ ownerId: input.ownerId, id: claim.id, leaseToken, status: "failed_transient",
        profile: null, inferredCategory: null, failureCode: "schema_validation_failed", retryAfter: new Date(dependencies.now() + 6 * 60 * 60 * 1000).toISOString() });
      log("product_analysis_validation", "failed", { code: "schema_validation_failed" });
      log("product_analysis_finalize", saved ? "success" : "failed", { code: saved ? null : "cache_finalize_failed" });
      return { status: "provider_failed", profile: null };
    }
    log("product_analysis_validation", "success");
    const saved = await dependencies.store.complete({ ownerId: input.ownerId, id: claim.id, leaseToken, status: "supported",
      profile, inferredCategory: null, failureCode: null, retryAfter: null });
    log("product_analysis_finalize", saved ? "success" : "failed", { code: saved ? null : "cache_finalize_failed" });
    log("product_analysis_result", saved ? "success" : "failed", { code: saved ? null : "cache_finalize_failed" });
    return saved ? { status: "supported", profile } : { status: "provider_failed", profile: null };
  } catch (error) {
    const failure = classifyAnalysisFailure(error);
    const retryMs = failure === "quota_limited" ? 10 * 60 * 1000
      : failure === "budget_unavailable" ? 15 * 60 * 1000 : 6 * 60 * 60 * 1000;
    const saved = await dependencies.store.complete({ ownerId: input.ownerId, id: claim.id, leaseToken, status: "failed_transient",
      profile: null, inferredCategory: null, failureCode: failure,
      retryAfter: new Date(dependencies.now() + retryMs).toISOString() });
    const diagnostic = safeOpenAIStatus(error);
    log("product_analysis_provider_response", "failed", { code: failure, httpStatus: diagnostic.status, providerCode: diagnostic.code });
    log("product_analysis_finalize", saved ? "success" : "failed", { code: saved ? failure : "cache_finalize_failed" });
    log("product_analysis_result", "failed", { code: failure });
    return { status: failure, profile: null };
  }
}

function classifyAnalysisFailure(error: unknown): "quota_limited" | "budget_unavailable" | "configuration_error" | "provider_failed" {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const value = current as { name?: unknown; code?: unknown; budgetFailure?: unknown; cause?: unknown };
    if (value.budgetFailure === "configuration_error" || value.name === "OpenAIBetaAccessError") return "configuration_error";
    if (value.budgetFailure === "budget_unavailable") return "budget_unavailable";
    if (value.budgetFailure === "quota_limited" || value.code === "insufficient_quota") return "quota_limited";
    current = value.cause;
  }
  return "provider_failed";
}
