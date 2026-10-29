import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { videoEndpointCapabilities, videoTierRouting } from "../src/lib/video-generation/capabilities";
import { canAccessVideoBeta, canSubmitVideoBeta, videoSubmissionPolicyChecks } from "../src/lib/video-generation/beta-policy";
import { validateVideoGenerationDraft } from "../src/lib/video-generation/validation";
import { matchesUsdQuoteConfirmation } from "../src/lib/video-generation/money";
import { sealVideoQuote, verifyVideoQuote } from "../src/lib/video-generation/quote-receipt";
import { videoDraftHash } from "../src/lib/video-generation/request-identity";
import { shouldRestoreApprovedVideoJob } from "../src/lib/video-generation/progress-phase";
import { summarizeVideoPayload } from "../src/lib/video-generation/payload-summary";
import { validateKlingMultiPrompt } from "../src/lib/video-generation/fal-request";
import type { VideoGenerationDraft } from "../src/lib/video-generation/types";
import type * as actions from "../src/app/[locale]/dashboard/video/generation-actions";
import type { VideoBetaBudget } from "../src/lib/video-generation/beta-runtime";

const owner = "10000000-0000-4000-8000-000000000001";
const draft: VideoGenerationDraft = { clientSubmissionId: "20000000-0000-4000-8000-000000000001", mode: "image", shotMode: "single", prompt: "Calm product shot",
  quality: "standard", durationSeconds: 5, aspectRatio: "16:9", cameraMovement: "static", source: { kind: "uploaded-image", sourceAssetId: owner } };

