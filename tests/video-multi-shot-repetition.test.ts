import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { compileDirectorPlan, directorPlanDescriptions, directVideoWithClient, fallbackDirectorPlan, parseDirectorOutput, type DirectorValidationFailure, type VideoDirectorInput, type VideoDirectorShot } from "../src/lib/video-director/core";
import { interpretCreativeIntent } from "../src/lib/video-director/creative-request";
import { directorProductContext } from "../src/lib/video-director/product-context";
import { DirectorStructuredOutputError } from "../src/lib/video-director/plan-contract";
import { getVideoDirectorPreset, VIDEO_DIRECTOR_VERSION, videoPresetIds } from "../src/lib/video-director/presets";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";
import type { ProductProfile } from "../src/lib/product-understanding/product-profile";

function inputFor(profile = directorProducts[0], durationSeconds: 5 | 10 = 5): VideoDirectorInput {
  const base = directorFixtureInput(profile);
  return { ...base, presetId: "cinematic-hero", draft: { ...base.draft, durationSeconds } };
}

function candidate(input: VideoDirectorInput, first: string, second = first) {
  const evidence = directorProductContext(input.profile).evidence;
  const shot = (focus: string, index: number): VideoDirectorShot => ({
    durationSeconds: input.draft.durationSeconds === 5 ? [2, 3][index] : 5,
    purpose: index ? "material-study" : "macro-detail", camera: index ? "Locked off-center close framing" : "Locked close framing",
    composition: index ? "Tight source-facing feature study" : "Close crop of the verified detail",
    lighting: index ? "Even diffuse light" : "Soft side light", motion: "Keep the product still", pace: index ? "Patient hold" : "Precise accent",
    focus, evidenceRefs: evidence.filter(item => item.detail === focus).map(item => item.id),
  });
  return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: getVideoDirectorPreset(input.presetId, input.shotMode, input.draft.durationSeconds).version,
    origin: "ai" as const, shotMode: input.shotMode, ...directorPlanDescriptions(input, 2),
    intentContract: interpretCreativeIntent(input.draft.prompt, evidence, input.shotMode, input.draft.cameraMovement), shots: [shot(first, 0), shot(second, 1)] };
}

function rejectedFor(plan: unknown, input: VideoDirectorInput) {
  const failures: DirectorValidationFailure[] = [];
  assert.equal(parseDirectorOutput(plan, input, failure => failures.push(failure)), null);
  assert.equal(failures[0].reasonCode, "repeated_detail_focus");
}

test("review findings: separate named marking and texture regions stay distinct; same regions repeat", () => {
  for (const [first, second] of [["chest logo", "hem logo"], ["neck label", "cuff label"], ["chest text", "sleeve lettering"], ["collar texture", "cuff grain"]]) {
    const profile = { ...directorProducts[0], identityCriticalAttributes: [first, second].map(attribute => ({ attribute, rationale: "visible", regions: [] })) };
    const input = inputFor(profile);
    assert.ok(parseDirectorOutput(candidate(input, first, second), input), `${first}/${second}`);
    rejectedFor(candidate(input, first), input);
  }
});

test("review findings: shape-only evidence uses existing wide fallback without inventing details", () => {
  const profile: ProductProfile = { ...directorProducts[0], productShape: "jacket silhouette", materials: [], dominantColors: [], identityCriticalAttributes: [],
    verticalAttributes: { vertical: "apparel", details: { garmentType: "jacket", primaryColor: null, artworkOrLogoLocations: [], closures: [], pocketStructure: [], hoodOrCollar: null, constructionDetails: [], identitySides: [] } } };
  for (const duration of [5, 10] as const) {
    const input = inputFor(profile, duration);
    const plan = fallbackDirectorPlan(input);
    assert.ok(parseDirectorOutput(plan, input));
    for (const shot of plan.shots.filter(shot => ["material-study", "macro-detail"].includes(shot.purpose))) {
      assert.match(shot.composition, /Wider/);
      assert.equal(shot.focus, "Source-visible surface detail");
      assert.deepEqual(shot.evidenceRefs, []);
    }
    assert.doesNotThrow(() => compileDirectorPlan(plan, input));
  }
});

