import assert from "node:assert/strict";
import test from "node:test";
import OpenAI, { toFile } from "openai";
import { getOpenAIBetaPolicy, getVideoStudioOpenAIPolicy } from "../src/lib/openai/beta-policy";
import { createOpenAIBetaFetch } from "../src/lib/openai/beta-transport";
import { classifyOpenAIBudgetRpcFailure, OpenAIBudgetError } from "../src/lib/openai/budget-error";

const user = "10000000-0000-4000-8000-000000000001";
const env = { OPENAI_BETA_ENABLED: "true", OPENAI_BETA_USER_IDS: user };
const image = { model: "gpt-image-2.5-sunburst", prompt: "Product campaign", n: 1, quality: "high", size: "1024x1024", output_format: "png" };

function harness(options: { owner?: string | null; allow?: boolean; status?: number; networkFailure?: boolean; env?: Record<string, string> } = {}) {
  let calls = 0, reservations = 0;
  const bodies: unknown[] = [];
  const guarded = createOpenAIBetaFetch({
    env: options.env ?? env,
    authenticate: async () => options.owner === undefined ? user : options.owner,
    reserve: async (owner, kind, limits) => {
      assert.equal(owner, user); assert.ok(["image", "analysis"].includes(kind));
      assert.ok(limits.user > 0 && limits.global > 0); reservations++;
      return options.allow !== false;
    },
    send: async (_input, init) => {
      calls++; assert.equal(init?.redirect, "error"); bodies.push(init?.body);
      if (options.networkFailure) throw new TypeError("test network failure");
      return Response.json({ data: [{ b64_json: "test-image" }], output: [] }, { status: options.status ?? 200 });
    },
  });
  return { guarded, calls: () => calls, reservations: () => reservations, bodies };
}

test("beta policy denies missing flags, wildcards, foreign users and malformed ceilings", () => {
  for (const config of [{}, { ...env, OPENAI_BETA_ENABLED: "false" }, { ...env, OPENAI_BETA_USER_IDS: "*" },
    { ...env, OPENAI_BETA_USER_IDS: `${user},bad` }, { ...env, OPENAI_BETA_USER_DAILY_IMAGES: "-1" },
    { ...env, OPENAI_BETA_GLOBAL_DAILY_IMAGES: "Infinity" }, { ...env, OPENAI_BETA_USER_DAILY_IMAGES: "1.5" }]) {
    assert.equal(getOpenAIBetaPolicy(user, config), null);
  }
  assert.equal(getOpenAIBetaPolicy("20000000-0000-4000-8000-000000000001", env), null);
  assert.deepEqual(getOpenAIBetaPolicy(user, env)?.limits.image, { user: 4, global: 20 });
});

test("quota RPC errors distinguish a missing function from transient service failures", () => {
  assert.equal(classifyOpenAIBudgetRpcFailure({ code: "PGRST202", message: "function missing" }), "configuration_error");
  assert.equal(classifyOpenAIBudgetRpcFailure({ message: "function public.consume_openai_beta_request not found in schema cache" }), "configuration_error");
  assert.equal(classifyOpenAIBudgetRpcFailure({ code: "57014", message: "statement timeout" }), "budget_unavailable");
});

test("Video Studio analysis policy uses authenticated Studio access and shared quotas without a separate beta allowlist", () => {
  const studio = { VIDEO_STUDIO_ENABLED: "true", VIDEO_STUDIO_ACCESS_MODE: "authenticated" };
  const policy = getVideoStudioOpenAIPolicy(user, "gpt-4o-mini", studio);
  assert.deepEqual(policy?.limits.analysis, { user: 24, global: 120 });
  assert.deepEqual(policy?.analysisModels, ["gpt-4o-mini"]);
  assert.equal(getVideoStudioOpenAIPolicy(user, "gpt-4.1", studio), null);
  assert.equal(getVideoStudioOpenAIPolicy("20000000-0000-4000-8000-000000000001", "gpt-4o-mini", {
    VIDEO_STUDIO_ENABLED: "true", VIDEO_STUDIO_ACCESS_MODE: "allowlist", VIDEO_STUDIO_USER_IDS: user,
  }), null);
  assert.equal(getVideoStudioOpenAIPolicy(user, "gpt-4o-mini", { ...studio, OPENAI_BETA_USER_DAILY_ANALYSES: "0" })?.limits.analysis.user, 0);
});