function fixture() {
  const logs: Array<{ stage: string; result: string; fields: Record<string, unknown> }> = [];
  let failure: "repository" | "quote" | "unsafe" | null = null;
  let currentOwner: string | null = owner, cost = 0.7, calls = 0, sourceReads = 0, sourceAvailable = true, planValid = true;
  let detailPrompt = "detail";
  let submitted: { preservation?: import("../src/lib/video-generation/types").VideoPreservationSnapshot; capability?: import("../src/lib/video-generation/capabilities").VideoEndpointCapability } | null = null;
  let prior: Record<string, unknown> | null = null;
  let history: Record<string, unknown>[] | null = null;
  const env: Record<string, string> = { SUPABASE_SECRET_KEY: "fixture-secret", VIDEO_BETA_ENABLED: "true", VIDEO_BETA_USER_IDS: owner,
    VIDEO_GENERATION_ENABLED: "true", VIDEO_BETA_TRANSACTION_APPROVALS_ENABLED: "true", VIDEO_BETA_MAX_COST_PER_REQUEST_USD: "0.70",
    VIDEO_BETA_ALLOWED_TIERS: "standard", VIDEO_BETA_ALLOWED_DURATIONS: "5" };
  const mocks: Record<string, unknown> = {
    "@/lib/video-generation/reference-context": { readProductReferences: async () => [] },
    "@/lib/video-generation/capabilities": { videoEndpointCapabilities, videoTierRouting },
    "@/lib/auth/require-user": { getAuthenticatedUserId: async () => currentOwner },
    "@/lib/video-generation/media-access": {}, "@/lib/video-generation/presentation": { toVideoPresentationRecord: (job: unknown) => job },
    "@/lib/video-generation/supabase-repository": { SupabaseVideoJobRepository: class { async findBySubmission() { if (failure === "repository") throw new Error("fixture"); return prior; } async findOwned(_owner: string, id: string) { return history?.find(job => job.id === id) ?? prior; } async listOwned() { return history ?? (prior ? [prior] : []); } } },
    "@/lib/video-generation/validation": { validateVideoGenerationDraft },
    "@/lib/video-generation/beta-policy": { canAccessVideoBeta: (id: string) => canAccessVideoBeta(id, env), canSubmitVideoBeta: (id: string, value: VideoGenerationDraft, price: number) => canSubmitVideoBeta(id, value, price, env), videoSubmissionPolicyChecks: (id: string, value: VideoGenerationDraft, price: number) => videoSubmissionPolicyChecks(id, value, price, env) },
    "@/lib/video-generation/beta-runtime": { getVideoBetaQuote: async (_quality: string, duration: number) => { if (failure === "quote") throw new Error("fixture"); return { estimatedMaxCostUsd: cost, rate: cost / duration }; }, VideoBetaBudget: class {}, reconcileVideoBeta: async () => {} },
    "@/lib/video-generation/service": { submitVideoGeneration: async (_owner: string, _draft: unknown, dependencies: typeof submitted) => { calls++; submitted = dependencies; return { ok: true, jobId: "job", status: "queued", duplicate: false }; } },
    "@/lib/video-generation/fal-provider": { FalVideoGenerationProvider: class {} },
    "@/lib/video-generation/supabase-source-resolver": { SupabaseVideoSourceResolver: class {} },
    "@/lib/video-generation/prepared-source": {},
    "@/lib/video-generation/money": { matchesUsdQuoteConfirmation },
    "@/lib/video-generation/quote-receipt": { sealVideoQuote, verifyVideoQuote },
    "@/lib/video-generation/payload-summary": { summarizeVideoPayload },
    "@/lib/video-generation/diagnostics": { createVideoCorrelationId: () => "test-correlation", logVideoDiagnostic: (_id: string, stage: string, result: string, fields: Record<string, unknown>) => logs.push({ stage, result, fields }) },
    "@/lib/video-director/receipt": { readDirectorProfileSnapshot: () => null },
    "@/lib/video-generation/fal-request": { validateKlingMultiPrompt },
    "@/lib/video-generation/progress-phase": { shouldRestoreApprovedVideoJob },
    "@/lib/video-generation/preservation": { compileProductVideoPrompt: () => ({ prompt: "safe", negativePrompt: "safe", cfgScale: 0.5 }), isUnsafeProductMotion: () => failure === "unsafe", VIDEO_PRESERVATION_VERSION: "fixture" },
    "@/lib/video-generation/request-identity": { videoDraftHash, matchesVideoRequest: () => true },
    "@/lib/video-generation/source-context": { readOwnedPreparedVideoSource: async () => { sourceReads++; if (!sourceAvailable) throw new Error("Source not owned"); return { profile: null, sourceSha256: "fixture", geometry: {} }; } },
    "@/lib/video-fidelity/availability": { getVideoFidelityAnalysisAvailability: () => ({ enabled: false }) },
    "@/lib/video-fidelity/pricing": { quoteVideoFidelity: () => null },
    "@/lib/video-fidelity/reviews": { videoFidelitySchemaReady: async () => false },
    "@/lib/video-director/runtime": { readVerifiedDirectorPlan: (_owner: string, _source: string, input: { shotMode: string }) => planValid ? ({ version: "fixture", shotMode: input.shotMode, shots: [{ camera: "locked" }, { camera: "detail" }] }) : null },
    "@/lib/video-director/core": { compileDirectorPlan: (_plan: unknown, input: { shotMode: string; draft: VideoGenerationDraft }) => ({ prompt: "safe", negativePrompt: "safe", cfgScale: 0.5, ...(input.shotMode === "multi" ? { multiPrompt: [{ prompt: "hero", duration: input.draft.durationSeconds === 10 ? "4" : "2" }, { prompt: detailPrompt, duration: input.draft.durationSeconds === 10 ? "6" : "3" }] } : {}) }) },
  };
  const exports = {};
  const source = readFileSync("src/app/[locale]/dashboard/video/generation-actions.ts", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, process: { env }, require: (name: string) => {
    if (!(name in mocks)) throw new Error(`Unmocked dependency: ${name}`);
    return mocks[name];
  } });
  return { api: exports as typeof actions, env, logs, fail: (value: typeof failure) => { failure = value; }, getCalls: () => calls, getSourceReads: () => sourceReads,
    owner: (value: string | null) => { currentOwner = value; }, price: (value: number) => { cost = value; },
    previous: (value: Record<string, unknown> | null) => { prior = value; }, source: (value: boolean) => { sourceAvailable = value; },
    history: (value: Record<string, unknown>[]) => { history = value; },
    plan: (value: boolean) => { planValid = value; }, detail: (value: string) => { detailPrompt = value; }, submitted: () => submitted };
}

