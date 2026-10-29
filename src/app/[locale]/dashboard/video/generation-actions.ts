"use server";

import type { VideoGenerationDraft } from "@/lib/video-generation/types";
import { videoEndpointCapabilities, videoTierRouting } from "@/lib/video-generation/capabilities";
import { readProductReferences } from "@/lib/video-generation/reference-context";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { createAuthorizedVideoPlaybackUrl, createVideoSourceUploadTicket, finalizeVideoSourceUpload } from "@/lib/video-generation/media-access";
import { toVideoPresentationRecord } from "@/lib/video-generation/presentation";
import { SupabaseVideoJobRepository } from "@/lib/video-generation/supabase-repository";
import { validateVideoGenerationDraft } from "@/lib/video-generation/validation";
import { canAccessVideoBeta, canSubmitVideoBeta, videoSubmissionPolicyChecks } from "@/lib/video-generation/beta-policy";
import { getVideoBetaQuote, VideoBetaBudget, reconcileVideoBeta } from "@/lib/video-generation/beta-runtime";
import { submitVideoGeneration } from "@/lib/video-generation/service";
import { FalVideoGenerationProvider } from "@/lib/video-generation/fal-provider";
import { SupabaseVideoSourceResolver } from "@/lib/video-generation/supabase-source-resolver";
import { prepareOwnedVideoSource } from "@/lib/video-generation/prepared-source";
import { matchesUsdQuoteConfirmation } from "@/lib/video-generation/money";
import { sealVideoQuote, verifyVideoQuote } from "@/lib/video-generation/quote-receipt";
import { shouldRestoreApprovedVideoJob } from "@/lib/video-generation/progress-phase";
import { compileProductVideoPrompt, isUnsafeProductMotion, mapRegionToFrame, VIDEO_PRESERVATION_VERSION } from "@/lib/video-generation/preservation";
import { videoDraftHash } from "@/lib/video-generation/request-identity";
import { readOwnedPreparedVideoSource } from "@/lib/video-generation/source-context";
import { getVideoFidelityAnalysisAvailability } from "@/lib/video-fidelity/availability";
import { quoteVideoFidelity } from "@/lib/video-fidelity/pricing";
import { resumeOwnedVideoReview, videoFidelitySchemaReady } from "@/lib/video-fidelity/reviews";
import { readVerifiedDirectorPlan } from "@/lib/video-director/runtime";
import { readDirectorProfileSnapshot } from "@/lib/video-director/receipt";
import { compileDirectorPlan } from "@/lib/video-director/core";
import { matchesVideoRequest } from "@/lib/video-generation/request-identity";
import { summarizeVideoPayload } from "@/lib/video-generation/payload-summary";
import { validateKlingMultiPrompt } from "@/lib/video-generation/fal-request";
import { createVideoCorrelationId, logVideoDiagnostic } from "@/lib/video-generation/diagnostics";

async function verifiedVideoSnapshot(ownerId: string, draft: VideoGenerationDraft) {
  if (!draft.source || !draft.shotMode || (draft.shotMode === "multi" && !draft.director)) throw new Error("A shot mode and verified plan are required.");
  const context = await readOwnedPreparedVideoSource(ownerId, draft.source, draft.aspectRatio);
  await readProductReferences(ownerId, draft);
  if (draft.productReferences?.length && !draft.director) throw new Error("Reference review requires Director.");
  // Authenticate the profile snapshot first; plan verification then binds it to
  // this owner, current source hash, model and full draft before it can be used.
  const profile = context.profile ?? (draft.director ? readDirectorProfileSnapshot(draft.director.receipt, process.env.SUPABASE_SECRET_KEY ?? "") : null);
  const input = draft.director ? { draft, profile, presetId: draft.director.presetId, shotMode: draft.director.shotMode } : null;
  if (input && input.shotMode !== draft.shotMode) throw new Error("Shot mode mismatch.");
  const plan = input ? readVerifiedDirectorPlan(ownerId, context.sourceSha256, input, draft.director?.receipt) : null;
  if (input && !plan) throw new Error("Director plan is invalid or expired.");
  const directed = input && plan ? compileDirectorPlan(plan, input) : null;
  if (draft.shotMode === "multi" && (!directed?.multiPrompt || !validateKlingMultiPrompt(directed.multiPrompt, draft.durationSeconds))) throw new Error("Invalid multi-shot plan.");
  const compiled = directed ?? compileProductVideoPrompt({ ...draft, profile: context.profile });
  const preservation = { version: VIDEO_PRESERVATION_VERSION, method: draft.method ?? "kling", draftHash: videoDraftHash(draft), sourceSha256: context.sourceSha256,
    geometry: context.geometry, criticalRegion: draft.criticalRegion ?? null, frameRegion: draft.criticalRegion ? mapRegionToFrame(draft.criticalRegion, context.geometry) : null,
    compiledPrompt: compiled.prompt, negativePrompt: compiled.negativePrompt, cfgScale: compiled.cfgScale, analysisConsent: draft.analysisConsent ?? null,
    ...(plan && directed ? { director: { plan, ...(directed.multiPrompt ? { multiPrompt: directed.multiPrompt } : {}) } } : {}) };
  const payload = summarizeVideoPayload(draft, preservation);
  return { preservation: { ...preservation, payloadSummary: payload.summary }, ...payload };
}

