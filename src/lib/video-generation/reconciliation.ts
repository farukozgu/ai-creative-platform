import type { FencedVideoBillingPolicy, VideoBillingPolicy } from "@/lib/video-generation/billing";
import { isTerminalVideoStatus } from "@/lib/video-generation/lifecycle";
import { recordVideoTelemetry } from "@/lib/video-generation/telemetry";
import type { DurableVideoOutputStore, VideoGenerationProvider, VideoJobRepository, VideoReconciliationClaim, VideoReconciliationRepository } from "@/lib/video-generation/types";
import { VideoProviderTaskFailure } from "./types";
import { logVideoDiagnostic } from "./diagnostics";

export const MAX_VIDEO_RECONCILIATION_ATTEMPTS = 24;

export type ReconciliationDependencies = {
  repository: VideoJobRepository;
  provider: VideoGenerationProvider;
  outputStore: DurableVideoOutputStore;
  billing: VideoBillingPolicy;
  now?: () => Date;
};

export async function reconcileVideoGeneration(jobId: string, dependencies: ReconciliationDependencies) {
  const job = await dependencies.repository.findById(jobId);
  if (!job || isTerminalVideoStatus(job.status)) return { status: "unchanged" as const };
  if (!job.providerRequestId) return { status: "awaiting_provider_id" as const };
  if (job.reconciliationAttempts >= MAX_VIDEO_RECONCILIATION_ATTEMPTS) {
    await dependencies.repository.transition(job.id, ["queued", "processing"], { status: "failed", errorCode: job.errorCode === "output_persistence_failure" ? job.errorCode : "retry_limit_reached", billingStatus: "reconciliation_required" });
    return { status: "failed" as const };
  }
  const attempts = job.reconciliationAttempts + 1;
  try {
    const recovered = !job.outputObjectPath ? await dependencies.outputStore.recover?.(job) : null;
    const providerStatus = recovered || job.outputObjectPath ? "completed" : await dependencies.provider.getStatus(job.endpointId, job.providerRequestId);
    logVideoDiagnostic(job.clientSubmissionId, "provider_job_status", "success", { jobId: job.id, status: providerStatus });
    if (providerStatus === "failed") {
      await dependencies.repository.transition(job.id, ["queued", "processing"], { status: "failed", errorCode: "provider_failure", billingStatus: "reconciliation_required" });
      recordVideoTelemetry({ event: "failed", jobId: job.id, endpointId: job.endpointId, status: "failed", failureCategory: "provider_failure", reconciliationAttempts: attempts });
      return { status: "failed" as const };
    }
    if (providerStatus !== "completed") {
      const nextStatus = providerStatus === "processing" ? "processing" : job.status;
      await dependencies.repository.transition(job.id, ["queued", "processing"], { status: nextStatus });
      const delaySeconds = Math.min(300, 10 * (2 ** Math.min(attempts - 1, 5)));
      await dependencies.repository.scheduleReconciliation(job.id, attempts, new Date((dependencies.now?.() ?? new Date()).getTime() + delaySeconds * 1000).toISOString());
      const observedAt = (dependencies.now?.() ?? new Date()).getTime();
      recordVideoTelemetry({
        event: "status_reconciled", jobId: job.id, endpointId: job.endpointId, status: nextStatus,
        reconciliationAttempts: attempts,
        queueDurationMs: nextStatus === "processing" ? Math.max(0, observedAt - Date.parse(job.createdAt)) : null,
      });
      return { status: nextStatus };
    }
    let workingJob = job;
    if (workingJob.status === "queued") {
      const processing = await dependencies.repository.transition(job.id, ["queued"], { status: "processing" });
      if (!processing) return { status: "unchanged" as const };
      workingJob = processing;
    }
    if (!workingJob.outputObjectPath) {
      // Result retrieval failures belong to the provider, not to private Storage.
      let file;
      if (!recovered) {
        try { file = await dependencies.provider.getResult(job.endpointId, job.providerRequestId); }
        catch (error) {
          logVideoDiagnostic(job.clientSubmissionId, "provider_job_result", "failed", { jobId: job.id });
          if (!(error instanceof VideoProviderTaskFailure)) throw error;
          await dependencies.repository.transition(job.id, ["queued", "processing"], { status: "failed", errorCode: "provider_failure", billingStatus: "reconciliation_required" });
          return { status: "failed" as const };
        }
      }
      try {
        const stored = recovered ?? await dependencies.outputStore.persist(workingJob, file!);
        const checkpoint = await dependencies.repository.transition(job.id, ["processing"], {
          status: "processing", outputBucketId: stored.bucketId, outputObjectPath: stored.objectPath,
          outputMimeType: stored.contentType, outputSizeBytes: stored.sizeBytes, errorCode: null,
        });
        if (!checkpoint) return { status: "unchanged" as const };
        workingJob = checkpoint;
        logVideoDiagnostic(job.clientSubmissionId, "video_output_storage", "success", { jobId: job.id, sizeBytes: stored.sizeBytes });
      } catch {
        await dependencies.repository.transition(job.id, ["processing"], { errorCode: "output_persistence_failure" });
        await dependencies.repository.scheduleReconciliation(job.id, attempts, new Date((dependencies.now?.() ?? new Date()).getTime() + 60_000).toISOString());
        logVideoDiagnostic(job.clientSubmissionId, "video_output_storage", "failed", { jobId: job.id });
        recordVideoTelemetry({ event: "failed", jobId: job.id, endpointId: job.endpointId, status: workingJob.status, failureCategory: "output_persistence", reconciliationAttempts: attempts });
        return { status: "output_retry" as const };
      }
    }
    if (!workingJob.billingReservationId) throw new Error("The video billing reservation is missing.");
    try {
      await dependencies.billing.finalize(workingJob.billingReservationId, workingJob.actualProviderCostUsd);
    } catch {
      await dependencies.repository.scheduleReconciliation(job.id, attempts, new Date((dependencies.now?.() ?? new Date()).getTime() + 60_000).toISOString());
      return { status: "billing_retry" as const };
    }
    const completed = await dependencies.repository.transition(job.id, ["processing"], {
      status: "succeeded", errorCode: null, billingStatus: "finalized",
    });
    if (!completed) return { status: "unchanged" as const };
    const completedAt = (dependencies.now?.() ?? new Date()).getTime();
    recordVideoTelemetry({
      event: "output_persisted", jobId: job.id, endpointId: job.endpointId, status: "succeeded",
      reconciliationAttempts: attempts, estimatedProviderCostUsd: completed.estimatedProviderCostUsd,
      actualProviderCostUsd: completed.actualProviderCostUsd,
      queueDurationMs: completed.startedAt ? Math.max(0, Date.parse(completed.startedAt) - Date.parse(completed.createdAt)) : null,
      processingDurationMs: completed.startedAt ? Math.max(0, completedAt - Date.parse(completed.startedAt)) : null,
    });
    return { status: "succeeded" as const };
  } catch {
    logVideoDiagnostic(job.clientSubmissionId, "video_reconciliation_retry", "failed", { jobId: job.id });
    await dependencies.repository.scheduleReconciliation(job.id, attempts, new Date((dependencies.now?.() ?? new Date()).getTime() + 60_000).toISOString());
    return { status: "retry_scheduled" as const };
  }
}

