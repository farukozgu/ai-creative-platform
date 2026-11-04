import assert from "node:assert/strict";
import test from "node:test";
import { compileDirectorPlan, directVideoWithClient, fallbackDirectorPlan, fixedPresentationDirectorPlan, parseDirectorOutput } from "../src/lib/video-director/core";
import { sealDirectorPlan, openDirectorPlan } from "../src/lib/video-director/receipt";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";
import { directorFixtureInput } from "./fixtures/video-director-fixtures";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { VideoProductionHarness } from "./fixtures/video-production-harness";

for (const category of ["apparel", "cosmetics", "footwear", "bags", "furniture", "headwear", "eyewear", "watches", "food"]) {
  const profile = libraryFixtures.find(f => f.category === category)!.profile!;
  for (const sparse of [false, true]) test(`Window Display ${category}/sparse=${sparse}`, async () => {
    const base = directorFixtureInput(profile);
    const input = { ...base, profile: sparse ? null : profile, presetId: "window-display" as const, shotMode: "multi" as const,
      draft: { ...base.draft, durationSeconds: 10 as const, shotMode: "multi" as const } };
    const plan = fallbackDirectorPlan(input);
    assert.deepEqual(plan.shots.map(s => s.durationSeconds), [4, 3, 3]);
    assert.deepEqual(plan.shots.map(s => s.purpose), ["hero-reveal", "lighting-reveal", "final-hero"]);
    assert.deepEqual(plan.shots.map(s => s.camera), ["Slow restrained push toward storefront display", "Short controlled source-facing lateral glide", "Locked premium display framing"]);
    assert.equal(new Set(plan.shots.map(s => s.composition)).size, 3);
    assert.match(plan.shots[0].composition, /Full product prominent.*minimal storefront display/);
    assert.match(plan.shots[1].composition, /Recognizable product.*display window plane/);
    assert.match(plan.shots[1].lighting, /abstract band shifts on window/);
    assert.match(plan.shots[2].composition, /Complete product dominates.*display/);
    if (category === "apparel" && !sparse) assert.match(plan.shots[2].composition, /source-safe display/);
    if (category === "furniture" && !sparse) assert.match(plan.shots[2].composition, /large showroom display/);
    if (["cosmetics", "watches"].includes(category) && !sparse) assert.match(plan.shots[2].composition, /small pedestal display/);
    if (["footwear", "bags", "headwear", "eyewear"].includes(category) && !sparse) assert.match(plan.shots[2].composition, /elevated display platform/);
    for (const shot of plan.shots) {
      assert.equal(shot.motion, "Product still; source-facing orientation");
      assert.equal(shot.focus, "Source-visible product form");
      assert.deepEqual(shot.evidenceRefs, []);
    }
    assert.doesNotMatch(JSON.stringify(plan.shots), /orbit|360|rotat|spin|people|model|mannequin|human|crowd|traffic|city|landmark|\bmall\b|neon|clutter|manufactur|interior|room tour|macro|hidden|unseen/i);
    const failures: unknown[] = [];
    assert.ok(parseDirectorOutput(plan, input, failure => failures.push(failure)), JSON.stringify(failures));
    const compiled = compileDirectorPlan(plan, input);
    assert.equal(compiled.multiPrompt!.length, 3);
    assert.deepEqual(compiled.multiPrompt!.map(s => s.duration), ["4", "3", "3"]);
    for (const [index, scene] of compiled.multiPrompt!.entries()) {
      assert.ok(scene.prompt.length <= 512);
      for (const field of ["camera", "composition", "lighting", "motion", "pace"] as const) assert.ok(scene.prompt.includes(plan.shots[index][field]), field);
      assert.match(scene.prompt, /One product; abstract glass bands; no mirror\/signage/);
      assert.match(scene.prompt, /known view/);
      assert.doesNotMatch(scene.prompt, /No new floating|stands\/props|Keep source pose|source support/i);
    }
    const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: "kling-v3-standard-image",
      endpointId: "offline", sourceUrl: "https://invalid.example/source" });
    assert.deepEqual(payload.multi_prompt, compiled.multiPrompt);
    const harness = await VideoProductionHarness.create();
    const request = harness.directorRequest(input);
    assert.deepEqual(JSON.parse(request.context).fixedShots.map((s: { durationSeconds: number }) => s.durationSeconds), [4, 3, 3]);
    type Slot = { properties: { camera: { enum: string[] }; focus: { enum: string[] }; composition: { enum: string[] } } };
    const schema = request.schema.properties.shots as unknown as { items: { anyOf: Slot[] } };
    for (const [index, slot] of schema.items.anyOf.entries()) for (const field of ["camera", "focus", "composition"] as const) {
      assert.deepEqual(Array.from(slot.properties[field].enum), [plan.shots[index][field]]);
    }
    harness.assertIsolated();
    const invalid = [
      { ...plan, shots: [] }, { ...plan, shots: [...plan.shots].reverse() },
      { ...plan, shots: plan.shots.map(s => ({ ...s, composition: "Tiny product in a wide architecture shot" })) },
      { ...plan, shots: plan.shots.map(s => ({ ...s, composition: "Busy mall with people and neon store branding" })) },
      { ...plan, shots: plan.shots.map((s, i) => i === 1 ? { ...s, camera: "Orbit around the product", lighting: "Mirror shows the rear product" } : s) },
      { ...plan, shots: plan.shots.map(s => ({ ...s, composition: "Two product silhouettes and invented readable signage" })) },
      { ...plan, shots: plan.shots.map(s => ({ ...s, composition: plan.shots[0].composition })) },
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
      const legacy = fixedPresentationDirectorPlan(input, false)!;
      const oldReceipt = sealDirectorPlan("old", legacy, "offline", 1000);
      const restored = openDirectorPlan(oldReceipt, "old", input, "offline", 1001);
      assert.ok(restored);
      assert.deepEqual(compileDirectorPlan(restored, input), compileDirectorPlan(legacy, input));
    }
  });
}

test("Window Display references gate planning and declaredText remains identity-only", async () => {
  const base = directorFixtureInput(libraryFixtures.find(f => f.category === "apparel")!.profile!);
  const input = { ...base, presetId: "window-display" as const, shotMode: "multi" as const,
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

