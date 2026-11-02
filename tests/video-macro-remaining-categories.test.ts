import assert from "node:assert/strict";
import test from "node:test";
import { fallbackDirectorPlan, parseDirectorOutput, compileDirectorPlan, directVideoWithClient } from "../src/lib/video-director/core";
import { categoryMacroDirection } from "../src/lib/video-director/preset-quality-directions";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";
const categories = ["bags", "headwear", "eyewear", "jewelry", "footwear", "furniture", "food", "packaged-food", "electronics"];
for (const category of categories) for (const durationSeconds of [5, 10] as const) for (const shotMode of ["single", "multi"] as const) {
  test(`macro remaining ${category}/${durationSeconds}/${shotMode}`, async () => {
    const profile = libraryFixtures.find(fixture => fixture.category === category)!.profile!;
    const base = directorFixtureInput(profile);
    const input = { ...base, presetId: "macro-detail-reveal" as const, shotMode, draft: { ...base.draft, durationSeconds, shotMode } };
    const plan = fallbackDirectorPlan(input);
    const template = categoryMacroDirection(category, shotMode, durationSeconds)!;
    assert.deepEqual(plan.shots.map(shot => shot.durationSeconds), template.durations);
    assert.ok(parseDirectorOutput(plan, input));
    assert.doesNotThrow(() => compileDirectorPlan(plan, input));
    assert.deepEqual(fallbackDirectorPlan(input), plan);
    const refs = { ...input, draft: { ...input.draft, productReferences: [{ source: { kind: "uploaded-image" as const, sourceAssetId: "10000000-0000-4000-8000-000000000002" }, sha256: "b".repeat(64), purpose: "logo" }] } };
    assert.deepEqual(fallbackDirectorPlan(refs, [{ index: 0, status: "matched", view: "detail", reason: "Same product", details: [] }]).shots, plan.shots);
    const tampered = { ...plan, shots: plan.shots.map((shot, index) => index === 0 ? { ...shot, camera: "Slow dolly-in" } : shot) };
    assert.equal(parseDirectorOutput(tampered, input), null);
    assert.deepEqual((await directVideoWithClient(input, { createPlan: async () => tampered })).shots, plan.shots);
    const sparseProfile = { ...directorProducts[0], subcategory: profile.subcategory, materials: [], dominantColors: [], productShape: "unknown", identityCriticalAttributes: [],
      verticalAttributes: { vertical: "apparel" as const, details: { garmentType: "unknown", primaryColor: null, artworkOrLogoLocations: [], closures: [], pocketStructure: [], hoodOrCollar: null, constructionDetails: [], identitySides: [] } } };
    // Keep the verified subtype/category while removing every usable detail.
    const sparse = { ...input, profile: { ...sparseProfile, vertical: profile.vertical } };
    const wide = fallbackDirectorPlan(sparse);
    assert.equal(wide.shots.length, plan.shots.length);
    assert.deepEqual(wide.shots.map(shot => shot.durationSeconds), template.durations);
    assert.ok(wide.shots.every(shot => shot.focus === "Source-visible product form" && !shot.evidenceRefs.length));
    assert.ok(parseDirectorOutput(wide, sparse));
    assert.doesNotThrow(() => compileDirectorPlan(wide, sparse));
    if (shotMode === "multi" && durationSeconds === 10 && plan.shots[0].evidenceRefs.length && plan.shots[1].evidenceRefs.length) {
      const repeat = { ...plan, shots: plan.shots.map((shot, index) => index === 1 ? { ...shot, focus: plan.shots[0].focus, evidenceRefs: plan.shots[0].evidenceRefs } : shot) };
      assert.equal(parseDirectorOutput(repeat, input), null);
    }
  });
}
