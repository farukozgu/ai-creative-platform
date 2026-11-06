import assert from "node:assert/strict";
import test from "node:test";
import { klingElementReferences, parseReferenceReviews } from "../src/lib/video-generation/product-references";
import * as referencePolicy from "../src/lib/video-generation/product-reference-policy";
import { safeOpenAIErrorCode } from "../src/lib/video-generation/diagnostics";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import OpenAI from "openai";
import { createOpenAIBetaFetch } from "../src/lib/openai/beta-transport";
import { getVideoStudioOpenAIPolicy } from "../src/lib/openai/beta-policy";
import * as core from "../src/lib/video-director/core";
import * as contract from "../src/lib/video-director/plan-contract";
import * as creative from "../src/lib/video-director/creative-request";
import * as presets from "../src/lib/video-director/presets";
import * as receipts from "../src/lib/video-director/receipt";
import * as compiler from "../src/lib/video-director/kling-compiler";
import { directorProductContext } from "../src/lib/video-director/product-context";
import { safePresetStrategy } from "../src/lib/video-director/preset-library";
import * as qualityDirections from "../src/lib/video-director/preset-quality-directions";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import type { ProductProfile } from "../src/lib/product-understanding/product-profile";
import type * as adapter from "../src/lib/video-director/openai-director";
import type * as runtime from "../src/lib/video-director/runtime";
import { directorProducts, directorFixtureInput, providerFixtureShots } from "./fixtures/video-director-fixtures";
import { frontBackInput, frontBackResponse } from "./fixtures/video-front-back-fixture";
import { customFourShotBrief, customFourShotFixture } from "./fixtures/video-custom-brief-fixture";
import { customCreativeIntent, numberedCreativeBeats, executableCustomCamera, normalizeCustomCamera } from "../src/lib/video-director/custom-brief";

const requirePackage = createRequire(import.meta.url);
function isolated<T>(file: string, overrides: Record<string, unknown>, env: Record<string, string> = {}): T {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  runInNewContext(code, { exports, Buffer, process: { env }, require: (name: string) => {
    if (name === "server-only") return {};
    if (name in overrides) return overrides[name];
    if (name.startsWith("@/") || name.startsWith("./")) throw new Error(`Unmocked dependency: ${name}`);
    return requirePackage(name);
  } });
  return exports as T;
}

const watchBase = directorProducts.find(profile => profile.productId === "watch")!;
const watch: ProductProfile = { ...watchBase, subcategory: "automatic wristwatch", materials: ["stainless steel"],
  verticalAttributes: { vertical: "watches", details: { ...watchBase.verticalAttributes.details,
    caseMaterialOrColor: "stainless steel", braceletOrStrap: "stainless steel bracelet",
  } } as ProductProfile["verticalAttributes"] };
const eyewear: ProductProfile = { ...directorProducts[3], productId: "eyewear", subcategory: "sunglasses",
  materials: [], dominantColors: ["black"], productShape: "eyewear silhouette", verticalAttributes: { vertical: "jewelry", details: {
    ...directorProducts[3].verticalAttributes.details, centerStoneShape: null, settingStyle: null, bandOrChainStructure: null,
  } } as ProductProfile["verticalAttributes"], identityCriticalAttributes: ["black frame rim", "visible bridge"].map(attribute => ({ attribute, rationale: "visible", regions: [] })) };

function selected(profile: ProductProfile, presetId: core.VideoDirectorInput["presetId"], shotMode: "multi" | "single", durationSeconds: 5 | 10): core.VideoDirectorInput {
  const base = directorFixtureInput(profile);
  return { ...base, presetId, shotMode, draft: { ...base.draft, shotMode, durationSeconds } };
}
const scenarios = [
  { input: selected(watch, "cinematic-dial", "multi", 10),
    summary: "A cinematic wristwatch study on a black background.",
    intent: "Reveal the automatic watch face and stainless-steel watchband with sculpted light." },
  { input: selected(directorProducts[5], "product-spotlight", "multi", 10),
    summary: "A graphic footwear campaign with a clean white background.",
    intent: "Study the white trainer silhouette and woven upper, then settle into a hero view." },
  { input: selected(directorProducts[3], "macro-detail-reveal", "single", 5),
    summary: "Ring light shapes a cinematic product study.",
    intent: "Hold on the silver ring and its oval stone setting." },
  { input: selected(eyewear, "optical-lines", "multi", 10),
    summary: "A graphic sunglasses campaign on a white backdrop.",
    intent: "Use silk-smooth camera motion to study the black eyewear silhouette." },
];

function responseFor({ input, summary, intent }: typeof scenarios[number]) {
  return { summary, intent, intentContract: core.presetCreativeIntent(input, directorProductContext(input.profile).evidence),
    shots: providerFixtureShots(input) };
}

function wireResponse<T extends { intentContract: unknown; summary: unknown; intent: unknown; referenceReviews?: { index: number }[] }>(plan: T) {
  const { intentContract: _intentContract, summary: _summary, intent: _intent, ...wire } = plan;
  void _intentContract; void _summary; void _intent;
  if (plan.referenceReviews) return { ...wire, referenceReviews: Object.fromEntries(plan.referenceReviews.map(({ index, ...review }) => [`r${index}`, review])) };
  return wire;
}

test("three-shot model output omits the server-owned contract and fits below the token ceiling by byte bound", () => {
  const candidate = responseFor(scenarios[0]);
  const wire = wireResponse(candidate);
  const json = JSON.stringify(wire);
  assert.equal(wire.shots.length, 3);
  assert.ok(Buffer.byteLength(json, "utf8") < 4000);
  assert.ok(Buffer.byteLength(json, "utf8") < Buffer.byteLength(JSON.stringify(candidate), "utf8"));
  assert.equal(Object.hasOwn(wire, "intentContract"), false);
  assert.equal(Object.hasOwn(wire, "summary"), false);
  assert.equal(Object.hasOwn(wire, "intent"), false);
});

test("server descriptions use only preset metadata and verified labels while shot claims remain guarded", () => {
  const profile: ProductProfile = { ...directorProducts[0], materials: ["leather"], dominantColors: [],
    identityCriticalAttributes: ["leather texture", "high collar"].map(attribute => ({ attribute, rationale: "visible", regions: [] })),
    verticalAttributes: { ...directorProducts[0].verticalAttributes, details: { garmentType: "jacket", primaryColor: null,
      artworkOrLogoLocations: [], closures: [], pocketStructure: [], hoodOrCollar: "high collar", constructionDetails: [], identitySides: ["front"] } } as ProductProfile["verticalAttributes"],
  };
  const input = selected(profile, "macro-detail-reveal", "multi", 10);
  const base = core.fallbackDirectorPlan(input);
  const descriptions = core.directorPlanDescriptions(input, base.shots.length);
  const candidate = { ...base, ...descriptions };
  assert.ok(descriptions.summary.includes("multi"));
  assert.ok(descriptions.summary.includes("10s"));
  assert.ok(descriptions.intent.includes("leather texture"));
  assert.ok(descriptions.summary.length <= 240 && descriptions.intent.length <= 240);
  assert.ok(core.parseDirectorOutput(candidate, input));
  const failures: core.DirectorValidationFailure[] = [];
  assert.equal(core.parseDirectorOutput({ ...candidate, shots: candidate.shots.map((shot, i) => i ? shot : { ...shot, lighting: "Soft light on black leather" }) }, input, failure => failures.push(failure)), null);
  assert.equal(failures[0].reasonCode, "unsupported_product_claim");
  assert.equal(failures[0].jsonPath, "$.shots[0].lighting");
  assert.ok(failures[0].matchedTerm);
  const old = { ...candidate, version: "video-director-3.1-references-v1" as typeof candidate.version };
  const receipt = receipts.sealDirectorPlan("key", old, "offline-secret", 1000);
  assert.equal(receipts.openDirectorPlan(receipt, "key", input, "offline-secret", 2000), null);
});

type Schema = { type?: string | string[]; anyOf?: Schema[]; enum?: readonly unknown[]; required?: string[]; properties?: Record<string, Schema>;
  additionalProperties?: boolean; minLength?: number; maxLength?: number; pattern?: string;
  minItems?: number; maxItems?: number; items?: Schema; minimum?: number; maximum?: number };
function assertSchema(value: unknown, schema: Schema, path = "$") {
  if (schema.anyOf) {
    assert.ok(schema.anyOf.some(branch => { try { assertSchema(value, branch, path); return true; } catch { return false; } }), `${path}: anyOf`);
    return;
  }
  const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  assert.ok((Array.isArray(schema.type) ? schema.type : [schema.type]).some(t => t === type || t === "integer" && Number.isInteger(value)), `${path}: type`);
  if (schema.enum) assert.ok(schema.enum.includes(value), `${path}: enum`);
  if (typeof value === "string") {
    assert.ok(value.length >= (schema.minLength ?? 0) && value.length <= (schema.maxLength ?? Infinity), `${path}: length`);
    if (schema.pattern) assert.match(value, new RegExp(schema.pattern), path);
  } else if (typeof value === "number") {
    assert.ok(value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity), `${path}: bounds`);
  } else if (Array.isArray(value)) {
    assert.ok(value.length >= (schema.minItems ?? 0) && value.length <= (schema.maxItems ?? Infinity), `${path}: count`);
    value.forEach((item, i) => assertSchema(item, schema.items!, `${path}[${i}]`));
  } else if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) assert.ok(Object.hasOwn(object, key), `${path}.${key}: required`);
    for (const [key, item] of Object.entries(object)) {
      assert.ok(schema.properties?.[key] || schema.additionalProperties !== false, `${path}.${key}: additional property`);
      if (schema.properties?.[key]) assertSchema(item, schema.properties[key], `${path}.${key}`);
    }
  }
}

function mockAdapter(output: () => { status: string; output_text?: string; output?: readonly unknown[]; incomplete_details?: { reason: string }; usage?: { output_tokens: number } },
  diagnostics?: Array<Record<string, unknown>>, requests?: Array<Record<string, unknown>>, sdkClient?: OpenAI) {
  return isolated<typeof adapter>("src/lib/video-director/openai-director.ts", {
    "../video-generation/product-references": { parseReferenceReviews },
    "../video-generation/product-reference-policy": referencePolicy,
    "@/lib/openai/client": { getOpenAIVideoStudioAnalysisClient: (_model: string, purpose: string) => sdkClient ?? ({ responses: { create: async (request: Record<string, unknown>) => { requests?.push({ ...request, purpose }); return output(); } } }) },
    "@/lib/openai/structured-response": { structuredResponseText: (format: unknown) => ({ format }) },
    "@/lib/openai/response-telemetry": { attachOpenAIResponseTelemetry: (plan: unknown) => plan },
    "@/lib/generation/prompts/prompt-enhancer-config": { getPromptEnhancementModel: () => "gpt-4o-mini" },
    "@/lib/video-generation/diagnostics": { logVideoDiagnostic: (_id: string, stage: string, result: string, fields: Record<string, unknown>) => diagnostics?.push({ stage, result, ...fields }), safeOpenAIErrorCode, safeOpenAIStatus: () => ({}) },
    "./core": core, "./plan-contract": contract, "./kling-compiler": compiler, "./presets": presets,
    "./product-context": { directorProductContext }, "./preset-library": { safePresetStrategy }, "./creative-request": creative,
    "./preset-quality-directions": qualityDirections,
    "./custom-brief": { customCreativeIntent, numberedCreativeBeats },
  });
}

test("Director provider schemas recursively exclude unsupported bounds", () => {
  const api = mockAdapter(() => ({ status: "completed", output_text: "{}" }));
  const forbidden = new Set(["maxLength", "minimum", "maximum", "minItems", "maxItems"]);
  function inspect(value: unknown) {
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      assert.equal(forbidden.has(key), false, `Provider schema contains ${key}`);
      inspect(item);
    }
  }
  for (const scenario of scenarios) for (const references of [false, true]) {
    const input = { ...scenario.input, draft: { ...scenario.input.draft, ...(references ? { productReferences: [{
      source: { kind: "uploaded-image" as const, sourceAssetId: "10000000-0000-4000-8000-000000000001" }, sha256: "a".repeat(64), purpose: "detail",
    }] } : {}) } };
    inspect(api.buildDirectorRequest(input).schema);
  }
});

test("server rejects overlong fields, envelopes and invalid shot counts or durations without truncation", () => {
  const good = responseFor(scenarios[0]);
  const invalid = [
    ...contract.shotFields.map(field => ({ ...good, shots: good.shots.map((shot, i) => i ? shot : { ...shot, [field]: "x".repeat(101) }) })),
    { ...good, summary: "x".repeat(241) }, { ...good, intent: "x".repeat(241) },
    { ...good, shots: good.shots.slice(0, 1) }, { ...good, shots: [...good.shots, good.shots[0]] },
    ...[0, -1, 2.5, 9].map(durationSeconds => ({ ...good, shots: good.shots.map((shot, i) => i ? shot : { ...shot, durationSeconds }) })),
  ];
  for (const value of invalid) assert.equal(core.parseDirectorOutput(value, scenarios[0].input), null);
  assert.ok(core.parseDirectorOutput(good, scenarios[0].input));
});

for (const scenario of scenarios) test(`mock OpenAI -> AI -> Kling -> signed plan: ${scenario.input.profile!.productId}/${scenario.input.presetId}`, async () => {
  const candidate = responseFor(scenario);
  const api = mockAdapter(() => ({ status: "completed", output_text: JSON.stringify(wireResponse(candidate)) }));
  const request = api.buildDirectorRequest(scenario.input);
  assert.equal(Object.hasOwn(request.schema.properties, "summary"), false);
  assert.equal(Object.hasOwn(request.schema.properties, "intent"), false);
  assertSchema(wireResponse(candidate), request.schema as Schema);
  const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
  const events: core.DirectorPlanningDiagnostic[] = [];
  const plan = await core.directVideoWithClient(scenario.input, { createPlan: input => api.createOpenAIVideoPlan(input, image) }, event => events.push(event));
  assert.equal(plan.origin, "ai", JSON.stringify(events));
  const descriptions = core.directorPlanDescriptions(scenario.input, plan.shots.length);
  assert.equal(plan.summary, descriptions.summary);
  assert.equal(plan.intent, descriptions.intent);
  assert.ok(events.every(event => event.result === "success"));
  const compiled = core.compileDirectorPlan(plan, scenario.input);
  const payload = buildFalVideoRequestInput({ ...scenario.input.draft, ...compiled, modelId: "kling-v3-standard-image",
    endpointId: "fixture", sourceUrl: "https://invalid.example/source" });
  assert.equal(payload.duration, String(scenario.input.draft.durationSeconds));
  assert.equal(payload.generate_audio, false);
  assert.equal(payload.enable_safety_checker, true);
  assert.ok((compiled.multiPrompt ?? [{ prompt: compiled.prompt }]).every(shot => !shot.prompt.includes("verified-evidence:") && shot.prompt.length <= (compiled.multiPrompt ? 512 : 2500)));
  const key = receipts.directorCacheKey("owner", "hash", "mock-model", scenario.input);
  const signed = receipts.sealDirectorPlan(key, plan, "offline-secret", 1000);
  const opened = receipts.openDirectorPlan(signed, key, scenario.input, "offline-secret", 2000);
  assert.ok(opened);
  assert.deepEqual(core.compileDirectorPlan(opened, scenario.input), compiled);
  assert.equal(receipts.openDirectorPlan(`${signed}x`, key, scenario.input, "offline-secret", 2000), null);
  assert.equal(receipts.openDirectorPlan(signed, key, { ...scenario.input, draft: { ...scenario.input.draft, durationSeconds: scenario.input.draft.durationSeconds === 10 ? 5 : 10 } }, "offline-secret", 2000), null);
});

test("claim matching accepts verified synonyms and cinematic uses, but never unverified attributes or parts", () => {
  for (const text of ["Automatic timepiece with a stainless steel band and blue face", "Watch hands and dial markers",
    "Black background, white balance and ring light", "Silk-smooth camera motion", "Gray lighting and gold rim light", "Matte backdrop and glossy lighting"])
    assert.equal(creative.hasUnsupportedProductClaims(text, watch), false, text);
  for (const text of ["Titanium watchband", "Sapphire crystal", "Waterproof watch", "Gold bracelet", "Blue strap", "Silver crown", "Leather watchband"])
    assert.equal(creative.hasUnsupportedProductClaims(text, watch), true, text);
  assert.equal(creative.hasUnsupportedProductClaims("Stainless steel watch", watchBase), true, "steel does not prove stainless steel");
  assert.equal(creative.hasUnsupportedProductClaims("Automatic watch", watchBase), true, "type must be verified");
  assert.equal(creative.hasUnsupportedProductClaims("Red dial", { ...watch, dominantColors: ["red"], identityCriticalAttributes: [],
    verticalAttributes: { ...watch.verticalAttributes, details: { ...watch.verticalAttributes.details, dialColor: "blue dial" } } as ProductProfile["verticalAttributes"] }), true);
  const uncertain = { ...watch, confidence: { overall: 0.95, fields: { materials: 0.1, subcategory: 0.1 } }, materials: ["titanium"], identityCriticalAttributes: [] };
  assert.equal(creative.hasUnsupportedProductClaims("Titanium automatic watch", uncertain), true);
});

test("summary accepts cinematic product wording and reports only the unsupported matched term", async () => {
  const scenario = scenarios[0];
  for (const summary of ["A cinematic wristwatch study with a restrained final hold.", "Soft light and measured framing reveal the watch dial."]) {
    assert.ok(core.parseDirectorOutput({ ...responseFor(scenario), summary }, scenario.input), summary);
  }
  for (const [summary, term] of [["Sapphire crystal protects the watch dial.", "sapphire"], ["A chronograph watch in a controlled close view.", "chronograph"]]) {
    const events: core.DirectorPlanningDiagnostic[] = [];
    const plan = await core.directVideoWithClient(scenario.input, { createPlan: async () => ({ ...responseFor(scenario), summary }) }, event => events.push(event));
    assert.equal(plan.origin, "fallback");
    const failure = events.find(event => event.stage === "director_business_validation" && event.result === "failed");
    assert.equal(failure?.jsonPath, "$.summary");
    assert.equal(failure?.reasonCode, "unsupported_product_claim");
    assert.equal(failure?.matchedTerm, term);
    assert.ok(failure.matchedTerm.length <= 60);
    assert.ok(!JSON.stringify(events).includes(summary));
  }
});

