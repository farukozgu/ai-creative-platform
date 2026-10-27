import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { canAccessVideoBeta, canSubmitVideoBeta, getVideoStudioOptions } from "../src/lib/video-generation/beta-policy";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import type { VideoGenerationDraft } from "../src/lib/video-generation/types";
import type { FalVideoGenerationProvider } from "../src/lib/video-generation/fal-provider";
import { DefiniteVideoProviderFailure } from "../src/lib/video-generation/types";
import { matchesUsdQuoteConfirmation, usdProductToMicrosCeil, usdToMicrosCeil, usdToMicrosFloor } from "../src/lib/video-generation/money";
import { sealVideoQuote, verifyVideoQuote } from "../src/lib/video-generation/quote-receipt";
import { estimateVerifiedProviderCost, videoEndpointCapabilities } from "../src/lib/video-generation/capabilities";

const owner = "10000000-0000-4000-8000-000000000001";
const submission = "20000000-0000-4000-8000-000000000001";
const draft: VideoGenerationDraft = { clientSubmissionId: submission, mode: "image", prompt: "Slow product reveal", quality: "standard", durationSeconds: 5,
  aspectRatio: "16:9", cameraMovement: "auto", source: { kind: "uploaded-image", sourceAssetId: submission } };
const env = { VIDEO_BETA_ENABLED: "true", VIDEO_BETA_USER_IDS: owner, VIDEO_GENERATION_ENABLED: "true", VIDEO_BETA_TRANSACTION_APPROVALS_ENABLED: "true", VIDEO_BETA_MAX_COST_PER_REQUEST_USD: "0.70", VIDEO_BETA_ALLOWED_TIERS: "standard", VIDEO_BETA_ALLOWED_DURATIONS: "5" };

test("normal Studio has explicit access/spending gates, all tier/duration options and safe cost defaults", () => {
  const normal = { ...env, VIDEO_STUDIO_ENABLED: "true", VIDEO_STUDIO_SPENDING_ENABLED: "true", VIDEO_STUDIO_USER_IDS: `${owner},${submission}` };
  assert.deepEqual(getVideoStudioOptions(normal), { tiers: ["standard", "pro"], durations: [5, 10] });
  assert.equal(canAccessVideoBeta(submission, normal), true);
  assert.equal(canAccessVideoBeta(owner, { ...normal, VIDEO_STUDIO_USER_IDS: "*" }), false);
  for (const quality of ["standard", "pro"] as const) for (const durationSeconds of [5, 10] as const) {
    assert.equal(canSubmitVideoBeta(owner, { ...draft, quality, durationSeconds }, 1.68, normal), true);
    assert.equal(canSubmitVideoBeta(owner, { ...draft, quality, durationSeconds }, 2.01, normal), false);
  }
  assert.equal(canSubmitVideoBeta(owner, draft, 0.7, { ...normal, VIDEO_STUDIO_SPENDING_ENABLED: "false" }), false);
  assert.equal(canSubmitVideoBeta(owner, draft, 0.7, { ...normal, VIDEO_STUDIO_ALLOWED_TIERS: "*" }), false);
  assert.equal(canSubmitVideoBeta(owner, draft, 0.7, { ...normal, VIDEO_STUDIO_ALLOWED_DURATIONS: "15" }), false);
  for (const ceiling of ["20", "unlimited"]) {
    const configured = { ...normal, VIDEO_STUDIO_MAX_COST_PER_REQUEST_USD: ceiling };
    assert.equal(canSubmitVideoBeta(owner, draft, 12, configured), false);
    assert.equal(canSubmitVideoBeta(owner, draft, 12, { ...configured, VIDEO_STUDIO_ALLOW_HIGH_LIMITS: "true" }), true);
  }
  assert.equal(canAccessVideoBeta("30000000-0000-4000-8000-000000000003", { ...normal, VIDEO_STUDIO_ACCESS_MODE: "authenticated" }), true);
  assert.equal(canAccessVideoBeta("invalid", { ...normal, VIDEO_STUDIO_ACCESS_MODE: "authenticated" }), false);
});

