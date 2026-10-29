import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import * as core from "../src/lib/video-director/core";
import * as receipt from "../src/lib/video-director/receipt";
import { videoPresetIds, legacyVideoPresetIds, videoDirectorPresets, shotPurposes } from "../src/lib/video-director/presets";
import { safePresetStrategy } from "../src/lib/video-director/preset-library";
import { directorProductContext } from "../src/lib/video-director/product-context";
import { buildFalVideoRequestInput, validateKlingMultiPrompt } from "../src/lib/video-generation/fal-request";
import { videoDraftHash } from "../src/lib/video-generation/request-identity";
import { validateVideoGenerationDraft } from "../src/lib/video-generation/validation";
import { creativeRequest, hasUnsupportedProductClaims, interpretCreativeIntent } from "../src/lib/video-director/creative-request";
import type { VideoGenerationDraft } from "../src/lib/video-generation/types";
import type { ProductProfile } from "../src/lib/product-understanding/product-profile";
import type * as runtime from "../src/lib/video-director/runtime";
import type * as adapter from "../src/lib/video-director/openai-director";
import type * as actions from "../src/app/[locale]/dashboard/video/director-actions";
import { directorProducts, directorFixtureInput, authoredDirectorExample } from "./fixtures/video-director-fixtures";
import { summarizeVideoPayload } from "../src/lib/video-generation/payload-summary";
import * as planContract from "../src/lib/video-director/plan-contract";
import { compileKlingShot } from "../src/lib/video-director/kling-compiler";

const owner = "10000000-0000-4000-8000-000000000001";
const draft: VideoGenerationDraft = { clientSubmissionId: "20000000-0000-4000-8000-000000000001", mode: "image", prompt: "A quiet campaign film",
  quality: "standard", aspectRatio: "16:9", durationSeconds: 5, cameraMovement: "static", source: { kind: "uploaded-image", sourceAssetId: owner } };
const input: core.VideoDirectorInput = { draft, presetId: "minimal-studio", shotMode: "single", profile: null };
const secret = "test-only-server-signing-secret";
const jacket: ProductProfile = {
  productId: "leather-jacket", schemaVersion: 3, analysisVersion: "fixture", vertical: "apparel", subcategory: "leather jacket",
  wearability: "wearable", rigidity: "deformable", materials: ["black pebbled leather"], dominantColors: ["black"],
  productShape: "fitted jacket silhouette", identityCriticalAttributes: [
    { attribute: "silver asymmetric front zipper", rationale: "hardware", regions: [] },
    { attribute: "fine leather grain and double stitched seams", rationale: "texture", regions: [] },
    { attribute: "small embossed chest logo", rationale: "branding", regions: [] },
    { attribute: "hidden interior serial label", rationale: "not visible", regions: [] },
  ],
  visibleBranding: { hasLogo: true, hasReadableText: true, hasArtwork: false, logoRegions: [], textRegions: [], artworkRegions: [] },
  interactionTargets: ["torso"], allowedTransformations: ["none"],
  forbiddenTransformations: ["recolor", "geometry_redesign", "logo_movement", "text_or_artwork_change"],
  sceneAffinities: { recommendedSceneTags: [], discouragedSceneTags: [] }, confidence: { overall: 1 },
  source: { model: "fixture", analysisVersion: "fixture", analyzedAt: "2026-10-27" },
  verticalAttributes: { vertical: "apparel", details: { garmentType: "leather jacket", primaryColor: "black", artworkOrLogoLocations: [],
    closures: ["silver asymmetric front zipper"], pocketStructure: [], hoodOrCollar: "notched collar", constructionDetails: ["double stitched seams"], identitySides: ["front"] } },
};

test("unverified product claims are excluded while cinematic direction survives", () => {
  const fabric = { ...jacket, materials: ["black woven fabric"], dominantColors: ["black"], identityCriticalAttributes: [{ attribute: "two rows of buttons", rationale: "closure", regions: [] }],
    verticalAttributes: { vertical: "apparel" as const, details: { ...jacket.verticalAttributes.details, closures: ["two rows of buttons"] } } } as ProductProfile;
  const request = creativeRequest("Cinematic luxury film of a black leather coat with a silver zipper, smooth macro camera.");
  assert.doesNotMatch(request, /leather|zipper|silver|black/i);
  assert.match(request, /cinematic/i); assert.match(request, /close framing/i);
  assert.match(creativeRequest("Sinematik, yavaş makro çekim"), /Cinematic.*close framing.*restrained pacing/i);
  assert.equal(hasUnsupportedProductClaims("Close view of a silver zipper on leather", fabric), true);
  assert.equal(hasUnsupportedProductClaims("Close view of black fabric and buttons", fabric), false);
  const plan = core.fallbackDirectorPlan({ ...input, profile: fabric });
  plan.shots[0].focus = "Silver zipper and leather texture";
  assert.equal(core.parseDirectorOutput(plan, { ...input, profile: fabric }), null);
});

test("leather jacket matrix has distinct role-based scenes, preservation and valid Kling payloads", () => {
  const signatures = new Set<string>();
  for (const presetId of legacyVideoPresetIds) for (const durationSeconds of [5, 10] as const)
    for (const shotMode of ["single", "multi"] as const) for (const quality of ["standard", "pro"] as const) {
      const selected: core.VideoDirectorInput = { draft: { ...draft, quality, durationSeconds, cameraMovement: "auto",
        criticalRegion: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, declaredText: "unverified" } }, presetId, shotMode, profile: jacket };
      const plan = core.fallbackDirectorPlan(selected);
      const result = core.compileDirectorPlan(plan, selected);
      const prompts = result.multiPrompt ?? [{ prompt: result.prompt, duration: String(durationSeconds) }];
      assert.equal(prompts.reduce((sum, shot) => sum + Number(shot.duration), 0), durationSeconds);
      if (shotMode === "multi") {
        assert.deepEqual(prompts.map(shot => shot.duration), durationSeconds === 5 ? ["2", "3"] : ["3", "4", "3"]);
        assert.equal(new Set(prompts.map(shot => shot.prompt)).size, prompts.length);
        const detail = plan.shots[durationSeconds === 5 ? 0 : 1];
        assert.match(detail.composition, /close|detail|crop/i);
        assert.match(detail.focus, /silver asymmetric front zipper/);
        assert.match(plan.shots.at(-1)!.composition, /return/i);
        assert.doesNotMatch(detail.camera, /complete product/i);
      }
      for (const shot of prompts) {
        assert.ok(shot.prompt.length <= (shotMode === "multi" ? 512 : 2500));
        assert.doesNotMatch(shot.prompt, /Focus:|Visible:/);
        assert.doesNotMatch(shot.prompt, /hidden interior serial label/);
        if (shotMode === "single") for (const rule of ["markings exact", "geometry", "texture", "color", "pattern", "known surfaces"])
          assert.ok(shot.prompt.includes(rule));
        else for (const rule of ["geometry", "texture", "markings exact", "known surfaces"]) assert.ok(shot.prompt.includes(rule));
        if (shotMode === "multi") assert.doesNotMatch(shot.prompt, /single continuous|no scene cuts/i);
      }
      const payload = buildFalVideoRequestInput({ modelId: `kling-v3-${quality}-image`, endpointId: "fixture", mode: "image",
        sourceUrl: "https://private.invalid/source", durationSeconds, aspectRatio: "16:9", prompt: result.prompt,
        multiPrompt: result.multiPrompt, negativePrompt: result.negativePrompt, cfgScale: result.cfgScale });
      assert.equal("prompt" in payload, shotMode === "single");
      assert.equal("multi_prompt" in payload, shotMode === "multi");
      assert.equal(payload.enable_safety_checker, true); assert.equal(payload.generate_audio, false);
      if (durationSeconds === 10 && shotMode === "multi" && quality === "standard") signatures.add(plan.shots.map(shot => shot.camera).join(" | "));
    }
  assert.equal(signatures.size, 3);
});

