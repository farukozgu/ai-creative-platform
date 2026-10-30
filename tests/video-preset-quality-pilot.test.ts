import assert from "node:assert/strict";
import test from "node:test";
import { compileDirectorPlan, fallbackDirectorPlan, parseDirectorOutput, type VideoDirectorInput } from "../src/lib/video-director/core";
import { qualityFallbackDirection, qualityPresetDirection, qualityPresetVersions, type QualityPresetId } from "../src/lib/video-director/preset-quality-directions";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { directorCacheKey, openDirectorPlan, sealDirectorPlan } from "../src/lib/video-director/receipt";
import { directorProducts, directorFixtureInput } from "./fixtures/video-director-fixtures";
import { frontBackInput, frontBackResponse } from "./fixtures/video-front-back-fixture";
import { VideoProductionHarness } from "./fixtures/video-production-harness";

const ids = Object.keys(qualityPresetVersions) as QualityPresetId[];
function selected(presetId: QualityPresetId, mode: "single" | "multi", durationSeconds: 5 | 10, profile = directorProducts[4]): VideoDirectorInput {
  const base = directorFixtureInput(profile);
  return { ...base, presetId, shotMode: mode, draft: { ...base.draft, shotMode: mode, durationSeconds } };
}

test("three quality identities have 12 distinct executable 5/10 single/multi cells; 15s remains closed", () => {
  const signatures = new Set<string>();
  for (const id of ids) for (const duration of [5, 10] as const) for (const mode of ["single", "multi"] as const) {
    const direction = qualityPresetDirection(id, mode, duration)!;
    assert.equal(direction.durations.reduce((sum, seconds) => sum + seconds, 0), duration);
    assert.equal(direction.shots.length, direction.focusRoles.length);
    assert.equal(new Set(direction.shots.map(shot => shot.purpose)).size, direction.shots.length);
    signatures.add(JSON.stringify(direction));
    if (mode === "single") { assert.equal(direction.shots.length, 1); assert.match(direction.transitions, /Continuous only/); }
  }
  assert.equal(signatures.size, 12);
  assert.equal(qualityPresetDirection("cinematic-hero", "multi", 5), null);
  for (const id of ids) assert.equal(qualityPresetDirection(id, "multi", 15), null);
});

test("surface, feature and spotlight fallback choose different evidence and visual jobs", () => {
  const surface = fallbackDirectorPlan(selected("material-detail", "multi", 5));
  const macro = fallbackDirectorPlan(selected("macro-detail-reveal", "multi", 5));
  const spotlight = fallbackDirectorPlan(selected("product-spotlight", "multi", 5));
  assert.match(surface.shots[0].focus, /grain|texture/);
  assert.match(macro.shots[0].focus, /handle|stitch|clasp/);
  assert.match(spotlight.shots[0].focus, /silhouette/);
  assert.deepEqual(surface.shots.map(shot => shot.durationSeconds), [1, 2, 2]);
  assert.deepEqual(macro.shots.map(shot => shot.durationSeconds), [2, 1, 2]);
  assert.deepEqual(spotlight.shots.map(shot => shot.purpose), ["lighting-reveal", "controlled-motion", "final-hero"]);
});

test("sparse evidence removes a redundant accent and gives its time to the final hold", () => {
  for (const id of ["material-detail", "macro-detail-reveal"] as const) {
    const direction = qualityPresetDirection(id, "multi", 10)!;
    const resolved = qualityFallbackDirection(direction, [{ id: 0, detail: "visible seam and surface texture" }]);
    assert.equal(resolved.shots.length, 3);
    assert.deepEqual(resolved.durations, [3, 2, 5]);
    assert.equal(resolved.shots.at(-1)!.purpose, "final-hero");
    assert.equal(resolved.focusIds.filter(id => id !== null).length, 1);
    const input = { ...selected(id, "single", 5), profile: null };
    const plan = fallbackDirectorPlan(input);
    assert.match(plan.shots[0].camera, /medium product framing/);
    assert.match(plan.summary, /No verified close-detail evidence/);
    assert.doesNotThrow(() => compileDirectorPlan(plan, input));
  }
});