test("normal Studio quotes and submits Standard/Pro × 5/10s × single/multi with fresh approval", async () => {
  for (const quality of ["standard", "pro"] as const) for (const durationSeconds of [5, 10] as const) for (const shotMode of ["single", "multi"] as const) {
    const f = fixture();
    Object.assign(f.env, { VIDEO_STUDIO_ENABLED: "true", VIDEO_STUDIO_SPENDING_ENABLED: "true", VIDEO_STUDIO_USER_IDS: owner });
    const selected = { ...draft, quality, durationSeconds, shotMode, director: { presetId: "minimal-studio" as const, shotMode, receipt: "verified-plan" } };
    const cost = (quality === "pro" ? 0.168 : 0.14) * durationSeconds;
    f.price(cost);
    const quote = await f.api.quoteVideoSubmissionAction(selected);
    assert.equal(quote.status, "success", `${quality}/${durationSeconds}/${shotMode}`);
    if (quote.status !== "success") throw new Error("Missing quote");
    assert.equal(quote.cost, cost);
    assert.equal(quote.preview.mode, shotMode);
    assert.equal(quote.preview.shots.reduce((sum, shot) => sum + shot.duration, 0), durationSeconds);
    assert.equal((await f.api.submitVideoGenerationAction(selected, cost, quote.receipt, false)).ok, false);
    assert.equal(f.getCalls(), 0);
    assert.equal((await f.api.submitVideoGenerationAction(selected, cost, quote.receipt, true)).ok, true);
    assert.equal(f.getCalls(), 1);
    assert.equal(f.submitted()?.capability?.endpointId, videoEndpointCapabilities[videoTierRouting[quality]].endpointId);
    f.previous({ id: "job", status: "succeeded", clientSubmissionId: selected.clientSubmissionId });
    assert.equal((await f.api.submitVideoGenerationAction(selected, cost, quote.receipt, true)).ok, true);
    assert.equal(f.getCalls(), 1);
    f.previous(null);
    const next = { ...selected, clientSubmissionId: "30000000-0000-4000-8000-000000000003" };
    assert.equal((await f.api.submitVideoGenerationAction(next, cost, quote.receipt, true)).ok, false);
    const nextQuote = await f.api.quoteVideoSubmissionAction(next);
    assert.equal(nextQuote.status, "success");
    if (nextQuote.status !== "success") throw new Error("Missing independent quote");
    assert.equal((await f.api.submitVideoGenerationAction(next, nextQuote.cost, nextQuote.receipt, true)).ok, true);
    assert.equal(f.getCalls(), 2);
  }
});

