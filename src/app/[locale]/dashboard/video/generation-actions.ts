"use server";

import type { VideoGenerationDraft } from "@/lib/video-generation/types";
import { isVideoGenerationAvailable, isVideoGenerationFeatureEnabled, resolveVideoRoute } from "@/lib/video-generation/capabilities";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { createAuthorizedVideoPlaybackUrl, createVideoSourceUploadTicket, finalizeVideoSourceUpload } from "@/lib/video-generation/media-access";
import { toVideoPresentationRecord } from "@/lib/video-generation/presentation";
import { SupabaseVideoJobRepository } from "@/lib/video-generation/supabase-repository";
import { validateVideoGenerationDraft } from "@/lib/video-generation/validation";
import { canUseVideoTier } from "@/lib/credit-economy/entitlements";
import { getActiveSubscription } from "@/lib/credit-economy/subscription-repository";

export async function submitVideoGenerationAction(draft: unknown) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return { ok: false as const, code: "unauthorized" as const };
  if (!isVideoGenerationFeatureEnabled()) return { ok: false as const, code: "feature_disabled" as const };
  const parsed = validateVideoGenerationDraft(draft);
  if (!parsed.ok) return { ok: false as const, code: "invalid_input" as const, field: parsed.field };
  const subscription = await getActiveSubscription(ownerId);
  if (!canUseVideoTier(subscription, parsed.value.quality)) return { ok: false as const, code: "entitlement_required" as const };
  const route = resolveVideoRoute(parsed.value.mode, parsed.value.quality);
  if (!route.ok) return { ok: false as const, code: "routing_unapproved" as const };
  // Unreachable while the capability registry remains unapproved. Real activation must
  // wire the approved billing policy and audited reconciliation scheduler first.
  return { ok: false as const, code: "billing_unavailable" as const };
}

export async function createVideoSourceUploadAction(fileName: string) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return { status: "unauthorized" as const };
  if (!isVideoGenerationAvailable()) return { status: "unavailable" as const };
  if (typeof fileName !== "string" || fileName.length > 255 || !/\.(?:jpe?g|png)$/i.test(fileName)) return { status: "invalid" as const };
  try {
    return { status: "success" as const, ...(await createVideoSourceUploadTicket(ownerId, fileName)) };
  } catch {
    return { status: "error" as const };
  }
}

export async function finalizeVideoSourceUploadAction(sourceAssetId: string, objectPath: string) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return { status: "unauthorized" as const };
  if (!isVideoGenerationAvailable()) return { status: "unavailable" as const };
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
  const job = await new SupabaseVideoJobRepository().findOwned(ownerId, jobId);
  return job ? { status: "success" as const, job: toVideoPresentationRecord(job) } : { status: "not_found" as const };
}

export async function listVideoGenerationsAction() {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return { status: "unauthorized" as const, records: [] };
  try {
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
