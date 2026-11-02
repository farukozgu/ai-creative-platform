import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { fallbackDirectorPlan, compileDirectorPlan, parseDirectorOutput } from "../src/lib/video-director/core";
import { compileKlingShot } from "../src/lib/video-director/kling-compiler";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { videoPresetIds } from "../src/lib/video-director/presets";
import { directorFixtureInput } from "./fixtures/video-director-fixtures";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";

const presets = ["minimal-studio", "luxury-fashion-film", "product-spotlight"] as const;
const fixtures = libraryFixtures.filter((fixture, index, all) => fixture.category !== "unknown" && all.findIndex(other => other.category === fixture.category) === index);
test("physical staging reaches each Kling shot without changing the three fixed presets' creative fields", () => {
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
        assert.match(prompt, /Keep source pose\/orientation\/support\/contact\/shadows & gravity/);
        assert.match(prompt, /No new floating\/flat-lay\/stands\/props/);
        assert.match(prompt, /Exact geometry\/color\/material\/pattern\/parts\/text\/logos\/layout; known sides/);
        assert.ok(prompt.length <= (shotMode === "multi" ? 512 : 2500));
        const without = compileKlingShot(plan.shots[index], 2500, false);
        assert.equal(prompt.split("Exact geometry/")[0], without.split("Keep source geometry")[0]);
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

test("physical fidelity preserves markings and source support without inventing flat-lay or stands", () => {
  const fixture = fixtures[0].profile!;
  for (const presetId of presets) for (const pose of ["source-visible flat-lay outline", "source-visible standing outline", "unknown"]) {
    const profile = { ...fixture, productShape: pose, visibleBranding: { ...fixture.visibleBranding, hasLogo: true as const, hasReadableText: true as const },
      identityCriticalAttributes: [...fixture.identityCriticalAttributes, { attribute: "visible embroidered logo", rationale: "visible", regions: [] }] };
    const base = directorFixtureInput(profile);
    const input = { ...base, presetId, draft: { ...base.draft, criticalRegion: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, declaredText: "" } } };
    const plan = fallbackDirectorPlan(input);
    for (const shot of compileDirectorPlan(plan, input).multiPrompt!) {
      assert.match(shot.prompt, /text\/logos\/layout/);
      assert.match(shot.prompt, /source pose\/orientation\/support\/contact\/shadows/);
      assert.doesNotMatch(shot.prompt, /place (?:on|under)|add (?:a|the) (?:table|stand|hanger)|turn upright/i);
    }
  }
});

test("Presets outside this and subsequently staged groups retain pre-change compiled outputs", () => {
  const output = [];
  for (const presetId of videoPresetIds.filter(id => ![...presets, "macro-detail-reveal", "material-detail", "precision-macro", "macro-stitching", "hardware-reveal", "craftsmanship-study", "glass-reflection", "dramatic-backlight", "metallic-light-sweep", "elegant-orbit", "optical-lines", "cinematic-dial", "label-reveal", "sneaker-hero", "upholstery-macro", "culinary-texture", "window-display", "fabric-motion"].includes(id))) for (const { profile } of fixtures) for (const durationSeconds of [5, 10] as const) for (const shotMode of ["single", "multi"] as const) {
    const base = directorFixtureInput(profile!);
    const input = { ...base, presetId, shotMode, draft: { ...base.draft, durationSeconds, shotMode } };
    output.push(compileDirectorPlan(fallbackDirectorPlan(input), input));
  }
  assert.equal(output.length, 144);
  assert.equal(createHash("sha256").update(JSON.stringify(output)).digest("hex"), "3ad082ee5e191bef4f1d1e94c412f8d27912eed33f997d99c44b902897ae239b");
});
