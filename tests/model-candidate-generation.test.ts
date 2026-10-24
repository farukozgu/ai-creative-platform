import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { generateModelCandidate } from "@/lib/models/candidate-generation";
import { emptyModelAppearanceDraft } from "@/features/models/model-profile";
import type { CandidateProvider } from "@/lib/models/candidate-engine";

const user = "10000000-0000-4000-8000-000000000001";
const model = "20000000-0000-4000-8000-000000000001";
const appearance = { ...emptyModelAppearanceDraft, name: "Adult", gender: "female", ageRange: "25–34", presentation: "Feminine", skinTone: "Medium", hairColor: "Brown", hairstyle: "Long", eyeColor: "Green", silhouette: "Balanced", visualStyle: "Natural" };

function harness(options: { owner?: boolean; status?: string; fail?: string } = {}) {
  const tables: Record<string, Record<string, unknown>[]> = { model_candidate_jobs: [], model_candidates: [], model_reference_assets: [] };
  const uploads: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const respond = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
    if (url.pathname.includes("/storage/")) {
      if (options.fail === "upload") return respond({ message: "failed" }, 500);
      uploads.push(url.pathname);
      return respond({ Key: url.pathname });
    }
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    const table = url.pathname.split("/").at(-1)!;
    if (table === "model_profiles") {
      assert.equal(url.searchParams.get("user_id"), `eq.${user}`);
      assert.equal(url.searchParams.get("id"), `eq.${model}`);
      return respond(options.owner === false ? null : { name: appearance.name, notes: "", appearance, status: options.status ?? "draft" });
    }
    if (options.fail === table) return respond({ code: "XX000", message: "failed" }, 500);
    if (method === "POST") {
      if (table === "model_candidate_jobs" && tables[table].length) return respond({ code: "23505", message: "duplicate" }, 409);
      tables[table].push(body);
      return respond(null, 201);
    }
    if (method === "PATCH") {
      assert.equal(url.searchParams.get("user_id"), `eq.${user}`);
      assert.equal(url.searchParams.get("model_id"), `eq.${model}`);
      const row = tables[table].find(item => `eq.${item.id}` === url.searchParams.get("id"));
      assert.ok(row);
      Object.assign(row, body);
      return respond(row);
    }
    throw new Error(`Unexpected ${method} ${table}`);
  };
  return { admin: createClient("https://example.supabase.co", "test-only-secret", { global: { fetch: fetcher } }), tables, uploads };
}

const image = () => sharp({ create: { width: 1024, height: 1280, channels: 3, background: "white" } }).png().toBuffer();
function provider(generate: CandidateProvider["generate"]): CandidateProvider { return { generate }; }

test("ownership and non-draft rejection never reach the provider or write jobs", async () => {
  for (const options of [{ owner: false }, { status: "archived" }, { status: "approved" }]) {
    const h = harness(options);
    assert.equal(await generateModelCandidate(h.admin, provider(async () => { throw new Error("must not run"); }), user, model), "invalid");
    assert.equal(h.tables.model_candidate_jobs.length, 0);
  }
});

test("concurrent and repeated submissions make one provider call and persist one private candidate", async () => {
  const h = harness();
  let calls = 0;
  const p = provider(async request => {
    calls++;
    assert.equal(request.count, 1);
    for (const trait of ["female", "25–34", "Brown", "Green", "Medium"]) assert.ok(request.prompt.includes(trait));
    return { imageData: await image(), mimeType: "image/png", providerRequestId: "request-test", usage: undefined };
  });
  const results = await Promise.all([generateModelCandidate(h.admin, p, user, model), generateModelCandidate(h.admin, p, user, model)]);
  assert.deepEqual(results.sort(), ["duplicate", "success"]);
  assert.equal(await generateModelCandidate(h.admin, p, user, model), "duplicate");
  assert.equal(calls, 1);
  assert.equal(h.tables.model_candidates.length, 1);
  assert.equal(h.tables.model_candidates[0].status, "ready");
  assert.equal(h.tables.model_candidate_jobs[0].status, "succeeded");
  assert.equal(h.tables.model_candidate_jobs[0].submission_state, "persisted");
  assert.equal(h.tables.model_reference_assets[0].id, h.tables.model_candidates[0].primary_reference_asset_id);
  assert.equal(h.tables.model_reference_assets[0].bucket_id, "model-reference-assets");
  assert.ok(String(h.tables.model_reference_assets[0].object_path).startsWith(`${user}/${model}/candidate-`));
  assert.equal(h.uploads.length, 1);
});