test("camera preference resolves conflicts per shot while retaining compatible AI framing and macro", () => {
  const shot = (durationSeconds: number, camera: string, composition: string) => ({ durationSeconds, camera, composition,
    lighting: "Stable light", motion: "Product remains still", pace: "Quiet hold", focus: "Source-visible product form", evidenceRefs: [] });
  const raw = { intent: "A controlled jacket film", intentContract: interpretCreativeIntent(draft.prompt, directorProductContext(jacket).evidence), summary: "A controlled jacket film", shots: [shot(3, "Slow long-lens push-in", "Full jacket"),
    shot(4, "Locked macro camera", "Close view of visible zipper"), shot(3, "Locked camera", "Hero view")] };
  const roles = ["hero-reveal", "macro-detail", "final-hero"];
  const directed = { ...raw, shots: raw.shots.map((shot, index) => ({ ...shot, purpose: roles[index] })) };
  const select = (cameraMovement: VideoGenerationDraft["cameraMovement"]) => ({ ...input, shotMode: "multi" as const, profile: jacket,
    draft: { ...draft, durationSeconds: 10 as const, cameraMovement } });
  const forCamera = (cameraMovement: VideoGenerationDraft["cameraMovement"], plan = directed) => ({ ...plan,
    intentContract: interpretCreativeIntent(draft.prompt, directorProductContext(jacket).evidence, "multi", cameraMovement) });
  const automatic = core.parseDirectorOutput(directed, select("auto"))!;
  assert.equal(automatic.shots[0].camera, raw.shots[0].camera);
  assert.equal(automatic.shots[1].camera, raw.shots[1].camera);
  const pushed = core.parseDirectorOutput(forCamera("dolly-in"), select("dolly-in"))!;
  assert.equal(pushed.shots[0].camera, raw.shots[0].camera);
  assert.match(pushed.shots[1].camera, /macro/i); assert.match(pushed.shots[1].camera, /push-in/i);
  assert.doesNotMatch(pushed.shots[1].camera, /locked/i);
  const fixed = core.parseDirectorOutput(forCamera("static"), select("static"))!;
  assert.match(fixed.shots[0].camera, /long-lens/i); assert.match(fixed.shots[0].camera, /locked/i);
  assert.doesNotMatch(fixed.shots[0].camera, /push-in/i);
  assert.equal(fixed.shots[1].camera, raw.shots[1].camera);
  assert.deepEqual(core.parseDirectorOutput(fixed, select("static"))?.shots, fixed.shots);
  const conflicting = { ...directed, shots: [directed.shots[0], { ...directed.shots[1], motion: "The camera slowly pushes in" }, directed.shots[2]] };
  assert.equal(core.parseDirectorOutput(conflicting, select("auto")), null);
  const zoom = { ...directed, shots: [directed.shots[0], { ...directed.shots[1], camera: "Macro camera zooms in" }, directed.shots[2]] };
  const lockedZoom = core.parseDirectorOutput(forCamera("static", zoom), select("static"))!;
  assert.match(lockedZoom.shots[1].camera, /macro.*locked/i);
  assert.doesNotMatch(lockedZoom.shots[1].camera, /zooms in/i);
});

test("director budget reserves complete rules and creative direction before optional evidence", () => {
  const selected: core.VideoDirectorInput = { ...input, profile: { ...jacket, dominantColors: Array(10).fill("a".repeat(100)),
    identityCriticalAttributes: [{ attribute: "embossed chest logo", rationale: "branding", regions: [] },
      ...Array.from({ length: 30 }, (_, index) => ({ attribute: `silver zipper detail ${index} ${"x".repeat(80)}`, rationale: "hardware", regions: [] }))] } };
  const value = "steady ".repeat(14).trim();
  const base = core.fallbackDirectorPlan(selected);
  const plan = { ...base, shots: [{ ...base.shots[0], durationSeconds: 5, camera: value, lighting: value,
    composition: value, motion: value, pace: value }] };
  const parsed = core.parseDirectorOutput(plan, selected)!;
  const compiled = core.compileDirectorPlan({ ...plan, shots: parsed.shots }, selected).prompt;
  assert.ok(compiled.length <= 2500); assert.doesNotMatch(compiled, /Visible:/);
  assert.match(compiled, /markings exact/); assert.match(compiled, /known surfaces/);
  assert.ok(compiled.includes(`${value}.`));
  if (compiled.includes("silver zipper detail 0")) assert.ok(compiled.includes(`silver zipper detail 0 ${"x".repeat(80)}.`));
});

test("partial historical profile details do not prevent a safe fallback", () => {
  const incomplete = { ...jacket, visibleBranding: {} as ProductProfile["visibleBranding"],
    verticalAttributes: { vertical: "apparel" as const, details: {} as Extract<ProductProfile["verticalAttributes"], { vertical: "apparel" }>["details"] } };
  const selected: core.VideoDirectorInput = { ...input, profile: incomplete };
  const plan = core.fallbackDirectorPlan(selected);
  assert.match(core.compileDirectorPlan(plan, selected).prompt, /Keep source geometry/);
});

test("plan validation rejects malformed duration, fields, unsafe directions and stale version", () => {
  const plan = core.fallbackDirectorPlan(input);
  for (const broken of [{ ...plan, shots: [] }, { ...plan, shots: [{ ...plan.shots[0], durationSeconds: 4 }] },
    { ...plan, shots: [{ ...plan.shots[0], durationSeconds: 1.5 }] },
    { ...plan, shots: [{ ...plan.shots[0], focus: "x".repeat(181) }] },
    { ...plan, shots: [{ ...plan.shots[0], camera: "Orbit around the product" }] }]) {
    assert.equal(core.parseDirectorOutput(broken, input), null);
    assert.throws(() => core.compileDirectorPlan(broken, input));
  }
  assert.throws(() => core.compileDirectorPlan({ ...plan, version: "video-director-v1" as typeof plan.version }, input));
  const key = receipt.directorCacheKey(owner, "source", "model", input);
  const expiredVersion = receipt.sealDirectorPlan(key, { ...plan, presetVersion: 1 }, secret, 1000);
  assert.equal(receipt.openDirectorPlan(expiredVersion, key, input, secret, 2000), null);
});

