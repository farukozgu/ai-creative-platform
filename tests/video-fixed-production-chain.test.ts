import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import sharp from "sharp";
import * as core from "../src/lib/video-director/core";
import type * as adapter from "../src/lib/video-director/openai-director";
import { videoPresetIds } from "../src/lib/video-director/presets";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { klingElementReferences } from "../src/lib/video-generation/product-references";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";

function offlineAdapter(response: (body: Record<string, unknown>) => unknown) {
  const filename = resolve("src/lib/video-director/openai-director.ts");
  const requireLocal = createRequire(filename);
  const exports = {};
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  runInNewContext(code, { exports, Buffer, process: { env: {} }, require: (name: string) => {
    if (name === "server-only") return {};
    if (name === "@/lib/openai/client") return { getOpenAIVideoStudioAnalysisClient: () => ({ responses: { create: async (body: Record<string, unknown>) => ({ status: "completed", output_text: JSON.stringify(response(body)) }) } }) };
    if (name === "@/lib/openai/structured-response") return { structuredResponseText: (format: unknown) => ({ format }) };
    if (name === "@/lib/openai/response-telemetry") return { attachOpenAIResponseTelemetry: (value: unknown) => value };
    if (name === "@/lib/generation/prompts/prompt-enhancer-config") return { getPromptEnhancementModel: () => "gpt-4o-mini" };
    if (name === "@/lib/video-generation/diagnostics") return { logVideoDiagnostic: () => {}, safeOpenAIStatus: () => ({}) };
    return requireLocal(name.startsWith("@/") ? resolve("src", name.slice(2)) : name);
  } });
  return exports as typeof adapter;
}
const fixtures = libraryFixtures.filter((fixture, index, all) => fixture.category !== "unknown" && all.findIndex(other => other.category === fixture.category) === index);
const wireShots = (plan: core.VideoDirectorPlan) => plan.shots.map(({ evidenceRefs, referenceIndex: _reference, ...shot }) => {
  void _reference;
  return { ...shot, focus: evidenceRefs.length ? `verified-evidence:${evidenceRefs[0]}` : shot.focus };
});