test("invalid plans reject at the correct business rule and exact field", async () => {
  const scenario = scenarios[0], good = responseFor(scenario);
  const variants: Array<{ value: unknown; path: string; code: string }> = [
    { value: { ...good, summary: "A titanium watch" }, path: "$.summary", code: "unsupported_product_claim" },
    { value: { ...good, intent: "Reveal a waterproof case" }, path: "$.intent", code: "unsupported_product_claim" },
    { value: { ...good, shots: good.shots.map((s, i) => i ? s : { ...s, lighting: "Light the gold bracelet" }) }, path: "$.shots[0].lighting", code: "unsupported_product_claim" },
    { value: { ...good, shots: good.shots.map((s, i) => i ? s : { ...s, focus: "verified-evidence:999" }) }, path: "$.shots[0].focus", code: "focus_not_evidence_bound" },
    { value: { ...good, shots: good.shots.map((s, i) => i ? s : { ...s, focus: "invented surface grain" }) }, path: "$.shots[0].focus", code: "focus_not_evidence_bound" },
    { value: { ...good, shots: good.shots.map((s, i) => i ? s : { ...s, evidenceRefs: [999] }) }, path: "$.shots[0].evidenceRefs", code: "invalid_evidence_reference" },
    { value: { ...good, shots: good.shots.map((s, i) => i ? s : { ...s, camera: "Pan left and pull back" }) }, path: "$.shots[0].camera", code: "conflicting_camera_directions" },
    { value: { ...good, shots: good.shots.map(s => ({ ...s, durationSeconds: 4 })) }, path: "$.shots[*].durationSeconds", code: "total_duration_mismatch" },
    { value: { ...good, shots: good.shots.map((s, i) => i ? s : { ...s, durationSeconds: 2.5 }) }, path: "$.shots[0]", code: "invalid_shot_fields" },
    { value: { ...good, shots: good.shots.map(s => ({ ...s, purpose: "hero-reveal" })) }, path: "$.shots", code: "fixed_macro_template_mismatch" },
    { value: { ...good, shots: good.shots.map(s => ({ ...s, camera: "Slow dolly-in" })) }, path: "$.shots", code: "fixed_macro_template_mismatch" },
    { value: { ...good, intentContract: { ...good.intentContract, camera: "pan-right" } }, path: "$.intentContract", code: "intent_contract_mismatch" },
    { value: { ...good, shots: good.shots.map((s, i) => i ? s : { ...s, motion: "Rotate into the rear view" }) }, path: "$.shots[0].motion", code: "unsafe_product_action" },
    { value: { ...good, shots: good.shots.map((s, i) => i ? s : { ...s, composition: "Cut to a macro view" }) }, path: "$.shots[0].composition", code: "internal_scene_cut" },
  ];
  for (const variant of variants) {
    const events: core.DirectorPlanningDiagnostic[] = [];
    const plan = await core.directVideoWithClient(scenario.input, { createPlan: async () => variant.value }, event => events.push(event));
    assert.equal(plan.origin, "fallback");
    const failure = events.find(event => event.result === "failed");
    assert.equal(failure?.stage, "director_business_validation");
    assert.equal(failure.reasonCode, variant.code, JSON.stringify(failure));
    assert.equal(failure.jsonPath, variant.path);
    assert.ok(!events.some(event => event.stage.startsWith("product_analysis")));
  }
});

test("canonical focus is idempotent and summary/intent are never joined into a new fact", () => {
  const scenario = scenarios[0], good = responseFor(scenario);
  const plan = core.parseDirectorOutput({ ...good, summary: "A cinematic study in silver", intent: "Strap detail holds the frame" }, scenario.input);
  assert.ok(plan, "silver and strap in separate creative fields are not a silver-strap claim");
  assert.deepEqual(core.parseDirectorOutput(plan, scenario.input), plan);
  const generic = { ...good, shots: good.shots.map(shot => ({ ...shot, focus: contract.DIRECTOR_GENERIC_FOCUS_VALUES[0] })) };
  assert.equal(core.parseDirectorOutput(generic, scenario.input), null, "generic focus cannot replace the required fixed detail slot");
  const input = selected(watch, "cinematic-hero", "single", 10);
  const flexible = responseFor({ ...scenario, input });
  const hold = { ...flexible, shots: [{ ...flexible.shots[0], camera: "Slow dolly-in, then a locked final hold" }] };
  assert.ok(core.parseDirectorOutput(hold, input), "a terminal hold is not a conflicting camera trajectory");
});

test("reference-review schema agrees with matched/uncertain business rules", () => {
  const scenario = scenarios[0];
  const input = { ...scenario.input, draft: { ...scenario.input.draft, productReferences: [{
    source: { kind: "uploaded-image" as const, sourceAssetId: "10000000-0000-4000-8000-000000000001" }, sha256: "a".repeat(64), purpose: "detail",
  }] } };
  const api = mockAdapter(() => ({ status: "completed", output_text: "{}" }));
  const schema = api.buildDirectorRequest(input, undefined, true).schema as Schema;
  const response = responseFor(scenario);
  const candidate = { ...response, shots: response.shots.map(shot => ({ ...shot, referenceIndex: null })),
    referenceReviews: [{ index: 0, status: "uncertain", view: "unknown", reason: "Ambiguous crop", details: [] as string[] }] };
  assertSchema({ referenceReviews: wireResponse(candidate).referenceReviews }, schema);
  assert.equal(core.parseDirectorOutput(candidate, input), null); // Uncertain references must not be silently dropped.
  candidate.referenceReviews[0].details = ["new visible notch"];
  // Array cardinality is now enforced by the server, not the provider schema.
  assertSchema({ referenceReviews: wireResponse(candidate).referenceReviews }, schema);
  const failures: core.DirectorValidationFailure[] = [];
  assert.equal(core.parseDirectorOutput(candidate, input, failure => failures.push(failure)), null);
  assert.equal(failures[0].reasonCode, "invalid_reference_reviews");
});

test("provider review slots bind two images to exactly two server-owned ordered indices", async () => {
  const scenario = scenarios[0];
  const pixels = await sharp({ create: { width: 64, height: 64, channels: 3, background: "green" } }).jpeg().toBuffer();
  const refs = [0, 1].map(index => ({ source: { kind: "uploaded-image" as const, sourceAssetId: `10000000-0000-4000-8000-00000000000${index + 2}` }, sha256: "a".repeat(64), purpose: "logo" }));
  const input = { ...scenario.input, draft: { ...scenario.input.draft, productReferences: refs }, referenceImages: refs.map(ref => ({ prepared: pixels, sourceSha256: ref.sha256, purpose: ref.purpose })) };
  const wire = wireResponse(responseFor(scenario));
  let slots: Record<string, unknown> = { r0: { status: "matched", view: "front", reason: "Same product", details: [] }, r1: { status: "matched", view: "back", reason: "Same product rear", details: ["rear panel outline"] } };
  const requests: Array<Record<string, unknown>> = [];
  const api = mockAdapter(() => {
    const { format } = requests.at(-1)!.text as { format: { schema: Schema } };
    const response = format.schema.required?.includes("referenceReviews") ? { referenceReviews: slots } : wire;
    if (response === wire) assertSchema(response, format.schema);
    return { status: "completed", output_text: JSON.stringify(response) };
  }, undefined, requests);
  const schema = api.buildDirectorRequest(input, undefined, true).schema;
  assert.deepEqual([...schema.properties.referenceReviews!.required], ["r0", "r1"]);
  const plan = await api.createOpenAIVideoPlan(input, pixels);
  assert.deepEqual(JSON.parse(JSON.stringify((plan as { referenceReviews: { index: number }[] }).referenceReviews.map(review => review.index))), [0, 1]);
  slots = { ...slots, r0: { status: "matched", view: "front", reason: "Same product outline", details: ["cotton knit"] } };
  const sanitized = await api.createOpenAIVideoPlan(input, pixels);
  assert.ok(Array.isArray(sanitized.shots));
  assert.deepEqual(JSON.parse(JSON.stringify(sanitized.shots)), JSON.parse(JSON.stringify(plan.shots))); // Accuracy claims cannot rewrite directing.
  const fallback = await core.directVideoWithClient(input, { createPlan: async () => sanitized });
  assert.equal(fallback.origin, "ai");
  assert.equal(fallback.referenceReviews!.length, 2);
  assert.equal(fallback.referenceReviews![0].details.length, 0);
  assert.ok(core.compileDirectorPlan(fallback, input).multiPrompt!.every(shot => !shot.prompt.includes("@Element1")));
  slots = { r0: { status: "uncertain", view: "front", reason: "Cannot verify", details: ["cotton knit"] }, r1: slots.r1 };
  const uncertain = await api.createOpenAIVideoPlan(input, pixels);
  await assert.rejects(() => core.directVideoWithClient(input, { createPlan: async () => uncertain }), /references_not_verified/);
  slots = { r0: slots.r0 };
  await assert.rejects(() => api.createOpenAIVideoPlan(input, pixels), /invalid_reference_reviews/);
});

test("all 24 presets have identical creative requests with or without logo/detail/angle references", () => {
  const api = mockAdapter(() => ({ status: "completed", output_text: "{}" }));
  for (const presetId of presets.videoPresetIds) for (const mode of ["single", "multi"] as const) for (const duration of [5, 10] as const) {
    const primary = selected(directorProducts[0], presetId, mode, duration);
    const references = ["logo", "texture", "angle"].map(purpose => ({
      source: { kind: "uploaded-image" as const, sourceAssetId: "10000000-0000-4000-8000-000000000002" }, sha256: "b".repeat(64), purpose,
    }));
    const supplemented = { ...primary, draft: { ...primary.draft, productReferences: references },
      referenceImages: references.map(ref => ({ prepared: Buffer.from("not-planning-pixels"), sourceSha256: ref.sha256, purpose: ref.purpose, profile: watch })) };
    assert.equal(JSON.stringify(api.buildDirectorRequest(supplemented)), JSON.stringify(api.buildDirectorRequest(primary)), `${presetId}/${mode}/${duration}`);
    const review = api.buildDirectorRequest(supplemented, undefined, true);
    assert.deepEqual([...review.schema.required], ["referenceReviews"]);
    assert.equal(Object.hasOwn(review.schema.properties, "shots"), false);
    assert.doesNotMatch(review.context, /preset|shotContract|userRequest|allowedEvidence|existingProfile/);
  }
});

test("real adapter isolates logo pixels and ignores reference-authored shots before compiling the exact primary plan", async () => {
  const primary = scenarios[0].input;
  const pixels = await sharp({ create: { width: 32, height: 32, channels: 3, background: "red" } }).png().toBuffer();
  for (const purpose of ["logo", "label", "texture"]) {
    const supplemented = { ...primary, draft: { ...primary.draft, productReferences: [{
      source: { kind: "uploaded-image" as const, sourceAssetId: "10000000-0000-4000-8000-000000000002" }, sha256: "b".repeat(64), purpose,
    }] }, referenceImages: [{ prepared: pixels, sourceSha256: "b".repeat(64), purpose }] };
    const requests: Record<string, unknown>[] = [];
    const api = mockAdapter(() => ({ status: "completed", output_text: JSON.stringify({ ...wireResponse(responseFor(scenarios[0])),
      referenceReviews: { r0: { status: "matched", view: "detail", reason: "Matching mark crop", details: ["visible label text"] } },
    }) }), undefined, requests);
    const original = await core.directVideoWithClient(primary, { createPlan: input => api.createOpenAIVideoPlan(input, pixels) });
    const plan = await core.directVideoWithClient(supplemented, { createPlan: input => api.createOpenAIVideoPlan(input, pixels) });
    assert.equal(requests.length, 3);
    assert.equal(JSON.stringify(requests[0]), JSON.stringify(requests[1])); // Same source pixels, schema, budget and creative context.
    assert.equal((JSON.stringify(requests[1]).match(/data:image\/jpeg;base64/g) ?? []).length, 1);
    assert.equal((JSON.stringify(requests[2]).match(/data:image\/jpeg;base64/g) ?? []).length, 2);
    assert.equal(JSON.stringify(plan.shots), JSON.stringify(original.shots));
    assert.equal(JSON.stringify(core.compileDirectorPlan(plan, supplemented)), JSON.stringify(core.compileDirectorPlan(original, primary)));
    assert.deepEqual(klingElementReferences(plan.referenceReviews ?? [], supplemented.draft.productReferences), []);
  }
});

test("real adapter binds a verified back only to an existing suitable beat without rewriting any creative field", async () => {
  const supplemented = frontBackInput("b".repeat(64));
  supplemented.draft.prompt = "Create a campaign film"; // Exercise AI planning rather than the saved classic preset.
  const primary = { ...supplemented, draft: { ...supplemented.draft, productReferences: undefined } };
  const response = frontBackResponse(supplemented);
  const shots = response.shots.map((shot, index) => ({ ...shot, referenceIndex: null,
    ...(index === 2 ? { composition: "Complete product with balanced margins", lighting: "Contour light defines the outline" } : {}),
  }));
  const pixels = await sharp({ create: { width: 32, height: 32, channels: 3, background: "black" } }).png().toBuffer();
  supplemented.referenceImages = [{ prepared: pixels, sourceSha256: "b".repeat(64), purpose: "texture" }];
  const api = mockAdapter(() => ({ status: "completed", output_text: JSON.stringify({ ...wireResponse({ ...response, shots }),
    referenceReviews: { r0: { status: "matched", view: "back", reason: "Same complete product", details: ["rear panel outline"] } },
  }) }));
  const original = await core.directVideoWithClient(primary, { createPlan: input => api.createOpenAIVideoPlan(input, pixels) });
  const plan = await core.directVideoWithClient(supplemented, { createPlan: input => api.createOpenAIVideoPlan(input, pixels) });
  assert.equal(plan.shots[2].referenceIndex, 0);
  const creativeShots = plan.shots.map(({ referenceIndex: _index, ...shot }) => { void _index; return shot; });
  assert.equal(JSON.stringify(creativeShots), JSON.stringify(original.shots));
  assert.match(core.compileDirectorPlan(plan, supplemented).multiPrompt![2].prompt, /@Element1: Use back view from reference image 1/);
  assert.equal(klingElementReferences(plan.referenceReviews ?? [], supplemented.draft.productReferences).length, 1);
  const classicInput = { ...supplemented, draft: { ...supplemented.draft, prompt: "" } };
  const classic = await core.directVideoWithClient(classicInput, { createPlan: input => api.createOpenAIVideoPlan(input, pixels) });
  assert.equal(classic.shots[2].referenceIndex, 0);
  const classicCreative = classic.shots.map(({ referenceIndex: _index, ...shot }) => { void _index; return shot; });
  assert.equal(JSON.stringify(classicCreative), JSON.stringify(core.fallbackDirectorPlan(classicInput).shots));
});

test("selected camera, requested evidence and sequence use the same schema and runtime contract", () => {
  const scenario = scenarios[0];
  const input = { ...scenario.input, draft: { ...scenario.input.draft, cameraMovement: "static" as const,
    prompt: "Pan right and keep the blue dial sharp." } };
  const api = mockAdapter(() => ({ status: "completed", output_text: "{}" }));
  const fallback = core.fallbackDirectorPlan(input);
  const { summary, intent, intentContract } = fallback;
  const candidate = { summary, intent, intentContract, shots: fallback.shots.map(({ evidenceRefs, ...shot }) => ({
    ...shot, focus: evidenceRefs.length ? `verified-evidence:${evidenceRefs[0]}` : shot.focus,
  })) };
  assertSchema(wireResponse(candidate), api.buildDirectorRequest(input).schema as Schema);
  const plan = core.parseDirectorOutput(candidate, input);
  assert.ok(plan);
  assert.equal(plan.intentContract.camera, "static");
  assert.ok(plan.shots.every(shot => /locked/i.test(shot.camera)));
  const detail = directorProductContext(input.profile).evidence.find(item => item.detail === "blue dial")!;
  assert.equal(plan.intentContract.focusEvidenceId, detail.id);
  assert.ok(plan.shots.some(shot => shot.focus === detail.detail && shot.evidenceRefs.includes(detail.id)));
  const wrongFocus = { ...candidate, shots: candidate.shots.map(shot => ({ ...shot, focus: contract.DIRECTOR_GENERIC_FOCUS_VALUES[0] })) };
  const failures: core.DirectorValidationFailure[] = [];
  assert.equal(core.parseDirectorOutput(wrongFocus, input, failure => failures.push(failure)), null);
  assert.equal(failures[0].reasonCode, "fixed_macro_template_mismatch");
  const sequence = selected(watch, "cinematic-dial", "single", 5);
  sequence.draft.prompt = "Start close on the blue dial then finish wide.";
  const pullBack = core.fallbackDirectorPlan(sequence);
  assert.deepEqual(core.cameraKinds(pullBack.shots[0].camera), ["dolly-out"]);
  assert.equal(pullBack.shots[0].focus, "blue dial");
  assert.doesNotThrow(() => core.compileDirectorPlan(pullBack, sequence));
  sequence.draft.cameraMovement = "static";
  const locked = core.fallbackDirectorPlan(sequence);
  assert.deepEqual(core.cameraKinds(locked.shots[0].camera), ["static"]);
  assert.equal(locked.shots[0].focus, "blue dial");
  assert.doesNotThrow(() => core.compileDirectorPlan(locked, sequence));
});

