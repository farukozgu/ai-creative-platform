import type { VideoPresentationRecord } from "@/features/video/video-studio-types";
import type { VideoJobRecord } from "@/lib/video-generation/types";

export function toVideoPresentationRecord(job: VideoJobRecord, playbackUrl: string | null = null): VideoPresentationRecord {
  return {
    id: job.id,
    title: job.prompt.length > 60 ? `${job.prompt.slice(0, 57)}...` : job.prompt,
    status: job.status === "succeeded" ? "ready" : job.status,
    generationMode: job.mode,
    createdAt: job.createdAt,
    durationSeconds: job.durationSeconds,
    aspectRatio: job.aspectRatio,
    playbackUrl,
    prompt: job.prompt,
    cameraMovement: job.cameraMovement,
    quality: job.quality,
    sourceImage: job.sourceId ? { id: job.sourceId } : null,
  };
}
