"use server";

import type { VideoGenerationDraft } from "@/lib/video-generation/types";
import { videoEndpointCapabilities, videoTierRouting } from "@/lib/video-generation/capabilities";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { createAuthorizedVideoPlaybackUrl, createVideoSourceUploadTicket, finalizeVideoSourceUpload } from "@/lib/video-generation/media-access";
import { toVideoPresentationRecord } from "@/lib/video-generation/presentation";
import { SupabaseVideoJobRepository } from "@/lib/video-generation/supabase-repository";
import { validateVideoGenerationDraft } from "@/lib/video-generation/validation";
import { canAccessVideoBeta, canSubmitVideoBeta } from "@/lib/video-generation/beta-policy";
import { getVideoBetaQuote, VideoBetaBudget, reconcileVideoBeta } from "@/lib/video-generation/beta-runtime";
import { submitVideoGeneration } from "@/lib/video-generation/service";
import { FalVideoGenerationProvider } from "@/lib/video-generation/fal-provider";
import { SupabaseVideoSourceResolver } from "@/lib/video-generation/supabase-source-resolver";
import { prepareOwnedVideoSource } from "@/lib/video-generation/prepared-source";
import { matchesUsdQuoteConfirmation } from "@/lib/video-generation/money";
import { shouldRestoreApprovedVideoJob } from "@/lib/video-generation/progress-phase";
import { compileProductVideoPrompt, isUnsafeProductMotion, mapRegionToFrame, VIDEO_PRESERVATION_VERSION, type VideoGenerationMethod } from "@/lib/video-generation/preservation";
import { videoDraftHash } from "@/lib/video-generation/request-identity";
import { readOwnedPreparedVideoSource } from "@/lib/video-generation/source-context";
import { submitSourceMotion, expireOwnedSourceMotion } from "@/lib/video-generation/local-runtime";
import { getVideoFidelityAnalysisAvailability } from "@/lib/video-fidelity/availability";
import { quoteVideoFidelity } from "@/lib/video-fidelity/pricing";
import { resumeOwnedVideoReview, videoFidelitySchemaReady } from "@/lib/video-fidelity/reviews";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "node:crypto";

/** Probe only the local-render RPC; a random absent job ID never starts a render. */
async function sourceMotionSchemaReady(ownerId: string) {
  try {
    const result = await getSupabaseAdminClient().rpc("claim_source_motion_render", { p_owner: ownerId, p_job: randomUUID() });
    return !result.error && result.data === false;
  } catch { return false; }
}

export async function quoteVideoGenerationAction(quality: "standard" | "pro", duration: 5 | 10, options?: { method: VideoGenerationMethod; hasRegion: boolean }) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId || !canAccessVideoBeta(ownerId)) return null;
  if (!["standard", "pro"].includes(quality) || ![5, 10].includes(duration)) return null;
  try {
    const method = options?.method ?? "kling";
    if (method !== "source-motion" && method !== "kling") return null;
    const analysis = getVideoFidelityAnalysisAvailability(ownerId, Boolean(options?.hasRegion));
    const schemaReady = method === "source-motion"
      ? process.env.VIDEO_SOURCE_MOTION_ENABLED === "true" && await sourceMotionSchemaReady(ownerId)
      : analysis.enabled && await videoFidelitySchemaReady();
    if (method === "source-motion" && !schemaReady) return null;
    const price = method === "kling" ? await getVideoBetaQuote(quality, duration) : { quality, duration, estimatedMaxCostUsd: 0 };
    return { ...price, method, hasRegion: Boolean(options?.hasRegion), analysis: { ...analysis, enabled: method === "kling" && schemaReady && analysis.enabled } };
  } catch { return null; }
}

