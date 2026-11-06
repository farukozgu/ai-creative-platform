import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cameraKinds, compileDirectorPlan, fallbackDirectorPlan, parseDirectorOutput, type VideoDirectorInput, type VideoDirectorPlan } from "../src/lib/video-director/core";
import { compileKlingShot } from "../src/lib/video-director/kling-compiler";
import { VIDEO_DIRECTOR_VERSION, videoPresetIds } from "../src/lib/video-director/presets";
import { buildFalVideoRequestInput, KLING_MULTI_PROMPT_MAX_CHARS } from "../src/lib/video-generation/fal-request";
import { directorProducts, directorFixtureInput, authoredDirectorExample } from "./fixtures/video-director-fixtures";
import { renderDirector30Shots } from "./fixtures/video-director-30-compiler";
import { directorCacheKey, sealDirectorPlan, openDirectorPlan } from "../src/lib/video-director/receipt";
import { directorProductContext } from "../src/lib/video-director/product-context";

test("3.1 retains the chosen evidence and actual movement, removes labels and unrelated facts", () => {
  // These plans and prompt hashes were captured after validation in b0843c5.
  const { samples } = JSON.parse(readFileSync("tests/fixtures/director-31-compiler-baseline.json", "utf8")) as {
    samples: { productId: string; plan: Omit<VideoDirectorPlan, "version"> & { version: string };
      negativePrompt: string; director30: string[]; director31: string[] }[];
  };
  assert.deepEqual(samples.map(sample => sample.productId), ["jacket", "perfume"]);
  const hash = (prompt: string) => createHash("sha256").update(prompt).digest("hex");
  for (const sample of samples) {
    const profile = directorProducts.find(product => product.productId === sample.productId)!;
    const input = directorFixtureInput(profile);
    const { plan } = sample;
    assert.equal(plan.version, "video-director-3.1-canonical-descriptions-v2");
    assert.equal(plan.presetId, input.presetId);
    assert.equal(plan.shotMode, input.shotMode);
    assert.deepEqual(plan.shots.map(shot => shot.purpose), ["hero-reveal", "macro-detail", "final-hero"]);
    let rejection: string | undefined;
    assert.equal(parseDirectorOutput({ ...plan, version: VIDEO_DIRECTOR_VERSION }, input, failure => {
      rejection = failure.reasonCode;
    }), null);
    assert.equal(rejection, "fixed_macro_template_mismatch");

    const before = renderDirector30Shots(plan.shots, input);
    const after = plan.shots.map(shot => ({
      duration: String(shot.durationSeconds),
      prompt: compileKlingShot(shot, KLING_MULTI_PROMPT_MAX_CHARS, false),
    }));
    assert.deepEqual(before.multiPrompt!.map(shot => shot.duration), ["3", "4", "3"]);
    assert.deepEqual(after.map(shot => shot.duration), before.multiPrompt!.map(shot => shot.duration));
    assert.deepEqual(before.multiPrompt!.map(shot => hash(shot.prompt)), sample.director30);
    assert.deepEqual(after.map(shot => hash(shot.prompt)), sample.director31);
    assert.equal(before.negativePrompt, sample.negativePrompt);
    const evidence = directorProductContext(profile).evidence;
    for (const [i, shot] of plan.shots.entries()) {
      const prompt = after[i].prompt;
      assert.deepEqual(shot.evidenceRefs.map(id => evidence[id]?.detail), [shot.focus]);
      assert.ok(prompt.includes(shot.focus));
      assert.ok(prompt.includes(shot.lighting));
      assert.ok(prompt.toLowerCase().includes(shot.composition.toLowerCase()));
      assert.ok(prompt.toLowerCase().includes(shot.pace.toLowerCase()));
      assert.doesNotMatch(prompt, /Focus:|Visible:|Preserve:|source-facing pose|stays stationary/);
      assert.ok(prompt.length < before.multiPrompt![i].prompt.length);
      assert.match(prompt, /known surfaces/);
    }
    assert.match(after[1].prompt, profile.vertical === "apparel" ? /Glide laterally/ : /locked close view/);
    assert.doesNotMatch(after[1].prompt, profile.vertical === "apparel" ? /front belt knot|wide notched collar/ : /amber|clear glass|front label/);
  }
});

