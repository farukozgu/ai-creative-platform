import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PRODUCT_PROFILE_ANALYSIS_VERSION, PRODUCT_PROFILE_SCHEMA_VERSION } from "../src/lib/product-understanding/product-profile";
import { analyzeVideoProductSource, type VideoProductAnalysisClaim, type VideoProductAnalysisStore } from "../src/lib/video-generation/video-product-analysis-core";
import { directorProducts } from "./fixtures/video-director-fixtures";

const owner = "10000000-0000-4000-8000-000000000001";
const source = "20000000-0000-4000-8000-000000000001";
const hash = "a".repeat(64);

class CacheHarness implements VideoProductAnalysisStore {
  rows = new Map<string, { state: string; profile: unknown; failureCode: string | null; inferredCategory: string | null }>();
  claims: Array<{ sourceAssetId: string; sha256: string; analysisVersion: string; schemaVersion: number; model: string }> = [];
  async claim(input: Parameters<VideoProductAnalysisStore["claim"]>[0]): Promise<VideoProductAnalysisClaim> {
    this.claims.push(input);
    const key = `${input.ownerId}:${input.sha256}:${input.analysisVersion}:${input.schemaVersion}:${input.model}`;
    const row = this.rows.get(key);
    if (row?.state === "supported") return { kind: "supported", profile: row.profile };
    if (row?.state === "unsupported") return { kind: "unsupported", inferredCategory: row.inferredCategory };
    if (row?.state === "failed_transient") return { kind: "retry_wait", failureCode: row.failureCode };
    if (row?.state === "analyzing") return { kind: "pending" };
    this.rows.set(key, { state: "analyzing", profile: null, failureCode: null, inferredCategory: null });
    return { kind: "claimed", id: key, leaseToken: input.leaseToken };
  }
  async complete(input: Parameters<VideoProductAnalysisStore["complete"]>[0]) {
    this.rows.set(input.id, { state: input.status, profile: input.profile, failureCode: input.failureCode, inferredCategory: input.inferredCategory });
    return true;
  }
}

const dependencies = (store: CacheHarness, analyze: Parameters<typeof analyzeVideoProductSource>[1]["analyze"], token = "lease") => ({
  store, analyze, makeLeaseToken: () => token, now: () => 1_800_000_000_000,
});

test("supported profiles persist by owner/hash/model/version and a second request is a cache hit", async () => {
  const store = new CacheHarness(); let calls = 0;
  const analyze = async ({ sourceAssetId }: { sourceAssetId: string }) => {
    calls++;
    return { output: { ...directorProducts[0], productId: sourceAssetId, schemaVersion: PRODUCT_PROFILE_SCHEMA_VERSION,
      analysisVersion: PRODUCT_PROFILE_ANALYSIS_VERSION, source: { model: "gpt-4o-mini", analysisVersion: PRODUCT_PROFILE_ANALYSIS_VERSION, analyzedAt: "2026-10-28T00:00:00.000Z" } } };
  };
  const input = { ownerId: owner, sourceAssetId: source, sha256: hash, model: "gpt-4o-mini", image: Buffer.from("fixture") };
  const first = await analyzeVideoProductSource(input, dependencies(store, analyze));
  const second = await analyzeVideoProductSource({ ...input, sourceAssetId: "30000000-0000-4000-8000-000000000001" }, dependencies(store, analyze, "other"));
  assert.equal(first.status, "supported");
  assert.equal(second.status, "supported");
  assert.equal(second.profile?.productId, "30000000-0000-4000-8000-000000000001");
  assert.equal(calls, 1);
  assert.equal(store.claims[0].analysisVersion, PRODUCT_PROFILE_ANALYSIS_VERSION);
  assert.equal(store.claims[0].schemaVersion, PRODUCT_PROFILE_SCHEMA_VERSION);
});

