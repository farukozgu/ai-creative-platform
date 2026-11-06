import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { initialVideoStudioDraft, videoStudioCreativeFields, videoStudioReducer, validateVideoStudioDraft } from "../src/features/video/video-studio-state";
import { compileDirectorPlan, directVideoWithClient, directorPlanDescriptions, fallbackDirectorPlan, type VideoDirectorInput } from "../src/lib/video-director/core";
import { interpretCreativeIntent } from "../src/lib/video-director/creative-request";
import { directorProductContext } from "../src/lib/video-director/product-context";
import { validateVideoGenerationDraft } from "../src/lib/video-generation/validation";
import { videoDraftHash } from "../src/lib/video-generation/request-identity";
import { VideoProductionHarness } from "./fixtures/video-production-harness";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";

const request = "Yavaşça yaklaş, yumuşak yan ışıkla ürünü göster.";
function customResponse(input: VideoDirectorInput) {
  const durations = input.shotMode === "single" ? [input.draft.durationSeconds] : input.draft.durationSeconds === 5 ? [2, 3] : [4, 6];
  return {
    ...directorPlanDescriptions(input, durations.length),
    intentContract: interpretCreativeIntent(input.draft.prompt, directorProductContext(input.profile).evidence, input.shotMode, input.draft.cameraMovement),
    shots: durations.map((durationSeconds, index) => ({ durationSeconds, purpose: index === 0 ? "hero-reveal" : "final-hero",
      camera: index === 0 ? "Slow dolly-in" : "Locked full product framing",
      composition: index === 0 ? "Complete product with diagonal space" : "Full product with balanced margins",
      lighting: "Soft side light", motion: "Keep the product still", pace: "Calm hold", focus: "Source-visible product form" })),
    ...(input.draft.productReferences?.length ? { referenceReviews: input.draft.productReferences.map((_, index) => ({ index, status: "matched", view: "detail", reason: "Same visible identity", details: [] })) } : {}),
  };
}

test("mode switch clears creative values while shared source/output settings survive; mapper excludes stale selections", () => {
  const source = { kind: "library" as const, id: "source", name: "Product", previewUrl: "preview", generationId: "id", projectId: "project", createdAt: "now", aspectRatio: "1:1" };
  const state = { ...initialVideoStudioDraft, shotMode: "single" as const, source, quality: "pro" as const, duration: 10 as const, aspectRatio: "9:16" as const,
    prompt: "old motion", cameraMovement: "pan-left" as const };
  assert.deepEqual(videoStudioCreativeFields(state), { creativeMode: "preset", prompt: "", cameraMovement: "auto" });
  const custom = videoStudioReducer(state, { type: "set-creative-mode", mode: "custom" });
  assert.equal(custom.source, source);
  assert.equal(custom.quality, "pro"); assert.equal(custom.duration, 10); assert.equal(custom.aspectRatio, "9:16");
  assert.equal(custom.prompt, ""); assert.equal(custom.cameraMovement, "auto");
  assert.equal(validateVideoStudioDraft(custom), "prompt-required");
  const written = videoStudioReducer(custom, { type: "set-prompt", prompt: request });
  assert.equal(validateVideoStudioDraft(written), null);
  const stalePreset = { presetId: "minimal-studio" as const, shotMode: "multi" as const, receipt: "old" };
  assert.equal(videoStudioCreativeFields(written, stalePreset).director, undefined);
  const preset = videoStudioReducer(written, { type: "set-creative-mode", mode: "preset" });
  assert.equal(preset.prompt, "");
  assert.equal(videoStudioCreativeFields(preset, { creativeMode: "custom", shotMode: "multi", receipt: "old" }).director, undefined);
});

test("request validation rejects simultaneous preset/custom direction and cross-mode plan selections", () => {
  const base = directorFixtureInput(directorProducts[0]).draft;
  const preset = { ...base, creativeMode: "preset" as const, prompt: "", cameraMovement: "auto" as const };
  const custom = { ...base, creativeMode: "custom" as const, prompt: request };
  for (const draft of [preset, custom]) assert.ok(validateVideoGenerationDraft(draft).ok);
  for (const draft of [
    { ...preset, prompt: request }, { ...preset, cameraMovement: "dolly-in" }, { ...custom, prompt: " " },
    { ...custom, director: { presetId: "minimal-studio", shotMode: "multi", receipt: "old" } },
    { ...preset, director: { creativeMode: "custom", shotMode: "multi", receipt: "old" } },
    { ...custom, director: { creativeMode: "custom", presetId: "minimal-studio", shotMode: "multi", receipt: "old" } },
  ]) assert.equal(validateVideoGenerationDraft(draft).ok, false);
  assert.notEqual(videoDraftHash({ ...custom, prompt: "" }), videoDraftHash(preset));
});

