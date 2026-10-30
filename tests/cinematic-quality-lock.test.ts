import { directorProductContext } from "../src/lib/video-director/product-context";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compileDirectorPlan, fallbackDirectorPlan, parseDirectorOutput, type VideoDirectorInput, type VideoDirectorPlan } from "../src/lib/video-director/core";
import type { ProductProfile } from "../src/lib/product-understanding/product-profile";
import { directorCacheKey, openDirectorPlan, sealDirectorPlan } from "../src/lib/video-director/receipt";
import { protectedPresetFingerprints } from "./fixtures/preset-quality-baseline";
import { VideoProductionHarness } from "./fixtures/video-production-harness";
import { mapProductAnalysisModelOutput } from "../src/lib/product-understanding/product-analysis-model-output";

test("successful knitwear Cinematic plan recompiles to every persisted prompt hash and negative prompt", () => {
  const fixture = JSON.parse(readFileSync("tests/fixtures/cinematic-knitwear-success.json", "utf8")) as {
    profile: ProductProfile; draft: VideoDirectorInput["draft"]; plan: VideoDirectorPlan;
    compiled: ReturnType<typeof compileDirectorPlan>; promptHashes: string[];
  };
  const input: VideoDirectorInput = { profile: fixture.profile, draft: fixture.draft, presetId: "cinematic-hero", shotMode: "multi" };
  const compiled = compileDirectorPlan(fixture.plan, input);
  assert.deepEqual(compiled, fixture.compiled);
  assert.deepEqual(compiled.multiPrompt!.map(shot => createHash("sha256").update(shot.prompt).digest("hex")), fixture.promptHashes);
  assert.deepEqual(fallbackDirectorPlan(input), fixture.plan);
  const key = directorCacheKey("owner", "source", "gpt-4o-mini", input);
  const receipt = sealDirectorPlan(key, fixture.plan, "test-only-secret", 1000, fixture.profile);
  assert.ok(openDirectorPlan(receipt, key, input, "test-only-secret", 2000));
  assert.equal(openDirectorPlan(receipt, key, input, "test-only-secret", 3601000), null);
  const obsolete = { ...fixture.plan, identityEvidence: { version: "product-identity-evidence-v1", details: [] } };
  assert.equal(parseDirectorOutput(obsolete, input), null);
  assert.equal(openDirectorPlan(sealDirectorPlan(key, obsolete, "test-only-secret", 1000, fixture.profile), key, input, "test-only-secret", 2000), null);
});

test("Cinematic and all 20 other untouched presets retain their pre-change output and cache fingerprints", async () => {
  const expected = JSON.parse(readFileSync("tests/fixtures/protected-preset-fingerprints.json", "utf8"));
  assert.deepEqual(await protectedPresetFingerprints(), expected);
});

