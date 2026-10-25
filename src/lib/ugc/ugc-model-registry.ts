import "server-only";

import type { UgcModelIdentity, UgcModelOption, UgcModelTier } from "@/features/ugc/ugc-model-contract";
import type { UgcOwnedProject, UgcResult } from "@/features/ugc/ugc-studio-contract";

const ratios = ["9:16", "1:1", "16:9"] as const;
export const ugcModelRegistry = {
  standard: {
    identity: { tier: "standard", provider: "fal", endpointId: "bytedance/seedance-2.0/mini/reference-to-video", version: 1 },
    planVersion: 3, modelId: "bytedance/seedance-2.0/mini/reference-to-video",
    documented: { minDuration: 4, maxDuration: 15, maxImages: 9, maxAudioReferences: 3, maxAudioSeconds: 15,
      maxTotalReferences: 12, resolutions: ["480p", "720p"], generateAudio: true, audioReferences: true },
    supported: { durations: [15], aspectRatios: ratios, imageReferences: 2, resolution: "720p", audioModes: ["silent", "native", "reference"] },
  },
  premium: {
    identity: { tier: "premium", provider: "fal", endpointId: "bytedance/seedance-2.5/reference-to-video", version: 1 },
    planVersion: 2, modelId: "seedance-2.5-reference", // Existing internal plan ID, retained for reconciliation.
    documented: { minDuration: 4, maxDuration: 30, maxImages: 30, maxAudioReferences: 10, maxAudioSeconds: 30.2,
      maxTotalReferences: 50, resolutions: ["480p", "720p", "1080p"], generateAudio: true, audioReferences: true },
    supported: { durations: [15, 30], aspectRatios: ratios, imageReferences: 2, resolution: "720p", audioModes: ["silent", "native", "reference"] },
  },
} as const;

export function getUgcModelOptions(): UgcModelOption[] {
  return Object.values(ugcModelRegistry).map(model => ({ tier: model.identity.tier, durations: [...model.supported.durations],
    aspectRatios: [...model.supported.aspectRatios], resolution: model.supported.resolution }));
}

export function isUgcModelIdentity(value: unknown, tier: UgcModelTier): value is UgcModelIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const expected = ugcModelRegistry[tier].identity;
  return Object.keys(record).length === 4 && record.tier === expected.tier && record.provider === expected.provider
    && record.endpointId === expected.endpointId && record.version === expected.version;
}

/** Server preflight before persisting a new job; saving an incompatible draft remains allowed. */
export function resolveUgcPreparationModel(project: UgcOwnedProject): UgcResult<UgcModelIdentity> {
  const tier = project.modelTier ?? "premium";
  if (tier !== "standard" && tier !== "premium") return { ok: false, code: "invalid_input" };
  const model = ugcModelRegistry[tier];
  if (!(model.supported.durations as readonly number[]).includes(Number(project.settings.duration))
    || !(model.supported.aspectRatios as readonly string[]).includes(project.settings.aspectRatio)
    || project.settings.subtitles || project.spokenDialogue.trim()) return { ok: false, code: "unsupported_capability" };
  return { ok: true, value: { ...model.identity } };
}
