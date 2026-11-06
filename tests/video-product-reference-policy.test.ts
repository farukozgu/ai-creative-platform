import assert from "node:assert/strict";
import test from "node:test";
import { compileDirectorPlan, fallbackDirectorPlan, type VideoDirectorInput } from "../src/lib/video-director/core";
import { klingElementReferences, type ReferenceReview } from "../src/lib/video-generation/product-references";
import { productReferencePolicy, scopeProductReferenceReview } from "../src/lib/video-generation/product-reference-policy";
import { directorProducts } from "./fixtures/video-director-fixtures";
import { VideoProductionHarness, videoTestOwner } from "./fixtures/video-production-harness";

const sourceAssetId = "10000000-0000-4000-8000-000000000003";
const watch = directorProducts[2];
const dialReview = { index: 0, status: "matched", view: "detail", reason: "Same product and full dial visible", details: [] } as const;
const golden = ["minimal-studio", "metallic-light-sweep", "macro-detail-reveal", "floating-accessory", "cinematic-hero", "dramatic-backlight", "material-detail", "window-display"] as const;

async function planningFixture(profile: VideoDirectorInput["profile"]) {
  const harness = await VideoProductionHarness.create();
  harness.analysisProfile = profile;
  harness.env.OPENAI_API_KEY = "offline-fixture-only";
  const sha256 = await harness.addSource(sourceAssetId, videoTestOwner, "black");
  const input: VideoDirectorInput = { draft: harness.draft("standard", 10, "multi"), profile, presetId: "metallic-light-sweep", shotMode: "multi" };
  const reference = (purpose: string) => ({ source: { kind: "uploaded-image" as const, sourceAssetId }, sha256, purpose });
  return { harness, input, reference };
}

test("watch planning blocks primary-only, side-only, legacy labels and a duplicate primary image", async () => {
  const { harness, input, reference } = await planningFixture(watch);
  const primary = input.draft.source!;
  assert.equal(primary.kind, "uploaded-image");
  if (primary.kind !== "uploaded-image") throw new Error("Missing primary fixture");
  const sha256 = await harness.addSource(primary.sourceAssetId);
  for (const refs of [[], [reference("side-profile")], [reference("detail")], [{ ...reference("dial-detail"), source: primary, sha256 }]]) {
    const result = await harness.prepareDirector({ ...input, draft: { ...input.draft, productReferences: refs } });
    assert.equal(result.status, "dial_detail_required");
    if (result.status === "dial_detail_required") assert.equal(result.productContext.referencePolicy, "watch");
  }
  assert.equal(harness.directorInputs.length, 0);
  assert.equal(harness.referenceReviewInputs.length, 0);
  assert.equal(harness.posts.length, 0);
  assert.equal(harness.reservations.size, 0);
  harness.assertIsolated();
});

test("a verified dial leaves all eight golden shots and compiled prompts identical", async () => {
  const { harness, input, reference } = await planningFixture(watch);
  harness.referenceReviewsResponse = [dialReview];
  for (const presetId of golden) {
    const primaryOnly = { ...input, presetId };
    const withDial = { ...primaryOnly, draft: { ...input.draft, productReferences: [reference("dial-detail")] } };
    const result = await harness.prepareDirector(withDial);
    assert.equal(result.status, "success", presetId);
    if (result.status !== "success") throw new Error(presetId);
    const baseline = fallbackDirectorPlan(primaryOnly);
    assert.deepEqual(JSON.parse(JSON.stringify(result.plan.shots)), JSON.parse(JSON.stringify(baseline.shots)), presetId);
    assert.deepEqual(compileDirectorPlan(result.plan, withDial), compileDirectorPlan(baseline, primaryOnly), presetId);
    const withOtherView = { ...primaryOnly, draft: { ...input.draft, productReferences: [reference("other-product-view")] } };
    const reviewedView = harness.attachReferenceReviews(baseline, withOtherView, [{ ...dialReview, details: [], view: "side" }]);
    assert.deepEqual(reviewedView.shots, baseline.shots, presetId);
    assert.deepEqual(compileDirectorPlan(reviewedView, withOtherView), compileDirectorPlan(baseline, primaryOnly), presetId);
  }
  assert.equal(harness.directorInputs.length, 0);
  assert.equal(harness.referenceReviewInputs.length, golden.length);
  assert.equal(harness.posts.length, 0);
  harness.assertIsolated();
});

test("missing, conflicting or mislabeled dial reviews fail closed", async () => {
  const { harness, input, reference } = await planningFixture(watch);
  input.draft.productReferences = [reference("dial-detail")];
  for (const [review, status] of [
    [[], "references_unverified"],
    [[{ ...dialReview, status: "conflict", view: "unknown" }], "references_unverified"],
    [[{ ...dialReview, status: "uncertain", view: "unknown" }], "references_unverified"],
    [[{ ...dialReview, view: "unknown" }], "dial_detail_required"],
    [[{ ...dialReview, view: "side" }], "dial_detail_required"],
  ] as const) {
    harness.referenceReviewsResponse = review;
    const result = await harness.prepareDirector(input);
    assert.equal(result.status, status);
    assert.equal("receipt" in result, false);
  }
  assert.equal(harness.posts.length, 0);
});

