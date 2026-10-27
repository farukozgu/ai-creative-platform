import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { estimateVerifiedProviderCost, resolveVideoRoute, videoTierRouting, videoEndpointCapabilities } from "../src/lib/video-generation/capabilities";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { compileProductVideoPrompt } from "../src/lib/video-generation/preservation";
import { videoDraftHash } from "../src/lib/video-generation/request-identity";
import { canTransitionVideoStatus } from "../src/lib/video-generation/lifecycle";
import { MAX_VIDEO_RECONCILIATION_ATTEMPTS, reconcileVideoGeneration } from "../src/lib/video-generation/reconciliation";
import { submitVideoGeneration } from "../src/lib/video-generation/service";
import { isSourceUrlFresh } from "../src/lib/video-generation/source";
import type { VideoBillingPolicy } from "../src/lib/video-generation/billing";
import { DefiniteVideoProviderFailure, type VideoGenerationDraft, type VideoGenerationProvider, type VideoJobRecord, type VideoJobRepository } from "../src/lib/video-generation/types";
import { validateDraftAgainstCapability, validateVideoGenerationDraft } from "../src/lib/video-generation/validation";
import { compileDirectorPlan, fallbackDirectorPlan } from "../src/lib/video-director/core";

const ownerId = "10000000-0000-4000-8000-000000000001";
const submissionId = "20000000-0000-4000-8000-000000000002";
const jobId = "30000000-0000-4000-8000-000000000003";
const imageDraft: VideoGenerationDraft = {
  clientSubmissionId: submissionId, mode: "image", prompt: "  A polished product reveal   with soft motion  ",
  quality: "standard", aspectRatio: "16:9", durationSeconds: 5, cameraMovement: "auto", source: { kind: "generated-image", generationId: jobId },
};
const approvedImageCapability = { ...videoEndpointCapabilities.klingV3ProImage, productionApproved: true };
const sourceResolver = {
  resolveOwned: async () => ({
    reference: imageDraft.source!, providerUrl: "https://signed.example/source.png",
    expiresAt: "2099-10-20T10:30:00.000Z", mimeType: "image/png" as const,
    sizeBytes: 1, width: 1000, height: 562, aspectRatio: "16:9" as const,
  }),
};

function job(overrides: Partial<VideoJobRecord> = {}): VideoJobRecord {
  return {
    id: jobId, ownerId, clientSubmissionId: submissionId, mode: "image", prompt: "A product reveal", quality: "auto",
    aspectRatio: "16:9", durationSeconds: 5, cameraMovement: "auto", sourceKind: null, sourceId: null,
    provider: "fal", endpointId: approvedImageCapability.endpointId, modelId: approvedImageCapability.id,
    providerRequestId: "provider-1", status: "queued", errorCode: null, outputBucketId: null,
    outputObjectPath: null, outputMimeType: null, outputSizeBytes: null, estimatedProviderCostUsd: 0.42,
    actualProviderCostUsd: null, billingReservationId: "reservation-1", billingStatus: "reserved",
    reconciliationAttempts: 0, nextReconciliationAt: null, createdAt: "2026-10-20T10:00:00.000Z",
    startedAt: null, completedAt: null, ...overrides,
  };
}

class MemoryRepository implements VideoJobRepository {
  records = new Map<string, VideoJobRecord>();
  async createOrGet(input: Parameters<VideoJobRepository["createOrGet"]>[0]) {
    const duplicate = [...this.records.values()].find((item) => item.ownerId === input.ownerId && item.clientSubmissionId === input.clientSubmissionId);
    if (duplicate) return { job: duplicate, created: false };
    const record = job({ ...input, id: jobId, createdAt: "2026-10-20T10:00:00.000Z", startedAt: null, completedAt: null, reconciliationAttempts: 0, nextReconciliationAt: null });
    this.records.set(record.id, record);
    return { job: record, created: true };
  }
  async findOwned(userId: string, id: string) { const record = this.records.get(id); return record?.ownerId === userId ? record : null; }
  async findById(id: string) { return this.records.get(id) ?? null; }
  async listOwned(userId: string) { return [...this.records.values()].filter((item) => item.ownerId === userId); }
  async attachProviderRequest(id: string, requestId: string) { const record = this.records.get(id); if (!record) throw new Error("missing"); const next = { ...record, providerRequestId: requestId }; this.records.set(id, next); return next; }
  async transition(id: string, from: readonly VideoJobRecord["status"][], patch: Partial<VideoJobRecord>) { const record = this.records.get(id); if (!record || !from.includes(record.status)) return null; const next = { ...record, ...patch }; this.records.set(id, next); return next; }
  async scheduleReconciliation(id: string, attempts: number, nextAt: string | null) { const record = this.records.get(id); if (record) this.records.set(id, { ...record, reconciliationAttempts: attempts, nextReconciliationAt: nextAt }); }
}