test("preset quote and submission use fixed directions after stale custom text/camera are stripped", async () => {
  const f = await VideoProductionHarness.create();
  const draft = { ...f.draft(), ...videoStudioCreativeFields({ ...initialVideoStudioDraft, prompt: "old custom spotlight", cameraMovement: "pan-left" }) };
  const plan = f.signDirector(draft, "fallback");
  const quote = await f.api.quoteVideoSubmissionAction(draft);
  assert.equal(quote.status, "success");
  if (quote.status !== "success") throw new Error("Missing preset quote");
  assert.equal(draft.prompt, ""); assert.equal(draft.cameraMovement, "auto");
  assert.equal(quote.preview.shots[0].camera, plan.shots[0].camera);
  assert.doesNotMatch(JSON.stringify(quote.preview), /old custom spotlight|pan left/i);
  const result = await f.api.submitVideoGenerationAction(draft, quote.cost, quote.receipt, true);
  assert.ok(result.ok);
  assert.equal(f.posts[0].input.prompt, quote.preview.shots[0].prompt);
  f.assertIsolated();
});

for (const quality of ["standard", "pro"] as const) for (const durationSeconds of [5, 10] as const) for (const shotMode of ["single", "multi"] as const) {
  test(`custom -> Director receipt -> quote -> approval -> idempotent mocked payload: ${quality}/${durationSeconds}/${shotMode}`, async () => {
    const f = await VideoProductionHarness.create();
    f.env.OPENAI_API_KEY = "offline-only";
    f.analysisProfile = { ...f.profile, confidence: { overall: 0.69 } };
    const draft = { ...f.draft(quality, durationSeconds, shotMode), creativeMode: "custom" as const, prompt: request };
    const referenceId = "10000000-0000-4000-8000-000000000003";
    const sha256 = await f.addSource(referenceId);
    draft.productReferences = [{ source: { kind: "uploaded-image", sourceAssetId: referenceId }, sha256, purpose: "logo" }];
    const input: VideoDirectorInput = { draft, profile: f.analysisProfile, presetId: "custom", shotMode };
    f.directorResponse = customResponse(input);
    const prepared = await f.prepareDirector(input);
    assert.equal(prepared.status, "success", JSON.stringify(f.logs));
    if (prepared.status !== "success") throw new Error("Custom preparation failed");
    assert.equal(prepared.plan.presetId, "custom");
    assert.equal(prepared.plan.origin, "ai");
    assert.equal(prepared.plan.shots.length, shotMode === "single" ? 1 : 2);
    assert.ok(f.directorInputs.every(value => value.presetId === "custom" && value.draft.prompt === request));
    draft.director = { creativeMode: "custom", shotMode, receipt: prepared.receipt };
    assert.equal(Object.hasOwn(draft.director, "presetId"), false);
    const quote = await f.api.quoteVideoSubmissionAction(draft);
    assert.equal(quote.status, "success", JSON.stringify(quote));
    if (quote.status !== "success") throw new Error("Missing custom quote");
    const changed = await f.api.submitVideoGenerationAction({ ...draft, prompt: "Farklı yaratıcı yön" }, quote.cost, quote.receipt, true);
    assert.equal(changed.ok, false);
    const unapproved = await f.api.submitVideoGenerationAction(draft, quote.cost, quote.receipt, false);
    assert.equal(unapproved.ok, false); assert.equal(f.posts.length, 0);
    const result = await f.api.submitVideoGenerationAction(draft, quote.cost, quote.receipt, true);
    assert.ok(result.ok, JSON.stringify(result));
    const duplicate = await f.api.submitVideoGenerationAction(draft, quote.cost, quote.receipt, true);
    assert.ok(duplicate.ok && duplicate.duplicate);
    assert.equal(f.posts.length, 1);
    const payload = f.posts[0].input;
    assert.equal(payload.duration, String(durationSeconds));
    // Image-to-video inherits its ratio from the prepared source, not a provider aspect_ratio field.
    assert.equal(f.rows[0].aspect_ratio, "1:1");
    assert.equal(payload.elements, undefined, "logo reference is accuracy-only");
    if (shotMode === "multi") assert.deepEqual(JSON.parse(JSON.stringify(payload.multi_prompt)), Array.from(quote.preview.shots, shot => ({ prompt: shot.prompt, duration: String(shot.duration) })));
    else assert.equal(payload.prompt, quote.preview.shots[0].prompt);
    const switched = await f.api.submitVideoGenerationAction({ ...draft, creativeMode: "preset", prompt: "", director: undefined }, quote.cost, quote.receipt, true);
    assert.equal(switched.ok, false);
    f.assertIsolated();
  });
}

