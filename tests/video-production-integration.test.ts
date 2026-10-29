import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { VideoGenerationDraft } from "../src/lib/video-generation/types";
import { VideoProductionHarness, videoTestOwner, videoTestSource } from "./fixtures/video-production-harness";

async function submit(f: VideoProductionHarness, draft: VideoGenerationDraft) {
  const quote = await f.api.quoteVideoSubmissionAction(draft);
  assert.equal(quote.status, "success", JSON.stringify(f.unexpected));
  if (quote.status !== "success") throw new Error("Missing signed quote");
  const result = await f.api.submitVideoGenerationAction(draft, quote.cost, quote.receipt, true);
  assert.ok(result.ok, JSON.stringify(result));
  return { jobId: result.jobId, quote };
}

for (const quality of ["standard", "pro"] as const) for (const duration of [5, 10] as const) for (const mode of ["single", "multi"] as const) {
  test(`Studio -> signed approval -> SDK HTTP -> MP4 -> library: ${quality}/${duration}s/${mode}`, async () => {
    for (const origin of ["ai", "fallback"] as const) {
      const f = await VideoProductionHarness.create();
      const draft = f.draft(quality, duration, mode);
      const plan = f.signDirector(draft, origin);
      const { jobId, quote } = await submit(f, draft);
      assert.equal(quote.preview.mode, mode);
      assert.equal(quote.preview.shots.reduce((sum, shot) => sum + shot.duration, 0), duration);
      assert.equal(f.posts.length, 1);
      const { endpoint, input } = f.posts[0];
      assert.equal(endpoint, `fal-ai/kling-video/v3/${quality}/image-to-video`);
      assert.equal(input.duration, String(duration));
      assert.equal(input.generate_audio, false);
      assert.equal(input.enable_safety_checker, true);
      if (mode === "multi") {
        assert.equal(input.prompt, undefined);
        assert.equal(input.shot_type, "customize");
        const shots = input.multi_prompt as Array<{ prompt: string; duration: string }>;
        assert.deepEqual(shots.map(shot => shot.prompt), Array.from(quote.preview.shots, shot => shot.prompt));
        assert.equal(shots.reduce((sum, shot) => sum + Number(shot.duration), 0), duration);
        assert.ok(shots.every(shot => shot.prompt.length <= 512));
      } else {
        assert.equal(input.multi_prompt, undefined);
        assert.equal(input.prompt, quote.preview.shots[0].prompt);
        assert.ok(String(input.prompt).length <= 2500);
      }
      const queued = await f.api.readVideoGenerationStatusAction(jobId);
      assert.ok(queued.status === "success" && queued.job.progressPhase === "queued");
      f.task(jobId).status = "IN_PROGRESS"; f.advance(11_000);
      const processing = await f.api.readVideoGenerationStatusAction(jobId);
      assert.ok(processing.status === "success" && processing.job.status === "processing");
      assert.equal((await f.api.getVideoPlaybackAccessAction(jobId)).status, "not_found");
      f.task(jobId).status = "COMPLETED"; f.advance(21_000);
      const completed = await f.api.readVideoGenerationStatusAction(jobId);
      assert.ok(completed.status === "success" && completed.job.status === "ready", JSON.stringify({ completed, logs: f.logs }));
      const row = f.rows.find(row => row.id === jobId)!;
      assert.equal(row.billing_status, "finalized");
      assert.equal(row.reconciliation_lease_token, null);
      assert.equal((row.provider_metadata as { videoPreservation: { director: { plan: { origin: string } } } }).videoPreservation.director.plan.origin, origin);
      assert.ok([...f.reservations.values()][0].finalized);
      const library = await f.api.listVideoGenerationsAction();
      assert.equal(library.status, "success");
      assert.ok(library.records.some(record => record.id === jobId && record.status === "ready"));
      const detail = await f.api.readVideoGenerationAction(jobId);
      assert.ok(detail?.playbackUrl);
      const playback = await f.readPlayback(detail.playbackUrl);
      assert.equal(playback.headers.get("content-type"), "video/mp4");
      assert.deepEqual(Buffer.from(await playback.arrayBuffer()), readFileSync(`tests/fixtures/kling-test-${duration}s.mp4`));
      assert.equal(f.posts.length, 1);
      assert.equal(f.terminalWrites, 0);
      assert.ok(f.logs.some(args => JSON.stringify(args).includes("video_generation_completed")));
      assert.ok(!JSON.stringify(f.logs).includes("fake-fal-key"));
      assert.ok(!JSON.stringify(f.logs).includes("mock-private-token"));
      assert.ok(plan.shots.length >= 1);
      f.assertIsolated();
    }
  });
}