function billing(overrides: Partial<VideoBillingPolicy> = {}) {
  let reservations = 0; let releases = 0; let reconciliations = 0; let finalizations = 0;
  const value: VideoBillingPolicy = {
    reserve: async () => { reservations += 1; return { ok: true, reservation: { id: "reservation-1", status: "reserved" } }; },
    finalize: async () => { finalizations += 1; }, release: async () => { releases += 1; }, markForReconciliation: async () => { reconciliations += 1; }, ...overrides,
  };
  return { value, counts: () => ({ reservations, releases, reconciliations, finalizations }) };
}

function provider(overrides: Partial<VideoGenerationProvider> = {}) {
  let submissions = 0;
  const value: VideoGenerationProvider = {
    name: "fal", submit: async () => { submissions += 1; return { requestId: "provider-1" }; },
    getStatus: async () => "completed", getResult: async () => ({ url: "https://v3b.fal.media/output.mp4", contentType: "video/mp4", sizeBytes: 10 }), ...overrides,
  };
  return { value, submissions: () => submissions };
}

test("Director multi-shot submission keeps the billing boundary, source and idempotency for both tiers", async () => {
  for (const quality of ["standard", "pro"] as const) {
    const parsed = validateVideoGenerationDraft({ ...imageDraft, quality, shotMode: "multi", director: { presetId: "minimal-studio", shotMode: "multi", receipt: "server-verified-fixture" } });
    assert.ok(parsed.ok);
    const draft = parsed.value;
    const input = { draft, presetId: "minimal-studio" as const, shotMode: "multi" as const, profile: null };
    const plan = fallbackDirectorPlan(input), compiled = compileDirectorPlan(plan, input);
    const repository = new MemoryRepository(), budget = billing(); let calls = 0;
    const mock = provider({ submit: async request => {
      calls++;
      const payload = buildFalVideoRequestInput(request);
      assert.equal(payload.prompt, undefined); assert.equal(payload.shot_type, "customize");
      assert.equal(payload.start_image_url, "https://signed.example/source.png");
      assert.equal(payload.enable_safety_checker, true); assert.equal(payload.generate_audio, false);
      assert.equal(request.multiPrompt?.reduce((sum, shot) => sum + Number(shot.duration), 0), 5);
      return { requestId: "director-task" };
    } });
    const deps = { repository, provider: mock.value, billing: budget.value, sourceResolver,
      capability: { ...videoEndpointCapabilities[videoTierRouting[quality]], productionApproved: true }, env: { VIDEO_GENERATION_ENABLED: "true" },
      preservation: { version: compiled.version, method: "kling" as const, draftHash: videoDraftHash(draft), sourceSha256: "fixture",
        geometry: { originalWidth: 1000, originalHeight: 562, contentRect: { x: 0, y: 0, width: 1, height: 1 } },
        criticalRegion: null, frameRegion: null, compiledPrompt: compiled.prompt, negativePrompt: compiled.negativePrompt, cfgScale: compiled.cfgScale,
        analysisConsent: null, director: { plan, multiPrompt: compiled.multiPrompt } } };
    assert.equal((await submitVideoGeneration(ownerId, draft, { ...deps, preservation: undefined })).ok, false);
    assert.equal(budget.counts().reservations, 0);
    assert.equal((await submitVideoGeneration(ownerId, draft, { ...deps, preservation: { ...deps.preservation, director: { plan } } })).ok, false);
    assert.equal(budget.counts().reservations, 0);
    const malformed = { ...deps.preservation, director: { plan, multiPrompt: [{ prompt: "invalid shot", duration: "1" }] } };
    assert.equal((await submitVideoGeneration(ownerId, draft, { ...deps, preservation: malformed })).ok, false);
    assert.equal(budget.counts().reservations, 0);
    const oversized = { ...deps.preservation, director: { plan, multiPrompt: [
      { prompt: "x".repeat(513), duration: "2" }, { prompt: "detail", duration: "2" }, { prompt: "closing", duration: "1" },
    ] } };
    assert.equal((await submitVideoGeneration(ownerId, draft, { ...deps, preservation: oversized })).ok, false);
    assert.equal(budget.counts().reservations, 0); assert.equal(calls, 0);
    assert.equal((await submitVideoGeneration(ownerId, draft, deps)).ok, true);
    const duplicate = await submitVideoGeneration(ownerId, draft, deps);
    assert.ok(duplicate.ok && duplicate.duplicate); assert.equal(calls, 1);
    assert.equal(repository.records.get(jobId)?.preservation?.director?.plan.presetId, "minimal-studio");
  }
});

