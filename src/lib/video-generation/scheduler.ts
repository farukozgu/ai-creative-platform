import type { ReconciliationDependencies } from "@/lib/video-generation/reconciliation";
import { reconcileClaimedVideoGeneration } from "@/lib/video-generation/reconciliation";
import type { VideoReconciliationRepository } from "@/lib/video-generation/types";

export const VIDEO_RECONCILIATION_BATCH_SIZE = 10;
export const VIDEO_RECONCILIATION_LEASE_SECONDS = 120;

export type VideoSchedulerEnvironment = {
  [name: string]: string | undefined;
  VIDEO_RECONCILIATION_SCHEDULER_ENABLED?: string;
  VIDEO_RECONCILIATION_CRON_SECRET?: string;
};

export function isVideoReconciliationSchedulerEnabled(env: VideoSchedulerEnvironment = process.env) {
  return env.VIDEO_RECONCILIATION_SCHEDULER_ENABLED === "true";
}

export async function runVideoReconciliationBatch(
  dependencies: Omit<ReconciliationDependencies, "repository"> & { repository: VideoReconciliationRepository },
  batchSize = VIDEO_RECONCILIATION_BATCH_SIZE,
) {
  const boundedBatchSize = Math.max(1, Math.min(VIDEO_RECONCILIATION_BATCH_SIZE, Math.floor(batchSize)));
  const claims = await dependencies.repository.claimDueVideoReconciliations(boundedBatchSize, VIDEO_RECONCILIATION_LEASE_SECONDS);
  const results = await Promise.all(claims.map((claim) => reconcileClaimedVideoGeneration(claim, dependencies)));
  return {
    claimed: claims.length,
    succeeded: results.filter((result) => result.status === "succeeded").length,
    deferred: results.filter((result) => result.status !== "succeeded" && result.status !== "unchanged").length,
    unchanged: results.filter((result) => result.status === "unchanged").length,
  };
}
