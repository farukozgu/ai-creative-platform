import assert from "node:assert/strict";
import test from "node:test";
import { fallbackDirectorPlan, fixedMinimalDirectorPlan, parseDirectorOutput, compileDirectorPlan, directVideoWithClient } from "../src/lib/video-director/core";
import { categoryMinimalDirection } from "../src/lib/video-director/preset-quality-directions";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";
import { videoPresetIds } from "../src/lib/video-director/presets";

const fixtures = libraryFixtures.filter((fixture, index, all) => fixture.category !== "unknown" && all.findIndex(other => other.category === fixture.category) === index);
for (const { category, profile } of fixtures) for (const durationSeconds of [5, 10] as const) for (const shotMode of ["single", "multi"] as const) {
  test(`fixed minimal ${category}/${durationSeconds}/${shotMode}`, async () => {
    const base = directorFixtureInput(profile!);
    const input = { ...base, presetId: "minimal-studio" as const, shotMode, draft: { ...base.draft, shotMode, durationSeconds } };
    const template = categoryMinimalDirection(category, shotMode, durationSeconds)!;
    const plan = fallbackDirectorPlan(input);
    assert.deepEqual(plan.shots.map(shot => shot.durationSeconds), template.durations);
    assert.equal(plan.shots.length, shotMode === "single" ? 1 : durationSeconds === 5 ? 2 : 3);
    assert.ok(plan.shots.every(shot => /diffuse studio light/.test(shot.lighting)));
    assert.equal(plan.shots[0].camera, "Locked wide product framing");
    assert.ok(parseDirectorOutput(plan, input));
    assert.doesNotThrow(() => compileDirectorPlan(plan, input));
    assert.ok(plan.shots.every(shot => shot.focus === "Source-visible product form" && shot.evidenceRefs.length === 0));
    const sparse = { ...input, profile: { ...profile!, materials: [], dominantColors: [], productShape: "unknown", identityCriticalAttributes: [],
      verticalAttributes: { vertical: "apparel" as const, details: { garmentType: "unknown", primaryColor: null, artworkOrLogoLocations: [], closures: [], pocketStructure: [], hoodOrCollar: null, constructionDetails: [], identitySides: [] } } } };
    const wide = fallbackDirectorPlan(sparse);
    assert.deepEqual(wide.shots, plan.shots); // Evidence cannot alter the graphic direction.
    const failures: unknown[] = [];
    assert.ok(parseDirectorOutput(wide, sparse, failure => failures.push(failure)), JSON.stringify(failures));
    assert.doesNotThrow(() => compileDirectorPlan(wide, sparse));
    const refs = { ...input, draft: { ...input.draft, productReferences: [{ source: { kind: "uploaded-image" as const, sourceAssetId: "10000000-0000-4000-8000-000000000002" }, sha256: "b".repeat(64), purpose: "logo" }] } };
    assert.deepEqual(fallbackDirectorPlan(refs, [{ index: 0, status: "matched", view: "detail", reason: "Same product", details: [] }]).shots, plan.shots);
    for (const patch of [{ camera: "Slow dolly-in" }, { focus: "Source-visible surface detail" }, { lighting: "Even diffuse light" }, { pace: "Fast accent" }, { durationSeconds: 4 }]) {
      const changed = { ...plan, shots: plan.shots.map((shot, index) => index === 0 ? { ...shot, ...patch } : shot) };
      assert.equal(parseDirectorOutput(changed, input), null);
    }
    const changed = { ...plan, shots: [...plan.shots].reverse() };
    if (shotMode === "multi") {
      assert.equal(plan.shots.at(-1)!.purpose, "final-hero");
      assert.equal(parseDirectorOutput(changed, input), null);
      assert.equal(new Set(plan.shots.map(shot => shot.composition)).size, plan.shots.length);
    }
    assert.deepEqual((await directVideoWithClient(input, { createPlan: async () => ({ ...plan, shots: [] }) })).shots, plan.shots);
  });
}
test("Minimal Studio covers twelve categories and cannot change other presets", () => {
  assert.equal(fixtures.length, 12);
  const base = directorFixtureInput(directorProducts[0]);
  for (const presetId of videoPresetIds.filter(id => id !== "minimal-studio")) assert.equal(fixedMinimalDirectorPlan({ ...base, presetId }), null);
});