test("Video Director transport reserves shared quota before sending without OpenAI beta flags", async () => {
  let reservations = 0, providerCalls = 0;
  const policy = getVideoStudioOpenAIPolicy(user, "gpt-4o-mini", {
    VIDEO_STUDIO_ENABLED: "true", VIDEO_STUDIO_ACCESS_MODE: "authenticated",
  });
  assert.ok(policy);
  const guarded = createOpenAIBetaFetch({
    env: { VIDEO_STUDIO_ENABLED: "true", VIDEO_STUDIO_ACCESS_MODE: "authenticated" },
    authenticate: async () => user,
    reserve: async (_owner, kind, limits) => { assert.equal(kind, "analysis"); assert.ok(limits.user > 0 && limits.global > 0); reservations++; return true; },
    policyForUser: () => policy,
    send: async (_input, init) => { providerCalls++; return Response.json({ output_text: "fixture" }, { status: 200, headers: { "x-request-body-present": String(Boolean(init?.body)) } }); },
  });
  const response = await guarded("https://api.openai.com/v1/responses", {
    method: "POST", body: JSON.stringify({ model: "gpt-4o-mini", input: "fixture", max_output_tokens: 2200 }),
  });
  assert.equal(response.status, 200);
  assert.equal(reservations, 1);
  assert.equal(providerCalls, 1);
});

test("Director output ceiling is bounded and still reserves quota before provider calls", async () => {
  const studio = { VIDEO_STUDIO_ENABLED: "true", VIDEO_STUDIO_ACCESS_MODE: "authenticated" };
  const policy = getVideoStudioOpenAIPolicy(user, "gpt-4o-mini", studio);
  let reservations = 0, calls = 0, allow = true;
  const guarded = createOpenAIBetaFetch({ env: studio, authenticate: async () => user,
    policyForUser: () => policy, analysisMaxOutputTokens: 4000,
    reserve: async () => { reservations++; return allow; },
    send: async () => { calls++; return Response.json({}); },
  });
  const request = (tokens: number) => guarded("https://api.openai.com/v1/responses", {
    method: "POST", body: JSON.stringify({ model: "gpt-4o-mini", input: "fixture", max_output_tokens: tokens }),
  });
  await request(4000);
  await assert.rejects(request(4001));
  allow = false;
  await assert.rejects(request(4000));
  assert.equal(calls, 1);
  assert.equal(reservations, 2);
  const ordinary = harness();
  await assert.rejects(ordinary.guarded("https://api.openai.com/v1/responses", {
    method: "POST", body: JSON.stringify({ model: "gpt-4o-mini", input: "fixture", max_output_tokens: 4000 }),
  }));
  assert.equal(ordinary.reservations(), 0);
});

test("offline Director chat path remains opt-in, strict and quota guarded", async () => {
  const request = { model: "gpt-4o-mini", messages: [{ role: "user", content: "fixture" }], max_completion_tokens: 4000,
    response_format: { type: "json_schema", json_schema: { name: "fixture", strict: true, schema: {} } } };
  const ordinary = harness();
  await assert.rejects(ordinary.guarded("https://api.openai.com/v1/chat/completions", { method: "POST", body: JSON.stringify(request) }));
  const studio = { VIDEO_STUDIO_ENABLED: "true", VIDEO_STUDIO_ACCESS_MODE: "authenticated" };
  let calls = 0, reservations = 0;
  const guarded = createOpenAIBetaFetch({ env: studio, authenticate: async () => user,
    policyForUser: () => getVideoStudioOpenAIPolicy(user, "gpt-4o-mini", studio), analysisMaxOutputTokens: 4000, allowDirectorChat: true,
    reserve: async () => { reservations++; return false; }, send: async () => { calls++; return Response.json({}); } });
  for (const patch of [{ max_completion_tokens: 4001 }, { tools: [{ type: "function" }] }, { response_format: { type: "json_object" } }]) {
    await assert.rejects(guarded("https://api.openai.com/v1/chat/completions", { method: "POST", body: JSON.stringify({ ...request, ...patch }) }));
  }
  assert.equal(reservations, 0);
  await assert.rejects(guarded("https://api.openai.com/v1/chat/completions", { method: "POST", body: JSON.stringify(request) }));
  assert.equal(reservations, 1);
  assert.equal(calls, 0);
});

