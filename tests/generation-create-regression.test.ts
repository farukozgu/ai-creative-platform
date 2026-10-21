import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveCreativeDirectionSnapshot, resolveGenerationInsertResult, serializeGenerationMetadata, toSafeGenerationInsertError } from "../src/lib/generation/generation-create-boundary";

test("successful generation insert accepts a durable queued job without synchronous dispatch", async () => {
  assert.deepEqual(resolveGenerationInsertResult({ data: { id: "generation-1" }, error: null }), { ok: true, generation: { id: "generation-1" } });
  const source = await readFile("src/lib/generation/image-worker-service.ts", "utf8");
  const success = source.indexOf('safeGenerationEvent("create", "insert_success"');
  const queued = source.indexOf('safeGenerationEvent("queue", "created"');
  assert.ok(success > 0 && queued > success);
  assert.doesNotMatch(source, /await dispatchQueuedGeneration\(generation\.id\)/);
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
  const source = await readFile("src/lib/generation/image-worker-service.ts", "utf8");
  assert.match(source, /if \(insertResult\.error\?\.code === "23505"\)/);
  assert.match(source, /eq\("client_submission_id", submissionId\)/);
  assert.doesNotMatch(source, /await dispatchQueuedGeneration/);
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
