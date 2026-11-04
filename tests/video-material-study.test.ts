import assert from "node:assert/strict";
import test from "node:test";
import { compileDirectorPlan, directVideoWithClient, fallbackDirectorPlan, fixedMaterialDirectorPlan, parseDirectorOutput } from "../src/lib/video-director/core";
import { directorProductContext } from "../src/lib/video-director/product-context";
import { unsupportedProductClaim } from "../src/lib/video-director/creative-request";
import { sealDirectorPlan, openDirectorPlan } from "../src/lib/video-director/receipt";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";
import { directorFixtureInput } from "./fixtures/video-director-fixtures";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { VideoProductionHarness } from "./fixtures/video-production-harness";

for (const category of ["apparel", "cosmetics", "footwear", "furniture", "watches", "jewelry"]) {
  const original = libraryFixtures.find(f => f.category === category && (category !== "apparel" || f.name === "Tişört"))!.profile!;
  const profile = ["apparel", "furniture"].includes(category) ? { ...original,
    identityCriticalAttributes: [...original.identityCriticalAttributes, { attribute: "visible woven relief", rationale: "source-visible", regions: [] }] } : original;
  for (const sparse of [false, true]) test(`Material Study ${category}/sparse=${sparse}`, async () => {
    const base = directorFixtureInput(profile);
    const input = { ...base, profile: sparse ? null : profile, presetId: "material-detail" as const, shotMode: "multi" as const,
      draft: { ...base.draft, durationSeconds: 10 as const, shotMode: "multi" as const } };
    const plan = fallbackDirectorPlan(input);
    assert.deepEqual(plan.shots.map(s => s.durationSeconds), [3, 4, 3]);
    assert.deepEqual(plan.shots.map(s => s.purpose), ["hero-reveal", "material-study", "final-hero"]);
    assert.deepEqual(plan.shots.map(s => s.camera), ["Locked medium-close product framing", "Very short source-facing lateral macro glide", "Locked balanced product framing"]);
    assert.equal(plan.shots.filter(s => s.purpose === "material-study").length, 1);
    assert.match(plan.shots[0].composition, /Recognizable.*full form context/);
    assert.match(plan.shots[1].composition, /One source-resolvable surface region/);
    assert.match(plan.shots[1].lighting, /Grazing light angle shifts subtly/);
    assert.match(plan.shots[2].composition, /Complete recognizable source-facing product/);
    for (const index of [0, 2]) { assert.equal(plan.shots[index].focus, "Source-visible product form"); assert.deepEqual(plan.shots[index].evidenceRefs, []); }
    for (const shot of plan.shots) {
      assert.match(shot.motion, /Product (?:and camera still|stays still)/);
      assert.equal(unsupportedProductClaim(shot.focus, input.profile), null);
    }
    const expectedSurface = !sparse && ["apparel", "footwear", "furniture"].includes(category);
    if (expectedSurface) {
      assert.equal(plan.shots[1].evidenceRefs.length, 1);
      assert.equal(plan.shots[1].focus, directorProductContext(profile).evidence[plan.shots[1].evidenceRefs[0]].detail);
    } else { assert.equal(plan.shots[1].focus, "Source-visible surface detail"); assert.deepEqual(plan.shots[1].evidenceRefs, []); }
    assert.doesNotMatch(JSON.stringify(plan.shots), /logo|label|clasp|hinge|dial|marker|button|mechanism|orbit|360|rotat|spin|people|manufactur|sweep|left-to-right|travell?ing|dark reveal|flash|RGB|glow/i);
    const failures: unknown[] = [];
    assert.ok(parseDirectorOutput(plan, input, failure => failures.push(failure)), JSON.stringify(failures));
    const compiled = compileDirectorPlan(plan, input);
    assert.equal(compiled.multiPrompt!.length, 3);
    assert.deepEqual(compiled.multiPrompt!.map(s => s.duration), ["3", "4", "3"]);
    for (const [index, scene] of compiled.multiPrompt!.entries()) {
      assert.ok(scene.prompt.length <= 512);
      for (const field of ["camera", "composition", "lighting", "motion", "pace"] as const) assert.ok(scene.prompt.includes(plan.shots[index][field]), field);
    }
    assert.match(compiled.multiPrompt![1].prompt, /No material inference/);
    assert.equal(compiled.multiPrompt![1].prompt.split(plan.shots[1].focus).length - 1, 1);
    const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: "kling-v3-standard-image",
      endpointId: "offline", sourceUrl: "https://invalid.example/source" });
    assert.deepEqual(payload.multi_prompt, compiled.multiPrompt);
    const harness = await VideoProductionHarness.create();
    const request = harness.directorRequest(input);
    assert.deepEqual(JSON.parse(request.context).fixedShots.map((s: { durationSeconds: number }) => s.durationSeconds), [3, 4, 3]);
    type Slot = { properties: { camera: { enum: string[] }; focus: { enum: string[] }; purpose: { enum: string[] } } };
    const schema = request.schema.properties.shots as unknown as { items: { anyOf: Slot[] } };
    for (const [index, slot] of schema.items.anyOf.entries()) for (const field of ["camera", "focus", "purpose"] as const) {
      assert.deepEqual(Array.from(slot.properties[field].enum), [plan.shots[index][field]]);
    }
    harness.assertIsolated();
    const invalid = [
      { ...plan, shots: [] }, { ...plan, shots: [...plan.shots].reverse() },
      { ...plan, shots: plan.shots.map((s, i) => i === 1 ? { ...s, purpose: "macro-detail", focus: "logo and hinge", evidenceRefs: [0, 1] } : s) },
      { ...plan, shots: plan.shots.map((s, i) => i === 1 ? { ...s, lighting: "A highlight travels left-to-right across the product" } : s) },
      { ...plan, shots: plan.shots.map(s => ({ ...s, camera: "Orbit around the product" })) },
      { ...plan, shots: plan.shots.map(s => ({ ...s, composition: "Macro-only carbon fiber surface with amplified texture" })) },
    ];
    for (const output of invalid) {
      const planned = await directVideoWithClient(input, { createPlan: async () => output });
      assert.deepEqual(planned.shots, plan.shots);
      assert.deepEqual(compileDirectorPlan(planned, input), compiled);
      if (!sparse) assert.equal(parseDirectorOutput(output, input), null);
    }
    const receipt = sealDirectorPlan("fixed", plan, "offline", 1000);
    assert.ok(openDirectorPlan(receipt, "fixed", input, "offline", 1001));
    if (!sparse) {
      const legacy = fixedMaterialDirectorPlan(input, false)!;
      const oldReceipt = sealDirectorPlan("old", legacy, "offline", 1000);
      const restored = openDirectorPlan(oldReceipt, "old", input, "offline", 1001);
      assert.ok(restored);
      assert.deepEqual(compileDirectorPlan(restored, input), compileDirectorPlan(legacy, input));
    }
  });
}

