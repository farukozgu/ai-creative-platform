import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { fallbackDirectorPlan, type VideoDirectorInput } from "../src/lib/video-director/core";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";
import { VideoProductionHarness, videoTestOwner, videoTestSource } from "./fixtures/video-production-harness";

const presets = ["minimal-studio", "metallic-light-sweep", "macro-detail-reveal", "floating-accessory", "cinematic-hero",
  "dramatic-backlight", "material-detail", "window-display"] as const;

test("all visible golden 10-second multi plans skip creative Director calls and preserve the fixed plan", async () => {
  const harness = await VideoProductionHarness.create();
  harness.env.OPENAI_API_KEY = "offline-fixture-only";
  const source = harness.objects.get(`video-source-images/${videoTestOwner}/${videoTestSource}/prepared-v1.png`)!.bytes;
  const sourceHash = createHash("sha256").update(source).digest("hex");
  const runtime = harness.planReader();
  for (const presetId of presets) {
    const base = directorFixtureInput(directorProducts[2]);
    const input: VideoDirectorInput = { ...base, presetId, shotMode: "multi", draft: { ...base.draft, source: { kind: "uploaded-image", sourceAssetId: videoTestSource }, durationSeconds: 10 } };
    const expected = fallbackDirectorPlan(input);
    const result = await runtime.prepareVideoDirectorPlan(videoTestOwner, source, sourceHash, input);
    assert.deepEqual(JSON.parse(JSON.stringify(result.plan)), JSON.parse(JSON.stringify(expected)));
    const restored = harness.receiptReader().openDirectorPlan(result.receipt,
      harness.receiptReader().directorCacheKey(videoTestOwner, sourceHash, "gpt-4o-mini", input), input, "isolated-video-test-secret", Date.now());
    assert.deepEqual(JSON.parse(JSON.stringify(restored)), JSON.parse(JSON.stringify(expected)));
  }
  assert.equal(harness.directorInputs.length, 0);
  assert.equal(harness.referenceReviewInputs.length, 0);
});

test("golden reference planning invokes review only, and failed review remains fail-closed", async () => {
  const harness = await VideoProductionHarness.create();
  harness.env.OPENAI_API_KEY = "offline-fixture-only";
  harness.analysisProfile = directorProducts[2];
  harness.referenceReviewsResponse = [{ index: 0, status: "matched", view: "side", reason: "Same product identity", details: [] }];
  const source = harness.objects.get(`video-source-images/${videoTestOwner}/${videoTestSource}/prepared-v1.png`)!.bytes;
  const sourceHash = createHash("sha256").update(source).digest("hex");
  const refId = "10000000-0000-4000-8000-000000000003";
  const refHash = await harness.addSource(refId);
  const ref = harness.objects.get(`video-source-images/${videoTestOwner}/${refId}/prepared-v1.png`)!.bytes;
  const base = directorFixtureInput(directorProducts[2]);
  const input: VideoDirectorInput = { ...base, presetId: "window-display", shotMode: "multi",
    draft: { ...base.draft, source: { kind: "uploaded-image", sourceAssetId: videoTestSource }, durationSeconds: 10,
      productReferences: [{ source: { kind: "uploaded-image", sourceAssetId: refId }, sha256: refHash, purpose: "side view" }] },
    referenceImages: [{ prepared: ref, sourceSha256: refHash, purpose: "side view", profile: null }] };
  const expectedShots = fallbackDirectorPlan(input).shots;
  const runtime = harness.planReader();
  assert.equal(runtime.isVideoDirectorAIAvailable(videoTestOwner), true);
  const result = await runtime.prepareVideoDirectorPlan(videoTestOwner, source, sourceHash, input);
  assert.deepEqual(JSON.parse(JSON.stringify(result.plan.shots)), JSON.parse(JSON.stringify(expectedShots)));
  assert.deepEqual(JSON.parse(JSON.stringify(result.plan.referenceReviews)), JSON.parse(JSON.stringify(harness.referenceReviewsResponse)));
  assert.equal(harness.directorInputs.length, 0);
  assert.equal(harness.referenceReviewInputs.length, 1);

  const receipts = harness.receiptReader();
  const oldPlan = harness.attachReferenceReviews(fallbackDirectorPlan(input), input, result.plan.referenceReviews!);
  assert.ok(oldPlan.shots.some(shot => shot.referenceIndex !== undefined), "legacy plan bound the side image to a shot");
  const key = receipts.directorCacheKey(videoTestOwner, sourceHash, "gpt-4o-mini", input);
  const oldReceipt = receipts.sealDirectorPlan(key, oldPlan, "isolated-video-test-secret");
  assert.ok(runtime.readVerifiedDirectorPlan(videoTestOwner, sourceHash, input, oldReceipt));
  const repeated = await runtime.prepareVideoDirectorPlan(videoTestOwner, source, sourceHash, input, oldReceipt);
  assert.deepEqual(JSON.parse(JSON.stringify(repeated.plan)), JSON.parse(JSON.stringify(result.plan)));
  assert.equal(harness.referenceReviewInputs.length, 1);

  harness.referenceReviewInputs.length = 0;
  harness.referenceReviewsResponse = [];
  const failed = await harness.planReader().prepareVideoDirectorPlan(videoTestOwner, source, sourceHash,
    { ...input, draft: { ...input.draft, clientSubmissionId: "20000000-0000-4000-8000-000000000099" } }).then(() => null, error => error);
  assert.equal((failed as { message?: string }).message, "references_not_verified");
  assert.equal(harness.directorInputs.length, 0);
  assert.equal(harness.referenceReviewInputs.length, 1);

  const quota = await harness.planReader().prepareVideoDirectorPlan(videoTestOwner, source, sourceHash, input, undefined, false,
    { correlationId: "offline-correlation", fallbackReason: "quota_limited" }).then(() => null, error => error);
  assert.equal((quota as { referenceFailure?: string }).referenceFailure, "quota");
  assert.equal(harness.referenceReviewInputs.length, 1);
});

test("legacy single and five-second planning keeps the provider planning path", async () => {
  const harness = await VideoProductionHarness.create();
  harness.env.OPENAI_API_KEY = "offline-fixture-only";
  harness.directorResponse = { shots: [] };
  const source = harness.objects.get(`video-source-images/${videoTestOwner}/${videoTestSource}/prepared-v1.png`)!.bytes;
  const sourceHash = createHash("sha256").update(source).digest("hex");
  const base = directorFixtureInput(directorProducts[2]);
  const input: VideoDirectorInput = { ...base, presetId: "minimal-studio", shotMode: "single",
    draft: { ...base.draft, source: { kind: "uploaded-image", sourceAssetId: videoTestSource }, durationSeconds: 5 } };
  await harness.planReader().prepareVideoDirectorPlan(videoTestOwner, source, sourceHash, input);
  assert.equal(harness.directorInputs.length, 1);
  assert.equal(harness.referenceReviewInputs.length, 0);
});
