import "server-only";

import { createClient } from "@/lib/supabase/server";

export type IdentityReferenceAsset = {
  id: string;
  modelId: string;
  userId: string;
  source: "candidate_generated";
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  data: Uint8Array | null;
};

export type ApprovedIdentityVersionRecord = {
  modelId: string;
  userId: string;
  status: "approved";
  identityVersionId: string;
  identityVersionNumber: number;
  references: readonly { assetId: string; view: "front" | "three_quarter" | "side" }[];
};

export type IdentityReferenceRepository = {
  getApprovedVersion(userId: string, modelId: string, identityVersionId: string): Promise<ApprovedIdentityVersionRecord | null>;
  getPrivateAsset(userId: string, assetId: string): Promise<IdentityReferenceAsset | null>;
};

/** Production adapter; callers still supply only IDs, never storage paths or URLs. */
export function createSupabaseIdentityReferenceRepository(): IdentityReferenceRepository {
  return {
    async getApprovedVersion(userId, modelId, identityVersionId) {
      const supabase = await createClient();
      const { data: profile, error: profileError } = await supabase.from("model_profiles").select("id,status,current_identity_version_id").eq("id", modelId).eq("user_id", userId).eq("status", "approved").maybeSingle();
      if (profileError || !profile || profile.current_identity_version_id !== identityVersionId) return null;
      const { data: version, error: versionError } = await supabase.from("model_identity_versions").select("id,model_id,user_id,version_number").eq("id", identityVersionId).eq("model_id", modelId).eq("user_id", userId).maybeSingle();
      if (versionError || !version) return null;
      const { data: references, error: referencesError } = await supabase.from("model_identity_version_references").select("reference_asset_id,view").eq("identity_version_id", identityVersionId);
      if (referencesError) return null;
      const validViews = new Set(["front", "three_quarter", "side"]);
      return { modelId, userId, status: "approved", identityVersionId, identityVersionNumber: version.version_number, references: (references ?? []).flatMap((reference) => typeof reference.reference_asset_id === "string" && validViews.has(reference.view) ? [{ assetId: reference.reference_asset_id, view: reference.view as "front" | "three_quarter" | "side" }] : []) };
    },
    async getPrivateAsset(userId, assetId) {
      const supabase = await createClient();
      const { data: asset, error } = await supabase.from("model_reference_assets").select("id,model_id,user_id,source,mime_type,bucket_id,object_path").eq("id", assetId).eq("user_id", userId).eq("source", "candidate_generated").maybeSingle();
      if (error || !asset || !["image/jpeg", "image/png", "image/webp"].includes(asset.mime_type)) return null;
      const download = await supabase.storage.from(asset.bucket_id).download(asset.object_path);
      if (download.error || !download.data) return null;
      return { id: asset.id, modelId: asset.model_id, userId: asset.user_id, source: "candidate_generated", mimeType: asset.mime_type as IdentityReferenceAsset["mimeType"], data: new Uint8Array(await download.data.arrayBuffer()) };
    },
  };
}

export type ResolvedIdentityReferences = {
  modelId: string;
  identityVersionId: string;
  identityVersionNumber: number;
  primaryPortrait: IdentityReferenceAsset;
  additionalEvidence: readonly IdentityReferenceAsset[];
};

export type IdentityReferenceResolution =
  | { ok: true; value: ResolvedIdentityReferences }
  | { ok: false; code: "unauthenticated" | "invalid_or_stale" | "missing_primary_portrait" | "private_asset_unavailable" };

/** Resolves a pinned version only; it intentionally has no 'latest version' fallback. */
export async function resolveApprovedIdentityReferences(input: {
  userId: string | null;
  modelId: string;
  identityVersionId: string;
  repository: IdentityReferenceRepository;
}): Promise<IdentityReferenceResolution> {
  if (!input.userId) return { ok: false, code: "unauthenticated" };
  const version = await input.repository.getApprovedVersion(input.userId, input.modelId, input.identityVersionId);
  if (!version || version.userId !== input.userId || version.modelId !== input.modelId || version.identityVersionId !== input.identityVersionId || version.status !== "approved") return { ok: false, code: "invalid_or_stale" };
  const primary = version.references.find((reference) => reference.view === "front");
  if (!primary) return { ok: false, code: "missing_primary_portrait" };
  const assets = await Promise.all(version.references.map(async (reference) => ({ reference, asset: await input.repository.getPrivateAsset(input.userId!, reference.assetId) })));
  const valid = assets.every(({ reference, asset }) => asset && asset.id === reference.assetId && asset.userId === input.userId && asset.modelId === input.modelId && asset.source === "candidate_generated" && asset.data);
  if (!valid) return { ok: false, code: "private_asset_unavailable" };
  const primaryPortrait = assets.find(({ reference }) => reference.assetId === primary.assetId)?.asset;
  if (!primaryPortrait?.data) return { ok: false, code: "private_asset_unavailable" };
  return { ok: true, value: { modelId: version.modelId, identityVersionId: version.identityVersionId, identityVersionNumber: version.identityVersionNumber, primaryPortrait, additionalEvidence: assets.filter(({ reference }) => reference.assetId !== primary.assetId).map(({ asset }) => asset!).filter((asset): asset is IdentityReferenceAsset => Boolean(asset.data)) } };
}
