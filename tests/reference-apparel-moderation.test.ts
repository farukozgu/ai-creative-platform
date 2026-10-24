import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildReferenceReplacementPrompt } from "../src/lib/generation/image-roles";
import { getCreativePreset, getPresetFamily, getPresetPresentationMode } from "../src/lib/creative-presets/creative-presets";
import { getPresentationModeContract } from "../src/lib/creative-presets/presentation-mode-contracts";
import { buildImageGenerationPromptWithPolicy } from "../src/lib/generation/prompts/build-image-generation-prompt";
import { applyCommercialFashionSafetyLayer, commercialFashionSafetyContext, normalizeCommercialFashionPrompt, resolveCommercialFashionSafetyLayer } from "../src/lib/generation/prompts/commercial-fashion-normalizer";
import { finalizeCommercialFashionProviderPrompt } from "../src/lib/generation/prompts/commercial-fashion-normalizer";
import { createModerationInputSummary } from "../src/lib/generation/moderation-input-summary";
import { orderReferenceReplacementImages } from "../src/lib/generation/image-roles";
import { normalizeProductVertical } from "../src/lib/product-understanding/product-analysis-model-output";
import { resolveReferenceGenerationPath } from "../src/lib/generation/references/reference-product-replacement";
import { resolveGenerationStrategy } from "../src/lib/generation/strategy/generation-strategy";
import { mergeProviderFailureMetadata } from "../src/lib/generation/providers/merge-provider-failure-metadata";

test("standard dress categories remain apparel and never require an intimates route", () => {
  for (const category of ["dress", "fitted dress", "mini dress", "evening dress", "bodycon dress"]) {
    assert.equal(normalizeProductVertical(category), "apparel", category);
  }
});

test("ordinary on-model apparel receives concise commercial non-explicit context", () => {
  const prompt = buildImageGenerationPromptWithPolicy("night editorial", "reference_edit", {
    strategy: "fashion_on_model", useCase: "apparel", visibleHuman: true,
  }).prompt;
  assert.match(prompt, /non-explicit commercial fashion photograph/i);
  assert.match(prompt, /clearly adult model/i);
  assert.match(prompt, /HUMAN REALISM V2/);
});

test("commercial normalization neutralizes ambiguous reference wording without removing garment identity", () => {
  const normalized = normalizeCommercialFashionPrompt("sensual pose with body emphasis and exposed skin emphasis; preserve garment logo, print placement, color, and silhouette.");
  assert.match(normalized, /editorial pose/i);
  assert.match(normalized, /garment fit and silhouette/i);
  assert.match(normalized, /normal fashion styling/i);
  assert.doesNotMatch(normalized, /sensual pose|body emphasis|exposed skin emphasis/i);
  assert.match(normalized, /garment logo, print placement, color, and silhouette/i);
});

test("reference apparel replacement keeps base pose and camera authority while adding commercial context", () => {
  const prompt = buildReferenceReplacementPrompt(
    normalizeCommercialFashionPrompt("sensual pose, preserve source dress identity"),
    { commercialFashionSafetyContext },
  );
  assert.match(prompt, /Preserve its composition, subject, pose, anatomy, framing, camera/i);
  assert.match(prompt, /non-explicit commercial fashion photograph/i);
  assert.match(prompt, /editorial pose/i);
  assert.match(prompt, /source dress identity/i);
});

test("commercial apparel reference path has no generated sexualized terminology", () => {
  const prompt = buildReferenceReplacementPrompt(
    normalizeCommercialFashionPrompt("provocative pose with body contour emphasis"),
    { commercialFashionSafetyContext },
  );
  assert.doesNotMatch(prompt, /\b(?:sensual|provocative|sexualized)\b/i);
});

