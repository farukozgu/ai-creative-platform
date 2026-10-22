import assert from "node:assert/strict";
import test from "node:test";

import { runManualProductReanalysis, type ProductReanalysisAdmissionGateway } from "../src/lib/product-understanding/product-reanalysis-service";
import type { ProductAnalysisResult } from "../src/lib/product-understanding/analyze-product-asset";
import type { ProductReanalysisAdmissionState, ProductReanalysisTransition } from "../src/lib/product-understanding/product-reanalysis-admission-contract";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const assetA = "33333333-3333-4333-8333-333333333333";
const assetB = "44444444-4444-4444-8444-444444444444";
type State = ProductReanalysisAdmissionState;
type Entry = { owner: string; state: State; version: number };

/** Deterministic model of the owner-serialized PostgreSQL RPC transaction. */
class AdmissionHarness implements ProductReanalysisAdmissionGateway {
  private entries = new Map<string, Entry>();
  constructor(private readonly limit = 1, private readonly unavailable = false) {}
  private key(owner: string, asset: string) { return `${owner}:${asset}`; }
  async admit({ ownerId, assetId }: { ownerId: string; assetId: string }) {
    if (this.unavailable || assetId === "forbidden") return { kind: "rejected" as const, reason: this.unavailable ? "unavailable" as const : "unauthorized" as const };
    const key = this.key(ownerId, assetId); const existing = this.entries.get(key);
    if (existing) {
      if (existing.state === "failed_pre_provider") { existing.state = "admitted"; existing.version++; return { kind: "admitted" as const, admissionId: key, leaseToken: `lease-${existing.version}`, leaseVersion: existing.version }; }
      return { kind: "replay" as const, state: existing.state };
    }
    const active = [...this.entries.values()].filter((entry) => entry.owner === ownerId && !["completed", "failed_pre_provider"].includes(entry.state)).length;
    if (active >= this.limit) return { kind: "rejected" as const, reason: "capacity" as const };
    this.entries.set(key, { owner: ownerId, state: "admitted", version: 1 });
    return { kind: "admitted" as const, admissionId: key, leaseToken: "lease-1", leaseVersion: 1 };
  }
  async transition(input: ProductReanalysisTransition) {
    const entry = this.entries.get(input.admissionId);
    if (!entry || entry.version !== input.leaseVersion) return false;
    entry.state = input.state; return true;
  }
}

function fakeAnalyzer(mode: "success" | "pre_failure" | "timeout") {
  let calls = 0;
  const analyze = async (input: Parameters<Parameters<typeof runManualProductReanalysis>[1]["analyze"]>[0]): Promise<ProductAnalysisResult> => {
    calls++;
    if (mode === "pre_failure") return { status: "failed", reason: "asset_unavailable" };
    if (!await input.providerLifecycle.beforeProviderSubmission()) return { status: "failed", reason: "analysis_failed" };
    if (mode === "timeout") return { status: "failed", reason: "analysis_failed" };
    if (!await input.providerLifecycle.providerResponseReceived()) return { status: "failed", reason: "analysis_failed" };
    return { status: "unsupported", inferredCategory: null, unsupportedReason: "fixture", reason: "unsupported_product" };
  };
  return { analyze, calls: () => calls };
}

test("concurrent identical asset submissions result in one admission and one replay", async () => {
  const gateway = new AdmissionHarness(); const fake = fakeAnalyzer("success");
  const results = await Promise.all([runManualProductReanalysis({ ownerId: ownerA, assetId: assetA }, { gateway, analyze: fake.analyze }), runManualProductReanalysis({ ownerId: ownerA, assetId: assetA }, { gateway, analyze: fake.analyze })]);
  assert.equal(fake.calls(), 1); assert.equal(results.filter((item) => item.status === "unsupported").length, 1); assert.equal(results.filter((item) => item.status === "unavailable").length, 1);
});
test("owner capacity is atomic per owner while cross-owner work is isolated", async () => {
  const gateway = new AdmissionHarness(1); const fake = fakeAnalyzer("success");
  assert.equal((await gateway.admit({ ownerId: ownerA, assetId: assetA })).kind, "admitted");
  assert.equal((await runManualProductReanalysis({ ownerId: ownerA, assetId: assetB }, { gateway, analyze: fake.analyze })).status, "unavailable");
  assert.equal((await runManualProductReanalysis({ ownerId: ownerB, assetId: assetB }, { gateway, analyze: fake.analyze })).status, "unsupported");
});
test("unavailable contract and cross-owner authorization fail closed before the provider", async () => {
  const fake = fakeAnalyzer("success");
  assert.deepEqual(await runManualProductReanalysis({ ownerId: ownerA, assetId: assetA }, { gateway: new AdmissionHarness(1, true), analyze: fake.analyze }), { status: "unavailable", reason: "reanalysis_unavailable" });
  assert.equal((await runManualProductReanalysis({ ownerId: ownerA, assetId: "forbidden" }, { gateway: new AdmissionHarness(), analyze: fake.analyze })).status, "unavailable");
  assert.equal(fake.calls(), 0);
});
test("pre-provider failure safely retries, while a provider timeout requires reconciliation", async () => {
  const gateway = new AdmissionHarness(); const preFailure = fakeAnalyzer("pre_failure");
  assert.equal((await runManualProductReanalysis({ ownerId: ownerA, assetId: assetA }, { gateway, analyze: preFailure.analyze })).status, "failed");
  const success = fakeAnalyzer("success");
  assert.equal((await runManualProductReanalysis({ ownerId: ownerA, assetId: assetA }, { gateway, analyze: success.analyze })).status, "unsupported");
  const timeoutGateway = new AdmissionHarness(); const timeout = fakeAnalyzer("timeout");
  assert.deepEqual(await runManualProductReanalysis({ ownerId: ownerA, assetId: assetB }, { gateway: timeoutGateway, analyze: timeout.analyze }), { status: "unavailable", reason: "reanalysis_reconciliation_required" });
  await runManualProductReanalysis({ ownerId: ownerA, assetId: assetB }, { gateway: timeoutGateway, analyze: timeout.analyze });
  assert.equal(timeout.calls(), 1);
});

test("a stale executor lease cannot change a newer admission state", async () => {
  const gateway = new AdmissionHarness();
  const first = await gateway.admit({ ownerId: ownerA, assetId: assetA });
  assert.equal(first.kind, "admitted");
  if (first.kind !== "admitted") return;
  assert.equal(await gateway.transition({ admissionId: first.admissionId, leaseToken: first.leaseToken, leaseVersion: first.leaseVersion + 1, state: "possibly_submitted" }), false);
});