test("Material Study references gate planning and declaredText remains identity-only", async () => {
  const base = directorFixtureInput(libraryFixtures.find(f => f.category === "apparel")!.profile!);
  const input = { ...base, presetId: "material-detail" as const, shotMode: "multi" as const,
    draft: { ...base.draft, shotMode: "multi" as const, durationSeconds: 10 as const, productReferences: [{
      source: { kind: "uploaded-image" as const, sourceAssetId: "10000000-0000-4000-8000-000000000003" },
      sha256: "b".repeat(64), purpose: "logo", declaredText: "İSTANBUL" }] } };
  const reviews = [{ index: 0, status: "matched" as const, view: "detail" as const, reason: "Same product", details: [] }];
  const plan = fallbackDirectorPlan(input, reviews);
  const noText = { ...input, draft: { ...input.draft, productReferences: input.draft.productReferences.map(r => ({ ...r, declaredText: undefined })) } };
  assert.deepEqual(plan.shots, fallbackDirectorPlan(noText, reviews).shots);
  const planned = await directVideoWithClient(input, { createPlan: async () => ({ referenceReviews: reviews, shots: [] }) });
  assert.deepEqual(planned.shots, plan.shots);
  for (const scene of compileDirectorPlan(planned, input).multiPrompt!) {
    assert.ok(scene.prompt.length <= 512);
    assert.ok(scene.prompt.includes("İSTANBUL"));
  }
  const maxText = { ...input, draft: { ...input.draft, productReferences: input.draft.productReferences.map(r => ({ ...r, declaredText: "X".repeat(80) })) } };
  for (const scene of compileDirectorPlan(plan, maxText).multiPrompt!) {
    assert.ok(scene.prompt.length <= 512);
    assert.ok(scene.prompt.includes("X".repeat(80)));
  }
  await assert.rejects(() => directVideoWithClient(input, { createPlan: async () => ({ shots: [] }) }), /references_not_verified/);
  await assert.rejects(() => directVideoWithClient(input, { createPlan: async () => ({ referenceReviews: [{ ...reviews[0], status: "uncertain" }] }) }), /references_not_verified/);
});