export async function quoteVideoGenerationAction(quality: "standard" | "pro", duration: 5 | 10, options?: { hasRegion: boolean }) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId || !canAccessVideoBeta(ownerId)) return null;
  if (!["standard", "pro"].includes(quality) || ![5, 10].includes(duration)) return null;
  try {
    const analysis = getVideoFidelityAnalysisAvailability(ownerId, Boolean(options?.hasRegion));
    const schemaReady = analysis.enabled && await videoFidelitySchemaReady();
    const price = await getVideoBetaQuote(quality, duration);
    return { ...price, hasRegion: Boolean(options?.hasRegion), analysis: { ...analysis, enabled: schemaReady && analysis.enabled } };
  } catch { return null; }
}

export async function quoteVideoSubmissionAction(draft: unknown) {
  type Reason = "not_allowlisted" | "invalid_draft" | "unsafe_motion" | "already_used" | "policy_denied" | "snapshot_unavailable" | "quote_unavailable" | "repository_unavailable";
  const correlationId = createVideoCorrelationId();
  const rejected = <T extends "unavailable" | "invalid" | "used">(status: T, reasonCode: Reason, condition?: string) => {
    logVideoDiagnostic(correlationId, "video_quote_submission", "rejected", { reasonCode, condition: condition ?? null });
    return { status, reasonCode };
  };
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId || !canAccessVideoBeta(ownerId)) return rejected("unavailable", "not_allowlisted");
  const parsed = validateVideoGenerationDraft(draft);
  if (!parsed.ok) return rejected("invalid", "invalid_draft");
  if (parsed.value.director ? parsed.value.cameraMovement === "orbit" : isUnsafeProductMotion(parsed.value.prompt, parsed.value.cameraMovement)) return rejected("invalid", "unsafe_motion");
  let failedStage: Reason = "repository_unavailable";
  try {
    const previous = await new SupabaseVideoJobRepository().findBySubmission(ownerId, parsed.value.clientSubmissionId);
    if (previous) return rejected("used", "already_used");
    failedStage = "quote_unavailable";
    const quote = await getVideoBetaQuote(parsed.value.quality, parsed.value.durationSeconds);
    const denied = Object.entries(videoSubmissionPolicyChecks(ownerId, parsed.value, quote.estimatedMaxCostUsd)).find(([, passed]) => !passed);
    if (denied) return rejected("unavailable", "policy_denied", denied[0]);
    failedStage = "snapshot_unavailable";
    const payload = await verifiedVideoSnapshot(ownerId, parsed.value);
    const signed = sealVideoQuote(ownerId, parsed.value, quote.estimatedMaxCostUsd, process.env.SUPABASE_SECRET_KEY ?? "", undefined, payload.snapshotHash);
    logVideoDiagnostic(parsed.value.clientSubmissionId, "video_quote_issued", "success", { costUsd: quote.estimatedMaxCostUsd, quality: parsed.value.quality, durationSeconds: parsed.value.durationSeconds });
    return { status: "success" as const, cost: quote.estimatedMaxCostUsd, preview: payload.preview, ...signed };
  } catch {
    return rejected("unavailable", failedStage);
  }
}