test("all existing products, presets, tiers, durations and shot structures build valid exact payloads", () => {
  for (const profile of [...directorProducts, null]) for (const presetId of videoPresetIds)
    for (const quality of ["standard", "pro"] as const) for (const durationSeconds of [5, 10] as const)
      for (const shotMode of ["single", "multi"] as const) {
        const base = directorFixtureInput(directorProducts[0]);
        const input: VideoDirectorInput = { ...base, profile, presetId, shotMode, draft: { ...base.draft, shotMode, quality, durationSeconds } };
        const plan = fallbackDirectorPlan(input), compiled = compileDirectorPlan(plan, input);
        const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: `kling-v3-${quality}-image`, endpointId: "fixture", sourceUrl: "https://invalid.example/source" });
        if (shotMode === "multi") {
          assert.deepEqual(payload.multi_prompt, compiled.multiPrompt);
          assert.equal(payload.prompt, undefined);
          for (const shot of compiled.multiPrompt!) assert.ok(shot.prompt.length <= 512);
        } else {
          assert.equal(payload.prompt, compiled.prompt);
          assert.equal(payload.multi_prompt, undefined);
          assert.ok(compiled.prompt.length <= 2500);
        }
        assert.equal(payload.generate_audio, false);
        assert.equal(payload.enable_safety_checker, true);
        assert.doesNotMatch(compiled.prompt, /Focus:|Visible:/);
        if (!profile) for (const prompt of compiled.multiPrompt?.map(shot => shot.prompt) ?? [compiled.prompt]) {
          const windowDisplay = presetId === "window-display" && shotMode === "multi" && durationSeconds === 10;
          if (windowDisplay) assert.match(prompt, /One product; abstract glass bands; no mirror\/signage/);
          const productDirection = windowDisplay ? prompt.replace("abstract glass bands", "") : prompt;
          assert.doesNotMatch(productDirection, /\b(?:leather|silk|glass|steel|gold|silver|black|buttons|dial|cap|stones)\b/i);
        }
      }
});

test("pose filler is removed without erasing explicit subject motion or the selected static camera", () => {
  const shot = authoredDirectorExample(directorFixtureInput(directorProducts[0])).shots[1];
  for (const motion of ["Product stays stationary", "Keep the product completely still", "Hold the source-facing pose in the light"])
    assert.doesNotMatch(compileKlingShot({ ...shot, camera: "Locked close framing", motion }, 512, false), /stationary|completely still|source-facing pose/);
  const prompt = compileKlingShot({ ...shot, camera: "Locked close framing", motion: "A gentle in-plane sway retains the front view" }, 512, false);
  assert.match(prompt, /locked close view/);
  assert.match(prompt, /in-plane sway/);
  assert.doesNotMatch(prompt, /dolly|pan |glide|tilt/);
});

test("legacy floating fashion with unknown product uses concise complete prompts within the Kling scene limit", () => {
  const base = directorFixtureInput(directorProducts[0]);
  const input = { ...base, presetId: "floating-fashion" as const, profile: null, draft: { ...base.draft, durationSeconds: 5 as const } };
  const plan = fallbackDirectorPlan(input);
  const { multiPrompt } = compileDirectorPlan(plan, input);
  assert.deepEqual(multiPrompt?.map(shot => Number(shot.duration)), plan.shots.map(shot => shot.durationSeconds));
  assert.ok(multiPrompt?.every(shot => shot.prompt.length <= 512 && shot.prompt.includes("known sides")));
});

test("controlled short wording fits a tighter budget without dropping decisions or subject action", () => {
  const shot = { ...authoredDirectorExample(directorFixtureInput(directorProducts[0])).shots[1],
    composition: "Close crop of a source-visible detail already present in the source", motion: "A gentle in-plane sway retains the front view" };
  const full = compileKlingShot(shot, 2500, true);
  const short = compileKlingShot(shot, full.length - 1, true);
  assert.ok(short.length < full.length);
  for (const prompt of [full, short]) {
    assert.match(prompt, /Glide laterally/);
    assert.match(prompt, /two visible front buttons/);
    assert.match(prompt, /in-plane sway/);
    assert.match(prompt, /parts and markings exact; preserve marked details in place\. Known surfaces only\./);
    assert.match(prompt, /Soft side light/);
  }
  assert.throws(() => compileKlingShot(shot, 40, true), /too_long/);
});

test("compiler revision invalidates 3.0 receipts without changing signing or cost approval", () => {
  const input = directorFixtureInput(directorProducts[0]);
  const plan = fallbackDirectorPlan(input), secret = "offline-only-secret";
  const key = directorCacheKey("owner", "hash", "fixture", input);
  const token = sealDirectorPlan(key, { ...plan, version: "video-director-3.0" as typeof plan.version }, secret, 1000);
  assert.equal(openDirectorPlan(token, key, input, secret, 2000), null);
  assert.ok(openDirectorPlan(sealDirectorPlan(key, plan, secret, 1000), key, input, secret, 2000));
});

