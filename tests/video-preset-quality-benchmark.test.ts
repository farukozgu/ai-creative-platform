import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runBenchmark, fingerprint } from "../scripts/preset-benchmark/benchmark";
import { runMutationProbes } from "../scripts/preset-benchmark/probes";
import { planDistance, weights, auditBoundary } from "../scripts/preset-benchmark/analysis";
import { benchmarkProducts } from "../scripts/preset-benchmark/dataset";
import { fallbackDirectorPlan } from "../src/lib/video-director/core";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";

const result = runBenchmark();
test("benchmark covers all 24 presets with two appropriate products, four intents and the full model/time/shot matrix", () => {
  assert.equal(result.summaries.length, 24);
  assert.equal(result.products.length, 20);
  assert.equal(result.cases.length, 7584);
  assert.ok(result.summaries.every(s => s.products >= 2));
  assert.deepEqual(weights, { product: 25, cinema: 20, difference: 20, intent: 15, identity: 15, prompt: 5 });
  assert.ok(result.unchangedProduction);
  for (const summary of result.summaries) {
    const rows = result.cases.filter(c => c.presetId === summary.presetId);
    assert.deepEqual([...new Set(rows.map(c => c.intentKind))].sort(), ["conflicting", "detailed", "empty", "short"]);
    assert.equal(new Set(rows.map(c => `${c.quality}/${c.duration}/${c.mode}`)).size, 8);
    assert.ok(summary.score >= 0 && summary.score <= 100);
    assert.ok(summary.exampleRefs.length >= 2);
  }
});
test("all observed prompts resolve through real receipts, preview and provider contracts", () => {
  for (const c of result.cases) {
    assert.ok(Object.values(c.boundary).every(Boolean), c.id);
    assert.equal(c.score, Object.values(c.parts).reduce((sum, n) => sum + n, 0));
    const p = result.plans[c.planRef];
    assert.equal(fingerprint(p.plan), c.planHash, c.id);
    assert.ok(p.characters.every(n => n <= (c.mode === "multi" ? 512 : 2500)));
  }
});
test("scoring does not reward renamed purposes, summaries or synonyms as different directing", () => {
  const a = fallbackDirectorPlan(directorFixtureInput(directorProducts[0]));
  const b = structuredClone(a);
  b.summary = "A totally different marketing name";
  b.shots[0].pace = "Magnificent cinematic premium rhythm";
  b.shots[0].purpose = "lighting-reveal";
  assert.equal(planDistance(a, b, benchmarkProducts[0]), 0);
  b.shots[0].camera = "Slow pan right";
  assert.ok(planDistance(a, b, benchmarkProducts[0]) > 0);
});
test("fixed benchmark now measures intent-responsive plans and a lower single-shot detail miss count", () => {
  assert.equal(result.totals.responsiveGroups, result.totals.counterfactualGroups);
  assert.equal(result.totals.storedPlans, result.cases.length);
  assert.equal(result.cases.filter(c => c.weaknesses.includes("intent-not-executed")).length, 0);
  assert.ok(result.cases.filter(c => c.mode === "single" && c.weaknesses.includes("close-frame-focuses-form-or-generic")).length < 2320);
  const emptyIntentCollisions = result.cases.filter(c => c.intentKind === "empty" && c.weaknesses.includes("semantic-strategy-collision"));
  assert.ok(emptyIntentCollisions.length < 84); // Prior 336 cases / four identical fallback intents.
  assert.equal(result.totals.hardFailures, 0);
  assert.ok(result.summaries.some(s => s.score >= 80));
});
test("mandatory failure detectors catch all calibrated corruptions without adding them to real scenario totals", () => {
  const probes = runMutationProbes();
  assert.equal(probes.length, 10);
  assert.ok(probes.every(p => p.detected));
  for (const code of ["invented-detail", "unjustified-intent-loss", "shot-mode-conflict", "repeated-scene", "payload-limit", "signed-preview-payload-mismatch", "unseen-surface", "unexplained-risk", "five-second-overload"])
    assert.ok(probes.some(p => p.expected === code));
  assert.ok(probes.some(p => p.expected === "unjustified-intent-loss" && p.guardRejected === true));
  assert.deepEqual(auditBoundary(["a".repeat(512)], ["a".repeat(512)], true, true), []);
  assert.deepEqual(auditBoundary(["a".repeat(2500)], ["a".repeat(2500)], true, false), []);
});
test("results are deterministic, including scores, failure reasons and signed boundary evidence", () => {
  const second = runBenchmark();
  assert.equal(fingerprint(second), fingerprint(result));
});
test("runner blocks fetch before compiler imports and never imports provider clients", () => {
  const runner = readFileSync("scripts/run-video-preset-quality-benchmark.ts", "utf8");
  assert.ok(runner.indexOf("globalThis.fetch =") < runner.indexOf('await import("./preset-benchmark/benchmark")'));
  for (const file of ["dataset", "analysis", "benchmark", "probes", "report"]) {
    const code = readFileSync(`scripts/preset-benchmark/${file}.ts`, "utf8");
    assert.doesNotMatch(code, /getOpenAIClient|FalVideoGenerationProvider|Supabase|process\.env|responses\.create/);
  }
});