test("24 presets × 12 categories × 5/10s × Single/Multi reach the actual Kling payload", async () => {
  const api = offlineAdapter(() => { throw new Error("Network forbidden"); });
  let cases = 0;
  for (const presetId of videoPresetIds) for (const { category, profile } of fixtures) for (const durationSeconds of [5, 10] as const) for (const shotMode of ["single", "multi"] as const) {
    const base = directorFixtureInput(profile!);
    const input = { ...base, presetId, shotMode, draft: { ...base.draft, shotMode, durationSeconds } };
    const key = `${presetId}/${category}/${durationSeconds}/${shotMode}`;
    const expected = core.fallbackDirectorPlan(input);
    const request = api.buildDirectorRequest(input);
    const context = JSON.parse(request.context);
    const quickCuts = presetId === "cinematic-hero" && shotMode === "multi" && durationSeconds === 10;
    if (presetId !== "cinematic-hero" || quickCuts) {
      assert.ok(context.fixedShots, key);
      assert.equal(context.fixedShots.length, expected.shots.length, key);
      for (const [index, shot] of expected.shots.entries()) for (const field of ["purpose", "camera", "composition", "lighting", "motion", "pace", "durationSeconds"] as const) assert.equal(context.fixedShots[index][field], shot[field], `${key}/${field}`);
    } else assert.equal(context.fixedShots, undefined);
    const plan = await core.directVideoWithClient(input, { createPlan: async () => ({ ...expected, shots: wireShots(expected) }) });
    assert.deepEqual(plan.shots, expected.shots, key);
    const dedicated = plan.shots.map((shot, index) => shot.evidenceRefs.length && /close|macro/i.test(shot.camera) ? index : -1).filter(index => index >= 0);
    if (dedicated.length > 1) {
      const first = plan.shots[dedicated[0]], second = dedicated[1];
      assert.equal(core.parseDirectorOutput({ ...plan, shots: plan.shots.map((shot, index) => index === second
        ? { ...shot, focus: first.focus, evidenceRefs: first.evidenceRefs } : shot) }, input), null, `${key}/dedicated repeat`);
    }
    for (const patch of [{ camera: "Slow dolly-in" }, { lighting: "Unexpected lighting direction" }, { focus: "unverified invented detail", evidenceRefs: [] }]) {
      if (presetId === "cinematic-hero" && !Object.hasOwn(patch, "focus")) continue;
      assert.equal(core.parseDirectorOutput({ ...plan, shots: plan.shots.map((shot, index) => index ? shot : { ...shot, ...patch }) }, input), null, key);
    }
    const refs = { ...input, draft: { ...input.draft, productReferences: [{ source: { kind: "uploaded-image" as const, sourceAssetId: "10000000-0000-4000-8000-000000000002" }, sha256: "b".repeat(64), purpose: "logo" }] } };
    const review = { index: 0, status: "matched" as const, view: "detail" as const, reason: "Same product", details: ["visible logo"] };
    assert.equal(JSON.stringify(api.buildDirectorRequest(refs)), JSON.stringify(request), key);
    const withRefs = await core.directVideoWithClient(refs, { createPlan: async () => ({ ...expected, shots: wireShots(expected), referenceReviews: [review] }) });
    assert.deepEqual(withRefs.shots, plan.shots, key);
    assert.deepEqual(core.compileDirectorPlan(withRefs, refs), core.compileDirectorPlan(plan, input), key);
    const compiled = core.compileDirectorPlan(plan, input);
    for (const quality of ["standard", "pro"] as const) {
      const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: `kling-v3-${quality}-image`, endpointId: "offline", sourceUrl: "https://invalid.example/main",
        elementImageUrls: klingElementReferences([review], refs.draft.productReferences).map(() => "https://invalid.example/logo") });
      assert.equal(payload.elements, undefined, key);
      assert.equal(payload.duration, String(durationSeconds), key);
      assert.deepEqual(shotMode === "multi" ? payload.multi_prompt : payload.prompt, shotMode === "multi" ? compiled.multiPrompt : compiled.prompt, key);
      assert.equal(payload.shot_type, shotMode === "multi" ? "customize" : undefined, key);
    }
    cases++;
  }
  assert.equal(cases, 1152);
});

