import { writeFileSync } from "node:fs";
import { durationAwarePresetIds, durationStrategy } from "../src/lib/video-director/duration-strategy";
import { compileDirectorPlan, fallbackDirectorPlan } from "../src/lib/video-director/core";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { directorFixtureInput, directorProducts } from "../tests/fixtures/video-director-fixtures";

// Offline only. These are synthetic evidence fixtures and deterministic fallback
// plans, not vision findings or paid OpenAI/Kling responses.
const profile = directorProducts.find(product => product.productId === "bag")!;
const base = directorFixtureInput(profile);
const matrix = durationAwarePresetIds.flatMap(presetId => [5, 10, 15].flatMap(duration =>
  (["single", "multi"] as const).map(mode => ({ presetId, ...durationStrategy(presetId, mode, duration)! }))));
const examples = durationAwarePresetIds.flatMap(presetId => ([5, 10] as const).flatMap(durationSeconds =>
  (["single", "multi"] as const).map(shotMode => {
    const input = { ...base, presetId, shotMode, draft: { ...base.draft, shotMode, durationSeconds } };
    const plan = fallbackDirectorPlan(input);
    const compiled = compileDirectorPlan(plan, input);
    return { presetId, durationSeconds, shotMode, plan,
      payload: buildFalVideoRequestInput({ ...input.draft, ...compiled, endpointId: "fixture",
        modelId: "kling-v3-standard-image", sourceUrl: "https://invalid.example/synthetic-source" }) };
  })));
writeFileSync("docs/video-duration-examples.json", JSON.stringify({
  provenance: "Offline synthetic bag fixture; fallback plans compiled by the production compiler; no API calls.",
  productEvidenceFixture: profile, matrix, examples,
}, null, 2) + "\n");
console.log(`Exported ${matrix.length} creative cells and ${examples.length} validated Kling payloads.`);