test("provider uncertainty is persisted and cannot trigger another paid call", async () => {
  const h = harness(); let calls = 0;
  const p = provider(async () => { calls++; throw new Error("timeout with secret details"); });
  assert.equal(await generateModelCandidate(h.admin, p, user, model), "error");
  assert.equal(h.tables.model_candidate_jobs[0].status, "ambiguous");
  assert.equal(h.tables.model_candidate_jobs[0].submission_state, "ambiguous");
  assert.equal(h.tables.model_candidate_jobs[0].error_code, "provider_outcome_unknown");
  assert.equal(h.tables.model_candidates[0].status, "failed");
  assert.equal(await generateModelCandidate(h.admin, p, user, model), "duplicate");
  assert.equal(calls, 1);
});

test("invalid images, upload and metadata failures do not report success", async () => {
  for (const fail of ["invalid", "upload", "model_reference_assets"]) {
    const h = harness({ fail });
    const p = provider(async () => ({ imageData: fail === "invalid" ? Buffer.from("invalid") : await image(), mimeType: "image/png", providerRequestId: null, usage: undefined }));
    assert.equal(await generateModelCandidate(h.admin, p, user, model), "error");
    assert.equal(h.tables.model_candidate_jobs[0].status, "failed");
    assert.equal(h.tables.model_candidates[0].status, "failed");
    assert.equal(h.tables.model_candidates[0].primary_reference_asset_id, undefined);
  }
});

test("private serving remains authenticated, owner filtered and non-cacheable", () => {
  const route = readFileSync("src/app/api/model-reference/[referenceId]/route.ts", "utf8");
  assert.match(route, /if \(!userId\) return new Response\(null, \{ status: 404 \}\)/);
  assert.match(route, /\.eq\("user_id", userId\)/);
  assert.match(route, /private, no-store/);
  const adapter = readFileSync("src/lib/models/candidate-openai-provider.ts", "utf8");
  assert.match(adapter, /import "server-only"/);
  assert.match(adapter, /images.generate/);
  assert.match(adapter, /maxRetries: 0/);
});

test("reference route denies unauthenticated and foreign assets and serves owned images privately", async () => {
  const source = ts.transpileModule(readFileSync("src/app/api/model-reference/[referenceId]/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const scenario of ["unauthenticated", "foreign", "owned"] as const) {
    let queries = 0, downloads = 0;
    const exported: { GET?: (request: Request, context: { params: Promise<{ referenceId: string }> }) => Promise<Response> } = {};
    const query = {
      select() { queries++; return this; },
      eq(key: string, value: string) { if (key === "user_id") assert.equal(value, user); return this; },
      async maybeSingle() { return { data: scenario === "owned" ? { bucket_id: "model-reference-assets", object_path: "private/path", mime_type: "image/png" } : null, error: null }; },
    };
    runInNewContext(source, {
      exports: exported, Response,
      require: (id: string) => {
        if (id.includes("require-user")) return { getAuthenticatedUserId: async () => scenario === "unauthenticated" ? null : user };
        if (id.includes("supabase/server")) return { createClient: async () => ({ from: () => query, storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://private.example/image" }, error: null }) }) } }) };
        throw new Error(`Unexpected import ${id}`);
      },
      fetch: async () => { downloads++; return new Response("image-bytes"); },
    });
    const response = await exported.GET!(new Request("https://app.example"), { params: Promise.resolve({ referenceId: model }) });
    assert.equal(response.status, scenario === "owned" ? 200 : 404);
    assert.equal(downloads, scenario === "owned" ? 1 : 0);
    if (scenario === "unauthenticated") assert.equal(queries, 0);
    if (scenario === "owned") {
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      assert.equal(await response.text(), "image-bytes");
    }
  }
});
