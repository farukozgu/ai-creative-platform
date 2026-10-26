/** `text` is retained only to render authorized legacy video records. */
export type VideoPresentationMode = "image" | "text";
export type VideoCameraMovement =
  | "auto"
  | "dolly-in"
  | "dolly-out"
  | "orbit"
  | "pan-left"
  | "pan-right"
  | "static";
export type VideoQuality = "standard" | "pro";
export type VideoAspectRatio = "16:9" | "9:16" | "1:1";
export type VideoDuration = 5 | 10;

export type LocalVideoSource = {
  kind: "local";
  id: string;
  name: string;
  previewUrl: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  file: File;
};

export type LibraryVideoSource = {
  kind: "library";
  id: string;
  name: string;
  previewUrl: string;
  generationId: string;
  projectId: string;
  createdAt: string;
  aspectRatio: string | null;
};

export type VideoSource = LocalVideoSource | LibraryVideoSource;

export type VideoStudioFeedback =
  | "source-required"
  | "prompt-required"
  | "invalid-source-type"
  | "source-too-large"
  | "source-unreadable"
  | "source-dimensions-unsupported"
  | "not-connected";

export type VideoStudioDraft = {
  source: VideoSource | null;
  prompt: string;
  cameraMovement: VideoCameraMovement;
  quality: VideoQuality;
  aspectRatio: VideoAspectRatio;
  duration: VideoDuration;
  feedback: VideoStudioFeedback | null;
};

export type VideoStatus = "queued" | "processing" | "ready" | "failed" | "unavailable";

export type VideoPresentationRecord = {
  id: string;
  title: string;
  status: VideoStatus;
  generationMode: VideoPresentationMode;
  createdAt?: string | null;
  durationSeconds?: number | null;
  aspectRatio?: VideoAspectRatio | null;
  thumbnailUrl?: string | null;
  playbackUrl?: string | null;
  prompt?: string | null;
  cameraMovement?: VideoCameraMovement | null;
  quality?: VideoQuality | "auto" | "best" | null;
  sourceImage?: {
    id?: string;
    name?: string;
    thumbnailUrl?: string | null;
  } | null;
};

export type VideoGenerationRecord = VideoPresentationRecord;

export type VideoLibraryAsset = Omit<LibraryVideoSource, "kind">;
export type VideoLibraryResult =
  | { status: "success"; assets: VideoLibraryAsset[] }
  | { status: "unauthorized" | "error"; assets: [] };

export type IncomingVideoSourceResult =
  | {
      status: "success";
      asset: Omit<VideoLibraryAsset, "name"> & { name: string | null };
    }
  | { status: "unavailable" };
