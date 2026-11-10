import assert from "node:assert/strict";
import test from "node:test";
import baseline from "./fixtures/signature-motion-baseline.json";
import type { VideoDirectorPlan } from "../src/lib/video-director/core";
import { compileDirectorPlan, directVideoWithClient, fallbackDirectorPlan, fixedMinimalDirectorPlan, parseDirectorOutput } from "../src/lib/video-director/core";
import { directorProductContext } from "../src/lib/video-director/product-context";
import { sealDirectorPlan, openDirectorPlan } from "../src/lib/video-director/receipt";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";
import { directorFixtureInput } from "./fixtures/video-director-fixtures";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { VideoProductionHarness } from "./fixtures/video-production-harness";

for (const category of ["apparel", "cosmetics", "footwear"]) {
  const profile = libraryFixtures.find(f => f.category === category)!.profile!;
  for (const sparse of [false, true]) test(`Signature Studio ${category}/sparse=${sparse}`, async () => {
    const base = directorFixtureInput(profile);
    const input = { ...base, profile: sparse ? null : profile, presetId: "minimal-studio" as const, shotMode: "multi" as const,
      draft: { ...base.draft, durationSeconds: 10 as const, shotMode: "multi" as const } };
    const plan = fallbackDirectorPlan(input);
    const harness = await VideoProductionHarness.create();
    const request = harness.directorRequest(input);
    const fixedShots = JSON.parse(request.context).fixedShots;
    assert.deepEqual(fixedShots.map((s: { durationSeconds: number }) => s.durationSeconds), [4, 3, 3]);
    type Slot = { properties: { camera: { enum: string[] }; focus: { enum: string[] } } };
    const schema = request.schema.properties.shots as unknown as { items: { anyOf: Slot[] } };
    for (const [index, slot] of schema.items.anyOf.entries()) {
      assert.deepEqual(Array.from(slot.properties.camera.enum), [plan.shots[index].camera]);
      assert.deepEqual(Array.from(slot.properties.focus.enum), [plan.shots[index].focus]);
    }
    harness.assertIsolated();
    assert.deepEqual(plan.shots.map(s => s.durationSeconds), [4, 3, 3]);
    assert.deepEqual(plan.shots.map(s => s.purpose), ["hero-reveal", "lighting-reveal", "final-hero"]);
    assert.deepEqual(plan.shots.map(s => s.camera), ["Straight axial long-lens push-in", "Locked offset medium framing", "Locked static hero framing"]);
    for (const i of [0, 2]) {
      assert.equal(plan.shots[i].focus, "Source-visible product form");
      assert.deepEqual(plan.shots[i].evidenceRefs, []);
      assert.match(plan.shots[i].composition, /Full product|Complete product/);
    }
    const detail = plan.shots[1];
    if (sparse) { assert.deepEqual(detail.evidenceRefs, []); assert.equal(detail.focus, "Source-visible surface detail"); }
    else { assert.equal(detail.evidenceRefs.length, 1); assert.equal(detail.focus, directorProductContext(profile).evidence[detail.evidenceRefs[0]].detail); }
    const previous = baseline.find(row => row.category === category && row.sparse === sparse)!;
    assert.equal(detail.focus, previous.plan.shots[1].focus);
    assert.deepEqual(detail.evidenceRefs, previous.plan.shots[1].evidenceRefs);
    assert.match(detail.lighting, /Steady directional key/);
    assert.equal(plan.shots[0].composition, previous.plan.shots[0].composition);
    assert.equal(plan.shots[0].lighting, previous.plan.shots[0].lighting);
    assert.match(plan.shots[2].composition, /Complete product centered in a balanced/);
    assert.match(plan.shots[2].lighting, /Clean key and soft fill/);
    assert.equal(plan.shots[2].motion, "Product and camera remain completely still and source-facing for the entire shot");
    assert.equal(plan.shots[2].pace, "Stable three-second premium hero hold");
    assert.doesNotMatch(plan.shots[2].motion, /settle|push|pull|drift|reorient/i);
    const oldReceipt = sealDirectorPlan("pre-tuning", previous.plan as VideoDirectorPlan, "offline", 1000);
    const oldPlan = openDirectorPlan(oldReceipt, "pre-tuning", input, "offline", 1001);
    assert.ok(oldPlan);
    assert.deepEqual(compileDirectorPlan(oldPlan, input), previous.compiled);
    const failures: unknown[] = [];
    assert.ok(parseDirectorOutput(plan, input, failure => failures.push(failure)), JSON.stringify(failures));
    const compiled = compileDirectorPlan(plan, input);
    assert.equal(compiled.multiPrompt!.length, 3);
    assert.deepEqual(compiled.multiPrompt!.map(s => s.duration), ["4", "3", "3"]);
    assert.doesNotMatch(compiled.multiPrompt![1].prompt, /highlight travels/);
    assert.equal(compiled.negativePrompt, previous.compiled.negativePrompt);
    assert.match(compiled.multiPrompt![0].prompt, /No arc, lateral drift, perspective swing or reorientation/);
    assert.match(compiled.multiPrompt![0].prompt, /no product rotation\/yaw\/pitch\/roll/);
    assert.match(compiled.multiPrompt![2].prompt, /hold full frame for all 3 seconds/);
    assert.match(compiled.multiPrompt![2].prompt, /No rotation\/yaw\/pitch\/roll, perspective change, translation, zoom\/dolly\/lateral movement/);
    assert.doesNotMatch(compiled.multiPrompt![2].prompt, /settle|push-in|pull-back|reorient|drift/i);
    const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: "kling-v3-standard-image",
      endpointId: "offline", sourceUrl: "https://invalid.example/source" });
    assert.deepEqual(payload.multi_prompt, compiled.multiPrompt);
    for (const [index, scene] of compiled.multiPrompt!.entries()) {
      assert.ok(scene.prompt.length <= 512);
      assert.match(scene.prompt, index === 0 ? /perfectly fixed and source-facing/ : /still|fixed/);
      assert.doesNotMatch(scene.prompt, /orbit|360|turntable|manufactur|people|hidden side/i);
      for (const field of ["camera", "composition", "lighting", "pace"] as const) {
        assert.ok(scene.prompt.includes(plan.shots[index][field]), field);
      }
    }
    for (const output of [{ ...plan, shots: [] }, fixedMinimalDirectorPlan(input, false),
      { ...plan, shots: [...plan.shots].reverse() },
      { ...plan, shots: plan.shots.map(s => ({ ...s, camera: "Orbit around the product" })) }]) {
      const planned = await directVideoWithClient(input, { createPlan: async () => output });
      assert.deepEqual(planned.shots, plan.shots);
      assert.deepEqual(compileDirectorPlan(planned, input), compiled);
    }
    const receipt = sealDirectorPlan("fixed", plan, "offline", 1000);
    assert.ok(openDirectorPlan(receipt, "fixed", input, "offline", 1001));
    if (!sparse) {
      const legacy = fixedMinimalDirectorPlan(input, false)!;
      const oldReceipt = sealDirectorPlan("old", legacy, "offline", 1000);
      assert.ok(openDirectorPlan(oldReceipt, "old", input, "offline", 1001));
    }
  });
}

test("Signature references gate planning and declaredText remains identity-only", async () => {
  const base = directorFixtureInput(libraryFixtures.find(f => f.category === "apparel")!.profile!);
  const input = { ...base, presetId: "minimal-studio" as const, shotMode: "multi" as const,
    draft: { ...base.draft, shotMode: "multi" as const, durationSeconds: 10 as const, productReferences: [{
      source: { kind: "uploaded-image" as const, sourceAssetId: "10000000-0000-4000-8000-000000000003" },
      sha256: "b".repeat(64), purpose: "logo", declaredText: "İSTANBUL" }] } };
  const reviews = [{ index: 0, status: "matched" as const, view: "detail" as const, reason: "Same product", details: [] }];
  const plan = fallbackDirectorPlan(input, reviews);
  const previous = baseline.find(row => row.category === "apparel" && !row.sparse)!;
  const oldPlan = { ...previous.plan, referenceReviews: reviews } as VideoDirectorPlan;
  assert.equal(plan.shots[1].focus, oldPlan.shots[1].focus);
  assert.equal(plan.shots[1].referenceIndex, undefined);
  assert.match(compileDirectorPlan(plan, input).multiPrompt![1].prompt, /Steady directional key/);
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

