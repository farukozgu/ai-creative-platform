import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { VIDEO_DIRECTOR_VERSION, videoDirectorPresets, videoPresetIds, legacyVideoPresetIds } from "../src/lib/video-director/presets";
import { DIRECTOR_CONTRACT_VERSION } from "../src/lib/video-director/plan-contract";
import { videoDraftHash } from "../src/lib/video-generation/request-identity";
import { videoCategories, riskAlternatives } from "../src/lib/video-director/preset-contract";
import { presetProduct, recommendVideoPresets } from "../src/lib/video-director/preset-recommendations";
import { directorProductContext } from "../src/lib/video-director/product-context";
import { compileDirectorPlan, fallbackDirectorPlan, parseDirectorOutput, type VideoDirectorInput } from "../src/lib/video-director/core";
import { cinematicHeroSingleFiveSeconds, cinematicHeroSingleNegativeTerms } from "../src/lib/video-director/preset-library";
import { productVideoNegativePrompt } from "../src/lib/video-generation/preservation";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { summarizeVideoPayload } from "../src/lib/video-generation/payload-summary";
import { directorProducts, directorFixtureInput } from "./fixtures/video-director-fixtures";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";
import { directorCacheKey, openDirectorPlan, sealDirectorPlan } from "../src/lib/video-director/receipt";

test("cinematic-hero single 5s validates steady framing and stationary product through Kling payload", () => {
  const base = directorFixtureInput(directorProducts[0]);
  const input: VideoDirectorInput = { ...base, presetId: "cinematic-hero", shotMode: "single",
    draft: { ...base.draft, shotMode: "single", durationSeconds: 5 } };
  const plan = fallbackDirectorPlan(input);
  const oldCacheKey = (selected: VideoDirectorInput) => createHash("sha256").update(JSON.stringify({
    ownerId: "owner", sourceSha256: "hash", model: "fixture", version: VIDEO_DIRECTOR_VERSION,
    contractVersion: DIRECTOR_CONTRACT_VERSION, preset: videoDirectorPresets[selected.presetId], presetId: selected.presetId,
    shotMode: selected.shotMode, profile: { ...selected.profile, source: { ...selected.profile!.source, analyzedAt: undefined } },
    draft: videoDraftHash({ ...selected.draft, director: undefined }),
  })).digest("hex");
  assert.notEqual(directorCacheKey("owner", "hash", "fixture", input), oldCacheKey(input));
  assert.ok(parseDirectorOutput(plan, input));
  for (const [field, value] of Object.entries(cinematicHeroSingleFiveSeconds)) {
    assert.ok(value.length <= 100, field);
    assert.equal(plan.shots[0][field as keyof typeof cinematicHeroSingleFiveSeconds], value);
  }
  const compiled = compileDirectorPlan(plan, input);
  const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: "kling-v3-standard-image",
    endpointId: "fixture", sourceUrl: "https://invalid.example/source" });
  assert.match(payload.prompt!, /level, stable horizon/);
  assert.match(payload.prompt!, /product stays still/);
  assert.match(payload.prompt!, /wide clean margins on all sides/);
  assert.ok(payload.prompt!.length <= 2500);
  assert.equal(payload.cfg_scale, 0.5);
  assert.equal(payload.duration, "5");
  assert.equal(payload.multi_prompt, undefined);
  assert.equal(payload.negative_prompt, `${productVideoNegativePrompt.replace("object rotation, ", "")}, ${cinematicHeroSingleNegativeTerms}`);

  // Product stays still is excluded from camera classification; fixed horizon is not.
  for (const replacement of [
    { camera: "Slow steady push-in on a level, fixed horizon" },
    { lighting: "A soft highlight glides slowly across the surface as the camera moves" },
  ]) {
    let reason = "";
    assert.equal(parseDirectorOutput({ ...plan, shots: [{ ...plan.shots[0], ...replacement }] }, input,
      failure => { reason = failure.reasonCode; }), null);
    assert.equal(reason, "conflicting_camera_directions");
  }

  for (const presetId of videoPresetIds) for (const shotMode of ["single", "multi"] as const)
    for (const durationSeconds of [5, 10] as const) {
      if (presetId === "cinematic-hero" && shotMode === "single" && durationSeconds === 5) continue;
      const other = { ...input, presetId, shotMode, draft: { ...input.draft, shotMode, durationSeconds } };
      const otherPlan = fallbackDirectorPlan(other);
      const changed = ["cinematic-hero", "macro-detail-reveal", "luxury-fashion-film", "material-detail", "product-spotlight"].includes(presetId);
      assert.equal(directorCacheKey("owner", "hash", "fixture", other) === oldCacheKey(other), !changed);
      const result = compileDirectorPlan(otherPlan, other);
      const expected = productVideoNegativePrompt.replace("object rotation, ", "");
      assert.equal(result.negativePrompt, shotMode === "multi" ? expected.replace("scene cuts, ", "") : expected);
      if (presetId === "cinematic-hero") {
        assert.equal(otherPlan.shots[0].camera, shotMode === "single" ? "Short lateral camera glide" : "Locked medium overview");
      }
    }
});