test("all OpenAI endpoints deny unauthorized users and unavailable atomic quota before provider I/O", async () => {
  for (const options of [{ owner: null }, { env: {} }, { allow: false }]) {
    const h = harness(options);
    await assert.rejects(h.guarded("https://api.openai.com/v1/images/generations", { method: "POST", body: JSON.stringify(image) }));
    assert.equal(h.calls(), 0);
  }
  const h = harness();
  for (const url of ["https://evil.invalid/v1/images/generations", "https://api.openai.com/v1/files", "https://api.openai.com/v1/images/generations?override=1"]) {
    await assert.rejects(h.guarded(url, { method: "POST", body: JSON.stringify(image) }));
  }
  assert.equal(h.calls(), 0); assert.equal(h.reservations(), 0);
});

test("OpenAI SDK preserves a safe budget configuration failure without provider I/O", async () => {
  let providerCalls = 0;
  const guarded = createOpenAIBetaFetch({ env, authenticate: async () => user,
    reserve: async () => { throw new OpenAIBudgetError("configuration_error"); },
    send: async () => { providerCalls++; return Response.json({ output_text: "should not run" }); } });
  const client = new OpenAI({ apiKey: "test-only-never-live", maxRetries: 0, fetch: guarded });
  let current: unknown;
  try {
    await client.responses.create({ model: "gpt-4o-mini", input: "fixture" });
    assert.fail("budget gate should reject before provider I/O");
  } catch (error) { current = error; }
  const seen = new Set<unknown>();
  let found = false;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const value = current as { budgetFailure?: unknown; cause?: unknown };
    if (value.budgetFailure === "configuration_error") found = true;
    current = value.cause;
  }
  assert.equal(found, true);
  assert.equal(providerCalls, 0);
});

test("image calls cannot expand model, count, resolution, quality or unbounded payload controls", async () => {
  const h = harness();
  for (const patch of [{ n: 2 }, { model: "unapproved" }, { size: "auto" }, { quality: "max" }, { prompt: "x".repeat(64_001) }, { tools: [{}] }]) {
    await assert.rejects(h.guarded("https://api.openai.com/v1/images/generations", { method: "POST", body: JSON.stringify({ ...image, ...patch }) }));
  }
  assert.equal(h.reservations(), 0); assert.equal(h.calls(), 0);
});

test("analysis receives a bounded output and never gains tools, background context or arbitrary models", async () => {
  const h = harness();
  const request = { model: "gpt-4.1-mini", input: "Check the edit" };
  await h.guarded("https://api.openai.com/v1/responses", { method: "POST", body: JSON.stringify(request) });
  assert.equal(JSON.parse(String(h.bodies[0])).max_output_tokens, 2200);
  assert.equal(JSON.parse(String(h.bodies[0])).store, false);
  for (const patch of [{ max_output_tokens: 99999 }, { tools: [{ type: "web_search" }] }, { model: "unapproved" }, { background: true }, { previous_response_id: "old" }]) {
    await assert.rejects(h.guarded("https://api.openai.com/v1/responses", { method: "POST", body: JSON.stringify({ ...request, ...patch }) }));
  }
  assert.equal(h.calls(), 1);
});

test("installed SDK multipart edits retain their original image payload behind the shared budget", async () => {
  const h = harness();
  const client = new OpenAI({ apiKey: "test-only-never-live", maxRetries: 0, fetch: h.guarded });
  await client.images.edit({ ...image, n: 1, size: "1024x1024", quality: "high", output_format: "png",
    image: await toFile(Buffer.from("fake-png"), "source.png", { type: "image/png" }) });
  assert.equal(h.calls(), 1); assert.equal(h.reservations(), 1);
  assert.ok(h.bodies[0] instanceof FormData);
});

test("installed SDK does not repeat charged submissions on server errors or uncertain network outcomes", async () => {
  for (const options of [{ status: 429 }, { status: 503 }, { networkFailure: true }]) {
    const h = harness(options);
    const client = new OpenAI({ apiKey: "test-only-never-live", maxRetries: 0, fetch: h.guarded });
    await assert.rejects(client.images.generate({ ...image, n: 1, size: "1024x1024", quality: "high", output_format: "png" }));
    assert.equal(h.reservations(), 1); assert.equal(h.calls(), 1);
  }
});
