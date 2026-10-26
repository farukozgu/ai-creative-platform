import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { canAccessVideoBeta, canSubmitVideoBeta } from "../src/lib/video-generation/beta-policy";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import type { VideoGenerationDraft } from "../src/lib/video-generation/types";
import type { FalVideoGenerationProvider } from "../src/lib/video-generation/fal-provider";
import { matchesUsdQuoteConfirmation, usdProductToMicrosCeil, usdToMicrosCeil } from "../src/lib/video-generation/money";

const owner = "10000000-0000-4000-8000-000000000001";
const submission = "20000000-0000-4000-8000-000000000001";
const draft: VideoGenerationDraft = { clientSubmissionId: submission, mode: "image", prompt: "Slow product reveal", quality: "standard", durationSeconds: 5,
  aspectRatio: "16:9", cameraMovement: "auto", source: { kind: "uploaded-image", sourceAssetId: submission } };
const env = { VIDEO_BETA_ENABLED: "true", VIDEO_BETA_USER_IDS: owner, VIDEO_GENERATION_ENABLED: "true", VIDEO_BETA_APPROVED_SUBMISSION_ID: submission, VIDEO_BETA_APPROVED_MAX_COST_USD: "0.70", VIDEO_BETA_APPROVED_TIER: "standard", VIDEO_BETA_APPROVED_DURATION_SECONDS: "5" };

test("video beta is closed by default and admits exactly one explicit tester", () => {
  assert.equal(canAccessVideoBeta(owner, {}), false);
  assert.equal(canAccessVideoBeta(owner, env), true);
  for (const ids of ["*", "", `${owner},${submission}`, submission]) assert.equal(canAccessVideoBeta(owner, { ...env, VIDEO_BETA_USER_IDS: ids }), false);
});

test("paid beta requires the exact approved request and finite cost within a hard USD ceiling", () => {
  assert.equal(canSubmitVideoBeta(owner, draft, 0.7, env), true);
  for (const patch of [{ VIDEO_GENERATION_ENABLED: "false" }, { VIDEO_BETA_APPROVED_SUBMISSION_ID: "" }, { VIDEO_BETA_APPROVED_MAX_COST_USD: "0" }, { VIDEO_BETA_APPROVED_MAX_COST_USD: "11" }]) assert.equal(canSubmitVideoBeta(owner, draft, 0.7, { ...env, ...patch }), false);
  for (const cost of [0, -1, NaN, Infinity, 0.71]) assert.equal(canSubmitVideoBeta(owner, draft, cost, env), false);
  assert.equal(canSubmitVideoBeta(owner, draft, 0.700001, env), false);
  assert.equal(canSubmitVideoBeta(owner, { ...draft, clientSubmissionId: owner }, 0.7, env), false);
  assert.equal(canSubmitVideoBeta(owner, { ...draft, quality: "pro" }, 0.7, env), false);
  assert.equal(canSubmitVideoBeta(owner, { ...draft, durationSeconds: 10 }, 0.7, env), false);
});

test("USD quote math uses conservative integer micro-dollars without floating point overage", () => {
  assert.equal(usdProductToMicrosCeil(0.14, 5), BigInt(700_000));
  assert.equal(Number(usdProductToMicrosCeil(0.14, 5)) / 1_000_000, 0.7);
  assert.equal(usdProductToMicrosCeil(0.1, 3), BigInt(300_000));
  assert.equal(usdProductToMicrosCeil(0.1400001, 5), BigInt(700_001));
  assert.equal(usdToMicrosCeil("0.70"), BigInt(700_000));
  assert.equal(usdToMicrosCeil("0.7000001"), BigInt(700_001));
  assert.equal(usdToMicrosCeil("10.0000001")! > BigInt(10_000_000), true);
  assert.equal(usdToMicrosCeil("NaN"), null);
  assert.equal(matchesUsdQuoteConfirmation(0.7, 0.7), true);
  assert.equal(matchesUsdQuoteConfirmation(0.700001, 0.7), false);
  assert.equal(matchesUsdQuoteConfirmation(0.7, 0.7000001), false);
  assert.equal(matchesUsdQuoteConfirmation(0.7, Infinity), false);
});

test("actual fal SDK sends one POST on retryable statuses, malformed success and network uncertainty", async () => {
  const requirePackage = createRequire(import.meta.url);
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync("src/lib/video-generation/fal-provider.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, URL, AbortSignal, process: { env: {} }, require: (name: string) => name === "server-only" ? {} : name.endsWith("fal-request") ? { buildFalVideoRequestInput } : requirePackage(name) });
  const Provider = exports.FalVideoGenerationProvider as typeof FalVideoGenerationProvider;
  for (const outcome of ["network", "malformed", "missing-id", "429", "502", "503", "504", "success"]) {
    let posts = 0;
    const provider = new Provider("fake-only", async (url, init) => {
      posts++; assert.equal(String(url), "https://queue.fal.run/fal-ai/kling-video/v3/standard/image-to-video");
      assert.equal(init?.method, "POST");
      if (outcome === "network") throw new TypeError("timeout");
      return new Response(outcome === "malformed" ? "{" : JSON.stringify(outcome === "missing-id" ? {} : { request_id: "test-task" }), {
        status: /\d/.test(outcome) ? Number(outcome) : 200, headers: { "content-type": "application/json" },
      });
    });
    const result = provider.submit({ modelId: "kling-v3-standard-image", endpointId: "fal-ai/kling-video/v3/standard/image-to-video", mode: "image", prompt: "Product reveal", durationSeconds: 5, aspectRatio: "16:9", sourceUrl: "https://private.invalid/source.png" });
    if (outcome === "success") assert.equal((await result).requestId, "test-task"); else await assert.rejects(result);
    assert.equal(posts, 1);
  }
});