test("24 distinct executable strategies retain the three legacy IDs and cover every category", () => {
  assert.equal(videoPresetIds.length, 24);
  assert.equal(new Set(videoPresetIds).size, 24);
  assert.deepEqual(legacyVideoPresetIds, ["luxury-fashion-film", "macro-detail-reveal", "minimal-studio"]);
  assert.equal(new Set(videoPresetIds.map(id => JSON.stringify(videoDirectorPresets[id].strategy))).size, 24);
  for (const category of videoCategories) assert.ok(videoPresetIds.some(id => videoDirectorPresets[id].strategy.categories.includes(category)), category);
  for (const id of videoPresetIds) {
    const p = videoDirectorPresets[id];
    assert.ok(p.brief && p.strategy.objective && p.strategy.supportedMotion.length && p.preservation.length);
    assert.equal(p.shots.length, 3);
    assert.equal(new Set(p.shots.map(shot => shot.purpose)).size, 3);
    assert.equal(new Set(p.shots.map(shot => shot.camera + shot.composition)).size, 3);
    for (const risk of p.strategy.risks) assert.ok(riskAlternatives[risk].condition && riskAlternatives[risk].alternative);
    if (legacyVideoPresetIds.some(legacy => legacy === id)) assert.equal(p.version, id === "macro-detail-reveal" ? 4 : 3);
  }
});

test("existing profiles refine category recommendations while unknown profiles stay universal", () => {
  const expected = ["floating-fashion", "glass-reflection", "precision-macro", "precision-macro", "hardware-reveal", "sneaker-hero"] as const;
  for (const [i, profile] of directorProducts.entries()) {
    const product = presetProduct(profile), ids = recommendVideoPresets(product);
    assert.ok(ids.includes(expected[i]), `${profile.productId}: ${ids}`);
    assert.ok(ids.every(id => !videoDirectorPresets[id].strategy.categories.length || videoDirectorPresets[id].strategy.categories.includes(product.category as typeof videoCategories[number])));
  }
  for (const [subcategory, category] of [["baseball cap", "headwear"], ["optical glasses", "eyewear"], ["armchair", "furniture"], ["cake", "food"], ["beverage can", "packaged-food"], ["headphones", "electronics"]]) {
    // Synthetic persisted-subtype compatibility cases, not live product analyses.
    const profile = { ...directorProducts[0], subcategory, confidence: { overall: 0.95, fields: { vertical: 0.2, subcategory: 0.95 } } };
    assert.equal(presetProduct(profile).category, category);
    assert.equal(directorProductContext(profile).category, category);
    assert.ok(recommendVideoPresets(presetProduct(profile)).length);
  }
  for (const profile of [null, { ...directorProducts[0], confidence: { overall: 0.2 } }]) {
    const product = presetProduct(profile);
    assert.equal(product.category, "unknown");
    assert.ok(recommendVideoPresets(product).every(id => !videoDirectorPresets[id].strategy.categories.length));
  }
});

