import assert from "node:assert/strict";
import test from "node:test";
import { directorProducts, directorFixtureInput } from "./fixtures/video-director-fixtures";
import { fallbackDirectorPlan, parseDirectorOutput, compileDirectorPlan } from "../src/lib/video-director/core";
import { directorCacheKey, sealDirectorPlan, openDirectorPlan } from "../src/lib/video-director/receipt";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { klingElementReferences, referenceShotPrefix, suggestProductReferences, parseReferenceReviews, type ReferenceReview } from "../src/lib/video-generation/product-references";
import { validateVideoGenerationDraft } from "../src/lib/video-generation/validation";
import { videoDraftHash } from "../src/lib/video-generation/request-identity";
import { sealVideoQuote, verifyVideoQuote } from "../src/lib/video-generation/quote-receipt";
import { directorProductContext } from "../src/lib/video-director/product-context";

const reference = (n: number) => ({ source: { kind: "uploaded-image" as const, sourceAssetId: `10000000-0000-4000-8000-00000000000${n}` }, sha256: String(n).repeat(64), purpose: "detail" });
test("logo-first uploads cannot displace a verified back view's provider image index", () => {
  const references = [{ ...reference(2), purpose: "logo" }, { ...reference(3), purpose: "angle" }, reference(4)];
  const reviews: ReferenceReview[] = [
    { index: 0, status: "matched", view: "front", reason: "Mark crop misclassified as front", details: [] },
    { index: 1, status: "matched", view: "back", reason: "Complete back product view", details: [] },
    { index: 2, status: "matched", view: "detail", reason: "Visible texture crop", details: [] },
  ];
  assert.deepEqual(klingElementReferences(reviews, references).map(review => review.index), [1]);
  assert.equal(referenceShotPrefix(1, reviews, references), "@Element1: Use back view from reference image 1. ");
});
test("smart suggestions reflect category and preset without claiming that a feature exists", () => {
  assert.equal(suggestProductReferences({ category: "cosmetics", evidence: [] }, "label-reveal")[0], "label");
  assert.equal(suggestProductReferences({ category: "apparel", evidence: [] }, "material-detail")[0], "texture");
  assert.ok(suggestProductReferences({ category: "watches", evidence: [] }, "precision-macro").includes("dial"));
  assert.deepEqual(suggestProductReferences({ category: "unknown", evidence: [] }, "minimal-studio"), ["detail", "angle", "label"]);
});
test("reviewed product references compile to one real element across products, tiers, durations and shot modes", () => {
  for (const profile of directorProducts) for (const quality of ["standard", "pro"] as const)
    for (const durationSeconds of [5, 10] as const) for (const shotMode of ["single", "multi"] as const) {
      const base = directorFixtureInput(profile);
      const input = { ...base, shotMode, draft: { ...base.draft, quality, durationSeconds, shotMode, productReferences: [reference(2), reference(3)] } };
      assert.ok(validateVideoGenerationDraft(input.draft).ok);
      const fallback = fallbackDirectorPlan(input);
      assert.equal(fallback.origin, "fallback");
      assert.throws(() => compileDirectorPlan(fallback, input), /invalid_director_plan/);
      const reviewed = parseDirectorOutput({ ...fallback, referenceReviews: [
        { index: 0, status: "matched", view: "front", reason: "Same visible product outline and marks", details: [] },
        { index: 1, status: "matched", view: "front", reason: "Same product additional view", details: [] },
      ] }, input)!;
      assert.ok(reviewed);
      const compiled = compileDirectorPlan(reviewed, input);
      assert.equal(parseDirectorOutput({ ...reviewed, referenceReviews: [{ ...reviewed.referenceReviews![0], status: "conflict" }, reviewed.referenceReviews![1]] }, input), null);
      const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: `kling-v3-${quality}-image`, endpointId: "", sourceUrl: "https://private.example/main", elementImageUrls: ["https://private.example/detail", "https://private.example/second-detail"] });
      assert.equal(payload.start_image_url, payload.elements![0].frontal_image_url);
      assert.deepEqual(payload.elements![0].reference_image_urls, ["https://private.example/detail", "https://private.example/second-detail"]);
      for (const prompt of compiled.multiPrompt?.map(s => s.prompt) ?? [compiled.prompt]) {
        assert.ok(!prompt.includes("@Element1")); // Primary shots do not target supporting views.
        assert.ok(prompt.length <= (shotMode === "multi" ? 512 : 2500));
      }
      const key = directorCacheKey("owner", "main-hash", "fixture", input);
      const signed = sealDirectorPlan(key, reviewed, "secret", 1000);
      assert.ok(openDirectorPlan(signed, key, input, "secret", 2000));
      const changed = { ...input, draft: { ...input.draft, productReferences: [reference(3)] } };
      assert.notEqual(videoDraftHash(input.draft), videoDraftHash(changed.draft));
      assert.equal(openDirectorPlan(signed, directorCacheKey("owner", "main-hash", "fixture", changed), changed, "secret", 2000), null);
      const quote = sealVideoQuote("owner", input.draft, 1, "secret", 1000);
      assert.equal(verifyVideoQuote(quote.receipt, "owner", changed.draft, 1, "secret", 2000), false);
    }
});
test("new reference construction details cannot become focus evidence; unverified details fail closed", () => {
  const base = directorFixtureInput(directorProducts[0]);
  const input = { ...base, draft: { ...base.draft, productReferences: [reference(2)] } };
  const plan = fallbackDirectorPlan(input);
  const detail = "parallel relief on the visible front panel";
  plan.shots[1].focus = detail;
  plan.shots[1].evidenceRefs = [directorProductContext(input.profile).evidence.length];
  const reviews = [{ index: 0, status: "matched", reason: "Same outline, visible panel close-up", details: [detail] }];
  assert.equal(parseDirectorOutput({ ...plan, referenceReviews: reviews }, input), null);
  assert.equal(parseReferenceReviews([{ ...reviews[0], status: "conflict" }], 1), null);
  assert.equal(parseReferenceReviews([{ ...reviews[0], status: "uncertain" }], 1), null);
  assert.equal(parseReferenceReviews([{ ...reviews[0], details: ["genuine leather interior"] }], 1), null);
});
test("unsupported routes, excess images, non-HTTPS images and absent element bindings fail closed", () => {
  const req = { ...directorFixtureInput(directorProducts[0]).draft, modelId: "unsupported", endpointId: "", sourceUrl: "https://private.example/main", elementImageUrls: ["https://private.example/detail"] };
  assert.throws(() => buildFalVideoRequestInput(req));
  assert.throws(() => buildFalVideoRequestInput({ ...req, modelId: "kling-v3-pro-image", elementImageUrls: Array(4).fill("https://private.example/detail") }));
  assert.throws(() => buildFalVideoRequestInput({ ...req, modelId: "kling-v3-pro-image", elementImageUrls: ["http://private.example/detail"] }));
  assert.throws(() => buildFalVideoRequestInput({ ...req, modelId: "kling-v3-pro-image", prompt: "@Element1 moves", elementImageUrls: [] }));
});
