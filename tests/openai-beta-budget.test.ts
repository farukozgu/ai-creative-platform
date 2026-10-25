import assert from "node:assert/strict";
import test from "node:test";
import OpenAI, { toFile } from "openai";
import { getOpenAIBetaPolicy } from "../src/lib/openai/beta-policy";
import { createOpenAIBetaFetch } from "../src/lib/openai/beta-transport";

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
