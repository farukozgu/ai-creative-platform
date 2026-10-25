import type { UgcSnapshotJob, UgcVisualPlan } from "@/lib/ugc/ugc-request-planner";
import type { UgcProviderJobStatus } from "@/lib/ugc/ugc-video-provider";

export type UgcPipelineJob = UgcSnapshotJob & {
  status: "draft" | UgcProviderJobStatus;
  providerRequestId: string | null;
  providerPlan: (UgcVisualPlan | UgcLegacyKlingTaskPlan) | null;
  attempts: number;
};
export type UgcLegacyKlingTaskPlan = {
  version: 1; legacyTask: true; snapshotDigest: string; provider: "fal";
  modelId: "kling-v3-pro-image"; endpointId: "fal-ai/kling-video/v3/pro/image-to-video"; durationSeconds: 15;
};
export type UgcClaim = { job: UgcPipelineJob; token: string; version: number };
export type UgcStoredVideo = { bucketId: "ugc-generated-videos"; objectPath: string; contentType: "video/mp4"; byteSize: number; durationSeconds: number };
export type UgcPipelineError = "source_unavailable" | "provider_failure" | "provider_submission_ambiguous" | "output_invalid" | "output_persistence_failure" | "retry_limit_reached";
export class UgcOutputInvalidError extends Error {
  constructor() { super("Invalid UGC output."); this.name = "UgcOutputInvalidError"; }
}
export type UgcClaimPatch = {
  status: UgcProviderJobStatus; providerRequestId?: string; errorCode?: UgcPipelineError;
  output?: UgcStoredVideo; delaySeconds?: number;
};
export interface UgcPipelineRepository {
  findOwned(ownerId: string, jobId: string): Promise<UgcPipelineJob | null>;
  claimSubmission(job: UgcPipelineJob, plan: UgcVisualPlan): Promise<UgcClaim | null>;
  claimReconciliation(ownerId: string, jobId: string): Promise<UgcClaim | null>;
  isCurrent(claim: UgcClaim): Promise<boolean>;
  finish(claim: UgcClaim, patch: UgcClaimPatch): Promise<boolean>;
}