test("signed quote rejects expired, unapproved, repriced, altered-source/plan and cross-owner requests before reservation", async () => {
  for (const change of ["approval", "expired", "pricing", "source-id", "source-bytes", "plan", "owner"] as const) {
    const f = await VideoProductionHarness.create();
    const draft = f.draft(); f.signDirector(draft, "ai");
    const quote = await f.api.quoteVideoSubmissionAction(draft);
    assert.ok(quote.status === "success");
    let approved = true;
    if (change === "approval") approved = false;
    if (change === "expired") f.advance(121_000);
    if (change === "pricing") f.rate.standard = 0.15;
    if (change === "source-id") draft.source = { kind: "uploaded-image", sourceAssetId: "10000000-0000-4000-8000-000000000003" };
    if (change === "source-bytes") await f.addSource(videoTestSource, videoTestOwner, "red");
    if (change === "plan") draft.director!.receipt += "x";
    if (change === "owner") f.owner = "10000000-0000-4000-8000-000000000004";
    const result = await f.api.submitVideoGenerationAction(draft, quote.cost, quote.receipt, approved);
    assert.equal(result.ok, false, change);
    assert.equal(f.posts.length, 0, change);
    assert.equal(f.reservations.size, 0, change);
    assert.equal(f.rows.length, 0, change);
    f.assertIsolated();
  }
});

test("source content is signed even for an undirected single shot whose prompts remain identical", async () => {
  const f = await VideoProductionHarness.create();
  const draft = f.draft();
  const quote = await f.api.quoteVideoSubmissionAction(draft); assert.ok(quote.status === "success");
  await f.addSource(videoTestSource, videoTestOwner, "red");
  const result = await f.api.submitVideoGenerationAction(draft, quote.cost, quote.receipt, true);
  assert.equal(result.ok, false);
  assert.equal(f.posts.length, 0); assert.equal(f.reservations.size, 0);
});

test("owned references become one @Element1, and changed reference bytes invalidate approval", async () => {
  for (const changed of [false, true]) {
    const f = await VideoProductionHarness.create();
    const referenceId = "10000000-0000-4000-8000-000000000003";
    const sha256 = await f.addSource(referenceId);
    const draft = f.draft("pro", 10, "multi");
    draft.productReferences = [{ source: { kind: "uploaded-image", sourceAssetId: referenceId }, sha256, purpose: "dial" }];
    f.signDirector(draft, "ai");
    const quote = await f.api.quoteVideoSubmissionAction(draft); assert.ok(quote.status === "success");
    if (changed) await f.addSource(referenceId, videoTestOwner, "red");
    const result = await f.api.submitVideoGenerationAction(draft, quote.cost, quote.receipt, true);
    if (changed) { assert.equal(result.ok, false); assert.equal(f.posts.length, 0); assert.equal(f.reservations.size, 0); }
    else {
      assert.ok(result.ok);
      const input = f.posts[0].input;
      const elements = input.elements as Array<{ frontal_image_url: string; reference_image_urls: string[] }>;
      assert.equal(elements.length, 1); assert.equal(elements[0].frontal_image_url, input.start_image_url);
      assert.equal(elements[0].reference_image_urls.length, 1);
      assert.ok(elements[0].reference_image_urls[0].includes(referenceId));
      assert.ok((input.multi_prompt as Array<{ prompt: string }>).every(shot => shot.prompt.startsWith("@Element1: ")));
      f.task(result.jobId).status = "COMPLETED";
      assert.equal((await f.api.readVideoGenerationStatusAction(result.jobId)).status, "success");
      assert.equal(f.rows[0].status, "succeeded");
    }
    f.assertIsolated();
  }
});

test("concurrent identical approvals reserve once and issue only one SDK POST; reuse never re-submits", async () => {
  const f = await VideoProductionHarness.create();
  const draft = f.draft("standard", 10, "multi"); f.signDirector(draft, "fallback");
  const quote = await f.api.quoteVideoSubmissionAction(draft); assert.ok(quote.status === "success");
  const results = await Promise.all(Array.from({ length: 8 }, () => f.api.submitVideoGenerationAction(draft, quote.cost, quote.receipt, true)));
  assert.ok(results.some(result => result.ok));
  assert.equal(f.posts.length, 1); assert.equal(f.rows.length, 1); assert.equal(f.reservations.size, 1);
  f.advance(121_000);
  const repeated = await f.api.submitVideoGenerationAction(draft, quote.cost, quote.receipt, false);
  assert.ok(repeated.ok && repeated.duplicate);
  assert.equal(f.posts.length, 1);
  assert.equal((await f.api.quoteVideoSubmissionAction(draft)).status, "used");
  f.assertIsolated();
});

