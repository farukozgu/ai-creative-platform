import type { VideoProviderRequest } from "@/lib/video-generation/types";

type FalRequestInput = Record<string, string | boolean>;

/** Model payloads deliberately remain separate: fal's two image-to-video schemas differ. */
export function buildFalVideoRequestInput(request: VideoProviderRequest): FalRequestInput {
  if (!request.sourceUrl) throw new Error("Image-to-video requires a private source image URL.");
  if (request.modelId === "kling-v3-pro-image") return { start_image_url: request.sourceUrl, prompt: request.prompt, duration: String(request.durationSeconds), generate_audio: false, enable_safety_checker: true };
  if (request.modelId === "seedance-v2-standard-image") return { image_url: request.sourceUrl, prompt: request.prompt, duration: String(request.durationSeconds), aspect_ratio: request.aspectRatio, resolution: "720p", generate_audio: false };
  throw new Error("Unsupported fal.ai video model.");
}
