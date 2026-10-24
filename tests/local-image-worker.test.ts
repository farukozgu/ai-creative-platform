import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { assertLocalImageRequest, consumeLocalImageRequest, withLocalImageBudget } from "../src/lib/generation/local-image-budget";
import { parseLocalImageAuthorization, selectedImageClaimQuery } from "../src/lib/generation/local-image-claim";

const authorization = {
  generationId: "11111111-1111-4111-8111-111111111111",
  ownerId: "22222222-2222-4222-8222-222222222222",
  projectId: "33333333-3333-4333-8333-333333333333",
  model: "gpt-image-2.5-sunburst", maxQuality: "high" as const,
};
const request = { ...authorization, quality: "high" };

test("explicit image and auxiliary cost authorization required", () => {
  assert.equal(parseLocalImageAuthorization(authorization), null);
  assert.equal(parseLocalImageAuthorization({ ...authorization, maxImageCalls: 2, authorizeAuxiliaryCalls: true }), null);
  assert.deepEqual(parseLocalImageAuthorization({ ...authorization, maxImageCalls: 1, authorizeAuxiliaryCalls: true }), authorization);
});

test("budget rejects different job, model, project and unapproved xhigh", async () => {
  await withLocalImageBudget(authorization, async () => {
    for (const override of [{ generationId: authorization.ownerId }, { projectId: authorization.ownerId }, { model: "other" }, { quality: "xhigh" }]) {
      assert.throws(() => assertLocalImageRequest({ ...request, ...override }));
    }
    consumeLocalImageRequest(request);
    assert.throws(() => consumeLocalImageRequest(request));
  });
});

test("parallel attempts share one budget and nested async work cannot reset it", async () => {
  await withLocalImageBudget({ ...authorization, maxQuality: "xhigh" }, async () => {
    const attempts = await Promise.allSettled([1, 2, 3].map(async () => {
      await Promise.resolve();
      consumeLocalImageRequest({ ...request, quality: "xhigh" });
    }));
    assert.equal(attempts.filter((entry) => entry.status === "fulfilled").length, 1);
  });
});

test("targeted claim never authorizes a backlog or previously attempted row", () => {
  const match = selectedImageClaimQuery(authorization);
  assert.equal(match.id, authorization.generationId);
  assert.equal(match.owner_id, authorization.ownerId);
  assert.equal(match.project_id, authorization.projectId);
  assert.equal(match.execution_attempts, 0);
  assert.equal(match.execution_lease_version, 0);
  assert.equal(match.status, "queued");
});

test("claim is a single fenced update; retries exhausted; batch and repair blocked locally", async () => {
  const worker = await readFile("src/lib/generation/local-image-worker.ts", "utf8");
  assert.match(worker, /\.match\(selectedImageClaimQuery\(authorization\)\)/);
  assert.match(worker, /execution_attempts: 3/);
  assert.match(worker, /\.is\("execution_lease_token", null\)/);
  assert.match(worker, /\.not\("client_submission_id", "is", null\)/);
  assert.match(worker, /provider_submission_state.eq.not_started/);
  assert.doesNotMatch(worker, /claimQueuedImageGenerations|runImageGenerationBatch/);
  const pipeline = await readFile("src/lib/generation/image-worker-service.ts", "utf8");
  assert.match(pipeline, /repairPlan.shouldRetry && !isLocalImageExecution\(\)/);
  assert.ok(pipeline.indexOf("assertLocalImageRequest({ generationId") < pipeline.indexOf("data: submissionCheckpoint"));
});

test("direct authenticated generation does not consume the local worker authorization budget", async () => {
  const provider = await readFile("src/lib/generation/providers/openai-image-provider.ts", "utf8");
  assert.match(provider, /if \(isLocalImageExecution\(\)\) consumeLocalImageRequest\(request\)/);

  const action = await readFile("src/app/[locale]/dashboard/projects/[projectId]/generation-actions.ts", "utf8");
  assert.match(action, /export async function createQueuedImageGeneration\(/);
  assert.match(action, /getAuthenticatedUserId\(\)/);
  assert.match(action, /\.eq\("user_id", userId\)/);
  assert.match(action, /awaitGenerationPipeline\(generation\.id, runQueuedImageGeneration\)/);
  assert.doesNotMatch(action, /export async function runQueuedImageGeneration\(/);
});
