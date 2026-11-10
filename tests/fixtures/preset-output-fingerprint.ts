import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { VideoDirectorInput } from "../../src/lib/video-director/core";
import { isGoldenTenSecondMulti } from "./video-fidelity-expectations";

export function canonicalPresetOutputJson(value: unknown) {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const object = item as Record<string, unknown>;
    return Object.fromEntries(Object.keys(object).sort().map(key => [key, object[key]]));
  });
}

export function presetOutputFingerprint(value: unknown) {
  return createHash("sha256").update(canonicalPresetOutputJson(value)).digest("hex");
}

export function presetOutputGroup(input: VideoDirectorInput) {
  return isGoldenTenSecondMulti(input)
    || input.presetId === "luxury-fashion-film" && input.shotMode === "multi" && input.draft.durationSeconds === 5
    ? "revised" : "frozen";
}

export function assertPresetOutputFingerprints(
  outputs: Record<"frozen" | "revised", unknown[]>,
  expected: Record<"frozen" | "revised", string>,
) {
  assert.equal(presetOutputFingerprint(outputs.frozen), expected.frozen, "historical preset cells");
  assert.equal(presetOutputFingerprint(outputs.revised), expected.revised, "approved storyboard and Luxury motion revisions");
}
