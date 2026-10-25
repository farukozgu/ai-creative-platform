import "server-only";

import { createHash } from "node:crypto";
import { validateUgcDraftInput } from "@/features/ugc/ugc-studio-contract";
import { canonicalUgcJson, isObject, isOwnedUgcImage, isUgcUuid } from "@/lib/ugc/ugc-request-planner";
import type { UgcPlanningIssue, UgcPlanningResult, UgcPrivateImage, UgcSnapshotJob, UgcVisualBrief } from "@/lib/ugc/ugc-request-planner";
import type { UgcDraftSettings } from "@/features/ugc/ugc-studio-contract";
import { planUgcSeedanceAudio } from "@/lib/ugc/ugc-seedance-audio";
import type { UgcSeedanceAudioPlan } from "@/lib/ugc/ugc-seedance-audio";
import { isUgcModelIdentity, ugcModelRegistry } from "@/lib/ugc/ugc-model-registry";
import type { UgcModelIdentity } from "@/features/ugc/ugc-model-contract";

/** UGC-only route. Never add this to or resolve it through Video Studio's registry. */
export const ugcSeedanceRoute = {
  provider: "fal", modelId: ugcModelRegistry.premium.modelId, endpointId: ugcModelRegistry.premium.identity.endpointId,
} as const;

export type UgcSeedanceVisualPlan = {
  version: 2;
  snapshotDigest: string;
  provider: typeof ugcSeedanceRoute.provider;
  modelId: typeof ugcSeedanceRoute.modelId;
  endpointId: typeof ugcSeedanceRoute.endpointId;
  durationSeconds: 15 | 30;
  aspectRatio: UgcDraftSettings["aspectRatio"];
  resolution: "720p";
  generateAudio: boolean;
  /** Omitted for historical silent plans to preserve their canonical identity. */
  audio?: UgcSeedanceAudioPlan;
  prompt: string;
  // Positional references, never a Kling start frame or elements payload.
  images: [UgcPrivateImage, UgcPrivateImage];
  brief: UgcVisualBrief;
  model?: UgcModelIdentity;
};

export type UgcMiniVisualPlan = Omit<UgcSeedanceVisualPlan, "version" | "modelId" | "endpointId" | "durationSeconds" | "model"> & {
  version: 3; modelId: typeof ugcModelRegistry.standard.modelId;
  endpointId: typeof ugcModelRegistry.standard.identity.endpointId; durationSeconds: 15; model: UgcModelIdentity;
};

/** Preparation only: existing drafts/snapshots are not converted or rehashed. */
export function planUgcSeedanceRequest(job: UgcSnapshotJob): UgcPlanningResult<UgcSeedanceVisualPlan> {
  const result = planSeedanceModel(job, ugcModelRegistry.premium);
  if (!result.ok) return result;
  return result.plan.version === 2 ? { ok: true, plan: result.plan } : { ok: false, code: "invalid_snapshot", issues: ["invalid_snapshot"] };
}

export function planUgcModelRequest(job: UgcSnapshotJob): UgcPlanningResult<UgcSeedanceVisualPlan | UgcMiniVisualPlan> {
  const model = job.requestSnapshot.model;
  if (model === undefined || isUgcModelIdentity(model, "premium")) return planUgcSeedanceRequest(job);
  if (isUgcModelIdentity(model, "standard")) return planSeedanceModel(job, ugcModelRegistry.standard);
  return { ok: false, code: "invalid_snapshot", issues: ["invalid_snapshot"] };
}