test("review findings: replacement focus respects composition and keeps preset camera and structure", () => {
  const input = inputFor({ ...directorProducts[0], identityCriticalAttributes: [...directorProducts[0].identityCriticalAttributes,
    { attribute: "visible surface texture", rationale: "visible", regions: [] }] });
  const plan = fallbackDirectorPlan(input);
  const preset = getVideoDirectorPreset(input.presetId, "multi", 5);
  plan.shots.forEach((shot, index) => {
    assert.equal(shot.camera, preset.shots[index].camera);
    assert.equal(shot.composition, preset.shots[index].composition);
    assert.equal(shot.durationSeconds, preset.execution!.durations[index]);
  });
  assert.notEqual(plan.shots[1].focus, plan.shots[3].focus);
  const constrained = { ...input, presetId: "macro-detail-reveal" as const, draft: { ...input.draft, durationSeconds: 10 as const, prompt: "Keep glossy coated fabric sharp" } };
  // The adjacent surface crop cannot silently become a collar/button study.
  assert.throws(() => fallbackDirectorPlan(constrained), (error: unknown) => error instanceof DirectorStructuredOutputError && error.reasonCode === "repeated_detail_focus");
});

test("5/10s: dedicated repetition rejects across all 24 presets, categories and explicit focus requests", () => {
  for (const presetId of videoPresetIds) for (const duration of [5, 10] as const) for (const profile of directorProducts) {
    const detail = directorProductContext(profile).evidence.find(item => !profile.materials.includes(item.detail) && !profile.dominantColors.includes(item.detail))!.detail;
    const base = inputFor(profile, duration);
    for (const prompt of ["", `Keep ${detail} sharp`]) {
      const input = { ...base, presetId, draft: { ...base.draft, prompt } };
      const plan = candidate(input, detail);
      rejectedFor(plan, input);
      // Renaming the second shot's purpose does not give the feature a new task.
      rejectedFor({ ...plan, shots: [plan.shots[0], { ...plan.shots[1], purpose: "lighting-reveal" }] }, input);
    }
  }
});

test("aliases for logos, surfaces and regions cannot evade repetition through different evidence IDs", () => {
  for (const details of [["front chest logo", "embroidered chest lettering"], ["woven surface texture", "visible fabric grain"],
    ["centered front zipper", "visible zipper teeth"], ["blue dial", "slim dial markers"]]) {
    const profile = { ...directorProducts[0], identityCriticalAttributes: details.map(attribute => ({ attribute, rationale: "visible", regions: [] })) };
    const input = inputFor(profile);
    rejectedFor(candidate(input, details[0], details[1]), input);
  }
  const region = { location: "left chest" } as ProductProfile["identityCriticalAttributes"][number]["regions"][number];
  const profile = { ...directorProducts[0], identityCriticalAttributes: ["parallel relief lines", "woven inset"].map(attribute => ({ attribute, rationale: "visible", regions: [region] })) };
  const input = inputFor(profile);
  rejectedFor(candidate(input, "parallel relief lines", "woven inset"), input);
});

test("generic focus cannot conceal two dedicated crops of the same subject", () => {
  const input = inputFor();
  const plan = candidate(input, "Source-visible surface detail");
  rejectedFor(plan, input);
  plan.shots[0].composition = "Close crop of the collar";
  plan.shots[1].composition = "Tight view of the same collar";
  rejectedFor(plan, input);
  plan.shots[1].composition = "Tight view of the front buttons";
  assert.ok(parseDirectorOutput(plan, input));
});

test("different known locations are independent while natural details in whole-product views are allowed", () => {
  const profile = { ...directorProducts[0], identityCriticalAttributes: ["left cuff stitching", "right cuff stitching"].map(attribute => ({ attribute, rationale: "visible", regions: [] })) };
  const input = inputFor(profile);
  assert.ok(parseDirectorOutput(candidate(input, "left cuff stitching", "right cuff stitching"), input));
  const detail = directorProductContext(input.profile).evidence[0].detail;
  const plan = candidate(input, detail);
  Object.assign(plan.shots[1], { purpose: "final-hero", camera: "Locked medium hero framing", composition: "Complete product with clear margins" });
  assert.ok(parseDirectorOutput(plan, input));
  const opening = { ...plan.shots[1], purpose: "hero-reveal" as const, camera: "Locked wide overview", durationSeconds: 1 };
  plan.shots[0].durationSeconds = 1;
  const contextual = { ...plan, shots: [opening, plan.shots[0], plan.shots[1]] };
  assert.ok(parseDirectorOutput(contextual, input)); // Opening/detail/closing may all naturally show the feature.
  const distinct = candidate(input, "left cuff stitching", "right cuff stitching");
  distinct.shots[1].composition = distinct.shots[0].composition;
  assert.ok(parseDirectorOutput(distinct, input)); // Same framing can serve different known subjects.
});

