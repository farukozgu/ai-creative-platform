import assert from "node:assert/strict";
import test from "node:test";
import { fallbackDirectorPlan, fixedMacroDirectorPlan, parseDirectorOutput, compileDirectorPlan, directVideoWithClient } from "../src/lib/video-director/core";
import { categoryMacroDirection } from "../src/lib/video-director/preset-quality-directions";
import { videoPresetIds } from "../src/lib/video-director/presets";
import { directorProducts, directorFixtureInput } from "./fixtures/video-director-fixtures";

for (const profile of [directorProducts[0], directorProducts[2], directorProducts[1]]) for (const durationSeconds of [5, 10] as const) for (const shotMode of ["single", "multi"] as const) {
  if (durationSeconds === 10 && shotMode === "multi") continue; // Covered by the Macro Details golden suite.
  test(`fixed macro ${profile.vertical}/${durationSeconds}/${shotMode}`, async () => {
    const base = directorFixtureInput(profile);
    const input = { ...base, presetId: "macro-detail-reveal" as const, shotMode, draft: { ...base.draft, shotMode, durationSeconds } };
    const template = categoryMacroDirection(profile.vertical, shotMode, durationSeconds)!;
    const plan = fallbackDirectorPlan(input);
    assert.deepEqual(plan.shots.map(shot => shot.durationSeconds), template.durations);
    assert.ok(parseDirectorOutput(plan, input));
    assert.doesNotThrow(() => compileDirectorPlan(plan, input));
    const changedProduct = { ...input, profile: { ...profile, productId: "another-product", dominantColors: ["black"] } };
    const creative = (value: typeof plan) => value.shots.map(({ focus: _focus, evidenceRefs: _refs, ...shot }) => { void _focus; void _refs; return shot; });
    assert.deepEqual(creative(fallbackDirectorPlan(changedProduct)), creative(plan));
    const withRef = { ...input, draft: { ...input.draft, productReferences: [{ source: { kind: "uploaded-image" as const, sourceAssetId: "10000000-0000-4000-8000-000000000002" }, sha256: "b".repeat(64), purpose: "logo" }] } };
    assert.deepEqual(fallbackDirectorPlan(withRef, [{ index: 0, status: "matched", view: "detail", reason: "Matching marks", details: [] }]).shots, plan.shots);
    const tampered = { ...plan, shots: plan.shots.map((shot, index) => index ? shot : { ...shot, camera: "Slow dolly-in" }) };
    assert.equal(parseDirectorOutput(tampered, input), null);
    const recovered = await directVideoWithClient(input, { createPlan: async () => tampered });
    assert.deepEqual(recovered.shots, plan.shots);
    if (shotMode === "multi" && durationSeconds === 10) {
      assert.notEqual(plan.shots[0].focus, plan.shots[1].focus);
      const repeated = { ...plan, shots: plan.shots.map((shot, index) => index === 1 ? { ...shot, focus: plan.shots[0].focus, evidenceRefs: plan.shots[0].evidenceRefs } : shot) };
      assert.equal(parseDirectorOutput(repeated, input), null);
    }
  });
}

test("other 23 presets do not enter the fixed macro path; missing evidence cannot shrink its shots", () => {
  const base = directorFixtureInput(directorProducts[0]);
  for (const presetId of videoPresetIds.filter(id => id !== "macro-detail-reveal")) assert.equal(fixedMacroDirectorPlan({ ...base, presetId }), null);
  const profile = { ...directorProducts[0], materials: [], identityCriticalAttributes: [], verticalAttributes: { vertical: "apparel" as const, details: { garmentType: "jacket", primaryColor: null, artworkOrLogoLocations: [], closures: [], pocketStructure: [], hoodOrCollar: null, constructionDetails: [], identitySides: [] } } };
  const input = { ...base, profile, presetId: "macro-detail-reveal" as const };
  const plan = fallbackDirectorPlan(input);
  assert.deepEqual(plan.shots.map(shot => shot.durationSeconds), [3, 4, 3]);
  assert.ok(parseDirectorOutput(plan, input));
});

for (const profile of [directorProducts[0], directorProducts[2], directorProducts[1]]) for (const durationSeconds of [5, 10] as const) for (const shotMode of ["single", "multi"] as const) {
  if (durationSeconds === 10 && shotMode === "multi") continue; // Covered by the Macro Details golden suite.
  test(`sparse macro wide fallback ${profile.vertical}/${durationSeconds}/${shotMode}`, () => {
    const base = directorFixtureInput(profile);
    const sparse = { ...profile, materials: [], dominantColors: [], productShape: "unknown", identityCriticalAttributes: [],
      verticalAttributes: { vertical: "apparel" as const, details: { garmentType: "unknown", primaryColor: null, artworkOrLogoLocations: [], closures: [], pocketStructure: [], hoodOrCollar: null, constructionDetails: [], identitySides: [] } } };
    const input = { ...base, profile: sparse, presetId: "macro-detail-reveal" as const, shotMode, draft: { ...base.draft, shotMode, durationSeconds } };
    const template = categoryMacroDirection(profile.vertical, shotMode, durationSeconds)!;
    const plan = fallbackDirectorPlan(input);
    assert.deepEqual(plan.shots.map(shot => shot.durationSeconds), template.durations);
    assert.deepEqual(plan.shots.map(shot => shot.purpose), template.shots.map(shot => shot.purpose));
    assert.deepEqual(plan.shots.map(shot => shot.pace), template.shots.map(shot => shot.pace));
    assert.equal(plan.shots[0].camera, "Locked wide product framing");
    assert.ok(plan.shots.every(shot => shot.focus === "Source-visible product form" && !shot.evidenceRefs.length));
    assert.ok(parseDirectorOutput(plan, input));
    assert.doesNotThrow(() => compileDirectorPlan(plan, input));
  });
}