test("unidentified and low-confidence products, jewelry and fragrance can plan with only the primary image", async () => {
  for (const [profile, policy, optionalRole] of [
    [null, undefined, undefined],
    [{ ...watch, confidence: { overall: 0.69 } }, undefined, undefined],
    [{ ...watch, confidence: { overall: 0.95, fields: { vertical: 0.55 } } }, undefined, undefined],
    [directorProducts[3], "jewelry", "critical-detail"],
    [directorProducts[1], "cosmetics", "label-branding-detail"],
    [directorProducts[0], undefined, "historical free-form texture closeup"],
  ] as const) {
    const { harness, input, reference } = await planningFixture(profile);
    const result = await harness.prepareDirector(input);
    assert.equal(result.status, "success");
    if (result.status !== "success") throw new Error("Missing plan");
    assert.equal(result.productContext.referencePolicy, policy);
    if (optionalRole) {
      harness.referenceReviewsResponse = [{ ...dialReview, reason: "Same physical product" }];
      const withReference = await harness.prepareDirector({ ...input, draft: { ...input.draft, productReferences: [reference(optionalRole)] } });
      assert.equal(withReference.status, "success");
      assert.equal(harness.referenceReviewInputs[0].draft.productReferences?.[0].purpose, optionalRole);
    }
    harness.assertIsolated();
  }
});

test("role verification uses a complete dial signal and keeps scoped evidence out of alternate views", async () => {
  const { harness, input, reference } = await planningFixture(watch);
  for (const subcategory of ["watch", "watches", "timepiece"]) {
    assert.equal(productReferencePolicy({ ...directorProducts[3], subcategory }), "watch");
    assert.equal(productReferencePolicy({ ...directorProducts[3], subcategory, confidence: { overall: 0.95, fields: { subcategory: 0.5 } } }), "jewelry");
  }
  input.draft.productReferences = [reference("dial-detail"), reference("legacy view")];
  const request = harness.directorRequest(input, true);
  assert.match(request.instructions, /sharp close view of the entire dial/);
  const slots = request.schema.properties.referenceReviews?.properties;
  assert.ok(slots?.r0.required.includes("dialDetailVisible"));
  assert.ok(!slots?.r1.required.includes("dialDetailVisible"));
  const review: ReferenceReview = { ...dialReview, details: [] };
  assert.equal(scopeProductReferenceReview(review, "dial-detail").view, "unknown");
  assert.equal(scopeProductReferenceReview({ ...review, dialDetailVisible: false }, "dial-detail").view, "unknown");
  assert.equal(scopeProductReferenceReview({ ...review, view: "side", dialDetailVisible: true }, "dial-detail").view, "unknown");
  assert.deepEqual(scopeProductReferenceReview({ ...review, dialDetailVisible: true }, "dial-detail"), review);
  const side = { ...review, view: "side" as const };
  for (const purpose of ["side-profile", "critical-detail", "label-branding-detail"]) {
    assert.deepEqual(klingElementReferences([scopeProductReferenceReview(side, purpose)], [reference(purpose)]), []);
  }
  assert.deepEqual(scopeProductReferenceReview({ ...review, details: ["silver setting", "four visible prongs"] }, "critical-detail").details, ["four visible prongs"]);
  assert.deepEqual(scopeProductReferenceReview(side, "legacy view"), side);
});

test("new 5s single and Custom requests enforce the gate while an older watch receipt can still quote", async () => {
  const { harness, reference } = await planningFixture(watch);
  const draft = harness.draft();
  const oldPlan = harness.signDirector(draft, "fallback");
  const oldReceipt = draft.director?.receipt;
  assert.ok(oldReceipt);
  const input: VideoDirectorInput = { draft: { ...draft, director: undefined }, profile: watch, presetId: "cinematic-dial", shotMode: "single" };
  assert.equal((await harness.prepareDirector(input, oldReceipt)).status, "dial_detail_required");
  assert.equal((await harness.prepareDirector({ ...input, presetId: "custom", draft: { ...input.draft, creativeMode: "custom", prompt: "Slow push in" } })).status, "dial_detail_required");
  const quote = await harness.api.quoteVideoSubmissionAction(draft);
  assert.equal(quote.status, "success");
  const withDial = { ...input, draft: { ...input.draft, productReferences: [reference("dial-detail")] } };
  harness.directorResponse = { ...fallbackDirectorPlan(withDial), referenceReviews: [dialReview] };
  const result = await harness.prepareDirector(withDial);
  assert.equal(result.status, "success");
  if (result.status !== "success") throw new Error("Missing single-shot plan");
  assert.deepEqual(JSON.parse(JSON.stringify(result.plan.shots)), JSON.parse(JSON.stringify(oldPlan.shots)));
  assert.equal(result.plan.shots[0].durationSeconds, 5);
  assert.equal(harness.posts.length, 0);
  harness.assertIsolated();
});
