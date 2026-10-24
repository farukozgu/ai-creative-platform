import "server-only";

import type { UgcPreparedJob } from "@/features/ugc/ugc-studio-contract";
import type { ProviderVideoFile } from "@/lib/video-generation/types";

export type UgcProviderJobStatus = "queued" | "processing" | "succeeded" | "failed" | "provider_submission_ambiguous";

export type UgcProviderRequest = {
  idempotencyKey: string;
  projectId: string;
  requestHash: string;
  snapshot: Record<string, unknown>;
};

export type UgcProviderSubmission =
  | { kind: "accepted"; providerRequestId: string }
  | { kind: "blocked"; safeErrorCode: "generation_disabled" }
  | { kind: "ambiguous"; safeErrorCode: "provider_submission_ambiguous" };

export interface UgcVideoProvider {
  readonly provider: string;
  submit(request: UgcProviderRequest): Promise<UgcProviderSubmission>;
  // Provider completion still requires private output persistence before job success.
  getStatus(providerRequestId: string): Promise<"queued" | "processing" | "completed">;
  getResult(providerRequestId: string): Promise<ProviderVideoFile>;
}

/** Prepared database drafts are never submitted during integration preparation. */
export type UgcPreparedRequest = Pick<UgcPreparedJob, "id" | "status" | "createdAt"> & { submitted: false };
