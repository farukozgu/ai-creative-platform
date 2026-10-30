import assert from "node:assert/strict";
import test from "node:test";
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
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import type { ProductProfile } from "../src/lib/product-understanding/product-profile";
import type * as adapter from "../src/lib/video-director/openai-director";
import type * as runtime from "../src/lib/video-director/runtime";
import { directorProducts, directorFixtureInput } from "./fixtures/video-director-fixtures";

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
    intent: "Reveal the automatic watch face and stainless-steel watchband with sculpted light.", detail: /blue dial/ },
  { input: selected(directorProducts[5], "product-spotlight", "multi", 10),
    summary: "A graphic footwear campaign with a clean white background.",
    intent: "Study the white trainer silhouette and woven upper, then settle into a hero view.", detail: /woven upper/ },
  { input: selected(directorProducts[3], "macro-detail-reveal", "single", 5),
    summary: "Ring light shapes a cinematic product study.",
    intent: "Hold on the silver ring and its oval stone setting.", detail: /stone setting/ },
  { input: selected(eyewear, "optical-lines", "multi", 10),
    summary: "A graphic sunglasses campaign on a white backdrop.",
    intent: "Use silk-smooth camera motion to study the black eyewear silhouette.", detail: /frame rim/ },
];

/** Independent authored provider responses: no fallback plan supplies the shots. */
function responseFor(scenario: typeof scenarios[number]) {
  const { input } = scenario;
  const evidence = directorProductContext(input.profile).evidence;
  const detail = evidence.find(item => scenario.detail.test(item.detail))!;
  assert.ok(detail);
  const count = input.shotMode === "single" ? 1 : 3;
  return { summary: scenario.summary, intent: scenario.intent,
    intentContract: creative.interpretCreativeIntent(input.draft.prompt, evidence, input.shotMode, input.draft.cameraMovement),
    shots: Array.from({ length: count }, (_, index) => ({
      durationSeconds: count === 1 ? 5 : [3, 4, 3][index],
      purpose: (["hero-reveal", "macro-detail", "final-hero"] as const)[index],
      focus: `verified-evidence:${detail.id}`,
      camera: ["Slow dolly-in", "Locked close framing", "Slow pull-back"][index],
      composition: ["Full product in negative space", "Close source-facing detail", "Complete product with clear margins"][index],
      lighting: ["Soft rim light", "Light traces the visible relief", "Soft side light"][index],
      motion: "Product stays still", pace: ["Measured opening", "Patient detail hold", "Calm final hold"][index],
    })),
  };
}

function wireResponse<T extends { intentContract: unknown; summary: unknown; intent: unknown }>(plan: T): Omit<T, "intentContract" | "summary" | "intent"> {
  const { intentContract: _intentContract, summary: _summary, intent: _intent, ...wire } = plan;
  void _intentContract; void _summary; void _intent;
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
    "@/lib/openai/client": { getOpenAIVideoStudioAnalysisClient: (_model: string, purpose: string) => sdkClient ?? ({ responses: { create: async (request: Record<string, unknown>) => { requests?.push({ ...request, purpose }); return output(); } } }) },
    "@/lib/openai/structured-response": { structuredResponseText: (format: unknown) => ({ format }) },
    "@/lib/openai/response-telemetry": { attachOpenAIResponseTelemetry: (plan: unknown) => plan },
    "@/lib/generation/prompts/prompt-enhancer-config": { getPromptEnhancementModel: () => "gpt-4o-mini" },
    "@/lib/video-generation/diagnostics": { logVideoDiagnostic: (_id: string, stage: string, result: string, fields: Record<string, unknown>) => diagnostics?.push({ stage, result, ...fields }), safeOpenAIStatus: () => ({}) },
    "./core": core, "./plan-contract": contract, "./kling-compiler": compiler, "./presets": presets,
    "./product-context": { directorProductContext }, "./preset-library": { safePresetStrategy }, "./creative-request": creative,
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
    { value: { ...good, shots: good.shots.map(s => ({ ...s, durationSeconds: 3 })) }, path: "$.shots[*].durationSeconds", code: "total_duration_mismatch" },
    { value: { ...good, shots: good.shots.map((s, i) => i ? s : { ...s, durationSeconds: 2.5 }) }, path: "$.shots[0]", code: "invalid_shot_fields" },
    { value: { ...good, shots: good.shots.map(s => ({ ...s, purpose: "hero-reveal" })) }, path: "$.shots[*].purpose", code: "repeated_shot_purpose" },
    { value: { ...good, shots: good.shots.map(s => ({ ...s, camera: "Slow dolly-in" })) }, path: "$.shots[*].camera", code: "repeated_push_in" },
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
  assert.ok(core.parseDirectorOutput(generic, scenario.input));
  const hold = { ...good, shots: good.shots.map((shot, i) => i ? shot : { ...shot, camera: "Slow dolly-in, then a locked final hold" }) };
  assert.ok(core.parseDirectorOutput(hold, scenario.input), "a terminal hold is not a conflicting camera trajectory");
});

