import assert from "node:assert/strict";
import test from "node:test";
import { compileDirectorPlan, directorPlanDescriptions, fallbackDirectorPlan, fixedLegacyDirectorPlan, parseDirectorOutput, type VideoDirectorInput } from "../src/lib/video-director/core";
import { directorCacheKey, openDirectorPlan, sealDirectorPlan } from "../src/lib/video-director/receipt";
import { directorElementReferences, type ReferenceReview } from "../src/lib/video-generation/product-references";
import { scopeD1ProductReferenceReview } from "../src/lib/video-generation/product-reference-policy";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { directorShotContract } from "../src/lib/video-director/plan-contract";
import { legacyD1FiveSecondShots } from "../src/lib/video-director/five-second-multi-legacy";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";
import { VideoProductionHarness, videoTestOwner, videoTestSource } from "./fixtures/video-production-harness";

const presets = ["minimal-studio", "metallic-light-sweep"] as const;
const ref = (purpose: string, digit: string, hash = digit) => ({ purpose, sha256: hash.repeat(64),
  source: { kind: "uploaded-image" as const, sourceAssetId: `10000000-0000-4000-8000-00000000000${digit}` } });
const dial = ref("dial-detail", "4", "a"), side = ref("side-profile", "5", "b"), other = ref("other-product-view", "6", "c");
const review = (index: number, view: ReferenceReview["view"], complete = false): ReferenceReview => ({
  index, status: "matched", view, reason: "Offline same-product review", details: [],
  ...(complete ? { wholeSideVisible: true, wholeViewVisible: true, creativeSafeSide: view === "side" } : {}),
});
function inputFor(presetId: typeof presets[number], profile: VideoDirectorInput["profile"] = directorProducts[2]): VideoDirectorInput {
  const base = directorFixtureInput(profile ?? directorProducts[0]);
  return { ...base, presetId, profile, draft: { ...base.draft, durationSeconds: 5 } };
}
function assertDial(prompt: string) {
  for (const term of [/dial layout/, /numerals/, /indices/, /logo/, /hands/, /date window/, /print/, /visible complications/,
    /each frame/, /shape\/position/, /No redraw, replacement, morphing or invented text/]) assert.match(prompt, term);
}

