"use server";

import { readProductReferences } from "@/lib/video-generation/reference-context";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { canAccessVideoBeta } from "@/lib/video-generation/beta-policy";
import { validateVideoGenerationDraft } from "@/lib/video-generation/validation";
import { readOwnedPreparedVideoSource } from "@/lib/video-generation/source-context";
import { isVideoPresetId } from "@/lib/video-director/presets";
import { prepareVideoDirectorPlan } from "@/lib/video-director/runtime";
import { presetProduct } from "@/lib/video-director/preset-recommendations";
import { analyzeOwnedVideoProduct } from "@/lib/video-generation/video-product-analysis";
import { createVideoCorrelationId, logVideoDiagnostic } from "@/lib/video-generation/diagnostics";

export async function prepareVideoDirectorAction(draft: unknown, presetId: unknown, shotMode: unknown,
  existingReceipt?: string) {
  const ownerId = await getAuthenticatedUserId();
  const correlationId = createVideoCorrelationId();
  if (!ownerId || !canAccessVideoBeta(ownerId)) return { status: "unavailable" as const };
  const parsed = validateVideoGenerationDraft(draft);
  if (!parsed.ok || !parsed.value.source || !isVideoPresetId(presetId) || (shotMode !== "single" && shotMode !== "multi")
    || parsed.value.source.kind !== "uploaded-image" || parsed.value.cameraMovement === "orbit") return { status: "invalid" as const };
  try {
    const startedAt = Date.now();
    const context = await readOwnedPreparedVideoSource(ownerId, parsed.value.source, parsed.value.aspectRatio);
    logVideoDiagnostic(correlationId, "video_source_prepare", "success", { durationMs: Date.now() - startedAt });
    const referenceImages = await readProductReferences(ownerId, parsed.value);
    let profile = context.profile;
    let analysisStatus: "verified" | "not_analyzed" | "unsupported" | "quota_limited" | "budget_unavailable" | "configuration_error" | "provider_failed" | "pending" = profile ? "verified" : "not_analyzed";
    if (!profile) {
      const analysisStartedAt = Date.now();
      const analysis = await analyzeOwnedVideoProduct({ ownerId, sourceAssetId: parsed.value.source.sourceAssetId,
        sha256: context.sourceSha256, image: context.original, correlationId });
      profile = analysis.profile;
      analysisStatus = analysis.status === "supported" ? "verified" : analysis.status;
      logVideoDiagnostic(correlationId, "product_analysis_result", profile ? "success" : "failed", { status: analysis.status, durationMs: Date.now() - analysisStartedAt });
    } else {
      logVideoDiagnostic(correlationId, "product_analysis_result", "cache_hit", { status: "verified" });
    }
    const productContext = presetProduct(profile);
    const result = await prepareVideoDirectorPlan(ownerId, context.prepared, context.sourceSha256,
      { draft: parsed.value, presetId, shotMode, profile, referenceImages }, existingReceipt,
      analysisStatus === "verified" || analysisStatus === "unsupported", { correlationId,
        fallbackReason: analysisStatus === "quota_limited" || analysisStatus === "configuration_error" || analysisStatus === "provider_failed"
          ? analysisStatus : analysisStatus === "not_analyzed" || analysisStatus === "pending" ? "product_analysis_failed" : undefined });
    logVideoDiagnostic(correlationId, result.plan.origin === "ai" ? "director_result" : "director_fallback",
      result.plan.origin === "ai" ? "success" : "fallback", { analysisStatus });
    return { status: "success" as const, ...result, analysisStatus, productContext };
  } catch { return { status: "error" as const }; }
}
