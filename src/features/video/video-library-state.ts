import type { VideoPresentationRecord } from "@/features/video/video-studio-types";

export type VideoLibraryFilter = "all" | "image";
export type VideoLibrarySort = "newest" | "oldest";

export type VideoLibraryControls = {
  filter: VideoLibraryFilter;
  query: string;
  sort: VideoLibrarySort;
};

function createdAtValue(record: VideoPresentationRecord) {
  if (!record.createdAt) return 0;
  const value = Date.parse(record.createdAt);
  return Number.isNaN(value) ? 0 : value;
}

export function filterVideoRecords(
  records: readonly VideoPresentationRecord[],
  controls: VideoLibraryControls,
) {
  const normalizedQuery = controls.query.trim().toLocaleLowerCase();
  return records
    .filter((record) => controls.filter === "all" || record.generationMode === controls.filter)
    .filter((record) => !normalizedQuery || record.title.toLocaleLowerCase().includes(normalizedQuery))
    .slice()
    .sort((left, right) => {
      const difference = createdAtValue(left) - createdAtValue(right);
      return controls.sort === "oldest" ? difference : -difference;
    });
}

export function isVideoPlayable(record: VideoPresentationRecord) {
  return record.status === "ready" && Boolean(record.playbackUrl?.trim());
}