test("three versioned video presets compile for every supported tier, duration and shot mode", () => {
  assert.equal(legacyVideoPresetIds.length, 3);
  for (const presetId of videoPresetIds) for (const quality of ["standard", "pro"] as const)
    for (const durationSeconds of [5, 10] as const) for (const shotMode of ["single", "multi"] as const) {
      const selected = { ...input, presetId, shotMode, draft: { ...draft, quality, durationSeconds } };
      const plan = core.fallbackDirectorPlan(selected);
      assert.ok(core.parseDirectorOutput(plan, selected));
      assert.equal(plan.presetVersion, videoDirectorPresets[presetId].version);
      const compiled = core.compileDirectorPlan(plan, selected);
      const payload = buildFalVideoRequestInput({ modelId: `kling-v3-${quality}-image`, endpointId: "fixture", mode: "image",
        sourceUrl: "https://private.invalid/source", durationSeconds, aspectRatio: "16:9", prompt: compiled.prompt,
        multiPrompt: compiled.multiPrompt, negativePrompt: compiled.negativePrompt, cfgScale: compiled.cfgScale });
      assert.equal(payload.generate_audio, false); assert.equal(payload.enable_safety_checker, true);
      assert.equal(payload.duration, String(durationSeconds));
      assert.equal("prompt" in payload, shotMode === "single"); assert.equal("multi_prompt" in payload, shotMode === "multi");
      for (const shot of compiled.multiPrompt ?? [{ prompt: compiled.prompt, duration: String(durationSeconds) }]) {
        assert.ok(shot.prompt.length <= (shotMode === "multi" ? 512 : 2500));
        for (const feature of ["markings exact", "geometry", "material", "pattern", "color"])
          assert.ok(shot.prompt.includes(feature));
      }
    }
});

test("invalid, missing, fractional and mismatched durations never become a Kling request", () => {
  for (const bad of [[], [{ prompt: "A", duration: "5" }], [{ prompt: "A", duration: "2" }, { prompt: "B", duration: "2" }],
    [{ prompt: "A", duration: "2.5" }, { prompt: "B", duration: "2.5" }], [{ prompt: "A", duration: 2 }, { prompt: "B", duration: 3 }],
    [{ prompt: "A", duration: "0" }, { prompt: "B", duration: "5" }], [{ prompt: "x".repeat(513), duration: "2" }, { prompt: "B", duration: "3" }]]) {
    assert.equal(validateKlingMultiPrompt(bad, 5), false);
  }
  const good = [{ prompt: "A", duration: "2" }, { prompt: "B", duration: "3" }];
  assert.equal(validateKlingMultiPrompt(good, 5), true);
  assert.equal(validateKlingMultiPrompt(good, 7), false);
  assert.equal(validateKlingMultiPrompt([{ prompt: "x".repeat(512), duration: "2" }, { prompt: "B", duration: "3" }], 5), true);
  const singleBase = { modelId: "kling-v3-standard-image", endpointId: "fixture", mode: "image" as const,
    sourceUrl: "https://private.invalid/source", durationSeconds: 5 as const, aspectRatio: "16:9" as const };
  const singlePromptPayload = buildFalVideoRequestInput({ ...singleBase, prompt: "x".repeat(2500) });
  assert.equal(typeof singlePromptPayload.prompt, "string");
  assert.equal((singlePromptPayload.prompt as string).length, 2500);
  assert.throws(() => buildFalVideoRequestInput({ ...singleBase, prompt: "x".repeat(2501) }));
});

test("refusal, timeout, malformed output and unsafe directions use a safe fallback without a retry", async () => {
  for (const output of [null, {}, { summary: "bad", shots: [] }, { ...core.fallbackDirectorPlan(input), shots: [{ ...core.fallbackDirectorPlan(input).shots[0], motion: "Rotate the product" }] }]) {
    let calls = 0;
    const plan = await core.directVideoWithClient(input, { createPlan: async () => { calls++; return output; } });
    assert.equal(calls, 1); assert.equal(plan.origin, "fallback");
    assert.ok(!JSON.stringify(plan).includes(draft.prompt));
  }
  let calls = 0;
  assert.equal((await core.directVideoWithClient(input, { createPlan: async () => { calls++; throw new Error("timeout"); } })).origin, "fallback");
  assert.equal(calls, 1);
  const valid = await core.directVideoWithClient(input, { createPlan: async () => core.fallbackDirectorPlan(input) });
  assert.equal(valid.origin, "ai");
});

test("verified product evidence and valid OpenAI plan stay AI through business, integrity and Kling compilation", async () => {
  const base = directorProducts.find(product => product.productId === "shoe")!;
  const selected = { ...input, profile: {
    ...base,
  } as ProductProfile };
  const safePlan = core.fallbackDirectorPlan(selected);
  const response = { ...safePlan, origin: "ai" as const,
    shots: safePlan.shots.map((shot, index) => index === 0 ? { ...shot, focus: "woven upper texture", evidenceRefs: [0] } : shot) };
  const events: Array<{ stage: string; result: string; reasonCode?: string; jsonPath?: string; expected?: string }> = [];
  const plan = await core.directVideoWithClient(selected, { createPlan: async () => response }, event => events.push(event));
  assert.equal(plan.origin, "ai");
  assert.ok(plan.shots.some(shot => shot.focus === "woven upper texture"));
  const compiled = core.compileDirectorPlan(plan, selected);
  assert.ok(compiled.prompt.includes("woven upper texture"));
  assert.deepEqual(events.map(event => `${event.stage}:${event.result}`), [
    "structured_output_parsed:success", "director_business_validation:success", "plan_integrity_validation:success",
  ]);
});

test("invalid plan reports business rejection separately from verified product analysis", async () => {
  const output = { ...core.fallbackDirectorPlan(input), origin: "ai", shots: [{ ...core.fallbackDirectorPlan(input).shots[0], durationSeconds: 99 }] };
  const events: Array<{ stage: string; result: string; reasonCode?: string; jsonPath?: string; expected?: string }> = [];
  const plan = await core.directVideoWithClient(input, { createPlan: async () => output }, event => events.push(event));
  assert.equal(plan.origin, "fallback");
  assert.ok(events.some(event => event.stage === "director_business_validation" && event.reasonCode === "invalid_shot_fields"
    && event.jsonPath === "$.shots[0]" && event.expected?.includes("valid duration")));
});

