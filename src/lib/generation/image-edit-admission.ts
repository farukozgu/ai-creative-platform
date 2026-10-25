import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
export { createImageEditRequestFingerprint, IMAGE_EDIT_ACTIVE_LIMIT_DEFAULT, isImageEditAvailableForUser, isImageEditExecutionEnabled, validateImageEditSubmissionId } from "@/lib/generation/image-edit-admission-contract";

export type ImageEditAdmissionState = "admitted" | "preparing_submission" | "possibly_submitted" | "provider_responded" | "output_persisted" | "reconciliation_required" | "failed_pre_provider" | "failed_terminal";
export type ImageEditAdmissionDecision =
  | { kind: "admitted"; admissionId: string; generationId: string | null; leaseToken: string; leaseVersion: number }
  | { kind: "replay"; generationId: string | null; state: ImageEditAdmissionState }
  | { kind: "rejected"; reason: "payload_conflict" | "capacity" | "unauthorized" | "unavailable" };

type AdmissionRow = { outcome: string; admission_id: string | null; generation_id: string | null; state: ImageEditAdmissionState | null; lease_token: string | null; lease_version: number | null };

/** Calls the additive SQL RPC; it serializes admission per owner before any provider request. */
export async function admitImageEdit(input: { ownerId: string; projectId: string; baseGenerationId: string; submissionId: string; fingerprint: string }): Promise<ImageEditAdmissionDecision> {
  try {
    const { data, error } = await getSupabaseAdminClient().rpc("admit_image_edit", {
      p_owner_id: input.ownerId, p_project_id: input.projectId, p_base_generation_id: input.baseGenerationId,
      p_submission_id: input.submissionId, p_request_fingerprint: input.fingerprint,
    });
    const row = (data?.[0] ?? null) as AdmissionRow | null;
    if (error || !row) return { kind: "rejected", reason: "unavailable" };
    if (row.outcome === "admitted" && row.admission_id && row.lease_token && typeof row.lease_version === "number" && Number.isSafeInteger(row.lease_version)) return { kind: "admitted", admissionId: row.admission_id, generationId: row.generation_id, leaseToken: row.lease_token, leaseVersion: row.lease_version };
    if (row.outcome === "replay" && row.state) return { kind: "replay", generationId: row.generation_id, state: row.state };
    if (row.outcome === "payload_conflict" || row.outcome === "capacity" || row.outcome === "unauthorized") return { kind: "rejected", reason: row.outcome };
    return { kind: "rejected", reason: "unavailable" };
  } catch {
    return { kind: "rejected", reason: "unavailable" };
  }
}

export async function bindImageEditAdmission(input: { admissionId: string; leaseToken: string; leaseVersion: number; generationId: string }) {
  const { data, error } = await getSupabaseAdminClient().rpc("bind_image_edit_admission_generation", {
    p_admission_id: input.admissionId, p_lease_token: input.leaseToken, p_lease_version: input.leaseVersion, p_generation_id: input.generationId,
  });
  return !error && data === true;
}

export async function transitionImageEditAdmission(input: { admissionId: string; leaseToken: string; leaseVersion: number; state: ImageEditAdmissionState }) {
  const { data, error } = await getSupabaseAdminClient().rpc("transition_image_edit_admission", {
    p_admission_id: input.admissionId, p_lease_token: input.leaseToken, p_lease_version: input.leaseVersion, p_state: input.state,
  });
  return !error && data === true;
}
