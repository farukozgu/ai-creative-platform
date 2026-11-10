import assert from "node:assert/strict";
import test from "node:test";
import { compileDirectorPlan, directVideoWithClient, fallbackDirectorPlan, fixedLightingDirectorPlan, parseDirectorOutput } from "../src/lib/video-director/core";
import { sealDirectorPlan, openDirectorPlan } from "../src/lib/video-director/receipt";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";
import { directorFixtureInput } from "./fixtures/video-director-fixtures";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { VideoProductionHarness } from "./fixtures/video-production-harness";

for (const category of ["apparel", "cosmetics", "watches", "footwear"]) {
  const profile = libraryFixtures.find(f => f.category === category)!.profile!;
  for (const sparse of [false, true]) test(`Light Sweep ${category}/sparse=${sparse}`, async () => {
    const base = directorFixtureInput(profile);
    const input = { ...base, profile: sparse ? null : profile, presetId: "metallic-light-sweep" as const, shotMode: "multi" as const,
      draft: { ...base.draft, durationSeconds: 10 as const, shotMode: "multi" as const } };
    const plan = fallbackDirectorPlan(input);
    assert.deepEqual(plan.shots.map(s => s.durationSeconds), [3, 4, 3]);
    assert.deepEqual(plan.shots.map(s => s.purpose), ["hero-reveal", "lighting-reveal", "final-hero"]);
    assert.deepEqual(plan.shots.map(s => s.camera), [
      "Locked full product framing", "Locked offset close framing", "Locked balanced hero framing",
    ]);
    assert.equal(plan.shots[1].lighting, "One soft highlight travels left-to-right across the visible surface");
    assert.equal(plan.shots[2].pace, "Stable full-product hold for all 3s");
    for (const shot of plan.shots) {
      assert.match(shot.motion, /Product (?:fixed|and camera still).*source-facing/);
      assert.deepEqual(shot.evidenceRefs, []);
    }
    for (const index of [0, 2]) {
      assert.equal(plan.shots[index].focus, "Source-visible product form");
      assert.match(plan.shots[index].composition, /Complete product/);
    }
    assert.equal(plan.shots[1].focus, "Source-visible surface detail");
    assert.doesNotMatch(JSON.stringify(plan.shots), /orbit|360|rotat|turntable|dolly|float|people|manufactur|glass|metal|leather|liquid|satin|transparen|mechanism|hidden|unseen|strob|flash/i);
    const failures: unknown[] = [];
    assert.ok(parseDirectorOutput(plan, input, failure => failures.push(failure)), JSON.stringify(failures));
    const compiled = compileDirectorPlan(plan, input);
    assert.equal(compiled.multiPrompt!.length, 3);
    assert.deepEqual(compiled.multiPrompt!.map(s => s.duration), ["3", "4", "3"]);
    const watch = category === "watches" && !sparse;
    for (const [index, scene] of compiled.multiPrompt!.entries()) {
      assert.ok(scene.prompt.length <= 512);
      assert.match(scene.prompt, /^Locked/);
      assert.doesNotMatch(scene.prompt, /orbit|arc\b|rotat|swing|3\/4|hidden side|axial|push-in|pull-back/i);
      if (watch) {
        assert.match(scene.prompt, /Exact source dial each frame: numerals, indices, logo, hands, date window, print and visible complications keep shape\/position/);
        assert.match(scene.prompt, /No redraw, replacement, morphing or invented text/);
      } else {
        assert.doesNotMatch(scene.prompt, /dial graphics/);
        for (const field of ["composition", "lighting", "pace"] as const) assert.ok(scene.prompt.includes(plan.shots[index][field]), field);
      }
    }
    const sweep = compiled.multiPrompt![1].prompt;
    assert.match(sweep, /Locked offset (?:close framing|crop)/);
    assert.equal(sweep.match(/left-to-right/g)?.length, 1);
    assert.match(sweep, /One (?:soft highlight travels left-to-right|left-to-right highlight)/);
    assert.match(compiled.multiPrompt![2].prompt, /hero.*all 3s/);
    const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: "kling-v3-standard-image",
      endpointId: "offline", sourceUrl: "https://invalid.example/source" });
    assert.deepEqual(payload.multi_prompt, compiled.multiPrompt);
    const harness = await VideoProductionHarness.create();
    const request = harness.directorRequest(input);
    assert.deepEqual(JSON.parse(request.context).fixedShots.map((s: { durationSeconds: number }) => s.durationSeconds), [3, 4, 3]);
    type Slot = { properties: { camera: { enum: string[] }; lighting: { enum: string[] }; focus: { enum: string[] } } };
    const schema = request.schema.properties.shots as unknown as { items: { anyOf: Slot[] } };
    for (const [index, slot] of schema.items.anyOf.entries()) for (const field of ["camera", "lighting", "focus"] as const) {
      assert.deepEqual(Array.from(slot.properties[field].enum), [plan.shots[index][field]]);
    }
    harness.assertIsolated();
    for (const output of [{ ...plan, shots: [] }, fixedLightingDirectorPlan(input, false),
      { ...plan, shots: [...plan.shots].reverse() },
      { ...plan, shots: plan.shots.map(s => ({ ...s, camera: "Slow dolly-in" })) },
      { ...plan, shots: plan.shots.map(s => ({ ...s, lighting: "Opposing lights flash everywhere" })) }]) {
      const planned = await directVideoWithClient(input, { createPlan: async () => output });
      assert.deepEqual(planned.shots, plan.shots);
      assert.deepEqual(compileDirectorPlan(planned, input), compiled);
    }
    // Unknown-category legacy receipts retain their permissive parsing; new planning is fixed above.
    if (!sparse) for (const patch of [{ camera: "Short lateral camera glide" }, { lighting: "Light travels right-to-left" }, { purpose: "macro-detail" as const }, { focus: "glass liquid" }]) {
      assert.equal(parseDirectorOutput({ ...plan, shots: plan.shots.map((s, i) => i === 1 ? { ...s, ...patch } : s) }, input), null);
    }
    const receipt = sealDirectorPlan("fixed", plan, "offline", 1000);
    assert.ok(openDirectorPlan(receipt, "fixed", input, "offline", 1001));
    const locked = fixedLightingDirectorPlan(input, true, true)!;
    const lockedReceipt = sealDirectorPlan("locked", locked, "offline", 1000);
    const restoredLocked = openDirectorPlan(lockedReceipt, "locked", input, "offline", 1001);
    assert.ok(restoredLocked);
    assert.deepEqual(compileDirectorPlan(restoredLocked, input).multiPrompt, [
      { duration: "3", prompt: "Locked medium hero framing. Complete product; clean studio; balanced negative space. Restrained soft directional light defines form. Product and camera stay still. Quiet setup before sweep. Exact source shape/colors/material/marks/parts; source orientation and visible surfaces only" },
      { duration: "4", prompt: "Locked close product framing. Visible contour and surface; source-facing view. One soft highlight travels left-to-right on surface. Product and camera stay still. One measured light pass. Exact source shape/colors/material/marks/parts; source orientation and visible surfaces only" },
      { duration: "3", prompt: "Locked balanced hero framing. Complete product; clean advertising frame. Clean key/fill; stronger separation than opening. Product and camera still; final hold. Resolved advertising hold. Exact source shape/colors/material/marks/parts; source orientation and visible surfaces only" },
    ]);
    if (!sparse) {
      const legacy = fixedLightingDirectorPlan(input, false)!;
      const oldReceipt = sealDirectorPlan("old", legacy, "offline", 1000);
      const restored = openDirectorPlan(oldReceipt, "old", input, "offline", 1001);
      assert.ok(restored);
      assert.deepEqual(compileDirectorPlan(restored, input), compileDirectorPlan(legacy, input));
    }
  });
}

