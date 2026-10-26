import type { VideoGenerationAspectRatio, VideoGenerationDuration, VideoGenerationMode, VideoGenerationQuality } from "@/lib/video-generation/types";

export type VideoProviderPricing =
  | { basis: "per-second"; audioOffUsdPerSecond: number; audioOnUsdPerSecond: number; voiceControlUsdPerSecond: number | null }
  | { basis: "unconfigured" };

export type VideoEndpointCapability = {
  id: string;
  provider: "fal";
  endpointId: string;
  modes: readonly VideoGenerationMode[];
  durations: readonly VideoGenerationDuration[];
  aspectRatios: readonly VideoGenerationAspectRatio[];
  aspectRatioBehavior: "explicit" | "source-derived";
  resolutions: readonly string[];
  audio: { supported: boolean; defaultEnabled: boolean; customerSetting: "disabled" };
  requiresSource: boolean;
  maxPromptLength: number;
  pricing: VideoProviderPricing;
  productionApproved: boolean;
  documentationUrl: string;
};

export const videoEndpointCapabilities = {
  klingV3ProImage: {
    id: "kling-v3-pro-image",
    provider: "fal",
    endpointId: "fal-ai/kling-video/v3/pro/image-to-video",
    modes: ["image"], durations: [5, 10], aspectRatios: ["16:9", "9:16", "1:1"],
    aspectRatioBehavior: "source-derived", resolutions: ["source-derived"], audio: { supported: true, defaultEnabled: true, customerSetting: "disabled" },
    requiresSource: true, maxPromptLength: 2500,
    pricing: { basis: "per-second", audioOffUsdPerSecond: 0.112, audioOnUsdPerSecond: 0.168, voiceControlUsdPerSecond: 0.196 },
    productionApproved: false,
    documentationUrl: "https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/api",
  },
  klingV3StandardImage: {
    id: "kling-v3-standard-image",
    provider: "fal",
    endpointId: "fal-ai/kling-video/v3/standard/image-to-video",
    modes: ["image"], durations: [5, 10], aspectRatios: ["16:9", "9:16", "1:1"],
    aspectRatioBehavior: "source-derived", resolutions: ["source-derived"], audio: { supported: true, defaultEnabled: true, customerSetting: "disabled" },
    requiresSource: true, maxPromptLength: 2500,
    pricing: { basis: "per-second", audioOffUsdPerSecond: 0.084, audioOnUsdPerSecond: 0.126, voiceControlUsdPerSecond: 0.154 },
    productionApproved: false,
    documentationUrl: "https://fal.ai/models/fal-ai/kling-video/v3/standard/image-to-video/api",
  },

} as const satisfies Record<string, VideoEndpointCapability>;

export const videoTierRouting: Record<VideoGenerationQuality, keyof typeof videoEndpointCapabilities> = {
  standard: "klingV3StandardImage",
  pro: "klingV3ProImage",
};

export type VideoRoutingResult =
  | { ok: true; capability: VideoEndpointCapability; estimatedMaxCostUsd: number }
  | { ok: false; code: "feature_disabled" | "routing_unapproved" };

export type VideoGenerationEnvironment = { NODE_ENV?: string; VIDEO_GENERATION_ENABLED?: string };

export function isVideoGenerationFeatureEnabled(env: VideoGenerationEnvironment = process.env) {
  return env.VIDEO_GENERATION_ENABLED === "true";
}

export function isVideoGenerationAvailable(env: VideoGenerationEnvironment = process.env) {
  const capabilities: readonly VideoEndpointCapability[] = Object.values(videoEndpointCapabilities);
  return isVideoGenerationFeatureEnabled(env)
    && capabilities.some((capability) => capability.productionApproved);
}

export function resolveVideoRoute(
  mode: VideoGenerationMode,
  quality: VideoGenerationQuality,
  env: VideoGenerationEnvironment = process.env,
): VideoRoutingResult {
  if (!isVideoGenerationFeatureEnabled(env)) return { ok: false, code: "feature_disabled" };
  const capability = videoEndpointCapabilities[videoTierRouting[quality]];
  if (!capability.productionApproved) return { ok: false, code: "routing_unapproved" };
  return { ok: true, capability, estimatedMaxCostUsd: 0 };
}

export function estimateVerifiedProviderCost(capability: VideoEndpointCapability, duration: number) {
  return capability.pricing.basis === "per-second"
    ? Number((capability.pricing.audioOffUsdPerSecond * duration).toFixed(6))
    : null;
}
