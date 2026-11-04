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

test("unaffected preset modes retain pre-Window-Display output including completed golden presets", () => {
  const results = [];
  for (const presetId of videoPresetIds) for (const shotMode of ["single", "multi"] as const)
    for (const durationSeconds of [5, 10] as const) {
      if (presetId === "window-display" && shotMode === "multi" && durationSeconds === 10) continue;
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
  // Baseline captured before Window Display; includes all seven completed golden presets.
  assert.equal(createHash("sha256").update(JSON.stringify(results)).digest("hex"), "73de170e98bdc57e7a58d2640f48f033fbf671071062e816f0f61166083e8ef2");
});
