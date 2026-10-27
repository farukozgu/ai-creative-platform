import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import * as core from "../src/lib/video-director/core";
import * as receipt from "../src/lib/video-director/receipt";
import { videoPresetIds, videoDirectorPresets } from "../src/lib/video-director/presets";
import { buildFalVideoRequestInput, validateKlingMultiPrompt } from "../src/lib/video-generation/fal-request";
import { videoDraftHash } from "../src/lib/video-generation/request-identity";
import { validateVideoGenerationDraft } from "../src/lib/video-generation/validation";
import { matchesUsdQuoteConfirmation } from "../src/lib/video-generation/money";
import { creativeRequest, hasUnsupportedProductClaims } from "../src/lib/video-director/creative-request";
import { quoteVideoFidelity } from "../src/lib/video-fidelity/pricing";
import type { VideoGenerationDraft } from "../src/lib/video-generation/types";
import type { ProductProfile } from "../src/lib/product-understanding/product-profile";
import type * as runtime from "../src/lib/video-director/runtime";
import type * as adapter from "../src/lib/video-director/openai-director";
import type * as actions from "../src/app/[locale]/dashboard/video/director-actions";

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
  for (const presetId of videoPresetIds) for (const durationSeconds of [5, 10] as const)
    for (const shotMode of ["single", "multi"] as const) for (const quality of ["standard", "pro"] as const) {
      const selected: core.VideoDirectorInput = { draft: { ...draft, quality, durationSeconds, cameraMovement: "auto",
        criticalRegion: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, declaredText: "unverified" } }, presetId, shotMode, profile: jacket };
      const plan = core.fallbackDirectorPlan(selected);
      const result = core.compileDirectorPlan(plan, selected);
      const prompts = result.multiPrompt ?? [{ prompt: result.prompt, duration: String(durationSeconds) }];
      assert.equal(prompts.reduce((sum, shot) => sum + Number(shot.duration), 0), durationSeconds);
      if (shotMode === "multi") {
        assert.deepEqual(prompts.map(shot => shot.duration), durationSeconds === 5 ? ["2", "2", "1"] : ["3", "4", "3"]);
        assert.equal(new Set(prompts.map(shot => shot.prompt)).size, 3);
        assert.match(plan.shots[0].composition, /complete|overview|hero/i);
        assert.match(plan.shots[1].composition, /close|detail/i);
        assert.match(plan.shots[1].focus, /If visible in the source, focus on: silver asymmetric front zipper/);
        assert.match(plan.shots[2].composition, /return/i);
        assert.doesNotMatch(plan.shots[1].camera, /complete product/i);
        assert.doesNotMatch(prompts[1].prompt, /keep the complete product in frame/i);
      }
      for (const shot of prompts) {
        assert.ok(shot.prompt.length <= (shotMode === "multi" ? 512 : 2500));
        assert.match(shot.prompt, /small embossed chest logo/);
        assert.ok(shot.prompt.indexOf("small embossed chest logo") < shot.prompt.indexOf("silver asymmetric front zipper"));
        if (shotMode === "single") { assert.match(shot.prompt, /black pebbled leather/); assert.match(shot.prompt, /fitted jacket silhouette/); }
        else { assert.match(shot.prompt, /Visible: black\./); assert.match(shot.prompt, /fine leather grain/); }
        assert.doesNotMatch(shot.prompt, /hidden interior serial label/);
        if (shotMode === "single") for (const rule of ["exact visible lettering", "geometry", "surface texture", "color distribution", "pattern and print", "do not reveal unseen surfaces"])
          assert.ok(shot.prompt.includes(rule));
        else for (const rule of ["geometry", "texture", "logo/text", "source light/color"]) assert.ok(shot.prompt.includes(rule));
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
    lighting: "Stable light", motion: "Product remains still", pace: "Quiet hold", focus: "Visible leather grain" });
  const raw = { summary: "A controlled jacket film", shots: [shot(3, "Slow long-lens push-in", "Full jacket"),
    shot(4, "Locked macro camera", "Close view of visible zipper"), shot(3, "Locked camera", "Hero view")] };
  const select = (cameraMovement: VideoGenerationDraft["cameraMovement"]) => ({ ...input, shotMode: "multi" as const, profile: jacket,
    draft: { ...draft, durationSeconds: 10 as const, cameraMovement } });
  const automatic = core.parseDirectorOutput(raw, select("auto"))!;
  assert.equal(automatic.shots[0].camera, raw.shots[0].camera);
  assert.equal(automatic.shots[1].camera, raw.shots[1].camera);
  const pushed = core.parseDirectorOutput(raw, select("dolly-in"))!;
  assert.equal(pushed.shots[0].camera, raw.shots[0].camera);
  assert.match(pushed.shots[1].camera, /macro/i); assert.match(pushed.shots[1].camera, /push-in/i);
  assert.doesNotMatch(pushed.shots[1].camera, /locked/i);
  const fixed = core.parseDirectorOutput(raw, select("static"))!;
  assert.match(fixed.shots[0].camera, /long-lens/i); assert.match(fixed.shots[0].camera, /locked/i);
  assert.doesNotMatch(fixed.shots[0].camera, /push-in/i);
  assert.equal(fixed.shots[1].camera, raw.shots[1].camera);
  assert.deepEqual(core.parseDirectorOutput(fixed, select("static"))?.shots, fixed.shots);
  const conflicting = { ...raw, shots: [raw.shots[0], { ...raw.shots[1], motion: "The camera slowly pushes in" }, raw.shots[2]] };
  assert.equal(core.parseDirectorOutput(conflicting, select("auto")), null);
  const zoom = { ...raw, shots: [raw.shots[0], { ...raw.shots[1], camera: "Macro camera zooms in" }, raw.shots[2]] };
  const lockedZoom = core.parseDirectorOutput(zoom, select("static"))!;
  assert.match(lockedZoom.shots[1].camera, /macro.*locked/i);
  assert.doesNotMatch(lockedZoom.shots[1].camera, /zooms in/i);
});