test("single-shot duration mismatch reports its exact path without silently changing it", () => {
  const selected = { ...input, shotMode: "single" as const, draft: { ...input.draft, durationSeconds: 10 as const } };
  const candidate = { ...core.fallbackDirectorPlan(selected), origin: "ai" as const,
    shots: [{ ...core.fallbackDirectorPlan(selected).shots[0], durationSeconds: 5 }] };
  const failures: Array<{ jsonPath: string; reasonCode: string; expected: string }> = [];
  assert.equal(core.parseDirectorOutput(candidate, selected, failure => failures.push(failure)), null);
  assert.deepEqual(failures[0], { jsonPath: "$.shots[*].durationSeconds", reasonCode: "total_duration_mismatch", expected: "sum exactly 10 seconds" });
});

test("all AI shot focuses bind to verified evidence or approved generic values", async () => {
  const shoe = directorProducts.find(product => product.productId === "shoe")!;
  const base = directorFixtureInput(shoe);
  const input = { ...base, presetId: "product-spotlight" as const, shotMode: "multi" as const,
    draft: { ...base.draft, durationSeconds: 10 as const, shotMode: "multi" as const } };
  const fallback = core.fallbackDirectorPlan(input);
  const candidate = { ...fallback, origin: "ai" as const,
    shots: fallback.shots.map(shot => ({ ...shot, evidenceRefs: [] })) };
  const failures: Array<{ jsonPath: string; reasonCode: string; expected: string }> = [];
  const accepted = core.parseDirectorOutput(candidate, input, failure => failures.push(failure));
  assert.ok(accepted, JSON.stringify(failures));
  assert.equal(accepted.shots.length, 3);
  const verified = directorProductContext(shoe).evidence;
  assert.ok(accepted.shots.every(shot => shot.evidenceRefs.length === 1
    ? shot.focus === verified[shot.evidenceRefs[0]].detail
    : core.DIRECTOR_GENERIC_FOCUS_VALUES.includes(shot.focus as typeof core.DIRECTOR_GENERIC_FOCUS_VALUES[number])));
  assert.doesNotThrow(() => core.compileDirectorPlan(accepted, input));

  const tokenized = { ...candidate, shots: candidate.shots.map(shot => {
    const evidence = verified.find(item => item.detail === shot.focus);
    if (!evidence) return shot;
    const providerShot = { ...shot, focus: `verified-evidence:${evidence.id}` } as unknown as Record<string, unknown>;
    delete providerShot.evidenceRefs;
    return providerShot;
  }) };
  const tokenizedPlan = core.parseDirectorOutput(tokenized, input, failure => failures.push(failure));
  assert.ok(tokenizedPlan, "all three evidence tokens must resolve against the product profile");
  assert.deepEqual(tokenizedPlan.shots.map(shot => shot.focus), accepted.shots.map(shot => shot.focus));
  assert.deepEqual(tokenizedPlan.shots.map(shot => shot.evidenceRefs), accepted.shots.map(shot => shot.evidenceRefs));
  assert.doesNotThrow(() => core.compileDirectorPlan(tokenizedPlan, input));
  const aiPlan = await core.directVideoWithClient(input, { createPlan: async () => tokenized });
  assert.equal(aiPlan.origin, "ai");
  assert.deepEqual(aiPlan.shots.map(shot => shot.focus), accepted.shots.map(shot => shot.focus));

  const invalid = { ...candidate, shots: candidate.shots.map((shot, index) => index === 1
    ? { ...shot, focus: verified[0].detail, evidenceRefs: [1] } : shot) };
  const invalidFailures: Array<{ jsonPath: string; reasonCode: string; expected: string }> = [];
  assert.equal(core.parseDirectorOutput(invalid, input, failure => invalidFailures.push(failure)), null);
  assert.deepEqual(invalidFailures[0], { jsonPath: "$.shots[1].focus", reasonCode: "focus_not_evidence_bound",
    expected: "a verified-evidence:<id> present in the validated product evidence, or an allowed generic focus without evidenceRefs" });

  const noProfile = { ...input, profile: null };
  const generic = { ...core.fallbackDirectorPlan(noProfile), origin: "ai" as const };
  assert.ok(core.parseDirectorOutput(generic, noProfile));
  const inventedGeneric = { ...generic, shots: generic.shots.map(shot => ({ ...shot, focus: "unverified suede grain" })) };
  assert.equal(core.parseDirectorOutput(inventedGeneric, noProfile), null);
  const unknownToken = { ...generic, shots: generic.shots.map(shot => ({ ...shot, focus: "verified-evidence:999" })) };
  assert.equal(core.parseDirectorOutput(unknownToken, noProfile), null);
});

test("evidence focus tokens survive footwear, ring and optical preset plans through compiler and signed receipt", () => {
  const shoe = directorProducts.find(product => product.productId === "shoe")!;
  const ring = directorProducts.find(product => product.productId === "ring")!;
  const glasses = { ...ring, productId: "glasses", subcategory: "sunglasses", materials: [], dominantColors: ["black"],
    productShape: "source-visible eyewear form", identityCriticalAttributes: [
      { attribute: "visible frame rim", rationale: "source-visible", regions: [] },
      { attribute: "visible bridge", rationale: "source-visible", regions: [] },
    ] };
  const cases = [
    { profile: shoe, presetId: "product-spotlight" as const, shotMode: "multi" as const, durationSeconds: 10 as const },
    { profile: shoe, presetId: "cinematic-hero" as const, shotMode: "single" as const, durationSeconds: 10 as const },
    { profile: ring, presetId: "macro-detail-reveal" as const, shotMode: "multi" as const, durationSeconds: 5 as const },
    { profile: glasses, presetId: "optical-lines" as const, shotMode: "multi" as const, durationSeconds: 10 as const },
  ];
  for (const scenario of cases) {
    const base = directorFixtureInput(scenario.profile);
    const input = { ...base, presetId: scenario.presetId, shotMode: scenario.shotMode,
      draft: { ...base.draft, durationSeconds: scenario.durationSeconds, shotMode: scenario.shotMode } };
    const fallback = core.fallbackDirectorPlan(input);
    const evidence = directorProductContext(scenario.profile).evidence;
    const providerPlan = { ...fallback, origin: "ai" as const, shots: fallback.shots.map(shot => {
      const match = evidence.find(item => item.detail === shot.focus);
      if (!match) return shot;
      const providerShot = { ...shot, focus: `verified-evidence:${match.id}` } as unknown as Record<string, unknown>;
      delete providerShot.evidenceRefs;
      return providerShot;
    }) };
    const plan = core.parseDirectorOutput(providerPlan, input);
    assert.ok(plan, `${scenario.profile.productId}/${scenario.presetId}/${scenario.durationSeconds}/${scenario.shotMode}`);
    assert.equal(plan.origin, "ai");
    assert.equal(plan.shots.reduce((total, shot) => total + shot.durationSeconds, 0), scenario.durationSeconds);
    assert.ok(plan.shots.every(shot => shot.evidenceRefs.length === 1
      ? shot.focus === evidence[shot.evidenceRefs[0]].detail
      : core.DIRECTOR_GENERIC_FOCUS_VALUES.includes(shot.focus as typeof core.DIRECTOR_GENERIC_FOCUS_VALUES[number])));
    const compiled = core.compileDirectorPlan(plan, input);
    const prompts = compiled.multiPrompt ?? [{ prompt: compiled.prompt, duration: String(scenario.durationSeconds) }];
    assert.ok(prompts.every(shot => shot.prompt.length <= (scenario.shotMode === "multi" ? 512 : 2500)));
    const signed = receipt.sealDirectorPlan("key", plan, secret, 1000);
    const opened = receipt.openDirectorPlan(signed, "key", input, secret, 2000);
    assert.ok(opened);
    assert.deepEqual(core.compileDirectorPlan(opened, input).multiPrompt, compiled.multiPrompt);
  }
});

