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
import type { VideoGenerationDraft } from "@/lib/video-generation/types";
import type { VideoDirectorSelection } from "@/lib/video-director/core";

/** Use the same exclusive creative fields for planning, quoting and submission. */
export function videoStudioCreativeFields(state: VideoStudioDraft, selection?: VideoDirectorSelection | null): Pick<VideoGenerationDraft, "creativeMode" | "prompt" | "cameraMovement" | "director"> {
  const custom = state.creativeMode === "custom";
  const compatible = selection && selection.shotMode === state.shotMode && (selection.creativeMode === "custom") === custom;
  return { creativeMode: state.creativeMode, prompt: custom ? state.prompt : "", cameraMovement: "auto",
    ...(compatible ? { director: selection } : {}) };
}

export const initialVideoStudioDraft: VideoStudioDraft = {
  shotMode: "multi",
  creativeMode: "preset",
  criticalRegion: null, analyzeAfterGeneration: false,
  source: null,
  prompt: "",
  cameraMovement: "auto",
  quality: "standard",
  aspectRatio: "16:9",
  duration: 10,
  feedback: null,
};

export type VideoStudioAction =
  | { type: "set-shot-mode"; mode: NonNullable<VideoStudioDraft["shotMode"]> }
  | { type: "set-creative-mode"; mode: VideoStudioDraft["creativeMode"] }
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
    case "set-shot-mode": return { ...state, shotMode: action.mode, feedback: null };
    case "set-creative-mode":
      return action.mode === state.creativeMode ? state : { ...state, creativeMode: action.mode, prompt: "", cameraMovement: "auto", feedback: null };
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
      return { ...state, cameraMovement: "auto", feedback: null };
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
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "invalid-source-type" as const;
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
  if (state.shotMode !== "single" && state.shotMode !== "multi") return "shot-mode-required";
  if (state.creativeMode === "custom" && !state.prompt.trim()) return "prompt-required";
  return null;
}

export function isVideoStudioDraftReady(state: VideoStudioDraft) {
  return validateVideoStudioDraft(state) === null;
}

export function isCurrentVideoSourceRequest(requestId: number, currentRequestId: number) {
  return requestId === currentRequestId;
}