for (const presetId of presets) {
  test(`${presetId}: rich/sparse exact editorial beats, primary locked finish and one preset event`, () => {
    for (const sparse of [false, true]) {
      const input = inputFor(presetId, sparse ? null : directorProducts[2]);
      const plan = fallbackDirectorPlan(input);
      assert.deepEqual(plan.shots.map(s => s.durationSeconds), presetId === "minimal-studio" ? [2, 2, 1] : [1, 2, 2]);
      assert.ok(parseDirectorOutput(plan, input));
      assert.deepEqual(plan, fallbackDirectorPlan(input));
      assert.equal(plan.shots.length, 3);
      assert.equal(directorShotContract("multi", 5, presetId).maxShots, 3);
      assert.match(plan.shots[1].camera, /Tiny lateral reframe|Very slight axial push-in/);
      assert.equal(plan.shots[0].referenceIndex, undefined);
      const final = plan.shots.at(-1)!;
      assert.equal(final.referenceIndex, undefined);
      assert.equal(final.durationSeconds, presetId === "minimal-studio" ? 1 : 2);
      assert.match(final.composition, /Complete primary product/);
      if (presetId === "minimal-studio") assert.match(final.motion, /Product and camera completely still/);
      else assert.match(final.camera, /pull-back/);
      const compiled = compileDirectorPlan(plan, input);
      assert.deepEqual(compiled.multiPrompt!.map(s => Number(s.duration)), plan.shots.map(s => s.durationSeconds));
      for (const scene of compiled.multiPrompt!) {
        assert.ok(scene.prompt.length <= 512);
        assert.match(scene.prompt, /(?:Direct cuts between views|Cuts; known view); no rotation\/interpolation/);
        assert.doesNotMatch(scene.prompt, /Product\/camera fixed/);
        if (!sparse) assertDial(scene.prompt);
      }
      if (presetId === "metallic-light-sweep") {
        assert.deepEqual(plan.shots.flatMap((s, i) => /left-to-right/.test(s.lighting) ? [i] : []), [1]);
        assert.equal(compiled.multiPrompt!.filter(s => /left-to-right/.test(s.prompt)).length, 1);
        assert.doesNotMatch(plan.shots[0].lighting + plan.shots[2].lighting, /pass|sweep|travels/);
      } else assert.doesNotMatch(JSON.stringify(compiled), /left-to-right|highlight travels|traveling highlight/);
      for (const mutate of [
        { shots: [...plan.shots].reverse() },
        { shots: plan.shots.map((s, i) => i === 1 ? { ...s, composition: plan.shots[0].composition } : s) },
        { shots: plan.shots.map((s, i) => i === plan.shots.length - 1 ? { ...s, camera: "Slow dolly-in" } : s) },
      ]) assert.equal(parseDirectorOutput({ ...plan, ...mutate }, input), null);
      // Authored D1 keeps its cut rhythm and finish even with a legacy camera/focus preference.
      const directed = { ...input, draft: { ...input.draft, prompt: "Finish on the dial", cameraMovement: "dolly-in" as const } };
      assert.deepEqual(fallbackDirectorPlan(directed).shots, plan.shots);
      assert.doesNotThrow(() => compileDirectorPlan(fallbackDirectorPlan(directed), directed));
    }
  });

  test(`${presetId}: complete view authority, bounded detail evidence and deterministic middle-scene binding`, () => {
    const base = inputFor(presetId);
    const withRefs = { ...base, draft: { ...base.draft, productReferences: [dial, side, other] } };
    const reviews = [review(0, "detail"), review(1, "side", true), review(2, "back", true)];
    const plan = fallbackDirectorPlan(withRefs, reviews);
    assert.deepEqual(plan.shots.map(s => s.referenceIndex), [undefined, 1, undefined]);
    assert.deepEqual(directorElementReferences(plan, withRefs.draft.productReferences).map(r => r.index), [1]);
    const compiled = compileDirectorPlan(plan, withRefs);
    for (const [index, scene] of compiled.multiPrompt!.entries()) {
      assert.ok(scene.prompt.length <= 512);
      if (index === 1) {
        assert.match(scene.prompt, /^@Element1: Use side view from reference image 1/);
        assert.match(scene.prompt, /pictured orientation/);
        assert.doesNotMatch(scene.prompt, /primary|front-facing|source-facing|dial|axial|orbit|turntable/i);
      } else {
        assert.doesNotMatch(scene.prompt, /@Element/);
        assertDial(scene.prompt);
      }
    }
    for (const order of [[other, side, dial], [dial, other, side]]) {
      const input = { ...base, draft: { ...base.draft, productReferences: order } };
      const orderedReviews = order.map((r, i) => review(i, r === dial ? "detail" : r === side ? "side" : "back", r !== dial));
      const ordered = fallbackDirectorPlan(input, orderedReviews);
      assert.equal(ordered.shots[1].referenceIndex, order.indexOf(side));
      assert.deepEqual(compileDirectorPlan(ordered, input), compiled);
      assert.equal(order[directorElementReferences(ordered, order)[0].index].source.sourceAssetId, side.source.sourceAssetId);
    }
    // Same-role candidates use hash, then stable asset identity, never array order.
    for (const candidates of [[ref("side-profile", "7", "d"), side], [ref("side-profile", "7", "b"), side]]) {
      for (const order of [candidates, [...candidates].reverse()]) {
        const input = { ...base, draft: { ...base.draft, productReferences: order } };
        const plan = fallbackDirectorPlan(input, order.map((_, i) => review(i, "side", true)));
        assert.equal(order[plan.shots[1].referenceIndex!].source.sourceAssetId, side.source.sourceAssetId);
      }
    }
    for (const [purpose, raw] of [
      ["side-profile", review(0, "side")], ["other-product-view", review(0, "back")],
      ["dial-detail", { ...review(0, "side", true), dialDetailVisible: true }],
      ["critical-detail", review(0, "side", true)],
    ] as const) {
      const input = { ...base, draft: { ...base.draft, productReferences: [ref(purpose, "5")] } };
      const scoped = scopeD1ProductReferenceReview(raw, purpose);
      assert.equal(fallbackDirectorPlan(input, [scoped]).shots[1].referenceIndex, undefined);
      assert.deepEqual(directorElementReferences(fallbackDirectorPlan(input, [scoped]), input.draft.productReferences), []);
    }
    for (const status of ["conflict", "uncertain"] as const) {
      const rejected = { ...plan, referenceReviews: reviews.map((r, i) => i === 1 ? { ...r, status, view: "unknown" as const, details: [] } : r) };
      assert.equal(parseDirectorOutput(rejected, withRefs), null);
      assert.throws(() => compileDirectorPlan(rejected, withRefs), /invalid_director_plan/);
    }
    for (const bindIndex of [0, 2]) {
      const rebound = { ...plan, shots: plan.shots.map((s, i) => ({ ...s, referenceIndex: i === bindIndex ? 1 : undefined })) };
      assert.equal(parseDirectorOutput(rebound, withRefs), null);
    }
    const alternateOnly = { ...base, draft: { ...base.draft, productReferences: [other] } };
    const backPlan = fallbackDirectorPlan(alternateOnly, [review(0, "back", true)]);
    assert.equal(backPlan.shots[1].referenceIndex, undefined);
    assert.deepEqual(directorElementReferences(backPlan, [other]), []);
    const frontPlan = fallbackDirectorPlan(alternateOnly, [review(0, "front", true)]);
    assert.equal(frontPlan.shots[1].referenceIndex, undefined);
    assertDial(compileDirectorPlan(frontPlan, alternateOnly).multiPrompt![1].prompt);
    const duplicate = { ...base, draft: { ...base.draft, productReferences: [{ ...side, source: base.draft.source! }] } };
    assert.equal(fallbackDirectorPlan(duplicate, [review(0, "side", true)]).shots[1].referenceIndex, undefined);
  });

  test(`${presetId}: verified watch identity does not authorize back, rolled, clasp or ambiguous creative views`, () => {
    const base = inputFor(presetId);
    for (const purpose of ["side-profile", "other-product-view", "back-view", "rolled-view"]) {
      for (const [view, reason, creativeSafeSide] of [
        ["back", "Complete rear watch view", true], ["front", "Complete frontal view", true],
        ["side", "Rolled watch side", true], ["side", "Clasp-focused rear orientation", true],
        ["side", "Ambiguous rear profile", true], ["unknown", "Ambiguous orientation", false],
        ["side", "Complete upright side", false],
      ] as const) {
        const input = { ...base, draft: { ...base.draft, productReferences: [ref(purpose, "5")] } };
        const identity = { ...review(0, view, true), reason, creativeSafeSide };
        const plan = fallbackDirectorPlan(input, [identity]);
        assert.equal(plan.shots.length, 3);
        assert.equal(plan.shots[1].referenceIndex, undefined, purpose + "/" + reason);
        assert.deepEqual(directorElementReferences(plan, input.draft.productReferences), []);
        assert.doesNotMatch(JSON.stringify(compileDirectorPlan(plan, input)), /@Element/);
      }
    }
    for (const purpose of ["side-profile", "other-product-view"]) {
      const input = { ...base, draft: { ...base.draft, productReferences: [ref(purpose, "5")] } };
      const raw = { ...review(0, "side", true), reason: "Complete upright side" };
      const missingSafety = { ...raw, creativeSafeSide: undefined };
      assert.equal(fallbackDirectorPlan(input, [missingSafety]).shots[1].referenceIndex, undefined);
      const safe = scopeD1ProductReferenceReview(raw, purpose);
      assert.equal(safe.creativeSafeSide, true);
      const plan = fallbackDirectorPlan(input, [safe]);
      assert.equal(plan.shots[1].referenceIndex, 0);
      assert.doesNotThrow(() => compileDirectorPlan(plan, input));
    }
  });

  test(`${presetId}: recognized watch still requires verified dial-detail before D1 planning`, async () => {
    const harness = await VideoProductionHarness.create();
    harness.analysisProfile = directorProducts[2];
    harness.env.OPENAI_API_KEY = "offline-fixture-only";
    const sha256 = await harness.addSource(side.source.sourceAssetId, videoTestOwner, "black");
    const input: VideoDirectorInput = { presetId, profile: directorProducts[2], shotMode: "multi",
      draft: harness.draft("standard", 5, "multi") };
    for (const references of [[], [{ ...side, sha256 }], [{ ...dial, sha256, source: side.source, purpose: "detail" }]]) {
      assert.equal((await harness.prepareDirector({ ...input, draft: { ...input.draft, productReferences: references } })).status, "dial_detail_required");
    }
    harness.referenceReviewsResponse = [{ ...review(0, "unknown"), status: "uncertain" }];
    assert.equal((await harness.prepareDirector({ ...input, draft: { ...input.draft, productReferences: [{ ...dial, source: side.source, sha256 }] } })).status, "references_unverified");
    assert.equal(harness.directorInputs.length, 0);
    assert.equal(harness.posts.length, 0);
    harness.assertIsolated();
  });

  test(`${presetId}: primary-only sparse branch, complete alternate enriches it, dial alone is identity evidence`, () => {
    const base = inputFor(presetId, null);
    const input = { ...base, draft: { ...base.draft, productReferences: [side] } };
    assert.deepEqual(fallbackDirectorPlan(input, [review(0, "detail")]).shots.map(s => s.durationSeconds), presetId === "minimal-studio" ? [2, 2, 1] : [1, 2, 2]);
    const complete = fallbackDirectorPlan(input, [review(0, "side", true)]);
    assert.deepEqual(complete.shots.map(s => s.durationSeconds), presetId === "minimal-studio" ? [2, 2, 1] : [1, 2, 2]);
    assert.doesNotThrow(() => compileDirectorPlan(complete, input));
    assert.equal(complete.shots[1].referenceIndex, 0);
    const dialOnly = { ...base, draft: { ...base.draft, productReferences: [dial] } };
    const plan = fallbackDirectorPlan(dialOnly, [review(0, "detail")]);
    assert.deepEqual(plan.shots, fallbackDirectorPlan(base).shots);
    assert.deepEqual(directorElementReferences(plan, [dial]), []);
  });

  test(`${presetId}: bounded watch compilation preserves literal text or fails explicitly`, () => {
    const base = inputFor(presetId);
    const input = { ...base, draft: { ...base.draft, productReferences: [{ ...dial, declaredText: "İSTANBUL" }] } };
    const plan = fallbackDirectorPlan(input, [review(0, "detail")]);
    for (const scene of compileDirectorPlan(plan, input).multiPrompt!) {
      assert.ok(scene.prompt.length <= 512);
      assertDial(scene.prompt);
      assert.match(scene.prompt, /İSTANBUL/);
    }
    const moving = compileDirectorPlan(plan, input).multiPrompt![1].prompt;
    assert.match(moving, /lateral reframe|push-in/);
    assert.doesNotMatch(moving, /Product\/camera fixed|camera still/);
    const overflow = { ...input, draft: { ...input.draft, productReferences: [{ ...dial, declaredText: '"'.repeat(80) }] } };
    assert.throws(() => compileDirectorPlan(plan, overflow), /kling_scene_prompt_too_long/);
  });

  for (const quality of ["standard", "pro"] as const) test(`${presetId}/${quality}: local plan, signed preview and mocked submit agree`, async () => {
    const harness = await VideoProductionHarness.create();
    harness.analysisProfile = directorProducts[2];
    harness.env.OPENAI_API_KEY = "offline-fixture-only";
    const references = await Promise.all([dial, side, other].map(async (r, i) => ({ ...r,
      sha256: await harness.addSource(r.source.sourceAssetId, videoTestOwner, ["black", "gray", "blue"][i]) })));
    const input: VideoDirectorInput = { presetId, profile: directorProducts[2], shotMode: "multi",
      draft: { ...harness.draft(quality, 5, "multi"), productReferences: references } };
    const schema = harness.directorRequest(input, true).schema.properties.referenceReviews!.properties;
    assert.ok(schema.r0.required.includes("dialDetailVisible"));
    assert.ok(schema.r1.required.includes("wholeSideVisible"));
    assert.ok(schema.r2.required.includes("wholeViewVisible"));
    assert.ok(schema.r1.required.includes("creativeSafeSide"));
    assert.ok(schema.r2.required.includes("creativeSafeSide"));
    assert.match(harness.directorRequest(input, true).instructions, /complete matched usable/);
    const reviews = [review(0, "detail"), review(1, "side", true), review(2, "back", true)];
    for (const status of ["conflict", "uncertain"] as const) {
      harness.referenceReviewsResponse = reviews.map((r, i) => i === 1 ? { ...r, status, view: "unknown", details: [] } : r);
      assert.equal((await harness.prepareDirector(input)).status, "references_unverified");
    }
    harness.referenceReviewsResponse = reviews;
    const prepared = await harness.prepareDirector(input);
    assert.equal(prepared.status, "success");
    if (prepared.status !== "success") throw new Error("Missing D1 local plan");
    assert.deepEqual(Array.from(prepared.plan.shots, s => s.referenceIndex), [undefined, 1, undefined]);
    const draft = { ...input.draft, director: { presetId, shotMode: "multi" as const, receipt: prepared.receipt } };
    const quote = await harness.api.quoteVideoSubmissionAction(draft);
    assert.equal(quote.status, "success");
    if (quote.status !== "success") throw new Error("Missing D1 quote");
    const compiled = compileDirectorPlan(prepared.plan, input);
    assert.deepEqual(Array.from(quote.preview.shots, s => s.prompt), compiled.multiPrompt!.map(s => s.prompt));
    assert.equal((await harness.api.submitVideoGenerationAction(draft, quote.cost, quote.receipt, true)).ok, true);
    const payload = harness.posts[0].input as ReturnType<typeof buildFalVideoRequestInput>;
    assert.deepEqual(Array.from(payload.multi_prompt!, s => s.prompt), compiled.multiPrompt!.map(s => s.prompt));
    assert.deepEqual(Array.from(payload.multi_prompt!, s => s.duration), presetId === "minimal-studio" ? ["2", "2", "1"] : ["1", "2", "2"]);
    assert.deepEqual(payload.elements?.flatMap(e => e.reference_image_urls.map(url => new URL(url).pathname.split("/").at(-2))), [side.source.sourceAssetId]);
    assert.equal(harness.directorInputs.length, 0);
    harness.assertIsolated();
  });

  test(`${presetId}: historical receipts verify but cannot quote a new obsolete D1 edit`, async () => {
    const harness = await VideoProductionHarness.create();
    const profile = directorProducts[0];
    const sourceHash = await harness.addSource(videoTestSource);
    const refHash = await harness.addSource(other.source.sourceAssetId, videoTestOwner, "black");
    const input: VideoDirectorInput = { presetId, profile, shotMode: "multi",
      draft: { ...harness.draft("standard", 5, "multi"), productReferences: [{ ...other, sha256: refHash }] } };
    const reviews = [review(0, "back", true)];
    for (const shots of [fixedLegacyDirectorPlan(input)!.shots, legacyD1FiveSecondShots(input, reviews)]) {
      const historical = { ...fallbackDirectorPlan(input, reviews), ...directorPlanDescriptions(input, shots.length), shots };
      const key = harness.receiptReader().directorCacheKey(videoTestOwner, sourceHash, "gpt-4o-mini", input);
      const receipt = harness.receiptReader().sealDirectorPlan(key, historical, harness.env.SUPABASE_SECRET_KEY, harness.now, profile);
      assert.ok(harness.receiptReader().openDirectorPlan(receipt, key, input, harness.env.SUPABASE_SECRET_KEY, harness.now));
      const draft = { ...input.draft, director: { presetId, shotMode: "multi" as const, receipt } };
      const quote = await harness.api.quoteVideoSubmissionAction(draft);
      assert.equal(quote.status, "unavailable");
      assert.equal(quote.reasonCode, "snapshot_unavailable");
    }
    assert.equal(harness.posts.length, 0);
    assert.equal(harness.reservations.size, 0);
    assert.equal(harness.directorInputs.length, 0);
    assert.equal(harness.referenceReviewInputs.length, 0);
    harness.assertIsolated();
  });
}

