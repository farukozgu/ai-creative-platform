import type { VideoPresentationRecord } from "@/features/video/video-studio-types";
import type { VideoJobRecord } from "@/lib/video-generation/types";
import { getVideoProgressPhase } from "@/lib/video-generation/progress-phase";

export function toVideoPresentationRecord(job: VideoJobRecord, playbackUrl: string | null = null): VideoPresentationRecord {
  return {
    generationMethod: job.provider === "local" ? "source-motion" : "kling",
    criticalRegion: job.preservation?.criticalRegion ?? null,
    analysisRequested: Boolean(job.preservation?.analysisConsent),
    id: job.id,
    title: job.provider === "local" ? "" : job.prompt.length > 60 ? `${job.prompt.slice(0, 57)}...` : job.prompt,
    status: job.status === "succeeded" ? "ready" : job.status,
    progressPhase: getVideoProgressPhase(job),
    providerTaskKnown: Boolean(job.providerRequestId),
    outputPersisted: Boolean(job.outputObjectPath),
    errorCode: job.errorCode,
    generationMode: job.mode,
    createdAt: job.createdAt,
    durationSeconds: job.durationSeconds,
    aspectRatio: job.aspectRatio,
    playbackUrl,
    prompt: job.provider === "local" && job.prompt === "source-motion-v1" ? null : job.prompt,
    cameraMovement: job.cameraMovement,
    quality: job.provider === "local" ? null : job.quality,
    sourceImage: job.sourceId ? { id: job.sourceId } : null,
  };
}