test("submission rejection, transport timeout and lost acceptance stay terminal/uncertain without re-POST", async () => {
  for (const outcome of ["rejected", "timeout", "lost-response"] as const) {
    const f = await VideoProductionHarness.create();
    const draft = f.draft(); f.signDirector(draft, "fallback");
    const quote = await f.api.quoteVideoSubmissionAction(draft); assert.ok(quote.status === "success");
    f.submitOutcome = outcome;
    const result = await f.api.submitVideoGenerationAction(draft, quote.cost, quote.receipt, true);
    assert.ok(!result.ok);
    assert.equal(result.code, outcome === "rejected" ? "provider_failure" : "provider_submission_ambiguous");
    assert.equal(f.rows[0].status, "failed");
    assert.equal(f.rows[0].billing_status, "reconciliation_required");
    assert.equal([...f.reservations.values()][0].finalized, false);
    await f.api.submitVideoGenerationAction(draft, quote.cost, quote.receipt, true);
    assert.equal(f.posts.length, 1);
    if (outcome === "rejected") {
      f.submitOutcome = "accepted";
      const retry = f.draft(); f.signDirector(retry, "fallback");
      await submit(f, retry);
      assert.equal(f.posts.length, 2, "a new request needs a fresh signed quote and explicit approval");
    }
    f.assertIsolated();
  }
});

test("COMPLETED with error, result 422 and malformed result are provider failures, never Storage successes", async () => {
  for (const failure of ["status-error", "result-422", "missing-video"] as const) {
    const f = await VideoProductionHarness.create();
    const draft = f.draft(); f.signDirector(draft, "ai");
    const { jobId } = await submit(f, draft);
    const task = f.task(jobId); task.status = "COMPLETED";
    if (failure === "status-error") task.error = "Provider inference failed";
    if (failure === "result-422") task.resultStatus = 422;
    if (failure === "missing-video") task.missingVideo = true;
    await f.reconcile(jobId);
    assert.equal(f.rows[0].status, "failed"); assert.equal(f.rows[0].error_code, "provider_failure");
    assert.equal(f.rows[0].reconciliation_lease_token, null);
    assert.equal(f.uploadAttempts, 0); assert.equal(f.terminalWrites, 0);
    assert.equal((await f.api.getVideoPlaybackAccessAction(jobId)).status, "not_found");
    assert.equal([...f.reservations.values()][0].finalized, false);
    f.assertIsolated();
  }
});

test("Storage failure is visible and retries the same completed task without a new paid request", async () => {
  const f = await VideoProductionHarness.create();
  const draft = f.draft(); f.signDirector(draft, "ai");
  const { jobId } = await submit(f, draft); f.task(jobId).status = "COMPLETED";
  f.failUploads = 1;
  const failedSave = await f.api.readVideoGenerationStatusAction(jobId);
  assert.ok(failedSave.status === "success" && failedSave.job.progressPhase === "storage-retry");
  assert.equal(f.rows[0].status, "processing"); assert.equal(f.rows[0].error_code, "output_persistence_failure");
  assert.equal((await f.api.getVideoPlaybackAccessAction(jobId)).status, "not_found");
  f.advance();
  const retried = await f.api.readVideoGenerationStatusAction(jobId);
  assert.ok(retried.status === "success" && retried.job.status === "ready");
  assert.equal(f.posts.length, 1); assert.equal(f.reservations.size, 1); assert.equal(f.uploadAttempts, 2);
  f.assertIsolated();
});

test("a provider status timeout schedules another read without losing the task or repeating submission", async () => {
  const f = await VideoProductionHarness.create();
  const draft = f.draft(); f.signDirector(draft, "fallback");
  const { jobId } = await submit(f, draft);
  f.failProviderReads = true;
  const pending = await f.api.readVideoGenerationStatusAction(jobId);
  assert.ok(pending.status === "success" && pending.job.status === "queued");
  assert.ok(f.rows[0].next_reconciliation_at);
  assert.equal(f.rows[0].reconciliation_lease_token, null);
  assert.equal(f.posts.length, 1);
  f.failProviderReads = false; f.task(jobId).status = "COMPLETED"; f.advance();
  const done = await f.api.readVideoGenerationStatusAction(jobId);
  assert.ok(done.status === "success" && done.job.status === "ready");
  assert.equal(f.posts.length, 1);
  f.assertIsolated();
});