test("reference-review schema agrees with matched/uncertain business rules", () => {
  const scenario = scenarios[0];
  const input = { ...scenario.input, draft: { ...scenario.input.draft, productReferences: [{
    source: { kind: "uploaded-image" as const, sourceAssetId: "10000000-0000-4000-8000-000000000001" }, sha256: "a".repeat(64), purpose: "detail",
  }] } };
  const api = mockAdapter(() => ({ status: "completed", output_text: "{}" }));
  const schema = api.buildDirectorRequest(input).schema as Schema;
  const response = responseFor(scenario);
  const candidate = { ...response, shots: response.shots.map(shot => ({ ...shot, referenceIndex: null })),
    referenceReviews: [{ index: 0, status: "uncertain", view: "unknown", reason: "Ambiguous crop", details: [] as string[] }] };
  assertSchema(wireResponse(candidate), schema);
  assert.ok(core.parseDirectorOutput(candidate, input));
  candidate.referenceReviews[0].details = ["new visible notch"];
  // Array cardinality is now enforced by the server, not the provider schema.
  assertSchema(wireResponse(candidate), schema);
  const failures: core.DirectorValidationFailure[] = [];
  assert.equal(core.parseDirectorOutput(candidate, input, failure => failures.push(failure)), null);
  assert.equal(failures[0].reasonCode, "invalid_reference_reviews");
});

test("selected camera, requested evidence and sequence use the same schema and runtime contract", () => {
  const scenario = scenarios[0];
  const input = { ...scenario.input, draft: { ...scenario.input.draft, cameraMovement: "static" as const,
    prompt: "Pan right and keep the blue dial sharp." } };
  const candidate = responseFor({ ...scenario, input });
  candidate.shots = candidate.shots.map(shot => ({ ...shot, camera: "Locked camera", focus: `verified-evidence:${candidate.intentContract.focusEvidenceId}` }));
  const api = mockAdapter(() => ({ status: "completed", output_text: "{}" }));
  assertSchema(wireResponse(candidate), api.buildDirectorRequest(input).schema as Schema);
  const plan = core.parseDirectorOutput(candidate, input);
  assert.ok(plan);
  assert.equal(plan.intentContract.camera, "static");
  assert.ok(plan.shots.every(shot => /locked/i.test(shot.camera)));
  const wrongFocus = { ...candidate, shots: candidate.shots.map(shot => ({ ...shot, focus: contract.DIRECTOR_GENERIC_FOCUS_VALUES[0] })) };
  const failures: core.DirectorValidationFailure[] = [];
  assert.equal(core.parseDirectorOutput(wrongFocus, input, failure => failures.push(failure)), null);
  assert.equal(failures[0].reasonCode, "requested_focus_not_preserved");
  const sequence = selected(watch, "cinematic-dial", "single", 5);
  sequence.draft.prompt = "Start close on the blue dial then finish wide.";
  sequence.draft.cameraMovement = "static";
  assert.ok(core.compileDirectorPlan(core.fallbackDirectorPlan(sequence), sequence));
});

