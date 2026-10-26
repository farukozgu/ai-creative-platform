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

export async function quoteVideoGenerationAction(quality: "standard" | "pro", duration: 5 | 10) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId || !canAccessVideoBeta(ownerId)) return null;
  if (!["standard", "pro"].includes(quality) || ![5, 10].includes(duration)) return null;
  try { return await getVideoBetaQuote(quality, duration); } catch { return null; }
}

export async function submitVideoGenerationAction(draft: unknown, confirmedMaxCostUsd: number) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return { ok: false as const, code: "unauthorized" as const };
  if (!canAccessVideoBeta(ownerId)) return { ok: false as const, code: "feature_disabled" as const };
  const parsed = validateVideoGenerationDraft(draft);
  if (!parsed.ok) return { ok: false as const, code: "invalid_input" as const, field: parsed.field };
  try {
    const quote = await getVideoBetaQuote(parsed.value.quality, parsed.value.durationSeconds);
    if (!Number.isFinite(confirmedMaxCostUsd) || quote.estimatedMaxCostUsd > confirmedMaxCostUsd
      || !canSubmitVideoBeta(ownerId, parsed.value, quote.estimatedMaxCostUsd)) return { ok: false as const, code: "approval_required" as const };
    const capability = videoEndpointCapabilities[videoTierRouting[parsed.value.quality]];
    return await submitVideoGeneration(ownerId, parsed.value, {
      repository: new SupabaseVideoJobRepository(), provider: new FalVideoGenerationProvider(), billing: new VideoBetaBudget(),
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
  if (canAccessVideoBeta(ownerId)) {
    try { await reconcileVideoBeta(ownerId, jobId); } catch { /* Polling may resume after a transient read/storage failure. */ }
  }
  const job = await new SupabaseVideoJobRepository().findOwned(ownerId, jobId);
  return job ? { status: "success" as const, job: toVideoPresentationRecord(job) } : { status: "not_found" as const };
}

export async function listVideoGenerationsAction() {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return { status: "unauthorized" as const, records: [] };
  try {
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
