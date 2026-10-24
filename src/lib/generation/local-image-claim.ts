import type { LocalImageAuthorization } from "./local-image-budget";

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseLocalImageAuthorization(value: unknown): LocalImageAuthorization | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (![row.generationId, row.projectId, row.ownerId].every((id) => typeof id === "string" && uuidPattern.test(id)) ||
      typeof row.model !== "string" || !/^[a-zA-Z0-9._-]{1,100}$/.test(row.model) ||
      !["high", "xhigh"].includes(String(row.maxQuality)) || row.maxImageCalls !== 1 || row.authorizeAuxiliaryCalls !== true) return null;
  return { generationId: row.generationId as string, projectId: row.projectId as string, ownerId: row.ownerId as string, model: row.model, maxQuality: row.maxQuality as "high" | "xhigh" };
}

/** All predicates are part of one Postgres UPDATE; never a count-then-claim. */
export function selectedImageClaimQuery(input: LocalImageAuthorization) {
  return {
    id: input.generationId, owner_id: input.ownerId, project_id: input.projectId,
    generation_type: "image", provider: "openai", model: input.model,
    status: "queued", execution_attempts: 0, execution_lease_version: 0,
  };
}
