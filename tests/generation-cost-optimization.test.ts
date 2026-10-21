import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createCostTelemetry } from "../src/lib/generation/cost-telemetry";
import { buildGenerationFailureTelemetry } from "../src/lib/generation/failure-telemetry";
import { readReferenceAnalysisCache } from "../src/lib/generation/references/reference-analysis-cache";

const styleBrief = {
  visualIntent: "Clean editorial", composition: { framing: "close", cameraAngle: "eye-level", cameraDistance: "near", subjectPlacement: "center" },
  lighting: { character: "soft", direction: "side", flashBehavior: null, ambientExposure: "balanced", contrast: "medium" }, environment: { setting: "studio", architecturalCharacter: null, surfaceCharacter: "matte" },
  color: { palette: "neutral", grading: "natural", saturation: "restrained" }, texture: { grain: "fine", sharpness: "natural", retouching: "minimal" }, depthOfField: "moderate", poseLanguage: null, realismCharacter: "photographic",
};

test("cost telemetry produces deterministic external call counts", () => {
  const scenarios = [
    { name: "one image pass", products: 1, references: 0, referenceCalls: 0, generations: 1, validations: 1, repairs: 0, total: 2 },
    { name: "four-view pass", products: 4, references: 0, referenceCalls: 0, generations: 1, validations: 1, repairs: 0, total: 2 },
    { name: "four-view reference pass", products: 4, references: 1, referenceCalls: 1, generations: 1, validations: 1, repairs: 0, total: 3 },
    { name: "targeted repair", products: 1, references: 0, referenceCalls: 0, generations: 1, validations: 2, repairs: 1, total: 4 },
    { name: "validation unavailable", products: 1, references: 0, referenceCalls: 0, generations: 1, validations: 1, repairs: 0, total: 2 },
  ];
  for (const scenario of scenarios) {
    const telemetry = createCostTelemetry({ productUnderstandingCalls: 0, referenceAnalysisCalls: scenario.referenceCalls, imageGenerationCalls: scenario.generations, validationCalls: scenario.validations, repairGenerationCalls: scenario.repairs, inputProductImageCount: scenario.products, inputReferenceCount: scenario.references, repairAttempted: scenario.repairs === 1, finalOutcome: scenario.name === "validation unavailable" ? "unverified" : "succeeded", validationOutcome: scenario.name === "validation unavailable" ? "validation_unavailable" : "pass" });
    assert.equal(telemetry.totalExternalAICalls, scenario.total, scenario.name);
  }
});

test("repair attempts are counted once as repair generation, including failed provider attempts", () => {
  const telemetry = createCostTelemetry({ productUnderstandingCalls: 0, referenceAnalysisCalls: 0, imageGenerationCalls: 1, validationCalls: 1, repairGenerationCalls: 1, inputProductImageCount: 1, inputReferenceCount: 0, repairAttempted: true, finalOutcome: "failed", validationOutcome: "not_completed" });
  assert.equal(telemetry.imageGenerationCalls, 1);
  assert.equal(telemetry.repairGenerationCalls, 1);
  assert.equal(telemetry.totalExternalAICalls, 3);
});

test("failure telemetry retains attempted calls, measured stages, and known input counts", () => {
  const telemetry = buildGenerationFailureTelemetry({
    executionCounts: { imageGenerationCalls: 2, visionValidationCalls: 1, promptEnhancementCalls: 1, productAnalysisCalls: 1, referenceAnalysisCalls: 0, artworkAnalysisCalls: 0, segmentationCalls: 0, projectionAnalysisCalls: 0, repairCalls: 1 },
    inputProductImageCount: 2,
    inputReferenceCount: 1,
    stageDurations: { asset_load: 12, provider_initial: 40, total: 65 },
  });
  assert.equal(telemetry.costTelemetry.totalExternalAICalls, 5);
  assert.equal(telemetry.costTelemetry.imageGenerationCalls, 1);
  assert.equal(telemetry.costTelemetry.repairGenerationCalls, 1);
  assert.equal(telemetry.costTelemetry.inputProductImageCount, 2);
  assert.equal(telemetry.costTelemetry.inputReferenceCount, 1);
  assert.equal(telemetry.execution.totalDurationMs, 65);
  assert.deepEqual(telemetry.execution.stages, { asset_load: 12, provider_initial: 40, total: 65 });
});

test("failure telemetry represents input counts as unknown before assets load", () => {
  const telemetry = buildGenerationFailureTelemetry({
    executionCounts: { imageGenerationCalls: 0, visionValidationCalls: 0, promptEnhancementCalls: 0, productAnalysisCalls: 0, referenceAnalysisCalls: 0, artworkAnalysisCalls: 0, segmentationCalls: 0, projectionAnalysisCalls: 0, repairCalls: 0 },
    inputProductImageCount: null,
    inputReferenceCount: null,
  });
  assert.equal(telemetry.costTelemetry.inputProductImageCount, null);
  assert.equal(telemetry.costTelemetry.inputReferenceCount, null);
  assert.equal(telemetry.execution.totalDurationMs, undefined);
});

test("reference cache requires the same ordered assets, model, and version", () => {
  const cache = { version: 1, model: "vision-mini", orderedAssetIds: ["reference-1", "reference-2"], styleBrief, analyzedAt: "2026-10-09T00:00:00.000Z" };
  assert.ok(readReferenceAnalysisCache(cache, { version: 1, model: "vision-mini", orderedAssetIds: ["reference-1", "reference-2"] }));
  assert.equal(readReferenceAnalysisCache(cache, { version: 1, model: "vision-mini", orderedAssetIds: ["reference-2", "reference-1"] }), null);
  assert.equal(readReferenceAnalysisCache(cache, { version: 2, model: "vision-mini", orderedAssetIds: ["reference-1", "reference-2"] }), null);
});

test("multi-view registration analyzes only the primary product", async () => {
  const source = await readFile("src/app/[locale]/dashboard/projects/[projectId]/actions.ts", "utf8");
  assert.match(source, /if \(asset\.product_role === "primary"\)[\s\S]*triggerProductAnalysisAfterRegistration/);
  assert.match(source, /Supporting views are[\s\S]*identity evidence/);
});

test("validation-unavailable Image Edit is retained as unverified", async () => {
  const source = await readFile("src/lib/generation/image-worker-service.ts", "utf8");
  assert.match(source, /validateImageEditBestEffort/);
  assert.match(source, /validation\.status === "validation_unavailable" \? "unverified"/);
});
