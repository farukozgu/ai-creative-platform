"use server";

import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { canAccessVideoBeta } from "@/lib/video-generation/beta-policy";
import { validateVideoGenerationDraft } from "@/lib/video-generation/validation";
import { readOwnedPreparedVideoSource } from "@/lib/video-generation/source-context";
import { isUnsafeProductMotion } from "@/lib/video-generation/preservation";
import { isVideoPresetId } from "@/lib/video-director/presets";
import { getVideoDirectorQuote, prepareVideoDirectorPlan } from "@/lib/video-director/runtime";

export async function quoteVideoDirectorAction() {
  const ownerId = await getAuthenticatedUserId();
  return ownerId ? getVideoDirectorQuote(ownerId) : null;
}

export async function prepareVideoDirectorAction(draft: unknown, presetId: unknown, shotMode: unknown,
  approval?: { maximumCostUsd: number; pricingVersion: string }, existingReceipt?: string) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId || !canAccessVideoBeta(ownerId)) return { status: "unavailable" as const };
  const parsed = validateVideoGenerationDraft(draft);
  if (!parsed.ok || !parsed.value.source || !isVideoPresetId(presetId) || (shotMode !== "single" && shotMode !== "multi")
    || isUnsafeProductMotion(parsed.value.prompt, parsed.value.cameraMovement)) return { status: "invalid" as const };
  try {
    const context = await readOwnedPreparedVideoSource(ownerId, parsed.value.source, parsed.value.aspectRatio);
    const result = await prepareVideoDirectorPlan(ownerId, context.prepared, context.sourceSha256,
      { draft: parsed.value, presetId, shotMode, profile: context.profile }, approval, existingReceipt);
    return result ? { status: "success" as const, ...result } : { status: "approval_required" as const };
  } catch { return { status: "error" as const }; }
}
