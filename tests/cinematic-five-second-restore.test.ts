import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import * as current from "../src/lib/video-director/core";
import { durationStrategy } from "../src/lib/video-director/duration-strategy";
import { directorShotContract } from "../src/lib/video-director/plan-contract";
import { getVideoDirectorPreset } from "../src/lib/video-director/presets";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";
import { VideoProductionHarness } from "./fixtures/video-production-harness";

const hashes = (value: ReturnType<typeof current.compileDirectorPlan>) => value.multiPrompt!.map(shot => createHash("sha256").update(shot.prompt).digest("hex"));

test("classic automatic Cinematic uses the saved preset without an AI Director call or elements", async () => {
  const fixture = JSON.parse(readFileSync("tests/fixtures/cinematic-knitwear-success.json", "utf8")) as { profile: current.VideoDirectorInput["profile"]; plan: current.VideoDirectorPlan; promptHashes: string[] };
  const f = await VideoProductionHarness.create();
  f.analysisProfile = fixture.profile!;
  f.env.OPENAI_API_KEY = "offline-fixture-only";
  const draft = f.draft("standard", 5, "multi");
  const result = await f.prepareDirector({ draft, profile: fixture.profile, presetId: "cinematic-hero", shotMode: "multi" });
  assert.equal(result.status, "success");
  if (result.status !== "success") throw new Error("Missing restored Cinematic plan");
  assert.equal(result.plan.origin, "fallback");
  assert.equal(f.directorInputs.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(result.plan.shots)), fixture.plan.shots);
  const compiled = current.compileDirectorPlan(result.plan, { draft, profile: fixture.profile, presetId: "cinematic-hero", shotMode: "multi" });
  assert.deepEqual(hashes(compiled), fixture.promptHashes);
  assert.ok(compiled.multiPrompt!.every(shot => !shot.prompt.includes("@Element")));
});

test("successful Cinematic five-shot plan, every persisted prompt hash and negative prompt match exactly", () => {
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
  assert.deepEqual(compiled, fixture.compiled);
  assert.deepEqual(hashes(compiled), fixture.promptHashes);
  assert.ok(compiled.multiPrompt!.every(shot => shot.prompt.length <= 512));
});

test("classic Cinematic keeps original source preservation in all five shots within 512 characters", () => {
  const profile = { ...directorProducts[0], identityCriticalAttributes: ["embroidered text", "front logo", "woven label"].map(attribute => ({ attribute, rationale: "visible", regions: [] })) };
  const base = directorFixtureInput(profile);
  const input = { ...base, presetId: "cinematic-hero" as const, draft: { ...base.draft, durationSeconds: 5 as const } };
  const plan = current.fallbackDirectorPlan(input);
  assert.deepEqual(plan.shots.map(shot => shot.durationSeconds), [1, 1, 1, 1, 1]);
  assert.ok(plan.shots.every(shot => !/text|logo|label/i.test(shot.focus)));
  const compiled = current.compileDirectorPlan(plan, input);
  assert.equal(compiled.multiPrompt!.length, 5);
  for (const shot of compiled.multiPrompt!) {
    assert.ok(shot.prompt.includes("Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces."));
    assert.ok(shot.prompt.length <= 512);
  }
});