test("all 23 fixed presets use the real OpenAI adapter with isolated logo review and unchanged shot directions", async () => {
  const pixels = await sharp({ create: { width: 24, height: 24, channels: 3, background: "white" } }).png().toBuffer();
  for (const presetId of videoPresetIds.filter(id => id !== "cinematic-hero")) {
    const base = directorFixtureInput(directorProducts[0]);
    const input = { ...base, presetId };
    const expected = core.fallbackDirectorPlan(input);
    const captured: Record<string, unknown>[] = [];
    let reviewView = "detail";
    const api = offlineAdapter(body => {
      captured.push(body);
      const schema = (body.text as { format: { schema: { required: string[] } } }).format.schema;
      return schema.required.includes("referenceReviews") ? { referenceReviews: { r0: { status: "matched", view: reviewView, reason: "Same product identity", details: [] } } } : { shots: wireShots(expected) };
    });
    const plain = await core.directVideoWithClient(input, { createPlan: value => api.createOpenAIVideoPlan(value, pixels) });
    const refs = { ...input, draft: { ...input.draft, productReferences: [{ source: { kind: "uploaded-image" as const, sourceAssetId: "10000000-0000-4000-8000-000000000002" }, sha256: "b".repeat(64), purpose: "logo" }] }, referenceImages: [{ prepared: pixels, sourceSha256: "b".repeat(64), purpose: "logo" }] };
    const reviewed = await core.directVideoWithClient(refs, { createPlan: value => api.createOpenAIVideoPlan(value, pixels) });
    const origin = expected.editorialStoryboard ? "fallback" : "ai";
    assert.equal(plain.origin, origin, presetId);
    assert.equal(reviewed.origin, origin, presetId);
    assert.equal(JSON.stringify(captured[0]), JSON.stringify(captured[1]), presetId);
    assert.equal(captured.length, 3, presetId);
    assert.deepEqual(reviewed.shots, plain.shots, presetId);
    for (const [purpose, view] of [["texture", "detail"], ["angle", "back"]]) {
      reviewView = view;
      const supplemented = { ...refs, draft: { ...refs.draft, productReferences: [{ ...refs.draft.productReferences[0], purpose }] },
        referenceImages: [{ ...refs.referenceImages[0], purpose }] };
      const requestOffset: number = captured.length;
      const supported = await core.directVideoWithClient(supplemented, { createPlan: value => api.createOpenAIVideoPlan(value, pixels) });
      assert.equal(supported.origin, origin, `${presetId}/${purpose}`);
      assert.equal(JSON.stringify(captured[requestOffset]), JSON.stringify(captured[0]), `${presetId}/${purpose}/primary request`);
      assert.deepEqual(supported.shots.map(({ referenceIndex: _index, ...shot }) => { void _index; return shot; }), plain.shots, `${presetId}/${purpose}/creative direction`);
      const compiled = core.compileDirectorPlan(supported, supplemented);
      assert.doesNotThrow(() => buildFalVideoRequestInput({ ...supplemented.draft, ...compiled, modelId: "kling-v3-standard-image", endpointId: "offline", sourceUrl: "https://invalid.example/main",
        elementImageUrls: klingElementReferences(supported.referenceReviews ?? [], supplemented.draft.productReferences).map(() => "https://invalid.example/angle") }), presetId);
    }
  }
});

test("C1 reference-only adapter scopes a whole side and leaves a cropped profile as detail", async () => {
  const pixels = await sharp({ create: { width: 24, height: 24, channels: 3, background: "white" } }).png().toBuffer();
  const base = directorFixtureInput(directorProducts[2]);
  const sha256 = "b".repeat(64);
  const purpose = "side-profile";
  const input: core.VideoDirectorInput = { ...base, presetId: "metallic-light-sweep",
    draft: { ...base.draft, productReferences: [{ source: { kind: "uploaded-image", sourceAssetId: "10000000-0000-4000-8000-000000000002" }, purpose, sha256 }] },
    referenceImages: [{ prepared: pixels, purpose, sourceSha256: sha256 }] };
  let wholeSideVisible = true;
  const api = offlineAdapter(() => ({ referenceReviews: { r0: { status: "matched", view: "side", wholeSideVisible, reason: "Offline same-product review", details: [] } } }));
  const [whole] = await api.createOpenAIReferenceReviews(input, pixels);
  assert.equal(whole.view, "side");
  assert.equal(whole.wholeSideVisible, true);
  wholeSideVisible = false;
  const [crop] = await api.createOpenAIReferenceReviews(input, pixels);
  assert.equal(crop.view, "detail");
  assert.equal(crop.wholeSideVisible, undefined);
  wholeSideVisible = true;
  const [d1] = await api.createOpenAIReferenceReviews({ ...input, draft: { ...input.draft, durationSeconds: 5 } }, pixels);
  assert.equal(d1.view, "side");
  assert.equal(d1.wholeSideVisible, true);
  assert.equal(d1.creativeSafeSide, false); // An older completeness review is not creative-safety authority.
  const creativeApi = offlineAdapter(() => ({ referenceReviews: { r0: { status: "matched", view: "side",
    wholeSideVisible: true, creativeSafeSide: true, reason: "Complete upright side", details: [] } } }));
  const [creativeSide] = await creativeApi.createOpenAIReferenceReviews({ ...input, draft: { ...input.draft, durationSeconds: 5 } }, pixels);
  assert.equal(creativeSide.creativeSafeSide, true);
});
