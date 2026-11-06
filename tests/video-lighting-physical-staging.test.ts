import assert from "node:assert/strict";
import test from "node:test";
import { assertPresetOutputFingerprints, presetOutputGroup } from "./fixtures/preset-output-fingerprint";
import { fallbackDirectorPlan, compileDirectorPlan, parseDirectorOutput } from "../src/lib/video-director/core";
import { compileKlingShot } from "../src/lib/video-director/kling-compiler";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { videoPresetIds } from "../src/lib/video-director/presets";
import { directorFixtureInput } from "./fixtures/video-director-fixtures";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";
import { assertGoldenPhysicalPrompt, isGoldenTenSecondMulti } from "./fixtures/video-fidelity-expectations";

const presets = ["glass-reflection", "dramatic-backlight", "metallic-light-sweep"] as const;
const fixtures = libraryFixtures.filter((fixture, index, all) => fixture.category !== "unknown" && all.findIndex(other => other.category === fixture.category) === index);
test("lighting physical staging reaches each Kling shot without changing the three fixed presets' creative fields", () => {
  let count = 0;
  for (const presetId of presets) for (const { profile } of fixtures) for (const durationSeconds of [5, 10] as const) for (const shotMode of ["single", "multi"] as const) {
    const base = directorFixtureInput(profile!);
    const input = { ...base, presetId, shotMode, draft: { ...base.draft, shotMode, durationSeconds } };
    const plan = fallbackDirectorPlan(input);
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
          assert.match(prompt, /Light moves; product stays still\./);
          assert.doesNotMatch(prompt, /\b(?:glass|metal|metallic|transparent|transparency)\b/i);
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
  assert.equal(count, 144);
});

test("lighting physical fidelity preserves markings and source support without inventing flat-lay or stands", () => {
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
  for (const presetId of videoPresetIds.filter(id => !["glass-reflection","dramatic-backlight","metallic-light-sweep","elegant-orbit","optical-lines","cinematic-dial","label-reveal","sneaker-hero","upholstery-macro","culinary-texture","window-display","fabric-motion","floating-fashion","floating-accessory"].includes(id))) for (const { profile } of fixtures) for (const durationSeconds of [5, 10] as const) for (const shotMode of ["single", "multi"] as const) {
    const base = directorFixtureInput(profile!);
    const input = { ...base, presetId, shotMode, draft: { ...base.draft, durationSeconds, shotMode } };
    outputs[presetOutputGroup(input)].push(compileDirectorPlan(fallbackDirectorPlan(input), input));
  }
  assert.equal(outputs.frozen.length + outputs.revised.length, 480);
  assertPresetOutputFingerprints(outputs, {
    frozen: "36db02678a655b79f9ee79dd4a34a253dfa8556353aaf9f789d661aff6cd185d",
    revised: "8b3ca1f9b6b176a1c4e1b62787a865740141281c6e2f14e01a0aae9918714d6a",
  });
});
