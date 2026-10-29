import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DisabledVideoBillingPolicy } from "../src/lib/video-generation/billing";
import { reconcileClaimedVideoGeneration } from "../src/lib/video-generation/reconciliation";
import { isAuthorizedVideoSchedulerRequest } from "../src/lib/video-generation/scheduler-auth";
import { runVideoReconciliationBatch } from "../src/lib/video-generation/scheduler";
import type { VideoGenerationProvider, VideoJobRecord, VideoReconciliationClaim, VideoReconciliationRepository } from "../src/lib/video-generation/types";

const ownerId = "10000000-0000-4000-8000-000000000001";
const jobId = "30000000-0000-4000-8000-000000000003";

function job(overrides: Partial<VideoJobRecord> = {}): VideoJobRecord {
  return {
    id: jobId, ownerId, clientSubmissionId: "20000000-0000-4000-8000-000000000002", mode: "text", prompt: "Product reveal", quality: "auto", aspectRatio: "16:9", durationSeconds: 5, cameraMovement: "auto", sourceKind: null, sourceId: null,
    provider: "fal", endpointId: "fal-ai/kling-video/v3/standard/image-to-video", modelId: "kling-v3-standard-image", providerRequestId: "provider-1", status: "queued", errorCode: null,
    outputBucketId: null, outputObjectPath: null, outputMimeType: null, outputSizeBytes: null, estimatedProviderCostUsd: 0.42, actualProviderCostUsd: null,
    billingReservationId: "reservation-1", billingStatus: "reserved", reconciliationAttempts: 0, nextReconciliationAt: null,
    createdAt: "2026-10-20T10:00:00.000Z", startedAt: null, completedAt: null, ...overrides,
  };
}

class MemoryReconciliationRepository implements VideoReconciliationRepository {
  records = new Map<string, VideoJobRecord>();
  claims = new Map<string, { token: string; version: number; expiresAt: number }>();
  now = Date.parse("2026-10-20T10:00:00.000Z");
  async createOrGet(input: Parameters<VideoReconciliationRepository["createOrGet"]>[0]) { const record = job({ ...input, reconciliationAttempts: 0, nextReconciliationAt: null }); this.records.set(record.id, record); return { job: record, created: true }; }
  async findOwned(owner: string, id: string) { const record = this.records.get(id); return record?.ownerId === owner ? record : null; }
  async findById(id: string) { return this.records.get(id) ?? null; }
  async listOwned(owner: string) { return [...this.records.values()].filter((record) => record.ownerId === owner); }
  async attachProviderRequest(id: string, requestId: string) { const record = this.records.get(id); if (!record) throw new Error("missing"); const next = { ...record, providerRequestId: requestId }; this.records.set(id, next); return next; }
  async transition(id: string, from: readonly VideoJobRecord["status"][], patch: Partial<VideoJobRecord>) { const record = this.records.get(id); if (!record || !from.includes(record.status)) return null; const next = { ...record, ...patch }; this.records.set(id, next); return next; }
  async scheduleReconciliation(id: string, attempts: number, nextAt: string | null) { const record = this.records.get(id); if (record) this.records.set(id, { ...record, reconciliationAttempts: attempts, nextReconciliationAt: nextAt }); }
  async claimDueVideoReconciliations(batchSize: number, leaseSeconds: number) {
    const claimed: VideoReconciliationClaim[] = [];
    for (const record of [...this.records.values()].filter((candidate) => candidate.status === "queued" || candidate.status === "processing")) {
      if (claimed.length >= batchSize || !record.providerRequestId || record.reconciliationAttempts >= 24 || (record.nextReconciliationAt && Date.parse(record.nextReconciliationAt) > this.now)) continue;
      const prior = this.claims.get(record.id);
      if (prior && prior.expiresAt > this.now) continue;
      const version = (prior?.version ?? 0) + 1;
      const token = `${record.id}-${version}`;
      const expiresAt = this.now + leaseSeconds * 1000;
      this.claims.set(record.id, { token, version, expiresAt });
      claimed.push({ job: record, leaseToken: token, leaseVersion: version, leaseExpiresAt: new Date(expiresAt).toISOString() });
    }
    return claimed;
  }
  private owns(claim: VideoReconciliationClaim) { const current = this.claims.get(claim.job.id); return current?.token === claim.leaseToken && current.version === claim.leaseVersion && current.expiresAt > this.now; }
  async transitionClaimed(claim: VideoReconciliationClaim, from: readonly VideoJobRecord["status"][], patch: Partial<VideoJobRecord>) {
    if (!this.owns(claim)) return null;
    const updated = await this.transition(claim.job.id, from, patch);
    if (updated && (patch.status === "failed" || patch.status === "succeeded")) this.claims.delete(claim.job.id);
    return updated;
  }
  async scheduleClaimedReconciliation(claim: VideoReconciliationClaim, attempts: number, nextAt: string | null) { if (!this.owns(claim)) return false; await this.scheduleReconciliation(claim.job.id, attempts, nextAt); this.claims.delete(claim.job.id); return true; }
}

