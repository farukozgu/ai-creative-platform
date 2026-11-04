import assert from "node:assert/strict";
import test from "node:test";
import { fallbackDirectorPlan, fixedLightingDirectorPlan, parseDirectorOutput, compileDirectorPlan, directVideoWithClient } from "../src/lib/video-director/core";
import { categoryLightingDirection } from "../src/lib/video-director/preset-quality-directions";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";
import { videoPresetIds } from "../src/lib/video-director/presets";

const fixtures = libraryFixtures.filter((fixture, index, all) => fixture.category !== "unknown" && all.findIndex(other => other.category === fixture.category) === index);
const batch = ["glass-reflection", "dramatic-backlight", "metallic-light-sweep"] as const;
for (const presetId of batch) for (const { category, profile } of fixtures) for (const durationSeconds of [5, 10] as const) for (const shotMode of ["single", "multi"] as const) {
  if (presetId === "metallic-light-sweep" && durationSeconds === 10 && shotMode === "multi") continue; // Covered by the Light Sweep golden suite.
  if (presetId === "dramatic-backlight" && durationSeconds === 10 && shotMode === "multi") continue; // Covered by the Dark Reveal golden suite.
  test(`fixed lighting ${presetId}/${category}/${durationSeconds}/${shotMode}`, async () => {
    const base = directorFixtureInput(profile!);
    const input = { ...base, presetId, shotMode, draft: { ...base.draft, shotMode, durationSeconds } };
    const template = categoryLightingDirection(presetId, category, shotMode, durationSeconds)!;
    const plan = fallbackDirectorPlan(input);
    assert.deepEqual(plan.shots.map(shot => shot.durationSeconds), template.durations);
    assert.ok(parseDirectorOutput(plan, input));
    assert.doesNotThrow(() => compileDirectorPlan(plan, input));
    assert.ok(plan.shots.every(shot => shot.focus === "Source-visible product form" && shot.evidenceRefs.length === 0));
    const sparse = { ...input, profile: { ...profile!, materials: [], dominantColors: [], productShape: "unknown", identityCriticalAttributes: [],
      verticalAttributes: { vertical: "apparel" as const, details: { garmentType: "unknown", primaryColor: null, artworkOrLogoLocations: [], closures: [], pocketStructure: [], hoodOrCollar: null, constructionDetails: [], identitySides: [] } } } };
    const wide = fallbackDirectorPlan(sparse);
    assert.deepEqual(wide.shots, plan.shots);
    assert.doesNotMatch(JSON.stringify(wide.shots), /\b(?:glass|metal|metallic|transparent|transparency)\b/i); // Evidence cannot alter the graphic direction.
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
test("Lighting batch covers twelve categories and cannot change other presets", () => {
  assert.equal(fixtures.length, 12);
  const base = directorFixtureInput(directorProducts[0]);
  for (const presetId of videoPresetIds.filter(id => !batch.includes(id as typeof batch[number]))) assert.equal(fixedLightingDirectorPlan({ ...base, presetId }), null);
});

test("Lighting batch has distinct fixed creative identities", () => {
  for (const { category } of fixtures) for (const mode of ["single", "multi"] as const) for (const duration of [5, 10] as const) {
    assert.equal(new Set(batch.map(id => JSON.stringify(categoryLightingDirection(id, category, mode, duration)!.shots))).size, 3);
  }
});