test("free fallback maps explicit Turkish and English movement, focus and shot order into plan decisions", () => {
  const jacket = directorProducts[0];
  const approach = directorFixtureInput(jacket, "Cekete yavaş yaklaş, düğmeyi göster.");
  const plan = fallbackDirectorPlan(approach);
  assert.equal(plan.intentContract.camera, "dolly-in");
  assert.ok(plan.shots.some(shot => /dolly-in/i.test(shot.camera)));
  assert.ok(plan.shots.some(shot => /button/i.test(shot.focus)));

  const lateral = fallbackDirectorPlan(directorFixtureInput(jacket, "Ürün üzerinde yanal kay.") );
  assert.equal(lateral.intentContract.camera, "lateral");
  assert.ok(lateral.shots.every(shot => cameraKinds(shot.camera).join() === "lateral"));

  const sequence = directorFixtureInput(jacket, "Start close on front belt knot; gently push in, then pull back to the complete product.");
  const ordered = fallbackDirectorPlan(sequence);
  assert.equal(ordered.intentContract.sequence, "detail-to-hero");
  assert.match(ordered.shots[0].camera, /dolly-in/i);
  assert.match(ordered.shots.at(-1)!.camera, /pull-back/i);
  assert.match(ordered.shots[0].composition, /close/i);
  assert.match(ordered.shots.at(-1)!.composition, /complete/i);

  const singleSequenceInput = { ...sequence, shotMode: "single" as const, draft: { ...sequence.draft, shotMode: "single" as const } };
  const singleSequence = fallbackDirectorPlan(singleSequenceInput);
  assert.equal(singleSequence.shots.length, 1);
  assert.equal(singleSequence.intentContract.camera, "dolly-out");
  assert.match(singleSequence.shots[0].camera, /pull-back/i);
  assert.ok(compileDirectorPlan(singleSequence, singleSequenceInput).prompt.length <= 2500);

  const label = directorFixtureInput(directorProducts[1], "Finish on the label.");
  const labelPlan = fallbackDirectorPlan(label);
  assert.equal(labelPlan.shots.at(-1)!.focus, "centered front label");
  assert.match(labelPlan.shots.at(-1)!.composition, /Finish on/);

  const conflict = directorFixtureInput(jacket, "Ürünü 360 derece döndürüp arkasını göster; sonra yavaşça yaklaş.");
  const safe = fallbackDirectorPlan(conflict);
  assert.equal(safe.intentContract.safeAdjustment, "unseen-side-to-source-facing-camera");
  assert.match(safe.summary, /unseen-side turn is replaced/i);
  assert.ok(safe.shots.some(shot => /dolly-in/i.test(shot.camera)));
  assert.doesNotMatch(JSON.stringify(safe), /rear view|backside|360/i);
});

test("AI plans must satisfy the exact intent contract; single-shot detail presets use evidence or explain a wider safe frame", () => {
  const input = directorFixtureInput(directorProducts[0], "Pan right and keep the front belt knot sharp.");
  const valid = { ...fallbackDirectorPlan(input), origin: "ai" as const };
  assert.ok(parseDirectorOutput(valid, input));
  assert.equal(parseDirectorOutput({ ...valid, intentContract: { ...valid.intentContract, camera: "static" } }, input), null);
  assert.equal(parseDirectorOutput({ ...valid, shots: valid.shots.map(shot => ({ ...shot, camera: "Locked camera" })) }, input), null);
  assert.equal(parseDirectorOutput(({ ...valid, intentContract: undefined }) as unknown, input), null);

  const watchInput = directorFixtureInput(directorProducts[2]);
  const macro = { ...watchInput, shotMode: "single" as const, presetId: "precision-macro" as const,
    draft: { ...watchInput.draft, shotMode: "single" as const } } satisfies VideoDirectorInput;
  const macroPlan = fallbackDirectorPlan(macro);
  assert.equal(macroPlan.shots.length, 1);
  assert.ok(directorProductContext(macro.profile).evidence.some(item => item.detail === macroPlan.shots[0].focus));
  assert.ok(compileDirectorPlan(macroPlan, macro).prompt.length <= 2500);

  const unknown = { ...macro, profile: null, presetId: "macro-detail-reveal" as const };
  const safe = fallbackDirectorPlan(unknown);
  assert.equal(safe.shots.length, 1);
  assert.match(safe.summary, /No verified close-detail evidence/);
  assert.match(safe.shots[0].camera, /medium product framing/i);
  assert.ok(compileDirectorPlan(safe, unknown).prompt.length <= 2500);
});
