import assert from "node:assert/strict";
import test from "node:test";
import { fallbackDirectorPlan, fixedFashionMotionDirectorPlan, parseDirectorOutput, compileDirectorPlan, directVideoWithClient } from "../src/lib/video-director/core";
import { categoryMacroDirection, categoryFashionMotionDirection } from "../src/lib/video-director/preset-quality-directions";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";
import { videoPresetIds } from "../src/lib/video-director/presets";

const fixtures = libraryFixtures.filter((fixture, index, all) => fixture.category !== "unknown" && all.findIndex(other => other.category === fixture.category) === index);
const batch = ["floating-fashion", "fabric-motion", "floating-accessory"] as const;
for (const presetId of batch) for (const { category, profile } of fixtures) for (const durationSeconds of [5, 10] as const) for (const shotMode of ["single", "multi"] as const) {
  test(`fixed fashion motion ${presetId}/${category}/${durationSeconds}/${shotMode}`, async () => {
    const base = directorFixtureInput(profile!);
    const input = { ...base, presetId, shotMode, draft: { ...base.draft, durationSeconds, shotMode } };
    const plan = fallbackDirectorPlan(input);
    const template = categoryFashionMotionDirection(presetId, category, shotMode, durationSeconds)!;
    assert.deepEqual(plan.shots.map(shot => shot.durationSeconds), template.durations);
    assert.notDeepEqual(template.shots, categoryMacroDirection(category, shotMode, durationSeconds)!.shots);
    assert.equal(plan.shots.length, shotMode === "single" ? 1 : durationSeconds === 5 ? 2 : 3);
    const detailIndex = template.detailIndex;
    if (detailIndex >= 0 && plan.shots[detailIndex].evidenceRefs.length) {
      assert.equal(plan.shots[detailIndex].camera, template.shots[detailIndex].camera);
      if (shotMode === "multi") {
        const duplicate = { ...plan, shots: plan.shots.map((shot, index) => index === plan.shots.length - 1 ? { ...shot, focus: plan.shots[detailIndex].focus, evidenceRefs: plan.shots[detailIndex].evidenceRefs } : shot) };
        assert.equal(parseDirectorOutput(duplicate, input), null);
      }
    }
    const planFailures: unknown[] = [];
    assert.ok(parseDirectorOutput(plan, input, failure => planFailures.push(failure)), JSON.stringify(planFailures));
    assert.doesNotMatch(JSON.stringify(plan.shots), /\b(?:360|rotate|orbit|rear|backside|interior|mechanism)\b/i);
    const unsafe = { ...plan, shots: plan.shots.map((shot, index) => index === 0 ? { ...shot, camera: "Orbit 360 degrees around the product" } : shot) };
    assert.equal(parseDirectorOutput(unsafe, input), null);
    assert.doesNotThrow(() => compileDirectorPlan(plan, input));
    assert.ok(plan.shots.every(shot => shot.motion === "Keep the product still"));
    assert.doesNotMatch(JSON.stringify(plan.shots), /\b(?:wind|flutter|deform|airborne|levitate|suspended)\b/i);
    if (presetId === "fabric-motion" && !["apparel", "bags", "headwear", "footwear", "furniture"].includes(category)) {
      assert.ok(plan.shots.every(shot => !shot.evidenceRefs.length));
    }
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
    if (detailIndex >= 0) assert.equal(wide.shots[detailIndex].camera, "Locked wide product framing");
    else assert.deepEqual(wide.shots, plan.shots);
    const failures: unknown[] = [];
    assert.ok(parseDirectorOutput(wide, sparseInput, failure => failures.push(failure)), JSON.stringify(failures));
    assert.doesNotThrow(() => compileDirectorPlan(wide, sparseInput));
  });
}
test("fashion motion fixed templates cover exactly twelve categories and leave other presets outside their path", () => {
  assert.equal(fixtures.length, 12);
  const base = directorFixtureInput(directorProducts[0]);
  for (const presetId of videoPresetIds.filter(id => !batch.includes(id as typeof batch[number]))) assert.equal(fixedFashionMotionDirectorPlan({ ...base, presetId }), null);
});

test("fashion motion presets retain distinct camera/light/rhythm identities", () => {
  for (const { category } of fixtures) for (const mode of ["single", "multi"] as const) for (const duration of [5, 10] as const) {
    const signatures = batch.map(id => JSON.stringify(categoryFashionMotionDirection(id, category, mode, duration)!.shots));
    assert.equal(new Set(signatures).size, 3);
  }
});