const queuedProvider: VideoGenerationProvider = { name: "fal", submit: async () => ({ requestId: "unused" }), getStatus: async () => "queued", getResult: async () => ({ url: "https://v3b.fal.media/output.mp4", contentType: "video/mp4", sizeBytes: 10 }) };

test("claim migration uses bounded SKIP LOCKED leases and grants only service role", () => {
  const sql = readFileSync("database/migrations/20261021000000_add_video_reconciliation_leases.sql", "utf8");
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /least\(coalesce\(p_batch_size, 1\), 10\)/i);
  assert.match(sql, /reconciliation_lease_version = reconciliation_lease_version \+ 1/i);
  assert.match(sql, /revoke all on function[\s\S]*anon, authenticated/i);
  assert.match(sql, /grant execute[\s\S]*to service_role/i);
});

test("claims exclude non-due and terminal jobs, respect the batch boundary, and do not overlap", async () => {
  const repository = new MemoryReconciliationRepository();
  repository.records.set("a", job({ id: "a" })); repository.records.set("b", job({ id: "b" }));
  repository.records.set("later", job({ id: "later", nextReconciliationAt: "2026-10-20T10:01:00.000Z" }));
  repository.records.set("done", job({ id: "done", status: "succeeded" }));
  const [first, second] = await Promise.all([repository.claimDueVideoReconciliations(1, 120), repository.claimDueVideoReconciliations(10, 120)]);
  assert.equal(first.length + second.length, 2);
  assert.equal(new Set([...first, ...second].map((claim) => claim.job.id)).size, 2);
});

test("expired claims recover with a new fence and stale workers cannot write", async () => {
  const repository = new MemoryReconciliationRepository(); repository.records.set(jobId, job());
  const [first] = await repository.claimDueVideoReconciliations(1, 30);
  repository.now += 30_001;
  const [second] = await repository.claimDueVideoReconciliations(1, 30);
  assert.equal(second.leaseVersion, first.leaseVersion + 1);
  assert.equal(await repository.transitionClaimed(first, ["queued"], { status: "processing" }), null);
  assert.notEqual(await repository.transitionClaimed(second, ["queued"], { status: "processing" }), null);
});

test("claimed reconciliation releases the lease on retry and preserves checkpoint safety", async () => {
  const repository = new MemoryReconciliationRepository(); repository.records.set(jobId, job());
  const [claim] = await repository.claimDueVideoReconciliations(1, 120);
  const result = await reconcileClaimedVideoGeneration(claim, { repository, provider: queuedProvider, billing: new DisabledVideoBillingPolicy(), outputStore: { persist: async () => { throw new Error("not called"); } }, now: () => new Date(repository.now) });
  assert.equal(result.status, "queued");
  assert.equal(repository.records.get(jobId)?.reconciliationAttempts, 1);
  assert.equal(repository.claims.has(jobId), false);
});

test("claimed terminal Fal failures become failed once and release the reconciliation lease", async () => {
  const repository = new MemoryReconciliationRepository(); repository.records.set(jobId, job({ status: "processing" }));
  const [claim] = await repository.claimDueVideoReconciliations(1, 120);
  const result = await reconcileClaimedVideoGeneration(claim, {
    repository, provider: { ...queuedProvider, getStatus: async () => "failed" }, billing: new DisabledVideoBillingPolicy(),
    outputStore: { persist: async () => { throw new Error("not called"); } },
  });
  assert.equal(result.status, "failed");
  assert.equal(repository.records.get(jobId)?.errorCode, "provider_failure");
  assert.equal(repository.records.get(jobId)?.billingStatus, "reconciliation_required");
  assert.equal(repository.claims.has(jobId), false);
});

test("duplicate scheduler invocations process a claim once and return bounded statistics", async () => {
  const repository = new MemoryReconciliationRepository(); repository.records.set(jobId, job());
  const dependencies = { repository, provider: queuedProvider, billing: new DisabledVideoBillingPolicy(), outputStore: { persist: async () => { throw new Error("not called"); } }, now: () => new Date(repository.now) };
  const [first, second] = await Promise.all([runVideoReconciliationBatch(dependencies, 999), runVideoReconciliationBatch(dependencies, 999)]);
  assert.equal(first.claimed + second.claimed, 1);
  assert.equal(repository.records.get(jobId)?.reconciliationAttempts, 1);
});

test("scheduler authorization rejects missing, malformed, and incorrect credentials", () => {
  assert.equal(isAuthorizedVideoSchedulerRequest(null, "secret"), false);
  assert.equal(isAuthorizedVideoSchedulerRequest("Basic secret", "secret"), false);
  assert.equal(isAuthorizedVideoSchedulerRequest("Bearer wrong", "secret"), false);
  assert.equal(isAuthorizedVideoSchedulerRequest("Bearer secret", "secret"), true);
});