test("moderation failures remain terminal and do not add a generation retry", async () => {
  const source = await readFile("src/app/[locale]/dashboard/projects/[projectId]/generation-actions.ts", "utf8");
  const providerRequest = source.indexOf('safeGenerationEvent("provider", "request_start"');
  const repairBranch = source.indexOf("if (repairPlan.shouldRetry)");
  const providerFailure = source.indexOf('safeGenerationEvent("queue", "provider_error"');
  assert.ok(providerRequest >= 0 && repairBranch > providerRequest && providerFailure > repairBranch);
  assert.match(source, /providerModerationBlocked \? "provider_moderation_blocked"/);
  assert.match(source, /retryable: providerModerationBlocked \? false : retryable/);
  assert.doesNotMatch(source.slice(providerFailure), /provider_repair/);
});

test("provider failure diagnostics preserve direct-reference metadata", () => {
  const existing = { references: { mode: "match", requested_count: 1, primaryReferenceId: "reference" } };
  const merged = mergeProviderFailureMetadata(existing, { category: "generation_failed", code: null, status: null, providerDecision: "provider_error", klayClassification: "unsupported", providerFalsePositiveCandidate: false });
  assert.deepEqual(merged.references, existing.references);
  assert.deepEqual(merged.providerFailure, { category: "generation_failed", code: null, status: null, providerDecision: "provider_error", klayClassification: "unsupported", providerFalsePositiveCandidate: false });
});

test("actual intimates wording is not rewritten by the commercial normalizer", () => {
  const prompt = "adult commercial underwear campaign with source garment identity";
  assert.equal(normalizeCommercialFashionPrompt(prompt), prompt);
});

test("every human apparel preset family resolves through the shared reference-replacement safety layer", () => {
  for (const { familyId, presetId, presentationMode } of [
    { familyId: "apparel-street", presetId: "apparel-street-style", presentationMode: "walking" },
    { familyId: "apparel-scenic", presetId: "apparel-scenic-editorial", presentationMode: "architectural_model" },
    { familyId: "apparel-studio", presetId: "apparel-studio-style", presentationMode: "model_studio" },
  ]) {
    const family = getPresetFamily(familyId);
    const preset = getCreativePreset(presetId);
    const mode = getPresetPresentationMode(familyId, presentationMode);
    const contract = getPresentationModeContract(familyId, presentationMode);
    assert.ok(family && preset && mode && contract, familyId);
    const strategy = resolveGenerationStrategy({
      preset,
      presetFamilyId: family.id,
      presentationMode: mode.id,
      presentationHumanPresence: contract.humanPresence,
      hasReference: true,
      userPrompt: "",
      explicitUserPrompt: "",
    }).strategy;
    const path = resolveReferenceGenerationPath({ compatibleReferenceCount: 1, referenceCompatible: true, fallbackStrategy: strategy });
    const layer = resolveCommercialFashionSafetyLayer({ vertical: "apparel", requiresCommercialFashionSafety: true });
    assert.equal(strategy, "fashion_on_model", familyId);
    assert.deepEqual(path, { strategy: "reference_product_replacement" }, familyId);
    assert.equal(layer.applied, true, familyId);
    assert.match(layer.context, /non-explicit commercial fashion photograph/i);
  }
});

test("apparel-scenic architectural model exact route resolves to safe reference replacement", () => {
  const path = resolveReferenceGenerationPath({ compatibleReferenceCount: 1, referenceCompatible: true, fallbackStrategy: "fashion_on_model" });
  const layer = applyCommercialFashionSafetyLayer("provocative pose; preserve source jacket identity", { vertical: "apparel", requiresCommercialFashionSafety: true });
  assert.deepEqual(path, { strategy: "reference_product_replacement" });
  assert.equal(layer.applied, true);
  assert.match(layer.prompt, /editorial pose/i);
});

test("shared layer applies with prompt enhancement enabled or disabled and without a reference", () => {
  for (const direction of ["", "enhanced reference direction with sensual pose"]) {
    const layer = applyCommercialFashionSafetyLayer(direction, { vertical: "apparel", requiresCommercialFashionSafety: true });
    assert.equal(layer.applied, true);
    assert.doesNotMatch(layer.prompt, /sensual pose/i);
  }
});

