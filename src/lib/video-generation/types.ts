/** The only supported mode for new video-generation requests. */
export type VideoGenerationMode = "image";
/** Retained to read existing legacy records. */
export type HistoricalVideoGenerationMode = VideoGenerationMode | "text";
export type VideoGenerationStatus = "queued" | "processing" | "succeeded" | "failed";
/** Stable customer-facing tiers for newly created jobs. */
export type VideoGenerationQuality = "standard" | "pro";
/** Retained for rows created before the tier rename. */
export type HistoricalVideoGenerationQuality = VideoGenerationQuality | "auto" | "best";
export type VideoGenerationAspectRatio = "16:9" | "9:16" | "1:1";
export type VideoGenerationDuration = 5 | 10;

export type VideoSourceReference =
  | { kind: "generated-image"; generationId: string }
  | { kind: "uploaded-image"; sourceAssetId: string };

export type VideoPreparationSource =
  | { kind: "upload"; sourceAssetId: string; objectPath: string }
  | { kind: "generated-image"; generationId: string };

export type VideoGenerationDraft = {
  productReferences?: { source: VideoSourceReference; sha256: string; purpose: string; aspectRatio?: VideoGenerationAspectRatio }[];
  shotMode?: "single" | "multi";
  director?: import("../video-director/core").VideoDirectorSelection;
  method?: import("./preservation").VideoGenerationMethod;
  criticalRegion?: import("./preservation").CriticalProductRegion | null;
  analysisConsent?: { model: "gpt-4o-mini"; maximumCostUsd: number; pricingVersion: string; locale?: "tr" | "en" } | null;
  clientSubmissionId: string;
  mode: VideoGenerationMode;
  prompt: string;
  quality: VideoGenerationQuality;
  aspectRatio: VideoGenerationAspectRatio;
  durationSeconds: VideoGenerationDuration;
  cameraMovement: "auto" | "dolly-in" | "dolly-out" | "orbit" | "pan-left" | "pan-right" | "static";
  source: VideoSourceReference | null;
};

export type VideoGenerationErrorCode =
  | "unauthorized"
  | "feature_disabled"
  | "invalid_input"
  | "unsupported_configuration"
  | "source_unavailable"
  | "billing_unavailable"
  | "provider_submission_ambiguous"
  | "provider_failure"
  | "output_invalid"
  | "output_persistence_failure"
  | "retry_limit_reached"
  | "not_found";

export type ProviderVideoFile = {
  url: string;
  contentType: string | null;
  sizeBytes: number | null;
};

/** A provider explicitly rejected this submission; it was not accepted as a queued job. */
export class DefiniteVideoProviderFailure extends Error {
  constructor() { super("The video provider rejected the submitted request."); this.name = "DefiniteVideoProviderFailure"; }
}

/** A previously accepted task finished with an inference/result error. */
export class VideoProviderTaskFailure extends Error {
  constructor() { super("The accepted video task failed."); this.name = "VideoProviderTaskFailure"; }
}

export type VideoProviderRequest = {
  elementImageUrls?: string[];
  multiPrompt?: import("../video-director/core").KlingMultiPrompt;
  negativePrompt?: string;
  cfgScale?: number;
  modelId: string;
  endpointId: string;
  mode: VideoGenerationMode;
  prompt: string;
  durationSeconds: VideoGenerationDuration;
  aspectRatio: VideoGenerationAspectRatio;
  sourceUrl: string | null;
};

export interface VideoGenerationProvider {
  readonly name: "fal";
  submit(request: VideoProviderRequest): Promise<{ requestId: string }>;
  getStatus(endpointId: string, requestId: string): Promise<"queued" | "processing" | "completed" | "failed">;
  getResult(endpointId: string, requestId: string): Promise<ProviderVideoFile>;
  cancel?(endpointId: string, requestId: string): Promise<void>;
}