test("server field bounds reserve expanded 100-char evidence, critical-region prose and reference prefix", () => {
  const api = mockAdapter(() => ({ status: "completed", output_text: "{}" }));
  const evidenceDetail = "visible surface relief " + "x".repeat(77);
  assert.equal(evidenceDetail.length, 100);
  const profile = { ...watch, identityCriticalAttributes: [{ attribute: evidenceDetail, rationale: "visible", regions: [] }] };
  for (const marked of [false, true]) for (const references of [false, true]) for (const cameraMovement of ["auto", "static", "pan-right"] as const) {
    const input = selected(profile, "cinematic-dial", "multi", 10);
    input.draft.cameraMovement = cameraMovement;
    if (marked) input.draft.criticalRegion = { x: 0.1, y: 0.1, width: 0.2, height: 0.2, declaredText: "" };
    if (references) input.draft.productReferences = [{ source: { kind: "uploaded-image", sourceAssetId: "10000000-0000-4000-8000-000000000001" }, sha256: "a".repeat(64), purpose: "detail" }];
    const request = api.buildDirectorRequest(input);
    const fields = Object.fromEntries(contract.shotFields.map(field => [field, field === "focus" ? evidenceDetail : "x".repeat(request.fieldLimits[field])]));
    const prompt = compiler.compileKlingShot({ ...fields, durationSeconds: 3, purpose: "hero-reveal", evidenceRefs: [0] } as core.VideoDirectorShot, references ? 502 : 512, marked);
    assert.ok(prompt.length + (references ? 10 : 0) <= 512);
    const id = directorProductContext(profile).evidence.find(item => item.detail === evidenceDetail)!.id;
    const candidate = { summary: "A source-facing cinematic study", intent: "Resolve the existing form with measured light",
      intentContract: creative.interpretCreativeIntent("", directorProductContext(profile).evidence, "multi", cameraMovement),
      ...(references ? { referenceReviews: [{ index: 0, status: "matched", view: "unknown", reason: "Consistent visible identity", details: [] }] } : {}),
      shots: ["hero-reveal", "macro-detail", "final-hero"].map((purpose, index) => ({ ...fields, ...(references ? { referenceIndex: null } : {}), purpose, durationSeconds: [3, 4, 3][index],
        focus: `verified-evidence:${id}`, composition: String(fields.composition).slice(1) + String(index) })),
    };
    assertSchema(wireResponse(candidate), request.schema as Schema);
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
  const candidate = responseFor(scenario);
  candidate.shots[0].composition = "Clear space ".repeat(8);
  candidate.shots[0].lighting = "Soft light ".repeat(9);
  candidate.shots[0].motion = "Product stays still. ".repeat(4);
  candidate.shots[0].pace = "Measured pace. ".repeat(6);
  const events: core.DirectorPlanningDiagnostic[] = [];
  const plan = await core.directVideoWithClient(scenario.input, { createPlan: async () => candidate }, event => events.push(event));
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
  const input = scenarios[0].input;
  const owner = "10000000-0000-4000-8000-000000000001";
  const env = { VIDEO_STUDIO_ENABLED: "true", VIDEO_STUDIO_ACCESS_MODE: "authenticated" };
  const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
  for (const accepted of [true, false]) {
    let calls = 0, reservations = 0;
    const requests: Array<Record<string, unknown>> = [];
    const guarded = createOpenAIBetaFetch({ env, authenticate: async () => owner,
      policyForUser: () => getVideoStudioOpenAIPolicy(owner, "gpt-4o-mini", env), analysisMaxOutputTokens: 4000,
      reserve: async () => { reservations++; return true; }, send: async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        calls++;
        const candidate = responseFor(scenarios[0]);
        if (calls === 1 || !accepted) candidate.shots[0].motion = "Light traces the seam";
        return Response.json({ object: "response", status: "completed", output: [{ type: "message", status: "completed",
          content: [{ type: "output_text", text: JSON.stringify(wireResponse(candidate)) }] }] });
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