test("reference-derived ambiguous wording is neutralized without changing composition authority", () => {
  const input = "intimate portrait; chest emphasis; camera angle low; framing close-up; architectural environment";
  const layer = applyCommercialFashionSafetyLayer(input, { vertical: "apparel", requiresCommercialFashionSafety: true });
  assert.doesNotMatch(layer.prompt, /intimate portrait|chest emphasis/i);
  assert.match(layer.prompt, /camera angle low; framing close-up; architectural environment/i);
});

test("final normalizer runs after Human Realism and apparel fit fragments", async () => {
  const source = await readFile("src/lib/generation/image-worker-service.ts", "utf8");
  const replacement = source.indexOf("buildReferenceReplacementPrompt(providerCreativeDirection");
  const humanRealism = source.indexOf("compileHumanRealismPrompt(humanRealismPolicy", replacement);
  const apparelFit = source.indexOf("compileApparelFitPreservationPrompt(apparelFitPolicy", humanRealism);
  const finalNormalizer = source.indexOf("finalizeCommercialFashionProviderPrompt(activePrompt", apparelFit);
  const providerCall = source.indexOf("getImageGenerationProvider(queuedGeneration.provider).generate", finalNormalizer);
  assert.ok(replacement >= 0 && humanRealism > replacement && apparelFit > humanRealism);
  assert.ok(finalNormalizer > apparelFit && providerCall > finalNormalizer);
});

test("final boundary normalizes reference free text after all fragments without changing user note or product identity", () => {
  const userNote = "keep the cobalt backdrop";
  const identity = "preserve source garment logo and silhouette";
  const assembled = [`Reference pose: provocative pose with chest emphasis`, `Human Realism: exposed skin emphasis`, identity, userNote].join("\n");
  const result = finalizeCommercialFashionProviderPrompt(assembled, { vertical: "apparel", requiresCommercialFashionSafety: true });
  assert.doesNotMatch(result.prompt, /provocative pose|chest emphasis|exposed skin emphasis/i);
  assert.match(result.prompt, new RegExp(userNote));
  assert.match(result.prompt, new RegExp(identity));
});

test("reference replacement image roles are deterministic and cannot swap", () => {
  const asset = (id: string) => ({ id, bucketId: "assets", objectPath: `${id}.png`, data: Buffer.from(id), mimeType: "image/png" });
  const images = orderReferenceReplacementImages(asset("reference"), asset("product"));
  assert.deepEqual(images.map(({ role, order, id }) => ({ role, order, id })), [
    { role: "reference_base_scene", order: 0, id: "reference" },
    { role: "product_identity_source", order: 1, id: "product" },
  ]);
});

test("moderation diagnostics expose counts and flags but no image or prompt contents", () => {
  const asset = (id: string) => ({ id, bucketId: "assets", objectPath: `${id}.png`, data: Buffer.from("PRIVATE_IMAGE"), mimeType: "image/png" });
  const summary = createModerationInputSummary({
    images: orderReferenceReplacementImages(asset("reference"), asset("product")),
    humanReferenceDetected: true,
    commercialSafetyApplied: true,
    referenceFreeTextIncluded: true,
  });
  assert.deepEqual(summary, {
    productImageCount: 1,
    referenceImageCount: 1,
    humanReferenceDetected: true,
    commercialSafetyApplied: true,
    finalNormalizerAppliedAfterAllFragments: true,
    referenceFreeTextIncluded: true,
  });
  assert.doesNotMatch(JSON.stringify(summary), /PRIVATE_IMAGE|prompt|image\/png/);
});

test("apparel reference replacement uses one provider request and keeps moderation terminal", async () => {
  const source = await readFile("src/app/[locale]/dashboard/projects/[projectId]/generation-actions.ts", "utf8");
  const initial = source.indexOf('safeGenerationEvent("provider", "request_start"');
  const initialRequest = source.indexOf('performance.measure("provider_initial"', initial);
  const repairBranch = source.indexOf("if (repairPlan.shouldRetry)", initial);
  const failure = source.indexOf('safeGenerationEvent("queue", "provider_error"');
  assert.ok(initial >= 0 && initialRequest > initial && repairBranch > initialRequest && failure > repairBranch);
  assert.match(source.slice(failure), /return \{ ok: false, message: "generationFailed", retryable/);
});
