import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workerPath = "src/lib/generation/image-worker-service.ts";
const actionPath = "src/app/[locale]/dashboard/projects/[projectId]/generation-actions.ts";

test("dashboard action contains no image inference", async () => {
  const [action, worker] = await Promise.all([readFile(actionPath, "utf8"), readFile(workerPath, "utf8")]);
  assert.doesNotMatch(action, /getImageGenerationProvider|images\.edit|runQueuedImageGeneration/);
  assert.match(action, /createQueuedImageGenerationService/);
  assert.match(worker, /client_submission_id: submissionId/);
});

test("worker preserves image semantics", async () => {
  const worker = await readFile(workerPath, "utf8");
  assert.match(worker, /OPENAI_IMAGE_MODEL\?\.trim\(\) \|\| "gpt-image-2\.5-sunburst"/);
  for (const symbol of ["buildImageGenerationPromptWithPolicy", "resolveGenerationExecutionPolicy", "validateGeneratedImageBestEffort", "createCostTelemetry"]) assert.match(worker, new RegExp(symbol));
  assert.match(worker, /attempt: 1/);
  assert.doesNotMatch(worker, /attempt: 2/);
});

test("terminal transitions are lease fenced", async () => {
  const worker = await readFile(workerPath, "utf8");
  for (const marker of ["completedGeneration", "failedGeneration", "ambiguousGeneration", "recoveryGeneration"]) {
    const start = worker.indexOf(`data: ${marker}`);
    assert.ok(start > 0, `missing transition ${marker}`);
    const mutation = worker.slice(start, worker.indexOf("maybeSingle();", start) + 14);
    assert.match(mutation, /execution_lease_token/);
    assert.match(mutation, /execution_lease_version/);
    assert.match(mutation, /execution_lease_expires_at/);
  }
});

test("ambiguous provider submissions cannot be claimed automatically", async () => {
  const [worker, migration] = await Promise.all([readFile(workerPath, "utf8"), readFile("database/migrations/20261028000000_add_image_reconciliation_state.sql", "utf8")]);
  assert.match(worker, /provider_submission_state: "submitting"[\s\S]+providerSubmissionUncertain = true/);
  assert.match(worker, /provider_submission_state: "ambiguous"/);
  assert.match(migration, /coalesce\(g\.provider_submission_state, 'not_started'\) = 'not_started'/);
});

test("worker route is protected, gated, and bounded", async () => {
  const [route, handler, scheduler] = await Promise.all([readFile("src/app/api/internal/image-generation-worker/route.ts", "utf8"), readFile("src/lib/generation/image-worker-handler.ts", "utf8"), readFile("src/lib/generation/image-scheduler.ts", "utf8")]);
  assert.match(route, /IMAGE_GENERATION_WORKER_SECRET/);
  assert.match(handler, /isAuthorizedVideoSchedulerRequest/);
  assert.match(handler, /isImageGenerationWorkerEnabled/);
  assert.match(handler, /status: 401/);
  assert.match(handler, /status: 503/);
  assert.match(scheduler, /IMAGE_EXECUTION_BATCH_SIZE = 1/);
  assert.match(scheduler, /Promise\.allSettled/);
});

test("Vercel cron GET adapter uses the shared handler and remains production-gated", async () => {
  const [cron, internal, config] = await Promise.all([
    readFile("src/app/api/cron/image-generation/route.ts", "utf8"),
    readFile("src/app/api/internal/image-generation-worker/route.ts", "utf8"),
    readFile("vercel.json", "utf8"),
  ]);
  assert.match(cron, /export async function GET/);
  assert.match(cron, /process\.env\.CRON_SECRET/);
  assert.match(cron, /maxDuration = 780/);
  assert.match(internal, /export async function POST/);
  assert.match(JSON.parse(config).crons[0].schedule, /^\* \* \* \* \*$/);
});

test("lease renewal is fenced and provider retries are disabled", async () => {
  const [scheduler, migration, provider] = await Promise.all([
    readFile("src/lib/generation/image-scheduler.ts", "utf8"),
    readFile("database/migrations/20261029000000_add_image_lease_renewal.sql", "utf8"),
    readFile("src/lib/generation/providers/openai-image-provider.ts", "utf8"),
  ]);
  assert.match(scheduler, /IMAGE_EXECUTION_LEASE_SECONDS = 750/);
  assert.match(scheduler, /IMAGE_EXECUTION_HEARTBEAT_MS = 60_000/);
  assert.match(migration, /execution_lease_token = p_lease_token/);
  assert.match(migration, /execution_lease_version = p_lease_version/);
  assert.match(migration, /execution_lease_expires_at > clock_timestamp\(\)/);
  assert.match(provider, /timeout: 300_000, maxRetries: 0/);
});

test("video billing and scheduler gates remain closed", async () => {
  const [worker, videoRoute] = await Promise.all([readFile(workerPath, "utf8"), readFile("src/app/api/internal/video-reconciliation/route.ts", "utf8")]);
  assert.doesNotMatch(worker, /reserve_video_credits|settle_video_credits|release_video_credits/);
  assert.match(videoRoute, /billing_unavailable/);
  assert.match(videoRoute, /isVideoReconciliationSchedulerEnabled/);
});