test("legacy fixed slots share exact schema and runtime values across supported shot modes", () => {
  const api = mockAdapter(() => ({ status: "completed", output_text: "{}" }));
  for (const [presetId, mode, duration] of [
    ["luxury-fashion-film", "single", 5],
    ["material-detail", "single", 5],
    ["macro-detail-reveal", "multi", 5],
    ["macro-stitching", "single", 10],
  ] as const) {
    const input = selected(directorProducts[0], presetId, mode, duration);
    for (const explicit of [false, true]) {
      input.draft.cameraMovement = explicit ? "pan-right" : "auto";
      input.draft.prompt = explicit ? "Keep the front belt knot sharp" : "";
      const fallback = core.fallbackDirectorPlan(input);
      const request = api.buildDirectorRequest(input);
      const schema = request.schema as Schema;
      const { summary, intent, intentContract } = fallback;
      const candidate = { summary, intent, intentContract, shots: fallback.shots.map(({ evidenceRefs, ...shot }) => ({
        ...shot, focus: evidenceRefs.length ? `verified-evidence:${evidenceRefs[0]}` : shot.focus,
      })) };
      assertSchema(wireResponse(candidate), schema);
      assert.deepEqual(core.parseDirectorOutput(candidate, input)?.shots, fallback.shots, presetId);
      if (explicit) {
        assert.ok(candidate.shots.every(shot => core.cameraKinds(shot.camera).join() === "pan-right"));
        const belt = directorProductContext(input.profile).evidence.find(item => item.detail === "front belt knot")!;
        assert.ok(candidate.shots.some(shot => shot.focus === `verified-evidence:${belt.id}`));
      }

      const otherEvidence = directorProductContext(input.profile).evidence.find(item =>
        `verified-evidence:${item.id}` !== candidate.shots[0].focus)!;
      for (const change of [
        { lighting: "Soft diffuse studio light" },
        { durationSeconds: duration - 1 },
        { focus: `verified-evidence:${otherEvidence.id}` },
        { camera: "Pan left within the existing visible product view" },
        { camera: "Orbit 360 degrees into the rear view" },
      ]) {
        const modified = { ...candidate, shots: candidate.shots.map((shot, index) => index ? shot : { ...shot, ...change }) };
        assert.throws(() => assertSchema(wireResponse(modified), schema));
        assert.equal(core.parseDirectorOutput(modified, input), null);
        assert.equal(core.parseDirectorOutput({ ...fallback, shots: modified.shots }, input), null);
      }
      const key = receipts.directorCacheKey("owner", "hash", "offline", input);
      const signed = receipts.sealDirectorPlan(key, fallback, "offline-secret", 1000);
      assert.deepEqual(receipts.openDirectorPlan(signed, key, input, "offline-secret", 2000), fallback);
    }
  }
});

test("historical signed fixed plans retain previously allowed verified focus", () => {
  const input = scenarios[0].input;
  const fallback = core.fallbackDirectorPlan(input);
  const detailIndex = fallback.shots.findIndex(shot => shot.evidenceRefs.length);
  assert.ok(detailIndex >= 0);
  const alternate = directorProductContext(input.profile).evidence.find(item =>
    /dial|marker|indices/i.test(item.detail) && !fallback.shots[detailIndex].evidenceRefs.includes(item.id))!;
  assert.ok(alternate);
  const shots = fallback.shots.map((shot, index) => index === detailIndex
    ? { ...shot, focus: alternate.detail, evidenceRefs: [alternate.id] } : shot);
  const historical = { ...fallback, origin: "ai" as const, shots };
  const { summary, intent, intentContract } = historical;
  assert.equal(core.parseDirectorOutput({ summary, intent, intentContract, shots }, input), null);
  const key = receipts.directorCacheKey("owner", "hash", "offline", input);
  const signed = receipts.sealDirectorPlan(key, historical, "offline-secret", 1000);
  const opened = receipts.openDirectorPlan(signed, key, input, "offline-secret", 2000);
  assert.deepEqual(opened, historical);
  assert.doesNotThrow(() => core.compileDirectorPlan(opened!, input));
});

test("server field bounds preserve the same primary budget with accuracy references", () => {
  const api = mockAdapter(() => ({ status: "completed", output_text: "{}" }));
  const evidenceDetail = "visible surface relief " + "x".repeat(77);
  assert.equal(evidenceDetail.length, 100);
  const profile = { ...watch, identityCriticalAttributes: [{ attribute: evidenceDetail, rationale: "visible", regions: [] }] };
  for (const marked of [false, true]) for (const references of [false, true]) for (const cameraMovement of ["auto", "static", "pan-right"] as const) {
    const input = selected(profile, "cinematic-hero", "multi", 5);
    input.draft.cameraMovement = cameraMovement;
    if (marked) input.draft.criticalRegion = { x: 0.1, y: 0.1, width: 0.2, height: 0.2, declaredText: "" };
    if (references) input.draft.productReferences = [{ source: { kind: "uploaded-image", sourceAssetId: "10000000-0000-4000-8000-000000000001" }, sha256: "a".repeat(64), purpose: "detail" }];
    const request = api.buildDirectorRequest(input);
    const fields = Object.fromEntries(contract.shotFields.map(field => [field, field === "focus" ? evidenceDetail : "x".repeat(request.fieldLimits[field])]));
    const prompt = compiler.compileKlingShot({ ...fields, durationSeconds: 3, purpose: "hero-reveal", evidenceRefs: [0] } as core.VideoDirectorShot, 512, marked);
    assert.ok(prompt.length <= 512);
    const id = directorProductContext(profile).evidence.find(item => item.detail === evidenceDetail)!.id;
    const candidate = { summary: "A source-facing cinematic study", intent: "Resolve the existing form with measured light",
      intentContract: creative.interpretCreativeIntent("", directorProductContext(profile).evidence, "multi", cameraMovement),
      ...(references ? { referenceReviews: [{ index: 0, status: "matched", view: "unknown", reason: "Consistent visible identity", details: [] }] } : {}),
      shots: ["hero-reveal", "macro-detail", "final-hero"].map((purpose, index) => ({ ...fields, ...(references ? { referenceIndex: null } : {}), purpose, durationSeconds: [2, 2, 1][index],
        focus: `verified-evidence:${id}`, composition: String(fields.composition).slice(1) + String(index) })),
    };
    const { referenceReviews: _reviews, ...primaryWire } = wireResponse(candidate);
    void _reviews;
    assertSchema({ ...primaryWire, shots: primaryWire.shots.map(({ referenceIndex: _index, ...shot }) => { void _index; return shot; }) }, request.schema as Schema);
    const plan = core.parseDirectorOutput(candidate, input);
    assert.ok(plan);
    assert.ok(core.compileDirectorPlan(plan, input).multiPrompt!.every(shot => shot.prompt.length <= 512));
  }
});

test("provider, parsing and compiler failures retain their actual stage", async () => {
  const scenario = scenarios[0];
  for (const [error, stage, reason] of [
    [new Error("provider timeout"), "director_provider_response_received", "provider_error"],
    [new contract.DirectorStructuredOutputError("incomplete_structured_output"), "structured_output_parsed", "incomplete_structured_output"],
    [new SyntaxError("invalid JSON"), "structured_output_parsed", "invalid_structured_output"],
  ] as const) {
    const events: core.DirectorPlanningDiagnostic[] = [];
    const plan = await core.directVideoWithClient(scenario.input, { createPlan: async () => { throw error; } }, event => events.push(event));
    assert.equal(plan.origin, "fallback");
    assert.ok(events.some(event => event.stage === stage && event.reasonCode === reason));
    assert.ok(!events.some(event => event.stage === "director_business_validation"));
  }
  const input = selected(watch, "cinematic-hero", "multi", 5);
  const candidate = responseFor({ ...scenario, input });
  candidate.shots[0].camera = "Locked framing. ".repeat(6).trim();
  candidate.shots[0].composition = "Clear space ".repeat(8);
  candidate.shots[0].lighting = "Soft light ".repeat(9);
  candidate.shots[0].motion = "Product stays still. ".repeat(4);
  candidate.shots[0].pace = "Measured pace. ".repeat(6);
  const parsed = core.parseDirectorOutput(candidate, input);
  assert.ok(parsed);
  assert.throws(() => core.compileDirectorPlan(parsed, input), /kling_scene_prompt_too_long/);
  const events: core.DirectorPlanningDiagnostic[] = [];
  const plan = await core.directVideoWithClient(input, { createPlan: async () => candidate }, event => events.push(event));
  assert.equal(plan.origin, "fallback");
  assert.ok(events.some(event => event.stage === "plan_integrity_validation" && event.reasonCode === "kling_scene_prompt_too_long"));
});

test("mock adapter attributes incomplete, empty and malformed responses to parsing", async () => {
  const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
  for (const [response, reasonCode] of [
    [{ status: "incomplete", output_text: "{}" }, "incomplete_structured_output"],
    [{ status: "completed", output_text: "" }, "empty_structured_output"],
    [{ status: "completed", output_text: "{" }, "invalid_structured_output"],
  ] as const) {
    const api = mockAdapter(() => response);
    const events: core.DirectorPlanningDiagnostic[] = [];
    const plan = await core.directVideoWithClient(scenarios[0].input, { createPlan: input => api.createOpenAIVideoPlan(input, image) }, event => events.push(event));
    assert.equal(plan.origin, "fallback");
    assert.ok(events.some(event => event.stage === "structured_output_parsed" && event.reasonCode === reasonCode), JSON.stringify(events));
    assert.ok(!events.some(event => event.stage === "director_business_validation"));
  }
});

test("Responses content, token truncation, filter and refusal are handled without logging content", async () => {
  const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
  const candidate = responseFor(scenarios[0]);
  const diagnostics: Array<Record<string, unknown>> = [];
  const api = mockAdapter(() => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(wireResponse(candidate)) }] }] }), diagnostics);
  const accepted = await core.directVideoWithClient(scenarios[0].input, { createPlan: input => api.createOpenAIVideoPlan(input, image, "test-correlation") });
  assert.equal(accepted.origin, "ai");
  assert.equal(diagnostics[1].outputContentTypes, "output_text");
  assert.ok(!JSON.stringify(diagnostics).includes(candidate.summary));

  for (const [response, reason] of [
    [{ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_text: "{", usage: { output_tokens: 2200 } }, "incomplete_max_output_tokens"],
    [{ status: "incomplete", incomplete_details: { reason: "content_filter" }, output_text: "{" }, "incomplete_content_filter"],
    [{ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "private text" }] }] }, "structured_output_refusal"],
    [{ status: "completed", output_text: "{" }, "invalid_structured_output"],
    [{ status: "completed", output_text: JSON.stringify(candidate) }, "invalid_structured_output"],
  ] as const) {
    let calls = 0;
    const logs: Array<Record<string, unknown>> = [];
    const client = mockAdapter(() => { calls++; return response; }, logs);
    await assert.rejects(client.createOpenAIVideoPlan(scenarios[0].input, image, "test-correlation"), (error: unknown) => error instanceof contract.DirectorStructuredOutputError && error.reasonCode === reason);
    assert.equal(calls, 1);
    assert.ok(!JSON.stringify(logs).includes("private text"));
    if (reason === "incomplete_max_output_tokens") {
      assert.equal(logs[1].incompleteReason, "max_output_tokens");
      assert.equal(logs[1].outputTokens, 2200);
      assert.equal(logs[1].maxOutputTokens, 4000);
    }
  }
});

test("SDK and guarded transport send strict json_schema with the actual Director schema", async () => {
  const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
  const owner = "10000000-0000-4000-8000-000000000001";
  const env = { VIDEO_STUDIO_ENABLED: "true", VIDEO_STUDIO_ACCESS_MODE: "authenticated" };
  let sent: Record<string, unknown> | undefined, reservations = 0;
  const guarded = createOpenAIBetaFetch({ env, authenticate: async () => owner,
    policyForUser: () => getVideoStudioOpenAIPolicy(owner, "gpt-4o-mini", env), analysisMaxOutputTokens: 4000,
    reserve: async () => { reservations++; return true; },
    send: async (_url, init) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ object: "response", status: "completed", output: [{ type: "message", status: "completed",
        content: [{ type: "output_text", text: JSON.stringify(wireResponse(responseFor(scenarios[0]))) }] }] });
    },
  });
  const sdk = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch: guarded });
  const api = mockAdapter(() => { throw new Error("mock adapter must not be called"); }, undefined, undefined, sdk);
  await api.createOpenAIVideoPlan(scenarios[0].input, image);
  assert.equal(reservations, 1);
  const format = (sent?.text as { format: { type: string; strict: boolean; schema: unknown } }).format;
  assert.equal(format.type, "json_schema");
  assert.equal(format.strict, true);
  assert.deepEqual(JSON.parse(JSON.stringify(format.schema)), JSON.parse(JSON.stringify(api.buildDirectorRequest(scenarios[0].input).schema)));
  assert.equal(sent?.max_output_tokens, 4000);
});

test("output metadata distinguishes whitespace, empty content and incomplete output without logging text", async () => {
  const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
  for (const [status, raw, expected] of [["completed", " \n ", "empty_structured_output"],
    ["incomplete", "", "incomplete_max_output_tokens"], ["completed", "", "empty_structured_output"]] as const) {
    const logs: Array<Record<string, unknown>> = [];
    const api = mockAdapter(() => ({ status, output_text: raw, output: [{ type: "message", status: "incomplete", content: [{ type: "output_text", text: raw }] }],
      ...(status === "incomplete" ? { incomplete_details: { reason: "max_output_tokens" } } : {}) }), logs);
    await assert.rejects(api.createOpenAIVideoPlan(scenarios[0].input, image, "test"), (error: unknown) => error instanceof contract.DirectorStructuredOutputError && error.reasonCode === expected);
    assert.equal(logs[1].sdkOutputCharacters, raw.length);
    assert.equal(logs[1].contentCharacters, raw.length);
    assert.equal(logs[1].trimmedOutputCharacters, 0);
    assert.equal(logs[1].whitespaceOnly, String(raw.length > 0));
    assert.equal(logs[1].usagePresent, "false");
    assert.deepEqual(JSON.parse(String(logs[1].outputItems)), [{ type: "message", status: "incomplete", parts: [{ type: "output_text", characters: raw.length }] }]);
  }
});

test("incomplete Responses metadata survives SDK and quota transport including zero usage", async () => {
  const fixture = { id: "resp_test_metadata_123", object: "response", model: "gpt-4o-mini-2024-07-18", status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" }, usage: { input_tokens: 321, output_tokens: 0, total_tokens: 321 },
    output: [{ type: "message", status: "incomplete", content: [{ type: "output_text", text: "", annotations: [] }] }] };
  const env = { VIDEO_STUDIO_ENABLED: "true", VIDEO_STUDIO_ACCESS_MODE: "authenticated" };
  const owner = "10000000-0000-4000-8000-000000000001";
  let reservations = 0;
  const guarded = createOpenAIBetaFetch({ env, authenticate: async () => owner,
    policyForUser: () => getVideoStudioOpenAIPolicy(owner, "gpt-4o-mini", env), analysisMaxOutputTokens: 4000,
    reserve: async () => { reservations++; return true; }, send: async () => Response.json(fixture) });
  const sdk = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch: guarded });
  const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
  const logs: Array<Record<string, unknown>> = [];
  const api = mockAdapter(() => { throw new Error("unused"); }, logs, undefined, sdk);
  await assert.rejects(api.createOpenAIVideoPlan(scenarios[0].input, image, "test"), (error: unknown) =>
    error instanceof contract.DirectorStructuredOutputError && error.reasonCode === "incomplete_max_output_tokens");
  assert.equal(reservations, 1);
  assert.equal(logs[1].responseId, fixture.id);
  assert.equal(logs[1].outputTokens, 0);
  assert.equal(logs[1].sdkOutputCharacters, 0);
  assert.equal(logs[1].contentCharacters, 0);
});

test("offline Chat Completions alternative keeps the plan contract and rejects incomplete output", async () => {
  const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
  const env = { VIDEO_STUDIO_ENABLED: "true", VIDEO_STUDIO_ACCESS_MODE: "authenticated" };
  const owner = "10000000-0000-4000-8000-000000000001";
  let finish = "stop", count = 0, captured: Record<string, unknown> | undefined;
  const guarded = createOpenAIBetaFetch({ env, authenticate: async () => owner,
    policyForUser: () => getVideoStudioOpenAIPolicy(owner, "gpt-4o-mini", env), analysisMaxOutputTokens: 4000, allowDirectorChat: true,
    reserve: async () => { count++; return true; }, send: async (_url, init) => {
      captured = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ id: "chatcmpl_test", object: "chat.completion", model: "gpt-4o-mini", created: 1,
        choices: [{ index: 0, finish_reason: finish, message: { role: "assistant", content: JSON.stringify(wireResponse(responseFor(scenarios[0]))), refusal: null } }],
        usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 } });
    } });
  const sdk = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch: guarded });
  const api = mockAdapter(() => { throw new Error("unused"); });
  const chat = isolated<{ createChatVideoPlan(input: core.VideoDirectorInput, source: Buffer): Promise<unknown> }>("src/lib/video-director/openai-director-chat.ts", {
    "@/lib/openai/client": { getOpenAIVideoStudioAnalysisClient: () => sdk },
    "@/lib/openai/response-telemetry": { attachOpenAIResponseTelemetry: (value: unknown) => value },
    "@/lib/generation/prompts/prompt-enhancer-config": { getPromptEnhancementModel: () => "gpt-4o-mini" },
    "./openai-director": api, "./plan-contract": contract, "./core": core,
  });
  const plan = await core.directVideoWithClient(scenarios[0].input, { createPlan: input => chat.createChatVideoPlan(input, image) });
  assert.equal(plan.origin, "ai");
  assert.equal((captured?.response_format as { type: string }).type, "json_schema");
  assert.equal(captured?.max_completion_tokens, 4000);
  finish = "length";
  await assert.rejects(chat.createChatVideoPlan(scenarios[0].input, image), (error: unknown) =>
    error instanceof contract.DirectorStructuredOutputError && error.reasonCode === "incomplete_max_output_tokens");
  assert.equal(count, 2);
});