test("multi-shot requires the same verified plan for quote, preview and submission", async () => {
  const f = fixture();
  const multi = { ...draft, shotMode: "multi" as const, director: { presetId: "minimal-studio" as const, shotMode: "multi" as const, receipt: "verified-plan" } };
  assert.notEqual((await f.api.quoteVideoSubmissionAction({ ...draft, shotMode: "multi" })).status, "success");
  f.plan(false); assert.notEqual((await f.api.quoteVideoSubmissionAction(multi)).status, "success");
  f.plan(true); const quote = await f.api.quoteVideoSubmissionAction(multi);
  assert.equal(quote.status, "success"); if (quote.status !== "success") throw new Error("Missing quote");
  assert.equal(quote.preview.mode, "multi"); assert.equal(quote.preview.shotType, "customize");
  assert.deepEqual(quote.preview.shots.map(shot => shot.duration), [2, 3]);
  f.plan(false); assert.equal((await f.api.submitVideoGenerationAction(multi, quote.cost, quote.receipt, true)).ok, false);
  f.plan(true);
  f.detail("changed compiled prompt");
  assert.equal((await f.api.submitVideoGenerationAction(multi, quote.cost, quote.receipt, true)).ok, false);
  f.detail("detail");
  for (const changed of [{ ...multi, prompt: "Changed" }, { ...multi, cameraMovement: "dolly-in" as const }, { ...multi, durationSeconds: 10 as const }, { ...multi, quality: "pro" as const }, { ...multi, shotMode: "single" as const }])
    assert.equal((await f.api.submitVideoGenerationAction(changed, quote.cost, quote.receipt, true)).ok, false);
  assert.equal(f.getCalls(), 0);
  assert.equal((await f.api.submitVideoGenerationAction(multi, quote.cost, quote.receipt, true)).ok, true);
  const saved = f.submitted()?.preservation; assert.ok(saved?.payloadSummary);
  assert.equal(saved.payloadSummary.mode, "multi"); assert.deepEqual(saved.payloadSummary.durations, [2, 3]);
  assert.equal(saved.payloadSummary.promptHashes.length, 2); assert.equal(JSON.stringify(saved.payloadSummary).includes("hero"), false);
  assert.deepEqual(saved.director?.multiPrompt?.map(shot => shot.prompt), quote.preview.shots.map(shot => shot.prompt));
  f.previous({ id: "job", status: "succeeded", clientSubmissionId: draft.clientSubmissionId });
  f.plan(false);
  const duplicate = await f.api.submitVideoGenerationAction(multi, 0, "");
  assert.ok(duplicate.ok && duplicate.duplicate); assert.equal(f.getCalls(), 1);
});

test("signed server quote, exact cost, operator policy and owned source gate every provider submission", async () => {
  const f = fixture();
  const quote = await f.api.quoteVideoSubmissionAction(draft);
  assert.equal(quote.status, "success"); if (quote.status !== "success") throw new Error("Missing quote.");
  const otherId = { ...draft, clientSubmissionId: "30000000-0000-4000-8000-000000000003" };
  for (const result of [await f.api.submitVideoGenerationAction(draft, 0.7, quote.receipt),
    await f.api.submitVideoGenerationAction(draft, 0.7, "", true),
    await f.api.submitVideoGenerationAction(draft, 0.700001, quote.receipt, true),
    await f.api.submitVideoGenerationAction(otherId, 0.7, quote.receipt, true),
    await f.api.submitVideoGenerationAction({ ...draft, prompt: "Different frame" }, 0.7, quote.receipt, true)]) assert.equal(result.ok, false);
  assert.equal(f.getCalls(), 0);
  f.price(0.71);
  assert.equal((await f.api.submitVideoGenerationAction(draft, 0.7, quote.receipt, true)).ok, false);
  f.price(0.7); f.env.VIDEO_BETA_TRANSACTION_APPROVALS_ENABLED = "false";
  assert.equal((await f.api.submitVideoGenerationAction(draft, 0.7, quote.receipt, true)).ok, false);
  assert.equal((await f.api.quoteVideoSubmissionAction(draft)).status, "unavailable");
  f.env.VIDEO_BETA_TRANSACTION_APPROVALS_ENABLED = "true";
  f.owner("40000000-0000-4000-8000-000000000004");
  assert.equal((await f.api.submitVideoGenerationAction(draft, 0.7, quote.receipt, true)).ok, false);
  f.owner(owner); assert.equal(f.getCalls(), 0);
  f.source(false); assert.equal((await f.api.submitVideoGenerationAction(draft, 0.7, quote.receipt, true)).ok, false);
  assert.equal(f.getCalls(), 0); f.source(true);
  assert.equal((await f.api.submitVideoGenerationAction(draft, 0.7, quote.receipt, true)).ok, true);
  assert.equal(f.getCalls(), 1); assert.ok(f.getSourceReads() > 0);
});

