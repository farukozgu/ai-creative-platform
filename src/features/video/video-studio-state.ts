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
  source: null,
  prompt: "",
  cameraMovement: "auto",
  quality: "standard",
  aspectRatio: "16:9",
  duration: 5,
  feedback: null,
};

export type VideoStudioAction =
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
    case "set-source":
      return {
        ...state,
        source: action.source,
        feedback: null,
      };
    case "remove-source":
      return {
        ...state,
        source: null,
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
      return { ...state, quality: action.quality, feedback: null };
    case "set-aspect-ratio":
      return { ...state, aspectRatio: action.aspectRatio, feedback: null };
    case "set-duration":
      return { ...state, duration: action.duration, feedback: null };
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

export function validateVideoStudioDraft(
  state: VideoStudioDraft,
): VideoStudioFeedback | null {
  if (!state.source) return "source-required";
  if (!state.prompt.trim()) return "prompt-required";
  return null;
}

export function isVideoStudioDraftReady(state: VideoStudioDraft) {
  return validateVideoStudioDraft(state) === null;
}

export function isCurrentVideoSourceRequest(requestId: number, currentRequestId: number) {
  return requestId === currentRequestId;
}
