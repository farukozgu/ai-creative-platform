import type { VideoGenerationDraft } from "../video-generation/types";
import type { VideoShotMode } from "./presets";

export const DIRECTOR_TEXT_LIMIT = 240;
export const DIRECTOR_CONTRACT_VERSION = "director-contract-stable-v2";
export const DIRECTOR_SHOT_TEXT_LIMIT = 100;
export const shotFields = ["camera", "lighting", "composition", "motion", "pace", "focus"] as const;
export const DIRECTOR_GENERIC_FOCUS_VALUES = ["Source-visible product form", "Source-visible product silhouette", "Source-visible surface detail"] as const;
export const selectedCameras: Partial<Record<VideoGenerationDraft["cameraMovement"], string>> = {
  static: "Locked camera; stable source viewpoint.",
  "dolly-in": "Very slight slow camera push-in.",
  "dolly-out": "Very slight slow pull-back from the existing viewpoint.",
  "pan-left": "Subtle camera pan left within the existing visible product view.",
  "pan-right": "Subtle camera pan right within the existing visible product view.",
};

export class DirectorStructuredOutputError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = "DirectorStructuredOutputError";
  }
}

/** Server limits keep room for canonical evidence and Kling fidelity prose. */
export function directorShotContract(shotMode: VideoShotMode, durationSeconds: VideoGenerationDraft["durationSeconds"]) {
  const multi = shotMode === "multi";
  return {
    minShots: multi ? 2 : 1,
    maxShots: multi ? durationSeconds === 5 ? 2 : 3 : 1,
    minDuration: multi ? 2 : durationSeconds,
    maxDuration: multi ? durationSeconds - 2 : durationSeconds,
    fieldLimits: multi ? { camera: 60, composition: 55, motion: 45, lighting: 50, pace: 28, focus: 100 }
      : { camera: 140, composition: 140, motion: 120, lighting: 120, pace: 80, focus: 120 },
  };
}
