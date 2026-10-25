import "server-only";

import { createHash } from "node:crypto";
import { canonicalUgcJson, planUgcKlingRequest } from "@/lib/ugc/ugc-request-planner";
import { planUgcModelRequest } from "@/lib/ugc/ugc-seedance-planner";
import { UgcOutputInvalidError } from "@/lib/ugc/ugc-pipeline-types";
import type { UgcSnapshotJob, UgcVisualPlan, UgcPlanningResult } from "@/lib/ugc/ugc-request-planner";
import type { UgcFalInput } from "@/lib/ugc/ugc-fal-submission";
import type { UgcPipelineRepository, UgcStoredVideo } from "@/lib/ugc/ugc-pipeline-types";
import type { ProviderVideoFile } from "@/lib/video-generation/types";

export interface UgcPipelineDependencies {
  repository: UgcPipelineRepository;
  /** Explicit override only for legacy Kling verification; new UGC plans use Seedance. */
  planRequest?: (job: UgcSnapshotJob) => UgcPlanningResult;
  media: {
    resolveInput(job: UgcSnapshotJob, plan: UgcVisualPlan): Promise<UgcFalInput>;
    recover(job: UgcSnapshotJob): Promise<UgcStoredVideo | null>;
    persist(job: UgcSnapshotJob, file: ProviderVideoFile): Promise<UgcStoredVideo>;
  };
  transport: {
    submit(input: UgcFalInput): Promise<string>;
    getStatus(endpointId: string, taskId: string): Promise<"queued" | "processing" | "completed">;
    getResult(endpointId: string, taskId: string): Promise<ProviderVideoFile>;
  };
}

/** Production boundary: deliberately no environment-variable escape hatch or wired transport. */
export async function requestUgcGeneration() {
  return { ok: false, code: "generation_disabled" } as const;
}

/** Unregistered execution seam, exercised only with injected non-billable dependencies. */
export async function verifyUgcSubmission(ownerId: string, jobId: string, deps: UgcPipelineDependencies) {
  if (!ownerId) return { kind: "unauthorized" } as const;
  const job = await deps.repository.findOwned(ownerId, jobId);
  if (!job || job.ownerId !== ownerId) return { kind: "not_found" } as const;
  if (job.status !== "draft") return { kind: "duplicate" } as const;
  const planned = (deps.planRequest ?? planUgcModelRequest)(job);
  if (!planned.ok) return planned;
  const claim = await deps.repository.claimSubmission(job, planned.plan);
  if (!claim) return { kind: "duplicate" } as const;
  let input: UgcFalInput;
  try { input = await deps.media.resolveInput(claim.job, planned.plan); }
  catch {
    await deps.repository.finish(claim, { status: "failed", errorCode: "source_unavailable" });
    return { kind: "source_unavailable" } as const;
  }
  try {
    if (!await deps.repository.isCurrent(claim)) return { kind: "stale_claim" } as const;
    const taskId = await deps.transport.submit(input);
    if (!/^[a-zA-Z0-9_-]{1,255}$/.test(taskId)) throw new Error("Invalid task response.");
    const attached = await deps.repository.finish(claim, { status: "queued", providerRequestId: taskId, delaySeconds: 10 });
    if (!attached) throw new Error("Claim expired before task attachment.");
    return { kind: "accepted" } as const;
  } catch {
    // Includes an accepted task whose ID failed to persist. Never repeat POST.
    await deps.repository.finish(claim, { status: "provider_submission_ambiguous", errorCode: "provider_submission_ambiguous" });
    return { kind: "ambiguous" } as const;
  }
}

/** One bounded reconciliation step. No cron, worker deployment or automatic submit retry. */
export async function verifyUgcReconciliation(ownerId: string, jobId: string, deps: UgcPipelineDependencies) {
  if (!ownerId) return { kind: "unauthorized" } as const;
  const claim = await deps.repository.claimReconciliation(ownerId, jobId);
  if (!claim || claim.job.ownerId !== ownerId) return { kind: "unchanged" } as const;
  const job = claim.job;
  if (!job.providerRequestId) {
    await deps.repository.finish(claim, { status: "provider_submission_ambiguous", errorCode: "provider_submission_ambiguous" });
    return { kind: "ambiguous" } as const;
  }
  // Historical tasks stay on their pinned route; never migrate an in-flight request.
  const legacyKlingTask = job.providerPlan?.version === 1 && job.providerPlan.legacyTask === true;
  const planningJob = legacyKlingTask ? { ...job,
    requestHash: createHash("sha256").update(canonicalUgcJson(job.requestSnapshot)).digest("hex") } : job;
  const planned = job.providerPlan?.version === 1 ? planUgcKlingRequest(planningJob) : planUgcModelRequest(planningJob);
  const pinnedPlanMatches = planned.ok && (legacyKlingTask
    ? job.providerPlan?.version === 1 && planned.plan.version === 1
      && planned.plan.provider === job.providerPlan.provider
      && planned.plan.modelId === job.providerPlan.modelId
      && planned.plan.endpointId === job.providerPlan.endpointId
      && planned.plan.durationSeconds === job.providerPlan.durationSeconds
    : canonicalUgcJson(planned.plan) === canonicalUgcJson(job.providerPlan));
  if (!pinnedPlanMatches) {
    await deps.repository.finish(claim, { status: "failed", errorCode: "provider_failure" });
    return { kind: "invalid_plan" } as const;
  }
  if (job.attempts > 24) {
    await deps.repository.finish(claim, { status: "failed", errorCode: "retry_limit_reached" });
    return { kind: "retry_limit" } as const;
  }
  const defer = (errorCode?: "provider_failure" | "output_persistence_failure") => deps.repository.finish(claim, {
    status: job.status === "queued" ? "queued" : "processing", errorCode,
    delaySeconds: Math.min(300, 10 * 2 ** Math.min(job.attempts, 5)),
  });
  try {
    let output = await deps.media.recover(job);
    if (!output) {
      const status = await deps.transport.getStatus(planned.plan.endpointId, job.providerRequestId);
      if (!["queued", "processing", "completed"].includes(status)) throw new Error("Invalid status.");
      if (status !== "completed") {
        await deps.repository.finish(claim, { status: status === "queued" && job.status === "queued" ? "queued" : "processing", delaySeconds: 15 });
        return { kind: "pending" } as const;
      }
      const file = await deps.transport.getResult(planned.plan.endpointId, job.providerRequestId);
      try { output = await deps.media.persist(job, file); }
      catch (error) {
        if (error instanceof UgcOutputInvalidError) {
          await deps.repository.finish(claim, { status: "failed", errorCode: "output_invalid" });
          return { kind: "invalid_output" } as const;
        }
        await defer("output_persistence_failure");
        return { kind: "output_retry" } as const;
      }
    }
    // Foundation SQL requires queued -> processing -> succeeded, with all output fields in the last write.
    const committed = await deps.repository.finish(claim, { status: "succeeded", output });
    return { kind: committed ? "succeeded" : "stale_claim" } as const;
  } catch (error) {
    if (error instanceof UgcOutputInvalidError) {
      await deps.repository.finish(claim, { status: "failed", errorCode: "output_invalid" });
      return { kind: "invalid_output" } as const;
    }
    await defer("provider_failure");
    return { kind: "retry" } as const;
  }
}