test("video beta is closed by default and admits exactly one explicit tester", () => {
  assert.equal(canAccessVideoBeta(owner, {}), false);
  assert.equal(canAccessVideoBeta(owner, env), true);
  for (const ids of ["*", "", `${owner},${submission}`, submission]) assert.equal(canAccessVideoBeta(owner, { ...env, VIDEO_BETA_USER_IDS: ids }), false);
});

test("legacy allowlisted admin keeps approval and option gates while request budget caps are lifted", () => {
  assert.equal(canSubmitVideoBeta(owner, draft, 0.7, env), true);
  assert.equal(canSubmitVideoBeta(owner, draft, 12.34, env), true);
  for (const patch of [{ VIDEO_GENERATION_ENABLED: "false" }, { VIDEO_BETA_TRANSACTION_APPROVALS_ENABLED: "false" }, { VIDEO_BETA_ALLOWED_TIERS: "*" }, { VIDEO_BETA_ALLOWED_DURATIONS: "5,15" }]) assert.equal(canSubmitVideoBeta(owner, draft, 0.7, { ...env, ...patch }), false);
  for (const cost of [0, -1, NaN, Infinity, 1_000_000]) assert.equal(canSubmitVideoBeta(owner, draft, cost, env), false);
  assert.equal(canSubmitVideoBeta(owner, { ...draft, clientSubmissionId: owner }, 0.7, env), true);
  assert.equal(canSubmitVideoBeta(owner, { ...draft, clientSubmissionId: "not-a-uuid" }, 0.7, env), false);
  assert.equal(canSubmitVideoBeta(owner, { ...draft, quality: "pro" }, 0.7, env), false);
  assert.equal(canSubmitVideoBeta(owner, { ...draft, durationSeconds: 10 }, 0.7, env), false);
  assert.equal(canSubmitVideoBeta(owner, { ...draft, quality: "pro", durationSeconds: 10 }, 0.7, { ...env, VIDEO_BETA_ALLOWED_TIERS: "standard,pro", VIDEO_BETA_ALLOWED_DURATIONS: "5,10" }), true);
  assert.equal(canSubmitVideoBeta(submission, draft, 12.34, { ...env, VIDEO_BETA_USER_IDS: owner }), false);
  assert.equal(canSubmitVideoBeta(owner, draft, 12.34, { ...env, VIDEO_BETA_USER_IDS: `${owner},${submission}` }), false);
});

test("server-signed quote binds owner, unique submission, every draft field, exact cost and expiry", () => {
  const secret = "test-server-secret";
  const signed = sealVideoQuote(owner, draft, 0.7, secret, 1000);
  assert.equal(verifyVideoQuote(signed.receipt, owner, draft, 0.7, secret, 2000), true);
  const altered = signed.receipt.slice(0, -1) + (signed.receipt.endsWith("0") ? "1" : "0");
  for (const value of [undefined, "", signed.receipt + "x", altered])
    assert.equal(verifyVideoQuote(value, owner, draft, 0.7, secret, 2000), false);
  assert.equal(verifyVideoQuote(signed.receipt, submission, draft, 0.7, secret, 2000), false);
  assert.equal(verifyVideoQuote(signed.receipt, owner, { ...draft, clientSubmissionId: owner }, 0.7, secret, 2000), false);
  for (const changed of [{ prompt: "Different prompt" }, { quality: "pro" as const }, { durationSeconds: 10 as const },
    { cameraMovement: "static" as const }, { source: { kind: "uploaded-image" as const, sourceAssetId: owner } },
    { director: { presetId: "minimal-studio" as const, shotMode: "single" as const, receipt: "different-plan" } },
    { analysisConsent: { model: "gpt-4o-mini" as const, maximumCostUsd: 0.01, pricingVersion: "fixture" } }])
    assert.equal(verifyVideoQuote(signed.receipt, owner, { ...draft, ...changed }, 0.7, secret, 2000), false);
  assert.equal(verifyVideoQuote(signed.receipt, owner, draft, 0.700001, secret, 2000), false);
  assert.equal(verifyVideoQuote(signed.receipt, owner, draft, 0.7, "wrong", 2000), false);
  assert.equal(verifyVideoQuote(signed.receipt, owner, draft, 0.7, secret, signed.expiresAt), false);
});