test("10s multi and pilot 5s montage use the larger bounded output without raising the transport ceiling", async () => {
  const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
  for (const [scenario, expected] of [[scenarios[0], 4000], [scenarios[2], 2200],
    [{ ...scenarios[0], input: selected(watch, "cinematic-hero", "multi", 5) }, 4000],
    [{ ...scenarios[0], input: selected(watch, "minimal-studio", "multi", 5) }, 2200]] as const) {
    const requests: Array<Record<string, unknown>> = [];
    const logs: Array<Record<string, unknown>> = [];
    const api = mockAdapter(() => ({ status: "incomplete", output_text: "{", incomplete_details: { reason: "max_output_tokens" }, usage: { output_tokens: 0 } }), logs, requests);
    await assert.rejects(api.createOpenAIVideoPlan(scenario.input, image, "test-correlation"));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].purpose, "director");
    assert.equal(requests[0].max_output_tokens, expected);
    assert.equal(logs[1].outputTokens, 0);
    assert.equal(logs[1].maxOutputTokens, expected);
  }
});

test("cached fallback never repeats its single charged repair", async () => {
  let calls = 0;
  const events: Array<{ stage: string; fields: Record<string, unknown> }> = [];
  const input = scenarios[0].input;
  const api = isolated<typeof runtime>("src/lib/video-director/runtime.ts", {
    "@/lib/openai/beta-policy": { getVideoStudioOpenAIPolicy: () => ({ limits: { analysis: { user: 24, global: 120 } } }) },
    "@/lib/generation/prompts/prompt-enhancer-config": { getPromptEnhancementModel: () => "mock-model" },
    "@/lib/video-generation/diagnostics": { logVideoDiagnostic: (_id: string, stage: string, _result: string, fields: Record<string, unknown>) => events.push({ stage, fields }) },
    "./core": core, "./receipt": receipts, "./openai-director": { createOpenAIVideoPlan: async () => {
      calls++; return { ...responseFor(scenarios[0]), summary: "A titanium watch" };
    } },
  }, { OPENAI_API_KEY: "mock-only", SUPABASE_SECRET_KEY: "offline-secret" });
  for (let n = 0; n < 2; n++) {
    const result = await api.prepareVideoDirectorPlan("owner", Buffer.alloc(0), "hash", input, undefined, true, { correlationId: `mock-${n}` });
    assert.equal(result.plan.origin, "fallback");
    const event = events.filter(event => event.stage === "director_fallback").at(-1)!;
    assert.equal(event.fields.code, "unsupported_product_claim");
    assert.equal(event.fields.failedStage, "director_business_validation");
    assert.equal(event.fields.jsonPath, "$.summary");
  }
  assert.equal(calls, 2);
});

test("one evidence repair uses the same guarded SDK and reserves quota for both attempts", async () => {
  const input = selected(watch, "cinematic-hero", "single", 10);
  const owner = "10000000-0000-4000-8000-000000000001";
  const env = { VIDEO_STUDIO_ENABLED: "true", VIDEO_STUDIO_ACCESS_MODE: "authenticated" };
  const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
  for (const accepted of [true, false]) {
    let calls = 0, reservations = 0;
    const requests: Array<Record<string, unknown>> = [];
    const guarded = createOpenAIBetaFetch({ env, authenticate: async () => owner,
      policyForUser: () => getVideoStudioOpenAIPolicy(owner, "gpt-4o-mini", env), analysisMaxOutputTokens: 4000,
      reserve: async () => { reservations++; return true; }, send: async (_url, init) => {
        const request = JSON.parse(String(init?.body));
        requests.push(request);
        calls++;
        const candidate = responseFor({ ...scenarios[0], input });
        // Free creative fields pass the schema but still have to pass evidence validation.
        if (calls === 1 || !accepted) candidate.shots[0].motion = "Light traces the seam";
        const wire = wireResponse(candidate);
        assertSchema(wire, request.text.format.schema);
        return Response.json({ object: "response", status: "completed", output: [{ type: "message", status: "completed",
          content: [{ type: "output_text", text: JSON.stringify(wire) }] }] });
      } });
    const sdk = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch: guarded });
    const api = mockAdapter(() => { throw new Error("unused"); }, undefined, undefined, sdk);
    const events: core.DirectorPlanningDiagnostic[] = [];
    const plan = await core.directVideoWithClient(input, {
      createPlan: value => api.createOpenAIVideoPlan(value, image),
      repairPlan: (value, failure) => api.createOpenAIVideoPlan(value, image, undefined, failure),
    }, event => events.push(event));
    assert.equal(plan.origin, accepted ? "ai" : "fallback");
    assert.equal(calls, 2);
    assert.equal(reservations, 2);
    const contexts = requests.map(request => JSON.parse((request.input as Array<{ content: Array<{ text: string }> }>)[0].content[0].text));
    assert.deepEqual(contexts[0].allowedEvidence, directorProductContext(input.profile).evidence.map(item => item.detail));
    assert.deepEqual(contexts[0].allowedEvidence, contexts[1].allowedEvidence);
    assert.equal(contexts[1].repairFeedback.jsonPath, "$.shots[0].motion");
    assert.equal(contexts[1].repairFeedback.matchedTerm, "seam");
    assert.equal(events.filter(event => event.reasonCode === "repair_started").length, 1);
    assert.ok(events.some(event => event.stage === "director_business_validation" && event.matchedTerm === "seam"));
  }
});

test("other validation errors never trigger a repair", async () => {
  let repairs = 0;
  const candidate = responseFor(scenarios[0]);
  candidate.shots[0].durationSeconds = 0;
  const result = await core.directVideoWithClient(scenarios[0].input, {
    createPlan: async () => candidate, repairPlan: async () => { repairs++; return candidate; },
  });
  assert.equal(result.origin, "fallback");
  assert.equal(repairs, 0);
});

function customMotionScenario() {
  const base = directorFixtureInput(directorProducts[0]);
  const input: core.VideoDirectorInput = { ...base, presetId: "custom", draft: { ...base.draft,
    creativeMode: "custom", durationSeconds: 10,
    prompt: "Premium fashion film in rainy New York at night, then a moody studio hero." } };
  const response = {
    ...core.directorPlanDescriptions(input, 3),
    intentContract: creative.interpretCreativeIntent(input.draft.prompt, directorProductContext(input.profile).evidence),
    shots: [3, 3, 4].map((durationSeconds, index) => ({ durationSeconds,
      purpose: (["hero-reveal", "lighting-reveal", "final-hero"] as const)[index],
      camera: ["Slow dolly-in", "Short lateral camera glide", "Slow pull-back to full hero framing"][index],
      composition: ["Complete silhouette with diagonal space", "Medium contour view with offset margins", "Full product with balanced campaign space"][index],
      lighting: "Soft side light shapes the contour", motion: "Keep the product still",
      pace: "Measured moving reveal", focus: "Source-visible product form",
    })),
  };
  return { input, response };
}

for (const repairedMotion of ["A soft highlight travels across the surface", "Rotate the product through a full 360"]) {
  test(`Custom unsafe motion gets at most one repair without another reference review: ${repairedMotion}`, async () => {
    const { input, response } = customMotionScenario();
    const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
    input.draft.productReferences = [{ source: { kind: "uploaded-image", sourceAssetId: "10000000-0000-4000-8000-000000000003" },
      sha256: "b".repeat(64), purpose: "logo" }];
    input.referenceImages = [{ prepared: image, sourceSha256: "b".repeat(64), purpose: "logo" }];
    const requests: Array<Record<string, unknown>> = [];
    const diagnostics: core.DirectorPlanningDiagnostic[] = [];
    let calls = 0;
    const api = mockAdapter(() => {
      calls++;
      if (calls === 2) return { status: "completed", output_text: JSON.stringify({ referenceReviews: {
        r0: { status: "matched", view: "detail", reason: "Same visible identity", details: [] },
      } }) };
      if (calls === 3) return { status: "completed", output_text: JSON.stringify({ actionRepairs: [{ shotIndex: 2, field: "motion", value: repairedMotion }] }) };
      const result = { ...response, shots: response.shots.map((shot, index) => index === 2
        ? { ...shot, motion: calls === 1 ? "Rotate the product through a full 360" : repairedMotion } : shot) };
      return { status: "completed", output_text: JSON.stringify(wireResponse(result)) };
    }, undefined, requests);
    const run = () => core.directVideoWithClient(input, {
      createPlan: value => api.createOpenAIVideoPlan(value, image),
      repairPlan: (value, failure) => api.createOpenAIActionRepairs(value, image, failure),
    }, event => diagnostics.push(event));
    if (repairedMotion.startsWith("Rotate")) {
      await assert.rejects(run, /custom_director_unavailable/);
    } else {
      const plan = await run();
      assert.equal(plan.presetId, "custom");
      assert.equal(plan.origin, "ai");
      assert.equal(plan.shots[2].motion, repairedMotion);
      assert.deepEqual(JSON.parse(JSON.stringify(plan.referenceReviews)), [{ index: 0, status: "matched", view: "detail", reason: "Same visible identity", details: [] }]);
      const key = receipts.directorCacheKey("owner", "source", "model", input);
      const receipt = receipts.sealDirectorPlan(key, plan, "offline-secret", 1000, input.profile);
      assert.ok(receipts.openDirectorPlan(receipt, key, input, "offline-secret", 2000));
      const changedInput = { ...input, draft: { ...input.draft, prompt: "Different creative intent" } };
      assert.equal(receipts.openDirectorPlan(receipt, receipts.directorCacheKey("owner", "source", "model", changedInput),
        changedInput, "offline-secret", 2000), null);
      assert.doesNotThrow(() => core.compileDirectorPlan(plan, input));
    }
    assert.equal(calls, 3, "one primary plan, one review and one creative repair only");
    const contexts = requests.map(request => JSON.parse((request.input as { content: { text: string }[] }[])[0].content[0].text));
    assert.equal(contexts.filter(context => context.referenceImages?.length).length, 1);
    assert.equal(contexts[2].userRequest, undefined);
    assert.equal(contexts[2].preset, undefined);
    assert.equal(contexts[2].jsonPath, "$.shots[2].motion");
    assert.equal(contexts[2].reasonCode, "unsafe_product_action");
    assert.equal(contexts[2].targets[0].expected, "source-facing action without hidden surfaces or identity changes");
    assert.equal(diagnostics.filter(event => event.reasonCode === "repair_started").length, 1);
  });
}

test("valid Custom motion needs no repair and unsafe Preset motion keeps its original fallback policy", async () => {
  const { input, response } = customMotionScenario();
  let repairs = 0;
  const plan = await core.directVideoWithClient(input, { createPlan: async () => response,
    repairPlan: async () => { repairs++; return response; } });
  assert.equal(plan.origin, "ai");
  assert.equal(repairs, 0);
  const presetInput = scenarios[0].input;
  const presetResponse = responseFor(scenarios[0]);
  presetResponse.shots[2].motion = "Rotate the product through a full 360";
  const preset = await core.directVideoWithClient(presetInput, { createPlan: async () => presetResponse,
    repairPlan: async () => { repairs++; return presetResponse; } });
  assert.equal(preset.origin, "fallback");
  assert.equal(repairs, 0);
});

test("Custom runtime passes original reviewed references into its only repair and seals the accepted plan", async () => {
  const { input, response } = customMotionScenario();
  input.draft.productReferences = [{ source: { kind: "uploaded-image", sourceAssetId: "10000000-0000-4000-8000-000000000003" },
    sha256: "b".repeat(64), purpose: "logo" }];
  const reviews = [{ index: 0, status: "matched" as const, view: "detail" as const, reason: "Same visible identity", details: [] }];
  let calls = 0;
  const api = isolated<typeof runtime>("src/lib/video-director/runtime.ts", {
    "@/lib/openai/beta-policy": { getVideoStudioOpenAIPolicy: () => ({ limits: { analysis: { user: 24, global: 120 } } }) },
    "@/lib/generation/prompts/prompt-enhancer-config": { getPromptEnhancementModel: () => "mock-model" },
    "@/lib/video-generation/diagnostics": { logVideoDiagnostic: () => {} },
    "./core": core, "./receipt": receipts, "./openai-director": {
      createOpenAIActionRepairs: async (_input: core.VideoDirectorInput, _source: Buffer, failure: core.DirectorValidationFailure) => {
        calls++;
        assert.equal(failure.reasonCode, "unsafe_product_action");
        return { actionRepairs: [{ shotIndex: 2, field: "motion", value: response.shots[2].motion }] };
      },
      createOpenAIVideoPlan: async (_input: core.VideoDirectorInput, _source: Buffer, _id: string | undefined,
        failure?: core.DirectorValidationFailure, reviewed?: typeof reviews) => {
        calls++;
        if (!failure) return { ...response, referenceReviews: reviews,
          shots: response.shots.map((shot, index) => index === 2 ? { ...shot, motion: "Rotate the product" } : shot) };
        assert.equal(failure.reasonCode, "unsafe_product_action");
        assert.deepEqual(reviewed, reviews);
        return response; // Core retains the original reviews even if repair omits them.
      },
    },
  }, { OPENAI_API_KEY: "mock-only", SUPABASE_SECRET_KEY: "offline-secret" });
  const result = await api.prepareVideoDirectorPlan("owner", Buffer.alloc(0), "source-hash", input);
  assert.equal(calls, 2);
  assert.equal(result.plan.presetId, "custom");
  assert.deepEqual(result.plan.referenceReviews, reviews);
  const key = receipts.directorCacheKey("owner", "source-hash", "mock-model", input);
  assert.ok(receipts.openDirectorPlan(result.receipt, key, input, "offline-secret"));
});

test("Custom numbered 10s brief fixes the 2-5 scene count without changing preset contracts", () => {
  for (const count of [2, 3, 4, 5]) {
    const request = Array.from({ length: count }, (_, i) => `Shot ${i + 1}: Creative beat ${i + 1}.`).join("\n");
    assert.equal(numberedCreativeBeats(request).length, count);
    const bounds = contract.directorShotContract("multi", 10, "custom", request);
    assert.equal(bounds.minShots, count);
    assert.equal(bounds.maxShots, count);
    assert.equal(bounds.minDuration, 1);
    for (const presetId of presets.videoPresetIds) for (const seconds of [5, 10] as const) {
      assert.deepEqual(contract.directorShotContract("multi", seconds, presetId, request), contract.directorShotContract("multi", seconds, presetId));
    }
  }
  for (const invalid of ["Shot 1: One", "Shot 1: One Shot 3: Three", "Shot 1: One Shot 2:",
    "Shot 2: Two Shot 1: One", "Shot 1: One Shot 1: Again", Array.from({ length: 6 }, (_, i) => `Shot ${i + 1}: Beat`).join("\n")]) {
    assert.deepEqual(numberedCreativeBeats(invalid), []);
  }
  assert.equal(contract.directorShotContract("multi", 10, "custom").maxShots, 5);
  assert.equal(contract.directorShotContract("multi", 5, "custom").maxShots, 2);
  assert.equal(contract.directorShotContract("single", 10, "custom", customFourShotBrief).maxShots, 1);
});

test("Custom request treats numbered beats as the creative authority and evidence as preservation only", () => {
  const { input } = customFourShotFixture();
  const api = mockAdapter(() => { throw new Error("No provider call allowed"); });
  const request = api.buildDirectorRequest(input);
  const context = JSON.parse(request.context);
  assert.equal(context.shotContract.minShots, 4);
  assert.equal(context.shotContract.maxShots, 4);
  assert.equal(context.userRequest, customFourShotBrief);
  assert.deepEqual(context.requestedShots.map((shot: { index: number }) => shot.index), [0, 1, 2, 3]);
  assert.deepEqual(context.requestedShots.map((shot: { userRequest: string }) => shot.userRequest), numberedCreativeBeats(customFourShotBrief));
  assert.equal(context.intentContract.camera, "auto", "final 360 must not dictate every camera");
  assert.equal(context.requestedShots[3].intentContract.safeAdjustment, "unseen-side-to-source-facing-camera");
  assert.equal(context.preset, undefined);
  assert.doesNotMatch(request.instructions, /use another verified detail|each dedicated detail|Choose real product-specific opportunities/);
  assert.match(request.instructions, /requestedShots\[i\] MUST map to shots\[i\]/);
  assert.match(request.instructions, /adapt only that action/);
  assert.match(request.instructions, /declaredText preserves lettering only/);
  const focusSchema = request.schema as Schema;
  assert.deepEqual([...focusSchema.properties!.shots.items!.properties!.focus.enum!], [...contract.DIRECTOR_GENERIC_FOCUS_VALUES]);
  assert.equal(customCreativeIntent("Close-up of the street grate", directorProductContext(input.profile).evidence, "single", "auto").focusEvidenceId, null);
});

