import type { VideoProviderRequest } from "@/lib/video-generation/types";

type FalRequestInput = Record<string, string | boolean | number | { prompt: string; duration: string }[]>;

/** fal Kling v3 image-to-video accepts at most 512 characters in each multi_prompt scene. */
export const KLING_MULTI_PROMPT_MAX_CHARS = 512;
/** Single-shot prompt uses its own existing 2500-character contract. */
export const KLING_SINGLE_PROMPT_MAX_CHARS = 2500;

/** Local 5/10 second product policy is deliberately narrower than Kling's 3–15 second API. */
export function validateKlingMultiPrompt(value: unknown, duration: number): value is NonNullable<VideoProviderRequest["multiPrompt"]> {
  return [5, 10].includes(duration) && Array.isArray(value) && value.length >= 2 && value.length <= 3
    && value.every(shot => shot && typeof shot.prompt === "string" && shot.prompt.trim() && shot.prompt.length <= KLING_MULTI_PROMPT_MAX_CHARS
      && typeof shot.duration === "string" && /^(?:[1-9]|10)$/.test(shot.duration))
    && value.reduce((sum, shot) => sum + Number(shot.duration), 0) === duration;
}

/** Both Kling tiers use the documented start-frame image-to-video contract. */
export function buildFalVideoRequestInput(request: VideoProviderRequest): FalRequestInput {
  if (!request.sourceUrl) throw new Error("Image-to-video requires a private source image URL.");
  if (![5, 10].includes(request.durationSeconds)) throw new Error("Unsupported product video duration.");
  if (request.multiPrompt !== undefined && !validateKlingMultiPrompt(request.multiPrompt, request.durationSeconds)) throw new Error("Invalid Kling shot durations or prompts.");
  if (!request.multiPrompt && (!request.prompt.trim() || request.prompt.length > KLING_SINGLE_PROMPT_MAX_CHARS)) throw new Error("Invalid Kling prompt.");
  if (request.modelId === "kling-v3-pro-image" || request.modelId === "kling-v3-standard-image") return { start_image_url: request.sourceUrl,
    ...(request.multiPrompt ? { multi_prompt: request.multiPrompt, shot_type: "customize" } : { prompt: request.prompt }),
    duration: String(request.durationSeconds), generate_audio: false, enable_safety_checker: true,
    ...(request.negativePrompt ? { negative_prompt: request.negativePrompt, cfg_scale: request.cfgScale ?? 0.5 } : {}) };
  throw new Error("Unsupported fal.ai video model.");
}
