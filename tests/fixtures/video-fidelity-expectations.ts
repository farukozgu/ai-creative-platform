import assert from "node:assert/strict";
import { videoStudioPresetIds } from "../../src/features/video/video-preset-catalog";
import type { VideoDirectorInput, VideoDirectorShot } from "../../src/lib/video-director/core";
import { directorProductContext } from "../../src/lib/video-director/product-context";

export function isGoldenTenSecondMulti(input: VideoDirectorInput) {
  return input.shotMode === "multi" && input.draft.durationSeconds === 10
    && videoStudioPresetIds.some(id => id === input.presetId);
}

export function assertSourceMarksPreserved(prompt: string) {
  assert.match(prompt, /Exact geometry\/color\/material\/pattern\/parts\/text\/logos\/layout; known sides|Keep source geometry, color, material, texture, pattern, parts and markings exact|Exact form\/color\/material\/pattern\/parts\/text\/logos\/art & layout\/ratios; no guesses|Keep the [\w ,]+ exactly as in the source; do not enlarge, restyle or reposition them|Exact (?:source )?(?:form|shape|colors)\/(?:colors\/)?(?:material\/)?marks\/parts|Preserve the exact dial layout from the source: every numeral, index marker, logo, hand, date window and printed marking stays fixed in shape and position/);
}

/** Golden prompts carry preset-specific fidelity in place of the legacy physical-staging suffix. */
export function assertGoldenPhysicalPrompt(input: VideoDirectorInput, shot: VideoDirectorShot, prompt: string) {
  assertSourceMarksPreserved(prompt);
  assert.ok(prompt.startsWith(shot.camera + ". "), shot.camera);
  assert.doesNotMatch(prompt, /(?:place|add) (?:on |under )?(?:a |the )?(?:table|stand|hanger)|turn upright|orbit|360/i);
  const category = directorProductContext(input.profile).category;
  if (input.presetId === "metallic-light-sweep" && category === "watches") {
    assert.ok(prompt.includes(shot.motion));
    assert.match(prompt, /Freeze visible complications\. Do not invent readable text\./);
    if (shot.purpose === "lighting-reveal") assert.match(prompt, /One left-to-right highlight on bezel, case edges and strap junction/);
    if (shot.purpose === "final-hero") assert.match(prompt, /Stable hero hold for final 1s/);
    return;
  }
  for (const field of ["composition", "lighting", "pace"] as const) {
    assert.ok(prompt.includes(shot[field]), field);
  }
  if (input.presetId === "minimal-studio" && shot.purpose === "hero-reveal") {
    assert.match(prompt, /product stays perfectly fixed and source-facing.*No arc, lateral drift, perspective swing or reorientation; no product rotation\/yaw\/pitch\/roll/);
  } else {
    assert.ok(prompt.includes(shot.motion), shot.motion);
  }
  if (input.presetId === "floating-accessory") {
    assert.match(prompt, /Stable source-facing silhouette; no rotation\/spin\/flip/);
    assert.ok(prompt.endsWith(category === "apparel" ? "Keep source drape; no wind" : "One rigid-body float"));
  } else if (input.presetId === "minimal-studio" && shot.purpose === "final-hero") {
    assert.match(prompt, /hold full frame for all 3 seconds.*No rotation\/yaw\/pitch\/roll, perspective change, translation, zoom\/dolly\/lateral movement/);
  } else if (input.presetId !== "minimal-studio" || shot.purpose !== "hero-reveal") {
    assert.match(prompt, /known view|source orientation and visible surfaces only/);
  }
  if (input.presetId === "window-display") assert.match(prompt, /One product; abstract glass bands; no mirror\/signage/);
  if (input.presetId === "material-detail" && shot.purpose === "material-study") assert.match(prompt, /No material inference/);
}
