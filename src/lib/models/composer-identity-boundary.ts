import "server-only";

import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { listComposerModelIdentities, type ComposerModelIdentity } from "./composer-model-selection";

export type ComposerIdentitySelection = Pick<ComposerModelIdentity, "modelId" | "identityVersionId" | "identityVersionNumber" | "referenceAssetIds">;
export type ComposerIdentityValidation =
  | { ok: true; selection: ComposerIdentitySelection }
  | { ok: false; code: "unauthenticated" | "unavailable" | "invalid_or_stale" | "missing_references" | "identity_generation_disabled" };

/**
 * Future generation code must call this boundary rather than trusting an ID
 * posted from the Composer. The phase gate deliberately keeps its result closed.
 */
export async function validateComposerIdentitySelection(value: unknown): Promise<ComposerIdentityValidation> {
  const userId = await getAuthenticatedUserId();
  if (!userId) return { ok: false, code: "unauthenticated" };
  if (!value || typeof value !== "object") return { ok: false, code: "invalid_or_stale" };
  const candidate = value as { modelId?: unknown; identityVersionId?: unknown };
  if (typeof candidate.modelId !== "string" || typeof candidate.identityVersionId !== "string") return { ok: false, code: "invalid_or_stale" };
  const library = await listComposerModelIdentities(userId);
  if (library.state === "unavailable") return { ok: false, code: "unavailable" };
  const selected = library.models.find((model) => model.modelId === candidate.modelId && model.identityVersionId === candidate.identityVersionId);
  if (!selected) return { ok: false, code: "invalid_or_stale" };
  if (!selected.referenceAssetIds.length) return { ok: false, code: "missing_references" };
  return { ok: false, code: "identity_generation_disabled" };
}
