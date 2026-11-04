import assert from "node:assert/strict";
import test from "node:test";
import { compileDirectorPlan, directVideoWithClient, fallbackDirectorPlan, fixedFashionMotionDirectorPlan, parseDirectorOutput } from "../src/lib/video-director/core";
import { sealDirectorPlan, openDirectorPlan } from "../src/lib/video-director/receipt";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";
import { directorFixtureInput } from "./fixtures/video-director-fixtures";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { VideoProductionHarness } from "./fixtures/video-production-harness";

for (const category of ["apparel", "bags", "footwear", "cosmetics", "watches", "headwear"]) {
  const profile = libraryFixtures.find(f => f.category === category)!.profile!;
  for (const sparse of [false, true]) test(`Floating ${category}/sparse=${sparse}`, async () => {
    const base = directorFixtureInput(profile);
    const input = { ...base, profile: sparse ? null : profile, presetId: "floating-accessory" as const, shotMode: "multi" as const,
      draft: { ...base.draft, durationSeconds: 10 as const, shotMode: "multi" as const } };
    const plan = fallbackDirectorPlan(input);
    assert.deepEqual(plan.shots.map(s => s.durationSeconds), [3, 4, 3]);
    assert.deepEqual(plan.shots.map(s => s.purpose), ["hero-reveal", "controlled-motion", "final-hero"]);
    assert.deepEqual(plan.shots.map(s => s.camera), ["Locked medium hero framing", "Locked medium-close framing", "Locked balanced hero framing"]);
    assert.match(plan.shots[0].motion, /suspended upward drift/);
    assert.equal(plan.shots[1].motion, "Small rise then soft settle; source-facing");
    assert.match(plan.shots[2].motion, /Damped float settles.*near-still hold/);
    assert.equal(new Set(plan.shots.map(s => s.motion)).size, 3);
    assert.equal(new Set(plan.shots.map(s => s.composition)).size, 3);
    for (const shot of plan.shots) {
      assert.equal(shot.focus, "Source-visible product form");
      assert.deepEqual(shot.evidenceRefs, []);
      assert.match(shot.composition, /Complete|Whole/);
    }
    assert.doesNotMatch(JSON.stringify(plan.shots), /orbit|360|rotat|spin|flip|tumble|sway|dolly|people|manufactur|wind|flutter|mechanism|hidden|unseen|leather|liquid|glass/i);
    const failures: unknown[] = [];
    assert.ok(parseDirectorOutput(plan, input, failure => failures.push(failure)), JSON.stringify(failures));
    const compiled = compileDirectorPlan(plan, input);
    assert.equal(compiled.multiPrompt!.length, 3);
    assert.deepEqual(compiled.multiPrompt!.map(s => s.duration), ["3", "4", "3"]);
    for (const [index, scene] of compiled.multiPrompt!.entries()) {
      assert.ok(scene.prompt.length <= 512);
      for (const field of ["camera", "composition", "lighting", "motion", "pace"] as const) assert.ok(scene.prompt.includes(plan.shots[index][field]), field);
      assert.match(scene.prompt, /Stable source-facing silhouette; no rotation\/spin\/flip/);
      assert.doesNotMatch(scene.prompt, /product stays still|product still|Keep source pose|support\/contact|No new floating|imply float/i);
    }
    if (category === "apparel" && !sparse) for (const scene of compiled.multiPrompt!) assert.match(scene.prompt, /Keep source drape; no wind/);
    else for (const scene of compiled.multiPrompt!) assert.match(scene.prompt, /One rigid-body float/);
    const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: "kling-v3-standard-image",
      endpointId: "offline", sourceUrl: "https://invalid.example/source" });
    assert.deepEqual(payload.multi_prompt, compiled.multiPrompt);
    const harness = await VideoProductionHarness.create();
    const request = harness.directorRequest(input);
    assert.deepEqual(JSON.parse(request.context).fixedShots.map((s: { durationSeconds: number }) => s.durationSeconds), [3, 4, 3]);
    type Slot = { properties: { camera: { enum: string[] }; motion: { enum: string[] }; focus: { enum: string[] } } };
    const schema = request.schema.properties.shots as unknown as { items: { anyOf: Slot[] } };
    for (const [index, slot] of schema.items.anyOf.entries()) for (const field of ["camera", "motion", "focus"] as const) {
      assert.deepEqual(Array.from(slot.properties[field].enum), [plan.shots[index][field]]);
    }
    harness.assertIsolated();
    const invalid = [
      { ...plan, shots: [] }, { ...plan, shots: [...plan.shots].reverse() },
      { ...plan, shots: plan.shots.map(s => ({ ...s, motion: "Spin and tumble the product" })) },
      { ...plan, shots: plan.shots.map(s => ({ ...s, camera: "Orbit around the product" })) },
      { ...plan, shots: plan.shots.map(s => ({ ...s, camera: "Slow dolly-in", motion: "Keep product still" })) },
      { ...plan, shots: plan.shots.map(s => ({ ...s, motion: "Repeated large rises with swinging turns" })) },
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
      const legacy = fixedFashionMotionDirectorPlan(input, false)!;
      const oldReceipt = sealDirectorPlan("old", legacy, "offline", 1000);
      const restored = openDirectorPlan(oldReceipt, "old", input, "offline", 1001);
      assert.ok(restored);
      assert.deepEqual(compileDirectorPlan(restored, input), compileDirectorPlan(legacy, input));
    }
  });
}

test("Floating references gate planning and declaredText remains identity-only", async () => {
  const base = directorFixtureInput(libraryFixtures.find(f => f.category === "apparel")!.profile!);
  const input = { ...base, presetId: "floating-accessory" as const, shotMode: "multi" as const,
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