export async function submitVideoGenerationAction(draft: unknown, confirmedMaxCostUsd: number, quoteReceipt: string, explicitApproval?: boolean) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return { ok: false as const, code: "unauthorized" as const };
  if (!canAccessVideoBeta(ownerId)) return { ok: false as const, code: "feature_disabled" as const };
  const parsed = validateVideoGenerationDraft(draft);
  if (!parsed.ok) return { ok: false as const, code: "invalid_input" as const, field: parsed.field };
  try {
    const previous = await new SupabaseVideoJobRepository().findBySubmission(ownerId, parsed.value.clientSubmissionId);
    if (previous) return matchesVideoRequest(previous, parsed.value)
      ? { ok: true as const, jobId: previous.id, status: previous.status, duplicate: true }
      : { ok: false as const, code: "invalid_input" as const };
    if (explicitApproval !== true) return { ok: false as const, code: "approval_required" as const };
    if (parsed.value.director ? parsed.value.cameraMovement === "orbit" : isUnsafeProductMotion(parsed.value.prompt, parsed.value.cameraMovement)) return { ok: false as const, code: "unsafe_motion" as const };
    const analysisQuote = quoteVideoFidelity(Boolean(parsed.value.criticalRegion));
    if (parsed.value.analysisConsent && (!getVideoFidelityAnalysisAvailability(ownerId, Boolean(parsed.value.criticalRegion)).enabled || !await videoFidelitySchemaReady()
      || !analysisQuote || parsed.value.analysisConsent.model !== analysisQuote.model || parsed.value.analysisConsent.pricingVersion !== analysisQuote.pricingVersion
      || !matchesUsdQuoteConfirmation(parsed.value.analysisConsent.maximumCostUsd, analysisQuote.maximumEstimatedCostUsd))) return { ok: false as const, code: "approval_required" as const };
    let payload;
    try { payload = await verifiedVideoSnapshot(ownerId, parsed.value); }
    catch { return { ok: false as const, code: "approval_required" as const }; }
    const quote = await getVideoBetaQuote(parsed.value.quality, parsed.value.durationSeconds);
    if (!matchesUsdQuoteConfirmation(quote.estimatedMaxCostUsd, confirmedMaxCostUsd)
      || !verifyVideoQuote(quoteReceipt, ownerId, parsed.value, confirmedMaxCostUsd, process.env.SUPABASE_SECRET_KEY ?? "", undefined, payload.snapshotHash)
      || !canSubmitVideoBeta(ownerId, parsed.value, quote.estimatedMaxCostUsd)) return { ok: false as const, code: "approval_required" as const };
    const capability = videoEndpointCapabilities[videoTierRouting[parsed.value.quality]];
    logVideoDiagnostic(parsed.value.clientSubmissionId, "video_submission_approval", "success", { costUsd: quote.estimatedMaxCostUsd });
    return await submitVideoGeneration(ownerId, parsed.value, {
      repository: new SupabaseVideoJobRepository(), provider: new FalVideoGenerationProvider(), billing: new VideoBetaBudget(),
      preservation: payload.preservation,
      sourceResolver: new SupabaseVideoSourceResolver(true),
      capability: { ...capability, productionApproved: true, pricing: { basis: "per-second", audioOffUsdPerSecond: quote.rate, audioOnUsdPerSecond: quote.rate, voiceControlUsdPerSecond: null } },
    });
  } catch { return { ok: false as const, code: "billing_unavailable" as const }; }
}

export async function createVideoSourceUploadAction(fileName: string) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return { status: "unauthorized" as const };
  if (!canAccessVideoBeta(ownerId)) return { status: "unavailable" as const };
  if (typeof fileName !== "string" || fileName.length > 255 || !/\.(?:jpe?g|png|webp)$/i.test(fileName)) return { status: "invalid" as const };
  try {
    return { status: "success" as const, ...(await createVideoSourceUploadTicket(ownerId, fileName)) };
  } catch {
    return { status: "error" as const };
  }
}

export async function prepareVideoSourceAction(source: unknown, aspectRatio: unknown) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId || !canAccessVideoBeta(ownerId)) return { status: "unavailable" as const };
  if (typeof aspectRatio !== "string" || !["9:16", "16:9", "1:1"].includes(aspectRatio) || !source || typeof source !== "object" || !("kind" in source)) return { status: "invalid" as const };
  const origin = source.kind === "upload" && "sourceAssetId" in source && typeof source.sourceAssetId === "string" && "objectPath" in source && typeof source.objectPath === "string"
    ? { kind: "upload" as const, sourceAssetId: source.sourceAssetId, objectPath: source.objectPath }
    : source.kind === "generated-image" && "generationId" in source && typeof source.generationId === "string"
      ? { kind: "generated-image" as const, generationId: source.generationId } : null;
  if (!origin) return { status: "invalid" as const };
  try {
    return { status: "success" as const, ...await prepareOwnedVideoSource(ownerId, origin, aspectRatio as "9:16" | "16:9" | "1:1") };
  } catch { return { status: "error" as const }; }
}

export async function finalizeVideoSourceUploadAction(sourceAssetId: string, objectPath: string) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return { status: "unauthorized" as const };
  if (!canAccessVideoBeta(ownerId)) return { status: "unavailable" as const };
  try {
    const source = await finalizeVideoSourceUpload(ownerId, sourceAssetId, objectPath);
    return source ? { status: "success" as const, source } : { status: "invalid" as const };
  } catch {
    return { status: "error" as const };
  }
}

