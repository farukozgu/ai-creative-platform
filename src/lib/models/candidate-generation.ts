import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { parseModelAppearanceDraft } from "@/features/models/model-profile";
import { resolveCandidateProviderRequest, type CandidateProvider } from "./candidate-engine";
import { candidateObjectPath, validateCandidateImage } from "./candidate-orchestration";

export type CandidateGenerationStatus = "success" | "duplicate" | "invalid" | "error";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Server caller supplies the authenticated owner and admin client, never client input. */
export async function generateModelCandidate(admin: SupabaseClient, provider: CandidateProvider, userId: string, modelId: string): Promise<CandidateGenerationStatus> {
  if (!uuid.test(userId) || !uuid.test(modelId)) return "invalid";
  const profile = await admin.from("model_profiles").select("name,notes,appearance,status").eq("id", modelId).eq("user_id", userId).maybeSingle();
  if (profile.error || !profile.data || profile.data.status !== "draft") return "invalid";
  const appearance = parseModelAppearanceDraft({ ...profile.data.appearance, name: profile.data.name, notes: profile.data.notes ?? "" });
  const request = appearance && resolveCandidateProviderRequest(appearance);
  if (!request || !appearance || request.prompt.length > 12000) return "invalid";

  const jobId = randomUUID(), candidateId = randomUUID();
  const owner = { user_id: userId, model_id: modelId };
  // A stable, server-chosen key makes the existing UNIQUE constraint the paid-call
  // gate across tabs, requests and server instances. This launch allows one attempt
  // per profile, including failures; ambiguous calls are never retried automatically.
  const inserted = await admin.from("model_candidate_jobs").insert({
    id: jobId, ...owner, idempotency_key: modelId, status: "queued",
    provider: "openai", model: request.model, appearance_snapshot: appearance,
  });
  if (inserted.error) return inserted.error.code === "23505" ? "duplicate" : "error";

  async function updateJob(values: Record<string, unknown>) {
    const result = await admin.from("model_candidate_jobs").update(values).eq("id", jobId).eq("user_id", userId).eq("model_id", modelId).select("id").single();
    if (result.error || !result.data) throw new Error("Candidate job persistence failed.");
  }
  let submitting = false, received = false, candidateCreated = false, ready = false;
  let errorCode = "candidate_persistence_failed";
  try {
    const candidate = await admin.from("model_candidates").insert({ id: candidateId, job_id: jobId, ...owner, status: "pending", appearance_snapshot: appearance });
    if (candidate.error) throw new Error("Candidate insert failed.");
    candidateCreated = true;
    await updateJob({ status: "processing", submission_state: "submitting", provider_submitted_at: new Date().toISOString() });
    submitting = true;
    errorCode = "provider_outcome_unknown";
    const output = await provider.generate(request);
    received = true;
    errorCode = "candidate_persistence_failed";
    await updateJob({ submission_state: "submitted", provider_metadata: { requestId: output.providerRequestId, usage: output.usage ?? {} } });
    errorCode = "invalid_provider_image";
    if (!await validateCandidateImage(output)) throw new Error("Invalid candidate image.");
    errorCode = "candidate_persistence_failed";
    const assetId = randomUUID();
    const path = candidateObjectPath({ jobId, ownerId: userId, modelId, leaseToken: "", leaseVersion: 0 }, candidateId);
    const upload = await admin.storage.from("model-reference-assets").upload(path, output.imageData, { contentType: "image/png", upsert: false });
    if (upload.error) throw new Error("Candidate upload failed.");
    const asset = await admin.from("model_reference_assets").insert({ id: assetId, ...owner, bucket_id: "model-reference-assets", object_path: path, source: "candidate_generated", mime_type: "image/png", byte_size: output.imageData.length });
    if (asset.error) throw new Error("Candidate reference persistence failed.");
    const finalized = await admin.from("model_candidates").update({ status: "ready", primary_reference_asset_id: assetId, finalized_at: new Date().toISOString() }).eq("id", candidateId).eq("job_id", jobId).eq("user_id", userId).eq("model_id", modelId).select("id").single();
    if (finalized.error || !finalized.data) throw new Error("Candidate persistence failed.");
    ready = true;
    await updateJob({ status: "succeeded", submission_state: "persisted", error_code: null });
    return "success";
  } catch {
    const ambiguous = submitting && !received;
    // Preserve any already-persisted evidence; never report partial writes as success.
    try {
      if (candidateCreated && !ready) await admin.from("model_candidates").update({ status: "failed", finalized_at: new Date().toISOString() }).eq("id", candidateId).eq("user_id", userId).eq("model_id", modelId);
      await updateJob({ status: ambiguous ? "ambiguous" : "failed", submission_state: ambiguous ? "ambiguous" : received ? "submitted" : "not_started", error_code: errorCode, reconciliation_required_at: new Date().toISOString() });
    } catch { console.error("[model-candidate] failure state persistence unavailable", { jobId }); }
    return "error";
  }
}
