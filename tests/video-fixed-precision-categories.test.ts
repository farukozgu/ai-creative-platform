import assert from "node:assert/strict";
import test from "node:test";
import { fallbackDirectorPlan, fixedPrecisionDirectorPlan, parseDirectorOutput, compileDirectorPlan, directVideoWithClient } from "../src/lib/video-director/core";
import { categoryMacroDirection, categoryPrecisionDirection } from "../src/lib/video-director/preset-quality-directions";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";
import { videoPresetIds } from "../src/lib/video-director/presets";

const fixtures = libraryFixtures.filter((fixture, index, all) => fixture.category !== "unknown" && all.findIndex(other => other.category === fixture.category) === index);
for (const { category, profile } of fixtures) for (const durationSeconds of [5, 10] as const) for (const shotMode of ["single", "multi"] as const) {
  test(`fixed precision ${category}/${durationSeconds}/${shotMode}`, async () => {
    const base = directorFixtureInput(profile!);
    const input = { ...base, presetId: "precision-macro" as const, shotMode, draft: { ...base.draft, durationSeconds, shotMode } };
    const plan = fallbackDirectorPlan(input);
    const template = categoryPrecisionDirection(category, shotMode, durationSeconds)!;
    assert.deepEqual(plan.shots.map(shot => shot.durationSeconds), template.durations);
    assert.notDeepEqual(template.shots, categoryMacroDirection(category, shotMode, durationSeconds)!.shots);
    assert.equal(plan.shots.length, shotMode === "single" ? 1 : durationSeconds === 5 ? 2 : 3);
    const detailIndex = shotMode === "multi" && durationSeconds === 10 ? 1 : 0;
    if (plan.shots[detailIndex].evidenceRefs.length) {
      assert.match(plan.shots[detailIndex].camera, /macro/i);
      if (shotMode === "multi") {
        const duplicate = { ...plan, shots: plan.shots.map((shot, index) => index === plan.shots.length - 1 ? { ...shot, focus: plan.shots[detailIndex].focus, evidenceRefs: plan.shots[detailIndex].evidenceRefs } : shot) };
        assert.equal(parseDirectorOutput(duplicate, input), null);
      }
    }
    assert.ok(parseDirectorOutput(plan, input));
    assert.doesNotThrow(() => compileDirectorPlan(plan, input));
    assert.deepEqual(fallbackDirectorPlan(input), plan);
    const otherProduct = { ...input, profile: { ...profile!, productId: "same-category-another-product" } };
    assert.deepEqual(fallbackDirectorPlan(otherProduct).shots, plan.shots);
    const referenceInput = { ...input, draft: { ...input.draft, productReferences: [{ source: { kind: "uploaded-image" as const, sourceAssetId: "10000000-0000-4000-8000-000000000002" }, sha256: "b".repeat(64), purpose: "texture" }] } };
    assert.deepEqual(fallbackDirectorPlan(referenceInput, [{ index: 0, status: "matched", view: "detail", reason: "Same texture", details: ["unseen weave"] }]).shots, plan.shots);
    const changed = { ...plan, shots: plan.shots.map((shot, index) => index === 0 ? { ...shot, camera: "Slow dolly-in" } : shot) };
    assert.equal(parseDirectorOutput(changed, input), null);
    assert.deepEqual((await directVideoWithClient(input, { createPlan: async () => changed })).shots, plan.shots);
    if (shotMode === "multi" && durationSeconds === 10 && plan.shots[0].evidenceRefs.length && plan.shots[1].evidenceRefs.length) {
      const repeated = { ...plan, shots: plan.shots.map((shot, index) => index === 1 ? { ...shot, focus: plan.shots[0].focus, evidenceRefs: plan.shots[0].evidenceRefs } : shot) };
      assert.equal(parseDirectorOutput(repeated, input), null);
    }
    const sparseProfile = { ...profile!, materials: [], dominantColors: [], productShape: "unknown", identityCriticalAttributes: [],
      verticalAttributes: { vertical: "apparel" as const, details: { garmentType: "unknown", primaryColor: null, artworkOrLogoLocations: [], closures: [], pocketStructure: [], hoodOrCollar: null, constructionDetails: [], identitySides: [] } } };
    const sparseInput = { ...input, profile: sparseProfile };
    const wide = fallbackDirectorPlan(sparseInput);
    assert.deepEqual(wide.shots.map(shot => shot.durationSeconds), template.durations);
    assert.ok(wide.shots.every(shot => !shot.evidenceRefs.length && shot.focus === "Source-visible product form"));
    assert.equal(wide.shots[detailIndex].camera, "Locked wide product framing");
    const failures: unknown[] = [];
    assert.ok(parseDirectorOutput(wide, sparseInput, failure => failures.push(failure)), JSON.stringify(failures));
    assert.doesNotThrow(() => compileDirectorPlan(wide, sparseInput));
  });
}
test("precision fixed templates cover exactly twelve categories and leave other presets outside their path", () => {
  assert.equal(fixtures.length, 12);
  const base = directorFixtureInput(directorProducts[0]);
  for (const presetId of videoPresetIds.filter(id => id !== "precision-macro")) assert.equal(fixedPrecisionDirectorPlan({ ...base, presetId }), null);
});