test("custom planning has no preset fallback, including invalid AI output", async () => {
  const base = directorFixtureInput(directorProducts[0]);
  const input: VideoDirectorInput = { ...base, presetId: "custom", draft: { ...base.draft, creativeMode: "custom", prompt: request } };
  assert.throws(() => fallbackDirectorPlan(input), /custom_director_unavailable/);
  await assert.rejects(() => directVideoWithClient(input, { createPlan: async () => ({ shots: [] }) }), /custom_director_unavailable/);
  const plan = await directVideoWithClient(input, { createPlan: async () => customResponse(input) });
  assert.doesNotThrow(() => compileDirectorPlan(plan, input));
});

test("actual OpenAI request mapping excludes preset grammar from custom and isolates accuracy references", async () => {
  const f = await VideoProductionHarness.create();
  for (const shotMode of ["single", "multi"] as const) for (const durationSeconds of [5, 10] as const) {
    const draft = { ...f.draft("standard", durationSeconds, shotMode), creativeMode: "custom" as const, prompt: request };
    const input: VideoDirectorInput = { draft, profile: f.profile, presetId: "custom", shotMode };
    const built = f.directorRequest(input);
    const context = JSON.parse(built.context);
    assert.equal(context.creativeMode, "custom"); assert.equal(context.userRequest, request);
    assert.equal(context.preset, undefined); assert.equal(context.fixedShots, undefined);
    assert.match(built.instructions, /userRequest is the only creative authority/);
    assert.doesNotMatch(built.instructions, /selected preset brief must drive|Preserve preset direction/);
    const withRefs = { ...input, draft: { ...draft, productReferences: [{ source: { kind: "uploaded-image" as const, sourceAssetId: "10000000-0000-4000-8000-000000000003" }, sha256: "b".repeat(64), purpose: "logo" }] } };
    assert.equal(f.directorRequest(withRefs).context, built.context);
    const review = JSON.parse(f.directorRequest(withRefs, true).context);
    assert.equal(review.preset, undefined); assert.equal(review.userRequest, undefined);
  }
  f.assertIsolated();
});

test("UI locks Custom while preserving generation mapping and legacy translations", () => {
  const ui = readFileSync("src/features/video/video-studio-workspace.tsx", "utf8");
  assert.match(ui, /presetControls=\{draft.creativeMode === "preset" \?/);
  assert.match(ui, /promptEnabled=\{false\}/);
  assert.doesNotMatch(ui, /video-camera|cameraValues|set-camera/);
  assert.doesNotMatch(ui, /creativeModeControls=|set-creative-mode|video-creative-mode/);
  assert.match(ui, /const approvedDraft = \{ \.\.\.generationDraft, \.\.\.videoStudioCreativeFields\(draft, currentDirector\) \}/);
  for (const locale of ["tr", "en"]) {
    const copy = JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8")).Dashboard.videoStudio.creativeMode;
    for (const key of ["heading", "preset", "custom", "presetDescription", "customDescription"]) assert.ok(copy[key]);
  }
});

test("rendered inspector removes free-form input in preset mode and exposes it in custom mode", () => {
  const exports = {} as { VideoGenerationInspector: React.ComponentType<Record<string, unknown>> };
  const code = ts.transpileModule(readFileSync("src/features/video/video-generation-inspector.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { exports, require: (name: string) => {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name.endsWith("/button")) return { Button: ({ children }: React.PropsWithChildren) => React.createElement("button", null, children) };
    if (name.endsWith("/navigation")) return { Link: () => null };
    if (name.endsWith("/video-source-selector")) return { VideoSourceSelector: () => null };
    if (name.endsWith(".module.css")) return { default: {} };
    throw new Error(`Unexpected UI import: ${name}`);
  } });
  const props = { copy: { source: {}, promptHeading: "Creative brief", promptDescription: "Describe the camera", promptPlaceholder: "Your idea", secondsLabel: String },
    source: null, prompt: request, qualityOptions: [], aspectRatioOptions: [], durationOptions: [], libraryAssets: [],
    onPromptChange: () => {}, onGenerate: () => {} };
  const preset = renderToStaticMarkup(React.createElement(exports.VideoGenerationInspector, { ...props, promptEnabled: false }));
  const custom = renderToStaticMarkup(React.createElement(exports.VideoGenerationInspector, { ...props, promptEnabled: true }));
  assert.doesNotMatch(preset, /textarea|video-prompt-heading/);
  assert.match(custom, /<textarea[^>]*aria-labelledby="video-prompt-heading"/);
  assert.ok(custom.includes(request));
});