test("Custom four-beat acceptance fixture compiles into four ordered Kling scenes, including the 1s transition", () => {
  const { input, response } = customFourShotFixture();
  const failures: core.DirectorValidationFailure[] = [];
  const plan = core.parseDirectorOutput(response, input, failure => failures.push(failure));
  assert.ok(plan, JSON.stringify(failures));
  assert.equal(plan.shots.length, 4);
  assert.equal(plan.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0), 10);
  const compiled = core.compileDirectorPlan(plan, input);
  const falInput = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: "kling-v3-standard-image",
    endpointId: "offline", sourceUrl: "https://invalid.example/product" });
  const payload = falInput.multi_prompt!;
  assert.equal(payload.length, 4);
  assert.ok(payload.every(scene => scene.prompt.length <= 512));
  assert.equal(payload.reduce((sum, scene) => sum + Number(scene.duration), 0), 10);
  assert.match(payload[0].prompt, /rainy NYC.*walk|walk.*rainy NYC/i);
  assert.match(payload[1].prompt, /diagonal.*pose/i);
  assert.match(payload[1].prompt, /then walks/i);
  assert.match(payload[2].prompt, /steaming street grate/i);
  assert.match(payload[2].prompt, /foot contact.*darkness/i);
  assert.match(payload[3].prompt, /model-free dark studio.*product reveal/i);
  assert.match(payload[3].prompt, /source-facing/i);
  assert.ok(plan.shots.every(shot => shot.camera !== "auto" && shot.evidenceRefs.length === 0));
  assert.doesNotMatch(payload.map(scene => scene.prompt).join(" "), /\bbutton|collar|logo focus|\b360\b/i);
  assert.equal(core.parseDirectorOutput({ ...response, shots: response.shots.slice(0, 3) }, input), null);
  assert.equal(core.parseDirectorOutput({ ...response, shots: response.shots.map((shot, i) => i === 2 ? { ...shot, durationSeconds: 2 } : shot) }, input), null);
});

test("Custom blocks unrequested verified detail focus but preserves an explicitly requested one at its beat", () => {
  const { input, response } = customFourShotFixture();
  const button = directorProductContext(input.profile).evidence.find(item => /button/i.test(item.detail))!;
  const candidate = { ...response, shots: response.shots.map((shot, i) => i === 3
    ? { ...shot, focus: `verified-evidence:${button.id}`, evidenceRefs: [] } : shot) };
  const failures: core.DirectorValidationFailure[] = [];
  assert.equal(core.parseDirectorOutput(candidate, input, failure => failures.push(failure)), null);
  assert.equal(failures[0].reasonCode, "unrequested_detail_focus");
  const genericDetail = { ...response, shots: response.shots.map((shot, i) => i === 3
    ? { ...shot, composition: "Close focus on the visible buttons" } : shot) };
  assert.equal(core.parseDirectorOutput(genericDetail, input), null);
  const prompt = input.draft.prompt.replace("product reveal with a product 360", "close-up of the two visible front buttons");
  const explicitInput = { ...input, draft: { ...input.draft, prompt } };
  const explicit = { ...candidate, intentContract: customCreativeIntent(prompt, directorProductContext(input.profile).evidence, "multi", "auto") };
  assert.ok(core.parseDirectorOutput(explicit, explicitInput));
  const moved = { ...explicit, shots: explicit.shots.map((shot, i) => i === 3 ? response.shots[3] : i === 0 ? explicit.shots[3] : shot) };
  assert.equal(core.parseDirectorOutput(moved, explicitInput), null);
});

for (const invalidCamera of ["auto", " AUTO ", "camera: auto", "automatic camera movement", "default", "director's choice"]) {
  test(`Custom camera '${invalidCamera}' is rejected and uses at most the existing single repair`, async () => {
    const { input, response } = customFourShotFixture();
    const candidate = { ...response, shots: response.shots.map((shot, i) => i === 2 ? { ...shot, camera: invalidCamera } : shot) };
    let repairs = 0;
    const result = await core.directVideoWithClient(input, { createPlan: async () => candidate,
      repairPlan: async (_input, failure) => {
        repairs++;
        assert.equal(failure.reasonCode, "non_executable_camera");
        assert.deepEqual(failure.originalShots, candidate.shots);
        return { cameraRepairs: [{ shotIndex: 2, camera: response.shots[2].camera }] };
      } });
    assert.equal(repairs, 1);
    assert.deepEqual(result.shots, response.shots);
    await assert.rejects(() => core.directVideoWithClient(input, { createPlan: async () => candidate, repairPlan: async () => candidate }), /custom_director_unavailable/);
  });
}

test("Custom unsafe final motion repair retains earlier beats and reviewed declaredText fidelity", async () => {
  const { input, response } = customFourShotFixture();
  input.draft.productReferences = [{ source: { kind: "uploaded-image", sourceAssetId: "10000000-0000-4000-8000-000000000003" },
    sha256: "b".repeat(64), purpose: "logo", declaredText: "KLAY" }];
  const referenceReviews = [{ index: 0, status: "matched" as const, view: "detail" as const, reason: "Same identity", details: ["visible front logo"] }];
  const candidate = { ...response, referenceReviews, shots: response.shots.map((shot, i) => i === 3 ? { ...shot, motion: "Rotate the product through a full 360" } : shot) };
  let repairs = 0;
  const plan = await core.directVideoWithClient(input, { createPlan: async () => candidate,
    repairPlan: async (_input, failure, reviews) => {
      repairs++;
      assert.equal(failure.jsonPath, "$.shots[3].motion");
      assert.deepEqual(reviews, referenceReviews);
      const api = mockAdapter(() => { throw new Error("No provider call allowed"); });
      const repair = JSON.parse(api.buildDirectorRequest(input, failure).context);
      assert.deepEqual(repair.repairFeedback.originalShots, candidate.shots);
      assert.match(repair.repairFeedback.instruction, /every unaffected subject, action, environment and transition/);
      return { actionRepairs: [{ shotIndex: 3, field: "motion", value: response.shots[3].motion }] };
    } });
  assert.equal(repairs, 1);
  assert.deepEqual(plan.shots.slice(0, 3), response.shots.slice(0, 3));
  assert.deepEqual(plan.referenceReviews, referenceReviews);
  const scenes = core.compileDirectorPlan(plan, input).multiPrompt!;
  assert.equal(scenes.length, 4);
  assert.ok(scenes.every(scene => scene.prompt.length <= 512 && scene.prompt.includes('"KLAY"')));
  assert.ok(plan.shots.every(shot => shot.evidenceRefs.length === 0));
  const referenceFocus = { ...plan, shots: plan.shots.map((shot, i) => i === 3
    ? { ...shot, focus: "visible front logo", evidenceRefs: [] } : shot) };
  assert.equal(core.parseDirectorOutput(referenceFocus, input), null);
});

test("CM-1.1 vertical camera grammar requires a trajectory in camera context", () => {
  for (const camera of ["Camera descends toward the street grate", "Lower the camera toward the wet grate", "Crane down toward the grate", "Tilt down toward the grate", "Camera drops toward the grate", "Dropping camera toward the grate", "Camera travels downward beneath the grate", "Move downward toward the grate", "Boom down toward the grate", "Pedestal up toward the model", "Camera rises toward the light", "Camera ascends toward the light", "Travel upward toward the light"]) {
    assert.equal(executableCustomCamera(camera), true, camera);
    const { input, response } = customFourShotFixture();
    const candidate = { ...response, shots: response.shots.map((shot, i) => i === 2 ? { ...shot, camera } : shot) };
    assert.ok(core.parseDirectorOutput(candidate, input), camera);
    assert.ok(core.compileDirectorPlan(core.parseDirectorOutput(candidate, input)!, input).multiPrompt!.every(scene => scene.prompt.length <= 512));
  }
  for (const camera of ["model drops her hand", "The model lowers her hand", "drop", "auto", "cinematic camera"]) assert.equal(executableCustomCamera(camera), false, camera);
});

test("CM-1.1 camera repair propagates its reason and preserves every other creative field", async () => {
  const { input, response } = customFourShotFixture();
  const original = { ...response, shots: response.shots.map((shot, i) => i === 2 ? { ...shot, camera: "cinematic camera" } : shot) };
  let repairs = 0;
  const result = await core.directVideoWithClient(input, { createPlan: async () => original,
    repairPlan: async (_input, failure) => {
      repairs++;
      assert.equal(failure.jsonPath, "$.shots[2].camera");
      assert.equal(failure.reasonCode, "non_executable_camera");
      assert.ok(failure.expected);
      const request = mockAdapter(() => { throw new Error("offline only"); }).buildDirectorRequest(input, failure);
      const feedback = JSON.parse(request.context).repairFeedback;
      for (const key of ["reasonCode", "jsonPath", "expected"] as const) assert.equal(feedback[key], failure[key]);
      assert.match(feedback.instruction, /Rewrite only the failing camera fields/);
      assert.doesNotMatch(feedback.instruction, /unsupported claim|Change only the unsafe action/);
      // Return exactly the permitted camera edit.
      return { cameraRepairs: [{ shotIndex: 2, camera: "Lower the camera toward the wet grate" }] };
    } });
  assert.equal(repairs, 1);
  assert.deepEqual(result.shots, original.shots.map((shot, i) => i === 2 ? { ...shot, camera: "Lower the camera toward the wet grate" } : shot));
  const scenes = core.compileDirectorPlan(result, input).multiPrompt!;
  assert.equal(scenes.length, 4);
  assert.match(scenes[2].prompt, /grate.*foot contact.*darkness/i);
  assert.match(scenes[3].prompt, /model-free dark studio/i);
});

test("CM-1.1 exhausted camera failure releases only that failed cache entry for the next explicit request", async () => {
  const { input, response } = customFourShotFixture();
  const invalid = { ...response, shots: response.shots.map((shot, i) => i === 2 ? { ...shot, camera: "cinematic camera" } : shot) };
  for (const kind of ["camera", "provider"] as const) {
    let calls = 0;
    const api = isolated<typeof runtime>("src/lib/video-director/runtime.ts", {
      "@/lib/openai/beta-policy": { getVideoStudioOpenAIPolicy: () => ({ limits: { analysis: { user: 24, global: 120 } } }) },
      "@/lib/generation/prompts/prompt-enhancer-config": { getPromptEnhancementModel: () => "mock-model" },
      "@/lib/video-generation/diagnostics": { logVideoDiagnostic: () => {} },
      "./core": core, "./receipt": receipts, "./openai-director": {
        createOpenAIVideoPlan: async () => { calls++; if (kind === "provider") throw new Error("uncertain provider failure"); return calls <= 2 ? invalid : response; },
        createOpenAICameraRepairs: async () => { calls++; return { cameraRepairs: [{ shotIndex: 2, camera: "cinematic camera" }] }; },
      },
    }, { OPENAI_API_KEY: "offline-only", SUPABASE_SECRET_KEY: "offline-secret" });
    await assert.rejects(() => api.prepareVideoDirectorPlan("owner", Buffer.alloc(0), "source", input), /custom_director_unavailable/);
    assert.equal(calls, kind === "camera" ? 2 : 1);
    if (kind === "camera") {
      const retried = await api.prepareVideoDirectorPlan("owner", Buffer.alloc(0), "source", input);
      assert.equal(retried.plan.origin, "ai");
      assert.equal(calls, 3);
      await api.prepareVideoDirectorPlan("owner", Buffer.alloc(0), "source", input);
      assert.equal(calls, 3, "successful plans stay cached");
    } else {
      await assert.rejects(() => api.prepareVideoDirectorPlan("owner", Buffer.alloc(0), "source", input));
      assert.equal(calls, 1, "uncertain failures stay cached without automatic retry");
    }
  }
});

test("CM-1.2 concrete framing is admitted with locked semantics, never subject/environment prose", () => {
  for (const camera of ["medium shot", "medium framing", "close-up framing", "close framing", "wide shot", "full shot", "macro framing", "low-angle medium shot", "high-angle framing", "eye-level full shot", "overhead framing", "top-down framing"]) {
    assert.equal(executableCustomCamera(camera), true, camera);
    const { input, response } = customFourShotFixture();
    const plan = core.parseDirectorOutput({ ...response, shots: response.shots.map((shot, i) => i === 0 ? { ...shot, camera } : shot) }, input);
    assert.ok(plan, camera);
    assert.equal(plan.shots[0].camera, `Locked ${camera}`);
    assert.equal(plan.shots[0].motion, response.shots[0].motion);
  }
  for (const camera of ["auto", "cinematic camera", "dynamic camera", "professional camera", "model drops toward camera", "medium rainfall", "wide street", "framing"]) assert.equal(executableCustomCamera(camera), false, camera);
});

test("CM-1.2 batches both camera failures into one local repair, retaining NYC and all valid cameras", async () => {
  const { input, response } = customFourShotFixture();
  input.draft.prompt = input.draft.prompt.replace("Shot 1:", "Shot 1: Camera performs a figure-eight trajectory."); // Exercise provider repair when normalization is intentionally unsafe.
  const original = { ...response, shots: response.shots.map((shot, i) => i < 2 ? { ...shot, camera: i ? "dynamic camera" : "cinematic camera" } : shot) };
  const paths = ["$.shots[0].camera", "$.shots[1].camera"];
  const events: core.DirectorPlanningDiagnostic[] = [];
  let repairs = 0;
  const result = await core.directVideoWithClient(input, { createPlan: async () => original,
    repairPlan: async (_input, failure) => {
      repairs++;
      assert.equal(failure.reasonCode, "non_executable_camera");
      assert.deepEqual(failure.failingPaths, paths);
      assert.ok(failure.expected);
      const request = mockAdapter(() => { throw new Error("offline only"); }).buildDirectorRequest(input, failure);
      const feedback = JSON.parse(request.context).repairFeedback;
      assert.deepEqual(feedback.failingPaths, paths);
      assert.equal(feedback.expected, failure.expected);
      assert.match(feedback.instruction, /Fix ALL listed cameras/);
      assert.match(request.instructions, /executable camera trajectory OR concrete framing/);
      return { cameraRepairs: [0, 1].map(shotIndex => ({ shotIndex, camera: response.shots[shotIndex].camera })) };
    } }, event => events.push(event));
  assert.equal(repairs, 1);
  assert.deepEqual(events.find(event => event.reasonCode === "non_executable_camera")?.failingPaths, paths);
  assert.deepEqual(result.shots, response.shots);
  assert.ok(core.parseDirectorOutput(result, input));
  const compiled = core.compileDirectorPlan(result, input);
  const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: "kling-v3-standard-image", endpointId: "offline", sourceUrl: "https://invalid.example/product" });
  assert.equal(payload.multi_prompt!.length, 4);
  assert.ok(payload.multi_prompt!.every(scene => scene.prompt.length <= 512));
  assert.match(payload.multi_prompt![0].prompt, /rainy NYC/);
  assert.match(payload.multi_prompt![1].prompt, /pose/);
  assert.match(payload.multi_prompt![2].prompt, /grate.*darkness/);
  assert.match(payload.multi_prompt![3].prompt, /model-free dark studio/);
  assert.ok(result.shots.every(shot => shot.evidenceRefs.length === 0));
});

for (const field of ["durationSeconds", "composition", "motion", "lighting", "pace", "focus", "valid-camera", "order", "count"]) {
  test(`CM-1.2 rejects batch repair changing ${field}`, async () => {
    const { input, response } = customFourShotFixture();
    input.draft.prompt = input.draft.prompt.replace("Shot 1:", "Shot 1: Camera performs a figure-eight trajectory.");
    const original = { ...response, shots: response.shots.map((shot, i) => i < 2 ? { ...shot, camera: "dynamic camera" } : shot) };
    const changed = structuredClone(response);
    if (field === "order") [changed.shots[2], changed.shots[3]] = [changed.shots[3], changed.shots[2]];
    else if (field === "count") changed.shots.pop();
    else if (field === "durationSeconds") changed.shots[0].durationSeconds = 4;
    else if (field === "valid-camera") changed.shots[2].camera = "Locked medium framing";
    else changed.shots[0][field as "composition" | "motion" | "lighting" | "pace" | "focus"] = "Unwanted replacement";
    let repairs = 0;
    const events: core.DirectorPlanningDiagnostic[] = [];
    await assert.rejects(() => core.directVideoWithClient(input, { createPlan: async () => original,
      repairPlan: async () => { repairs++; return changed; } }, event => events.push(event)), /custom_director_unavailable/);
    assert.equal(repairs, 1);
    assert.ok(events.some(event => event.reasonCode === "invalid_camera_patch"));
  });
}

test("CM-1.3 strict camera patch transport repairs indices 1/3 once and preserves references and NYC beats", async () => {
  const { input, response } = customFourShotFixture();
  input.draft.productReferences = [{ source: { kind: "uploaded-image", sourceAssetId: "10000000-0000-4000-8000-000000000003" }, sha256: "b".repeat(64), purpose: "logo", declaredText: "KLAY" }];
  const referenceReviews = [{ index: 0, status: "matched" as const, view: "detail" as const, reason: "Same identity", details: [] }];
  const original = { ...response, referenceReviews, shots: response.shots.map((shot, i) => i === 1 || i === 3 ? { ...shot, camera: "cinematic camera" } : shot) };
  const patch = { cameraRepairs: [1, 3].map(shotIndex => ({ shotIndex, camera: response.shots[shotIndex].camera })) };
  const requests: Record<string, unknown>[] = [];
  const api = mockAdapter(() => ({ status: "completed", output_text: JSON.stringify(patch) }), undefined, requests);
  const pixels = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
  const plan = await core.directVideoWithClient(input, { createPlan: async () => original,
    repairPlan: async (value, failure) => {
      const request = api.buildCameraRepairRequest(value, failure);
      assert.deepEqual([...request.schema.required], ["cameraRepairs"]);
      assert.deepEqual(Object.keys(request.schema.properties), ["cameraRepairs"]);
      assert.equal(request.schema.additionalProperties, false);
      assert.equal(request.schema.properties.cameraRepairs.items.additionalProperties, false);
      assert.deepEqual([...request.schema.properties.cameraRepairs.items.required], ["shotIndex", "camera"]);
      assert.deepEqual([...request.schema.properties.cameraRepairs.items.properties.shotIndex.enum], [1, 3]);
      return api.createOpenAICameraRepairs(value, pixels, failure);
    } });
  assert.equal(requests.length, 1);
  const format = (requests[0].text as { format: { name: string; strict: boolean } }).format;
  assert.equal(format.name, "director_camera_repairs");
  assert.equal(format.strict, true);
  assert.deepEqual(plan.shots, response.shots);
  assert.deepEqual(plan.referenceReviews, referenceReviews);
  assert.deepEqual(original.shots[1].camera, "cinematic camera", "original candidate remains immutable");
  assert.ok(core.parseDirectorOutput(plan, input));
  const compiled = core.compileDirectorPlan(plan, input);
  assert.equal(compiled.multiPrompt!.length, 4);
  assert.ok(compiled.multiPrompt!.every(scene => scene.prompt.length <= 512 && scene.prompt.includes('"KLAY"')));
  assert.match(compiled.multiPrompt![0].prompt, /rainy NYC/);
  assert.match(compiled.multiPrompt![1].prompt, /pose/);
  assert.match(compiled.multiPrompt![2].prompt, /grate.*darkness/);
  assert.match(compiled.multiPrompt![3].prompt, /model-free dark studio/);
  assert.ok(plan.shots.every(shot => shot.evidenceRefs.length === 0));
});

