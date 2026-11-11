import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fallbackDirectorPlan, fixedLegacyDirectorPlan, fixedLightingDirectorPlan, fixedMinimalDirectorPlan, parseDirectorOutput, presetCreativeIntent, type VideoDirectorInput } from "../../src/lib/video-director/core";
import { getVideoDirectorPreset } from "../../src/lib/video-director/presets";
import { usesD1FiveSecondMulti } from "../../src/lib/video-director/five-second-multi";
import { directorProductContext } from "../../src/lib/video-director/product-context";
import { usesEditorialStoryboard } from "../../src/lib/video-generation/product-reference-policy";
import { isGoldenTenSecondMulti } from "./video-fidelity-expectations";

/** Replay pre-C1 snapshots through their historical storyboard and live compiler. */
export function historicalPresetOutputPlan(input: VideoDirectorInput) {
  // Replay original D1 two-shot cells against unchanged golden hashes, not the new authored edit.
  if (usesD1FiveSecondMulti(input)) {
    const fixed = fixedLegacyDirectorPlan(input);
    if (fixed) return fixed;
    // Frozen unknown-product fallback had no category template or detail evidence.
    assert.equal(directorProductContext(input.profile).evidence.length, 0);
    const preset = getVideoDirectorPreset(input.presetId as "minimal-studio" | "metallic-light-sweep", "multi", 5);
    const historical = parseDirectorOutput({ ...fallbackDirectorPlan(input),
      intent: "Preset direction selected from verified product evidence.",
      summary: "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
      shots: preset.shots.slice(1).map((shot, index) => ({ ...shot, durationSeconds: [2, 3][index], evidenceRefs: [],
        camera: input.draft.cameraMovement === "static"
          ? `${/long[ -]lens/i.test(shot.camera) ? "Long-lens locked" : "Locked"} camera; stable source viewpoint` : shot.camera,
        composition: index === 0 ? "Wider view of the source-visible product form; no unverified detail is enlarged" : shot.composition,
        focus: index === 0 ? "Source-visible surface detail" : "Source-visible product form" })) }, input);
    assert.ok(historical);
    return { ...historical, origin: "fallback" as const };
  }
  if (!usesEditorialStoryboard(input)) return fallbackDirectorPlan(input);
  const plan = input.presetId === "minimal-studio" ? fixedMinimalDirectorPlan(input)! : fixedLightingDirectorPlan(input)!;
  return { ...plan, intentContract: presetCreativeIntent(input, directorProductContext(input.profile).evidence) };
}

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
