import type {
  VideoAspectRatio,
  VideoCameraMovement,
  VideoDuration,
  VideoQuality,
  VideoSource,
  VideoStudioDraft,
  VideoStudioFeedback,
} from "@/features/video/video-studio-types";
import {
  MAX_PRODUCT_IMAGE_FILE_SIZE,
} from "@/lib/assets/product-asset-constraints";

export const initialVideoStudioDraft: VideoStudioDraft = {
  method: "source-motion", criticalRegion: null, analyzeAfterGeneration: false,
  source: null,
  prompt: "",
  cameraMovement: "dolly-in",
  quality: "standard",
  aspectRatio: "16:9",
  duration: 5,
  feedback: null,
};

export type VideoStudioAction =
  | { type: "set-method"; method: VideoStudioDraft["method"] }
  | { type: "set-critical-region"; region: VideoStudioDraft["criticalRegion"] }
  | { type: "set-analysis"; enabled: boolean }
  | { type: "set-source"; source: VideoSource }
  | { type: "remove-source" }
  | { type: "set-prompt"; prompt: string }
  | { type: "set-camera"; cameraMovement: VideoCameraMovement }
  | { type: "set-quality"; quality: VideoQuality }
  | { type: "set-aspect-ratio"; aspectRatio: VideoAspectRatio }
  | { type: "set-duration"; duration: VideoDuration }
  | { type: "set-feedback"; feedback: VideoStudioFeedback | null };

export function videoStudioReducer(
  state: VideoStudioDraft,
  action: VideoStudioAction,
): VideoStudioDraft {
  switch (action.type) {
    case "set-method": return { ...state, method: action.method, cameraMovement: "dolly-in", analyzeAfterGeneration: false, feedback: null };
    case "set-critical-region": return { ...state, criticalRegion: action.region, analyzeAfterGeneration: false };
    case "set-analysis": return { ...state, analyzeAfterGeneration: action.enabled };
    case "set-source":
      return {
        ...state,
        source: action.source,
        criticalRegion: null,
        analyzeAfterGeneration: false,
        feedback: null,
      };
    case "remove-source":
      return {
        ...state,
        source: null,
        criticalRegion: null,
        analyzeAfterGeneration: false,
        feedback: null,
      };
    case "set-prompt":
      return {
        ...state,
        prompt: action.prompt,
        feedback: null,
      };
    case "set-camera":
      return { ...state, cameraMovement: action.cameraMovement, feedback: null };
    case "set-quality":
      return { ...state, quality: action.quality, analyzeAfterGeneration: false, feedback: null };
    case "set-aspect-ratio":
      return { ...state, aspectRatio: action.aspectRatio, analyzeAfterGeneration: false, feedback: null };
    case "set-duration":
      return { ...state, duration: action.duration, analyzeAfterGeneration: false, feedback: null };
    case "set-feedback":
      return { ...state, feedback: action.feedback };
  }
}

export function appendPromptSuggestion(current: string, suggestion: string) {
  const trimmed = current.trim();
  if (!trimmed) return suggestion;
  if (trimmed.includes(suggestion)) return current;
  return `${trimmed}\n${suggestion}`;
}

export function validateVideoSourceFile(file: Pick<File, "size" | "type">) {
  if (!["image/jpeg", "image/png"].includes(file.type)) return "invalid-source-type" as const;
  if (file.size > MAX_PRODUCT_IMAGE_FILE_SIZE) return "source-too-large" as const;
  return null;
}

export function validateVideoSourceDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 40_000_000) {
    return "source-dimensions-unsupported" as const;
  }
  return null;
}

export function validateVideoStudioDraft(
  state: VideoStudioDraft,
): VideoStudioFeedback | null {
  if (!state.source) return "source-required";
  if (state.method === "kling" && !state.prompt.trim()) return "prompt-required";
  return null;
}

export function isVideoStudioDraftReady(state: VideoStudioDraft) {
  return validateVideoStudioDraft(state) === null;
}

export function isCurrentVideoSourceRequest(requestId: number, currentRequestId: number) {
  return requestId === currentRequestId;
}
