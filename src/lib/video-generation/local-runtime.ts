import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { SupabaseVideoJobRepository } from "./supabase-repository";
import { matchesVideoRequest } from "./request-identity";
import { isSourceMotionPreset, renderSourceMotion, SOURCE_MOTION_VERSION } from "./source-motion";
import type { VideoGenerationDraft, VideoPreservationSnapshot } from "./types";

export async function submitSourceMotion(ownerId: string, draft: VideoGenerationDraft, snapshot: VideoPreservationSnapshot, bytes: Buffer) {
  if (!draft.source || draft.method !== "source-motion" || !isSourceMotionPreset(draft.cameraMovement) || draft.analysisConsent) return { ok: false as const, code: "invalid_input" as const };
  const repository = new SupabaseVideoJobRepository();
  const previous = await repository.findBySubmission(ownerId, draft.clientSubmissionId);
  if (previous) return matchesVideoRequest(previous, draft) ? { ok: true as const, jobId: previous.id, status: previous.status, duplicate: true } : { ok: false as const, code: "invalid_input" as const };
  const created = await repository.createOrGet({ ownerId, clientSubmissionId: draft.clientSubmissionId, mode: "image", prompt: draft.prompt || SOURCE_MOTION_VERSION,
    quality: "standard", aspectRatio: draft.aspectRatio, durationSeconds: draft.durationSeconds, cameraMovement: draft.cameraMovement,
    sourceKind: draft.source.kind, sourceId: draft.source.kind === "uploaded-image" ? draft.source.sourceAssetId : draft.source.generationId,
    provider: "local", modelId: SOURCE_MOTION_VERSION, endpointId: "local/source-motion", providerRequestId: null, status: "queued", errorCode: null,
    outputBucketId: null, outputObjectPath: null, outputMimeType: null, outputSizeBytes: null, estimatedProviderCostUsd: 0, actualProviderCostUsd: 0,
    billingReservationId: null, billingStatus: "not_configured", preservation: snapshot });
  if (!created.created) return matchesVideoRequest(created.job, draft) ? { ok: true as const, jobId: created.job.id, status: created.job.status, duplicate: true } : { ok: false as const, code: "invalid_input" as const };
  const jobId = created.job.id;
  try {
    const admin = getSupabaseAdminClient();
    const claimed = await admin.rpc("claim_source_motion_render", { p_owner: ownerId, p_job: jobId });
    if (claimed.error || claimed.data !== true) throw new Error("Local rendering capacity unavailable.");
    const mp4 = await renderSourceMotion({ source: bytes, aspectRatio: draft.aspectRatio, durationSeconds: draft.durationSeconds, preset: draft.cameraMovement });
    const objectPath = `${ownerId}/${jobId}/output.mp4`;
    const upload = await admin.storage.from("generated-videos").upload(objectPath, mp4, { contentType: "video/mp4", upsert: false });
    if (upload.error) {
      const recovered = await admin.storage.from("generated-videos").download(objectPath);
      if (recovered.error || !recovered.data || !Buffer.from(await recovered.data.arrayBuffer()).equals(mp4)) throw new Error("Output storage unavailable.");
    }
    const saved = await repository.transition(jobId, ["processing"], { status: "succeeded", outputBucketId: "generated-videos", outputObjectPath: objectPath, outputMimeType: "video/mp4", outputSizeBytes: mp4.length });
    if (!saved) throw new Error("Output checkpoint unavailable.");
    return { ok: true as const, jobId, status: "succeeded" as const, duplicate: false };
  } catch {
    await repository.transition(jobId, ["queued", "processing"], { status: "failed", errorCode: "output_persistence_failure" }).catch(() => null);
    return { ok: false as const, code: "persistence_failure" as const };
  }
}

export async function expireOwnedSourceMotion(ownerId: string) {
  if (process.env.VIDEO_SOURCE_MOTION_ENABLED !== "true") return;
  const admin = getSupabaseAdminClient();
  // A lost process is terminal, never automatically rerendered. FAL jobs are excluded.
  await admin.from("generations").update({ status: "failed", error_code: "retry_limit_reached" }).eq("owner_id", ownerId).eq("generation_type", "video").eq("provider", "local")
    .in("status", ["queued", "processing"]).lt("created_at", new Date(Date.now() - 120_000).toISOString());
}
