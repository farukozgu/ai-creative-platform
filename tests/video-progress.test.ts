import assert from "node:assert/strict";
import test from "node:test";
import { getVideoProgressPhase } from "../src/lib/video-generation/progress-phase";
import { toVideoPresentationRecord } from "../src/lib/video-generation/presentation";
import type { VideoJobRecord } from "../src/lib/video-generation/types";

const base = { providerRequestId: "task-1", outputObjectPath: null, errorCode: null };

test("video progress phase reflects only persisted provider and storage state", () => {
  assert.equal(getVideoProgressPhase({ ...base, status: "queued" }), "queued");
  assert.equal(getVideoProgressPhase({ ...base, status: "queued", providerRequestId: null }), "submission-uncertain");
  assert.equal(getVideoProgressPhase({ ...base, status: "processing" }), "processing");
  assert.equal(getVideoProgressPhase({ ...base, status: "processing", errorCode: "output_persistence_failure" }), "storage-retry");
  assert.equal(getVideoProgressPhase({ ...base, status: "processing", outputObjectPath: "private/output.mp4" }), "finalizing");
  assert.equal(getVideoProgressPhase({ ...base, status: "succeeded", outputObjectPath: "private/output.mp4" }), "ready");
  assert.equal(getVideoProgressPhase({ ...base, status: "failed", errorCode: "provider_submission_ambiguous", providerRequestId: null }), "ambiguous");
  assert.equal(getVideoProgressPhase({ ...base, status: "failed", errorCode: "provider_failure" }), "failed");
});

test("presentation exposes safe resumable progress flags without provider task identifiers", () => {
  const job = {
    id: "job-1", ownerId: "owner-1", clientSubmissionId: "submission-1", mode: "image", prompt: "Product movement",
    quality: "standard", aspectRatio: "9:16", durationSeconds: 5, cameraMovement: "auto", sourceKind: "uploaded-image", sourceId: "source-1",
    provider: "fal", endpointId: "endpoint", modelId: "model", providerRequestId: "private-task-id", status: "processing", errorCode: null,
    outputBucketId: "generated-videos", outputObjectPath: "owner/job/output.mp4", outputMimeType: "video/mp4", outputSizeBytes: 2048,
    estimatedProviderCostUsd: 0.7, actualProviderCostUsd: null, billingReservationId: "reservation", billingStatus: "reserved",
    reconciliationAttempts: 2, nextReconciliationAt: null, createdAt: "2026-10-26T17:48:27Z", startedAt: "2026-10-26T17:48:28Z", completedAt: null,
  } satisfies VideoJobRecord;
  const view = toVideoPresentationRecord(job);
  assert.equal(view.status, "processing");
  assert.equal(view.progressPhase, "finalizing");
  assert.equal(view.providerTaskKnown, true);
  assert.equal(view.outputPersisted, true);
  assert.equal("providerRequestId" in view, false);
});
