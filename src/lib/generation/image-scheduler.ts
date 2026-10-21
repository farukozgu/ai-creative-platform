import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const IMAGE_EXECUTION_BATCH_SIZE = 1;
export const IMAGE_EXECUTION_LEASE_SECONDS = 750;
export const IMAGE_EXECUTION_HEARTBEAT_MS = 60_000;

export type ImageExecutionClaim = {
  jobId: string;
  leaseToken: string;
  leaseVersion: number;
  leaseExpiresAt: string;
};

export type ImageSchedulerEnvironment = {
  [name: string]: string | undefined;
  IMAGE_GENERATION_WORKER_ENABLED?: string;
};

/** An explicit deployment gate: accepting jobs is safe without an executor. */
export function isImageGenerationWorkerEnabled(env: ImageSchedulerEnvironment = process.env) {
  return env.IMAGE_GENERATION_WORKER_ENABLED === "true";
}

export async function claimQueuedImageGenerations(batchSize = IMAGE_EXECUTION_BATCH_SIZE): Promise<ImageExecutionClaim[]> {
  const { data, error } = await getSupabaseAdminClient().rpc("claim_queued_image_generations", {
    p_batch_size: Math.max(1, Math.min(IMAGE_EXECUTION_BATCH_SIZE, Math.floor(batchSize))),
    p_lease_seconds: IMAGE_EXECUTION_LEASE_SECONDS,
  });
  if (error) throw new Error("Unable to claim queued image generations.");
  return (data ?? []).map((row: Record<string, unknown>) => ({
    jobId: String(row.id),
    leaseToken: String(row.execution_lease_token),
    leaseVersion: Number(row.execution_lease_version),
    leaseExpiresAt: String(row.execution_lease_expires_at),
  }));
}

export async function renewImageExecutionLease(claim: ImageExecutionClaim): Promise<ImageExecutionClaim | null> {
  const { data, error } = await getSupabaseAdminClient().rpc("renew_image_generation_lease", {
    p_generation_id: claim.jobId,
    p_lease_token: claim.leaseToken,
    p_lease_version: claim.leaseVersion,
    p_lease_seconds: IMAGE_EXECUTION_LEASE_SECONDS,
  });
  if (error || !data?.length) return null;
  const row = data[0] as Record<string, unknown>;
  return { ...claim, leaseExpiresAt: String(row.execution_lease_expires_at) };
}

/** Keeps ownership alive while an uninterruptible provider request is pending. */
export async function withImageLeaseHeartbeat<T>(claim: ImageExecutionClaim, operation: () => Promise<T>): Promise<T> {
  const initial = await renewImageExecutionLease(claim);
  if (!initial) throw new Error("Image execution lease could not be renewed before provider submission.");
  let renewalFailed = false;
  let renewals = Promise.resolve();
  const interval = setInterval(() => {
    renewals = renewals.then(async () => {
      if (!await renewImageExecutionLease(claim)) renewalFailed = true;
    });
  }, IMAGE_EXECUTION_HEARTBEAT_MS);
  interval.unref?.();
  try {
    const result = await operation();
    await renewals;
    if (renewalFailed || !await renewImageExecutionLease(claim)) throw new Error("Image execution lease was lost during provider submission.");
    return result;
  } finally {
    clearInterval(interval);
  }
}

export type ImageBatchExecutor = (claim: ImageExecutionClaim) => Promise<{ ok: boolean; message?: string }>;

export async function runImageGenerationBatch(execute: ImageBatchExecutor, batchSize = IMAGE_EXECUTION_BATCH_SIZE) {
  const claims = await claimQueuedImageGenerations(batchSize);
  const results = await Promise.allSettled(claims.map((claim) => execute(claim)));
  return {
    claimed: claims.length,
    succeeded: results.filter((result) => result.status === "fulfilled" && result.value.ok).length,
    deferred: results.filter((result) => result.status === "fulfilled" && !result.value.ok).length,
    interrupted: results.filter((result) => result.status === "rejected").length,
  };
}