test("used submission recovery does not need a live quote and never reaches the provider", async () => {
  const f = fixture();
  f.previous({ id: "job", status: "succeeded", clientSubmissionId: draft.clientSubmissionId });
  assert.equal((await f.api.quoteVideoSubmissionAction(draft)).status, "used");
  const recovered = await f.api.submitVideoGenerationAction(draft, 0, "");
  assert.ok(recovered.ok && recovered.duplicate); assert.equal(f.getCalls(), 0);
  assert.equal((await f.api.restoreVideoGenerationBySubmissionAction(draft.clientSubmissionId)).status, "success");
  assert.equal((await f.api.restoreLatestVideoGenerationAction()).status, "none");
  assert.equal(f.getCalls(), 0);
});

test("quote rejection paths return distinct reasons and safe structured diagnostics", async () => {
  const cases: Array<{ reason: string; configure(f: ReturnType<typeof fixture>): void; value?: unknown }> = [
    { reason: "not_allowlisted", configure: f => f.owner(null) },
    { reason: "invalid_draft", configure: () => {}, value: {} },
    { reason: "unsafe_motion", configure: f => f.fail("unsafe") },
    { reason: "already_used", configure: f => f.previous({ id: "job" }) },
    { reason: "policy_denied", configure: f => { f.env.VIDEO_BETA_TRANSACTION_APPROVALS_ENABLED = "false"; } },
    { reason: "snapshot_unavailable", configure: f => f.source(false) },
    { reason: "quote_unavailable", configure: f => f.fail("quote") },
    { reason: "repository_unavailable", configure: f => f.fail("repository") },
  ];
  for (const scenario of cases) {
    const f = fixture(); scenario.configure(f);
    const result = await f.api.quoteVideoSubmissionAction(scenario.value ?? draft);
    assert.notEqual(result.status, "success");
    if (result.status === "success") throw new Error("Expected rejection");
    assert.equal(result.reasonCode, scenario.reason);
    const log = f.logs.find(event => event.stage === "video_quote_submission");
    assert.equal(log?.result, "rejected");
    assert.equal(log?.fields.reasonCode, scenario.reason);
    if (scenario.reason === "policy_denied") assert.equal(log?.fields.condition, "beta_approvals_enabled");
    assert.equal(f.getCalls(), 0);
    assert.ok(!JSON.stringify(f.logs).includes("fixture-secret"));
  }
});

test("legacy active jobs recover without a configured submission UUID or a paid request", async () => {
  const f = fixture();
  f.previous({ id: "job", status: "processing", errorCode: null, clientSubmissionId: draft.clientSubmissionId });
  const restored = await f.api.restoreLatestVideoGenerationAction();
  assert.equal(restored.status, "success");
  if (restored.status === "success") assert.equal(restored.submissionId, draft.clientSubmissionId);
  assert.equal(f.getCalls(), 0);
  f.owner("40000000-0000-4000-8000-000000000004");
  assert.equal((await f.api.restoreLatestVideoGenerationAction()).status, "unavailable");
});

test("a newer completed job does not hide an owned active job during recovery", async () => {
  const f = fixture();
  f.history([{ id: "complete", status: "succeeded", errorCode: null, clientSubmissionId: owner },
    { id: "active", status: "processing", errorCode: null, clientSubmissionId: draft.clientSubmissionId }]);
  const result = await f.api.restoreLatestVideoGenerationAction();
  assert.equal(result.status, "success");
  if (result.status === "success") assert.equal(result.job.id, "active");
  assert.equal(f.getCalls(), 0);
});