for (const [name, patch] of Object.entries({
  missing: { cameraRepairs: [{ shotIndex: 1, camera: "Locked medium framing" }] },
  extra: { cameraRepairs: [1, 3, 0].map(shotIndex => ({ shotIndex, camera: "Locked medium framing" })) },
  duplicate: { cameraRepairs: [1, 1].map(shotIndex => ({ shotIndex, camera: "Locked medium framing" })) },
  range: { cameraRepairs: [1, 4].map(shotIndex => ({ shotIndex, camera: "Locked medium framing" })) },
  negative: { cameraRepairs: [1, -1].map(shotIndex => ({ shotIndex, camera: "Locked medium framing" })) },
  vague: { cameraRepairs: [1, 3].map(shotIndex => ({ shotIndex, camera: "cinematic camera" })) },
  auto: { cameraRepairs: [1, 3].map(shotIndex => ({ shotIndex, camera: "auto" })) },
  overlong: { cameraRepairs: [1, 3].map(shotIndex => ({ shotIndex, camera: "Locked " + "x".repeat(100) })) },
  forbidden: { cameraRepairs: [1, 3].map(shotIndex => ({ shotIndex, camera: "Locked medium framing", motion: "Changed" })) },
  fullPlan: { shots: [], cameraRepairs: [1, 3].map(shotIndex => ({ shotIndex, camera: "Locked medium framing" })) },
})) test(`CM-1.3 rejects ${name} camera patch without a second repair or full-plan envelope error`, async () => {
  const { input, response } = customFourShotFixture();
  const original = { ...response, shots: response.shots.map((shot, i) => i === 1 || i === 3 ? { ...shot, camera: "auto" } : shot) };
  const events: core.DirectorPlanningDiagnostic[] = [];
  let repairs = 0;
  await assert.rejects(() => core.directVideoWithClient(input, { createPlan: async () => original,
    repairPlan: async () => { repairs++; return patch; } }, event => events.push(event)), /custom_director_unavailable/);
  assert.equal(repairs, 1);
  assert.ok(events.some(event => event.reasonCode === "invalid_camera_patch"));
  assert.ok(events.every(event => event.reasonCode !== "invalid_plan_envelope" && event.reasonCode !== "camera_repair_not_local"));
});

test("CM-1.3 Custom unsupported-product-claim repair retains its full-plan transport", async () => {
  const { input, response } = customFourShotFixture();
  let calls = 0;
  const requests: Record<string, unknown>[] = [];
  const api = mockAdapter(() => {
    calls++;
    const result = calls === 1 ? { ...response, shots: response.shots.map((shot, i) => i === 3 ? { ...shot, lighting: "Titanium reflections" } : shot) } : response;
    return { status: "completed", output_text: JSON.stringify(wireResponse(result)) };
  }, undefined, requests);
  const pixels = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
  const result = await core.directVideoWithClient(input, { createPlan: value => api.createOpenAIVideoPlan(value, pixels),
    repairPlan: (value, failure, reviews) => {
      assert.equal(failure.reasonCode, "unsupported_product_claim");
      return api.createOpenAIVideoPlan(value, pixels, undefined, failure, reviews);
    } });
  assert.equal(calls, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(result.shots)), response.shots);
  assert.ok(requests.every(request => (request.text as { format: { name: string } }).format.name === "video_director_plan"));
});

test("CM-1.3 executable patch still runs full safety validation without a second repair", async () => {
  const { input, response } = customFourShotFixture();
  const original = { ...response, shots: response.shots.map((shot, i) => i === 3 ? { ...shot, camera: "auto" } : shot) };
  const events: core.DirectorPlanningDiagnostic[] = [];
  let repairs = 0;
  await assert.rejects(() => core.directVideoWithClient(input, { createPlan: async () => original,
    repairPlan: async () => { repairs++; return { cameraRepairs: [{ shotIndex: 3, camera: "Pan right toward an unseen surface" }] }; } }, event => events.push(event)), /custom_director_unavailable/);
  assert.equal(repairs, 1);
  assert.ok(events.some(event => event.reasonCode === "unsafe_product_action"));
});

test("CM-1.4 local snapshots isolate studio camera repairs from the street beat", () => {
  const { input, response } = customFourShotFixture();
  const failure = { reasonCode: "non_executable_camera", jsonPath: "$.shots[3].camera", failingPaths: ["$.shots[3].camera"], expected: "local camera", originalShots: response.shots };
  const api = mockAdapter(() => { throw new Error("offline only"); });
  const request = api.buildCameraRepairRequest(input, failure);
  const context = JSON.parse(request.context);
  assert.equal(context.originalShots, undefined);
  assert.equal(context.userRequest, undefined);
  assert.equal(context.targets.length, 1);
  const target = context.targets[0];
  assert.equal(target.shotIndex, 3);
  for (const field of ["purpose", "composition", "motion", "lighting", "pace", "focus"] as const) assert.equal(target[field], response.shots[3][field]);
  assert.equal(target.originalCamera, response.shots[3].camera);
  assert.doesNotMatch(JSON.stringify(context), /grate|street|foot contact/i);
  assert.match(request.instructions, /never import another shot/);
});

test("CM-1.4 mixed camera contamination and misplaced unsafe orbit use one exact field patch", async () => {
  const { input, response } = customFourShotFixture();
  const original = { ...response, shots: response.shots.map((shot, i) => i === 3 ? { ...shot,
    camera: "Track lower toward the steaming street grate, focusing on the foot contact.", motion: "Camera orbits around product" } : shot) };
  const requests: Record<string, unknown>[] = [];
  const patch = { fieldRepairs: [
    { shotIndex: 3, field: "camera", value: "Short lateral arc across the source-facing product" },
    { shotIndex: 3, field: "motion", value: "Product remains still; light sweeps the visible surface" },
  ] };
  const api = mockAdapter(() => ({ status: "completed", output_text: JSON.stringify(patch) }), undefined, requests);
  const pixels = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
  let repairs = 0;
  const plan = await core.directVideoWithClient(input, { createPlan: async () => original,
    repairPlan: async (value, failure) => {
      repairs++;
      assert.equal(failure.reasonCode, "custom_shot_coherence");
      assert.deepEqual(new Set(failure.failingPaths), new Set(["$.shots[3].camera", "$.shots[3].motion"]));
      const request = api.buildShotFieldRepairRequest(value, failure);
      const context = JSON.parse(request.context);
      assert.equal(context.targets.length, 2);
      assert.equal(context.targets[0].composition, original.shots[3].composition);
      assert.equal(context.targets[0].camera, original.shots[3].camera);
      assert.deepEqual([...request.schema.required], ["fieldRepairs"]);
      assert.equal(request.schema.additionalProperties, false);
      return api.createOpenAICameraRepairs(value, pixels, failure);
    } });
  assert.equal(repairs, 1);
  assert.equal(requests.length, 1);
  assert.deepEqual(plan.shots.slice(0, 3), response.shots.slice(0, 3));
  assert.deepEqual(plan.shots[3], { ...original.shots[3], camera: patch.fieldRepairs[0].value, motion: patch.fieldRepairs[1].value });
  assert.equal(plan.shots.length, 4);
  assert.equal(plan.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0), 10);
  assert.match(plan.shots[2].camera, /Descend/);
  assert.match(plan.shots[2].motion, /foot contact.*darkness/);
  assert.match(plan.shots[3].composition, /model-free dark studio/i);
  assert.doesNotMatch(plan.shots[3].camera, /grate|foot|street|orbit|360/i);
  assert.doesNotMatch(plan.shots[3].motion, /camera|viewpoint|lens/i);
  assert.match(plan.shots[3].camera, /lateral.*source-facing/);
  assert.ok(plan.shots.every(shot => shot.evidenceRefs.length === 0));
  const compiled = core.compileDirectorPlan(plan, input);
  assert.equal(compiled.multiPrompt!.length, 4);
  assert.ok(compiled.multiPrompt!.every(scene => scene.prompt.length <= 512));
});

for (const motion of ["Camera tracks the model", "Camera moves downward", "Camera lowers toward the grate", "Camera rises", "Camera pans left", "Camera tilts down", "Camera dollies in", "Camera cranes down", "Camera orbits around product", "Camera circles around product", "The viewpoint arcs across the product", "Lens moves closer"]) {
  test(`CM-1.4 camera-owned trajectory in motion is rejected: ${motion}`, () => {
    const { input, response } = customFourShotFixture();
    const events: core.DirectorValidationFailure[] = [];
    assert.equal(core.parseDirectorOutput({ ...response, shots: response.shots.map((shot, i) => i === 3 ? { ...shot, motion } : shot) }, input, event => events.push(event)), null);
    assert.equal(events[0].reasonCode, "custom_shot_coherence");
    assert.ok(events[0].failingPaths?.includes("$.shots[3].motion"));
  });
}

for (const motion of ["Model walks", "Foot steps onto the grate", "Product remains still", "Fabric moves gently"]) test(`CM-1.4 subject action stays valid: ${motion}`, () => {
  const { input, response } = customFourShotFixture();
  assert.ok(core.parseDirectorOutput({ ...response, shots: response.shots.map((shot, i) => i === 3 ? { ...shot, motion } : shot) }, input));
});

for (const camera of ["Camera orbits around product", "Circle around the product", "Revolve around the product", "Full 360 camera orbit"]) test(`CM-1.4 full orbit recognized but not admitted over unknown surfaces: ${camera}`, () => {
  const { input, response } = customFourShotFixture();
  assert.equal(executableCustomCamera(camera), true);
  const events: core.DirectorValidationFailure[] = [];
  assert.equal(core.parseDirectorOutput({ ...response, shots: response.shots.map((shot, i) => i === 3 ? { ...shot, camera } : shot) }, input, event => events.push(event)), null);
  assert.equal(events[0].reasonCode, "custom_shot_coherence");
});

test("CM-1.4 repairs cannot reintroduce foreign environments or touch unlisted fields", async () => {
  const { input, response } = customFourShotFixture();
  const original = { ...response, shots: response.shots.map((shot, i) => i === 3 ? { ...shot, motion: "Camera orbits around product" } : shot) };
  for (const patch of [
    { fieldRepairs: [{ shotIndex: 3, field: "camera", value: "Track toward the street grate" }, { shotIndex: 3, field: "motion", value: "Product remains still" }] },
    { fieldRepairs: [{ shotIndex: 3, field: "camera", value: "Short source-facing lateral arc" }, { shotIndex: 3, field: "composition", value: "Changed studio" }] },
  ]) {
    let repairs = 0;
    await assert.rejects(() => core.directVideoWithClient(input, { createPlan: async () => original, repairPlan: async () => { repairs++; return patch; } }), /custom_director_unavailable/);
    assert.equal(repairs, 1);
  }
});

test("CM-1.4 invalid camera plus misplaced unsafe orbit share the single patch budget", async () => {
  const { input, response } = customFourShotFixture();
  const original = { ...response, shots: response.shots.map((shot, i) => i === 3 ? { ...shot, camera: "cinematic camera", motion: "Camera orbits around product" } : shot) };
  let repairs = 0;
  const plan = await core.directVideoWithClient(input, { createPlan: async () => original, repairPlan: async (_input, failure) => {
    repairs++;
    assert.deepEqual(new Set(failure.failingPaths), new Set(["$.shots[3].camera", "$.shots[3].motion"]));
    return { fieldRepairs: [ { shotIndex: 3, field: "camera", value: response.shots[3].camera }, { shotIndex: 3, field: "motion", value: "Product remains still" } ] };
  } });
  assert.equal(repairs, 1);
  assert.deepEqual(plan.shots.slice(0, 3), response.shots.slice(0, 3));
  assert.equal(plan.shots[3].composition, response.shots[3].composition);
});

function unsafeNYCScenario(motion = "Rotate the product through a full 360") {
  const { input, response } = customFourShotFixture();
  input.draft.productReferences = [{ source: { kind: "uploaded-image", sourceAssetId: "10000000-0000-4000-8000-000000000003" }, sha256: "b".repeat(64), purpose: "logo", declaredText: "KLAY" }];
  const referenceReviews = [{ index: 0, status: "matched" as const, view: "detail" as const, reason: "Same identity", details: [] }];
  const original = { ...response, referenceReviews, shots: response.shots.map((shot, i) => i === 3 ? { ...shot, motion } : shot) };
  return { input, response, referenceReviews, original };
}

test("CM-1.5 unsafe-action transport uses exact local patch schema without references or full plan grammar", async () => {
  const { input, response, original, referenceReviews } = unsafeNYCScenario();
  const requests: Record<string, unknown>[] = [];
  const api = mockAdapter(() => ({ status: "completed", output_text: JSON.stringify({ actionRepairs: [{ shotIndex: 3, field: "motion", value: response.shots[3].motion }] }) }), undefined, requests);
  const pixels = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
  const plan = await core.directVideoWithClient(input, { createPlan: async () => original, repairPlan: async (value, failure) => {
    const request = api.buildActionRepairRequest(value, failure);
    assert.deepEqual([...request.schema.required], ["actionRepairs"]);
    assert.equal(request.schema.additionalProperties, false);
    assert.deepEqual(Object.keys(request.schema.properties), ["actionRepairs"]);
    assert.equal(request.schema.properties.actionRepairs.items.additionalProperties, false);
    const context = JSON.parse(request.context);
    assert.equal(context.targets.length, 1);
    const target = context.targets[0];
    assert.equal(target.shotIndex, 3);
    assert.equal(target.failingField, "motion");
    assert.equal(target.originalValue, original.shots[3].motion);
    for (const field of ["purpose", "camera", "composition", "motion", "lighting", "pace", "focus"] as const) assert.equal(target[field], original.shots[3][field]);
    assert.equal(target.expected, failure.expected);
    assert.doesNotMatch(request.context, /rainy NYC|street grate|referenceReviews/);
    assert.doesNotMatch(JSON.stringify(request.schema), /maxLength|minimum|maximum|minItems|maxItems/);
    return api.createOpenAIActionRepairs(value, pixels, failure);
  } });
  assert.equal(requests.length, 1);
  assert.equal((requests[0].text as { format: { name: string; strict: boolean } }).format.name, "director_action_repairs");
  assert.deepEqual(plan.shots, response.shots);
  assert.deepEqual(plan.referenceReviews, referenceReviews);
});

for (const [name, patch] of Object.entries({
  missing: { actionRepairs: [] },
  extra: { actionRepairs: [3, 1].map(shotIndex => ({ shotIndex, field: "motion", value: "Product remains still" })) },
  duplicate: { actionRepairs: [3, 3].map(shotIndex => ({ shotIndex, field: "motion", value: "Product remains still" })) },
  outOfRange: { actionRepairs: [{ shotIndex: 4, field: "motion", value: "Product remains still" }] },
  wrongField: { actionRepairs: [{ shotIndex: 3, field: "camera", value: "Locked medium framing" }] },
  fullPlan: { shots: [], actionRepairs: [{ shotIndex: 3, field: "motion", value: "Product remains still" }] },
  extraProperty: { actionRepairs: [{ shotIndex: 3, field: "motion", value: "Product remains still", composition: "Changed studio" }] },
  overlong: { actionRepairs: [{ shotIndex: 3, field: "motion", value: "X".repeat(101) }] },
  unsafe: { actionRepairs: [{ shotIndex: 3, field: "motion", value: "Rotate the product through a full 360" }] },
})) test(`CM-1.5 invalid ${name} action patch rejected without second repair or generic fallback`, async () => {
  const { input, original } = unsafeNYCScenario();
  let repairs = 0;
  await assert.rejects(() => core.directVideoWithClient(input, { createPlan: async () => original,
    repairPlan: async () => { repairs++; return patch; } }), /custom_director_unavailable/);
  assert.equal(repairs, 1);
});

test("CM-1.5 batch unsafe actions repair only exact paths in a single provider call", async () => {
  const { input, original, response } = unsafeNYCScenario();
  original.shots[1] = { ...original.shots[1], motion: "Spin the product through a full 360" };
  let repairs = 0;
  const plan = await core.directVideoWithClient(input, { createPlan: async () => original, repairPlan: async (_input, failure) => {
    repairs++;
    assert.deepEqual(failure.failingPaths, ["$.shots[1].motion", "$.shots[3].motion"]);
    return { actionRepairs: [1, 3].map(shotIndex => ({ shotIndex, field: "motion", value: response.shots[shotIndex].motion })) };
  } });
  assert.equal(repairs, 1);
  assert.deepEqual(plan.shots, response.shots);
});