test("authenticated background reconciliation supports Studio without a legacy beta user or new inference", async () => {
  const f = await VideoProductionHarness.create();
  const draft = f.draft(); f.signDirector(draft, "fallback");
  const { jobId } = await submit(f, draft); f.task(jobId).status = "COMPLETED";
  f.env.VIDEO_RECONCILIATION_CRON_SECRET = "mock-cron-secret";
  assert.equal((await f.runScheduler()).status, 401);
  assert.equal((await f.runScheduler("Bearer wrong")).status, 401);
  assert.equal((await f.runScheduler("Bearer mock-cron-secret")).status, 503);
  assert.equal(f.uploadAttempts, 0);
  f.env.VIDEO_RECONCILIATION_SCHEDULER_ENABLED = "true";
  const response = await f.runScheduler("Bearer mock-cron-secret");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { claimed: 1 });
  assert.equal(f.rows[0].status, "succeeded");
  assert.equal(f.posts.length, 1); assert.equal(f.reservations.size, 1);
  f.assertIsolated();
});

test("a checkpointed MP4 finalizes even when fal becomes unavailable; library reads survive a claim outage", async () => {
  const f = await VideoProductionHarness.create();
  const draft = f.draft(); f.signDirector(draft, "ai");
  const { jobId } = await submit(f, draft); f.task(jobId).status = "COMPLETED"; f.failFinalizations = 1;
  const finalizing = await f.api.readVideoGenerationStatusAction(jobId);
  assert.ok(finalizing.status === "success" && finalizing.job.progressPhase === "finalizing");
  assert.equal(f.uploadAttempts, 1);
  f.failProviderReads = true; f.advance();
  const ready = await f.api.readVideoGenerationStatusAction(jobId);
  assert.ok(ready.status === "success" && ready.job.status === "ready");
  assert.equal(f.uploadAttempts, 1); assert.equal(f.posts.length, 1);
  f.failClaims = true;
  const library = await f.api.listVideoGenerationsAction();
  assert.equal(library.status, "success"); assert.equal(library.records[0].status, "ready");
  f.owner = "10000000-0000-4000-8000-000000000004";
  assert.equal(await f.api.readVideoGenerationAction(jobId), null);
  assert.equal((await f.api.getVideoPlaybackAccessAction(jobId)).status, "not_found");
  assert.deepEqual((await f.api.listVideoGenerationsAction()).records, []);
  f.assertIsolated();
});

test("unsafe provider media and invalid MP4 bytes never become playable library records", async () => {
  for (const failure of ["untrusted-url", "invalid-mp4"] as const) {
    const f = await VideoProductionHarness.create();
    const draft = f.draft(); f.signDirector(draft, "ai");
    const { jobId } = await submit(f, draft); f.task(jobId).status = "COMPLETED";
    if (failure === "untrusted-url") f.task(jobId).url = "https://127.0.0.1/private.mp4";
    else f.corruptVideo = true;
    await f.api.readVideoGenerationStatusAction(jobId);
    assert.equal(f.rows[0].status, "processing"); assert.equal(f.rows[0].error_code, "output_persistence_failure");
    assert.equal(f.uploadAttempts, 0);
    assert.equal((await f.api.getVideoPlaybackAccessAction(jobId)).status, "not_found");
    f.assertIsolated();
  }
});

test("signed profile snapshots survive cache timestamps while tampering, wrong source and oversized inflation fail closed", async () => {
  const f = await VideoProductionHarness.create(), draft = f.draft();
  f.signDirector(draft, "ai");
  const profile = f.receiptReader().readDirectorProfileSnapshot(draft.director!.receipt, f.env.SUPABASE_SECRET_KEY);
  assert.deepEqual(JSON.parse(JSON.stringify(profile)), f.profile);
  assert.equal(f.receiptReader().readDirectorProfileSnapshot(draft.director!.receipt + "x", f.env.SUPABASE_SECRET_KEY), null);
  const input = { draft, profile: f.profile, presetId: "cinematic-dial" as const, shotMode: "single" as const };
  const receipt = f.receiptReader();
  const key = receipt.directorCacheKey(videoTestOwner, "hash", "gpt-4o-mini", input);
  assert.equal(receipt.directorCacheKey(videoTestOwner, "hash", "gpt-4o-mini", { ...input, profile: { ...f.profile, source: { ...f.profile.source, analyzedAt: "2099-01-01" } } }), key);
  assert.notEqual(receipt.directorCacheKey(videoTestOwner, "hash", "gpt-4o-mini", { ...input, profile: { ...f.profile, materials: ["titanium"] } }), key);
  assert.equal(f.planReader().readVerifiedDirectorPlan(videoTestOwner, "wrong-source", input, draft.director!.receipt), null);
  const plan = f.signDirector(draft, "ai");
  const bomb = receipt.sealDirectorPlan("key", plan, f.env.SUPABASE_SECRET_KEY, f.now, { ...f.profile, productShape: "x".repeat(100_000) });
  assert.ok(bomb.length < 14000);
  assert.equal(receipt.readDirectorProfileSnapshot(bomb, f.env.SUPABASE_SECRET_KEY), null);
});
