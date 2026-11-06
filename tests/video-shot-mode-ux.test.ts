import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initialVideoStudioDraft, isVideoStudioDraftReady, validateVideoStudioDraft, videoStudioCreativeFields, videoStudioReducer } from "../src/features/video/video-studio-state";
import type { VideoCameraMovement } from "../src/features/video/video-studio-types";
import { validateVideoGenerationDraft } from "../src/lib/video-generation/validation";
import { fallbackDirectorPlan, parseDirectorOutput } from "../src/lib/video-director/core";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";
import { VideoProductionHarness } from "./fixtures/video-production-harness";

const source = { kind: "library" as const, id: "source", name: "Product", previewUrl: "preview", generationId: "id", projectId: "project", createdAt: "now", aspectRatio: "1:1" };
test("studio defaults to multi while legacy missing shot choices still block readiness", () => {
  assert.equal(initialVideoStudioDraft.shotMode, "multi");
  for (const creativeMode of ["preset", "custom"] as const) {
    const draft = { ...initialVideoStudioDraft, source, creativeMode, shotMode: null, prompt: "Yavaş yaklaş" };
    assert.equal(validateVideoStudioDraft(draft), "shot-mode-required");
    assert.equal(isVideoStudioDraftReady(draft), false);
    for (const mode of ["single", "multi"] as const) {
      const selected = videoStudioReducer(draft, { type: "set-shot-mode", mode });
      assert.equal(isVideoStudioDraftReady(selected), true);
      assert.equal(selected.source, source); assert.equal(selected.prompt, draft.prompt);
      const switched = videoStudioReducer(selected, { type: "set-creative-mode", mode: creativeMode === "preset" ? "custom" : "preset" });
      assert.equal(switched.shotMode, mode);
    }
  }
});

test("restored camera choices always normalize to auto without losing custom text or shared fields", () => {
  const cameras: VideoCameraMovement[] = ["auto", "orbit", "pan-left", "pan-right", "dolly-in", "dolly-out", "static"];
  const base = directorFixtureInput(directorProducts[0]).draft;
  for (const creativeMode of ["preset", "custom"] as const) for (const cameraMovement of cameras) for (const shotMode of ["single", "multi"] as const) {
    const restored = { ...initialVideoStudioDraft, source, creativeMode, shotMode, cameraMovement, prompt: "Yavaş yaklaş, sonra sabit tut" };
    const mapped = { ...base, shotMode, ...videoStudioCreativeFields(restored) };
    assert.equal(mapped.cameraMovement, "auto");
    assert.equal(mapped.prompt, creativeMode === "custom" ? restored.prompt : "");
    assert.equal(mapped.source, base.source); assert.equal(mapped.durationSeconds, base.durationSeconds);
    assert.ok(validateVideoGenerationDraft(mapped).ok);
    assert.equal(videoStudioReducer(restored, { type: "set-camera", cameraMovement }).cameraMovement, "auto");
  }
});

test("a plan from the old shot mode cannot be attached after the selection changes", () => {
  const state = { ...initialVideoStudioDraft, shotMode: "single" as const };
  const selection = { presetId: "minimal-studio" as const, shotMode: "single" as const, receipt: "signed" };
  assert.equal(videoStudioCreativeFields(state, selection).director, selection);
  const changed = videoStudioReducer(state, { type: "set-shot-mode", mode: "multi" });
  assert.equal(videoStudioCreativeFields(changed, selection).director, undefined);
});

test("missing shot choice and manual cameras are rejected before planning, quote or submit", async () => {
  const f = await VideoProductionHarness.create();
  for (const creativeMode of ["preset", "custom"] as const) {
    const draft = { ...f.draft(), creativeMode, prompt: creativeMode === "custom" ? "Yavaş yaklaş" : "", shotMode: undefined };
    const parsed = validateVideoGenerationDraft(draft);
    assert.ok(!parsed.ok && parsed.field === "shotMode");
    const planning = await f.prepareDirector({ draft, profile: f.profile, presetId: creativeMode === "custom" ? "custom" : "minimal-studio", shotMode: "single" });
    assert.equal(planning.status, "invalid");
    const quote = await f.api.quoteVideoSubmissionAction(draft);
    assert.ok(quote.status === "invalid" && quote.reasonCode === "invalid_draft");
    const submission = await f.api.submitVideoGenerationAction(draft, 1, "old-receipt", true);
    assert.ok(!submission.ok && submission.code === "invalid_input");
    assert.equal(validateVideoGenerationDraft({ ...draft, shotMode: "single", cameraMovement: "pan-left" }).ok, false);
  }
  assert.equal(f.directorInputs.length, 0); assert.equal(f.posts.length, 0); assert.equal(f.reservations.size, 0);
  f.assertIsolated();
});

test("Single remains one continuous shot and rejects internal cut or montage directions", () => {
  const base = directorFixtureInput(directorProducts[0]);
  const input = { ...base, presetId: "minimal-studio" as const, shotMode: "single" as const, draft: { ...base.draft, shotMode: "single" as const } };
  const plan = fallbackDirectorPlan(input);
  assert.equal(plan.shots.length, 1);
  for (const motion of ["Cut to another scene", "Quick montage"]) {
    const failures: string[] = [];
    const edited = { ...plan, shots: [{ ...plan.shots[0], motion }] };
    assert.equal(parseDirectorOutput(edited, input, failure => failures.push(failure.reasonCode)), null);
    assert.ok(failures.includes("internal_scene_cut"));
  }
});

test("surface exposes shot selection while manual-camera lock remains", () => {
  const ui = readFileSync("src/features/video/video-studio-workspace.tsx", "utf8");
  const inspector = readFileSync("src/features/video/video-generation-inspector.tsx", "utf8");
  assert.doesNotMatch(ui, /video-camera|cameraValues|camera\.heading|camera\.options|set-camera/);
  assert.match(ui, /shotModeControls=\{<fieldset[\s\S]*?video-director-mode[\s\S]*?set-shot-mode/);
  assert.match(ui, /directorControls=\{shotMode \?[\s\S]*?advancedSettings=/);
  assert.match(inspector, /\{presetControls\}[\s\S]*?\{shotModeControls\}[\s\S]*?qualityHeading[\s\S]*?\{advancedSettings/);
  assert.match(ui, /if \(!generationAvailable \|\| !draft.shotMode\) return;/);
  for (const locale of ["tr", "en"]) {
    const copy = JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8")).Dashboard.videoStudio;
    for (const key of ["required", "single", "multi"]) assert.ok(copy.shotSelection[key]);
    assert.ok(copy.validation["shot-mode-required"]);
  }
});