export async function submitVideoGenerationAction(draft: unknown, confirmedMaxCostUsd: number) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return { ok: false as const, code: "unauthorized" as const };
  if (!canAccessVideoBeta(ownerId)) return { ok: false as const, code: "feature_disabled" as const };
  const parsed = validateVideoGenerationDraft(draft);
  if (!parsed.ok) return { ok: false as const, code: "invalid_input" as const, field: parsed.field };
  try {
    if (parsed.value.method === "source-motion" && parsed.value.clientSubmissionId === process.env.VIDEO_BETA_APPROVED_SUBMISSION_ID) return { ok: false as const, code: "approval_required" as const };
    if (parsed.value.method === "source-motion" && (process.env.VIDEO_SOURCE_MOTION_ENABLED !== "true" || confirmedMaxCostUsd !== 0 || !await sourceMotionSchemaReady(ownerId))) return { ok: false as const, code: "feature_disabled" as const };
    if (parsed.value.method !== "source-motion" && isUnsafeProductMotion(parsed.value.prompt, parsed.value.cameraMovement)) return { ok: false as const, code: "unsafe_motion" as const };
    const analysisQuote = quoteVideoFidelity(Boolean(parsed.value.criticalRegion));
    if (parsed.value.analysisConsent && (!getVideoFidelityAnalysisAvailability(ownerId, Boolean(parsed.value.criticalRegion)).enabled || !await videoFidelitySchemaReady()
      || !analysisQuote || parsed.value.analysisConsent.model !== analysisQuote.model || parsed.value.analysisConsent.pricingVersion !== analysisQuote.pricingVersion
      || !matchesUsdQuoteConfirmation(parsed.value.analysisConsent.maximumCostUsd, analysisQuote.maximumEstimatedCostUsd))) return { ok: false as const, code: "approval_required" as const };
    if (!parsed.value.source) return { ok: false as const, code: "source_unavailable" as const };
    const context = await readOwnedPreparedVideoSource(ownerId, parsed.value.source, parsed.value.aspectRatio);
    const compiled = parsed.value.method === "source-motion" ? { prompt: parsed.value.prompt, negativePrompt: "", cfgScale: 0.5 }
      : compileProductVideoPrompt({ ...parsed.value, profile: context.profile });
    const preservation = { version: VIDEO_PRESERVATION_VERSION, method: parsed.value.method ?? "kling", draftHash: videoDraftHash(parsed.value), sourceSha256: context.sourceSha256,
      geometry: context.geometry, criticalRegion: parsed.value.criticalRegion ?? null, frameRegion: parsed.value.criticalRegion ? mapRegionToFrame(parsed.value.criticalRegion, context.geometry) : null,
      compiledPrompt: compiled.prompt, negativePrompt: compiled.negativePrompt, cfgScale: compiled.cfgScale, analysisConsent: parsed.value.analysisConsent ?? null };
    if (parsed.value.method === "source-motion") return submitSourceMotion(ownerId, parsed.value, preservation, context.prepared);
    const quote = await getVideoBetaQuote(parsed.value.quality, parsed.value.durationSeconds);
    if (!matchesUsdQuoteConfirmation(quote.estimatedMaxCostUsd, confirmedMaxCostUsd)
      || !canSubmitVideoBeta(ownerId, parsed.value, quote.estimatedMaxCostUsd)) return { ok: false as const, code: "approval_required" as const };
    const capability = videoEndpointCapabilities[videoTierRouting[parsed.value.quality]];
    return await submitVideoGeneration(ownerId, parsed.value, {
      repository: new SupabaseVideoJobRepository(), provider: new FalVideoGenerationProvider(), billing: new VideoBetaBudget(),
      preservation,
      sourceResolver: new SupabaseVideoSourceResolver(true),
      capability: { ...capability, productionApproved: true, pricing: { basis: "per-second", audioOffUsdPerSecond: quote.rate, audioOnUsdPerSecond: quote.rate, voiceControlUsdPerSecond: null } },
    });
  } catch { return { ok: false as const, code: "billing_unavailable" as const }; }
}

export async function createVideoSourceUploadAction(fileName: string) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return { status: "unauthorized" as const };
  if (!canAccessVideoBeta(ownerId)) return { status: "unavailable" as const };
  if (typeof fileName !== "string" || fileName.length > 255 || !/\.(?:jpe?g|png)$/i.test(fileName)) return { status: "invalid" as const };
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
  await expireOwnedSourceMotion(ownerId);
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

export async function restoreSourceMotionAction(submissionId: string) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId || !canAccessVideoBeta(ownerId) || !/^[0-9a-f-]{36}$/i.test(submissionId)) return null;
  await expireOwnedSourceMotion(ownerId);
  const job = await new SupabaseVideoJobRepository().findBySubmission(ownerId, submissionId);
  return job?.provider === "local" ? toVideoPresentationRecord(job) : null;
}

/** Restore only the server-approved beta submission; never create or resubmit a job. */
export async function restoreApprovedVideoGenerationAction() {
  const ownerId = await getAuthenticatedUserId();
  const submissionId = process.env.VIDEO_BETA_APPROVED_SUBMISSION_ID;
  if (!ownerId || !canAccessVideoBeta(ownerId) || !submissionId) return { status: "unavailable" as const };
  try {
    const repository = new SupabaseVideoJobRepository();
    const existing = (await repository.listOwned(ownerId)).find(job => job.clientSubmissionId === submissionId);
    if (!existing) return { status: "none" as const };
    try { await reconcileVideoBeta(ownerId, existing.id); } catch { /* Preserve stored state and let ordinary polling resume. */ }
    const current = await repository.findOwned(ownerId, existing.id);
    if (!current) return { status: "unavailable" as const };
    return shouldRestoreApprovedVideoJob(current) ? { status: "success" as const, job: toVideoPresentationRecord(current) } : { status: "used" as const };
  } catch { return { status: "unavailable" as const }; }
}

export async function listVideoGenerationsAction() {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return { status: "unauthorized" as const, records: [] };
  try {
    await expireOwnedSourceMotion(ownerId);
    if (canAccessVideoBeta(ownerId)) await reconcileVideoBeta(ownerId, null, 5);
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