function planSeedanceModel(job: UgcSnapshotJob, model: (typeof ugcModelRegistry)[keyof typeof ugcModelRegistry]): UgcPlanningResult<UgcSeedanceVisualPlan | UgcMiniVisualPlan> {
  if (![job.id, job.ownerId, job.projectId].every(isUgcUuid) || !/^[0-9a-f]{64}$/.test(job.requestHash)) {
    return { ok: false, code: "invalid_snapshot", issues: ["invalid_snapshot"] };
  }
  const snapshot = structuredClone(job.requestSnapshot);
  if ((snapshot.model !== undefined && !isUgcModelIdentity(snapshot.model, model.identity.tier))
    || (model.identity.tier === "standard" && snapshot.model === undefined)) {
    return { ok: false, code: "invalid_snapshot", issues: ["invalid_snapshot"] };
  }
  const creator = snapshot.creatorConcept;
  const parsed = validateUgcDraftInput({ id: job.projectId, creatorConceptId: isObject(creator) ? creator.selectionId : undefined,
    format: snapshot.format, script: snapshot.script, spokenDialogue: snapshot.spokenDialogue,
    sceneDirection: snapshot.sceneDirection, settings: snapshot.settings });
  if (!parsed.ok) return { ok: false, code: "invalid_snapshot", issues: ["invalid_snapshot"] };
  const draft = parsed.value;
  const issues: UgcPlanningIssue[] = [];
  if (!(model.supported.durations as readonly number[]).includes(Number(draft.settings.duration))) issues.push("unsupported_duration");
  if (!isObject(creator) || creator.referenceType !== "image_reference") issues.push("creator_reference_unavailable");
  if (!draft.sceneDirection.trim()) issues.push("scene_direction_required");
  const audio = planUgcSeedanceAudio(job, draft, snapshot.seedanceAudio);
  if (!audio.ok) issues.push(...audio.issues);
  if (audio.ok && audio.plan.mode === "reference") issues.push("audio_reference_storage_unavailable");
  if (audio.ok && audio.plan.mode === "reference" && (audio.plan.references.length > model.documented.maxAudioReferences
    || audio.plan.references.reduce((total, ref) => total + ref.durationSeconds, 0) > model.documented.maxAudioSeconds)) issues.push("audio_reference_invalid");
  if (draft.settings.subtitles) issues.push("subtitles_unsupported");
  // Reject additional modalities and old provider inputs, rather than silently discarding them.
  const refs = snapshot.seedanceReferences;
  if (snapshot.referenceImages !== undefined || snapshot.video_urls !== undefined || snapshot.audio_urls !== undefined
    || (isObject(refs) && Object.keys(refs).some(key => key !== "creator" && key !== "product"))) {
    issues.push("reference_inputs_unsupported");
  }
  if (!isObject(refs) || !isOwnedUgcImage(job, refs.creator) || !isOwnedUgcImage(job, refs.product)) {
    return { ok: false, code: "unsupported_capability", issues: [...issues, "reference_images_unavailable"] };
  }
  if (!isObject(snapshot.product) || snapshot.product.objectPath !== refs.product.objectPath) issues.push("product_image_unavailable");
  if ([refs.creator, refs.product].some(image => image.width < 300 || image.height < 300
    || image.width / image.height < 0.4 || image.width / image.height > 2.5)) issues.push("reference_images_unavailable");
  let prompt = `${draft.sceneDirection}\nCreator: @Image1. Product: @Image2.\nEnvironment: ${draft.settings.environment}. Lighting: ${draft.settings.lighting}. Framing: ${draft.settings.framing}. Format: ${draft.format}. Tone: ${draft.settings.tone}.`;
  if (audio.ok && audio.plan.mode === "reference") prompt += `\nAudio guidance: ${audio.plan.references.map((_, index) => `@Audio${index + 1}`).join(", ")}.`;
  // Conservative application limit, not a claimed provider maximum.
  if ([...prompt].length > 3000) issues.push("prompt_too_long");
  if (issues.length || !audio.ok) return { ok: false, code: "unsupported_capability", issues };
  const snapshotDigest = createHash("sha256").update(canonicalUgcJson(snapshot)).digest("hex");
  if (job.requestHash !== snapshotDigest) return { ok: false, code: "invalid_snapshot", issues: ["invalid_snapshot"] };
  const shared = {
    snapshotDigest, provider: "fal" as const, aspectRatio: draft.settings.aspectRatio,
    resolution: model.supported.resolution, generateAudio: audio.plan.generateAudio,
    ...(snapshot.seedanceAudio === undefined ? {} : { audio: audio.plan }),
    prompt,
    images: [refs.creator, refs.product],
    brief: { creatorConceptId: draft.creatorConceptId, format: draft.format, language: draft.settings.language,
      voice: draft.settings.voice, tone: draft.settings.tone, sceneDirection: draft.sceneDirection, spokenDialogue: draft.spokenDialogue,
      environment: draft.settings.environment, framing: draft.settings.framing, lighting: draft.settings.lighting },
  };
  return model.identity.tier === "standard"
    ? { ok: true, plan: { ...shared, version: 3, modelId: ugcModelRegistry.standard.modelId, endpointId: ugcModelRegistry.standard.identity.endpointId,
      durationSeconds: 15, model: { ...ugcModelRegistry.standard.identity }, images: [refs.creator, refs.product] } }
    : { ok: true, plan: { ...shared, version: 2, ...ugcSeedanceRoute, durationSeconds: draft.settings.duration === "30" ? 30 : 15,
      ...(snapshot.model === undefined ? {} : { model: { ...ugcModelRegistry.premium.identity } }), images: [refs.creator, refs.product] } };
}
