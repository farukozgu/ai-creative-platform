import type { VideoProviderRequest } from "@/lib/video-generation/types";

type FalRequestInput = Record<string, string | boolean | number>;

/** Both Kling tiers use the documented start-frame image-to-video contract. */
export function buildFalVideoRequestInput(request: VideoProviderRequest): FalRequestInput {
  if (!request.sourceUrl) throw new Error("Image-to-video requires a private source image URL.");
  if (request.modelId === "kling-v3-pro-image" || request.modelId === "kling-v3-standard-image") return { start_image_url: request.sourceUrl, prompt: request.prompt, duration: String(request.durationSeconds), generate_audio: false, enable_safety_checker: true,
    ...(request.negativePrompt ? { negative_prompt: request.negativePrompt, cfg_scale: request.cfgScale ?? 0.5 } : {}) };
  throw new Error("Unsupported fal.ai video model.");
}
