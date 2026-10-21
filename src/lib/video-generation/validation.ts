import { videoEndpointCapabilities, type VideoEndpointCapability } from "@/lib/video-generation/capabilities";
import type { VideoGenerationDraft } from "@/lib/video-generation/types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const qualities = new Set(["standard", "pro"]);
const aspectRatios = new Set(["16:9", "9:16", "1:1"]);
const durations = new Set([5, 10]);
const cameraMovements = new Set(["auto", "dolly-in", "dolly-out", "orbit", "pan-left", "pan-right", "static"]);

export type VideoDraftValidation = { ok: true; value: VideoGenerationDraft } | { ok: false; field: string; message: string };

export function validateVideoGenerationDraft(value: unknown): VideoDraftValidation {
  if (!value || typeof value !== "object") return { ok: false, field: "draft", message: "A generation draft is required." };
  const input = value as Record<string, unknown>;
  if (typeof input.clientSubmissionId !== "string" || !uuidPattern.test(input.clientSubmissionId)) return { ok: false, field: "clientSubmissionId", message: "A valid submission identifier is required." };
  if (input.mode !== "image") return { ok: false, field: "mode", message: "Only image-to-video generation is supported." };
  if (typeof input.quality !== "string" || !qualities.has(input.quality)) return { ok: false, field: "quality", message: "Select a supported quality preference." };
  if (typeof input.aspectRatio !== "string" || !aspectRatios.has(input.aspectRatio)) return { ok: false, field: "aspectRatio", message: "Select a supported aspect ratio." };
  if (typeof input.durationSeconds !== "number" || !durations.has(input.durationSeconds)) return { ok: false, field: "durationSeconds", message: "Select a supported duration." };
  if (typeof input.cameraMovement !== "string" || !cameraMovements.has(input.cameraMovement)) return { ok: false, field: "cameraMovement", message: "Select a supported camera preference." };
  const prompt = typeof input.prompt === "string" ? input.prompt.trim().replace(/\s+/g, " ") : "";
  if (!prompt) return { ok: false, field: "prompt", message: "A prompt is required." };
  if (prompt.length > 2500) return { ok: false, field: "prompt", message: "The prompt must be 2,500 characters or fewer." };
  const source = input.source;
  if (!source || typeof source !== "object") return { ok: false, field: "source", message: "A private source image is required." };
  const candidate = source as Record<string, unknown>;
  const id = candidate.kind === "generated-image" ? candidate.generationId : candidate.sourceAssetId;
  if ((candidate.kind !== "generated-image" && candidate.kind !== "uploaded-image") || typeof id !== "string" || !uuidPattern.test(id)) return { ok: false, field: "source", message: "Select a valid private source image." };
  return { ok: true, value: { ...input, prompt } as VideoGenerationDraft };
}

export function validateDraftAgainstCapability(draft: VideoGenerationDraft, capability: VideoEndpointCapability) {
  if (!capability.modes.includes(draft.mode)) return { ok: false as const, code: "mode-unsupported", message: "This route supports image-to-video only." };
  if (!capability.durations.includes(draft.durationSeconds)) return { ok: false as const, code: "duration-unsupported", message: "The selected duration is not supported by this tier." };
  if (!capability.aspectRatios.includes(draft.aspectRatio)) return { ok: false as const, code: "aspect-ratio-unsupported", message: "The selected aspect ratio is not supported by this tier." };
  if (draft.prompt.length > capability.maxPromptLength) return { ok: false as const, message: `The selected route accepts at most ${capability.maxPromptLength} prompt characters.` };
  if (capability.requiresSource !== Boolean(draft.source)) return { ok: false as const, code: "source-required", message: capability.requiresSource ? "This route requires a source image." : "This route does not accept a source image." };
  return { ok: true as const };
}

export const configuredVideoCapabilities = Object.values(videoEndpointCapabilities);