/**
 * Scheduler-only reconciliation. Every state-changing operation is fenced by the
 * lease returned from PostgreSQL, so a worker that outlives its lease cannot
 * overwrite a newer worker's checkpoint.
 */
export async function reconcileClaimedVideoGeneration(claim: VideoReconciliationClaim, dependencies: Omit<ReconciliationDependencies, "repository"> & { repository: VideoReconciliationRepository }) {
  const job = claim.job;
  if (isTerminalVideoStatus(job.status) || !job.providerRequestId) return { status: "unchanged" as const };
  if (job.reconciliationAttempts >= MAX_VIDEO_RECONCILIATION_ATTEMPTS) {
    const updated = await dependencies.repository.transitionClaimed(claim, ["queued", "processing"], { status: "failed", errorCode: job.errorCode === "output_persistence_failure" ? job.errorCode : "retry_limit_reached", billingStatus: "reconciliation_required" });
    return updated ? { status: "failed" as const } : { status: "unchanged" as const };
  }
  const attempts = job.reconciliationAttempts + 1;
  const schedule = async (delayMs: number) => dependencies.repository.scheduleClaimedReconciliation(claim, attempts, new Date((dependencies.now?.() ?? new Date()).getTime() + delayMs).toISOString());
  try {
    const recovered = !job.outputObjectPath ? await dependencies.outputStore.recover?.(job) : null;
    const providerStatus = recovered || job.outputObjectPath ? "completed" : await dependencies.provider.getStatus(job.endpointId, job.providerRequestId);
    logVideoDiagnostic(job.clientSubmissionId, "provider_job_status", "success", { jobId: job.id, status: providerStatus });
    if (providerStatus === "failed") {
      const updated = await dependencies.repository.transitionClaimed(claim, ["queued", "processing"], { status: "failed", errorCode: "provider_failure", billingStatus: "reconciliation_required" });
      if (!updated) return { status: "unchanged" as const };
      // Terminal rows are immutable; do not attempt another lease/schedule update.
      return { status: "failed" as const };
    }
    if (providerStatus !== "completed") {
      const nextStatus = providerStatus === "processing" ? "processing" : job.status;
      const updated = await dependencies.repository.transitionClaimed(claim, ["queued", "processing"], { status: nextStatus });
      if (!updated) return { status: "unchanged" as const };
      const delaySeconds = Math.min(300, 10 * (2 ** Math.min(attempts - 1, 5)));
      await schedule(delaySeconds * 1000);
      return { status: nextStatus };
    }
    let workingJob = job;
    if (workingJob.status === "queued") {
      const processing = await dependencies.repository.transitionClaimed(claim, ["queued"], { status: "processing" });
      if (!processing) return { status: "unchanged" as const };
      workingJob = processing;
    }
    if (!workingJob.outputObjectPath) {
      let file;
      if (!recovered) {
        try { file = await dependencies.provider.getResult(job.endpointId, job.providerRequestId); }
        catch (error) {
          logVideoDiagnostic(job.clientSubmissionId, "provider_job_result", "failed", { jobId: job.id });
          if (!(error instanceof VideoProviderTaskFailure)) throw error;
          const failed = await dependencies.repository.transitionClaimed(claim, ["queued", "processing"], { status: "failed", errorCode: "provider_failure", billingStatus: "reconciliation_required" });
          return failed ? { status: "failed" as const } : { status: "unchanged" as const };
        }
      }
      try {
        const stored = recovered ?? await dependencies.outputStore.persist(workingJob, file!);
        const checkpoint = await dependencies.repository.transitionClaimed(claim, ["processing"], {
          status: "processing", outputBucketId: stored.bucketId, outputObjectPath: stored.objectPath,
          outputMimeType: stored.contentType, outputSizeBytes: stored.sizeBytes, errorCode: null,
        });
        if (!checkpoint) return { status: "unchanged" as const };
        workingJob = checkpoint;
        logVideoDiagnostic(job.clientSubmissionId, "video_output_storage", "success", { jobId: job.id, sizeBytes: stored.sizeBytes });
      } catch {
        await dependencies.repository.transitionClaimed(claim, ["processing"], { errorCode: "output_persistence_failure" });
        logVideoDiagnostic(job.clientSubmissionId, "video_output_storage", "failed", { jobId: job.id });
        await schedule(60_000);
        return { status: "output_retry" as const };
      }
    }
    if (!workingJob.billingReservationId) throw new Error("The video billing reservation is missing.");
    try {
      const fencedBilling = dependencies.billing as Partial<FencedVideoBillingPolicy>;
      if (!fencedBilling.finalizeClaimed) throw new Error("Claimed video billing is not configured.");
      await fencedBilling.finalizeClaimed(workingJob.billingReservationId, workingJob.actualProviderCostUsd, claim);
    } catch {
      await schedule(60_000);
      return { status: "billing_retry" as const };
    }
    const completed = await dependencies.repository.transitionClaimed(claim, ["processing"], { status: "succeeded", errorCode: null, billingStatus: "finalized" });
    if (completed) logVideoDiagnostic(job.clientSubmissionId, "video_generation_completed", "success", { jobId: job.id });
    return completed ? { status: "succeeded" as const } : { status: "unchanged" as const };
  } catch {
    logVideoDiagnostic(job.clientSubmissionId, "video_reconciliation_retry", "failed", { jobId: job.id });
    await schedule(60_000);
    return { status: "retry_scheduled" as const };
  }
}