test("director budget reserves complete rules and creative direction before optional evidence", () => {
  const selected: core.VideoDirectorInput = { ...input, profile: { ...jacket, dominantColors: Array(10).fill("a".repeat(100)),
    identityCriticalAttributes: [{ attribute: "embossed chest logo", rationale: "branding", regions: [] },
      ...Array.from({ length: 30 }, (_, index) => ({ attribute: `silver zipper detail ${index} ${"x".repeat(80)}`, rationale: "hardware", regions: [] }))] } };
  const value = "steady ".repeat(25).trim();
  const plan = { ...core.fallbackDirectorPlan(selected), shots: [{ durationSeconds: 5, camera: value, lighting: value,
    composition: value, motion: value, pace: value, focus: value }] };
  const parsed = core.parseDirectorOutput(plan, selected)!;
  const compiled = core.compileDirectorPlan({ ...plan, shots: parsed.shots }, selected).prompt;
  assert.ok(compiled.length <= 2500); assert.match(compiled, /embossed chest logo/);
  assert.match(compiled, /exact visible lettering/); assert.match(compiled, /do not reveal unseen surfaces/);
  assert.ok(compiled.endsWith(`focus: ${value}`));
  if (compiled.includes("silver zipper detail 0")) assert.ok(compiled.includes(`silver zipper detail 0 ${"x".repeat(80)}.`));
});

test("partial historical profile details do not prevent a safe fallback", () => {
  const incomplete = { ...jacket, visibleBranding: {} as ProductProfile["visibleBranding"],
    verticalAttributes: { vertical: "apparel" as const, details: {} as Extract<ProductProfile["verticalAttributes"], { vertical: "apparel" }>["details"] } };
  const selected: core.VideoDirectorInput = { ...input, profile: incomplete };
  const plan = core.fallbackDirectorPlan(selected);
  assert.match(core.compileDirectorPlan(plan, selected).prompt, /source image is the sole product identity authority/);
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
  assert.equal(videoPresetIds.length, 3);
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
        for (const feature of shotMode === "single" ? ["logo", "exact visible lettering", "geometry", "material", "pattern", "color"] : ["logo/text", "geometry", "material", "pattern", "color"])
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
      assert.ok(shot.prompt.length <= 2500); assert.match(shot.prompt, /ivory embroidered chest mark/);
      assert.match(shot.prompt, /Marked logo\/label/); assert.match(shot.prompt, /(?:locked|static|fixed) camera/i);
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
    if (name in overrides) return overrides[name];
    if (name.startsWith("@/") || name.startsWith("./")) throw new Error(`Unmocked dependency: ${name}`);
    return requirePackage(name);
  } });
  return exports as T;
}

