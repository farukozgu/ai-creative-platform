import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { VideoGenerationStatus, VideoJobRecord, VideoJobRepository, VideoReconciliationClaim, VideoReconciliationRepository } from "@/lib/video-generation/types";

type VideoJobRow = Record<string, unknown>;

function mapJob(row: VideoJobRow): VideoJobRecord {
  return {
    id: String(row.id), ownerId: String(row.owner_id), clientSubmissionId: String(row.client_submission_id),
    mode: row.video_mode as VideoJobRecord["mode"], prompt: String(row.creative_direction_snapshot), quality: row.quality as VideoJobRecord["quality"],
    aspectRatio: row.aspect_ratio as VideoJobRecord["aspectRatio"], durationSeconds: row.duration_seconds as VideoJobRecord["durationSeconds"],
    cameraMovement: row.camera_movement as VideoJobRecord["cameraMovement"], sourceKind: row.source_kind as VideoJobRecord["sourceKind"],
    sourceId: row.source_id === null ? null : String(row.source_id), provider: String(row.provider), endpointId: String(row.endpoint_id),
    modelId: String(row.model), providerRequestId: row.provider_request_id === null ? null : String(row.provider_request_id),
    status: row.status as VideoJobRecord["status"], errorCode: row.error_code as VideoJobRecord["errorCode"],
    outputBucketId: row.output_bucket_id === null ? null : String(row.output_bucket_id), outputObjectPath: row.output_object_path === null ? null : String(row.output_object_path),
    outputMimeType: row.output_mime_type === null ? null : String(row.output_mime_type), outputSizeBytes: row.output_size_bytes === null ? null : Number(row.output_size_bytes),
    estimatedProviderCostUsd: row.estimated_provider_cost_usd === null ? null : Number(row.estimated_provider_cost_usd),
    actualProviderCostUsd: row.cost_usd === null ? null : Number(row.cost_usd),
    billingReservationId: row.billing_reservation_id === null ? null : String(row.billing_reservation_id), billingStatus: row.billing_status as VideoJobRecord["billingStatus"],
    reconciliationAttempts: Number(row.reconciliation_attempts), nextReconciliationAt: row.next_reconciliation_at === null ? null : String(row.next_reconciliation_at),
    createdAt: String(row.created_at), startedAt: row.processing_started_at === null ? null : String(row.processing_started_at), completedAt: row.processing_completed_at === null ? null : String(row.processing_completed_at),
  };
}

function insertRow(input: Parameters<VideoJobRepository["createOrGet"]>[0]) {
  return {
    owner_id: input.ownerId, project_id: null, input_asset_id: null, generation_type: "video",
    client_submission_id: input.clientSubmissionId, video_mode: input.mode, creative_direction_snapshot: input.prompt,
    quality: input.quality, aspect_ratio: input.aspectRatio, duration_seconds: input.durationSeconds,
    camera_movement: input.cameraMovement, source_kind: input.sourceKind, source_id: input.sourceId,
    provider: input.provider, endpoint_id: input.endpointId, model: input.modelId, provider_request_id: input.providerRequestId,
    status: input.status, error_code: input.errorCode, output_bucket_id: input.outputBucketId,
    output_object_path: input.outputObjectPath, output_mime_type: input.outputMimeType, output_size_bytes: input.outputSizeBytes,
    estimated_provider_cost_usd: input.estimatedProviderCostUsd, cost_usd: input.actualProviderCostUsd,
    billing_reservation_id: input.billingReservationId, billing_status: input.billingStatus,
  };
}

function patchRow(patch: Partial<VideoJobRecord>) {
  const row: Record<string, unknown> = {};
  const mappings: Record<string, keyof VideoJobRecord> = {
    status: "status", error_code: "errorCode", provider_request_id: "providerRequestId", output_bucket_id: "outputBucketId",
    output_object_path: "outputObjectPath", output_mime_type: "outputMimeType", output_size_bytes: "outputSizeBytes",
    cost_usd: "actualProviderCostUsd", billing_status: "billingStatus",
  };
  for (const [column, key] of Object.entries(mappings)) if (key in patch) row[column] = patch[key];
  return row;
}

export class SupabaseVideoJobRepository implements VideoReconciliationRepository {
  private client() { return getSupabaseAdminClient(); }