test("Material Study excludes named features, unsupported material names and multiple surface targets", () => {
  const original = libraryFixtures.find(f => f.category === "apparel")!.profile!;
  const clean = { ...original, materials: [], dominantColors: [], productShape: "unknown", identityCriticalAttributes: [],
    visibleBranding: { ...original.visibleBranding, hasLogo: true, hasReadableText: true, hasArtwork: true, logoRegions: [], textRegions: [], artworkRegions: [] },
    verticalAttributes: { vertical: "apparel" as const, details: { garmentType: "unknown", primaryColor: null, artworkOrLogoLocations: [], closures: [], pocketStructure: [], hoodOrCollar: null, constructionDetails: [], identitySides: [] } } };
  const base = directorFixtureInput(clean);
  for (const [labels, expected] of [
    [["logo surface relief", "dial marker", "smooth reflective surface"], "smooth reflective surface"],
    [["visible seam", "fine visible surface relief"], "fine visible surface relief"],
    [["titanium", "silk", "carbon fiber"], "Source-visible surface detail"],
    [["smooth surface and patterned edge", "visible woven relief"], "visible woven relief"],
  ] as const) {
    const profile = { ...clean, identityCriticalAttributes: labels.map(attribute => ({ attribute, rationale: "source-visible", regions: [] })) };
    const input = { ...base, profile, presetId: "material-detail" as const, shotMode: "multi" as const,
      draft: { ...base.draft, durationSeconds: 10 as const, shotMode: "multi" as const } };
    assert.equal(fallbackDirectorPlan(input).shots[1].focus, expected);
  }
  const surface = "visible " + "x".repeat(64) + " surface";
  assert.equal(surface.length, 80);
  const profile = { ...clean, identityCriticalAttributes: [{ attribute: surface, rationale: "source-visible", regions: [] }] };
  const input = { ...base, profile, presetId: "material-detail" as const, shotMode: "multi" as const,
    draft: { ...base.draft, durationSeconds: 10 as const, shotMode: "multi" as const, productReferences: [{
      source: { kind: "uploaded-image" as const, sourceAssetId: "10000000-0000-4000-8000-000000000003" },
      sha256: "b".repeat(64), purpose: "logo", declaredText: "X".repeat(80) }] } };
  const plan = fallbackDirectorPlan(input, [{ index: 0, status: "matched", view: "detail", reason: "Same identity", details: [] }]);
  assert.equal(plan.shots[1].focus, surface);
  for (const scene of compileDirectorPlan(plan, input).multiPrompt!) {
    assert.ok(scene.prompt.length <= 512);
    assert.ok(scene.prompt.includes("X".repeat(80)));
  }
});