test("Cinematic Hero 10s single-shot and Macro Stitching 10s multi-shot AI contracts validate without weakening rules", () => {
  const shoe = directorProducts.find(product => product.productId === "shoe")!;
  const base = directorFixtureInput(shoe);
  for (const scenario of [
    { presetId: "cinematic-hero" as const, shotMode: "single" as const, durationSeconds: 10 as const, cameraMovement: "auto" as const },
    { presetId: "macro-stitching" as const, shotMode: "multi" as const, durationSeconds: 10 as const, cameraMovement: "dolly-in" as const },
    { presetId: "cinematic-hero" as const, shotMode: "single" as const, durationSeconds: 5 as const, cameraMovement: "pan-left" as const },
  ]) {
    const input = { ...base, presetId: scenario.presetId, shotMode: scenario.shotMode,
      draft: { ...base.draft, ...scenario, prompt: "", quality: "standard" as const } };
    const candidate = { ...core.fallbackDirectorPlan(input), origin: "ai" as const };
    const failure: unknown[] = [];
    const parsed = core.parseDirectorOutput(candidate, input, value => failure.push(value));
    assert.ok(parsed, JSON.stringify(failure));
    assert.equal(parsed.shots.length, scenario.shotMode === "single" ? 1 : 3);
    assert.equal(parsed.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0), scenario.durationSeconds);
    assert.doesNotThrow(() => core.compileDirectorPlan(parsed, input));
  }
});

test("product evidence remains bounded while every shot preserves critical identity and camera preference", () => {
  const profile: ProductProfile = { productId: "tee", schemaVersion: 3, analysisVersion: "fixture", vertical: "apparel", subcategory: "shirt",
    wearability: "wearable", rigidity: "deformable", materials: ["cotton"], dominantColors: ["black", "x".repeat(2000)], productShape: "shirt",
    identityCriticalAttributes: [{ attribute: "ivory embroidered chest mark", rationale: "identity", regions: [] }, { attribute: "x".repeat(3000), rationale: "", regions: [] }],
    visibleBranding: { hasLogo: true, hasReadableText: true, hasArtwork: true, logoRegions: [], textRegions: [], artworkRegions: [] },
    interactionTargets: ["torso"], allowedTransformations: ["none"], forbiddenTransformations: ["recolor", "geometry_redesign", "text_or_artwork_change", "logo_movement"],
    sceneAffinities: { recommendedSceneTags: [], discouragedSceneTags: [] }, confidence: { overall: 1 },
    source: { model: "fixture", analysisVersion: "fixture", analyzedAt: "2026-10-27" },
    verticalAttributes: { vertical: "apparel", details: { garmentType: "shirt", primaryColor: "black", artworkOrLogoLocations: [], closures: [], pocketStructure: [], hoodOrCollar: null, constructionDetails: [], identitySides: [] } } };
  for (const presetId of videoPresetIds) {
    const selected = { ...input, presetId, profile, shotMode: "multi" as const, draft: { ...draft, criticalRegion: { x: 0, y: 0, width: 0.2, height: 0.2, declaredText: "untrusted hint" } } };
    const compiled = core.compileDirectorPlan(core.fallbackDirectorPlan(selected), selected);
    for (const shot of compiled.multiPrompt!) {
      assert.ok(shot.prompt.length <= 2500);
      assert.match(shot.prompt, /marked logo\/label/); assert.match(shot.prompt, /locked|static|fixed/i);
    }
  }
});

test("signed session cache rejects tampering, expiry, another owner/source and changed settings", () => {
  const key = receipt.directorCacheKey(owner, "source-hash", "model", input);
  const plan = core.fallbackDirectorPlan(input);
  const token = receipt.sealDirectorPlan(key, plan, secret, 1000);
  assert.ok(receipt.openDirectorPlan(token, key, input, secret, 2000));
  assert.equal(receipt.openDirectorPlan(token, key, input, secret, 3601000), null);
  assert.equal(receipt.openDirectorPlan(token + "x", key, input, secret, 2000), null);
  assert.equal(receipt.openDirectorPlan(token, key, input, "other-secret", 2000), null);
  for (const changedKey of [receipt.directorCacheKey("other-owner", "source-hash", "model", input), receipt.directorCacheKey(owner, "new-source", "model", input),
    receipt.directorCacheKey(owner, "source-hash", "other-model", input), receipt.directorCacheKey(owner, "source-hash", "model", { ...input, draft: { ...draft, durationSeconds: 10 } }),
    receipt.directorCacheKey(owner, "source-hash", "model", { ...input, draft: { ...draft, prompt: "A different campaign" } }),
    receipt.directorCacheKey(owner, "source-hash", "model", { ...input, draft: { ...draft, quality: "pro" } }),
    receipt.directorCacheKey(owner, "source-hash", "model", { ...input, draft: { ...draft, cameraMovement: "dolly-in" } }),
    receipt.directorCacheKey(owner, "source-hash", "model", { ...input, draft: { ...draft, source: { kind: "uploaded-image", sourceAssetId: "30000000-0000-4000-8000-000000000003" } } }),
    receipt.directorCacheKey(owner, "source-hash", "model", { ...input, presetId: "luxury-fashion-film" }),
    receipt.directorCacheKey(owner, "source-hash", "model", { ...input, profile: { productId: "changed" } as ProductProfile })]) {
    assert.notEqual(changedKey, key); assert.equal(receipt.openDirectorPlan(token, changedKey, input, secret, 2000), null);
  }
});

test("a new video submission may reuse the same Director plan for identical creative inputs", () => {
  const original = receipt.directorCacheKey(owner, "source-hash", "model", input);
  const newRequest = { ...input, draft: { ...draft, clientSubmissionId: "30000000-0000-4000-8000-000000000003" } };
  assert.equal(receipt.directorCacheKey(owner, "source-hash", "model", newRequest), original);
  const token = receipt.sealDirectorPlan(original, core.fallbackDirectorPlan(input), secret, 1000);
  assert.ok(receipt.openDirectorPlan(token, original, newRequest, secret, 2000));
});