  async createOrGet(input: Parameters<VideoJobRepository["createOrGet"]>[0]) {
    const supabase = this.client();
    const result = await supabase.from("generations").insert(insertRow(input)).select("*").single();
    if (!result.error && result.data) return { job: mapJob(result.data), created: true };
    if (result.error?.code !== "23505") throw new Error("Unable to persist the video generation.");
    const existing = await supabase.from("generations").select("*").eq("generation_type", "video").eq("owner_id", input.ownerId).eq("client_submission_id", input.clientSubmissionId).single();
    if (existing.error || !existing.data) throw new Error("Unable to recover the idempotent video generation.");
    return { job: mapJob(existing.data), created: false };
  }

  async findOwned(ownerId: string, jobId: string) {
    const { data, error } = await this.client().from("generations").select("*").eq("generation_type", "video").eq("id", jobId).eq("owner_id", ownerId).maybeSingle();
    return error || !data ? null : mapJob(data);
  }
  async findById(jobId: string) {
    const { data, error } = await this.client().from("generations").select("*").eq("generation_type", "video").eq("id", jobId).maybeSingle();
    return error || !data ? null : mapJob(data);
  }
  async listOwned(ownerId: string) {
    const { data, error } = await this.client().from("generations").select("*").eq("generation_type", "video").eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error("Unable to list video generations.");
    return (data ?? []).map(mapJob);
  }
  async attachProviderRequest(jobId: string, requestId: string) {
    const { data, error } = await this.client().from("generations").update({ provider_request_id: requestId }).eq("generation_type", "video").eq("id", jobId).is("provider_request_id", null).eq("status", "queued").select("*").single();
    if (error || !data) throw new Error("Unable to attach the provider request identifier.");
    return mapJob(data);
  }
  async transition(jobId: string, from: readonly VideoGenerationStatus[], patch: Partial<VideoJobRecord>) {
    const { data, error } = await this.client().from("generations").update(patchRow(patch)).eq("generation_type", "video").eq("id", jobId).in("status", [...from]).select("*").maybeSingle();
    if (error) throw new Error("Unable to transition the video generation.");
    return data ? mapJob(data) : null;
  }
  async scheduleReconciliation(jobId: string, attempts: number, nextAt: string | null) {
    const { error } = await this.client().from("generations").update({ reconciliation_attempts: attempts, next_reconciliation_at: nextAt }).eq("generation_type", "video").eq("id", jobId).in("status", ["queued", "processing"]);
    if (error) throw new Error("Unable to schedule video reconciliation.");
  }
  async claimDueVideoReconciliations(batchSize: number, leaseSeconds: number): Promise<VideoReconciliationClaim[]> {
    const { data, error } = await this.client().rpc("claim_due_video_reconciliations", {
      p_batch_size: batchSize,
      p_lease_seconds: leaseSeconds,
    });
    if (error) throw new Error("Unable to claim due video reconciliations.");
    return (data ?? []).map((row: VideoJobRow) => ({
      job: mapJob(row),
      leaseToken: String(row.reconciliation_lease_token),
      leaseVersion: Number(row.reconciliation_lease_version),
      leaseExpiresAt: String(row.reconciliation_lease_expires_at),
    }));
  }
  async transitionClaimed(claim: VideoReconciliationClaim, from: readonly VideoGenerationStatus[], patch: Partial<VideoJobRecord>) {
    const { data, error } = await this.client().from("generations").update(patchRow(patch))
      .eq("generation_type", "video").eq("id", claim.job.id).in("status", [...from])
      .eq("reconciliation_lease_token", claim.leaseToken).eq("reconciliation_lease_version", claim.leaseVersion)
      .gt("reconciliation_lease_expires_at", new Date().toISOString()).select("*").maybeSingle();
    if (error) throw new Error("Unable to transition the claimed video generation.");
    return data ? mapJob(data) : null;
  }
  async scheduleClaimedReconciliation(claim: VideoReconciliationClaim, attempts: number, nextAt: string | null) {
    const { data, error } = await this.client().from("generations").update({
      reconciliation_attempts: attempts, next_reconciliation_at: nextAt,
      reconciliation_lease_token: null, reconciliation_lease_expires_at: null,
    }).eq("generation_type", "video").eq("id", claim.job.id)
      .eq("reconciliation_lease_token", claim.leaseToken).eq("reconciliation_lease_version", claim.leaseVersion)
      .gt("reconciliation_lease_expires_at", new Date().toISOString()).select("id").maybeSingle();
    if (error) throw new Error("Unable to schedule the claimed video reconciliation.");
    return Boolean(data);
  }
}