test("runtime requires an exact separate cost approval before a paid plan and preserves fallback/cache behavior", async () => {
  let calls = 0;
  const quote = quoteVideoFidelity(false, Date.parse("2026-10-27T00:00:00Z"))!;
  const api = loadIsolated<typeof runtime>("src/lib/video-director/runtime.ts", {
    "@/lib/openai/beta-policy": { getOpenAIBetaPolicy: () => ({ analysisModels: ["gpt-4o-mini"], limits: { analysis: { user: 24, global: 120 } } }) },
    "@/lib/generation/prompts/prompt-enhancer-config": { getPromptEnhancementModel: () => "gpt-4o-mini" },
    "@/lib/video-fidelity/pricing": { quoteVideoFidelity: () => quote },
    "@/lib/video-generation/beta-policy": { canAccessVideoBeta: () => true },
    "@/lib/video-generation/money": { matchesUsdQuoteConfirmation },
    "./core": core, "./receipt": receipt,
    "./openai-director": { createOpenAIVideoPlan: async () => { calls++; return core.fallbackDirectorPlan(input); } },
  }, { VIDEO_DIRECTOR_ENABLED: "true", OPENAI_API_KEY: "fake", SUPABASE_SECRET_KEY: secret });
  const free = await api.prepareVideoDirectorPlan(owner, Buffer.alloc(0), "source", input);
  assert.equal(free?.plan.origin, "fallback"); assert.equal(calls, 0);
  for (const maximumCostUsd of [0, -1, NaN, Infinity, quote.maximumEstimatedCostUsd - 0.000001, quote.maximumEstimatedCostUsd + 0.000001])
    assert.equal(await api.prepareVideoDirectorPlan(owner, Buffer.alloc(0), "source", input, { maximumCostUsd, pricingVersion: quote.pricingVersion }), null);
  assert.equal(calls, 0);
  const approval = { maximumCostUsd: quote.maximumEstimatedCostUsd, pricingVersion: quote.pricingVersion };
  assert.equal(await api.prepareVideoDirectorPlan(owner, Buffer.alloc(0), "source", input, { ...approval, pricingVersion: "old" }), null);
  const paid = await api.prepareVideoDirectorPlan(owner, Buffer.alloc(0), "source", input, approval, free?.receipt);
  assert.equal(paid?.plan.origin, "ai"); assert.equal(calls, 1);
  assert.ok(await api.prepareVideoDirectorPlan(owner, Buffer.alloc(0), "source", input, undefined, paid?.receipt));
  assert.ok(api.readVerifiedDirectorPlan(owner, "source", input, paid?.receipt)); assert.equal(calls, 1);
  await api.prepareVideoDirectorPlan(owner, Buffer.alloc(0), "source", input, approval); assert.equal(calls, 1);
});

test("OpenAI adapter sends bounded source/profile/preset context using existing strict structured output", async () => {
  let captured: Record<string, unknown> | null = null;
  const api = loadIsolated<typeof adapter>("src/lib/video-director/openai-director.ts", {
    "@/lib/openai/client": { getOpenAIClient: () => ({ responses: { create: async (body: Record<string, unknown>) => {
      captured = body; return { status: "completed", output_text: JSON.stringify(core.fallbackDirectorPlan(input)) };
    } } }) },
    "@/lib/openai/structured-response": { structuredResponseText: (format: unknown) => ({ format }) },
    "@/lib/openai/response-telemetry": { attachOpenAIResponseTelemetry: (value: unknown) => value },
    "@/lib/generation/prompts/prompt-enhancer-config": { getPromptEnhancementModel: () => "gpt-4o-mini" },
    "./core": core, "./presets": { videoDirectorPresets }, "./creative-request": { creativeRequest },
  });
  const source = await sharp({ create: { width: 32, height: 32, channels: 3, background: "white" } }).png().toBuffer();
  await api.createOpenAIVideoPlan(input, source);
  assert.ok(captured);
  const body = captured as Record<string, unknown>;
  assert.equal(body.store, false); assert.equal(body.max_output_tokens, 2200);
  assert.match(JSON.stringify(body.input), /data:image\/jpeg;base64/);
  assert.match(JSON.stringify(body.input), /productProfile/); assert.match(JSON.stringify(body.input), /userRequest/);
  assert.equal((body.text as { format: { strict: boolean } }).format.strict, true);
});

test("Director action rejects unauthenticated access and forged source ownership before inference", async () => {
  let userId: string | null = null, ownershipChecks = 0, paidCalls = 0;
  const api = loadIsolated<typeof actions>("src/app/[locale]/dashboard/video/director-actions.ts", {
    "@/lib/auth/require-user": { getAuthenticatedUserId: async () => userId },
    "@/lib/video-generation/beta-policy": { canAccessVideoBeta: () => true },
    "@/lib/video-generation/validation": { validateVideoGenerationDraft },
    "@/lib/video-generation/source-context": { readOwnedPreparedVideoSource: async () => { ownershipChecks++; throw new Error("not owned"); } },
    "@/lib/video-generation/preservation": { isUnsafeProductMotion: () => false },
    "@/lib/video-director/presets": { isVideoPresetId: (id: unknown) => videoPresetIds.some(preset => preset === id) },
    "@/lib/video-director/runtime": { getVideoDirectorQuote: () => null, prepareVideoDirectorPlan: async () => { paidCalls++; } },
  });
  assert.equal((await api.prepareVideoDirectorAction(draft, "minimal-studio", "single")).status, "unavailable");
  assert.equal(ownershipChecks, 0);
  userId = owner;
  assert.equal((await api.prepareVideoDirectorAction(draft, "image-preset", "single")).status, "invalid");
  assert.equal(ownershipChecks, 0);
  assert.equal((await api.prepareVideoDirectorAction(draft, "minimal-studio", "single")).status, "error");
  assert.equal(ownershipChecks, 1); assert.equal(paidCalls, 0);
});

test("TR/EN include every video preset and plan label without changing image preset configuration", () => {
  for (const locale of ["tr", "en"]) {
    const messages = JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8")).Dashboard.videoStudio.director;
    for (const id of videoPresetIds) assert.ok(messages.presets[id].title && messages.presets[id].description);
    for (const field of core.shotFields) assert.ok(messages[field]);
    assert.ok(messages.consent && messages.separateApproval && messages.fallbackNotice);
  }
});