test("a Director plan receipt is included in the signed request identity", async () => {
  const f = fixture();
  const directed = { ...draft, director: { presetId: "minimal-studio" as const, shotMode: "single" as const, receipt: "verified-plan" } };
  const quote = await f.api.quoteVideoSubmissionAction(directed);
  assert.equal(quote.status, "success"); if (quote.status !== "success") throw new Error("Missing quote.");
  const changed = { ...directed, director: { ...directed.director, receipt: "other-plan" } };
  assert.equal((await f.api.submitVideoGenerationAction(changed, quote.cost, quote.receipt, true)).ok, false);
  assert.equal(f.getCalls(), 0);
  assert.equal((await f.api.submitVideoGenerationAction(directed, quote.cost, quote.receipt, true)).ok, true);
  assert.equal(f.getCalls(), 1);
});

test("budget boundary fails closed for missing migration, used UUID and disabled server policy", async () => {
  const env: Record<string, string> = { VIDEO_BETA_ENABLED: "true", VIDEO_BETA_USER_IDS: owner, VIDEO_GENERATION_ENABLED: "true",
    VIDEO_BETA_TRANSACTION_APPROVALS_ENABLED: "true", VIDEO_BETA_MAX_COST_PER_REQUEST_USD: "0.70",
    VIDEO_BETA_ALLOWED_TIERS: "standard", VIDEO_BETA_ALLOWED_DURATIONS: "5" };
  let calls = 0, outcome: "created" | "used" | "missing" = "created";
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "@/lib/supabase/admin": { getSupabaseAdminClient: () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
      calls++; assert.equal(name, env.VIDEO_STUDIO_ENABLED === "true" ? "reserve_video_studio_budget_once" : "reserve_video_beta_budget_once"); assert.equal(args.p_submission, draft.clientSubmissionId);
      return outcome === "missing" ? { data: null, error: { code: "PGRST202" } } : { data: outcome === "created" ? "reservation-id" : null, error: null };
    } }) },
    "./beta-policy": { canAccessVideoBeta: (id: string) => canAccessVideoBeta(id, env), canSubmitVideoBeta: (id: string, value: VideoGenerationDraft, price: number) => canSubmitVideoBeta(id, value, price, env) },
    "./capabilities": { videoEndpointCapabilities, videoTierRouting }, "./supabase-repository": {}, "./reconciliation": {},
    "./fal-provider": {}, "./output": {}, "./money": {},
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync("src/lib/video-generation/beta-runtime.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, process: { env }, require: (name: string) => {
    if (!(name in mocks)) throw new Error(`Unmocked dependency: ${name}`); return mocks[name];
  } });
  const Budget = (exports as { VideoBetaBudget: typeof VideoBetaBudget }).VideoBetaBudget;
  const budget = new Budget();
  assert.equal((await budget.reserve(owner, "30000000-0000-4000-8000-000000000003", 0.7, draft)).ok, false);
  env.VIDEO_BETA_TRANSACTION_APPROVALS_ENABLED = "false";
  assert.equal((await budget.reserve(owner, draft.clientSubmissionId, 0.7, draft)).ok, false); assert.equal(calls, 0);
  env.VIDEO_BETA_TRANSACTION_APPROVALS_ENABLED = "true";
  assert.equal((await budget.reserve(owner, draft.clientSubmissionId, 0.7, draft)).ok, true);
  outcome = "used"; assert.equal((await budget.reserve(owner, draft.clientSubmissionId, 0.7, draft)).ok, false);
  outcome = "missing"; assert.equal((await budget.reserve(owner, draft.clientSubmissionId, 0.7, draft)).ok, false);
  assert.equal(calls, 3);
  Object.assign(env, { VIDEO_STUDIO_ENABLED: "true", VIDEO_STUDIO_SPENDING_ENABLED: "true", VIDEO_STUDIO_USER_IDS: owner });
  outcome = "created";
  assert.equal((await budget.reserve(owner, draft.clientSubmissionId, 0.7, draft)).ok, true);
  assert.equal(calls, 4);
});
