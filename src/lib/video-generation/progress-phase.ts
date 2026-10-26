import type { VideoProgressPhase } from "@/features/video/video-studio-types";
import type { VideoGenerationStatus } from "./types";

export function getVideoProgressPhase(input: {
  status: VideoGenerationStatus;
  errorCode: string | null;
  providerRequestId: string | null;
  outputObjectPath: string | null;
}): VideoProgressPhase {
  if (input.status === "succeeded") return "ready";
  if (input.status === "failed") return input.errorCode === "provider_submission_ambiguous" ? "ambiguous" : "failed";
  if (input.status === "processing") return input.outputObjectPath ? "finalizing" : "processing";
  return input.providerRequestId ? "queued" : "submission-uncertain";
}
