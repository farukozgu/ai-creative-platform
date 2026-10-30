import assert from "node:assert/strict";
import test from "node:test";
import { durationAwarePresetIds, durationStrategy } from "../src/lib/video-director/duration-strategy";
import { compileDirectorPlan, directVideoWithClient, fallbackDirectorPlan, parseDirectorOutput } from "../src/lib/video-director/core";
import { directorShotContract } from "../src/lib/video-director/plan-contract";
import { directorCacheKey, openDirectorPlan, sealDirectorPlan } from "../src/lib/video-director/receipt";
import { buildFalVideoRequestInput, validateKlingMultiPrompt } from "../src/lib/video-generation/fal-request";
import { directorProducts, directorFixtureInput } from "./fixtures/video-director-fixtures";
import { directorProductContext } from "../src/lib/video-director/product-context";
import type { VideoGenerationDraft } from "../src/lib/video-generation/types";

test("18 creative cells have exact timing, different duration language and honest availability", () => {
  for (const id of durationAwarePresetIds) for (const mode of ["single", "multi"] as const) {
    const signatures = new Set<string>();
    for (const duration of [5, 10, 15] as const) {
      const strategy = durationStrategy(id, mode, duration)!;
      assert.equal(strategy.available, duration !== 15);
      assert.equal(strategy.durations.reduce((a, b) => a + b, 0), duration);
      assert.equal(strategy.shots.length, strategy.durations.length);
      assert.equal(new Set(strategy.shots.map(shot => shot.purpose)).size, strategy.shots.length);
      signatures.add(JSON.stringify({ durations: strategy.durations, shots: strategy.shots }));
      if (mode === "single") assert.equal(strategy.shots.length, 1);
    }
    assert.equal(signatures.size, 3);
  }
  assert.equal(durationStrategy("minimal-studio", "multi", 5), null);
  assert.equal(directorShotContract("multi", 5, "minimal-studio").minDuration, 2);
  assert.equal(directorShotContract("multi", 5, "minimal-studio").maxShots, 2);
});

test("pilot fallback survives sparse evidence, camera selection, marking and both Kling tiers", () => {
  for (const profile of [null, ...directorProducts]) for (const presetId of durationAwarePresetIds)
    for (const shotMode of ["single", "multi"] as const) for (const durationSeconds of [5, 10] as const)
      for (const cameraMovement of ["auto", "static", "dolly-in", "dolly-out", "pan-left", "pan-right"] as const) {
        const base = directorFixtureInput(directorProducts[0]);
        const input = { ...base, profile, presetId, shotMode, draft: { ...base.draft, durationSeconds, cameraMovement,
          criticalRegion: { x: 0, y: 0, width: 0.1, height: 0.1, declaredText: "untrusted" } } };
        const plan = fallbackDirectorPlan(input);
        assert.ok(parseDirectorOutput(plan, input, failure => assert.fail(JSON.stringify({ presetId, shotMode, cameraMovement, failure }))));
        const compiled = compileDirectorPlan(plan, input);
        for (const quality of ["standard", "pro"] as const) {
          const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: `kling-v3-${quality}-image`, endpointId: "fixture", sourceUrl: "https://invalid.example/source" });
          assert.equal(payload.duration, String(durationSeconds));
          assert.equal(payload.generate_audio, false);
          if (shotMode === "multi") {
            assert.equal(payload.shot_type, "customize");
            assert.equal(payload.prompt, undefined);
            assert.equal(payload.multi_prompt!.reduce((sum, shot) => sum + Number(shot.duration), 0), durationSeconds);
            for (const shot of payload.multi_prompt!) assert.ok(shot.prompt.length <= 512);
          } else {
            assert.equal(payload.multi_prompt, undefined);
            assert.doesNotMatch(payload.prompt!, /cut to|cutaway|montage|jump cut|scene change/i);
          }
        }
      }
});

test("five one-second scenes stay AI through validation, compilation and authenticated receipt", async () => {
  const base = directorFixtureInput(directorProducts[4]);
  const input = { ...base, presetId: "cinematic-hero" as const, draft: { ...base.draft, durationSeconds: 5 as const } };
  const fallback = fallbackDirectorPlan(input);
  assert.match(fallback.shots[1].focus, /grain/);
  assert.match(fallback.shots[3].focus, /stitch/);
  const evidence = directorProductContext(input.profile).evidence;
  const focuses = ["structured bag silhouette", "pebbled leather grain", "arched front handle", "visible edge stitching", "structured bag silhouette"];
  // Independently authored model response: no fallback directions supply the scenes.
  const candidate = { ...fallback, shots: focuses.map((focus, index) => ({
    durationSeconds: 1,
    purpose: (["hero-reveal", "material-study", "controlled-motion", "macro-detail", "final-hero"] as const)[index],
    focus: `verified-evidence:${evidence.find(item => item.detail === focus)!.id}`,
    camera: ["Locked medium overview", "Locked close framing", "Short lateral camera glide", "Locked off-center close framing", "Locked hero frame"][index],
    composition: ["Complete product with negative space", "Resolvable surface crop", "Offset visible front view", "Tight evidenced detail", "Full product with clean margins"][index],
    lighting: "Directional light defines existing relief", motion: "Keep the product still",
    pace: index === 4 ? "Decisive final hold" : "Quick visual accent",
  })) };
  const plan = await directVideoWithClient(input, { createPlan: async () => candidate });
  assert.equal(plan.origin, "ai");
  assert.deepEqual(plan.shots.map(shot => shot.durationSeconds), [1, 1, 1, 1, 1]);
  assert.match(plan.shots[3].focus, /stitch/i);
  const key = directorCacheKey("owner", "source", "model", input);
  const receipt = sealDirectorPlan(key, plan, "test-only-secret", 1000, input.profile);
  assert.ok(receipt.length < 14000);
  assert.ok(openDirectorPlan(receipt, key, input, "test-only-secret", 2000));
  assert.equal(openDirectorPlan(receipt, key, { ...input, shotMode: "single" }, "test-only-secret", 2000), null);
  assert.ok(validateKlingMultiPrompt(compileDirectorPlan(plan, input).multiPrompt, 5));
  for (const mutate of [
    () => ({ ...plan, shots: plan.shots.map((shot, i) => i ? shot : { ...shot, durationSeconds: 2 }) }),
    () => ({ ...plan, shots: plan.shots.map((shot, i) => i ? shot : { ...shot, camera: "Cut to the hidden rear" }) }),
    () => ({ ...plan, shots: plan.shots.map((shot, i) => i ? shot : { ...shot, focus: "Unverified steel mechanism", evidenceRefs: [] }) }),
  ]) assert.equal(parseDirectorOutput(mutate(), input), null);
  assert.equal(validateKlingMultiPrompt(Array.from({ length: 6 }, () => ({ prompt: "view", duration: "1" })), 5), false);
});

test("15 seconds remains rejected at Director and provider boundaries", () => {
  const base = directorFixtureInput(directorProducts[0]);
  const draft = { ...base.draft, durationSeconds: 15 } as unknown as VideoGenerationDraft;
  const input = { ...base, draft };
  assert.throws(() => fallbackDirectorPlan(input), /unsupported_director_duration/);
  assert.equal(parseDirectorOutput(fallbackDirectorPlan(base), input), null);
  assert.throws(() => buildFalVideoRequestInput({ ...draft, modelId: "kling-v3-standard-image", endpointId: "fixture", prompt: "view", sourceUrl: "https://invalid.example/source" }), /Unsupported product video duration/);
});