test("pilot product, camera, duration and tier matrix satisfies real compiler budgets and provider contracts", () => {
  for (const presetId of ids) for (const profile of [null, ...directorProducts])
    for (const shotMode of ["single", "multi"] as const) for (const durationSeconds of [5, 10] as const)
      for (const cameraMovement of ["auto", "static", "dolly-in", "dolly-out", "pan-left", "pan-right"] as const) {
        const input = selected(presetId, shotMode, durationSeconds);
        input.profile = profile; input.draft.cameraMovement = cameraMovement;
        input.draft.criticalRegion = { x: 0, y: 0, width: 0.1, height: 0.1, declaredText: "untrusted" };
        const plan = fallbackDirectorPlan(input);
        assert.ok(parseDirectorOutput(plan, input, failure => assert.fail(JSON.stringify({ presetId, durationSeconds, shotMode, failure }))));
        const compiled = compileDirectorPlan(plan, input);
        for (const quality of ["standard", "pro"] as const) {
          const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: `kling-v3-${quality}-image`, endpointId: "fixture", sourceUrl: "https://invalid.example/source" });
          assert.equal(payload.duration, String(durationSeconds));
          assert.equal(payload.generate_audio, false);
          assert.equal(payload.enable_safety_checker, true);
          for (const shot of payload.multi_prompt ?? [{ prompt: payload.prompt!, duration: String(durationSeconds) }]) {
            assert.ok(shot.prompt.length <= (shotMode === "multi" ? 512 : 2500));
            assert.match(shot.prompt, /known surfaces/);
          }
        }
      }
});

test("repeated verified detail is rejected without overriding an explicit evidence focus request", () => {
  const input = selected("macro-detail-reveal", "multi", 10);
  const plan = fallbackDirectorPlan(input);
  assert.equal(plan.shots.length, 4);
  const repeated = { ...plan, shots: plan.shots.map((shot, i) => i === 1 ? { ...shot, focus: plan.shots[0].focus, evidenceRefs: plan.shots[0].evidenceRefs } : shot) };
  let reason = "";
  assert.equal(parseDirectorOutput(repeated, input, failure => { reason = failure.reasonCode; }), null);
  assert.equal(reason, "repeated_detail_focus");
  const explicit = { ...input, draft: { ...input.draft, prompt: "Show the arched front handle" } };
  assert.doesNotThrow(() => compileDirectorPlan(fallbackDirectorPlan(explicit), explicit));
});

test("explicit static or push-in keeps the new single takes coherent without promising a widening frame", () => {
  for (const presetId of ["macro-detail-reveal", "product-spotlight"] as const) for (const cameraMovement of ["static", "dolly-in"] as const) {
    const input = selected(presetId, "single", 10);
    input.draft.cameraMovement = cameraMovement;
    const plan = fallbackDirectorPlan(input);
    assert.doesNotMatch(plan.shots[0].composition, /start|finish|opens|opening/i);
    assert.doesNotMatch(plan.shots[0].pace, /widen/i);
    assert.doesNotThrow(() => compileDirectorPlan(plan, input));
  }
});

test("verified alternate image remains an available context shot in all three pilots and both tiers", () => {
  for (const presetId of ids) {
    const input = { ...frontBackInput("b".repeat(64)), presetId };
    const plan = parseDirectorOutput(frontBackResponse(input), input)!;
    assert.ok(plan);
    const compiled = compileDirectorPlan(plan, input);
    assert.match(compiled.multiPrompt![2].prompt, /@Element1: Use back view from reference image 1/);
    for (const quality of ["standard", "pro"] as const) {
      const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: `kling-v3-${quality}-image`, endpointId: "fixture", sourceUrl: "https://invalid.example/primary", elementImageUrls: ["https://invalid.example/back"] });
      assert.equal(payload.elements![0].reference_image_urls.length, 1);
    }
  }
});

test("only pilot preset revisions invalidate their former plans; AI context stays evidence- and budget-bound", async () => {
  const f = await VideoProductionHarness.create();
  for (const id of ids) {
    const input = selected(id, "multi", 5);
    const plan = fallbackDirectorPlan(input);
    const key = directorCacheKey("owner", "source", "gpt-4o-mini", input);
    const oldReceipt = sealDirectorPlan(key, { ...plan, presetVersion: plan.presetVersion - 1 }, "test-only-secret", 1000);
    assert.equal(openDirectorPlan(oldReceipt, key, input, "test-only-secret", 2000), null);
    const request = f.directorRequest(input);
    const context = JSON.parse(request.context);
    assert.match(context.preset.strategy.execution.evidenceDirection, /different verified atoms/);
    assert.match(context.preset.strategy.execution.evidenceDirection, /matched back\/side reference/);
    assert.ok(Buffer.byteLength(request.context + request.instructions + JSON.stringify(request.schema)) <= 16000);
  }
});
