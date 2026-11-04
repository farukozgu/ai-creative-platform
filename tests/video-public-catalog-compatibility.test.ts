import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { videoStudioPresetIds } from "../src/features/video/video-preset-catalog";
import { compileDirectorPlan, fallbackDirectorPlan } from "../src/lib/video-director/core";
import { isVideoPresetId, videoPresetIds } from "../src/lib/video-director/presets";
import { openDirectorPlan, sealDirectorPlan } from "../src/lib/video-director/receipt";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";

test("hidden legacy preset IDs still compile and open existing receipts", () => {
  const input = { ...directorFixtureInput(directorProducts[0]), presetId: "luxury-fashion-film" as const };
  assert.ok(!videoStudioPresetIds.some(id => (id as string) === input.presetId));
  assert.ok(isVideoPresetId(input.presetId));
  const plan = fallbackDirectorPlan(input);
  const receipt = sealDirectorPlan("legacy-job", plan, "offline-test-secret", 1000);
  const restored = openDirectorPlan(receipt, "legacy-job", input, "offline-test-secret", 1001);
  assert.ok(restored);
  assert.deepEqual(compileDirectorPlan(restored, input), compileDirectorPlan(plan, input));
});

test("all preset modes retain pre-surface-alignment director and Kling output", () => {
  const results = [];
  for (const presetId of videoPresetIds) for (const shotMode of ["single", "multi"] as const)
    for (const durationSeconds of [5, 10] as const) {
      assert.ok(isVideoPresetId(presetId));
      const base = directorFixtureInput(directorProducts[0]);
      const input = { ...base, presetId, shotMode, draft: { ...base.draft, shotMode, durationSeconds } };
      const plan = fallbackDirectorPlan(input);
      let output;
      try {
        const compiled = compileDirectorPlan(plan, input);
        output = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: "kling-v3-standard-image",
          endpointId: "offline-fixture", sourceUrl: "https://invalid.example/source" });
      } catch (error) {
        // Preserve existing validation failures too; this task only locks the product surface.
        output = { error: error instanceof Error ? error.message : String(error) };
      }
      results.push({ presetId, shotMode, durationSeconds, plan, output });
    }
  // Baseline captured before surface alignment; includes all eight golden presets and legacy modes.
  assert.equal(createHash("sha256").update(JSON.stringify(results)).digest("hex"), "e07709a64c3a5220eb8ec6708442d71c46110981ca393fad4079921d9335d9ad");
});
