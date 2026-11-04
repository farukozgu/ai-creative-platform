import assert from "node:assert/strict";
import test from "node:test";
import { compileDirectorPlan, directVideoWithClient, fallbackDirectorPlan, fixedQuickCutsDirectorPlan, parseDirectorOutput, type VideoDirectorPlan } from "../src/lib/video-director/core";
import { directorProductContext } from "../src/lib/video-director/product-context";
import { sealDirectorPlan, openDirectorPlan } from "../src/lib/video-director/receipt";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { VideoProductionHarness } from "./fixtures/video-production-harness";
import legacy from "./fixtures/quick-cuts-legacy.json";

for (const category of ["apparel", "cosmetics", "footwear", "watches", "jewelry", "bags", "headwear", "eyewear"]) {
  const profile = libraryFixtures.find(f => f.category === category && (category !== "apparel" || f.name === "Kot"))!.profile!;
  for (const sparse of [false, true]) test(`Quick Cuts ${category}/sparse=${sparse}`, async () => {
    const base = directorFixtureInput(profile);
    const input = { ...base, profile: sparse ? null : profile, presetId: "cinematic-hero" as const, shotMode: "multi" as const,
      draft: { ...base.draft, durationSeconds: 10 as const, shotMode: "multi" as const } };
    const plan = fallbackDirectorPlan(input);
    assert.equal(plan.shots.length, 5);
    assert.deepEqual(plan.shots.map(s => s.durationSeconds), [2, 2, 2, 2, 2]);
    assert.deepEqual(plan.shots.map(s => s.purpose), ["hero-reveal", "macro-detail", "controlled-motion", "lighting-reveal", "final-hero"]);
    assert.deepEqual(plan.shots.map(s => s.camera), ["Locked medium hero framing", "Locked close framing", "Short source-facing lateral camera glide", "Locked medium-close framing", "Locked balanced hero framing"]);
    assert.equal(new Set(plan.shots.map(s => s.composition)).size, 5);
    for (const shot of plan.shots) assert.match(shot.motion, /Product still.*source orientation/);
    for (const index of [0, 2, 3, 4]) {
      assert.equal(plan.shots[index].focus, "Source-visible product form");
      assert.deepEqual(plan.shots[index].evidenceRefs, []);
      assert.match(plan.shots[index].composition, /[Cc]omplete|[Mm]edium product/);
    }
    if (sparse) {
      assert.equal(plan.shots[1].focus, "Source-visible surface detail");
      assert.deepEqual(plan.shots[1].evidenceRefs, []);
    } else {
      assert.equal(plan.shots[1].evidenceRefs.length, 1);
      assert.equal(plan.shots[1].focus, directorProductContext(profile).evidence[plan.shots[1].evidenceRefs[0]].detail);
    }
    assert.equal(plan.shots.filter(s => s.purpose === "macro-detail").length, 1);
    assert.equal(plan.shots.filter(s => s.evidenceRefs.length).length, sparse ? 0 : 1);
    assert.match(plan.shots[3].lighting, /One short highlight pass/);
    assert.doesNotMatch(JSON.stringify(plan.shots), /orbit|360|rotat|spin|whip|crash|handheld|people|manufactur|liquid|mechanism|hidden|unseen|cutaway|montage|cut to/i);
    const failures: unknown[] = [];
    assert.ok(parseDirectorOutput(plan, input, failure => failures.push(failure)), JSON.stringify(failures));
    const compiled = compileDirectorPlan(plan, input);
    assert.equal(compiled.multiPrompt!.length, 5);
    assert.deepEqual(compiled.multiPrompt!.map(s => s.duration), ["2", "2", "2", "2", "2"]);
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
    assert.deepEqual(JSON.parse(request.context).fixedShots.map((s: { durationSeconds: number }) => s.durationSeconds), [2, 2, 2, 2, 2]);
    type Slot = { properties: { camera: { enum: string[] }; focus: { enum: string[] }; purpose: { enum: string[] } } };
    const schema = request.schema.properties.shots as unknown as { items: { anyOf: Slot[] } };
    for (const [index, slot] of schema.items.anyOf.entries()) for (const field of ["camera", "focus", "purpose"] as const) {
      assert.deepEqual(Array.from(slot.properties[field].enum), [plan.shots[index][field]]);
    }
    harness.assertIsolated();
    const invalid = [
      { ...plan, shots: [] }, { ...plan, shots: [...plan.shots].reverse() },
      { ...plan, shots: plan.shots.map((s, i) => i === 2 ? { ...s, camera: "Orbit around the product" } : s) },
      { ...plan, shots: plan.shots.map(s => ({ ...s, camera: "Slow dolly-in" })) },
      { ...plan, shots: plan.shots.map(s => ({ ...s, durationSeconds: 1 })) },
      { ...plan, shots: plan.shots.map((s, i) => i === 3 ? { ...plan.shots[1], purpose: s.purpose } : s) },
      { ...plan, shots: plan.shots.map((s, i) => i === 3 ? { ...s, camera: "Short lateral camera glide" } : s) },
      { ...plan, shots: plan.shots.map(s => ({ ...s, composition: "Cut to people, then a factory montage" })) },
    ];
    for (const output of invalid) {
      const planned = await directVideoWithClient(input, { createPlan: async () => output });
      assert.deepEqual(planned.shots, plan.shots);
      assert.deepEqual(compileDirectorPlan(planned, input), compiled);
    }
    const receipt = sealDirectorPlan("fixed", plan, "offline", 1000);
    assert.ok(openDirectorPlan(receipt, "fixed", input, "offline", 1001));
  });
}

test("pre-Quick-Cuts receipts still open and compile to their original Kling scenes", () => {
  const base = directorFixtureInput(directorProducts[0]);
  const input = { ...base, presetId: "cinematic-hero" as const, shotMode: "multi" as const,
    draft: { ...base.draft, durationSeconds: 10 as const, shotMode: "multi" as const } };
  const oldPlan = legacy.plan as VideoDirectorPlan;
  const receipt = sealDirectorPlan("old", oldPlan, "offline", 1000);
  const restored = openDirectorPlan(receipt, "old", input, "offline", 1001);
  assert.ok(restored);
  assert.deepEqual(compileDirectorPlan(restored, input), legacy.compiled);
  assert.equal(fixedQuickCutsDirectorPlan({ ...input, shotMode: "single" }), null);
  assert.equal(fixedQuickCutsDirectorPlan({ ...input, draft: { ...input.draft, durationSeconds: 5 } }), null);
  assert.equal(fixedQuickCutsDirectorPlan({ ...input, presetId: "minimal-studio" }), null);
});

test("Quick Cuts references gate planning and declaredText remains identity-only", async () => {
  const base = directorFixtureInput(libraryFixtures.find(f => f.category === "apparel")!.profile!);
  const input = { ...base, presetId: "cinematic-hero" as const, shotMode: "multi" as const,
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

