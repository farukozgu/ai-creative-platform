import { videoEndpointCapabilities, type VideoEndpointCapability } from "@/lib/video-generation/capabilities";
import type { VideoGenerationDraft } from "@/lib/video-generation/types";
import { parseCriticalProductRegion } from "./preservation";
import { isVideoPresetId } from "../video-director/presets";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const qualities = new Set(["standard", "pro"]);
const aspectRatios = new Set(["16:9", "9:16", "1:1"]);
const durations = new Set([5, 10]);
const cameraMovements = new Set(["auto", "dolly-in", "dolly-out", "orbit", "pan-left", "pan-right", "static"]);

export type VideoDraftValidation = { ok: true; value: VideoGenerationDraft } | { ok: false; field: string; message: string };

export function validateVideoGenerationDraft(value: unknown): VideoDraftValidation {
  if (!value || typeof value !== "object") return { ok: false, field: "draft", message: "A generation draft is required." };
  const input = value as Record<string, unknown>;
  if (input.shotMode !== undefined && input.shotMode !== "single" && input.shotMode !== "multi") return { ok: false, field: "shotMode", message: "Invalid shot mode." };
  if (input.director !== undefined) {
    const selection = input.director;
    if (!selection || typeof selection !== "object" || !("presetId" in selection) || !isVideoPresetId(selection.presetId)
      || !("shotMode" in selection) || !["single", "multi"].includes(String(selection.shotMode))
      || !("receipt" in selection) || typeof selection.receipt !== "string" || !selection.receipt || selection.receipt.length > 14000)
      return { ok: false, field: "director", message: "A verified director plan is required." };
  }
  if (input.director && typeof input.director === "object" && "shotMode" in input.director && input.shotMode !== undefined && input.director.shotMode !== input.shotMode)
    return { ok: false, field: "director", message: "Shot mode does not match the director plan." };
  if (input.method !== undefined && input.method !== "kling") return { ok: false, field: "method", message: "Unsupported generation method." };
  const criticalRegion = input.criticalRegion == null ? null : parseCriticalProductRegion(input.criticalRegion);
  if (input.criticalRegion != null && !criticalRegion) return { ok: false, field: "criticalRegion", message: "Invalid critical product region." };
  const consent = input.analysisConsent;
  if (consent && typeof consent === "object" && "locale" in consent && consent.locale !== undefined && consent.locale !== "tr" && consent.locale !== "en") return { ok: false, field: "analysisConsent", message: "Unsupported analysis locale." };
  if (consent != null && (typeof consent !== "object" || !("model" in consent) || consent.model !== "gpt-4o-mini"
    || !("maximumCostUsd" in consent) || typeof consent.maximumCostUsd !== "number" || !Number.isFinite(consent.maximumCostUsd) || consent.maximumCostUsd <= 0 || consent.maximumCostUsd > 1
    || !("pricingVersion" in consent) || typeof consent.pricingVersion !== "string" || consent.pricingVersion.length > 80)) return { ok: false, field: "analysisConsent", message: "Invalid analysis consent." };
  if (typeof input.clientSubmissionId !== "string" || !uuidPattern.test(input.clientSubmissionId)) return { ok: false, field: "clientSubmissionId", message: "A valid submission identifier is required." };
  if (input.mode !== "image") return { ok: false, field: "mode", message: "Only image-to-video generation is supported." };
  if (typeof input.quality !== "string" || !qualities.has(input.quality)) return { ok: false, field: "quality", message: "Select a supported quality preference." };
  if (typeof input.aspectRatio !== "string" || !aspectRatios.has(input.aspectRatio)) return { ok: false, field: "aspectRatio", message: "Select a supported aspect ratio." };
  if (typeof input.durationSeconds !== "number" || !durations.has(input.durationSeconds)) return { ok: false, field: "durationSeconds", message: "Select a supported duration." };
  if (typeof input.cameraMovement !== "string" || !cameraMovements.has(input.cameraMovement)) return { ok: false, field: "cameraMovement", message: "Select a supported camera preference." };
  const prompt = typeof input.prompt === "string" ? input.prompt.trim().replace(/\s+/g, " ") : "";
  if (typeof input.prompt !== "string") return { ok: false, field: "prompt", message: "A motion description must be text." };
  if (prompt.length > 2500) return { ok: false, field: "prompt", message: "The prompt must be 2,500 characters or fewer." };
  if (input.productReferences !== undefined && (!Array.isArray(input.productReferences) || input.productReferences.length > 3
    || input.productReferences.some(ref => !ref || typeof ref !== "object" || typeof ref.purpose !== "string" || ref.purpose.length > 60
      || ref.aspectRatio !== undefined && !aspectRatios.has(ref.aspectRatio)
      || typeof ref.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(ref.sha256) || ref.source?.kind !== "uploaded-image" || !uuidPattern.test(ref.source.sourceAssetId))
    || new Set(input.productReferences.map(ref => ref.source.sourceAssetId)).size !== input.productReferences.length))
    return { ok: false, field: "productReferences", message: "Invalid private product references." };
  const source = input.source;
  if (!source || typeof source !== "object") return { ok: false, field: "source", message: "A private source image is required." };
  const candidate = source as Record<string, unknown>;
  const id = candidate.kind === "generated-image" ? candidate.generationId : candidate.sourceAssetId;
  if ((candidate.kind !== "generated-image" && candidate.kind !== "uploaded-image") || typeof id !== "string" || !uuidPattern.test(id)) return { ok: false, field: "source", message: "Select a valid private source image." };
  return { ok: true, value: { ...input, prompt, criticalRegion, method: input.method ?? "kling", analysisConsent: consent ?? null } as VideoGenerationDraft };
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
