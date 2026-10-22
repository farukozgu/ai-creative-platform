import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CandidateJobStatus } from "@/lib/models/candidate-contracts";

export type ReviewCandidate = { id: string; status: "pending" | "ready" | "failed" | "rejected"; createdAt: string; previewUrl: string | null; appearance: Record<string, string> };
export type ReviewReference = { id: string; view: "front" | "three_quarter" | "side"; previewUrl: string | null };
export type CandidateReviewData = { state: "ready" | "unavailable"; jobStatus: CandidateJobStatus | "unknown" | null; candidates: ReviewCandidate[]; version: number | null; references: ReviewReference[] };

export async function getCandidateReview(userId: string, modelId: string): Promise<CandidateReviewData> {
  const unavailable: CandidateReviewData = { state: "unavailable", jobStatus: null, candidates: [], version: null, references: [] };
  const supabase = await createClient();
  const [jobs, candidates, versions] = await Promise.all([
    supabase.from("model_candidate_jobs").select("status").eq("user_id", userId).eq("model_id", modelId).order("created_at", { ascending: false }).limit(1),
    supabase.from("model_candidates").select("id,status,created_at,appearance_snapshot,primary_reference_asset_id").eq("user_id", userId).eq("model_id", modelId).order("created_at", { ascending: false }),
    supabase.from("model_identity_versions").select("id,version_number").eq("user_id", userId).eq("model_id", modelId).order("version_number", { ascending: false }).limit(1),
  ]);
  if (jobs.error || candidates.error || versions.error) return unavailable;
  const version = versions.data?.[0] ?? null;
  const referenceLinks = version ? await supabase.from("model_identity_version_references").select("reference_asset_id,view").eq("identity_version_id", version.id) : null;
  if (referenceLinks?.error) return unavailable;
  const ids = [...new Set([...(candidates.data ?? []).map((item) => item.primary_reference_asset_id).filter((id): id is string => !!id), ...(referenceLinks?.data ?? []).map((item) => item.reference_asset_id)])];
  const assets = ids.length ? await supabase.from("model_reference_assets").select("id,bucket_id,object_path").eq("user_id", userId).eq("model_id", modelId).in("id", ids) : null;
  if (assets?.error) return unavailable;
  const previews = new Map<string, string>();
  await Promise.all((assets?.data ?? []).map(async (asset) => {
    const { data, error } = await supabase.storage.from(asset.bucket_id).createSignedUrl(asset.object_path, 300);
    if (!error && data?.signedUrl) previews.set(asset.id, `/api/model-reference/${asset.id}`);
  }));
  const knownStatuses: CandidateJobStatus[] = ["queued", "processing", "succeeded", "failed", "ambiguous"];
  const rawStatus = jobs.data?.[0]?.status;
  return {
    state: "ready",
    jobStatus: rawStatus ? knownStatuses.includes(rawStatus as CandidateJobStatus) ? rawStatus as CandidateJobStatus : "unknown" : null,
    candidates: (candidates.data ?? []).map((item) => ({
      id: item.id, status: item.status as ReviewCandidate["status"], createdAt: item.created_at,
      previewUrl: item.primary_reference_asset_id ? previews.get(item.primary_reference_asset_id) ?? null : null,
      appearance: typeof item.appearance_snapshot === "object" && item.appearance_snapshot !== null ? Object.fromEntries(Object.entries(item.appearance_snapshot).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : {},
    })),
    version: version?.version_number ?? null,
    references: (referenceLinks?.data ?? []).filter((item): item is { reference_asset_id: string; view: ReviewReference["view"] } => ["front", "three_quarter", "side"].includes(item.view)).map((item) => ({ id: item.reference_asset_id, view: item.view, previewUrl: previews.get(item.reference_asset_id) ?? null })),
  };
}
