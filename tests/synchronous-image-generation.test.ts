import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionPath = "src/app/[locale]/dashboard/projects/[projectId]/generation-actions.ts";

test("Creative Composer awaits its synchronous image pipeline before returning", async () => {
  const action = await readFile(actionPath, "utf8");
  const insert = action.indexOf('safeGenerationEvent("create", "insert_success"');
  const pipeline = action.indexOf("awaitGenerationPipeline(generation.id, runQueuedImageGeneration)", insert);
  const success = action.indexOf('return { ok: true, generationId: generation.id, status: "succeeded" }', pipeline);

  assert.ok(insert >= 0 && pipeline > insert && success > pipeline);
  assert.match(action, /getImageGenerationProvider\(queuedGeneration\.provider\)\.generate\(/);
  assert.match(action, /\.from\(generatedAssetsBucket\)\s*\.upload\(outputObjectPath, finalImageData/);
  assert.match(action, /status: mapGenerationTerminalDecisionToStatus\(terminalDecision\)/);
  assert.match(action, /output_object_path: outputObjectPath/);
  assert.doesNotMatch(action, /IMAGE_GENERATION_WORKER_ENABLED|claim_queued_image_generations/);
});

test("the awaited pipeline reports runner failure without hiding it", async () => {
  const source = await readFile("src/lib/generation/await-generation-pipeline.ts", "utf8");
  assert.match(source, /const result = await runner\(generationId\)/);
  assert.match(source, /return result\.ok/);
  assert.match(source, /catch \(error\)/);
  assert.match(source, /return false/);
});