test("concurrent cache requests share one attempt, including fallback after provider uncertainty", async () => {
  const cache = new receipt.DirectorPlanCache(); let calls = 0;
  const create = async () => { calls++; return core.fallbackDirectorPlan(input); };
  await Promise.all([cache.getOrCreate("key", create, 0), cache.getOrCreate("key", create, 1)]);
  assert.equal(calls, 1);
  await cache.getOrCreate("key", create, 3600001); assert.equal(calls, 2);
});

test("director selection participates in idempotency and is validated at the draft boundary", () => {
  const directed = { ...draft, director: { presetId: "minimal-studio" as const, shotMode: "single" as const, receipt: "signed" } };
  assert.notEqual(videoDraftHash(draft), videoDraftHash(directed));
  assert.equal(validateVideoGenerationDraft(directed).ok, true);
  for (const director of [null, {}, { ...directed.director, presetId: "image-preset" }, { ...directed.director, shotMode: "anything" }, { ...directed.director, receipt: "x".repeat(14001) }])
    assert.equal(validateVideoGenerationDraft({ ...draft, director }).ok, false);
});

const requirePackage = createRequire(import.meta.url);
function loadIsolated<T>(file: string, overrides: Record<string, unknown>, env: Record<string, string> = {}): T {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  runInNewContext(code, { exports, Buffer, process: { env }, require: (name: string) => {
    if (name === "server-only") return {};
    if (name === "@/lib/video-generation/diagnostics") return { createVideoCorrelationId: () => "test-correlation", logVideoDiagnostic: () => undefined };
    if (name in overrides) return overrides[name];
    if (name.startsWith("@/") || name.startsWith("./")) throw new Error(`Unmocked dependency: ${name}`);
    return requirePackage(name);
  } });
  return exports as T;
}

test("runtime prepares AI plans without a separate quote approval and preserves fallback/cache behavior", async () => {
  let calls = 0;
  let available = true;
  const api = loadIsolated<typeof runtime>("src/lib/video-director/runtime.ts", {
    "@/lib/openai/beta-policy": { getVideoStudioOpenAIPolicy: () => available ? ({ analysisModels: ["gpt-4o-mini"], limits: { analysis: { user: 24, global: 120 } } }) : null },
    "@/lib/generation/prompts/prompt-enhancer-config": { getPromptEnhancementModel: () => "gpt-4o-mini" },
    "./core": core, "./receipt": receipt,
    "./openai-director": { createOpenAIVideoPlan: async () => { calls++; return core.fallbackDirectorPlan(input); } },
  }, { OPENAI_API_KEY: "fake", SUPABASE_SECRET_KEY: secret });
  const aiPlan = await api.prepareVideoDirectorPlan(owner, Buffer.alloc(0), "source", input);
  assert.equal(aiPlan?.plan.origin, "ai"); assert.equal(calls, 1);
  assert.ok(await api.prepareVideoDirectorPlan(owner, Buffer.alloc(0), "source", input, aiPlan?.receipt));
  assert.ok(api.readVerifiedDirectorPlan(owner, "source", input, aiPlan?.receipt)); assert.equal(calls, 1);
  available = false;
  const fallbackInput = { ...input, draft: { ...input.draft, prompt: "another plan" } };
  const fallback = await api.prepareVideoDirectorPlan(owner, Buffer.alloc(0), "source", fallbackInput);
  assert.equal(fallback?.plan.origin, "fallback"); assert.equal(calls, 1);
  const quotaFallback = await api.prepareVideoDirectorPlan(owner, Buffer.alloc(0), "source", input, undefined, false);
  assert.equal(quotaFallback?.plan.origin, "fallback"); assert.equal(calls, 1);
});

test("OpenAI adapter sends bounded source/profile/preset context using existing strict structured output", async () => {
  let captured: Record<string, unknown> | null = null;
  const api = loadIsolated<typeof adapter>("src/lib/video-director/openai-director.ts", {
    "@/lib/openai/client": { getOpenAIVideoStudioAnalysisClient: () => ({ responses: { create: async (body: Record<string, unknown>) => {
      captured = body; const { intentContract: _intentContract, summary: _summary, intent: _intent, ...wire } = core.fallbackDirectorPlan(input);
      void _intentContract; void _summary; void _intent; return { status: "completed", output_text: JSON.stringify(wire) };
    } } }) },
    "@/lib/openai/structured-response": { structuredResponseText: (format: unknown) => ({ format }) },
    "@/lib/openai/response-telemetry": { attachOpenAIResponseTelemetry: (value: unknown) => value },
    "@/lib/generation/prompts/prompt-enhancer-config": { getPromptEnhancementModel: () => "gpt-4o-mini" },
    "./core": core, "./presets": { videoDirectorPresets, shotPurposes }, "./product-context": { directorProductContext }, "./preset-library": { safePresetStrategy },
    "./creative-request": { interpretCreativeIntent },
    "./plan-contract": planContract, "./kling-compiler": { compileKlingShot },
  });
  const source = await sharp({ create: { width: 32, height: 32, channels: 3, background: "white" } }).png().toBuffer();
  await api.createOpenAIVideoPlan(input, source);
  const refInput = { ...input, draft: { ...input.draft, productReferences: [1,2,3].map(n => ({
    source: { kind: "uploaded-image" as const, sourceAssetId: `10000000-0000-4000-8000-00000000000${n}` }, sha256: "a".repeat(64), purpose: "detail",
  })) }, referenceImages: [1,2,3].map(() => ({ prepared: source, sourceSha256: "a".repeat(64), purpose: "detail" })) };
  await api.createOpenAIVideoPlan(refInput, source);
  assert.equal((JSON.stringify(captured).match(/data:image\/jpeg;base64/g) ?? []).length, 4);
  const refRequest = api.buildDirectorRequest(refInput);
  assert.ok(refRequest.schema.required.includes("referenceReviews"));
  assert.ok(Buffer.byteLength(refRequest.context + refRequest.instructions + JSON.stringify(refRequest.schema), "utf8") <= 16000);
  assert.ok(captured);
  const body = captured as Record<string, unknown>;
  assert.equal(body.store, false); assert.equal(body.max_output_tokens, 2200);
  assert.match(JSON.stringify(body.input), /data:image\/jpeg;base64/);
  assert.match(JSON.stringify(body.input), /productProfile/); assert.match(JSON.stringify(body.input), /userRequest/);
  assert.equal((body.text as { format: { strict: boolean } }).format.strict, true);
  for (const prompt of ["Cekete yavaş yaklaş, detayları göster.", "Do not zoom. Start close, slide left, then hold.", "Önce makro, sonra genel çekim; 360 dön ama etiketi koru.", ""]) {
    const selected = directorFixtureInput(directorProducts[0], prompt);
    const request = api.buildDirectorRequest(selected);
    const context = JSON.parse(request.context);
    assert.equal(context.userRequest, prompt);
    assert.equal(context.productProfile.category, "apparel");
    assert.equal(context.productProfile.productType, "belted jacket");
    assert.ok(context.allowedEvidence.includes("front belt knot"));
    assert.ok(Buffer.byteLength(request.context + request.instructions + JSON.stringify(request.schema), "utf8") <= 16000);
    assert.match(request.instructions, /semantically|negation/);
    assert.match(request.instructions, /reinterpret a requested spin\/360/);
    assert.doesNotMatch(request.instructions, /Keep the source setting, lighting and product still/);
  }
  const maximum = directorFixtureInput({ ...directorProducts[0], identityCriticalAttributes: Array.from({ length: 80 }, (_, i) => ({
    attribute: `visible construction feature ${i} ${"e".repeat(60)}`, rationale: "visible", regions: [],
  })) }, "y".repeat(2500));
  const maximumRequest = api.buildDirectorRequest(maximum);
  assert.ok(maximumRequest);
  assert.ok(!maximumRequest.schema.required.includes("evidenceRefs"));
  assert.ok(!("evidenceRefs" in maximumRequest.schema.properties.shots.items.properties));
  const schemaProperties = maximumRequest.schema.properties as unknown as {
    shots: { items: { properties: Record<string, { enum?: string[] }> } };
  };
  const focusEnum = schemaProperties.shots.items.properties.focus.enum!;
  assert.ok(focusEnum.includes("verified-evidence:0"));
  assert.ok(focusEnum.includes("verified-evidence:23"));
  assert.ok(!focusEnum.some(value => value.includes("visible construction feature")));
  for (const presetId of videoPresetIds) {
    const request = api.buildDirectorRequest({ ...directorFixtureInput(directorProducts[0], "Önce detay, ardından tam ürün."), presetId });
    const context = JSON.parse(request.context);
    assert.equal(context.preset.strategy.objective, videoDirectorPresets[presetId].strategy.objective);
    assert.deepEqual(context.preset.strategy.cameraStrategy, videoDirectorPresets[presetId].strategy.cameraStrategy);
    assert.ok(context.preset.strategy.riskConditions.length);
    assert.ok(Buffer.byteLength(request.context + request.instructions + JSON.stringify(request.schema), "utf8") <= 16000);
  }
});

