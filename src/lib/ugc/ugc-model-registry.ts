import "server-only";

import type { UgcModelIdentity, UgcModelOption, UgcModelTier } from "@/features/ugc/ugc-model-contract";
import type { UgcOwnedProject, UgcResult } from "@/features/ugc/ugc-studio-contract";

import { videoEndpointCapabilities } from "@/lib/video-generation/capabilities";

const ratios = ["9:16", "1:1", "16:9"] as const;
export const ugcModelRegistry = {
  standard: {
    identity: { tier: "standard", provider: "fal", endpointId: videoEndpointCapabilities.klingV3StandardImage.endpointId, version: 1 },
    modelId: videoEndpointCapabilities.klingV3StandardImage.id,
    supported: { durations: [15], aspectRatios: ratios, resolution: "source-derived" },
  },
  premium: {
    identity: { tier: "premium", provider: "fal", endpointId: videoEndpointCapabilities.klingV3ProImage.endpointId, version: 1 },
    modelId: videoEndpointCapabilities.klingV3ProImage.id,
    supported: { durations: [15], aspectRatios: ratios, resolution: "source-derived" },
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
