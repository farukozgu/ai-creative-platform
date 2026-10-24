import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveCreativeDirectionSnapshot, resolveGenerationInsertResult, serializeGenerationMetadata, toSafeGenerationInsertError } from "../src/lib/generation/generation-create-boundary";
import { awaitGenerationPipeline } from "../src/lib/generation/await-generation-pipeline";

test("successful generation insert immediately awaits the request-driven image pipeline", async () => {
  assert.deepEqual(resolveGenerationInsertResult({ data: { id: "generation-1" }, error: null }), { ok: true, generation: { id: "generation-1" } });
  const source = await readFile("src/app/[locale]/dashboard/projects/[projectId]/generation-actions.ts", "utf8");
  const success = source.indexOf('safeGenerationEvent("create", "insert_success"');
  const pipeline = source.indexOf("awaitGenerationPipeline(generation.id, runQueuedImageGeneration)", success);
  assert.ok(success > 0 && pipeline > success);
  assert.match(source, /getImageGenerationProvider\(queuedGeneration\.provider\)\.generate\(/);
  assert.match(source, /\.from\(generatedAssetsBucket\)\s*\.upload\(outputObjectPath, finalImageData/);
  assert.match(source, /mapGenerationTerminalDecisionToStatus\(terminalDecision\)[\s\S]*?output_bucket_id: generatedAssetsBucket/);
  assert.doesNotMatch(source, /claim_queued_image_generations|execution_lease_token|IMAGE_GENERATION_WORKER_ENABLED/);
});

test("mocked synchronous pipeline stores output on success and reports provider failures", async () => {
  const events: string[] = [];
  const successful = await awaitGenerationPipeline("generation-success", async () => {
    events.push("provider.generate");
    events.push("storage.upload");
    events.push("generation.update:succeeded");
    return { ok: true };
  });
  assert.equal(successful, true);
  assert.deepEqual(events, ["provider.generate", "storage.upload", "generation.update:succeeded"]);

  const failed = await awaitGenerationPipeline("generation-failure", async () => {
    events.push("generation.update:failed");
    return { ok: false };
  });
  assert.equal(failed, false);
  assert.equal(events.at(-1), "generation.update:failed");
});

test("dashboard create supplies an idempotency key and the action reuses a prior submission", async () => {
  const composer = await readFile("src/components/dashboard/creative-composer.tsx", "utf8");
  assert.match(composer, /generationSubmissionId\.current \?\?= crypto\.randomUUID\(\)/);
  assert.match(composer, /generationData\.set\("client_submission_id", generationSubmissionId\.current\)/);
  const action = await readFile("src/app/[locale]/dashboard/projects/[projectId]/generation-actions.ts", "utf8");
  assert.match(action, /typeof submissionId !== "string" \|\| !uuidPattern\.test\(submissionId\)/);
  assert.match(action, /\.eq\("client_submission_id", submissionId\)/);
  assert.match(action, /owner_id: userId,\s*client_submission_id: submissionId/);
});

test("insert failure is explicit, safely logged, and duplicate submission resolves its existing job", async () => {
  const logs: Array<{ message: string; fields: unknown }> = [];
  const result = resolveGenerationInsertResult(
    { data: null, error: { code: "23514", message: "constraint failed sk-secret", details: "Bearer token-value", hint: "check payload" } },
    (message, fields) => logs.push({ message, fields }),
  );
  assert.equal(result.ok, false);
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.message, "[generation-create] insert_failed");
  assert.doesNotMatch(JSON.stringify(logs), /sk-secret|token-value/);
  const source = await readFile("src/app/[locale]/dashboard/projects/[projectId]/generation-actions.ts", "utf8");
  assert.match(source, /if \(insertResult\.error\?\.code === "23505"\)/);
  assert.match(source, /eq\("client_submission_id", submissionId\)/);
  const insertFailure = source.indexOf("const resolvedInsert = resolveGenerationInsertResult(insertResult)");
  assert.match(source.slice(insertFailure, insertFailure + 1200), /message: "creationFailed"/);
  assert.match(source, /return \{ ok: false, message: "generationFailed" \}/);
});

test("missing insert data is treated as a logged database failure", () => {
  const logs: string[] = [];
  const result = resolveGenerationInsertResult({ data: null, error: null }, (message, fields) => logs.push(`${message}:${fields.code}`));
  assert.equal(result.ok, false);
  assert.deepEqual(logs, ["[generation-create] insert_failed:EMPTY_INSERT_RESULT"]);
});

test("all current creation metadata fields remain JSON serializable", () => {
  const metadata = serializeGenerationMetadata({
    preset: { selectedPresetFamily: "apparel-studio", selectedPresentationMode: "ghost_mannequin", resolvedPresentationMode: null, presentationModeSource: "user" },
    model_presentation: "studio", selectedModelPresentation: "studio", resolvedModelPresentation: null,
    referenceAuthority: { referenceOverriddenFields: [], presetPreservedFields: ["physicalSupport"] },
    apparelFitPreservation: { version: "apparel-fit-preservation-v1", applied: true },
    humanRealism: { version: "human-realism-v2", expected: false },
    costTelemetry: { imageGenerationCalls: 0, validationCalls: 0 },
    omittedUndefined: undefined,
  });
  assert.equal((metadata.preset as { selectedPresentationMode: string }).selectedPresentationMode, "ghost_mannequin");
  assert.equal(metadata.model_presentation, "studio");
  assert.equal("omittedUndefined" in metadata, false);
});

test("creative direction snapshot preserves compact user intent instead of rendered provider direction", () => {
  const userDirection = "specific customization";
  const renderedPresetDirection = `${"p".repeat(3990)} User customization: ${userDirection}`;
  assert.equal(resolveCreativeDirectionSnapshot(renderedPresetDirection, userDirection), userDirection);
  assert.equal(resolveCreativeDirectionSnapshot("preset direction", "Preset: Studio"), "Preset: Studio");
  assert.equal(resolveCreativeDirectionSnapshot("Professional creative direction:\nSubject: One adult fashion model\nSystem instructions", userDirection), userDirection);
  assert.equal(resolveCreativeDirectionSnapshot("preset direction", ""), null);
  assert.equal(resolveCreativeDirectionSnapshot("preset direction", "u".repeat(4001)), null);
});

test("generation insert diagnostics expose only bounded database fields", () => {
  assert.deepEqual(toSafeGenerationInsertError({ code: 123, message: "", details: null, hint: "safe" }), { code: null, message: null, details: null, hint: "safe" });
});

test("no branch after insert_start can silently return before insert resolution", async () => {
  const source = await readFile("src/lib/generation/image-worker-service.ts", "utf8");
  const start = source.indexOf('safeGenerationEvent("create", "insert_start"');
  const success = source.indexOf('safeGenerationEvent("create", "insert_success"');
  const section = source.slice(start, success);
  assert.match(section, /resolveGenerationInsertResult\(insertResult\)/);
  assert.match(section, /return \{ ok: false, message: "creationFailed" \}/);
  assert.doesNotMatch(section, /generationError \|\| !generation/);
  assert.match(source, /createPhase === "inserting"\) logGenerationInsertFailure\(error\)/);
});
