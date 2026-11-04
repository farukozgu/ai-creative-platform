import assert from "node:assert/strict";
import test from "node:test";
import { compileDirectorPlan, directVideoWithClient, fallbackDirectorPlan, fixedMacroDirectorPlan, parseDirectorOutput } from "../src/lib/video-director/core";
import { directorProductContext } from "../src/lib/video-director/product-context";
import { sealDirectorPlan, openDirectorPlan } from "../src/lib/video-director/receipt";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";
import { directorFixtureInput } from "./fixtures/video-director-fixtures";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { VideoProductionHarness } from "./fixtures/video-production-harness";

for (const category of ["apparel", "cosmetics", "watches", "jewelry", "footwear", "eyewear"]) {
  const fixture = libraryFixtures.find(f => f.category === category && (category !== "apparel" || f.name === "Kot"))!;
  const profile = fixture.profile!;
  for (const sparse of [false, true]) test(`Macro Details ${category}/sparse=${sparse}`, async () => {
    const base = directorFixtureInput(profile);
    const input = { ...base, profile: sparse ? null : profile, presetId: "macro-detail-reveal" as const, shotMode: "multi" as const,
      draft: { ...base.draft, durationSeconds: 10 as const, shotMode: "multi" as const } };
    const plan = fallbackDirectorPlan(input);
    assert.deepEqual(plan.shots.map(s => s.durationSeconds), [3, 4, 3]);
    assert.deepEqual(plan.shots.map(s => s.purpose), ["hero-reveal", "macro-detail", "final-hero"]);
    assert.deepEqual(plan.shots.map(s => s.camera), ["Locked medium product framing", "Locked macro framing", "Slow pull-back to full product framing"]);
    assert.match(plan.shots[1].composition, /One region.*source-resolvable/);
    for (const shot of plan.shots) assert.match(shot.motion, /Product still.*source orientation/);
    for (const index of [0, 2]) {
      assert.equal(plan.shots[index].focus, "Source-visible product form");
      assert.deepEqual(plan.shots[index].evidenceRefs, []);
      assert.match(plan.shots[index].composition, /[Cc]omplete/);
    }
    assert.equal(plan.shots.filter(s => s.purpose === "macro-detail").length, 1);
    if (sparse) {
      assert.equal(plan.shots[1].focus, "Source-visible surface detail");
      assert.deepEqual(plan.shots[1].evidenceRefs, []);
    } else {
      assert.equal(plan.shots[1].evidenceRefs.length, 1);
      assert.equal(plan.shots[1].focus, directorProductContext(profile).evidence[plan.shots[1].evidenceRefs[0]].detail);
    }
    assert.doesNotMatch(JSON.stringify(plan.shots), /orbit|360|spin|people|manufactur|liquid|transparen|mechanism|hidden|unseen/i);
    const failures: unknown[] = [];
    assert.ok(parseDirectorOutput(plan, input, failure => failures.push(failure)), JSON.stringify(failures));
    const compiled = compileDirectorPlan(plan, input);
    assert.equal(compiled.multiPrompt!.length, 3);
    assert.deepEqual(compiled.multiPrompt!.map(s => s.duration), ["3", "4", "3"]);
    for (const [index, scene] of compiled.multiPrompt!.entries()) {
      assert.ok(scene.prompt.length <= 512);
      for (const field of ["camera", "composition", "lighting", "motion", "pace"] as const) assert.ok(scene.prompt.includes(plan.shots[index][field]), field);
    }
    assert.equal(compiled.multiPrompt![1].prompt.split(plan.shots[1].focus).length - 1, 1);
    const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: "kling-v3-standard-image",
      endpointId: "offline", sourceUrl: "https://invalid.example/source" });
    assert.deepEqual(payload.multi_prompt, compiled.multiPrompt);
    const harness = await VideoProductionHarness.create();
    const request = harness.directorRequest(input);
    assert.deepEqual(JSON.parse(request.context).fixedShots.map((s: { durationSeconds: number }) => s.durationSeconds), [3, 4, 3]);
    type Slot = { properties: { camera: { enum: string[] }; focus: { enum: string[] } } };
    const schema = request.schema.properties.shots as unknown as { items: { anyOf: Slot[] } };
    for (const [index, slot] of schema.items.anyOf.entries()) for (const field of ["camera", "focus"] as const) {
      assert.deepEqual(Array.from(slot.properties[field].enum), [plan.shots[index][field]]);
    }
    harness.assertIsolated();
    const detail = plan.shots[1];
    const invalid = [
      { ...plan, shots: [] },
      { ...plan, shots: [...plan.shots].reverse() },
      { ...plan, shots: plan.shots.map(s => ({ ...s, camera: "Slow dolly-in" })) },
      { ...plan, shots: plan.shots.map((s, i) => i === 0 || i === 2 ? { ...detail, purpose: s.purpose, durationSeconds: s.durationSeconds } : s) },
      { ...plan, shots: plan.shots.map((s, i) => i === 1 ? { ...s, focus: "logo and stitching", evidenceRefs: [0, 1] } : s) },
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
      const legacy = fixedMacroDirectorPlan(input, false)!;
      const oldReceipt = sealDirectorPlan("old", legacy, "offline", 1000);
      assert.ok(openDirectorPlan(oldReceipt, "old", input, "offline", 1001));
    }
  });
}

test("Macro references gate planning and declaredText remains identity-only", async () => {
  const base = directorFixtureInput(libraryFixtures.find(f => f.category === "apparel")!.profile!);
  const input = { ...base, presetId: "macro-detail-reveal" as const, shotMode: "multi" as const,
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


test("Macro detail priority is feature, surface, then safe generic; combined targets are excluded", () => {
  const original = libraryFixtures.find(f => f.category === "apparel")!.profile!;
  const clean = { ...original, materials: [], dominantColors: [], productShape: "unknown", identityCriticalAttributes: [],
    visibleBranding: { ...original.visibleBranding, hasLogo: false, hasReadableText: false, hasArtwork: false, logoRegions: [], textRegions: [], artworkRegions: [] },
    verticalAttributes: { vertical: "apparel" as const, details: { garmentType: "unknown", primaryColor: null, artworkOrLogoLocations: [], closures: [], pocketStructure: [], hoodOrCollar: null, constructionDetails: [], identitySides: [] } } };
  const base = directorFixtureInput(clean);
  for (const [labels, expected] of [
    [["visible surface texture", "visible seam"], "visible seam"],
    [["visible seam and panel", "visible edge contour"], "visible edge contour"],
    [["visible seam and panel", "silk", "internal mechanism"], "Source-visible surface detail"],
  ] as const) {
    const profile = { ...clean, identityCriticalAttributes: labels.map(attribute => ({ attribute, rationale: "source-visible", regions: [] })) };
    const input = { ...base, profile, presetId: "macro-detail-reveal" as const, shotMode: "multi" as const,
      draft: { ...base.draft, durationSeconds: 10 as const, shotMode: "multi" as const } };
    assert.equal(fallbackDirectorPlan(input).shots[1].focus, expected);
  }
});