test("concurrent use of one reserved submission never causes two paid calls, including lost reservation replies", async () => {
  for (const lostReply of [false, true]) {
    const repository = new MemoryRepository(), consumed = new Set<string>();
    let paidCalls = 0;
    const once = billing({ reserve: async (_owner, id) => {
      if (consumed.has(id)) return { ok: false, code: "billing_unavailable" };
      consumed.add(id);
      if (lostReply) return { ok: false, code: "billing_unavailable" };
      return { ok: true, reservation: { id: "once-reservation", status: "reserved" } };
    } });
    const mock = provider({ submit: async () => { paidCalls++; return { requestId: "one-task" }; } });
    const deps = { repository, provider: mock.value, billing: once.value, sourceResolver, capability: approvedImageCapability,
      env: { VIDEO_GENERATION_ENABLED: "true" } };
    const outcomes = await Promise.all([submitVideoGeneration(ownerId, imageDraft, deps), submitVideoGeneration(ownerId, imageDraft, deps)]);
    assert.ok(outcomes.some(result => !result.ok));
    assert.equal(paidCalls, lostReply ? 0 : 1);
    await submitVideoGeneration(ownerId, imageDraft, deps);
    assert.equal(paidCalls, lostReply ? 0 : 1);
  }
});

test("both customer tiers route to their approved model configuration but remain closed", () => {
  assert.deepEqual(resolveVideoRoute("image", "standard", {}), { ok: false, code: "feature_disabled" });
  assert.deepEqual(resolveVideoRoute("image", "standard", { VIDEO_GENERATION_ENABLED: "true" }), { ok: false, code: "routing_unapproved" });
  assert.deepEqual(resolveVideoRoute("image", "pro", { VIDEO_GENERATION_ENABLED: "true" }), { ok: false, code: "routing_unapproved" });
  assert.equal(videoEndpointCapabilities.klingV3ProImage.endpointId, "fal-ai/kling-video/v3/pro/image-to-video");
  assert.equal(videoEndpointCapabilities.klingV3StandardImage.endpointId, "fal-ai/kling-video/v3/standard/image-to-video");
  assert.equal(videoTierRouting.standard, "klingV3StandardImage");
  assert.equal(videoTierRouting.pro, "klingV3ProImage");
  assert.equal(estimateVerifiedProviderCost(approvedImageCapability, 10), 1.12);
  assert.equal(estimateVerifiedProviderCost(videoEndpointCapabilities.klingV3StandardImage, 10), 0.84);
});

test("both Kling routes receive the server preservation prompt and camera without duplicate paid submission", async () => {
  for (const quality of ["standard", "pro"] as const) {
    const parsed = validateVideoGenerationDraft({ ...imageDraft, method: "kling", quality, cameraMovement: "pan-right" });
    assert.ok(parsed.ok);
    if (!parsed.ok) throw new Error("Invalid fixture");
    const draft = parsed.value;
    const compiled = compileProductVideoPrompt(draft);
    const repository = new MemoryRepository();
    let calls = 0;
    const mock = provider({ submit: async request => {
      calls++;
      const payload = buildFalVideoRequestInput(request);
      assert.match(String(payload.prompt), /pan right/);
      assert.match(String(payload.prompt), /sole product identity authority/);
      assert.match(String(payload.negative_prompt), /morphing letters/);
      assert.equal(payload.cfg_scale, 0.5);
      assert.equal(payload.generate_audio, false);
      assert.equal(payload.end_image_url, undefined);
      return { requestId: "mock-preservation-task" };
    } });
    const dependencies = { repository, provider: mock.value, billing: billing().value, sourceResolver,
      capability: { ...videoEndpointCapabilities[videoTierRouting[quality]], productionApproved: true },
      env: { VIDEO_GENERATION_ENABLED: "true" },
      preservation: { version: compiled.version, method: "kling" as const, draftHash: videoDraftHash(draft), sourceSha256: "fixture",
        geometry: { originalWidth: 2400, originalHeight: 3600, contentRect: { x: 0, y: 0, width: 1, height: 1 } },
        criticalRegion: null, frameRegion: null, compiledPrompt: compiled.prompt, negativePrompt: compiled.negativePrompt, cfgScale: compiled.cfgScale, analysisConsent: null } };
    assert.equal((await submitVideoGeneration(ownerId, draft, dependencies)).ok, true);
    assert.equal((await submitVideoGeneration(ownerId, draft, dependencies)).ok, true);
    assert.equal(calls, 1);
    assert.equal((await submitVideoGeneration(ownerId, { ...draft, cameraMovement: "static" }, dependencies)).ok, false);
    assert.equal(calls, 1);
  }
});

