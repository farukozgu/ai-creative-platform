import type { VideoProgressPhase } from "@/features/video/video-studio-types";
import type { VideoGenerationStatus } from "./types";

export function getVideoProgressPhase(input: {
  status: VideoGenerationStatus;
  errorCode: string | null;
  providerRequestId: string | null;
  outputObjectPath: string | null;
  provider?: string;
}): VideoProgressPhase {
  if (input.status === "succeeded") return "ready";
  if (input.status === "failed") return input.errorCode === "provider_submission_ambiguous" ? "ambiguous" : "failed";
  if (input.status === "processing") return input.outputObjectPath ? "finalizing" : "processing";
  return input.providerRequestId || input.provider === "local" ? "queued" : "submission-uncertain";
}

/** The Studio restores work only while its status still needs attention. */
export function shouldRestoreApprovedVideoJob(input: { status: VideoGenerationStatus; errorCode: string | null }) {
  if (input.status === "succeeded") return false;
  if (input.status === "failed" && input.errorCode !== "provider_submission_ambiguous") return false;
  return true;
}
