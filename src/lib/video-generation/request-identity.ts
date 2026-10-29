import { createHash } from "node:crypto";
import type { VideoGenerationDraft, VideoJobRecord } from "./types";

export function videoDraftHash(draft: VideoGenerationDraft) {
  const source = draft.source ? { kind: draft.source.kind, id: draft.source.kind === "uploaded-image" ? draft.source.sourceAssetId : draft.source.generationId } : null;
  const analysisConsent = draft.analysisConsent ? { model: draft.analysisConsent.model, maximumCostUsd: draft.analysisConsent.maximumCostUsd, pricingVersion: draft.analysisConsent.pricingVersion, locale: draft.analysisConsent.locale ?? "tr" } : null;
  return createHash("sha256").update(JSON.stringify({ method: draft.method ?? "kling", source, prompt: draft.prompt,
    quality: draft.quality, aspectRatio: draft.aspectRatio, durationSeconds: draft.durationSeconds, cameraMovement: draft.cameraMovement,
    criticalRegion: draft.criticalRegion ?? null, ...(draft.productReferences?.length ? { productReferences: draft.productReferences } : {}), analysisConsent, ...(draft.shotMode ? { shotMode: draft.shotMode } : {}),
    ...(draft.director ? { director: draft.director } : {}) })).digest("hex");
}
export function matchesVideoRequest(job: VideoJobRecord, draft: VideoGenerationDraft) {
  if (job.preservation) return job.preservation.draftHash === videoDraftHash(draft) && job.preservation.method === (draft.method ?? "kling");
  return (draft.method ?? "kling") === "kling" && !draft.productReferences?.length && !draft.director && !draft.criticalRegion && !draft.analysisConsent && job.prompt === draft.prompt && job.quality === draft.quality
    && job.aspectRatio === draft.aspectRatio && job.durationSeconds === draft.durationSeconds && job.cameraMovement === draft.cameraMovement
    && job.sourceKind === draft.source?.kind && job.sourceId === (draft.source?.kind === "uploaded-image" ? draft.source.sourceAssetId : draft.source?.generationId);
}