test("D1 excludes source duplicates and reuses old identity evidence without a new paid review", async () => {
  const harness = await VideoProductionHarness.create();
  harness.env.OPENAI_API_KEY = "offline-fixture-only";
  const source = harness.objects.get(`video-source-images/${videoTestOwner}/${videoTestSource}/prepared-v1.png`)!.bytes;
  const duplicateHash = await harness.addSource(side.source.sourceAssetId, videoTestOwner, "white");
  const input = { ...inputFor("minimal-studio", null), draft: { ...inputFor("minimal-studio", null).draft,
    source: { kind: "uploaded-image" as const, sourceAssetId: videoTestSource }, productReferences: [{ ...side, sha256: duplicateHash }] } };
  harness.referenceReviewsResponse = [review(0, "side", true)];
  const result = await harness.planReader().prepareVideoDirectorPlan(videoTestOwner, source, duplicateHash, input);
  assert.equal(result.plan.shots[1].referenceIndex, undefined);
  assert.deepEqual(Array.from(result.plan.shots, s => s.durationSeconds), [2, 2, 1]);
  const reads = harness.referenceReviewInputs.length;
  await harness.planReader().prepareVideoDirectorPlan(videoTestOwner, source, duplicateHash, input, result.receipt);
  assert.equal(harness.referenceReviewInputs.length, reads);
  const legacy = { ...fixedLegacyDirectorPlan({ ...input, profile: directorProducts[0] })!, referenceReviews: [review(0, "side", true)] };
  const oldInput = { ...input, profile: directorProducts[0] };
  const key = harness.receiptReader().directorCacheKey(videoTestOwner, duplicateHash, "gpt-4o-mini", oldInput);
  const oldReceipt = harness.receiptReader().sealDirectorPlan(key, legacy, harness.env.SUPABASE_SECRET_KEY, harness.now);
  assert.ok(harness.receiptReader().openDirectorPlan(oldReceipt, key, oldInput, harness.env.SUPABASE_SECRET_KEY, harness.now));
  await harness.planReader().prepareVideoDirectorPlan(videoTestOwner, source, duplicateHash, oldInput, oldReceipt);
  assert.equal(harness.referenceReviewInputs.length, reads);
  const oldShots = legacyD1FiveSecondShots(oldInput, legacy.referenceReviews);
  const earlierEdit = { ...legacy, ...directorPlanDescriptions(oldInput, oldShots.length), shots: oldShots };
  const earlierReceipt = harness.receiptReader().sealDirectorPlan(key, earlierEdit, harness.env.SUPABASE_SECRET_KEY, harness.now);
  assert.ok(harness.receiptReader().openDirectorPlan(earlierReceipt, key, oldInput, harness.env.SUPABASE_SECRET_KEY, harness.now));
  const revised = await harness.planReader().prepareVideoDirectorPlan(videoTestOwner, source, duplicateHash, oldInput, earlierReceipt);
  assert.equal(revised.plan.shots.length, 3);
  assert.equal(revised.plan.shots[1].referenceIndex, undefined);
  assert.equal(harness.referenceReviewInputs.length, reads);
  assert.equal(harness.directorInputs.length, 0);
  harness.assertIsolated();
});

test("D1 matrix fits the unchanged scene budget and signed plans preserve exact binding", () => {
  let maximum = 0;
  for (const presetId of presets) for (const profile of [...directorProducts, ...libraryFixtures.map(f => f.profile), null]) {
    const input = inputFor(presetId, profile);
    const plan = fallbackDirectorPlan(input);
    const compiled = compileDirectorPlan(plan, input);
    maximum = Math.max(maximum, ...compiled.multiPrompt!.map(s => s.prompt.length));
    const key = directorCacheKey("offline", "source", "fixture", input);
    const receipt = sealDirectorPlan(key, plan, "offline", 1000);
    const restored = openDirectorPlan(receipt, key, input, "offline", 1001);
    assert.ok(restored);
    assert.deepEqual(compileDirectorPlan(restored, input), compiled);
  }
  assert.ok(maximum <= 512, String(maximum));
});
