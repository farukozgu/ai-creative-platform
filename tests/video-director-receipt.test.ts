import assert from "node:assert/strict";
import test from "node:test";
import { fingerprint } from "../scripts/preset-benchmark/benchmark";
import { compileDirectorPlan, fallbackDirectorPlan, parseDirectorOutput, type VideoDirectorInput, type VideoDirectorPlan } from "../src/lib/video-director/core";
import { directorCacheKey, openDirectorPlan, sealDirectorPlan } from "../src/lib/video-director/receipt";
import { buildFalVideoRequestInput, KLING_SINGLE_PROMPT_MAX_CHARS } from "../src/lib/video-generation/fal-request";
import legacy from "./fixtures/quick-cuts-legacy.json";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";

const owner = "10000000-0000-4000-8000-000000000001";
const secret = "offline-benchmark-only-never-a-real-key";
const now = 1000;
const base = directorFixtureInput(directorProducts[0]);
const input: VideoDirectorInput = {
  ...base, presetId: "luxury-fashion-film", shotMode: "single",
  draft: {
    ...base.draft, durationSeconds: 5, shotMode: "single",
    prompt: "Kamerayı sabit tut ve ürünü net göster.",
    criticalRegion: { x: 0, y: 0, width: 0.1, height: 0.1, declaredText: "offline unverified hint" },
  },
};
const source = fingerprint(input.profile);
const model = "offline-no-model";
const key = directorCacheKey(owner, source, model, input);

test("Luxury Fashion Film Standard 5s single short brief verifies across plan property order", () => {
  const plan = fallbackDirectorPlan(input);
  assert.equal(plan.origin, "fallback");
  assert.equal(plan.shots[0].camera, "Locked long-lens overview");
  assert.ok(parseDirectorOutput(plan, input));

  const reorder = <T extends object>(value: T) => Object.fromEntries(Object.entries(value).reverse()) as T;
  const reordered = reorder({ ...plan, shots: plan.shots.map(reorder) });
  assert.notEqual(JSON.stringify(reordered), JSON.stringify(plan));
  const compiled = compileDirectorPlan(plan, input);
  const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: "kling-v3-standard-image",
    endpointId: "offline", sourceUrl: "https://invalid.example/offline-fixture" });
  assert.equal(payload.duration, "5");
  assert.ok(payload.prompt && payload.prompt.length <= KLING_SINGLE_PROMPT_MAX_CHARS);

  for (const candidate of [plan, reordered]) {
    const receipt = sealDirectorPlan(key, candidate, secret, now);
    const opened = openDirectorPlan(receipt, key, input, secret, now + 1);
    assert.deepEqual(opened, plan);
    assert.deepEqual(compileDirectorPlan(opened, input), compiled);
  }
});

test("Director receipt rejects tampering, expiry and different generation bindings", () => {
  const receipt = sealDirectorPlan(key, fallbackDirectorPlan(input), secret, now);
  const [payload, signature] = receipt.split(".");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { plan: VideoDirectorPlan };
  decoded.plan.shots[0].lighting = "Soft side light";
  const modified = Buffer.from(JSON.stringify(decoded)).toString("base64url");
  assert.equal(openDirectorPlan(`${modified}.${signature}`, key, input, secret, now + 1), null);
  assert.equal(openDirectorPlan(receipt, key, input, "wrong-test-secret", now + 1), null);
  assert.equal(openDirectorPlan(receipt, key, input, secret, now + 60 * 60 * 1000), null);
  assert.equal(openDirectorPlan(receipt, directorCacheKey("other-owner", source, model, input), input, secret, now + 1), null);
  assert.equal(openDirectorPlan(receipt, directorCacheKey(owner, "other-source", model, input), input, secret, now + 1), null);

  const changedInputs: VideoDirectorInput[] = [
    { ...input, profile: directorProducts[1] },
    { ...input, presetId: "minimal-studio" },
    { ...input, shotMode: "multi", draft: { ...input.draft, shotMode: "multi" } },
    { ...input, draft: { ...input.draft, durationSeconds: 10 } },
  ];
  for (const changed of changedInputs) {
    assert.equal(openDirectorPlan(receipt, directorCacheKey(owner, source, model, changed), changed, secret, now + 1), null);
  }
});

test("pre-Quick-Cuts v1 receipt verifies with its historical signature", () => {
  const legacyInput: VideoDirectorInput = { ...base, presetId: "cinematic-hero" };
  const legacyKey = directorCacheKey(owner, source, model, legacyInput);
  const payload = Buffer.from(JSON.stringify({ key: legacyKey, plan: legacy.plan, expiresAt: 3601000 })).toString("base64url");
  // Captured with the 5abba68 signer and the existing pre-Quick-Cuts plan fixture.
  const signature = "419eae96e79ce236c2c9cf524ea73423f18b3490ea02eeab3f7f1ded6c59caf0";
  const opened = openDirectorPlan(`${payload}.${signature}`, legacyKey, legacyInput, secret, now + 1);
  assert.ok(opened);
  assert.deepEqual(compileDirectorPlan(opened, legacyInput), legacy.compiled);
});
