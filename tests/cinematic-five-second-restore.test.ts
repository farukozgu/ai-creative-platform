import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import * as current from "../src/lib/video-director/core";
import { durationStrategy } from "../src/lib/video-director/duration-strategy";
import { directorShotContract } from "../src/lib/video-director/plan-contract";
import { getVideoDirectorPreset } from "../src/lib/video-director/presets";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";

const hashes = (value: ReturnType<typeof current.compileDirectorPlan>) => value.multiPrompt!.map(shot => createHash("sha256").update(shot.prompt).digest("hex"));

test("successful Cinematic five-shot plan and negative prompt match; each prompt differs only by required preservation wording", () => {
  const fixture = JSON.parse(readFileSync("tests/fixtures/cinematic-knitwear-success.json", "utf8")) as {
    profile: current.VideoDirectorInput["profile"]; draft: current.VideoDirectorInput["draft"]; plan: current.VideoDirectorPlan;
    compiled: ReturnType<typeof current.compileDirectorPlan>; promptHashes: string[];
  };
  const input: current.VideoDirectorInput = { profile: fixture.profile, draft: fixture.draft, presetId: "cinematic-hero", shotMode: "multi" };
  const plan = current.fallbackDirectorPlan(input);
  assert.deepEqual(plan, fixture.plan);
  assert.deepEqual(plan.shots.map(shot => shot.durationSeconds), [1, 1, 1, 1, 1]);
  assert.ok(plan.shots.every(shot => shot.motion === "Keep the product still"));
  const compiled = current.compileDirectorPlan(plan, input);
  assert.equal(compiled.negativePrompt, fixture.compiled.negativePrompt);
  assert.deepEqual(hashes(fixture.compiled), fixture.promptHashes);
  const previous = "Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.";
  const preservation = "Keep the embroidered marks exactly as in the source; do not enlarge, restyle or reposition them.";
  for (const [index, shot] of compiled.multiPrompt!.entries()) {
    const original = fixture.compiled.multiPrompt![index].prompt;
    assert.equal(shot.prompt, original.replace(previous, preservation));
    assert.ok(shot.prompt.length <= 512);
    console.log(JSON.stringify({ shot: index + 1, originalHash: fixture.promptHashes[index], actualHash: hashes(compiled)[index], match: hashes(compiled)[index] === fixture.promptHashes[index], characters: shot.prompt.length }));
  }
});

test("fallback identity preservation is present in all five restored shots and stays inside 512 characters", () => {
  const profile = { ...directorProducts[0], identityCriticalAttributes: ["embroidered text", "front logo", "woven label"].map(attribute => ({ attribute, rationale: "visible", regions: [] })) };
  const base = directorFixtureInput(profile);
  const input = { ...base, presetId: "cinematic-hero" as const, draft: { ...base.draft, durationSeconds: 5 as const } };
  const plan = current.fallbackDirectorPlan(input);
  assert.deepEqual(plan.shots.map(shot => shot.durationSeconds), [1, 1, 1, 1, 1]);
  assert.ok(plan.shots.every(shot => !/text|logo|label/i.test(shot.focus)));
  const compiled = current.compileDirectorPlan(plan, input);
  assert.equal(compiled.multiPrompt!.length, 5);
  for (const shot of compiled.multiPrompt!) {
    assert.ok(shot.prompt.includes("Keep the embroidered text, logos and labels exactly as in the source; do not enlarge, restyle or reposition them."));
    assert.ok(shot.prompt.length <= 512);
  }
});

test("Cinematic 5s multi uses execution again; references do not select a different fallback", () => {
  assert.deepEqual(durationStrategy("cinematic-hero", "multi", 5)!.durations, [1, 1, 1, 1, 1]);
  assert.ok(getVideoDirectorPreset("cinematic-hero", "multi", 5).execution);
  assert.equal(directorShotContract("multi", 5, "cinematic-hero").maxShots, 5);
  assert.deepEqual(durationStrategy("cinematic-hero", "multi", 10)!.durations, [2, 2, 2, 1, 3]);
  assert.deepEqual(durationStrategy("cinematic-hero", "single", 5)!.durations, [5]);
  assert.deepEqual(durationStrategy("macro-detail-reveal", "multi", 5)!.durations, [1, 1, 1, 2]);
  assert.deepEqual(durationStrategy("luxury-fashion-film", "multi", 5)!.durations, [1, 1, 1, 2]);
  const base = directorFixtureInput(directorProducts[0]);
  const input = { ...base, presetId: "cinematic-hero" as const, draft: { ...base.draft, durationSeconds: 5 as const } };
  const references = [0, 1].map(index => ({ source: { kind: "uploaded-image" as const, sourceAssetId: `10000000-0000-4000-8000-00000000000${index + 2}` }, sha256: "a".repeat(64), purpose: "logo" }));
  const withReferences = { ...input, draft: { ...input.draft, productReferences: references } };
  const plan = current.fallbackDirectorPlan(withReferences);
  assert.deepEqual(plan.shots, current.fallbackDirectorPlan(input).shots);
  assert.doesNotThrow(() => current.compileDirectorPlan(plan, withReferences));
});
