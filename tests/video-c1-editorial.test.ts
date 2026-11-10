import assert from "node:assert/strict";
import test from "node:test";
import { compileDirectorPlan, fallbackDirectorPlan, fixedLightingDirectorPlan, fixedMinimalDirectorPlan, parseDirectorOutput, type VideoDirectorInput } from "../src/lib/video-director/core";
import { directorCacheKey, openDirectorPlan, sealDirectorPlan } from "../src/lib/video-director/receipt";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { scopeProductReferenceReview } from "../src/lib/video-generation/product-reference-policy";
import { directorElementReferences, type ReferenceReview } from "../src/lib/video-generation/product-references";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";
import { VideoProductionHarness, videoTestOwner, videoTestSource } from "./fixtures/video-production-harness";

const presets = ["minimal-studio", "metallic-light-sweep"] as const;
const watch = directorProducts[2];
const base = directorFixtureInput(watch);
const reference = (purpose: string, id: string, sha256: string) => ({ purpose, sha256, source: { kind: "uploaded-image" as const, sourceAssetId: id } });
const dial = reference("dial-detail", "10000000-0000-4000-8000-000000000004", "a".repeat(64));
const side = reference("side-profile", "10000000-0000-4000-8000-000000000005", "b".repeat(64));
const other = reference("other-product-view", "10000000-0000-4000-8000-000000000006", "c".repeat(64));
const review = (index: number, view: "side" | "detail", wholeSideVisible = false): ReferenceReview =>
  ({ index, status: "matched", view, reason: "Offline same-product review", details: [], ...(wholeSideVisible ? { wholeSideVisible: true } : {}) });

function assertDial(prompt: string) {
  for (const field of [/numerals?/i, /indic(?:es|ex)/i, /logo/i, /hands?/i, /date window/i, /print/i, /complications/i, /every frame|each frame/i]) {
    assert.match(prompt, field);
  }
  assert.match(prompt, /no redraw|do not redraw/i);
}

for (const presetId of presets) {
  test(presetId + " C1 primary, scoped crop and deterministic whole-side branches", () => {
    const input: VideoDirectorInput = { ...base, presetId, draft: { ...base.draft, productReferences: [dial, side, other] } };
    const primary = fallbackDirectorPlan(input, [review(0, "detail"), review(1, "detail"), review(2, "side")]);
    assert.deepEqual(primary.shots.map(s => s.referenceIndex), [undefined, undefined, undefined]);
    assert.deepEqual(directorElementReferences(primary, input.draft.productReferences), []);
    assert.deepEqual(primary.shots.map(s => s.durationSeconds), presetId === "minimal-studio" ? [4, 3, 3] : [3, 4, 3]);
    assert.match(primary.shots[1].camera, /^Locked offset/);
    assert.match(primary.shots[2].camera, /^Locked/);
    assert.match(primary.shots[2].pace, /three-second|all 3s/);
    const dialOnly = { ...input, draft: { ...input.draft, productReferences: [dial] } };
    assert.deepEqual(fallbackDirectorPlan(dialOnly, [review(0, "detail")]).shots, primary.shots);
    const duplicate = { ...input, draft: { ...input.draft, productReferences: [dial, { ...side, source: base.draft.source! }] } };
    assert.equal(fallbackDirectorPlan(duplicate, [review(0, "detail"), review(1, "side", true)]).shots[1].referenceIndex, undefined);
    const quoted = { ...dialOnly, draft: { ...dialOnly.draft, productReferences: [{ ...dial, declaredText: '"'.repeat(80) }] } };
    for (const scene of compileDirectorPlan(fallbackDirectorPlan(quoted, [review(0, "detail")]), quoted).multiPrompt!) {
      assert.ok(scene.prompt.length <= 512);
      assert.ok(scene.prompt.includes(JSON.stringify(quoted.draft.productReferences[0].declaredText)));
      if (presetId === "metallic-light-sweep") assertDial(scene.prompt);
    }
    assert.equal(scopeProductReferenceReview(review(0, "side"), "side-profile", true).view, "detail");
    assert.equal(scopeProductReferenceReview(review(0, "side", true), "side-profile", true).view, "side");
    assert.equal(scopeProductReferenceReview(review(0, "side", true), "side-profile").view, "detail");
    assert.equal(scopeProductReferenceReview(review(0, "side", true), "dial-detail", true).view, "unknown");

    const secondSide = { ...other, purpose: "side-profile" };
    for (const productReferences of [[dial, side, secondSide], [secondSide, dial, side]]) {
      const withSide = { ...input, draft: { ...input.draft, productReferences } };
      const reviews = productReferences.map((ref, index) => review(index, ref === dial ? "detail" : "side", ref !== dial));
      const plan = fallbackDirectorPlan(withSide, reviews);
      assert.deepEqual(plan.shots.map(s => s.referenceIndex), [undefined, productReferences.indexOf(side), undefined]);
      assert.deepEqual(plan.shots[0], primary.shots[0]);
      assert.deepEqual(plan.shots[2], primary.shots[2]);
      assert.ok(parseDirectorOutput(plan, withSide));
      const wrongBinding = { ...plan, shots: plan.shots.map((shot, i) => i === 1 ? { ...shot, referenceIndex: productReferences.indexOf(secondSide) } : shot) };
      assert.equal(parseDirectorOutput(wrongBinding, withSide), null);
      for (const status of ["conflict", "uncertain"] as const) {
        const rejected = { ...plan, referenceReviews: reviews.map((r, index) => index === plan.shots[1].referenceIndex ? { ...r, status, view: "unknown" as const } : r) };
        assert.equal(parseDirectorOutput(rejected, withSide), null);
      }
      const compiled = compileDirectorPlan(plan, withSide);
      assert.deepEqual(compiled, compileDirectorPlan(plan, { ...withSide, draft: { ...withSide.draft, quality: "pro" } }));
      const scenes = compiled.multiPrompt!;
      assert.ok(scenes.every(s => s.prompt.length <= 512));
      assert.match(scenes[1].prompt, /^@Element1: Use side view from reference image 1/);
      assert.doesNotMatch(scenes[1].prompt, /dial|front-facing|source-facing|axial|orbit|turntable|360/i);
      assert.doesNotMatch(scenes[0].prompt + scenes[2].prompt, /@Element1/);
      if (presetId === "metallic-light-sweep") {
        assertDial(scenes[0].prompt);
        assertDial(scenes[2].prompt);
        assert.equal(scenes[1].prompt.match(/left-to-right/g)?.length, 1);
        assert.match(scenes[1].prompt, /highlight travels left-to-right/);
      } else assert.doesNotMatch(scenes[1].prompt, /traveling highlight|highlight travels/);
    }
    assert.equal(fallbackDirectorPlan(input, [review(0, "detail"), review(1, "detail"), review(2, "side", true)]).shots[1].referenceIndex, 2);

    const historical = (presetId === "minimal-studio" ? fixedMinimalDirectorPlan(input) : fixedLightingDirectorPlan(input))!;
    const key = directorCacheKey("owner", "primary", "fixture", { ...input, draft: { ...input.draft, productReferences: [] } });
    const original = { ...input, draft: { ...input.draft, productReferences: [] } };
    const receipt = sealDirectorPlan(key, historical, "offline", 1000);
    const restored = openDirectorPlan(receipt, key, original, "offline", 1001);
    assert.ok(restored);
    assert.equal(restored.editorialStoryboard, undefined);
    assert.deepEqual(compileDirectorPlan(restored, original), compileDirectorPlan(historical, original));
  });
}

