import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ComposerModelIdentity = {
  modelId: string;
  modelName: string;
  identityVersionId: string;
  identityVersionNumber: number;
  referenceAssetIds: readonly string[];
  previewReferenceAssetId: string | null;
};

export type ComposerModelLibrary =
  | { state: "ready"; models: readonly ComposerModelIdentity[] }
  | { state: "unavailable"; models: readonly [] };

type ModelRow = { id: string; name: string; current_identity_version_id: string | null };
type VersionRow = { id: string; model_id: string; version_number: number };
type ReferenceRow = { identity_version_id: string; reference_asset_id: string };

/** Returns display-safe identifiers only; private storage paths never leave this boundary. */
export async function listComposerModelIdentities(userId: string): Promise<ComposerModelLibrary> {
  try {
    const supabase = await createClient();
    const { data: profiles, error: profilesError } = await supabase
      .from("model_profiles")
      .select("id,name,current_identity_version_id")
      .eq("user_id", userId)
      .eq("status", "approved")
      .not("current_identity_version_id", "is", null);
    if (profilesError) return { state: "unavailable", models: [] };

    const profileRows = (profiles ?? []) as ModelRow[];
    const versionIds = profileRows.flatMap((profile) => profile.current_identity_version_id ? [profile.current_identity_version_id] : []);
    if (!versionIds.length) return { state: "ready", models: [] };
    const [{ data: versions, error: versionsError }, { data: references, error: referencesError }] = await Promise.all([
      supabase.from("model_identity_versions").select("id,model_id,version_number").eq("user_id", userId).in("id", versionIds),
      supabase.from("model_identity_version_references").select("identity_version_id,reference_asset_id").in("identity_version_id", versionIds),
    ]);
    if (versionsError || referencesError) return { state: "unavailable", models: [] };
    const versionsById = new Map(((versions ?? []) as VersionRow[]).map((version) => [version.id, version]));
    const refsByVersion = new Map<string, string[]>();
    for (const reference of (references ?? []) as ReferenceRow[]) {
      refsByVersion.set(reference.identity_version_id, [...(refsByVersion.get(reference.identity_version_id) ?? []), reference.reference_asset_id]);
    }
    const models = profileRows.flatMap((profile): ComposerModelIdentity[] => {
      const version = profile.current_identity_version_id ? versionsById.get(profile.current_identity_version_id) : undefined;
      if (!version || version.model_id !== profile.id) return [];
      const referenceAssetIds = refsByVersion.get(version.id) ?? [];
      return [{ modelId: profile.id, modelName: profile.name, identityVersionId: version.id, identityVersionNumber: version.version_number, referenceAssetIds, previewReferenceAssetId: referenceAssetIds[0] ?? null }];
    });
    return { state: "ready", models };
  } catch {
    return { state: "unavailable", models: [] };
  }
}
