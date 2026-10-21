import assert from "node:assert/strict";
import test from "node:test";

import { filterVideoRecords, isVideoPlayable } from "../src/features/video/video-library-state";
import type { VideoPresentationRecord } from "../src/features/video/video-studio-types";

const records: VideoPresentationRecord[] = [
  {
    id: "image-video",
    title: "Silk Campaign",
    status: "ready",
    generationMode: "image",
    createdAt: "2026-10-18T10:00:00.000Z",
    playbackUrl: "https://media.example/silk.mp4",
  },
  {
    id: "text-video",
    title: "Stone Studio Reveal",
    status: "processing",
    generationMode: "text",
    createdAt: "2026-10-20T10:00:00.000Z",
  },
  {
    id: "missing-date",
    title: "Archive concept",
    status: "unavailable",
    generationMode: "text",
  },
];

test("video library filters image-to-video records and keeps historical records in all videos", () => {
  assert.deepEqual(
    filterVideoRecords(records, { filter: "all", query: "STUDIO", sort: "newest" }).map(({ id }) => id),
    ["text-video"],
  );
  assert.deepEqual(
    filterVideoRecords(records, { filter: "image", query: "silk", sort: "newest" }).map(({ id }) => id),
    ["image-video"],
  );
});

test("video library sorts dates without mutating presentation records", () => {
  const originalOrder = records.map(({ id }) => id);
  assert.deepEqual(
    filterVideoRecords(records, { filter: "all", query: "", sort: "newest" }).map(({ id }) => id),
    ["text-video", "image-video", "missing-date"],
  );
  assert.deepEqual(
    filterVideoRecords(records, { filter: "all", query: "", sort: "oldest" }).map(({ id }) => id),
    ["missing-date", "image-video", "text-video"],
  );
  assert.deepEqual(records.map(({ id }) => id), originalOrder);
});

test("only ready records with a real playback URL are playable", () => {
  assert.equal(isVideoPlayable(records[0]), true);
  assert.equal(isVideoPlayable({ ...records[0], playbackUrl: "" }), false);
  assert.equal(isVideoPlayable({ ...records[0], status: "processing" }), false);
});
