import assert from "node:assert/strict";
import test from "node:test";
import { classifyHumanReferenceFashion, isProviderModerationBlocked } from "../src/lib/generation/reference-fashion-classification";
import { readFile } from "node:fs/promises";

function classify(direction: string) { return classifyHumanReferenceFashion({ hasReference: true, humanDetected: true, userDirection: direction }); }

for (const direction of ["exposed legs in an editorial campaign", "short skirt commercial lookbook", "short shorts fashion campaign", "fitted dress editorial", "nightclub fashion scene", "seated editorial pose", "direct-flash fashion photography", "visible midriff commercial styling", "harness-like garment detail", "high-fashion provocative styling"]) {
  test(`ordinary fashion signal remains adult editorial fashion: ${direction}`, () => {
    const result = classify(direction);
    assert.equal(result.klayClassification, "adult_editorial_fashion");
    assert.notEqual(result.humanReferenceClassification, "potentially_sensitive");
  });
}
test("explicit sexual evidence routes to sensitive handling", () => { const result = classify("explicit sexual activity"); assert.equal(result.humanReferenceClassification, "potentially_sensitive"); assert.equal(result.explicitSexualEvidence, true); });
test("commercial and editorial apparel preserve non-explicit prompt context", () => { for (const direction of ["commercial apparel campaign", "editorial fashion lookbook"]) { const result = classify(direction); assert.equal(result.klayClassification, "adult_editorial_fashion"); assert.match(result.promptContext, /non-explicit|editorial fashion/i); } });
test("provider moderation remains terminal and independently classified", () => { assert.equal(isProviderModerationBlocked({ cause: { code: "moderation_blocked" } }), true); assert.equal(isProviderModerationBlocked({ cause: { code: "invalid_image" } }), false); });
test("provider moderation has no retry and persists separately from Klay classification", async () => {
  const source = await readFile("src/lib/generation/image-worker-service.ts", "utf8");
  assert.match(source, /failureCategory = providerModerationBlocked \? "provider_moderation_blocked"/);
  assert.match(source, /providerFalsePositiveCandidate: providerModerationBlocked/);
  assert.match(source, /retryable: providerModerationBlocked \? false : retryable/);
});