export type VideoJobRecord = {
  preservation?: VideoPreservationSnapshot | null;
  id: string;
  ownerId: string;
  clientSubmissionId: string;
  mode: HistoricalVideoGenerationMode;
  prompt: string;
  quality: HistoricalVideoGenerationQuality;
  aspectRatio: VideoGenerationAspectRatio;
  durationSeconds: VideoGenerationDuration;
  cameraMovement: VideoGenerationDraft["cameraMovement"];
  sourceKind: VideoSourceReference["kind"] | null;
  sourceId: string | null;
  provider: string;
  endpointId: string;
  modelId: string;
  providerRequestId: string | null;
  status: VideoGenerationStatus;
  errorCode: VideoGenerationErrorCode | null;
  outputBucketId: string | null;
  outputObjectPath: string | null;
  outputMimeType: string | null;
  outputSizeBytes: number | null;
  estimatedProviderCostUsd: number | null;
  actualProviderCostUsd: number | null;
  billingReservationId: string | null;
  billingStatus: "not_configured" | "reserved" | "finalized" | "released" | "reconciliation_required";
  reconciliationAttempts: number;
  nextReconciliationAt: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type VideoPreservationSnapshot = {
  payloadSummary?: { mode: "single" | "multi"; shotType: "customize" | null; durations: number[]; promptHashes: string[]; directorVersion: string | null; presetId: string | null; presetVersion: number | null };
  director?: { plan: import("../video-director/core").VideoDirectorPlan; multiPrompt?: import("../video-director/core").KlingMultiPrompt };
  version: string;
  method: import("./preservation").HistoricalVideoGenerationMethod;
  draftHash: string;
  sourceSha256: string;
  geometry: import("./preservation").SourceFrameGeometry;
  criticalRegion: import("./preservation").CriticalProductRegion | null;
  frameRegion: import("./preservation").CriticalProductRegion | null;
  compiledPrompt: string;
  negativePrompt: string;
  cfgScale: number;
  analysisConsent: NonNullable<VideoGenerationDraft["analysisConsent"]> | null;
};

export type VideoReconciliationClaim = {
  job: VideoJobRecord;
  leaseToken: string;
  leaseVersion: number;
  leaseExpiresAt: string;
};

export interface VideoJobRepository {
  findBySubmission?(ownerId: string, submissionId: string): Promise<VideoJobRecord | null>;
  createOrGet(input: Omit<VideoJobRecord, "id" | "createdAt" | "startedAt" | "completedAt" | "reconciliationAttempts" | "nextReconciliationAt">): Promise<{ job: VideoJobRecord; created: boolean }>;
  findOwned(ownerId: string, jobId: string): Promise<VideoJobRecord | null>;
  findById(jobId: string): Promise<VideoJobRecord | null>;
  listOwned(ownerId: string): Promise<VideoJobRecord[]>;
  attachProviderRequest(jobId: string, requestId: string): Promise<VideoJobRecord>;
  markSubmissionAmbiguous?(jobId: string): Promise<void>;
  transition(jobId: string, from: readonly VideoGenerationStatus[], patch: Partial<VideoJobRecord>): Promise<VideoJobRecord | null>;
  scheduleReconciliation(jobId: string, attempts: number, nextAt: string | null): Promise<void>;
}

/** Server-only operations used by the durable scheduler after an atomic SQL claim. */
export interface VideoReconciliationRepository extends VideoJobRepository {
  claimDueVideoReconciliations(batchSize: number, leaseSeconds: number): Promise<VideoReconciliationClaim[]>;
  transitionClaimed(claim: VideoReconciliationClaim, from: readonly VideoGenerationStatus[], patch: Partial<VideoJobRecord>): Promise<VideoJobRecord | null>;
  scheduleClaimedReconciliation(claim: VideoReconciliationClaim, attempts: number, nextAt: string | null): Promise<boolean>;
}

export interface DurableVideoOutputStore {
  recover?(job: VideoJobRecord): Promise<{ bucketId: string; objectPath: string; contentType: "video/mp4"; sizeBytes: number } | null>;
  persist(job: VideoJobRecord, file: ProviderVideoFile): Promise<{
    bucketId: string;
    objectPath: string;
    contentType: "video/mp4";
    sizeBytes: number;
  }>;
}