test("all presets compile every product, tier, duration and shot mode to the exact preview payload", () => {
  for (const { profile } of libraryFixtures) for (const presetId of videoPresetIds)
    for (const quality of ["standard", "pro"] as const) for (const durationSeconds of [5, 10] as const)
      for (const shotMode of ["single", "multi"] as const) {
        const base = directorFixtureInput(directorProducts[0]);
        const input = { ...base, profile, presetId, shotMode, draft: { ...base.draft, quality, durationSeconds, shotMode,
          criticalRegion: { x: 0, y: 0, width: 0.1, height: 0.1, declaredText: "untrusted" } } };
        const plan = fallbackDirectorPlan(input), compiled = compileDirectorPlan(plan, input);
        const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: `kling-v3-${quality}-image`, endpointId: "fixture", sourceUrl: "https://invalid.example/source" });
        const snapshot = { version: compiled.version, method: "kling" as const, draftHash: "fixture", sourceSha256: "fixture",
          geometry: { originalWidth: 100, originalHeight: 100, contentRect: { x: 0, y: 0, width: 1, height: 1 } }, criticalRegion: input.draft.criticalRegion,
          frameRegion: null, compiledPrompt: compiled.prompt, negativePrompt: compiled.negativePrompt, cfgScale: compiled.cfgScale,
          analysisConsent: null, director: { plan, multiPrompt: compiled.multiPrompt } };
        const preview = summarizeVideoPayload(input.draft, snapshot).preview;
        const prompts = Array.isArray(payload.multi_prompt) ? payload.multi_prompt.map(shot => shot.prompt) : [payload.prompt];
        assert.deepEqual(preview.shots.map(shot => shot.prompt), prompts);
        assert.equal(preview.shots.reduce((sum, shot) => sum + shot.duration, 0), durationSeconds);
        for (const shot of preview.shots) {
          assert.ok(shot.prompt.length <= (shotMode === "multi" ? 512 : 2500), presetId);
          assert.match(shot.prompt, /marked logo\/label/);
          assert.doesNotMatch(shot.prompt, /360|exploded|manufacturing|workshop|spray|open the|new person|untrusted/i);
        }
        for (const shot of plan.shots) for (const id of shot.evidenceRefs) assert.equal(shot.focus, presetProduct(profile).evidence[id]);
      }
});

test("documented extra categories and denim/tee inputs use only their own evidenced focus", () => {
  for (const fixture of libraryFixtures) {
    assert.equal(presetProduct(fixture.profile).category, fixture.category, fixture.name);
    const input = { ...directorFixtureInput(directorProducts[0], "Detayı göster, sonra genel çekime dön."), profile: fixture.profile, presetId: fixture.presetId };
    const plan = fallbackDirectorPlan(input);
    const compiled = compileDirectorPlan(plan, input);
    assert.ok(compiled.multiPrompt?.length);
    for (const shot of plan.shots) if (shot.evidenceRefs.length) assert.ok(presetProduct(fixture.profile).evidence.includes(shot.focus));
    assert.equal(plan.origin, "fallback"); // Preserve the free fallback's explicit provenance.
    assert.match(plan.intent, /Explicit camera, evidence-backed focus/);
  }
});

test("TR/EN expose all category, preset and risk labels through the shared selector", () => {
  for (const locale of ["tr", "en"]) {
    const t = JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8")).Dashboard.videoStudio.director;
    for (const id of videoPresetIds) assert.ok(t.presets[id].title && t.presets[id].description && t.presets[id].caption);
    for (const category of videoCategories) assert.ok(t.library.categories[category]);
    for (const risk of Object.keys(riskAlternatives)) assert.ok(t.library.risks[risk]);
  }
});

test("library strategies respect explicit camera choices and retire pre-library 3.1 receipts", () => {
  const base = directorFixtureInput(directorProducts[0]);
  for (const presetId of videoPresetIds) for (const cameraMovement of ["static", "dolly-in", "dolly-out", "pan-left", "pan-right"] as const) {
    const input = { ...base, presetId, draft: { ...base.draft, cameraMovement } };
    assert.ok(compileDirectorPlan(fallbackDirectorPlan(input), input).multiPrompt);
  }
  const key = directorCacheKey("owner", "hash", "fixture", base), secret = "offline-secret";
  const plan = fallbackDirectorPlan(base);
  const receipt = sealDirectorPlan(key, { ...plan, version: "video-director-3.1" as typeof plan.version }, secret, 1000);
  assert.equal(openDirectorPlan(receipt, key, base, secret, 2000), null);
});