test("draft validation sanitizes prompt input and rejects forged source combinations", () => {
  const parsed = validateVideoGenerationDraft(imageDraft);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.prompt, "A polished product reveal with soft motion");
  assert.equal(validateVideoGenerationDraft({ ...imageDraft, mode: "text", source: null }).ok, false);
  assert.equal(validateVideoGenerationDraft({ ...imageDraft, method: "source-motion" }).ok, false);
  assert.equal(validateVideoGenerationDraft({ ...imageDraft, source: null }).ok, false);
  assert.equal(validateVideoGenerationDraft({ ...imageDraft, durationSeconds: 12 }).ok, false);
});

test("capability validation rejects unsupported durations and ratios without conversion", () => {
  assert.equal(validateDraftAgainstCapability(imageDraft, approvedImageCapability).ok, true);
  assert.equal(validateDraftAgainstCapability({ ...imageDraft, durationSeconds: 10 }, { ...approvedImageCapability, durations: [5] }).ok, false);
  assert.equal(validateDraftAgainstCapability({ ...imageDraft, aspectRatio: "1:1" }, { ...approvedImageCapability, aspectRatios: ["16:9"] }).ok, false);
});

test("Kling 3.0 and Pro use start-frame payloads and disable audio", () => {
  const request = { endpointId: "unused", mode: "image" as const, prompt: "Product reveal", durationSeconds: 5 as const, aspectRatio: "16:9" as const, sourceUrl: "https://signed.example/source.png" };
  assert.deepEqual(buildFalVideoRequestInput({ ...request, modelId: "kling-v3-pro-image" }), { start_image_url: request.sourceUrl, prompt: request.prompt, duration: "5", generate_audio: false, enable_safety_checker: true });
  assert.deepEqual(buildFalVideoRequestInput({ ...request, modelId: "kling-v3-standard-image" }), { start_image_url: request.sourceUrl, prompt: request.prompt, duration: "5", generate_audio: false, enable_safety_checker: true });
  assert.throws(() => buildFalVideoRequestInput({ ...request, modelId: "unknown" }));
});

test("idempotent submissions preserve the shared reservation and create one provider job", async () => {
  const repository = new MemoryRepository(); const paid = billing(); const mockProvider = provider();
  const dependencies = { repository, billing: paid.value, provider: mockProvider.value, sourceResolver, capability: approvedImageCapability, env: { VIDEO_GENERATION_ENABLED: "true" } };
  const [first, duplicate] = await Promise.all([submitVideoGeneration(ownerId, imageDraft, dependencies), submitVideoGeneration(ownerId, imageDraft, dependencies)]);
  assert.equal(first.ok, true); assert.equal(duplicate.ok, true); assert.equal(mockProvider.submissions(), 1);
  assert.deepEqual(paid.counts(), { reservations: 2, releases: 0, reconciliations: 0, finalizations: 0 });
});

test("exhausted beta budget returns an explicit limit error before creating a job or calling Fal", async () => {
  const repository = new MemoryRepository(), paid = billing({ reserve: async () => ({ ok: false, code: "insufficient_balance" }) });
  const mockProvider = provider();
  const result = await submitVideoGeneration(ownerId, imageDraft, {
    repository, provider: mockProvider.value, billing: paid.value, sourceResolver,
    capability: approvedImageCapability, env: { VIDEO_GENERATION_ENABLED: "true" },
  });
  assert.deepEqual(result.ok ? null : result.code, "budget_limit_reached");
  assert.equal(repository.records.size, 0); assert.equal(mockProvider.submissions(), 0);
});

