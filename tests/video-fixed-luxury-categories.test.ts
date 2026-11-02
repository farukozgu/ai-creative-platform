import assert from "node:assert/strict";
import test from "node:test";
import { fallbackDirectorPlan, fixedLuxuryDirectorPlan, parseDirectorOutput, compileDirectorPlan, directVideoWithClient } from "../src/lib/video-director/core";
import { durationStrategy } from "../src/lib/video-director/duration-strategy";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";
import { videoPresetIds } from "../src/lib/video-director/presets";
const fixtures = libraryFixtures.filter((fixture, index, all) => fixture.category !== "unknown" && all.findIndex(other => other.category === fixture.category) === index);
for (const { category, profile } of fixtures) for (const durationSeconds of [5, 10] as const) for (const shotMode of ["single", "multi"] as const) {
  test(`fixed luxury ${category}/${durationSeconds}/${shotMode}`, async () => {
    const base = directorFixtureInput(profile!);
    const input = { ...base, presetId: "luxury-fashion-film" as const, shotMode, draft: { ...base.draft, durationSeconds, shotMode } };
    const source = durationStrategy(input.presetId, shotMode, durationSeconds)!;
    const plan = fallbackDirectorPlan(input);
    const failures: unknown[] = [];
    assert.ok(parseDirectorOutput(plan, input, failure => failures.push(failure)), JSON.stringify(failures));
    assert.doesNotThrow(() => compileDirectorPlan(plan, input));
    assert.deepEqual(plan.shots.map(shot => shot.durationSeconds), source.durations);
    plan.shots.forEach((shot, index) => {
      assert.equal(shot.purpose, source.shots[index].purpose);
      assert.equal(shot.lighting, source.shots[index].lighting);
      assert.equal(shot.pace, source.shots[index].pace);
      if (category !== "watches") assert.equal(shot.camera, source.shots[index].camera);
    });
    assert.deepEqual(fallbackDirectorPlan(input).shots, plan.shots);
    const refs = { ...input, draft: { ...input.draft, productReferences: [{ source: { kind: "uploaded-image" as const, sourceAssetId: "10000000-0000-4000-8000-000000000002" }, sha256: "b".repeat(64), purpose: "logo" }] } };
    assert.deepEqual(fallbackDirectorPlan(refs, [{ index: 0, status: "matched", view: "detail", reason: "Same product", details: [] }]).shots, plan.shots);
    const changed = { ...plan, shots: plan.shots.map((shot, index) => index === 0 ? { ...shot, camera: "Slow dolly-in" } : shot) };
    assert.equal(parseDirectorOutput(changed, input), null);
    assert.deepEqual((await directVideoWithClient(input, { createPlan: async () => changed })).shots, plan.shots);
    const sparse = { ...input, profile: { ...profile!, materials: [], dominantColors: [], productShape: "unknown", identityCriticalAttributes: [],
      verticalAttributes: { vertical: "apparel" as const, details: { garmentType: "unknown", primaryColor: null, artworkOrLogoLocations: [], closures: [], pocketStructure: [], hoodOrCollar: null, constructionDetails: [], identitySides: [] } } } };
    const wide = fallbackDirectorPlan(sparse);
    assert.deepEqual(wide.shots.map(shot => shot.durationSeconds), source.durations);
    assert.ok(wide.shots.every(shot => shot.focus === "Source-visible product form" && !shot.evidenceRefs.length));
    const sparseFailures: unknown[] = [];
    assert.ok(parseDirectorOutput(wide, sparse, failure => sparseFailures.push(failure)), JSON.stringify(sparseFailures));
    assert.doesNotThrow(() => compileDirectorPlan(wide, sparse));
  });
}
test("Luxury fixed path is isolated from other presets", () => {
  assert.equal(fixtures.length, 12);
  const base = directorFixtureInput(directorProducts[0]);
  for (const presetId of videoPresetIds.filter(id => id !== "luxury-fashion-film")) assert.equal(fixedLuxuryDirectorPlan({ ...base, presetId }), null);
});