test("parallel claims coalesce and quota rejection is surfaced without a false profile", async () => {
  const store = new CacheHarness(); let release!: () => void; let calls = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const analyze = async () => { calls++; await gate; return { output: null, errorPaths: ["$"] }; };
  const input = { ownerId: owner, sourceAssetId: source, sha256: hash, model: "gpt-4o-mini", image: Buffer.from("fixture") };
  const first = analyzeVideoProductSource(input, dependencies(store, analyze));
  const concurrent = await analyzeVideoProductSource(input, dependencies(store, analyze, "lease-2"));
  assert.equal(concurrent.status, "pending");
  release();
  await first;
  assert.equal(calls, 1);

  const quotaStore = new CacheHarness();
  const quota = await analyzeVideoProductSource(input, dependencies(quotaStore, async () => {
    throw new Error("SDK transport failed", { cause: { name: "OpenAIBudgetError", budgetFailure: "quota_limited" } });
  }));
  const repeated = await analyzeVideoProductSource(input, dependencies(quotaStore, async () => { throw new Error("must stay in retry window"); }, "retry"));
  assert.deepEqual([quota.status, quota.profile], ["quota_limited", null]);
  assert.deepEqual([repeated.status, repeated.profile], ["quota_limited", null]);
});

test("budget configuration and transient reservation failures retain distinct safe statuses", async () => {
  const input = { ownerId: owner, sourceAssetId: source, sha256: hash, model: "gpt-4o-mini", image: Buffer.from("fixture") };
  for (const failure of ["configuration_error", "budget_unavailable"] as const) {
    const store = new CacheHarness();
    const result = await analyzeVideoProductSource(input, dependencies(store, async () => {
      throw new Error("SDK transport failed", { cause: { name: "OpenAIBudgetError", budgetFailure: failure } });
    }));
    assert.equal(result.status, failure);
    assert.equal(store.rows.values().next().value?.failureCode, failure);
    const retry = await analyzeVideoProductSource(input, dependencies(store, async () => { throw new Error("must remain cached"); }, "retry"));
    assert.equal(retry.status, failure);
  }
});

test("unsupported results are cached and the same content cannot expose another owner's profile", async () => {
  const store = new CacheHarness(); let calls = 0;
  const input = { ownerId: owner, sourceAssetId: source, sha256: hash, model: "gpt-4o-mini", image: Buffer.from("fixture") };
  const unsupported = await analyzeVideoProductSource(input, dependencies(store, async () => {
    calls++; return { output: { status: "unsupported", inferredCategory: "ceramic mug", unsupportedReason: "Outside supported product profile categories." } };
  }));
  const repeatedUnsupported = await analyzeVideoProductSource(input, dependencies(store, async () => { calls++; return null; }, "retry"));
  assert.equal(unsupported.status, "unsupported");
  assert.equal(repeatedUnsupported.status, "unsupported");
  assert.equal(calls, 1);
  const otherOwner = await analyzeVideoProductSource({ ...input, ownerId: "40000000-0000-4000-8000-000000000001" }, dependencies(store, async () => {
    calls++; return { output: { ...directorProducts[0], productId: source, schemaVersion: PRODUCT_PROFILE_SCHEMA_VERSION,
      analysisVersion: PRODUCT_PROFILE_ANALYSIS_VERSION, source: { model: "gpt-4o-mini", analysisVersion: PRODUCT_PROFILE_ANALYSIS_VERSION, analyzedAt: "2026-10-28T00:00:00.000Z" } } };
  }, "other-owner"));
  assert.equal(otherOwner.status, "supported");
  assert.equal(calls, 2);
});

test("prepared migration binds cache to owned source, hash/version, private access and fenced leases", () => {
  const sql = readFileSync("database/migrations/20261106000000_add_video_product_understanding_cache.sql", "utf8");
  for (const fragment of ["source_asset_id uuid not null references public.video_source_assets(id)", "owner_id uuid not null references auth.users(id)",
    "source_sha256 text not null", "analyzer_version text not null", "schema_version integer not null", "model text not null",
    "enable row level security", "revoke all on public.video_product_analysis_cache", "s.owner_id = p_owner",
    "c.lease_token = p_lease_token", "interval '15 minutes'"]) assert.ok(sql.includes(fragment), fragment);
  const core = readFileSync("src/lib/video-generation/video-product-analysis-core.ts", "utf8");
  assert.ok(core.includes("6 * 60 * 60 * 1000"));
});