test("an ambiguous provider failure is not retried and requires billing reconciliation", async () => {
  const repository = new MemoryRepository(); const paid = billing();
  const result = await submitVideoGeneration(ownerId, imageDraft, {
    repository, billing: paid.value, provider: provider({ submit: async () => { throw new Error("timeout"); } }).value,
    sourceResolver, capability: approvedImageCapability, env: { VIDEO_GENERATION_ENABLED: "true" },
  });
  assert.deepEqual(result.ok ? null : result.code, "provider_submission_ambiguous");
  assert.equal(repository.records.get(jobId)?.status, "failed");
  assert.equal(paid.counts().reconciliations, 1);
});

test("Fal terminal client rejection fails the job without resubmission or automatic refund", async () => {
  const repository = new MemoryRepository(), paid = billing(); let calls = 0;
  const result = await submitVideoGeneration(ownerId, imageDraft, {
    repository, billing: paid.value, provider: provider({ submit: async () => { calls++; throw new DefiniteVideoProviderFailure(); } }).value,
    sourceResolver, capability: approvedImageCapability, env: { VIDEO_GENERATION_ENABLED: "true" },
  });
  assert.deepEqual(result.ok ? null : result.code, "provider_failure");
  assert.equal(calls, 1); assert.equal(repository.records.get(jobId)?.status, "failed");
  assert.equal(repository.records.get(jobId)?.errorCode, "provider_failure");
  assert.equal(repository.records.get(jobId)?.billingStatus, "reconciliation_required");
  assert.equal(paid.counts().reconciliations, 1); assert.equal(paid.counts().releases, 0);
});

test("persistence failure releases the reservation and never reaches the provider", async () => {
  const paid = billing(); const mockProvider = provider();
  const repository = new MemoryRepository();
  repository.createOrGet = async () => { throw new Error("database unavailable"); };
  const result = await submitVideoGeneration(ownerId, imageDraft, {
    repository, billing: paid.value, provider: mockProvider.value, sourceResolver,
    capability: approvedImageCapability, env: { VIDEO_GENERATION_ENABLED: "true" },
  });
  assert.equal(result.ok ? null : result.code, "persistence_failure");
  assert.equal(mockProvider.submissions(), 0);
  assert.equal(paid.counts().releases, 1);
});

test("lifecycle transitions are monotonic and terminal states reject duplicate completion", () => {
  assert.equal(canTransitionVideoStatus("queued", "processing"), true);
  assert.equal(canTransitionVideoStatus("processing", "succeeded"), true);
  assert.equal(canTransitionVideoStatus("succeeded", "processing"), false);
  assert.equal(canTransitionVideoStatus("failed", "queued"), false);
});

test("reconciliation retries output storage without marking success", async () => {
  const repository = new MemoryRepository(); repository.records.set(jobId, job({ status: "processing" }));
  const result = await reconcileVideoGeneration(jobId, {
    repository, provider: provider().value, billing: billing().value,
    outputStore: { persist: async () => { throw new Error("storage unavailable"); } },
    now: () => new Date("2026-10-20T10:00:00.000Z"),
  });
  assert.equal(result.status, "output_retry");
  assert.equal(repository.records.get(jobId)?.status, "processing");
  assert.equal(repository.records.get(jobId)?.reconciliationAttempts, 1);
});

test("reconciliation stops at the retry limit without another provider call", async () => {
  const repository = new MemoryRepository(); repository.records.set(jobId, job({ status: "processing", reconciliationAttempts: MAX_VIDEO_RECONCILIATION_ATTEMPTS }));
  let statusReads = 0;
  const result = await reconcileVideoGeneration(jobId, {
    repository, provider: provider({ getStatus: async () => { statusReads += 1; return "processing"; } }).value,
    billing: billing().value, outputStore: { persist: async () => { throw new Error("not called"); } },
  });
  assert.equal(result.status, "failed"); assert.equal(statusReads, 0); assert.equal(repository.records.get(jobId)?.errorCode, "retry_limit_reached");
});