test("Director action rejects unauthenticated access and forged source ownership before inference", async () => {
  let userId: string | null = null, ownershipChecks = 0, planCalls = 0, sourceAllowed = false, runtimeArgs: unknown[] = [];
  const api = loadIsolated<typeof actions>("src/app/[locale]/dashboard/video/director-actions.ts", {
    "@/lib/video-generation/reference-context": { readProductReferences: async () => [] },
    "@/lib/auth/require-user": { getAuthenticatedUserId: async () => userId },
    "@/lib/video-generation/beta-policy": { canAccessVideoBeta: () => true },
    "@/lib/video-generation/validation": { validateVideoGenerationDraft },
    "@/lib/video-generation/source-context": { readOwnedPreparedVideoSource: async () => {
      ownershipChecks++; if (!sourceAllowed) throw new Error("not owned");
      return { prepared: Buffer.alloc(0), original: Buffer.alloc(0), sourceSha256: "source-hash", profile: null };
    } },
    "@/lib/video-director/preset-recommendations": { presetProduct: () => ({ category: "apparel", evidence: [] }) },
    "@/lib/video-generation/video-product-analysis": { analyzeOwnedVideoProduct: async () => ({ status: "supported", profile: directorProducts[0] }) },
    "@/lib/video-generation/preservation": { isUnsafeProductMotion: () => false },
    "@/lib/video-director/presets": { isVideoPresetId: (id: unknown) => videoPresetIds.some(preset => preset === id) },
    "@/lib/video-director/runtime": { prepareVideoDirectorPlan: async (...args: unknown[]) => {
      planCalls++; runtimeArgs = args;
      return { plan: { origin: "ai", presetId: "minimal-studio", shotMode: "single" }, receipt: "signed" };
    } },
  });
  assert.equal((await api.prepareVideoDirectorAction(draft, "minimal-studio", "single")).status, "unavailable");
  assert.equal(ownershipChecks, 0);
  userId = owner;
  assert.equal((await api.prepareVideoDirectorAction(draft, "image-preset", "single")).status, "invalid");
  assert.equal(ownershipChecks, 0);
  assert.equal((await api.prepareVideoDirectorAction(draft, "minimal-studio", "single")).status, "error");
  assert.equal(ownershipChecks, 1); assert.equal(planCalls, 0);
  sourceAllowed = true;
  const prepared = await api.prepareVideoDirectorAction(draft, "minimal-studio", "single");
  assert.equal(prepared.status, "success");
  if (prepared.status === "success") {
    assert.equal(prepared.analysisStatus, "verified");
    assert.equal(prepared.productContext.category, "apparel");
  }
  assert.equal((runtimeArgs[3] as { profile: unknown }).profile, directorProducts[0]);
  assert.equal(planCalls, 1); assert.equal(runtimeArgs.length, 7); assert.equal(runtimeArgs[4], undefined); assert.equal(runtimeArgs[5], true);
  assert.equal((runtimeArgs[6] as { correlationId: string }).correlationId, "test-correlation");
});

test("TR/EN include every video preset and plan label without changing image preset configuration", () => {
  for (const locale of ["tr", "en"]) {
    const messages = JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8")).Dashboard.videoStudio.director;
    for (const id of videoPresetIds) assert.ok(messages.presets[id].title && messages.presets[id].description);
    for (const field of core.shotFields) assert.ok(messages[field]);
    assert.ok(messages.automaticPlanning && messages.separateApproval && messages.fallbackNotice);
    assert.equal(messages.consent, undefined);
    assert.ok(messages.intent && messages.purpose);
    for (const purpose of shotPurposes) assert.ok(messages.purposes[purpose]);
  }
});

test("existing evidence drives distinct films for apparel, packaging, watches, jewelry, bags and footwear", () => {
  const signatures = new Set<string>();
  for (const profile of directorProducts) {
    const selected = directorFixtureInput(profile);
    const context = directorProductContext(profile);
    assert.equal(context.category, profile.vertical);
    assert.equal(context.productType, profile.subcategory);
    const plan = core.fallbackDirectorPlan(selected);
    signatures.add(plan.shots.map(shot => shot.focus).join("|"));
    assert.equal(plan.origin, "fallback");
    assert.ok(plan.shots.some(shot => shot.evidenceRefs.length));
    const variants = videoPresetIds.map(presetId => {
      const input = { ...selected, presetId };
      return core.compileDirectorPlan(core.fallbackDirectorPlan(input), input).multiPrompt;
    });
    assert.equal(new Set(variants.map(value => JSON.stringify(value))).size, videoPresetIds.length);
  }
  assert.equal(signatures.size, directorProducts.length);
});

