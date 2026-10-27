import "server-only";

import { createHash } from "node:crypto";
import { validateUgcDraftInput } from "@/features/ugc/ugc-studio-contract";
import { isUgcModelIdentity, ugcModelRegistry } from "@/lib/ugc/ugc-model-registry";
import type { UgcModelIdentity } from "@/features/ugc/ugc-model-contract";
import { videoEndpointCapabilities } from "@/lib/video-generation/capabilities";

export type UgcJobIdentity = { id: string; ownerId: string; projectId: string };
export type UgcSnapshotJob = UgcJobIdentity & { requestHash: string; requestSnapshot: Record<string, unknown> };
export type UgcPrivateImage = { objectPath: string; sha256: string; width: number; height: number };
type ImageElement = { frontal: UgcPrivateImage; references: UgcPrivateImage[] };
export type UgcVisualBrief = {
  creatorConceptId: string; format: string; language: string; voice: string; tone: string;
  sceneDirection: string; spokenDialogue: string; environment: string; framing: string; lighting: string;
};
export type UgcKlingVisualPlan = {
  version: 1;
  /** Set only by the forward migration for pre-pipeline Kling task IDs. */
  legacyTask?: true;
  snapshotDigest: string;
  provider: "fal";
  endpointId: string;
  modelId: string;
  durationSeconds: 15;
  aspectRatio: "9:16" | "1:1" | "16:9";
  prompt: string;
  startImage: UgcPrivateImage;
  elements: [ImageElement, ImageElement];
  // Preferences are retained for review, not represented as supported speech controls.
  brief: UgcVisualBrief;
};
export type UgcModelVisualPlan = Omit<UgcKlingVisualPlan, "version" | "legacyTask"> & { version: 4; model: UgcModelIdentity };
export type UgcVisualPlan = UgcKlingVisualPlan | UgcModelVisualPlan;

/** New jobs must pin one of the two Kling routes; removed model identities fail closed. */
export function planUgcModelRequest(job: UgcSnapshotJob): UgcPlanningResult {
  const model = Object.values(ugcModelRegistry).find(entry => isUgcModelIdentity(job.requestSnapshot.model, entry.identity.tier));
  if (!model) return { ok: false, code: "invalid_snapshot", issues: ["invalid_snapshot"] };
  const planned = planKlingRequest(job);
  if (!planned.ok) return planned;
  return { ok: true, plan: { ...planned.plan, version: 4, model: { ...model.identity }, modelId: model.modelId, endpointId: model.identity.endpointId } };
}
export type UgcPlanningIssue = "invalid_snapshot" | "unsupported_duration" | "creator_reference_unavailable" | "reference_images_unavailable" | "product_image_unavailable" | "source_ratio_mismatch" | "scene_direction_required" | "prompt_too_long" | "exact_dialogue_unverified" | "turkish_speech_unsupported" | "voice_selection_unverified" | "lip_sync_unverified" | "subtitles_unsupported" | "reference_inputs_unsupported" | "audio_settings_unsupported" | "audio_reference_invalid" | "audio_reference_storage_unavailable";
export type UgcPlanningResult<T = UgcVisualPlan> = { ok: true; plan: T } | { ok: false; code: "unsupported_capability" | "invalid_snapshot"; issues: UgcPlanningIssue[] };

export const isUgcUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** PostgreSQL JSONB changes key order, so compare persisted plans canonically. */
export function canonicalUgcJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalUgcJson).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalUgcJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function isOwnedUgcImage(job: UgcJobIdentity, value: unknown): value is UgcPrivateImage {
  if (!isObject(value) || typeof value.objectPath !== "string") return false;
  const parts = value.objectPath.split("/");
  return parts.length === 3 && parts[0] === job.ownerId && parts[1] === job.projectId
    && /^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(parts[2])
    && typeof value.sha256 === "string" && /^[0-9a-f]{64}$/.test(value.sha256)
    && typeof value.width === "number" && Number.isSafeInteger(value.width) && value.width > 0 && value.width <= 4096
    && typeof value.height === "number" && Number.isSafeInteger(value.height) && value.height > 0 && value.height <= 4096;
}

function isElement(job: UgcJobIdentity, value: unknown): value is ImageElement {
  return isObject(value) && isOwnedUgcImage(job, value.frontal) && Array.isArray(value.references)
    && value.references.length >= 1 && value.references.length <= 3 && value.references.every(image => isOwnedUgcImage(job, image));
}