for (const [presetId, quality] of [["minimal-studio", "standard"], ["metallic-light-sweep", "pro"]] as const) {
  test(presetId + " signed preview and offline submission use one selected side asset", async () => {
    const harness = await VideoProductionHarness.create();
    harness.analysisProfile = watch;
    harness.env.OPENAI_API_KEY = "offline-fixture-only";
    const refs = await Promise.all([dial, side, other].map(async (ref, index) =>
      ({ ...ref, sha256: await harness.addSource(ref.source.sourceAssetId, videoTestOwner, ["black", "gray", "blue"][index]) })));
    const input: VideoDirectorInput = { presetId, profile: watch, shotMode: "multi", draft: { ...harness.draft(quality, 10, "multi"), productReferences: refs } };
    const reviews = [review(0, "detail"), review(1, "side", true), review(2, "side", true)];
    const schema = harness.directorRequest(input, true).schema.properties.referenceReviews!.properties;
    assert.ok(schema.r0.required.includes("dialDetailVisible"));
    assert.ok(schema.r1.required.includes("wholeSideVisible"));
    for (const status of ["conflict", "uncertain"] as const) {
      harness.referenceReviewsResponse = [reviews[0], { ...reviews[1], status, view: "unknown" }, reviews[2]];
      assert.equal((await harness.prepareDirector(input)).status, "references_unverified");
    }
    harness.referenceReviewsResponse = reviews;
    const result = await harness.prepareDirector(input);
    assert.equal(result.status, "success");
    if (result.status !== "success") throw new Error("Missing local plan");
    assert.deepEqual(Array.from(result.plan.shots, shot => shot.referenceIndex), [undefined, 1, undefined]);
    const draft = { ...input.draft, director: { presetId, shotMode: "multi" as const, receipt: result.receipt } };
    const quote = await harness.api.quoteVideoSubmissionAction(draft);
    assert.equal(quote.status, "success");
    if (quote.status !== "success") throw new Error("Missing quote");
    assert.equal((await harness.api.submitVideoGenerationAction(draft, quote.cost, quote.receipt, true)).ok, true);
    assert.equal(harness.directorInputs.length, 0);
    assert.equal(harness.posts.length, 1);
    const payload = harness.posts[0].input as ReturnType<typeof buildFalVideoRequestInput>;
    assert.deepEqual(Array.from(payload.multi_prompt!, shot => shot.prompt), Array.from(quote.preview.shots, shot => shot.prompt));
    assert.ok(new URL(payload.start_image_url).pathname.endsWith("/" + videoTestSource + "/prepared-v1.png"));
    assert.deepEqual(payload.elements?.flatMap(element => element.reference_image_urls.map(url => new URL(url).pathname.split("/").at(-2))), [side.source.sourceAssetId]);
    harness.assertIsolated();
  });
}

test("a critical-detail crop can corroborate a primary feature but cannot authorize a view", () => {
  const base = directorFixtureInput(directorProducts[0]);
  const crop = { ...side, purpose: "critical-detail" };
  const input = { ...base, presetId: "minimal-studio" as const, draft: { ...base.draft, productReferences: [crop] } };
  const reviews = [scopeProductReferenceReview({ ...review(0, "side", true), details: ["two visible front buttons"] }, crop.purpose, true)];
  const plan = fallbackDirectorPlan(input, reviews);
  assert.equal(plan.shots[1].focus, "two visible front buttons");
  assert.equal(plan.shots[1].referenceIndex, undefined);
  assert.doesNotMatch(compileDirectorPlan(plan, input).multiPrompt![1].prompt, /@Element1/);
});
