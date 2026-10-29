/** Opt-in, fixture-only real development RPC test. Never calls a provider. */
import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const project = "fnzrnlvpkzwztccqzyzf";
const owner = "d29b49fd-b6fb-40f5-81ab-22b34ebca492";
const submission = "d29b49fd-b6fb-40f5-81ab-22b34ebca493";
const source = "d29b49fd-b6fb-40f5-81ab-22b34ebca494";
assert.equal(process.env.VIDEO_QA_PROJECT_REF, project, "Explicit development target required");
assert.equal(process.env.VIDEO_QA_ALLOW_DEV_FIXTURE_RPC, "true", "Explicit fixture-RPC opt-in required");
const rpc = process.env.VIDEO_QA_RESERVATION_RPC ?? "reserve_video_studio_budget_once";
assert.ok(["reserve_video_studio_budget_once", "reserve_video_beta_budget_once"].includes(rpc));
const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
assert.equal(url.origin, `https://${project}.supabase.co`, "Refusing another environment");
const key = process.env.SUPABASE_SECRET_KEY;
assert.ok(key, "Development service credential unavailable");
let posts = 0;
const client = createClient(url.origin, key, { auth: { persistSession: false, autoRefreshToken: false }, global: {
  fetch: async (target, init) => {
    const address = new URL(String(target));
    assert.equal(address.origin, url.origin, "Unexpected HTTP destination blocked");
    const method = init?.method?.toUpperCase() ?? "GET";
    if (method === "POST") {
      assert.equal(address.pathname, `/rest/v1/rpc/${rpc}`);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.p_owner, owner); assert.equal(body.p_submission, submission);
      assert.equal(body.p_cost, 0.000001);
      posts++;
    } else {
      assert.equal(method, "GET");
      assert.ok(address.pathname === "/rest/v1/video_source_assets"
        || address.pathname === "/rest/v1/video_beta_reservations");
      if (address.pathname.startsWith("/rest/")) {
        assert.equal(address.searchParams.get("owner_id"), `eq.${owner}`);
        if (address.pathname.endsWith("video_source_assets")) assert.equal(address.searchParams.get("id"), `eq.${source}`);
        else assert.equal(address.searchParams.get("submission_id"), `eq.${submission}`);
      }
    }
    return fetch(target, { ...init, redirect: "error", signal: AbortSignal.timeout(15_000) });
  },
} });
// The fixture is created/cleaned separately with identity-checked SQL. This script
// cannot create users, delete data, edit policy, migrate schemas or submit Kling.
async function main() {
const fixture = await client.from("video_source_assets").select("object_path").eq("id", source).eq("owner_id", owner).single();
assert.equal(fixture.error, null, "Isolated fixture lookup failed");
assert.equal(fixture.data?.object_path, `${owner}/${source}/source.png`, "Refusing a non-fixture source");
const before = await client.from("video_beta_reservations").select("id").eq("owner_id", owner).eq("submission_id", submission);
assert.equal(before.error, null); assert.equal(before.data?.length, 0, "Fixture submission already used");
const started = performance.now();
const attempts = await Promise.all(Array.from({ length: 8 }, () => client.rpc(rpc, {
  p_owner: owner, p_submission: submission, p_cost: 0.000001, p_tier: "standard", p_duration: 5,
})));
for (const result of attempts) assert.equal(result.error, null, `RPC failed: ${result.error?.code ?? "unknown"}`);
const winners = attempts.filter(result => typeof result.data === "string");
assert.equal(winners.length, 1, "Expected exactly one admission");
assert.equal(attempts.filter(result => result.data === null).length, 7);
const after = await client.from("video_beta_reservations").select("id").eq("owner_id", owner).eq("submission_id", submission);
assert.equal(after.error, null); assert.equal(after.data?.length, 1);
assert.equal(after.data?.[0].id, winners[0].data);
assert.equal(posts, 8, "Unexpected SDK POST retry");
assert.ok(after.data);
console.log(JSON.stringify({ project: "creative-ai-dev", rpc, concurrentRequests: posts, admissions: winners.length,
  ledgerRows: after.data.length, providerRequests: 0, elapsedMs: Math.round(performance.now() - started),
  cleanup: "Caller must run identity-checked fixture cleanup SQL", result: "PASS" }));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Development RPC verification failed"); process.exitCode = 1; });
