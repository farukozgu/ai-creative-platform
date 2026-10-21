import type { VideoPresentationRecord } from "@/features/video/video-studio-types";

// Phase 3 defines the presentation boundary only. A later phase can replace this
// empty source with authenticated persistence without changing library UI props.
export const videoPresentationRecords: readonly VideoPresentationRecord[] = [];

export function getVideoPresentationRecord(videoId: string) {
  return videoPresentationRecords.find((record) => record.id === videoId);
}
