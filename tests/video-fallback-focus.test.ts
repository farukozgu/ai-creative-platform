import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fallbackDirectorPlan, compileDirectorPlan, parseDirectorOutput, type VideoDirectorInput } from "../src/lib/video-director/core";
import { directorProducts, directorFixtureInput } from "./fixtures/video-director-fixtures";
import { videoPresetIds } from "../src/lib/video-director/presets";
import { directorProductContext } from "../src/lib/video-director/product-context";
import { assertSourceMarksPreserved, isGoldenTenSecondMulti } from "./fixtures/video-fidelity-expectations";

const marks = ["embroidered text", "front logo", "woven label", "chest symbol", "white lettering", "printed mark", "embroidered"];
const profile = { ...structuredClone(directorProducts[0]), identityCriticalAttributes: marks.map(attribute => ({ attribute, rationale: "visible", regions: [] })),
  visibleBranding: { hasLogo: true, hasReadableText: true, hasArtwork: true, logoRegions: [], textRegions: [], artworkRegions: [] } };

test("fallback preserves identity marks and only uses verified primary markings in the designated detail study", () => {
  for (const presetId of videoPresetIds) for (const shotMode of ["single", "multi"] as const) for (const durationSeconds of [5, 10] as const) {
    const base = directorFixtureInput(profile);
    const input = { ...base, presetId, shotMode, draft: { ...base.draft, shotMode, durationSeconds } };
    const plan = fallbackDirectorPlan(input);
    assert.ok(parseDirectorOutput(plan, input), `${presetId}/${shotMode}/${durationSeconds}`);
    const marking = /embroider|lettering|\b(?:logo|label|symbol|text|printed mark)\b/i;
    const expected = presetId === "label-reveal" ? ["macro-detail", "embroidered text"]
      : presetId === "fabric-motion" ? ["material-study", "woven label"]
      : presetId === "minimal-studio" && isGoldenTenSecondMulti(input) ? ["lighting-reveal", "front logo"] : null;
    const markingStudies = plan.shots.filter(shot => marking.test(shot.focus));
    assert.deepEqual(markingStudies.map(shot => [shot.purpose, shot.focus]), expected ? [expected] : []);
    for (const study of markingStudies) {
      assert.deepEqual(study.evidenceRefs.map(id => directorProductContext(profile).evidence[id].detail), [study.focus]);
    }
    assert.ok(plan.shots.every(shot => !marking.test([shot.camera, shot.composition].join(" "))));
    const before = JSON.stringify(plan.shots);
    const compiled = compileDirectorPlan(plan, input);
    assert.equal(JSON.stringify(plan.shots), before);
    for (const [index, prompt] of (compiled.multiPrompt?.map(shot => shot.prompt) ?? [compiled.prompt]).entries()) {
      if (presetId === "cinematic-hero" && !isGoldenTenSecondMulti(input) && !(shotMode === "multi" && durationSeconds === 5)) {
        assert.match(prompt, /Keep the embroidered text, logos, labels, symbols and printed marks exactly as in the source; do not enlarge, restyle or reposition them\./);
      } else {
        assertSourceMarksPreserved(prompt);
      }
      if (markingStudies.includes(plan.shots[index])) assert.ok(prompt.includes(plan.shots[index].focus));
      else assert.doesNotMatch(prompt, /(?:framing the|focus on|Frame the) (?:embroidered|text|logo|label|symbol|lettering)/i);
      assert.ok(prompt.length <= (shotMode === "multi" ? 512 : 2500));
    }
  }
});

test("reported sparse sweater retains five shots without using embroidery as its subject", () => {
  const base = directorFixtureInput(profile);
  const sparse = { ...profile, productShape: "unknown", materials: [], dominantColors: [],
    verticalAttributes: { vertical: "apparel" as const, details: { garmentType: "unknown", primaryColor: null, artworkOrLogoLocations: [], closures: [], pocketStructure: [], hoodOrCollar: null, constructionDetails: [], identitySides: [] } } };
  const input = { ...base, presetId: "cinematic-hero" as const, profile: sparse, draft: { ...base.draft, durationSeconds: 5 as const } };
  const plan = fallbackDirectorPlan(input);
  assert.equal(plan.shots.length, 5);
  assert.ok(plan.shots.every(shot => /^Source-visible/.test(shot.focus)));
  assert.doesNotThrow(() => compileDirectorPlan(plan, input));
});

test("successful sweater keeps its five creative shots and negative prompt; only preservation wording changes", () => {
  const f = JSON.parse(readFileSync("tests/fixtures/cinematic-knitwear-success.json", "utf8"));
  const input: VideoDirectorInput = { profile: f.profile, draft: f.draft, presetId: "cinematic-hero", shotMode: "multi" };
  assert.deepEqual(fallbackDirectorPlan(input), f.plan);
  const compiled = compileDirectorPlan(f.plan, input);
  assert.equal(compiled.negativePrompt, f.compiled.negativePrompt);
  assert.deepEqual(compiled.multiPrompt!.map(shot => ({ duration: shot.duration, creative: shot.prompt.split("Keep ")[0] })),
    f.compiled.multiPrompt.map((shot: { duration: string; prompt: string }) => ({ duration: shot.duration, creative: shot.prompt.split("Keep ")[0] })));
});