test("terminal Fal failure ends reconciliation and leaves the reserved billing record for review", async () => {
  const repository = new MemoryRepository(); repository.records.set(jobId, job({ status: "processing" }));
  const paid = billing();
  const result = await reconcileVideoGeneration(jobId, {
    repository, provider: provider({ getStatus: async () => "failed" }).value, billing: paid.value,
    outputStore: { persist: async () => { throw new Error("not called"); } },
  });
  assert.equal(result.status, "failed");
  assert.equal(repository.records.get(jobId)?.errorCode, "provider_failure");
  assert.equal(repository.records.get(jobId)?.billingStatus, "reconciliation_required");
  assert.equal(repository.records.get(jobId)?.billingReservationId, "reservation-1");
  assert.equal(repository.records.get(jobId)?.status, "failed");
  assert.equal(paid.counts().releases, 0); assert.equal(paid.counts().finalizations, 0);
});

test("billing failure keeps the durable output checkpointed for a retry", async () => {
  const repository = new MemoryRepository(); repository.records.set(jobId, job({ status: "processing" }));
  let stores = 0;
  const result = await reconcileVideoGeneration(jobId, {
    repository, provider: provider().value,
    billing: billing({ finalize: async () => { throw new Error("ledger unavailable"); } }).value,
    outputStore: { persist: async () => { stores += 1; return { bucketId: "generated-videos", objectPath: `${ownerId}/${jobId}/output.mp4`, contentType: "video/mp4", sizeBytes: 10 }; } },
  });
  assert.equal(result.status, "billing_retry");
  assert.equal(stores, 1);
  assert.equal(repository.records.get(jobId)?.outputObjectPath, `${ownerId}/${jobId}/output.mp4`);
  assert.equal(repository.records.get(jobId)?.status, "processing");
});

test("expired signed sources are rejected before provider submission", () => {
  assert.equal(isSourceUrlFresh({ reference: { kind: "generated-image", generationId: jobId }, providerUrl: "https://signed.example", expiresAt: "2026-10-20T10:05:00.000Z", mimeType: "image/png", sizeBytes: 1, width: 1000, height: 1000, aspectRatio: "1:1" }, Date.parse("2026-10-20T10:00:00.000Z")), false);
});

test("migration enforces owner RLS, idempotency, private media, and terminal guards", () => {
  const sql = readFileSync("database/migrations/20261020000000_create_video_generation_foundation.sql", "utf8");
  assert.match(sql, /generations_video_owner_submission_unique[\s\S]*\(owner_id, client_submission_id\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /auth\.uid\(\)\) = owner_id/i);
  assert.match(sql, /terminal video generations are immutable/i);
  assert.match(sql, /'generated-videos', 'generated-videos', false/i);
  assert.doesNotMatch(sql, /grant[^;]*insert[^;]*on table public\.generations[^;]*to authenticated/i);
});


test("a private upload survives a lost checkpoint and expired provider result without another provider request", async () => {
  const repository = new MemoryRepository(); repository.records.set(jobId, job({ status: "processing" }));
  const result = await reconcileVideoGeneration(jobId, {
    repository, billing: billing().value,
    provider: provider({ getStatus: async () => { throw new Error("Expired provider task must not be read"); }, getResult: async () => { throw new Error("Expired provider result must not be read"); } }).value,
    outputStore: {
      recover: async () => ({ bucketId: "generated-videos", objectPath: ownerId + "/" + jobId + "/output.mp4", contentType: "video/mp4", sizeBytes: 1024 }),
      persist: async () => { throw new Error("Existing output must not be reuploaded"); },
    },
  });
  assert.equal(result.status, "succeeded");
  assert.equal(repository.records.get(jobId)?.outputSizeBytes, 1024);
});


test("a committed task attachment with a lost response is recovered without a second paid submission", async () => {
  const repository = new MemoryRepository();
  repository.attachProviderRequest = async (id, requestId) => {
    const record = repository.records.get(id)!; record.providerRequestId = requestId;
    throw new Error("Committed update response was lost");
  };
  const mock = provider();
  const result = await submitVideoGeneration(ownerId, imageDraft, { repository, provider: mock.value, billing: billing().value,
    sourceResolver, capability: approvedImageCapability, env: { VIDEO_GENERATION_ENABLED: "true" } });
  assert.equal(result.ok, true); assert.equal(mock.submissions(), 1);
  assert.equal(repository.records.get(jobId)?.status, "queued");
});
