import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { orderGenerationImages } from "../src/lib/generation/image-roles";
import { resolveGenerationExecutionPolicy } from "../src/lib/generation/execution-policy/resolve-generation-execution-policy";
import { resolveRepairPlan } from "../src/lib/auto-repair/resolve-repair-plan";
import { buildImageGenerationPromptWithPolicy } from "../src/lib/generation/prompts/build-image-generation-prompt";
import { resolveHumanRealismPolicy } from "../src/lib/human-realism/human-realism-policy";
import type { ProductProfile } from "../src/lib/product-understanding/product-profile";
import type { FidelityValidationResult } from "../src/lib/fidelity-validation/types";

const root = process.cwd();
const generationAction = readFileSync(join(root, "src/lib/generation/image-worker-service.ts"), "utf8");
const provider = readFileSync(join(root, "src/lib/generation/providers/openai-image-provider.ts"), "utf8");
function watchProfile(): ProductProfile {
  return {
    productId: "watch", schemaVersion: 1, analysisVersion: "test", vertical: "watches", subcategory: "watch",
    wearability: "wearable", rigidity: "rigid", materials: ["steel"], dominantColors: ["silver"], productShape: "round watch",
    identityCriticalAttributes: ["watch_type", "primary_color", "materials"],
    visibleBranding: { hasLogo: true, hasReadableText: true, hasArtwork: false, logoRegions: [], textRegions: [], artworkRegions: [] },
    interactionTargets: ["wrist"], allowedTransformations: ["perspective_change"], forbiddenTransformations: ["geometry_redesign"],
    sceneAffinities: { recommendedSceneTags: [], discouragedSceneTags: [] }, confidence: { overall: 1 },
    source: { model: "test", analysisVersion: "test", analyzedAt: "2026-10-04" },
    verticalAttributes: { vertical: "watches", details: {} } as unknown as ProductProfile["verticalAttributes"],
  } as unknown as ProductProfile;
}

test("watch, jewelry, and footwear on-body production paths have no Stage A routing", () => {
  assert.match(generationAction, /strategy: "single_pass"/);
  assert.doesNotMatch(generationAction, /two_stage_identity_placement|placement_stage_a|scene_preparation|placement_safe_recomposition/);
});

test("production generation calls the final provider directly with source-first images", () => {
  assert.doesNotMatch(generationAction, /placement_stage_a|scene_preparation|placement_safe_recomposition|two_stage_identity_placement|usesTwoStagePlacement/);
  assert.match(generationAction, /getImageGenerationProvider\(queuedGeneration\.provider\)\.generate\(\{/);
  assert.match(generationAction, /images: generationImages/);
  assert.match(generationAction, /quality: executionPolicy\.quality/);
  assert.ok(generationAction.indexOf("const result = await withImageLeaseHeartbeat(claim") < generationAction.indexOf("validateGeneratedImageBestEffort({"));
  assert.doesNotMatch(provider, /scene_preparation|identity_placement/);

  const ordered = orderGenerationImages(
    { id: "watch", bucketId: "b", objectPath: "watch", data: Buffer.from("watch"), mimeType: "image/png" },
    [{ id: "reference", bucketId: "b", objectPath: "reference", data: Buffer.from("reference"), mimeType: "image/png" }],
  );
  assert.equal(ordered[0].id, "watch");
  assert.deepEqual(ordered.map(({ role }) => role), ["product_identity_source", "scene_reference"]);
  assert.match(generationAction, /usesReferenceReplacement \? \{ operation: "reference_product_replacement"/);
});

test("watch remains xhigh, uses watch-specific execution reasons, and keeps canonical Human Realism", () => {
  const profile = watchProfile();
  const policy = resolveGenerationExecutionPolicy({ productProfile: profile, hasReference: false, referenceReplacement: false, exactProduct: false, artworkLocalized: false, artworkComplexity: "none", presetConfidence: "high", hasCustomNote: false, ambiguousNote: false, strategy: "watch_on_wrist" });
  assert.equal(policy.quality, "xhigh");
  assert.deepEqual(policy.reasons, ["watch_geometry", "watch_dial_detail", "identity_critical"]);
  assert.equal(policy.reasons.includes("jewelry_geometry"), false);

  const human = resolveHumanRealismPolicy({ strategy: "watch_on_wrist", vertical: "watches" });
  assert.equal(human.applied, true);
  const prompt = buildImageGenerationPromptWithPolicy("premium wrist campaign", "reference_edit", { strategy: "watch_on_wrist", useCase: "watches", visibleHuman: true });
  assert.equal(prompt.layers.humanRealismApplied, true);
  assert.equal(prompt.layers.watchV2Applied, true);
  assert.match(prompt.prompt, /exact watch identity/i);
  assert.match(prompt.prompt, /clearly visible wrist/i);
  assert.match(prompt.prompt, /realistic skin texture, wrist proportions, skin compression and contact/i);
  assert.match(prompt.prompt, /no extra jewelry unless explicitly requested/i);
});

test("actual final image is fidelity-validated and repair remains limited to one attempt", () => {
  assert.match(generationAction, /validateGeneratedImageBestEffort\(/);
  assert.match(generationAction, /if \(repairPlan\.shouldRetry\)/);
  assert.match(generationAction, /executionCounts\.repairCalls = 1/);
  assert.equal((generationAction.match(/performance!?\.measure\("provider_repair"/g) ?? []).length, 1);
  const validation: FidelityValidationResult = { version: "test", status: "fail", retryRecommended: true, commerciallyUsable: false, summary: "identity issue", checks: [], severity: "critical", issues: [{ code: "watch_dial_structure_changed", category: "product_identity", severity: "critical", finding: "wrong dial", expected: "source dial", sourceAuthoritative: true }] };
  assert.equal(resolveRepairPlan(validation).shouldRetry, true);
});
