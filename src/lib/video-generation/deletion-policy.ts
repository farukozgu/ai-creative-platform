import type { VideoJobRecord } from "./types";

export function canDeleteVideo(job: Pick<VideoJobRecord, "status" | "billingStatus" | "errorCode">) {
  return (job.status === "succeeded" || job.status === "failed")
    && ["not_configured", "finalized", "released"].includes(job.billingStatus)
    && job.errorCode !== "provider_submission_ambiguous";
}