/** Immutable snapshot only. This planner never signs objects, contacts fal or enables generation. */
export function planUgcKlingRequest(job: UgcSnapshotJob): UgcPlanningResult<UgcKlingVisualPlan> {
  if (job.requestSnapshot.model !== undefined) return { ok: false, code: "invalid_snapshot", issues: ["invalid_snapshot"] };
  return planKlingRequest(job);
}

function planKlingRequest(job: UgcSnapshotJob): UgcPlanningResult<UgcKlingVisualPlan> {
  const snapshot = structuredClone(job.requestSnapshot);
  if (![job.id, job.ownerId, job.projectId].every(isUgcUuid) || !/^[0-9a-f]{64}$/.test(job.requestHash)) {
    return { ok: false, code: "invalid_snapshot", issues: ["invalid_snapshot"] };
  }
  const creator = snapshot.creatorConcept;
  const parsed = validateUgcDraftInput({ id: job.projectId, creatorConceptId: isObject(creator) ? creator.selectionId : undefined,
    format: snapshot.format, script: snapshot.script, spokenDialogue: snapshot.spokenDialogue,
    sceneDirection: snapshot.sceneDirection, settings: snapshot.settings });
  if (!parsed.ok) return { ok: false, code: "invalid_snapshot", issues: ["invalid_snapshot"] };
  const draft = parsed.value;
  const issues: UgcPlanningIssue[] = [];
  if (draft.settings.duration !== "15") issues.push("unsupported_duration");
  if (!isObject(creator) || creator.referenceType !== "image_reference") issues.push("creator_reference_unavailable");
  if (!draft.sceneDirection.trim()) issues.push("scene_direction_required");
  if (draft.spokenDialogue.trim()) {
    issues.push("exact_dialogue_unverified", "voice_selection_unverified", "lip_sync_unverified");
    if (draft.settings.language === "tr") issues.push("turkish_speech_unsupported");
  }
  if (draft.settings.subtitles) issues.push("subtitles_unsupported");
  const media = snapshot.referenceImages;
  if (!isObject(media) || !isOwnedUgcImage(job, media.startImage) || !isElement(job, media.creator) || !isElement(job, media.product)) {
    issues.push("reference_images_unavailable");
    return { ok: false, code: "unsupported_capability", issues };
  }
  if (!isObject(snapshot.product) || snapshot.product.objectPath !== media.product.frontal.objectPath) issues.push("product_image_unavailable");
  const [rw, rh] = draft.settings.aspectRatio.split(":").map(Number);
  if (Math.abs(media.startImage.width / media.startImage.height - rw / rh) > 0.01) issues.push("source_ratio_mismatch");
  // Element syntax is documented by fal; no dialogue is appended to the motion prompt.
  const prompt = `${draft.sceneDirection}\nCreator: @Element1. Product: @Element2.\nEnvironment: ${draft.settings.environment}. Lighting: ${draft.settings.lighting}. Framing: ${draft.settings.framing}. Format: ${draft.format}.`;
  if ([...prompt].length > videoEndpointCapabilities.klingV3ProImage.maxPromptLength) issues.push("prompt_too_long");
  if (issues.length) return { ok: false, code: "unsupported_capability", issues };
  // New reference-enabled snapshots must use canonical hashing: JSONB reorders object keys.
  // Legacy draft hashes are not rewritten; their unsupported capabilities are reported above.
  const snapshotDigest = createHash("sha256").update(canonicalUgcJson(snapshot)).digest("hex");
  if (job.requestHash !== snapshotDigest) return { ok: false, code: "invalid_snapshot", issues: ["invalid_snapshot"] };
  return { ok: true, plan: {
    version: 1, snapshotDigest, provider: "fal", modelId: videoEndpointCapabilities.klingV3ProImage.id,
    endpointId: videoEndpointCapabilities.klingV3ProImage.endpointId, durationSeconds: 15,
    aspectRatio: draft.settings.aspectRatio, prompt, startImage: media.startImage, elements: [media.creator, media.product],
    brief: { creatorConceptId: draft.creatorConceptId, format: draft.format, language: draft.settings.language,
      voice: draft.settings.voice, tone: draft.settings.tone, sceneDirection: draft.sceneDirection, spokenDialogue: draft.spokenDialogue,
      environment: draft.settings.environment, framing: draft.settings.framing, lighting: draft.settings.lighting },
  } };
}
