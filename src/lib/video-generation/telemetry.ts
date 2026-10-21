export type VideoTelemetryEvent = {
  event: "submitted" | "status_reconciled" | "output_persisted" | "failed";
  jobId: string;
  endpointId: string;
  status: string;
  failureCategory?: string;
  reconciliationAttempts?: number;
  estimatedProviderCostUsd?: number | null;
  actualProviderCostUsd?: number | null;
  queueDurationMs?: number | null;
  processingDurationMs?: number | null;
};

export function recordVideoTelemetry(event: VideoTelemetryEvent) {
  console.info("video_generation", event);
}