test("Cinematic 5s multi uses execution again; references do not select a different fallback", () => {
  assert.deepEqual(durationStrategy("cinematic-hero", "multi", 5)!.durations, [1, 1, 1, 1, 1]);
  assert.ok(getVideoDirectorPreset("cinematic-hero", "multi", 5).execution);
  assert.equal(directorShotContract("multi", 5, "cinematic-hero").maxShots, 5);
  assert.deepEqual(durationStrategy("cinematic-hero", "multi", 10)!.durations, [2, 2, 2, 2, 2]);
  assert.deepEqual(durationStrategy("cinematic-hero", "single", 5)!.durations, [5]);
  assert.deepEqual(durationStrategy("macro-detail-reveal", "multi", 5)!.durations, [1, 1, 1, 2]);
  assert.deepEqual(durationStrategy("luxury-fashion-film", "multi", 5)!.durations, [1, 1, 1, 2]);
  const base = directorFixtureInput(directorProducts[0]);
  const input = { ...base, presetId: "cinematic-hero" as const, draft: { ...base.draft, durationSeconds: 5 as const } };
  const references = [0, 1].map(index => ({ source: { kind: "uploaded-image" as const, sourceAssetId: `10000000-0000-4000-8000-00000000000${index + 2}` }, sha256: "a".repeat(64), purpose: "logo" }));
  const withReferences = { ...input, draft: { ...input.draft, productReferences: references } };
  const plan = current.fallbackDirectorPlan(withReferences, references.map((_, index) => ({ index, status: "matched", view: "detail", reason: "Same product", details: [] })));
  assert.deepEqual(plan.shots, current.fallbackDirectorPlan(input).shots);
  assert.doesNotThrow(() => current.compileDirectorPlan(plan, withReferences));
});

test("classic fallback does not force a back beat; sparse primary evidence stays valid", async () => {
  const base = directorFixtureInput(directorProducts[0]);
  const profile = { ...directorProducts[0], productShape: "unknown", materials: [], dominantColors: [],
    identityCriticalAttributes: [{ attribute: "green color with white collar", rationale: "visible", regions: [] }, { attribute: "embroidered text", rationale: "visible", regions: [] }],
    verticalAttributes: { vertical: "apparel" as const, details: { garmentType: "sweater", primaryColor: null, artworkOrLogoLocations: [], closures: [], pocketStructure: [], hoodOrCollar: null, constructionDetails: [], identitySides: [] } } };
  const references = [0, 1].map(index => ({ source: { kind: "uploaded-image" as const, sourceAssetId: `10000000-0000-4000-8000-00000000000${index + 2}` }, sha256: "a".repeat(64), purpose: index === 0 ? "label" : "angle" }));
  const input = { ...base, profile, presetId: "cinematic-hero" as const, draft: { ...base.draft, durationSeconds: 5 as const, productReferences: references } };
  const reviews = [{ index: 0, status: "matched" as const, view: "front" as const, reason: "Matching mark", details: [] },
    { index: 1, status: "matched" as const, view: "back" as const, reason: "Matching product rear", details: [] }];
  const before = current.fallbackDirectorPlan({ ...input, draft: { ...input.draft, productReferences: [] } });
  const plan = current.fallbackDirectorPlan(input, reviews);
  const withoutBack = { ...before, origin: "ai" as const, referenceReviews: reviews };
  assert.ok(current.parseDirectorOutput(withoutBack, input));
  const recovered = await current.directVideoWithClient(input, { createPlan: async () => withoutBack });
  assert.equal(recovered.origin, "ai");
  assert.equal(recovered.shots[2].referenceIndex, undefined);
  assert.deepEqual(plan.shots.map(shot => shot.durationSeconds), [1, 1, 1, 1, 1]);
  assert.deepEqual(plan.shots[0], before.shots[0]);
  assert.deepEqual(plan.shots[4], before.shots[4]);
  assert.equal(plan.shots[2].referenceIndex, undefined);
  assert.ok(plan.shots.every(shot => !/text|logo|label|embroider/i.test(shot.focus)));
  const compiled = current.compileDirectorPlan(plan, input);
  assert.doesNotMatch(compiled.multiPrompt![2].prompt, /Use back view/);
  assert.ok(compiled.multiPrompt!.every(shot => shot.prompt.length <= 512));
  const single = { ...input, shotMode: "single" as const, draft: { ...input.draft, shotMode: "single" as const } };
  assert.ok(current.fallbackDirectorPlan(single, reviews).shots.every(shot => shot.referenceIndex === undefined));
});
