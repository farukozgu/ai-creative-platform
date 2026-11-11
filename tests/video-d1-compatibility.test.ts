import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { compileDirectorPlan, directorPlanDescriptions, fallbackDirectorPlan, fixedLegacyDirectorPlan } from "../src/lib/video-director/core";
import { legacyD1FiveSecondShots } from "../src/lib/video-director/five-second-multi-legacy";
import type { ReferenceReview } from "../src/lib/video-generation/product-references";
import { directorCacheKey, openDirectorPlan, sealDirectorPlan } from "../src/lib/video-director/receipt";
import { getVideoDirectorPreset, videoPresetIds } from "../src/lib/video-director/presets";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";
import { historicalPresetOutputPlan } from "./fixtures/preset-output-fingerprint";

test("D1 leaves all 2068 protected preset cells byte-identical, including cache identity", () => {
  const cells = [];
  const profiles = [...directorProducts, ...libraryFixtures.map(f => f.profile), null];
  for (const presetId of videoPresetIds) for (const shotMode of ["single", "multi"] as const)
    for (const durationSeconds of [5, 10] as const) for (const [index, profile] of profiles.entries()) {
      if (["minimal-studio", "metallic-light-sweep"].includes(presetId) && shotMode === "multi" && durationSeconds === 5) continue;
      const base = directorFixtureInput(profile ?? directorProducts[0]);
      const input = { ...base, profile, presetId, shotMode, draft: { ...base.draft, shotMode, durationSeconds } };
      const plan = fallbackDirectorPlan(input), compiled = compileDirectorPlan(plan, input);
      const key = directorCacheKey("offline-owner", "primary-hash", "offline-model", input);
      cells.push({ cell: [presetId, shotMode, durationSeconds, index].join("/"), input, plan, compiled,
        preset: getVideoDirectorPreset(presetId, shotMode, durationSeconds), key });
    }
  assert.equal(cells.length, 2068);
  // Captured before D1 changes. Includes every 10s cell, Quick Cuts 5s, all Single and hidden presets.
  assert.equal(createHash("sha256").update(JSON.stringify(cells)).digest("hex"), "f088610ef0505eed2e9713ebadf283496a0587c7d9de836759af46751468e73b");
});

test("historical two-shot D1 receipts still verify and compile without reinterpretation", () => {
  for (const presetId of ["minimal-studio", "metallic-light-sweep"] as const) for (const profile of [...directorProducts, null]) {
    const base = directorFixtureInput(profile ?? directorProducts[0]);
    const input = { ...base, profile, presetId, draft: { ...base.draft, durationSeconds: 5 as const } };
    const historical = fixedLegacyDirectorPlan(input) ?? historicalPresetOutputPlan(input);
    assert.equal(historical.shots.length, 2);
    const compiled = compileDirectorPlan(historical, input);
    const key = directorCacheKey("owner", "source", "fixture", input);
    const receipt = sealDirectorPlan(key, historical, "offline", 1000);
    const restored = openDirectorPlan(receipt, key, input, "offline", 1001);
    assert.ok(restored);
    assert.deepEqual(restored.shots, historical.shots);
    assert.deepEqual(compileDirectorPlan(restored, input), compiled);
    assert.equal(openDirectorPlan(receipt + "x", key, input, "offline", 1001), null);
  }
});

test("all 176 prior D1 four/five-scene outputs and historical receipts remain byte-identical", () => {
  const cells = [];
  for (const presetId of ["minimal-studio", "metallic-light-sweep"] as const)
    for (const profile of [...directorProducts, ...libraryFixtures.map(f => f.profile), null])
      for (const view of ["none", "side", "back", "front"] as const) {
        const base = directorFixtureInput(profile ?? directorProducts[0]);
        const refs = view === "none" ? undefined : [{ purpose: "other-product-view", sha256: "a".repeat(64),
          source: { kind: "uploaded-image" as const, sourceAssetId: "10000000-0000-4000-8000-000000000006" } }];
        const input = { ...base, presetId, profile, draft: { ...base.draft, durationSeconds: 5 as const, productReferences: refs } };
        const reviews: ReferenceReview[] = view === "none" ? [] : [{ index: 0, status: "matched", view,
          wholeViewVisible: true, reason: "Offline same-product review", details: [] }];
        const shots = legacyD1FiveSecondShots(input, reviews);
        const plan = { ...fallbackDirectorPlan(input, reviews), ...directorPlanDescriptions(input, shots.length), shots };
        const compiled = compileDirectorPlan(plan, input);
        const key = directorCacheKey("offline-owner", "primary", "offline", input);
        cells.push({ input, plan, compiled, key });
        const receipt = sealDirectorPlan(key, plan, "offline-secret", 1000);
        const restored = openDirectorPlan(receipt, key, input, "offline-secret", 1001);
        assert.ok(restored);
        assert.deepEqual(compileDirectorPlan(restored, input), compiled);
        assert.equal(fallbackDirectorPlan(input, reviews).shots.length, 3);
        assert.equal(fallbackDirectorPlan(input, reviews).shots[1].referenceIndex, undefined);
      }
  assert.equal(cells.length, 176);
  // Captured from the prior D1 implementation before this revision; never regenerated.
  assert.equal(createHash("sha256").update(JSON.stringify(cells)).digest("hex"), "d50e859e86b5c3c314d53bf2fdbdfdaa9a5457285fabc1484e47ae1bcc5469f6");
});
