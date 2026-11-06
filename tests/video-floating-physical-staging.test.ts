import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { assertPresetOutputFingerprints, presetOutputGroup } from "./fixtures/preset-output-fingerprint";
import { fallbackDirectorPlan, compileDirectorPlan, fixedFashionMotionDirectorPlan, parseDirectorOutput } from "../src/lib/video-director/core";
import { compileKlingShot } from "../src/lib/video-director/kling-compiler";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { videoPresetIds } from "../src/lib/video-director/presets";
import { directorFixtureInput } from "./fixtures/video-director-fixtures";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";
import { assertGoldenPhysicalPrompt, isGoldenTenSecondMulti } from "./fixtures/video-fidelity-expectations";

const presets = ["floating-fashion", "floating-accessory"] as const;
const fixtures = libraryFixtures.filter((fixture, index, all) => fixture.category !== "unknown" && all.findIndex(other => other.category === fixture.category) === index);
test("floating physical staging reaches each Kling shot without changing the two fixed presets' creative fields", () => {
  let count = 0;
  const plans = [];
  const legacyPlans = [];
  for (const presetId of presets) for (const { profile } of fixtures) for (const durationSeconds of [5, 10] as const) for (const shotMode of ["single", "multi"] as const) {
    const base = directorFixtureInput(profile!);
    const input = { ...base, presetId, shotMode, draft: { ...base.draft, shotMode, durationSeconds } };
    const plan = fallbackDirectorPlan(input);
    plans.push(plan);
    legacyPlans.push(isGoldenTenSecondMulti(input) ? fixedFashionMotionDirectorPlan(input, false) : plan);
    const original = JSON.stringify(plan);
    for (const origin of ["ai", "fallback"] as const) {
      const candidate = { ...plan, origin };
      assert.ok(parseDirectorOutput(candidate, input));
      const compiled = compileDirectorPlan(candidate, input);
      const prompts = compiled.multiPrompt?.map(shot => shot.prompt) ?? [compiled.prompt];
      prompts.forEach((prompt, index) => {
        assert.ok(prompt.length <= (shotMode === "multi" ? 512 : 2500));
        if (isGoldenTenSecondMulti(input)) {
          assertGoldenPhysicalPrompt(input, plan.shots[index], prompt);
        } else {
          assert.match(prompt, /Keep source pose\/orientation\/support\/contact\/shadows & gravity/);
          assert.match(prompt, /No new floating\/flat-lay\/stands\/props/);
          assert.match(prompt, /Camera\/light\/negative space imply float; no turns\/deformation\/hangers\./);
          assert.doesNotMatch(prompt.slice(prompt.indexOf("Exact geometry/")), /locked|still|stationary/i);
          assert.doesNotMatch(prompt, /(?:place|add) (?:a |the )?(?:shelf|display case|storefront|table|stand)/i);
          assert.match(prompt, /Exact geometry\/color\/material\/pattern\/parts\/text\/logos\/layout; known sides/);
          const without = compileKlingShot(plan.shots[index], 2500, false);
          assert.equal(prompt.split("Exact geometry/")[0], without.split("Keep source geometry")[0]);
        }
      });
      const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: "kling-v3-standard-image", endpointId: "offline", sourceUrl: "https://invalid.example/product" });
      assert.deepEqual(payload.multi_prompt, compiled.multiPrompt);
      assert.equal(payload.duration, String(durationSeconds));
    }
    assert.equal(JSON.stringify(plan), original);
    count++;
  }
  assert.equal(count, 96);
  assert.equal(createHash("sha256").update(JSON.stringify(legacyPlans)).digest("hex"), "9524609cdef9cbba214cc1c241c9bf8380756566e9e9bc76c8f3f3a88020ec1c");
  assert.equal(createHash("sha256").update(JSON.stringify(plans)).digest("hex"), "53ced1bed6a77ee90510795cea0b34124c312570d7f32d6a630d6c7c57534208");
});

test("floating physical fidelity preserves markings and source support without inventing flat-lay or stands", () => {
  const fixture = fixtures[0].profile!;
  for (const presetId of presets) for (const pose of ["source-visible flat-lay outline", "source-visible standing outline", "unknown"]) {
    const profile = { ...fixture, productShape: pose, visibleBranding: { ...fixture.visibleBranding, hasLogo: true as const, hasReadableText: true as const },
      identityCriticalAttributes: [...fixture.identityCriticalAttributes, { attribute: "visible embroidered logo", rationale: "visible", regions: [] }] };
    const base = directorFixtureInput(profile);
    const input = { ...base, presetId, draft: { ...base.draft, criticalRegion: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, declaredText: "" } } };
    const plan = fallbackDirectorPlan(input);
    for (const [index, shot] of compileDirectorPlan(plan, input).multiPrompt!.entries()) {
      if (isGoldenTenSecondMulti(input)) {
        assertGoldenPhysicalPrompt(input, plan.shots[index], shot.prompt);
      } else {
        assert.match(shot.prompt, /text\/logos\/layout/);
        assert.match(shot.prompt, /source pose\/orientation\/support\/contact\/shadows/);
      }
      assert.doesNotMatch(shot.prompt, /place (?:on|under)|add (?:a|the) (?:table|stand|hanger)|turn upright/i);
    }
  }
});

test("historical and approved revised preset cells retain their compiled outputs", () => {
  const outputs: Record<"frozen" | "revised", unknown[]> = { frozen: [], revised: [] };
  for (const presetId of videoPresetIds.filter(id => !presets.includes(id as typeof presets[number]))) for (const { profile } of fixtures) for (const durationSeconds of [5, 10] as const) for (const shotMode of ["single", "multi"] as const) {
    const base = directorFixtureInput(profile!);
    const input = { ...base, presetId, shotMode, draft: { ...base.draft, durationSeconds, shotMode } };
    outputs[presetOutputGroup(input)].push(compileDirectorPlan(fallbackDirectorPlan(input), input));
  }
  assert.equal(outputs.frozen.length + outputs.revised.length, 1056);
  assertPresetOutputFingerprints(outputs, {
    frozen: "94850526f955a7a3c8bc17232485012b6890b2c79275a947a1883a8185e8856b",
    revised: "9014a87d36f7606588fbd635f49dbf994fa41748329a372b2f92302166b0e444",
  });
});