export async function readVideoGenerationStatusAction(jobId: string) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return { status: "unauthorized" as const };
  if (canAccessVideoBeta(ownerId)) {
    try { await reconcileVideoBeta(ownerId, jobId); } catch { /* Polling may resume after a transient read/storage failure. */ }
  }
  const job = await new SupabaseVideoJobRepository().findOwned(ownerId, jobId);
  return job ? { status: "success" as const, job: toVideoPresentationRecord(job) } : { status: "not_found" as const };
}

/** Only a previously persisted, explicit consent can start automatic paid analysis. */
export async function resumeVideoFidelityReviewAction(jobId: string) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId || !canAccessVideoBeta(ownerId)) return;
  const job = await new SupabaseVideoJobRepository().findOwned(ownerId, jobId);
  if (!job?.preservation?.analysisConsent) return;
  try { await resumeOwnedVideoReview(ownerId, jobId); } catch { /* Analysis failure never changes the video job. */ }
}

/** Read an owned submission, including terminal/uncertain jobs; never create or resubmit. */
export async function restoreVideoGenerationBySubmissionAction(submissionId: string) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId || !canAccessVideoBeta(ownerId) || typeof submissionId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId)) return { status: "unavailable" as const };
  try {
    const repository = new SupabaseVideoJobRepository();
    const existing = await repository.findBySubmission(ownerId, submissionId);
    if (!existing) return { status: "none" as const };
    try { await reconcileVideoBeta(ownerId, existing.id); } catch { /* Preserve stored state and let ordinary polling resume. */ }
    const current = await repository.findOwned(ownerId, existing.id);
    if (!current) return { status: "unavailable" as const };
    return { status: "success" as const, job: toVideoPresentationRecord(current) };
  } catch { return { status: "unavailable" as const }; }
}

/** Recover legacy or other-tab pending jobs without requiring a preconfigured UUID. */
export async function restoreLatestVideoGenerationAction() {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId || !canAccessVideoBeta(ownerId)) return { status: "unavailable" as const };
  try {
    const repository = new SupabaseVideoJobRepository();
    const existing = (await repository.listOwned(ownerId)).find(shouldRestoreApprovedVideoJob);
    if (!existing) return { status: "none" as const };
    try { await reconcileVideoBeta(ownerId, existing.id); } catch { /* Polling can resume later. */ }
    const current = await repository.findOwned(ownerId, existing.id);
    return current ? { status: "success" as const, submissionId: current.clientSubmissionId, job: toVideoPresentationRecord(current) } : { status: "unavailable" as const };
  } catch { return { status: "unavailable" as const }; }
}

export async function listVideoGenerationsAction() {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return { status: "unauthorized" as const, records: [] };
  try {
    if (canAccessVideoBeta(ownerId)) {
      try { await reconcileVideoBeta(ownerId, null, 5); } catch { /* Existing library records remain readable while reconciliation recovers. */ }
    }
    const jobs = await new SupabaseVideoJobRepository().listOwned(ownerId);
    return { status: "success" as const, records: jobs.map((job) => toVideoPresentationRecord(job)) };
  } catch {
    return { status: "error" as const, records: [] };
  }
}

export async function readVideoGenerationAction(jobId: string) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return null;
  const job = await new SupabaseVideoJobRepository().findOwned(ownerId, jobId);
  if (!job) return null;
  const playbackUrl = job.status === "succeeded" ? await createAuthorizedVideoPlaybackUrl(ownerId, job.id) : null;
  return toVideoPresentationRecord(job, playbackUrl);
}

export async function getVideoPlaybackAccessAction(jobId: string, download = false) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return { status: "unauthorized" as const };
  const url = await createAuthorizedVideoPlaybackUrl(ownerId, jobId, download);
  return url ? { status: "success" as const, url, expiresInSeconds: 300 } : { status: "not_found" as const };
}

export async function reuseVideoGenerationSettingsAction(jobId: string) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return null;
  const job = await new SupabaseVideoJobRepository().findOwned(ownerId, jobId);
  if (!job) return null;
  return {
    mode: "image", prompt: job.prompt, quality: job.quality === "pro" ? "pro" : "standard", aspectRatio: job.aspectRatio,
    durationSeconds: job.durationSeconds, cameraMovement: job.cameraMovement,
    source: job.sourceKind && job.sourceId
      ? job.sourceKind === "generated-image" ? { kind: "generated-image" as const, generationId: job.sourceId } : { kind: "uploaded-image" as const, sourceAssetId: job.sourceId }
      : null,
  } satisfies Omit<VideoGenerationDraft, "clientSubmissionId">;
}