for (const suspended of [false, true]) test(`CM-1.5 real adapter transport failure permits only recognized 360 fallback; suspended=${suspended}`, async () => {
  const { input, original, referenceReviews } = unsafeNYCScenario();
  if (suspended) original.shots[3].composition = "Model-free dark studio suspended product reveal";
  const logs: Record<string, unknown>[] = [];
  const requests: Record<string, unknown>[] = [];
  const api = mockAdapter(() => { throw Object.assign(new Error("sensitive prompt must not be logged"), { name: "APIConnectionError" }); }, logs, requests);
  const pixels = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
  const plan = await core.directVideoWithClient(input, { createPlan: async () => original,
    repairPlan: (value, failure) => api.createOpenAIActionRepairs(value, pixels, failure, "offline") });
  assert.equal(requests.length, 1);
  assert.deepEqual(plan.shots.slice(0, 3), original.shots.slice(0, 3));
  assert.deepEqual(plan.shots[3], { ...original.shots[3], motion: suspended ? "Product remains suspended, still and source-facing" : "Product remains still and source-facing" });
  assert.deepEqual(plan.referenceReviews, referenceReviews);
  assert.equal(plan.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0), 10);
  assert.doesNotMatch(plan.shots[3].camera, /grate|foot|street|orbit|360/i);
  const compiled = core.compileDirectorPlan(plan, input);
  assert.equal(compiled.multiPrompt!.length, 4);
  assert.ok(compiled.multiPrompt!.every(scene => scene.prompt.length <= 512 && scene.prompt.includes('"KLAY"')));
  const failure = logs.find(log => log.stage === "director_provider_response_received");
  assert.equal(failure?.category, "network");
  assert.equal(failure?.schemaName, "director_action_repairs");
  assert.equal(failure?.repairKind, "unsafe_product_action");
  assert.doesNotMatch(JSON.stringify(logs), /sensitive prompt|data:image/);
});

for (const motion of ["Remove the product", "Rotate the product through 360 and change its material", "Spin the titanium product"]) test(`CM-1.5 no transport fallback for ambiguous/unsupported action: ${motion}`, async () => {
  const { input, original } = unsafeNYCScenario(motion);
  let repairs = 0;
  await assert.rejects(() => core.directVideoWithClient(input, { createPlan: async () => original, repairPlan: async () => {
    repairs++; throw Object.assign(new Error("offline transport failure"), { unsafeRepairRequestFailed: true, transportFailure: true });
  } }), /custom_director_unavailable/);
  assert.equal(repairs, 1);
});

test("CM-1.5 SDK-wrapped local budget guard explains status/code-null errors without misclassifying transport", async () => {
  const env = { OPENAI_VIDEO_STUDIO_ENABLED: "true" };
  const owner = "10000000-0000-4000-8000-000000000001";
  let sends = 0;
  const guarded = createOpenAIBetaFetch({ env, authenticate: async () => owner,
    policyForUser: () => ({ limits: { image: { user: 0, global: 0 }, analysis: { user: 24, global: 120 } }, imageModel: "", analysisModels: ["gpt-4o-mini"] }), analysisMaxOutputTokens: 4000,
    reserve: async () => { throw Object.assign(new Error("private diagnostic context"), { name: "OpenAIBudgetError", budgetFailure: "budget_unavailable" }); },
    send: async () => { sends++; throw new Error("must never send"); } });
  const sdk = new OpenAI({ apiKey: "offline", maxRetries: 0, fetch: guarded });
  const logs: Record<string, unknown>[] = [];
  const api = mockAdapter(() => { throw new Error("unused"); }, logs, undefined, sdk);
  const { input, original } = unsafeNYCScenario();
  const pixels = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(() => core.directVideoWithClient(input, { createPlan: async () => original,
    repairPlan: (value, failure) => api.createOpenAIActionRepairs(value, pixels, failure, "offline") }), /custom_director_unavailable/);
  assert.equal(sends, 0);
  assert.equal(logs.find(log => log.category === "local_budget")?.errorClass, "OpenAIBudgetError");
  assert.equal(logs.find(log => log.category === "local_budget")?.code, "budget_unavailable");
  assert.doesNotMatch(JSON.stringify(logs), /private diagnostic context/);
});

test("CM-1.5 explicit retry after unsafe repair request failure is allowed, successful plan remains cached", async () => {
  const { input, original, response } = unsafeNYCScenario("Remove the product");
  let creates = 0, repairs = 0;
  const api = isolated<typeof runtime>("src/lib/video-director/runtime.ts", {
    "@/lib/openai/beta-policy": { getVideoStudioOpenAIPolicy: () => ({ limits: { analysis: { user: 24, global: 120 } } }) },
    "@/lib/generation/prompts/prompt-enhancer-config": { getPromptEnhancementModel: () => "mock-model" },
    "@/lib/video-generation/diagnostics": { logVideoDiagnostic: () => {} },
    "./core": core, "./receipt": receipts, "./openai-director": {
      createOpenAIVideoPlan: async () => { creates++; return creates === 1 ? original : { ...response, referenceReviews: original.referenceReviews }; },
      createOpenAIActionRepairs: async () => { repairs++; throw Object.assign(new Error("offline request failed"), { unsafeRepairRequestFailed: true, transportFailure: true }); },
    },
  }, { OPENAI_API_KEY: "offline", SUPABASE_SECRET_KEY: "offline-secret" });
  await assert.rejects(() => api.prepareVideoDirectorPlan("owner", Buffer.alloc(0), "source", input));
  assert.equal(creates, 1);
  assert.equal(repairs, 1);
  const result = await api.prepareVideoDirectorPlan("owner", Buffer.alloc(0), "source", input);
  assert.deepEqual(result.plan.shots, response.shots);
  await api.prepareVideoDirectorPlan("owner", Buffer.alloc(0), "source", input);
  assert.equal(creates, 2);
  assert.equal(repairs, 1);
});

type CoherencePath = { shotIndex: number; field: "camera" | "motion" };
const coherenceVariants: { name: string; targets: CoherencePath[]; coherence: boolean }[] = [
  { name: "A", targets: [{ shotIndex: 2, field: "camera" }], coherence: false },
  { name: "B", targets: [{ shotIndex: 3, field: "camera" }, { shotIndex: 3, field: "motion" }], coherence: true },
  { name: "C", targets: [{ shotIndex: 1, field: "camera" }, { shotIndex: 2, field: "camera" }, { shotIndex: 3, field: "camera" }, { shotIndex: 3, field: "motion" }], coherence: true },
  { name: "camera-only coherence", targets: [{ shotIndex: 3, field: "camera" }], coherence: true },
];

for (const variant of coherenceVariants) test(`CM-1.6 ${variant.name} uses one reason-bound exact-path patch and the same final NYC contract`, async () => {
  const { input, response } = customFourShotFixture();
  input.draft.productReferences = [{ source: { kind: "uploaded-image", sourceAssetId: "10000000-0000-4000-8000-000000000003" }, sha256: "b".repeat(64), purpose: "logo", declaredText: "KLAY" }];
  const referenceReviews = [{ index: 0, status: "matched" as const, view: "detail" as const, reason: "Same identity", details: [] }];
  const original = { ...response, referenceReviews, shots: structuredClone(response.shots) };
  for (const target of variant.targets) original.shots[target.shotIndex][target.field] = target.field === "motion" ? "Camera orbits around product"
    : variant.name === "camera-only coherence" ? "Track toward the street grate" : "cinematic camera";
  const expectedPaths = variant.targets.map(target => `$.shots[${target.shotIndex}].${target.field}`);
  const patch = variant.coherence ? { fieldRepairs: [...variant.targets].reverse().map(target => ({ ...target, value: response.shots[target.shotIndex][target.field] })) }
    : { cameraRepairs: variant.targets.map(target => ({ shotIndex: target.shotIndex, camera: response.shots[target.shotIndex].camera })) };
  const requests: Record<string, unknown>[] = [];
  const api = mockAdapter(() => ({ status: "completed", output_text: JSON.stringify(patch) }), undefined, requests);
  const pixels = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
  const before = structuredClone(original);
  let repairs = 0;
  const plan = await core.directVideoWithClient(input, { createPlan: async () => original, repairPlan: async (value, failure) => {
    repairs++;
    assert.equal(failure.reasonCode, variant.coherence ? "custom_shot_coherence" : "non_executable_camera");
    assert.deepEqual(new Set(failure.failingPaths), new Set(expectedPaths));
    if (variant.coherence) {
      const request = api.buildShotFieldRepairRequest(value, failure);
      assert.deepEqual([...request.schema.required], ["fieldRepairs"]);
      assert.deepEqual(Object.keys(request.schema.properties), ["fieldRepairs"]);
      assert.equal(request.schema.additionalProperties, false);
      assert.equal(request.schema.properties.fieldRepairs.items.additionalProperties, false);
      const context = JSON.parse(request.context);
      assert.equal(context.originalShots, undefined);
      assert.equal(context.userRequest, undefined);
      assert.equal(context.targets.length, expectedPaths.length);
      for (const target of context.targets as Array<{ shotIndex: number; failingField: "camera" | "motion"; originalValue: string }>) {
        assert.equal(target.originalValue, original.shots[target.shotIndex][target.failingField]);
        const shot = original.shots[target.shotIndex];
        for (const field of ["purpose", "camera", "composition", "motion", "lighting", "pace", "focus"] as const) assert.equal((target as unknown as Record<string, unknown>)[field], shot[field]);
      }
    }
    return api.createOpenAICameraRepairs(value, pixels, failure);
  } });
  assert.equal(repairs, 1);
  assert.equal(requests.length, 1);
  assert.equal((requests[0].text as { format: { name: string } }).format.name, variant.coherence ? "director_field_repairs" : "director_camera_repairs");
  assert.deepEqual(original, before);
  assert.deepEqual(plan.shots, response.shots);
  assert.deepEqual(plan.referenceReviews, referenceReviews);
  assert.equal(plan.summary, original.summary);
  assert.equal(plan.intent, original.intent);
  assert.deepEqual(plan.intentContract, original.intentContract);
  assert.equal(plan.shots.length, 4);
  assert.equal(plan.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0), 10);
  assert.match(plan.shots[2].camera, /Descend/);
  assert.match(plan.shots[2].motion, /foot contact.*darkness/);
  assert.doesNotMatch(plan.shots[3].camera, /street|grate|foot|orbit|360/i);
  assert.doesNotMatch(plan.shots[3].motion, /camera|viewpoint|lens/i);
  assert.match(plan.shots[3].camera, /source-facing/);
  assert.ok(plan.shots.every(shot => shot.evidenceRefs.length === 0));
  assert.ok(core.parseDirectorOutput(plan, input));
  const compiled = core.compileDirectorPlan(plan, input);
  const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: "kling-v3-standard-image", endpointId: "offline", sourceUrl: "https://invalid.example/product" });
  assert.equal(payload.multi_prompt!.length, 4);
  assert.ok(payload.multi_prompt!.every(scene => scene.prompt.length <= 512 && scene.prompt.includes('"KLAY"')));
});

const coherenceCPaths = ["$.shots[1].camera", "$.shots[2].camera", "$.shots[3].camera", "$.shots[3].motion"];
for (const defect of ["missing", "extra", "duplicate", "wrong-field", "range", "full-plan", "cameraRepairs", "shotRepairs", "motion-trajectory"]) test(`CM-1.6 rejects ${defect} coherence patch by exact path, not index`, async () => {
  const { input, response } = customFourShotFixture();
  const original = { ...response, shots: structuredClone(response.shots) };
  for (const index of [1, 2, 3]) original.shots[index].camera = "cinematic camera";
  original.shots[3].motion = "Camera orbits around product";
  const entries = coherenceVariants[2].targets.map(target => ({ ...target, value: response.shots[target.shotIndex][target.field] }));
  if (defect === "missing") entries.pop();
  else if (defect === "extra") entries.push({ shotIndex: 0, field: "camera", value: "Locked medium framing" });
  else if (defect === "duplicate") entries[3] = { ...entries[2] };
  else if (defect === "wrong-field") entries[0] = { shotIndex: 1, field: "motion", value: "Model walks" };
  else if (defect === "range") entries[0].shotIndex = 4;
  else if (defect === "motion-trajectory") entries[3].value = "Camera tracks the product";
  const patch = defect === "cameraRepairs" ? { cameraRepairs: entries } : defect === "shotRepairs" ? { shotRepairs: entries }
    : defect === "full-plan" ? { fieldRepairs: entries, shots: original.shots } : { fieldRepairs: entries };
  const before = structuredClone(original);
  const events: core.DirectorPlanningDiagnostic[] = [];
  let repairs = 0;
  await assert.rejects(() => core.directVideoWithClient(input, { createPlan: async () => original, repairPlan: async (_input, failure) => {
    repairs++;
    assert.deepEqual(new Set(failure.failingPaths), new Set(coherenceCPaths));
    return patch;
  } }, event => events.push(event)), /custom_director_unavailable/);
  assert.equal(repairs, 1);
  assert.deepEqual(original, before);
  assert.ok(events.some(event => event.reasonCode === "invalid_coherence_patch"));
});

for (const kind of ["coherence", "camera", "provider"] as const) test(`CM-1.6 explicit retry respects ${kind} failure cache policy`, async () => {
  const { input, response } = customFourShotFixture();
  const original = { ...response, shots: structuredClone(response.shots) };
  original.shots[3].camera = "cinematic camera";
  if (kind === "coherence") original.shots[3].motion = "Camera orbits around product";
  let creates = 0, repairs = 0;
  const api = isolated<typeof runtime>("src/lib/video-director/runtime.ts", {
    "@/lib/openai/beta-policy": { getVideoStudioOpenAIPolicy: () => ({ limits: { analysis: { user: 24, global: 120 } } }) },
    "@/lib/generation/prompts/prompt-enhancer-config": { getPromptEnhancementModel: () => "mock-model" },
    "@/lib/video-generation/diagnostics": { logVideoDiagnostic: () => {} },
    "./core": core, "./receipt": receipts, "./openai-director": {
      createOpenAIVideoPlan: async () => { creates++; if (kind === "provider") throw new Error("uncertain provider failure"); return creates === 1 ? original : response; },
      createOpenAICameraRepairs: async () => { repairs++; return kind === "coherence" ? { fieldRepairs: [] } : { cameraRepairs: [] }; },
    },
  }, { OPENAI_API_KEY: "offline", SUPABASE_SECRET_KEY: "offline-secret" });
  await assert.rejects(() => api.prepareVideoDirectorPlan("owner", Buffer.alloc(0), "source", input));
  assert.equal(creates, 1);
  assert.equal(repairs, kind === "provider" ? 0 : 1);
  if (kind === "provider") {
    await assert.rejects(() => api.prepareVideoDirectorPlan("owner", Buffer.alloc(0), "source", input));
    assert.equal(creates, 1);
  } else {
    const accepted = await api.prepareVideoDirectorPlan("owner", Buffer.alloc(0), "source", input);
    assert.deepEqual(accepted.plan.shots, response.shots);
    await api.prepareVideoDirectorPlan("owner", Buffer.alloc(0), "source", input);
    assert.equal(creates, 2);
    assert.equal(repairs, 1);
  }
});

const coherentCompounds = ["Short controlled lateral arc", "Slow lateral arc", "Gentle lateral arc across the product", "Low-angle lateral arc", "Source-facing lateral arc", "Controlled curved lateral move", "Slow lateral arc across visible surfaces", "Medium framing with a short lateral arc", "Close-up framing with a gentle lateral arc", "High-angle lateral arc", "Eye-level lateral arc", "Locked medium framing with a short lateral arc"];
for (const camera of coherentCompounds) test(`CM-1.7 compound trajectory is a single canonical movement: ${camera}`, () => {
  assert.deepEqual(core.cameraKinds(camera, true), ["lateral"]);
  const { input, response } = customFourShotFixture();
  const original = { ...response, shots: response.shots.map((shot, index) => index === 3 ? { ...shot, camera } : shot) };
  const failures: core.DirectorValidationFailure[] = [];
  const plan = core.parseDirectorOutput(original, input, failure => failures.push(failure));
  assert.ok(plan, JSON.stringify(failures));
  assert.deepEqual(plan.shots, original.shots);
  assert.equal(plan.shots.length, 4);
  assert.equal(plan.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0), 10);
  assert.match(plan.shots[2].camera, /Descend/);
  assert.match(plan.shots[2].motion, /foot contact.*darkness/);
  assert.match(plan.shots[3].composition, /model-free dark studio/i);
  assert.doesNotMatch(plan.shots[3].camera, /grate|foot|street|orbit|360/i);
  assert.match(plan.shots[3].motion, /source-facing/);
  const compiled = core.compileDirectorPlan(plan, input);
  const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: "kling-v3-standard-image", endpointId: "offline", sourceUrl: "https://invalid.example/product" });
  assert.equal(payload.multi_prompt!.length, 4);
  assert.ok(payload.multi_prompt!.every(scene => scene.prompt.length <= 512));
});

for (const camera of ["Dolly in then pull back", "Pan left then pan right", "Track forward then retreat", "Short lateral arc then dolly in", "Lateral arc then tilt down", "Locked camera then pan right"]) test(`CM-1.7 independent trajectories remain conflicting: ${camera}`, () => {
  const { input, response } = customFourShotFixture();
  const failures: core.DirectorValidationFailure[] = [];
  assert.equal(core.parseDirectorOutput({ ...response, shots: response.shots.map((shot, index) => index === 3 ? { ...shot, camera } : shot) }, input, failure => failures.push(failure)), null);
  assert.equal(failures[0].reasonCode, "conflicting_camera_directions");
  assert.equal(failures[0].jsonPath, "$.shots[3].camera");
});