test("additive one-time reservation wrapper uses the same lock and delegates all existing limits", () => {
  const sql = readFileSync("database/migrations/20261026221424_video_beta_submission_once.sql", "utf8");
  const existing = readFileSync("database/migrations/20261026132015_prepare_video_beta.sql", "utf8");
  assert.match(sql, /pg_advisory_xact_lock\(7246193086541\)/);
  assert.match(sql, /exists\s*\(select 1 from public\.video_beta_reservations[\s\S]*return null/i);
  assert.match(sql, /return public\.reserve_video_beta_budget\(p_owner, p_submission, p_cost, p_tier, p_duration\)/i);
  assert.match(sql, /revoke all on function[\s\S]*anon, authenticated/i);
  assert.doesNotMatch(sql, /drop table|delete from|update public\.video_beta_reservations/i);
  assert.match(existing, /total \+ p_cost > 10/); assert.match(existing, /today_total \+ p_cost > 2/); assert.match(existing, /today_count >= 3/);
});

test("USD quote math uses conservative integer micro-dollars without floating point overage", () => {
  assert.equal(usdProductToMicrosCeil(0.14, 5), BigInt(700_000));
  assert.equal(Number(usdProductToMicrosCeil(0.14, 5)) / 1_000_000, 0.7);
  assert.equal(usdProductToMicrosCeil(0.1, 3), BigInt(300_000));
  assert.equal(usdProductToMicrosCeil(0.1400001, 5), BigInt(700_001));
  assert.equal(usdToMicrosCeil("0.70"), BigInt(700_000));
  assert.equal(usdToMicrosCeil("0.7000001"), BigInt(700_001));
  assert.equal(usdToMicrosFloor("0.7000001"), BigInt(700_000));
  assert.equal(usdToMicrosCeil("10.0000001")! > BigInt(10_000_000), true);
  assert.equal(usdToMicrosCeil("NaN"), null);
  assert.equal(matchesUsdQuoteConfirmation(0.7, 0.7), true);
  assert.equal(matchesUsdQuoteConfirmation(0.700001, 0.7), false);
  assert.equal(matchesUsdQuoteConfirmation(0.7, 0.7000001), false);
  assert.equal(matchesUsdQuoteConfirmation(0.7, Infinity), false);
  assert.equal(estimateVerifiedProviderCost({ ...videoEndpointCapabilities.klingV3StandardImage,
    pricing: { basis: "per-second", audioOffUsdPerSecond: 0.14000001, audioOnUsdPerSecond: 0.14000001, voiceControlUsdPerSecond: null } }, 5), 0.700001);
});

test("fresh read-only fal pricing verifies each tier/duration and rejects unknown units or currencies", async () => {
  const exports: Record<string, unknown> = {};
  let currency = "USD", unit = "seconds", reads = 0;
  const mocks: Record<string, unknown> = { "server-only": {}, "@/lib/supabase/admin": {}, "./beta-policy": {},
    "./capabilities": { videoEndpointCapabilities, videoTierRouting: { standard: "klingV3StandardImage", pro: "klingV3ProImage" } },
    "./billing": {}, "./supabase-repository": {}, "./reconciliation": {}, "./fal-provider": {}, "./output": {}, "./money": { usdProductToMicrosCeil } };
  const code = ts.transpileModule(readFileSync("src/lib/video-generation/beta-runtime.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, process: { env: { FAL_KEY: "fixture-only" } }, AbortSignal,
    require: (name: string) => { if (!(name in mocks)) throw new Error(`Unmocked dependency: ${name}`); return mocks[name]; },
    fetch: async (url: string, options: RequestInit) => {
      reads++; assert.equal(options.cache, "no-store"); assert.equal(options.redirect, "error");
      assert.ok(url.startsWith("https://api.fal.ai/v1/models/pricing?endpoint_id="));
      const endpoint = new URL(url).searchParams.get("endpoint_id");
      return new Response(JSON.stringify({ prices: [{ endpoint_id: endpoint, unit, currency, unit_price: endpoint?.includes("/pro/") ? 0.168 : 0.14 }] }));
    } });
  const quote = exports.getVideoBetaQuote as typeof import("../src/lib/video-generation/beta-runtime").getVideoBetaQuote;
  for (const tier of ["standard", "pro"] as const) for (const seconds of [5, 10] as const) {
    const result = await quote(tier, seconds);
    assert.equal(result.estimatedMaxCostUsd, Number(usdProductToMicrosCeil(tier === "pro" ? 0.168 : 0.14, seconds)) / 1e6);
  }
  assert.equal(reads, 4);
  currency = "EUR"; await assert.rejects(quote("pro", 10));
  currency = "USD"; unit = "requests"; await assert.rejects(quote("standard", 5));
});

test("actual fal SDK sends one POST on retryable statuses, malformed success and network uncertainty", async () => {
  const requirePackage = createRequire(import.meta.url);
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync("src/lib/video-generation/fal-provider.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, URL, AbortSignal, process: { env: {} }, require: (name: string) => name === "server-only" ? {} : name.endsWith("fal-request") ? { buildFalVideoRequestInput } : name.endsWith("video-generation/types") ? { DefiniteVideoProviderFailure } : requirePackage(name) });
  const Provider = exports.FalVideoGenerationProvider as typeof FalVideoGenerationProvider;
  for (const outcome of ["network", "malformed", "missing-id", "422", "429", "502", "503", "504", "success"]) {
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
    if (outcome === "success") assert.equal((await result).requestId, "test-task");
    else if (outcome === "422") await assert.rejects(result, error => error instanceof DefiniteVideoProviderFailure);
    else await assert.rejects(result);
    assert.equal(posts, 1);
  }
});

test("a null one-time reservation result is distinguished from an RPC failure", async () => {
  const requirePackage = createRequire(import.meta.url), exports: Record<string, unknown> = {};
  let reply: { data: unknown; error: unknown } = { data: null, error: null };
  const mocks: Record<string, unknown> = {
    "server-only": {}, "@/lib/supabase/admin": { getSupabaseAdminClient: () => ({ rpc: async () => reply }) },
    "./beta-policy": { canSubmitVideoBeta: () => true },
    "./capabilities": { videoEndpointCapabilities, videoTierRouting: { standard: "klingV3StandardImage", pro: "klingV3ProImage" } },
    "./supabase-repository": {}, "./reconciliation": {}, "./fal-provider": {}, "./output": {},
    "./money": { usdProductToMicrosCeil },
  };
  const code = ts.transpileModule(readFileSync("src/lib/video-generation/beta-runtime.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, process: { env: { VIDEO_BETA_ENABLED: "true" } }, AbortSignal,
    require: (name: string) => { if (!(name in mocks)) return requirePackage(name); return mocks[name]; } });
  const Budget = exports.VideoBetaBudget as new () => import("../src/lib/video-generation/beta-runtime").VideoBetaBudget;
  const budget = new Budget();
  const request = { ...draft, clientSubmissionId: submission };
  const limited = await budget.reserve(owner, submission, 0.7, request);
  assert.equal(limited.ok, false);
  if (!limited.ok) assert.equal(limited.code, "insufficient_balance");
  reply = { data: null, error: { message: "database unavailable" } };
  const unavailable = await budget.reserve(owner, submission, 0.7, request);
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) assert.equal(unavailable.code, "billing_unavailable");
});

test("Fal terminal task status is surfaced as failed for reconciliation", async () => {
  const requirePackage = createRequire(import.meta.url), exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync("src/lib/video-generation/fal-provider.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, URL, AbortSignal, process: { env: {} }, require: (name: string) => name === "server-only" ? {} : name.endsWith("fal-request") ? { buildFalVideoRequestInput } : name.endsWith("video-generation/types") ? { DefiniteVideoProviderFailure } : requirePackage(name) });
  const Provider = exports.FalVideoGenerationProvider as typeof FalVideoGenerationProvider;
  const provider = new Provider("fake-only", async () => new Response(JSON.stringify({ status: "FAILED" }), { headers: { "content-type": "application/json" } }));
  assert.equal(await provider.getStatus("fal-ai/kling-video/v3/standard/image-to-video", "fixture-task"), "failed");
});
