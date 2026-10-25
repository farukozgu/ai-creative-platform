import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UgcVisualPlan } from "@/lib/ugc/ugc-request-planner";
import type { UgcClaim, UgcClaimPatch, UgcPipelineJob, UgcPipelineRepository, UgcLegacyKlingTaskPlan } from "@/lib/ugc/ugc-pipeline-types";

function mapJob(row: Record<string, unknown>): UgcPipelineJob {
  return { id: String(row.id), ownerId: String(row.owner_id), projectId: String(row.project_id),
    requestHash: String(row.request_hash), requestSnapshot: row.request_snapshot as Record<string, unknown>,
    status: row.status as UgcPipelineJob["status"], providerRequestId: row.provider_request_id as string | null,
    providerPlan: row.provider_plan as (UgcVisualPlan | UgcLegacyKlingTaskPlan) | null, attempts: Number(row.reconciliation_attempts ?? 0) };
}

/** Requires the separate, unapplied pipeline migration. Not instantiated by any route/action. */
export class SupabaseUgcPipelineRepository implements UgcPipelineRepository {
  async findOwned(ownerId: string, jobId: string) {
    const { data, error } = await getSupabaseAdminClient().from("ugc_video_jobs").select("*").eq("owner_id", ownerId).eq("id", jobId).maybeSingle();
    if (error) throw new Error("UGC job storage unavailable.");
    return data ? mapJob(data) : null;
  }
  private async claim(name: "claim_ugc_submission" | "claim_ugc_reconciliation", params: Record<string, unknown>): Promise<UgcClaim | null> {
    const { data, error } = await getSupabaseAdminClient().rpc(name, params);
    if (error) throw new Error("UGC claim unavailable.");
    const row = (data as Array<Record<string, unknown>> | null)?.[0];
    return row ? { job: mapJob(row), token: String(row.lease_token), version: Number(row.lease_version) } : null;
  }
  claimSubmission(job: UgcPipelineJob, plan: UgcVisualPlan) {
    return this.claim("claim_ugc_submission", { p_owner: job.ownerId, p_job: job.id, p_hash: job.requestHash, p_plan: plan });
  }
  claimReconciliation(ownerId: string, jobId: string) {
    return this.claim("claim_ugc_reconciliation", { p_owner: ownerId, p_job: jobId });
  }
  async isCurrent(claim: UgcClaim) {
    const { data, error } = await getSupabaseAdminClient().rpc("is_ugc_claim_current", {
      p_owner: claim.job.ownerId, p_job: claim.job.id, p_token: claim.token, p_version: claim.version,
    });
    if (error) throw new Error("UGC claim verification unavailable.");
    return data === true;
  }
  async finish(claim: UgcClaim, patch: UgcClaimPatch) {
    const { data, error } = await getSupabaseAdminClient().rpc("finish_ugc_claim", {
      p_owner: claim.job.ownerId, p_job: claim.job.id, p_token: claim.token, p_version: claim.version,
      p_status: patch.status, p_task: patch.providerRequestId ?? null, p_error: patch.errorCode ?? null,
      p_output: patch.output ?? null, p_delay: patch.delaySeconds ?? 0,
    });
    if (error) throw new Error("UGC state update unavailable.");
    return data === true;
  }
}
