import { estimateVerifiedProviderCost, isVideoGenerationFeatureEnabled, type VideoEndpointCapability, type VideoGenerationEnvironment } from "@/lib/video-generation/capabilities";
import type { VideoBillingPolicy } from "@/lib/video-generation/billing";
import { recordVideoTelemetry } from "@/lib/video-generation/telemetry";
import type { VideoGenerationDraft, VideoGenerationProvider, VideoJobRecord, VideoJobRepository } from "@/lib/video-generation/types";
import { validateDraftAgainstCapability, validateVideoGenerationDraft } from "@/lib/video-generation/validation";
import type { VideoSourceResolver } from "@/lib/video-generation/source";
import { isSourceUrlFresh, sourceMatchesRequestedRatio } from "@/lib/video-generation/source";

export type SubmitVideoResult =
  | { ok: true; jobId: string; status: VideoJobRecord["status"]; duplicate: boolean }
  | { ok: false; code: "feature_disabled" | "invalid_input" | "unsupported_configuration" | "source_unavailable" | "billing_unavailable" | "persistence_failure" | "provider_submission_ambiguous"; message: string };

export type SubmitVideoDependencies = {
  repository: VideoJobRepository;
  provider: VideoGenerationProvider;
  billing: VideoBillingPolicy;
  sourceResolver: VideoSourceResolver;
  capability: VideoEndpointCapability;
  env?: VideoGenerationEnvironment;
};

function sourceColumns(draft: VideoGenerationDraft) {
  if (!draft.source) return { sourceKind: null, sourceId: null };
  return draft.source.kind === "generated-image"
    ? { sourceKind: draft.source.kind, sourceId: draft.source.generationId }
    : { sourceKind: draft.source.kind, sourceId: draft.source.sourceAssetId };
}

export async function submitVideoGeneration(ownerId: string, unknownDraft: unknown, dependencies: SubmitVideoDependencies): Promise<SubmitVideoResult> {
  if (!isVideoGenerationFeatureEnabled(dependencies.env)) return { ok: false, code: "feature_disabled", message: "Video generation is not enabled." };
  const parsed = validateVideoGenerationDraft(unknownDraft);
  if (!parsed.ok) return { ok: false, code: "invalid_input", message: parsed.message };
  const draft = parsed.value;
  if (!dependencies.capability.productionApproved) return { ok: false, code: "unsupported_configuration", message: "The selected video route has not been approved." };
  const supported = validateDraftAgainstCapability(draft, dependencies.capability);
  if (!supported.ok) return { ok: false, code: "unsupported_configuration", message: supported.message };

  let sourceUrl: string | null = null;
  if (draft.source) {
    const source = await dependencies.sourceResolver.resolveOwned(ownerId, draft.source);
    if (!source || !isSourceUrlFresh(source) || !sourceMatchesRequestedRatio(source, draft.aspectRatio)) return { ok: false, code: "source_unavailable", message: "The private source image is unavailable, expired, or has a different aspect ratio." };
    sourceUrl = source.providerUrl;
  }

  const estimate = estimateVerifiedProviderCost(dependencies.capability, draft.durationSeconds);
  if (estimate === null) return { ok: false, code: "billing_unavailable", message: "Verified provider pricing is unavailable." };
  const billing = await dependencies.billing.reserve(ownerId, draft.clientSubmissionId, estimate, draft);
  if (!billing.ok) return { ok: false, code: "billing_unavailable", message: "Video billing is not available." };

  let created;
  try {
    created = await dependencies.repository.createOrGet({
      ownerId, clientSubmissionId: draft.clientSubmissionId, mode: draft.mode, prompt: draft.prompt,
      quality: draft.quality, aspectRatio: draft.aspectRatio, durationSeconds: draft.durationSeconds,
      cameraMovement: draft.cameraMovement, ...sourceColumns(draft), provider: dependencies.capability.provider,
      endpointId: dependencies.capability.endpointId, modelId: dependencies.capability.id, providerRequestId: null,
      status: "queued", errorCode: null, outputBucketId: null, outputObjectPath: null,
      outputMimeType: null, outputSizeBytes: null, estimatedProviderCostUsd: estimate,
      actualProviderCostUsd: null, billingReservationId: billing.reservation.id, billingStatus: "reserved",
    });
  } catch {
    await dependencies.billing.release(billing.reservation.id);
    return { ok: false, code: "persistence_failure", message: "The video request could not be saved and was not submitted." };
  }
  if (!created.created) {
    if (created.job.billingReservationId !== billing.reservation.id) await dependencies.billing.release(billing.reservation.id);
    return { ok: true, jobId: created.job.id, status: created.job.status, duplicate: true };
  }

  let acceptedTaskId: string | null = null;
  try {
    const providerResult = await dependencies.provider.submit({ modelId: dependencies.capability.id, endpointId: dependencies.capability.endpointId, mode: draft.mode, prompt: draft.prompt, durationSeconds: draft.durationSeconds, aspectRatio: draft.aspectRatio, sourceUrl });
    acceptedTaskId = providerResult.requestId;
    const job = await dependencies.repository.attachProviderRequest(created.job.id, providerResult.requestId);
    recordVideoTelemetry({ event: "submitted", jobId: job.id, endpointId: job.endpointId, status: job.status, estimatedProviderCostUsd: estimate });
    return { ok: true, jobId: job.id, status: job.status, duplicate: false };
  } catch {
    // Retry only task attachment, never provider submission. A committed DB update
    // may have lost its response; a known pinned task must remain reconcilable.
    if (acceptedTaskId) {
      try {
        const pinned = await dependencies.repository.attachProviderRequest(created.job.id, acceptedTaskId);
        return { ok: true, jobId: pinned.id, status: pinned.status, duplicate: false };
      } catch { /* Read back a possibly committed attachment below. */ }
      const pinned = await dependencies.repository.findOwned(ownerId, created.job.id);
      if (pinned?.providerRequestId === acceptedTaskId) return { ok: true, jobId: pinned.id, status: pinned.status, duplicate: false };
    }
    await dependencies.billing.markForReconciliation(billing.reservation.id);
    if (dependencies.repository.markSubmissionAmbiguous) await dependencies.repository.markSubmissionAmbiguous(created.job.id);
    else await dependencies.repository.transition(created.job.id, ["queued"], { status: "failed", errorCode: "provider_submission_ambiguous", billingStatus: "reconciliation_required" });
    return { ok: false, code: "provider_submission_ambiguous", message: "The provider submission outcome is uncertain. The request will not be submitted again automatically." };
  }
}
