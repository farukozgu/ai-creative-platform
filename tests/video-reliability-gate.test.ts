import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { videoDraftHash } from "../src/lib/video-generation/request-identity";
import { VideoProductionHarness } from "./fixtures/video-production-harness";

async function admitted(f: VideoProductionHarness, origin: "ai" | "fallback" = "ai", director = true) {
  const draft = f.draft();
  const plan = director ? f.signDirector(draft, origin) : null;
  const quote = await f.api.quoteVideoSubmissionAction(draft); assert.ok(quote.status === "success");
  const result = await f.api.submitVideoGenerationAction(draft, quote.cost, quote.receipt, true); assert.ok(result.ok);
  f.task(result.jobId).status = "COMPLETED";
  return { draft, plan, quote, jobId: result.jobId };
}

test("blank user intent persists a nonempty verified direction without changing approval identity", async () => {
  for (const origin of ["ai", "fallback", "undirected"] as const) {
    const f = await VideoProductionHarness.create();
    const { draft, plan, quote, jobId } = await admitted(f, origin === "fallback" ? origin : "ai", origin !== "undirected");
    assert.equal(draft.prompt, "");
    const row = f.rows.find(row => row.id === jobId)!;
    assert.ok(String(row.creative_direction_snapshot).trim());
    assert.ok(String(row.creative_direction_snapshot).length <= 4000);
    if (plan) assert.equal(row.creative_direction_snapshot, plan.summary);
    const snapshot = (row.provider_metadata as { videoPreservation: { draftHash: string } }).videoPreservation;
    assert.equal(snapshot.draftHash, videoDraftHash(draft));
    const repeated = await f.api.submitVideoGenerationAction(draft, quote.cost, quote.receipt, false);
    assert.ok(repeated.ok && repeated.duplicate);
    assert.equal(f.posts.length, 1);
    f.assertIsolated();
  }
});

test("deployment cron is a minute GET route; native and external credentials cannot impersonate each other", async () => {
  const deployment = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: Array<{ path: string; schedule: string }> };
  assert.deepEqual(deployment.crons, [{ path: "/api/internal/video-reconciliation", schedule: "* * * * *" }]);
  const f = await VideoProductionHarness.create();
  f.env.CRON_SECRET = "native-secret"; f.env.VIDEO_RECONCILIATION_CRON_SECRET = "external-secret";
  assert.equal((await f.runScheduler(undefined, "GET")).status, 401);
  assert.equal((await f.runScheduler("Bearer external-secret", "GET")).status, 401);
  assert.equal((await f.runScheduler("Bearer native-secret", "POST")).status, 401);
  assert.equal((await f.runScheduler("Bearer native-secret", "GET")).status, 503);
  f.env.VIDEO_RECONCILIATION_SCHEDULER_ENABLED = "true";
  assert.equal((await f.runScheduler("Bearer native-secret", "GET")).status, 200);
  assert.equal((await f.runScheduler("Bearer external-secret", "POST")).status, 200);
  assert.equal(f.posts.length, 0); assert.equal(f.reservations.size, 0);
  f.assertIsolated();
});

test("successive native cron runs recover Storage failure and reopening the library sees the MP4", async () => {
  const f = await VideoProductionHarness.create();
  const { jobId } = await admitted(f);
  f.env.CRON_SECRET = "native-secret"; f.env.VIDEO_RECONCILIATION_SCHEDULER_ENABLED = "true";
  f.failUploads = 1;
  assert.equal((await f.runScheduler("Bearer native-secret", "GET")).status, 200);
  assert.equal(f.rows[0].status, "processing"); assert.equal(f.rows[0].error_code, "output_persistence_failure");
  assert.equal(f.rows[0].reconciliation_lease_token, null);
  // Vercel does not retry failed invocations; the next scheduled tick resumes.
  assert.deepEqual(await (await f.runScheduler("Bearer native-secret", "GET")).json(), { claimed: 0 });
  f.advance(60_001);
  await f.runScheduler("Bearer native-secret", "GET");
  assert.equal(f.rows[0].status, "succeeded");
  await f.runScheduler("Bearer native-secret", "GET");
  assert.equal(f.posts.length, 1); assert.equal(f.reservations.size, 1); assert.equal(f.uploadAttempts, 2);
  const library = await f.api.listVideoGenerationsAction();
  assert.equal(library.records[0].id, jobId); assert.equal(library.records[0].status, "ready");
  const access = await f.api.getVideoPlaybackAccessAction(jobId); assert.ok(access.status === "success");
  assert.equal((await f.readPlayback(access.url)).headers.get("content-type"), "video/mp4");
  f.assertIsolated();
});

test("a slow upload outliving its lease is recovered by the next worker without repolling fal or resubmitting", async () => {
  const f = await VideoProductionHarness.create();
  await admitted(f);
  f.env.CRON_SECRET = "native-secret"; f.env.VIDEO_RECONCILIATION_SCHEDULER_ENABLED = "true";
  f.uploadDelayMs = 121_000;
  await f.runScheduler("Bearer native-secret", "GET");
  assert.equal(f.rows[0].status, "processing"); assert.equal(f.rows[0].output_object_path, null);
  assert.equal(f.uploadAttempts, 1);
  f.failProviderReads = true;
  await f.runScheduler("Bearer native-secret", "GET");
  assert.equal(f.rows[0].status, "succeeded");
  assert.equal(f.posts.length, 1); assert.equal(f.uploadAttempts, 1);
  assert.equal([...f.reservations.values()][0].finalized, true);
  f.assertIsolated();
});

test("cron claims only one job per tick and concurrent ticks cannot finalize one lease twice", async () => {
  const f = await VideoProductionHarness.create();
  await admitted(f);
  f.env.CRON_SECRET = "native-secret"; f.env.VIDEO_RECONCILIATION_SCHEDULER_ENABLED = "true";
  const results = await Promise.all([f.runScheduler("Bearer native-secret", "GET"), f.runScheduler("Bearer native-secret", "GET")]);
  const claimed = await Promise.all(results.map(result => result.json() as Promise<{ claimed: number }>));
  assert.equal(claimed.reduce((sum, result) => sum + result.claimed, 0), 1);
  assert.equal(f.uploadAttempts, 1); assert.equal(f.posts.length, 1);
  await admitted(f, "fallback"); await admitted(f);
  const tick = await f.runScheduler("Bearer native-secret", "GET");
  assert.deepEqual(await tick.json(), { claimed: 1 });
  assert.equal(f.rows.filter(row => row.status === "queued").length, 1);
  assert.equal(f.rows.filter(row => row.status === "succeeded").length, 2);
  f.assertIsolated();
});