test("CM-1.7 conflict routes to one strict local camera patch with no full plan rewrite", async () => {
  const { input, response } = customFourShotFixture();
  const original = { ...response, shots: response.shots.map((shot, index) => index === 3 ? { ...shot, camera: "Dolly in then pull back" } : shot) };
  const before = structuredClone(original);
  const requests: Record<string, unknown>[] = [];
  const api = mockAdapter(() => ({ status: "completed", output_text: JSON.stringify({ cameraRepairs: [{ shotIndex: 3, camera: "Short controlled lateral arc" }] }) }), undefined, requests);
  const pixels = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
  let repairs = 0;
  const plan = await core.directVideoWithClient(input, { createPlan: async () => original, repairPlan: async (value, failure) => {
    repairs++;
    assert.equal(failure.reasonCode, "conflicting_camera_directions");
    const request = api.buildCameraRepairRequest(value, failure);
    assert.deepEqual([...request.schema.required], ["cameraRepairs"]);
    assert.equal(request.schema.additionalProperties, false);
    assert.deepEqual([...request.schema.properties.cameraRepairs.items.properties.shotIndex.enum], [3]);
    const target = JSON.parse(request.context).targets[0];
    assert.equal(target.shotIndex, 3);
    assert.equal(target.originalCamera, original.shots[3].camera);
    for (const field of ["purpose", "composition", "motion", "lighting", "pace", "focus"] as const) assert.equal(target[field], original.shots[3][field]);
    assert.match(request.instructions, /one coherent, shot-local, source-safe/);
    return api.createOpenAICameraRepairs(value, pixels, failure);
  } });
  assert.equal(repairs, 1);
  assert.equal(requests.length, 1);
  assert.equal((requests[0].text as { format: { name: string } }).format.name, "director_camera_repairs");
  assert.deepEqual(original, before);
  assert.deepEqual(plan.shots, original.shots.map((shot, index) => index === 3 ? { ...shot, camera: "Short controlled lateral arc" } : shot));
  assert.ok(core.parseDirectorOutput(plan, input));
  assert.ok(core.compileDirectorPlan(plan, input).multiPrompt!.every(scene => scene.prompt.length <= 512));
});

for (const acceptedRepair of [false, true]) test(`CM-1.7 runtime conflict repair stays local and cache retry remains explicit; accepted=${acceptedRepair}`, async () => {
  const { input, response } = customFourShotFixture();
  const original = { ...response, shots: response.shots.map((shot, index) => index === 3 ? { ...shot, camera: "Pan left then pan right" } : shot) };
  let creates = 0, repairs = 0;
  const api = isolated<typeof runtime>("src/lib/video-director/runtime.ts", {
    "@/lib/openai/beta-policy": { getVideoStudioOpenAIPolicy: () => ({ limits: { analysis: { user: 24, global: 120 } } }) },
    "@/lib/generation/prompts/prompt-enhancer-config": { getPromptEnhancementModel: () => "mock-model" },
    "@/lib/video-generation/diagnostics": { logVideoDiagnostic: () => {} },
    "./core": core, "./receipt": receipts, "./openai-director": {
      createOpenAIVideoPlan: async () => { creates++; return creates === 1 ? original : response; },
      createOpenAICameraRepairs: async (_value: core.VideoDirectorInput, _source: Buffer, failure: core.DirectorValidationFailure) => {
        repairs++;
        assert.equal(failure.reasonCode, "conflicting_camera_directions");
        return { cameraRepairs: [{ shotIndex: 3, camera: acceptedRepair ? "Short controlled lateral arc" : "Dolly in then pull back" }] };
      },
    },
  }, { OPENAI_API_KEY: "offline", SUPABASE_SECRET_KEY: "offline-secret" });
  if (acceptedRepair) {
    const result = await api.prepareVideoDirectorPlan("owner", Buffer.alloc(0), "source", input);
    assert.equal(result.plan.shots[3].camera, "Short controlled lateral arc");
  } else {
    await assert.rejects(() => api.prepareVideoDirectorPlan("owner", Buffer.alloc(0), "source", input));
    assert.equal(creates, 1);
    assert.equal(repairs, 1);
    const result = await api.prepareVideoDirectorPlan("owner", Buffer.alloc(0), "source", input);
    assert.deepEqual(result.plan.shots, response.shots);
  }
  await api.prepareVideoDirectorPlan("owner", Buffer.alloc(0), "source", input);
  assert.equal(creates, acceptedRepair ? 1 : 2);
  assert.equal(repairs, 1);
});

test("CM-1.7 preserves existing framing/vertical admission and rejects generic camera outputs", () => {
  const { input, response } = customFourShotFixture();
  for (const camera of ["Lower camera toward the grate", "Locked medium framing"]) assert.ok(core.parseDirectorOutput({ ...response, shots: response.shots.map((shot, i) => i === 2 ? { ...shot, camera } : shot) }, input));
  for (const camera of ["auto", "cinematic camera"]) assert.equal(core.parseDirectorOutput({ ...response, shots: response.shots.map((shot, i) => i === 2 ? { ...shot, camera } : shot) }, input), null);
  assert.deepEqual(core.cameraKinds("Slow lateral arc"), ["lateral", "other"], "preset classification remains unchanged");
});

for (const [camera, expected] of [
  ["medium view", "Locked medium framing"], ["medium view of model", "Locked medium framing"],
  ["close shot", "Locked close-up framing"], ["close view", "Locked close-up framing"],
  ["low angle shot", "Locked low-angle framing"], ["high-angle", "Locked high-angle framing"],
  ["eye-level", "Locked eye-level framing"], ["overhead", "Locked overhead framing"],
  ["top-down", "Locked overhead framing"], ["wide", "Locked wide framing"],
  ["full shot", "Locked wide framing"], ["macro", "Locked macro framing"],
  ["tracking toward model", "Track forward"], ["forward tracking", "Track forward"],
  ["backward tracking", "Track backward"], ["camera moves lower", "Lower camera"],
  ["upward", "Raise camera"], ["gentle lateral arc", "Short controlled lateral arc"],
  ["lateral move", "Lateral camera move"], ["tilting down", "Tilt down"],
  ["panning left", "Pan left"], ["crane up", "Crane up"],
]) test(`CM-1.8 deterministic canonicalization preserves the camera cue: ${camera}`, () => {
  const canonical = normalizeCustomCamera(camera, { composition: "Medium product view", userBeat: "A model-free product presentation" });
  assert.equal(canonical, expected);
  assert.ok(executableCustomCamera(canonical!));
  assert.ok(canonical!.length <= 100);
});

test("CM-1.8 explicit camera intent wins over framing; vague or unrelated text stays invalid without context", () => {
  assert.equal(normalizeCustomCamera("medium view", { composition: "Medium model view", userBeat: "Keep the camera locked" }), "Locked medium framing");
  assert.equal(normalizeCustomCamera("medium view of model", { composition: "Steaming grate", userBeat: "Camera descends toward the grate" }), "Lower camera");
  assert.equal(normalizeCustomCamera("close shot", { composition: "Studio product reveal", userBeat: "Source-facing lateral arc" }), "Short controlled lateral arc");
  for (const camera of ["auto", "cinematic camera", "dynamic camera", "model drops toward camera", "rainy NYC street", "wide street"]) {
    assert.equal(normalizeCustomCamera(camera, { composition: "Rain falls", userBeat: "A mood" }), null, camera);
    assert.equal(executableCustomCamera(camera), false, camera);
  }
  assert.equal(normalizeCustomCamera("cinematic camera", { composition: "Medium model framing", userBeat: "Camera performs a figure-eight trajectory" }), null);
  assert.equal(normalizeCustomCamera("medium view", { composition: "Medium model framing", userBeat: "Camera descends then rises" }), null);
  assert.equal(normalizeCustomCamera("tracking toward model", { composition: "Medium model framing", userBeat: "Camera tracks backward" }), null);
  assert.equal(normalizeCustomCamera("auto", { composition: "Close product detail", userBeat: "Product presentation" }), "Locked close-up framing");
  assert.equal(normalizeCustomCamera("cinematic camera", { composition: "Full product reveal", userBeat: "Product presentation" }), "Locked wide framing");
  assert.equal(normalizeCustomCamera("dynamic camera", { composition: "Model posing", userBeat: "Model poses" }), "Locked medium framing");
});

for (const [name, shotIndex, camera, expected] of [
  ["A framing", 1, "medium view of model", "Locked medium framing"],
  ["A generic wording", 1, "cinematic camera", "Locked medium framing"],
  ["B trajectory", 2, "camera moves lower", "Lower camera"],
  ["explicit downward", 2, "medium view of the grate", "Lower camera"],
] as const) test(`CM-1.8 runtime ${name} needs zero provider repairs and preserves the NYC plan`, async () => {
  const { input, response } = customFourShotFixture();
  input.draft.productReferences = [{ source: { kind: "uploaded-image", sourceAssetId: "10000000-0000-4000-8000-000000000003" }, sha256: "b".repeat(64), purpose: "logo", declaredText: "KLAY" }];
  const referenceReviews = [{ index: 0, status: "matched" as const, view: "detail" as const, reason: "Same identity", details: [] }];
  const original = { ...response, referenceReviews, shots: response.shots.map((shot, index) => index === shotIndex ? { ...shot, camera } : shot) };
  const before = structuredClone(original);
  let repairs = 0;
  const events: core.DirectorPlanningDiagnostic[] = [];
  const plan = await core.directVideoWithClient(input, { createPlan: async () => original,
    repairPlan: async () => { repairs++; throw new Error("provider repair must not be used"); } }, event => events.push(event));
  assert.equal(repairs, 0);
  assert.ok(events.some(event => event.reasonCode === "deterministic_camera_normalization"));
  assert.deepEqual(original, before);
  assert.deepEqual(plan.shots, original.shots.map((shot, index) => index === shotIndex ? { ...shot, camera: expected } : shot));
  assert.deepEqual(plan.referenceReviews, referenceReviews);
  assert.equal(plan.summary, original.summary);
  assert.equal(plan.intent, original.intent);
  assert.equal(plan.shots.length, 4);
  assert.equal(plan.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0), 10);
  assert.match(plan.shots[2].camera, /Descend|Lower/);
  assert.match(plan.shots[2].motion, /foot contact.*darkness/);
  assert.match(plan.shots[3].camera, /source-facing/);
  assert.doesNotMatch(plan.shots[3].camera, /street|grate|foot/i);
  const compiled = core.compileDirectorPlan(plan, input);
  const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: "kling-v3-standard-image", endpointId: "offline", sourceUrl: "https://invalid.example/product" });
  assert.equal(payload.multi_prompt!.length, 4);
  assert.ok(payload.multi_prompt!.every(scene => scene.prompt.length <= 512 && scene.prompt.includes('"KLAY"')));
});

test("CM-1.8 deterministic normalization also works without a provider repair implementation", async () => {
  const { input, response } = customFourShotFixture();
  const original = { ...response, shots: response.shots.map((shot, index) => index === 1 ? { ...shot, camera: "low angle shot" } : shot) };
  const plan = await core.directVideoWithClient(input, { createPlan: async () => original });
  assert.equal(plan.shots[1].camera, "Locked low-angle framing");
});

test("CM-1.8 ambiguous explicit camera intent falls back to one strict camera patch", async () => {
  const { input, response } = customFourShotFixture();
  input.draft.prompt = input.draft.prompt.replace("Shot 2:", "Shot 2: Camera performs a figure-eight trajectory.");
  const original = { ...response, shots: response.shots.map((shot, index) => index === 1 ? { ...shot, camera: "cinematic camera" } : shot) };
  const requests: Record<string, unknown>[] = [];
  const api = mockAdapter(() => ({ status: "completed", output_text: JSON.stringify({ cameraRepairs: [{ shotIndex: 1, camera: response.shots[1].camera }] }) }), undefined, requests);
  const pixels = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
  const plan = await core.directVideoWithClient(input, { createPlan: async () => original,
    repairPlan: (value, failure) => api.createOpenAICameraRepairs(value, pixels, failure) });
  assert.equal(requests.length, 1);
  assert.equal((requests[0].text as { format: { name: string } }).format.name, "director_camera_repairs");
  assert.deepEqual(plan.shots, response.shots);
});

for (const [name, returned] of Object.entries({
  missing: { cameraRepairs: [] },
  duplicate: { cameraRepairs: [1, 1].map(shotIndex => ({ shotIndex, camera: "Locked medium framing" })) },
  extra: { cameraRepairs: [{ shotIndex: 0, camera: "Locked medium framing" }] },
  long: { cameraRepairs: [{ shotIndex: 1, camera: "Locked " + "x".repeat(100) }] },
  vague: { cameraRepairs: [{ shotIndex: 1, camera: "private vague camera wording" }] },
})) test(`CM-1.8 invalid ${name} camera patch emits safe contract diagnostics`, async () => {
  const { input, response } = customFourShotFixture();
  input.draft.prompt = input.draft.prompt.replace("Shot 2:", "Shot 2: Camera performs a figure-eight trajectory.");
  const original = { ...response, shots: response.shots.map((shot, index) => index === 1 ? { ...shot, camera: "cinematic camera" } : shot) };
  let repairs = 0;
  const events: core.DirectorPlanningDiagnostic[] = [];
  await assert.rejects(() => core.directVideoWithClient(input, { createPlan: async () => original,
    repairPlan: async () => { repairs++; return returned; } }, event => events.push(event)), /custom_director_unavailable/);
  assert.equal(repairs, 1);
  const diagnostic = events.find(event => event.reasonCode === "invalid_camera_patch" && event.requestedPathCount !== undefined)!;
  assert.ok(diagnostic);
  assert.equal(diagnostic.requestedPathCount, 1);
  assert.equal(diagnostic.returnedRepairCount, returned.cameraRepairs.length);
  assert.deepEqual(diagnostic.returnedShotIndexes, returned.cameraRepairs.map(repair => repair.shotIndex));
  assert.equal(diagnostic.duplicatePath, name === "duplicate");
  assert.equal(diagnostic.missingPath, ["missing", "extra"].includes(name));
  assert.equal(diagnostic.extraPath, name === "extra");
  assert.equal(diagnostic.valueTooLong, name === "long");
  assert.equal(diagnostic.executableValidation, ["duplicate", "extra", "long"].includes(name));
  assert.doesNotMatch(JSON.stringify(diagnostic), /private vague camera wording|cinematic camera|Locked medium framing/);
});

test("CM-1.8 normalization failure plus invalid provider patch allows explicit retry and retains success cache", async () => {
  const { input, response } = customFourShotFixture();
  input.draft.prompt = input.draft.prompt.replace("Shot 2:", "Shot 2: Camera performs a figure-eight trajectory.");
  const original = { ...response, shots: response.shots.map((shot, index) => index === 1 ? { ...shot, camera: "cinematic camera" } : shot) };
  let creates = 0, repairs = 0;
  const logs: Record<string, unknown>[] = [];
  const api = isolated<typeof runtime>("src/lib/video-director/runtime.ts", {
    "@/lib/openai/beta-policy": { getVideoStudioOpenAIPolicy: () => ({ limits: { analysis: { user: 24, global: 120 } } }) },
    "@/lib/generation/prompts/prompt-enhancer-config": { getPromptEnhancementModel: () => "mock-model" },
    "@/lib/video-generation/diagnostics": { logVideoDiagnostic: (_id: string, stage: string, result: string, fields: Record<string, unknown>) => logs.push({ stage, result, ...fields }) },
    "./core": core, "./receipt": receipts, "./openai-director": {
      createOpenAIVideoPlan: async () => { creates++; return creates === 1 ? original : response; },
      createOpenAICameraRepairs: async () => { repairs++; return { cameraRepairs: [] }; },
    },
  }, { OPENAI_API_KEY: "offline", SUPABASE_SECRET_KEY: "offline-secret" });
  await assert.rejects(() => api.prepareVideoDirectorPlan("owner", Buffer.alloc(0), "source", input, undefined, true, { correlationId: "offline" }));
  assert.equal(creates, 1);
  assert.equal(repairs, 1);
  assert.ok(logs.some(log => log.requestedPathCount === 1 && log.returnedRepairCount === 0 && log.missingPath === true));
  assert.doesNotMatch(JSON.stringify(logs), /cinematic camera/);
  const result = await api.prepareVideoDirectorPlan("owner", Buffer.alloc(0), "source", input);
  assert.deepEqual(result.plan.shots, response.shots);
  await api.prepareVideoDirectorPlan("owner", Buffer.alloc(0), "source", input);
  assert.equal(creates, 2);
  assert.equal(repairs, 1);
});

test("CM-1.8 normalization treats multiple failing cameras atomically and preserves subject motion", async () => {
  const { input, response } = customFourShotFixture();
  const original = { ...response, shots: response.shots.map((shot, index) => index < 2 ? { ...shot, camera: "cinematic camera" } : shot) };
  let repairs = 0;
  const plan = await core.directVideoWithClient(input, { createPlan: async () => original, repairPlan: async () => { repairs++; throw new Error("must not call"); } });
  assert.equal(repairs, 0);
  assert.deepEqual(plan.shots, original.shots.map((shot, index) => index < 2 ? { ...shot, camera: "Locked medium framing" } : shot));
  assert.equal(normalizeCustomCamera("medium view", { composition: "Medium model view", userBeat: "Model walks downward toward camera" }), "Locked medium framing");
  assert.equal(normalizeCustomCamera("model moves downward", { composition: "Medium model view", userBeat: "Model walks" }), null);
  assert.equal(normalizeCustomCamera("medium view", { composition: "Steaming grate", userBeat: "Kamerayı aşağı indir" }), null, "unresolved TR movement stays with strict repair rather than becoming static");
});

test("CM-1.8 explicit non-auto UI camera bypasses deterministic normalization", async () => {
  const { input, response } = customFourShotFixture();
  input.draft.cameraMovement = "static";
  const intentContract = customCreativeIntent(input.draft.prompt, directorProductContext(input.profile).evidence, "multi", "static");
  const original = { ...response, intentContract, shots: response.shots.map((shot, index) => ({ ...shot, camera: index === 1 ? "medium view of model" : "Locked wide framing" })) };
  let repairs = 0;
  const events: core.DirectorPlanningDiagnostic[] = [];
  await core.directVideoWithClient(input, { createPlan: async () => original, repairPlan: async () => {
    repairs++;
    return { cameraRepairs: [{ shotIndex: 1, camera: "Locked medium framing" }] };
  } }, event => events.push(event));
  assert.equal(repairs, 1);
  assert.ok(events.every(event => event.reasonCode !== "deterministic_camera_normalization"));
});