test("authored AI acceptance examples preserve each directing decision in the real Kling payload and final preview", async () => {
  for (const profile of directorProducts.slice(0, 2)) {
    const selected = directorFixtureInput(profile, profile.vertical === "apparel"
      ? "Cekete yavaş yaklaş, detayları göster." : "Dramatic highlights, then finish on the label.");
    const plan = await core.directVideoWithClient(selected, { createPlan: async () => authoredDirectorExample(selected) });
    assert.equal(plan.origin, "ai");
    const compiled = core.compileDirectorPlan(plan, selected);
    const payload = buildFalVideoRequestInput({ ...selected.draft, modelId: "kling-v3-standard-image", endpointId: "fixture",
      sourceUrl: "https://private.invalid/source", prompt: compiled.prompt, multiPrompt: compiled.multiPrompt });
    const snapshot = { version: compiled.version, method: "kling" as const, draftHash: videoDraftHash(selected.draft), sourceSha256: "fixture",
      geometry: { originalWidth: 1000, originalHeight: 1500, contentRect: { x: 0, y: 0, width: 1, height: 1 } },
      criticalRegion: null, frameRegion: null, compiledPrompt: compiled.prompt, negativePrompt: compiled.negativePrompt,
      cfgScale: compiled.cfgScale, analysisConsent: null, director: { plan, multiPrompt: compiled.multiPrompt } };
    const preview = summarizeVideoPayload(selected.draft, snapshot).preview;
    assert.deepEqual(preview.shots.map(shot => shot.prompt), (payload.multi_prompt as core.KlingMultiPrompt).map(shot => shot.prompt));
    for (const [index, shot] of plan.shots.entries()) {
      const prompt = compiled.multiPrompt![index].prompt;
      for (const field of ["focus", "composition", "lighting", "pace"] as const)
        assert.ok(prompt.toLowerCase().includes(shot[field].toLowerCase()), `${profile.productId}/${field}`);
      assert.ok(prompt.length <= 512);
      assert.doesNotMatch(prompt, /product (?:stays|remains) stationary|no scene changes|single continuous/i);
    }
    assert.doesNotMatch(compiled.negativePrompt, /scene cuts|object rotation/);
  }
});

test("unverified facts, mismatched focus references, invisible details, repeated scenes and contradictory motion fail closed", async () => {
  const selected = directorFixtureInput(directorProducts[0]);
  const valid = authoredDirectorExample(selected);
  const corruptions = [
    { ...valid, shots: valid.shots.map(shot => ({ ...shot, focus: "diamond zipper" })) },
    { ...valid, shots: valid.shots.map(shot => ({ ...shot, evidenceRefs: [999] })) },
    { ...valid, shots: valid.shots.map(shot => ({ ...shot, motion: "Reveal the hidden mechanism" })) },
    { ...valid, shots: valid.shots.map(shot => ({ ...shot, composition: "Cut to a new macro scene" })) },
    { ...valid, shots: valid.shots.map(shot => ({ ...shot, composition: "Show a silk coat" })) },
    { ...valid, shots: valid.shots.map(shot => ({ ...shot, purpose: "hero-reveal" })) },
    { ...valid, shots: valid.shots.map(shot => ({ ...shot, camera: "Slow dolly-in" })) },
    { ...valid, shots: valid.shots.map(shot => ({ ...shot, composition: "Camera pulls back while camera pushes in" })) },
  ];
  for (const invalid of corruptions) {
    assert.equal(core.parseDirectorOutput(invalid, selected), null);
    const result = await core.directVideoWithClient(selected, { createPlan: async () => invalid });
    assert.equal(result.origin, "fallback");
  }
  const uncertain = { ...selected.profile!, confidence: { overall: 0.3 }, materials: ["possibly silk"] };
  assert.deepEqual(directorProductContext(uncertain).evidence, []);
  assert.equal(directorProductContext(uncertain).category, "unknown");
  const lowMaterialConfidence = { ...selected.profile!, subcategory: "silk coat", identityCriticalAttributes: [], materials: ["silk"],
    confidence: { overall: 0.95, fields: { materials: 0.2 } } };
  assert.equal(hasUnsupportedProductClaims("silk coat", lowMaterialConfidence), true);
  const hidden = { ...selected.profile!, identityCriticalAttributes: [{ attribute: "gold interior clasp", rationale: "not visible", regions: [] }],
    materials: ["possibly silk"] };
  assert.doesNotMatch(JSON.stringify(directorProductContext(hidden).evidence), /interior clasp|silk/);
  const missing = { ...selected, profile: null };
  assert.ok(core.compileDirectorPlan(core.fallbackDirectorPlan(missing), missing));
});

test("empty user descriptions pass Studio and server validation while prompts still come from a verified plan", () => {
  const selected = directorFixtureInput(directorProducts[1]);
  assert.equal(validateVideoGenerationDraft(selected.draft).ok, true);
  const plan = core.fallbackDirectorPlan(selected);
  assert.ok(core.compileDirectorPlan(plan, selected).multiPrompt!.every(shot => shot.prompt.trim()));
});

test("scene budgets reserve creative decisions and reject overlong directions instead of truncating", () => {
  const selected = directorFixtureInput(directorProducts[0]);
  const plan = authoredDirectorExample(selected);
  const long = { ...plan, shots: plan.shots.map(shot => ({ ...shot, lighting: "Soft light ".repeat(15), composition: "Clean space ".repeat(15) })) };
  assert.throws(() => core.compileDirectorPlan(long, selected), /invalid_director_plan/);
  const legacy = receipt.sealDirectorPlan("key", { ...plan, version: "video-director-v3" as typeof plan.version }, secret, 1000);
  assert.equal(receipt.openDirectorPlan(legacy, "key", selected, secret, 2000), null);
});

test("single-shot allows verifiable subject motion and lighting while forbidding an internal montage", () => {
  const selected = { ...directorFixtureInput(directorProducts[0]), shotMode: "single" as const };
  const base = authoredDirectorExample(selected);
  const plan = { ...base, shots: [{ ...base.shots[0], durationSeconds: 10,
    motion: "A gentle in-plane sway retains the front view", lighting: "A soft highlight travels along the visible form" }] };
  const compiled = core.compileDirectorPlan(plan, selected);
  assert.equal(compiled.multiPrompt, undefined);
  assert.match(compiled.prompt, /in-plane sway/);
  assert.match(compiled.prompt, /highlight travels/);
  assert.doesNotMatch(compiled.prompt, /product stationary|no lighting change/i);
  assert.match(compiled.negativePrompt, /scene cuts/);
  assert.equal(core.parseDirectorOutput({ ...plan, shots: [{ ...plan.shots[0], composition: "A montage of three views" }] }, selected), null);
});
