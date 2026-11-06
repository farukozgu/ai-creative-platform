import assert from "node:assert/strict";
import test from "node:test";
import { assertPresetOutputFingerprints, presetOutputGroup } from "./fixtures/preset-output-fingerprint";
import { compileDirectorPlan, fallbackDirectorPlan, parseDirectorOutput } from "../src/lib/video-director/core";
import { getVideoDirectorPreset, videoPresetIds } from "../src/lib/video-director/presets";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";
import { VideoProductionHarness } from "./fixtures/video-production-harness";

const fixtures = libraryFixtures.filter((fixture, index, all) => fixture.category !== "unknown"
  && all.findIndex(other => other.category === fixture.category) === index);

test("Luxury 5s multi carries four moving visual tasks into both Kling payloads", () => {
  for (const { profile } of fixtures) {
    const base = directorFixtureInput(profile!);
    const input = { ...base, draft: { ...base.draft, durationSeconds: 5 as const } };
    const plan = fallbackDirectorPlan(input);
    const compiled = compileDirectorPlan(plan, input);
    assert.deepEqual(plan.shots.map(shot => shot.durationSeconds), [1, 1, 1, 2]);
    assert.equal(new Set(plan.shots.map(shot => shot.composition)).size, 4);
    assert.ok(plan.shots[2].evidenceRefs.length, "Detail travel must use verified evidence");
    for (const shot of plan.shots) {
      assert.match(shot.camera, /push in|glide|pull back/i);
      assert.doesNotMatch(shot.camera, /locked|orbit|rotate|rear|back view/i);
    }
    assert.match(compiled.multiPrompt![0].prompt, /Push in.*Frame full silhouette, then its medium/i);
    assert.match(compiled.multiPrompt![1].prompt, /Glide laterally.*medium contour crop/i);
    assert.match(compiled.multiPrompt![3].prompt, /Pull back.*Frame medium form, then full form/i);
    for (const quality of ["standard", "pro"] as const) {
      const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled,
        modelId: `kling-v3-${quality}-image`, endpointId: "offline", sourceUrl: "https://invalid.example/source" });
      assert.deepEqual(payload.multi_prompt, compiled.multiPrompt);
      assert.equal(payload.shot_type, "customize");
      assert.equal(payload.elements, undefined);
      for (const { prompt } of payload.multi_prompt!) {
        assert.ok(prompt.length <= 512);
        assert.match(prompt, /Exact geometry\/color\/material\/pattern\/parts\/text\/logos\/layout; known sides/);
        assert.match(prompt, /Keep source pose\/orientation\/support\/contact\/shadows & gravity/);
      }
    }
    const staticOpening = { ...plan, shots: plan.shots.map((shot, index) => index ? shot
      : { ...shot, camera: "Locked long-lens overview" }) };
    assert.equal(parseDirectorOutput(staticOpening, input), null);
  }
});

test("Director fixed schema and validation agree on the new Luxury moving shots offline", async () => {
  const harness = await VideoProductionHarness.create();
  const base = directorFixtureInput(directorProducts[0]);
  const input = { ...base, draft: { ...base.draft, durationSeconds: 5 as const } };
  const plan = fallbackDirectorPlan(input);
  const request = harness.directorRequest(input);
  const context = JSON.parse(request.context) as { fixedShots: { camera: string }[] };
  assert.deepEqual(context.fixedShots.map(shot => shot.camera), plan.shots.map(shot => shot.camera));
  const schema = request.schema as unknown as { properties: { shots: { items: {
    anyOf: { properties: { camera: { enum: string[] } } }[];
  } } } };
  assert.deepEqual(Array.from(schema.properties.shots.items.anyOf, slot => slot.properties.camera.enum[0]),
    plan.shots.map(shot => shot.camera));
  assert.ok(parseDirectorOutput({ ...plan, origin: "ai" }, input));
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.posts.length, 0);
});

test("historical and approved revised preset cells retain their compiled outputs", () => {
  const outputs: Record<"frozen" | "revised", unknown[]> = { frozen: [], revised: [] };
  let count = 0;
  for (const presetId of videoPresetIds) for (const { profile } of fixtures)
    for (const durationSeconds of [5, 10] as const) for (const shotMode of ["single", "multi"] as const) {
      if (presetId === "luxury-fashion-film" && durationSeconds === 5 && shotMode === "multi") continue;
      const base = directorFixtureInput(profile!);
      const input = { ...base, presetId, shotMode, draft: { ...base.draft, durationSeconds, shotMode } };
      const plan = fallbackDirectorPlan(input);
      outputs[presetOutputGroup(input)].push({ preset: getVideoDirectorPreset(presetId, shotMode, durationSeconds),
        plan, compiled: compileDirectorPlan(plan, input) });
      count++;
    }
  assert.equal(count, 1140);
  assertPresetOutputFingerprints(outputs, {
    frozen: "685c9c7383635eb893d1b46acb76ff71e6d335f882470ef3522c928d1cc4ac6f",
    revised: "c14a38e32b56f659225866be9299c358cf7599ec8f675cde58facd38135c9ca8",
  });
});
