import type { VideoGenerationStatus } from "@/lib/video-generation/types";

const allowedTransitions: Record<VideoGenerationStatus, readonly VideoGenerationStatus[]> = {
  queued: ["processing", "failed"],
  processing: ["succeeded", "failed"],
  succeeded: [],
  failed: [],
};

export function canTransitionVideoStatus(from: VideoGenerationStatus, to: VideoGenerationStatus) {
  return from === to || allowedTransitions[from].includes(to);
}

export function assertVideoStatusTransition(from: VideoGenerationStatus, to: VideoGenerationStatus) {
  if (!canTransitionVideoStatus(from, to)) throw new Error(`Invalid video status transition: ${from} -> ${to}`);
}

export function isTerminalVideoStatus(status: VideoGenerationStatus) {
  return status === "succeeded" || status === "failed";
}