test("a logo detail reference adds available evidence without replacing Cinematic's five creative beats", async () => {
  const fixture = JSON.parse(readFileSync("tests/fixtures/cinematic-knitwear-success.json", "utf8")) as {
    profile: ProductProfile; draft: VideoDirectorInput["draft"]; plan: VideoDirectorPlan;
  };
  const original: VideoDirectorInput = { profile: fixture.profile, draft: fixture.draft, presetId: "cinematic-hero", shotMode: "multi" };
  const logoProfile: ProductProfile = { ...structuredClone(fixture.profile), productShape: "embroidered text",
    identityCriticalAttributes: [{ attribute: "ivory embroidered text", rationale: "visible detail", regions: [] }] };
  const input: VideoDirectorInput = { ...original, referenceImages: [{ prepared: Buffer.alloc(0), sourceSha256: "a".repeat(64), profile: logoProfile, purpose: "logo" }],
    draft: { ...original.draft, productReferences: [{ source: { kind: "uploaded-image", sourceAssetId: "10000000-0000-4000-8000-000000000009" }, sha256: "a".repeat(64), purpose: "logo", aspectRatio: "1:1" }] } };
  const fallback = fallbackDirectorPlan(input);
  assert.deepEqual(fallback.shots, fixture.plan.shots);
  assert.equal(fallback.shots.length, 5);
  assert.deepEqual(fallback.shots.map(s => s.purpose), ["hero-reveal", "material-study", "controlled-motion", "macro-detail", "final-hero"]);
  assert.ok(fallback.shots.every(s => !/embroider|logo|letter|text\b/i.test(s.focus)));
  for (const durationSeconds of [5, 10] as const) for (const shotMode of ["single", "multi"] as const) {
    const base = { ...original, shotMode, draft: { ...original.draft, durationSeconds, shotMode } };
    const withLogo = { ...input, shotMode, draft: { ...input.draft, durationSeconds, shotMode } };
    assert.deepEqual(fallbackDirectorPlan(withLogo).shots, fallbackDirectorPlan(base).shots);
  }
  // Authored model response: verify the parser/compiler preserves directing.
  // This is not a claim about an unexecuted live OpenAI response.
  const plan = parseDirectorOutput({ ...fixture.plan, origin: "ai", referenceReviews: [{ index: 0, status: "matched", view: "detail",
    reason: "Matching green knit and ivory chest embroidery", details: ["ivory embroidered text"] }] }, input);
  assert.ok(plan);
  assert.deepEqual(plan.shots, fixture.plan.shots);
  const logoTarget = { ...plan, shots: plan.shots.map((shot, index) => index === 2 ? { ...shot, focus: "ivory embroidered text", evidenceRefs: [directorProductContext(fixture.profile).evidence.length], referenceIndex: 0 } : shot) };
  assert.equal(parseDirectorOutput(logoTarget, input), null);
  assert.equal(parseDirectorOutput({ ...logoTarget, shots: logoTarget.shots.map(({ referenceIndex: _referenceIndex, ...shot }) => { void _referenceIndex; return shot; }) }, input), null);
  const key = directorCacheKey("owner", "source", "gpt-4o-mini", input);
  assert.equal(openDirectorPlan(sealDirectorPlan(key, logoTarget, "test", 1000, input.profile), key, input, "test", 2000), null);
  const compiled = compileDirectorPlan(plan, input);
  assert.equal(compiled.multiPrompt!.length, 5);
  assert.ok(compiled.multiPrompt!.every(s => s.prompt.startsWith("@Element1") && s.prompt.length <= 512));
  assert.equal(compiled.negativePrompt, compileDirectorPlan(fixture.plan, original).negativePrompt);
  const originalCompiled = compileDirectorPlan(fixture.plan, original);
  assert.ok(compiled.multiPrompt!.every((s, index) => {
    const originalPrompt = originalCompiled.multiPrompt![index].prompt;
    const creative = originalPrompt.slice(0, originalPrompt.indexOf("Keep source geometry"));
    return s.prompt === "@Element1: " + creative + "Exact form/color/material/pattern/parts/text/logos/art & layout/ratios; no guesses. Known faces only.";
  }));
  const harness = await VideoProductionHarness.create();
  const request = harness.directorRequest(input);
  assert.match(request.instructions, /preservation only; no focus, zoom or extra shots/);
  const context = JSON.parse(request.context);
  assert.deepEqual(context.allowedEvidence, JSON.parse(harness.directorRequest(original).context).allowedEvidence);
  assert.ok(context.referenceImages[0].existingProfile.evidence.some((item: { detail: string }) => item.detail === "ivory embroidered text"));
  assert.equal("identityPreservation" in context, false);
  assert.equal("identity" in request.schema.properties, false);
  assert.doesNotMatch(request.instructions, /Inventory visible identity|marksVisible|exactText/);
});

test("Product Understanding no longer converts the removed inventory into logo focus regions", () => {
  const output = mapProductAnalysisModelOutput({ status: "supported", vertical: "apparel", rawCategory: "sweater", subcategory: null, unsupportedReason: "",
    profile: { vertical: "apparel", confidence: 0.95, visibleProductCount: 1, identitySummary: ["green with a white collar"], sourceObservations: [],
      material: null, silhouette: "loose fit", closure: null, interactionRules: [], subcategory: null,
      identity: { details: [{ kind: "text", appearance: "embroidered text", exactText: "KLAY", location: "chest" }] } } },
  { assetId: "10000000-0000-4000-8000-000000000001", model: "offline", analyzedAt: "2026-10-30" });
  assert.ok(output && !("status" in output));
  if (output && !("status" in output)) {
    assert.equal("identity" in output, false);
    assert.deepEqual(output.visibleBranding, { hasLogo: null, hasReadableText: null, hasArtwork: null, logoRegions: [], textRegions: [], artworkRegions: [] });
    const fixture = JSON.parse(readFileSync("tests/fixtures/cinematic-knitwear-success.json", "utf8")) as { draft: VideoDirectorInput["draft"]; plan: VideoDirectorPlan };
    assert.deepEqual(fallbackDirectorPlan({ profile: output, draft: fixture.draft, presetId: "cinematic-hero", shotMode: "multi" }).shots, fixture.plan.shots);
  }
});