test("repeating the scene composition with new camera/light wording is rejected", () => {
  const input = inputFor();
  const plan = candidate(input, "Source-visible product form");
  plan.shots.forEach(shot => { shot.composition = "Medium product with balanced margins"; });
  const failures: DirectorValidationFailure[] = [];
  assert.equal(parseDirectorOutput(plan, input, failure => failures.push(failure)), null);
  assert.equal(failures[0].reasonCode, "repeated_shot_direction");
});

test("a repeated AI plan uses safe fallback without a repair API call; exhausted evidence rejects", async () => {
  for (const duration of [5, 10] as const) {
    const input = inputFor(directorProducts[0], duration);
    const detail = directorProductContext(input.profile).evidence.find(item => /collar/.test(item.detail))!.detail;
    let repairs = 0;
    const plan = await directVideoWithClient(input, { createPlan: async () => candidate(input, detail), repairPlan: async () => { repairs++; throw new Error("Unexpected paid repair"); } });
    assert.equal(plan.origin, "fallback");
    assert.equal(repairs, 0);
    assert.ok(parseDirectorOutput(plan, input));
    assert.doesNotThrow(() => compileDirectorPlan(plan, input));
  }
  const sparse = { ...directorProducts[0], materials: [], dominantColors: [], productShape: "unknown", identityCriticalAttributes: [{ attribute: "visible surface texture", rationale: "visible", regions: [] }],
    verticalAttributes: { vertical: "apparel" as const, details: { garmentType: "jacket", primaryColor: null, artworkOrLogoLocations: [], closures: [], pocketStructure: [], hoodOrCollar: null, constructionDetails: [], identitySides: [] } } };
  const input = inputFor(sparse);
  await assert.rejects(directVideoWithClient(input, { createPlan: async () => candidate(input, "visible surface texture") }),
    (error: unknown) => error instanceof DirectorStructuredOutputError && error.reasonCode === "repeated_detail_focus");
});

test("24 presets retain multi-shot order, camera, composition, light, motion, pace and duration", () => {
  for (const presetId of videoPresetIds) for (const durationSeconds of [5, 10] as const) {
    const input = { ...inputFor(directorProducts[0], durationSeconds), presetId };
    const preset = getVideoDirectorPreset(presetId, "multi", durationSeconds);
    const plan = fallbackDirectorPlan(input);
    const durations = preset.execution?.durations ?? (durationSeconds === 5 ? [2, 3] : [3, 4, 3]);
    assert.deepEqual(plan.shots.map(shot => shot.durationSeconds), durations, presetId);
    plan.shots.forEach((shot, index) => {
      const direction = preset.shots[!preset.execution && plan.shots.length === 2 ? index + 1 : index];
      for (const field of ["purpose", "camera", "composition", "lighting", "motion", "pace"] as const) {
        // Existing sparse-evidence handling widens a detail crop before assignment.
        const expected = field === "composition" && !shot.evidenceRefs.length && shot.focus === "Source-visible surface detail"
          ? preset.execution && index > 1 ? "Wider visible form with offset margins; no unverified detail enlarged"
            : "Wider view of the source-visible product form; no unverified detail is enlarged"
          : direction[field];
        assert.equal(shot[field], expected, `${presetId}/${durationSeconds}/${field}`);
      }
    });
    assert.ok(parseDirectorOutput(plan, input), `${presetId}/${durationSeconds}`);
  }
});

test("single-shot fallback remains byte-identical in 1008 pre-change preset/category/duration cases", () => {
  const plans = [];
  for (const presetId of videoPresetIds) for (const profile of [...directorProducts, ...libraryFixtures.map(fixture => fixture.profile)]) for (const durationSeconds of [5, 10] as const) {
    const base = directorFixtureInput(profile ?? directorProducts[0]);
    plans.push(fallbackDirectorPlan({ ...base, profile, presetId, shotMode: "single", draft: { ...base.draft, shotMode: "single", durationSeconds } }));
  }
  assert.equal(plans.length, 1008);
  assert.equal(createHash("sha256").update(JSON.stringify(plans)).digest("hex"), "4b233317b9730dde2d6ea2c965ec1b1101e8be139d503a1fdc22c8e8dfbfcc16");
});