test("Light Sweep references gate planning and declaredText remains identity-only", async () => {
  const base = directorFixtureInput(libraryFixtures.find(f => f.category === "apparel")!.profile!);
  const input = { ...base, presetId: "metallic-light-sweep" as const, shotMode: "multi" as const,
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
  const quotedText = "X".repeat(42) + '"'.repeat(38);
  const watchInput = { ...maxText, profile: libraryFixtures.find(f => f.category === "watches")!.profile!,
    draft: { ...maxText.draft, productReferences: maxText.draft.productReferences.map(r => ({ ...r, declaredText: quotedText })) } };
  const watchScenes = compileDirectorPlan(fallbackDirectorPlan(watchInput, reviews), watchInput).multiPrompt!;
  assert.match(watchScenes[0].prompt, /^Locked full product/);
  assert.match(watchScenes[1].prompt, /^Locked offset crop.*highlight travels left-to-right/);
  assert.match(watchScenes[2].prompt, /^Locked full hero all 3s/);
  for (const scene of watchScenes) {
    assert.ok(scene.prompt.length <= 512);
    assert.ok(scene.prompt.includes(JSON.stringify(quotedText)));
    assert.match(scene.prompt, /Exact source dial each frame: numerals, indices, logo, hands, date window, print and visible complications keep shape\/position/);
    assert.match(scene.prompt, /No redraw, replacement, morphing or invented text/);
  }
  await assert.rejects(() => directVideoWithClient(input, { createPlan: async () => ({ shots: [] }) }), /references_not_verified/);
  await assert.rejects(() => directVideoWithClient(input, { createPlan: async () => ({ referenceReviews: [{ ...reviews[0], status: "uncertain" }] }) }), /references_not_verified/);
});

