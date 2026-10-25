import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareUgcJobForUser as prepareUgcJobCore,
  saveUgcDraftForUser,
  type UgcOwnedProject,
  type UgcPreparedJob,
  type UgcProjectRepository,
  type UgcResult,
  validateUgcDraftInput,
  serializeUgcConfiguration,
} from "../src/features/ugc/ugc-studio-contract";
import type { UgcDraftInput } from "../src/features/ugc/ugc-studio-contract";

const userId = "10000000-0000-4000-8000-000000000001";
const otherUserId = "10000000-0000-4000-8000-000000000002";
const projectId = "20000000-0000-4000-8000-000000000001";
const idempotencyKey = "30000000-0000-4000-8000-000000000001";
const payload = {
  id: projectId, title: "Summer UGC", creatorConceptId: "ada", format: "testimonial", script: "Meet the new serum.",
  settings: { language: "en", tone: "natural", voice: "warm", environment: "home", lighting: "daylight", framing: "medium", duration: "30", aspectRatio: "9:16", subtitles: true },
};

function ownedProject(owner = userId): UgcOwnedProject {
  const parsed = validateUgcDraftInput(payload);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("Invalid fixture");
  return {
    ...parsed.value, ownerId: owner,
    product: { fileName: "serum.webp", contentType: "image/webp", byteSize: 4096, objectPath: `${owner}/${projectId}/40000000-0000-4000-8000-000000000001.webp` },
    createdAt: "2026-11-03T10:00:00.000Z", updatedAt: "2026-11-03T10:00:00.000Z",
  };
}

class MemoryRepository implements UgcProjectRepository {
  projects = new Map<string, UgcOwnedProject>();
  jobs = new Map<string, UgcPreparedJob>();
  async saveOwned(owner: string, input: UgcDraftInput) {
    const previous = this.projects.get(input.id);
    const now = "2026-11-03T11:00:00.000Z";
    this.projects.set(input.id, { ...input, settings: input.settings, ownerId: owner, product: previous?.product ?? null, createdAt: previous?.createdAt ?? now, updatedAt: now });
    return { id: input.id, updatedAt: now };
  }
  async getOwned(owner: string, id: string) { const project = this.projects.get(id); return project?.ownerId === owner ? project : null; }
  async listOwned(owner: string) { return [...this.projects.values()].filter((project) => project.ownerId === owner); }
  async listSuccessfulJobs() { return []; }
  async setOwnedProduct(owner: string, id: string, product: UgcOwnedProject["product"]) { const project = await this.getOwned(owner, id); if (!project) return false; this.projects.set(id, { ...project, product }); return true; }
  async prepareJob(input: Omit<UgcPreparedJob, "id" | "createdAt">): Promise<UgcResult<UgcPreparedJob>> {
    const existing = this.jobs.get(`${input.ownerId}:${input.idempotencyKey}`);
    if (existing) return existing.requestHash === input.requestHash ? { ok: true, value: existing } : { ok: false, code: "conflict" };
    const job = { ...input, id: "50000000-0000-4000-8000-000000000001", createdAt: "2026-11-03T12:00:00.000Z" };
    this.jobs.set(`${input.ownerId}:${input.idempotencyKey}`, job);
    return { ok: true, value: job };
  }
}

const hash = (snapshot: Record<string, unknown>) => JSON.stringify(snapshot);

// Isolate persistence/idempotency from the server capability preflight tested in ugc-pipeline.
const prepareUgcJobForUser: typeof prepareUgcJobCore = (user, project, key, repository, digest, resolve) =>
  prepareUgcJobCore(user, project, key, repository, digest, resolve ?? (draft => ({ ok: true, value: {
    tier: draft.modelTier ?? "premium", provider: "fal", version: 1,
    endpointId: draft.modelTier === "standard" ? "bytedance/seedance-2.0/mini/reference-to-video" : "bytedance/seedance-2.5/reference-to-video",
  } })));

test("UGC draft validation rejects forged, missing, and oversized settings", () => {
  assert.equal(validateUgcDraftInput(payload).ok, true);
  assert.deepEqual(validateUgcDraftInput({ ...payload, id: "invalid" }), { ok: false, code: "invalid_input" });
  assert.deepEqual(validateUgcDraftInput({ ...payload, settings: { ...payload.settings, duration: "120" } }), { ok: false, code: "invalid_input" });
  assert.deepEqual(validateUgcDraftInput({ ...payload, script: "x".repeat(3001) }), { ok: false, code: "invalid_input" });
});

test("draft saving requires an authenticated owner and retains a private product reference", async () => {
  const repository = new MemoryRepository();
  assert.deepEqual(await saveUgcDraftForUser(null, payload, repository), { ok: false, code: "unauthorized" });
  assert.deepEqual(await saveUgcDraftForUser(userId, { ...payload, id: "invalid" }, repository), { ok: false, code: "invalid_input" });
  repository.projects.set(projectId, ownedProject());
  const saved = await saveUgcDraftForUser(userId, { ...payload, script: "Updated script" }, repository);
  assert.equal(saved.ok, true);
  assert.equal((await repository.getOwned(userId, projectId))?.product?.objectPath, ownedProject().product?.objectPath);
  assert.equal((await repository.getOwned(otherUserId, projectId)), null);
});

test("generation preparation verifies ownership, records an idempotent draft, and never submits", async () => {
  const repository = new MemoryRepository();
  repository.projects.set(projectId, ownedProject());
  assert.deepEqual(await prepareUgcJobForUser(null, projectId, idempotencyKey, repository, hash), { ok: false, code: "unauthorized" });
  assert.deepEqual(await prepareUgcJobForUser(otherUserId, projectId, idempotencyKey, repository, hash), { ok: false, code: "not_found" });
  const first = await prepareUgcJobForUser(userId, projectId, idempotencyKey, repository, hash);
  const retry = await prepareUgcJobForUser(userId, projectId, idempotencyKey, repository, hash);
  assert.equal(first.ok && first.value.submitted, false);
  assert.equal(retry.ok && retry.value.status, "draft");
  assert.equal(repository.jobs.size, 1);
  repository.projects.set(projectId, { ...ownedProject(), script: "Changed request", spokenDialogue: "Changed request" });
  assert.deepEqual(await prepareUgcJobForUser(userId, projectId, idempotencyKey, repository, hash), { ok: false, code: "conflict" });
});

test("a generation draft requires a saved private product and a script", async () => {
  const repository = new MemoryRepository();
  const project = ownedProject();
  repository.projects.set(projectId, { ...project, product: null });
  assert.deepEqual(await prepareUgcJobForUser(userId, projectId, idempotencyKey, repository, hash), { ok: false, code: "invalid_input" });
  repository.projects.set(projectId, { ...project, script: "  ", spokenDialogue: "  " });
  assert.deepEqual(await prepareUgcJobForUser(userId, projectId, idempotencyKey, repository, hash), { ok: false, code: "invalid_input" });
});

test("later in-memory settings edits do not alter a prepared immutable snapshot", async () => {
  const repository = new MemoryRepository();
  const project = ownedProject();
  repository.projects.set(projectId, project);
  await prepareUgcJobForUser(userId, projectId, idempotencyKey, repository, hash);
  const job = [...repository.jobs.values()][0];
  const before = JSON.stringify(job.requestSnapshot);
  project.settings.duration = "60";
  project.settings.voice = "calm";
  assert.equal(JSON.stringify(job.requestSnapshot), before);
  assert.equal(job.requestHash, hash(job.requestSnapshot));
});

test("legacy scripts hydrate as dialogue and split fields round-trip through the existing SQL configuration", () => {
  const legacy = validateUgcDraftInput(payload);
  assert.ok(legacy.ok);
  assert.equal(legacy.value.spokenDialogue, payload.script);
  assert.equal(legacy.value.sceneDirection, "");
  const parsed = validateUgcDraftInput({ ...payload, script: undefined, sceneDirection: "Gün ışığında ürünü kameraya göster.\nGülümse.", spokenDialogue: "Merhaba!\nBu ürünü çok sevdim." });
  assert.ok(parsed.ok);
  const configuration = serializeUgcConfiguration(parsed.value);
  assert.equal(configuration.script, parsed.value.spokenDialogue);
  assert.notEqual(configuration.script, parsed.value.sceneDirection);
  const reloaded = validateUgcDraftInput({ ...payload, ...JSON.parse(JSON.stringify(configuration)) });
  assert.deepEqual(reloaded, parsed);
  const cleared = validateUgcDraftInput({ ...payload, script: undefined, spokenDialogue: "", sceneDirection: "Keep the scene." });
  assert.ok(cleared.ok);
  assert.equal(cleared.value.script, "");
});

test("split text validates types, independent Unicode limits and conflicting legacy mirrors", () => {
  const split = { ...payload, script: undefined, sceneDirection: "", spokenDialogue: "Hello" };
  for (const invalid of [
    { sceneDirection: null }, { sceneDirection: 1 }, { spokenDialogue: null }, { spokenDialogue: {} },
    { sceneDirection: "x".repeat(3001) }, { spokenDialogue: "x".repeat(3001) },
    { script: "different" }, { script: "x".repeat(3001) },
  ]) assert.deepEqual(validateUgcDraftInput({ ...split, ...invalid }), { ok: false, code: "invalid_input" });
  const boundary = validateUgcDraftInput({ ...split, sceneDirection: "🌞".repeat(3000), spokenDialogue: "ğ".repeat(3000) });
  assert.ok(boundary.ok);
  assert.equal([...serializeUgcConfiguration(boundary.value).script].length, 3000);
});

test("both scene and exact dialogue enter immutable hashes without being combined", async () => {
  const repository = new MemoryRepository();
  const project = { ...ownedProject(), sceneDirection: "Hold the product beside a window.", spokenDialogue: "Merhaba dünya!", script: "Merhaba dünya!" };
  repository.projects.set(projectId, project);
  assert.ok((await prepareUgcJobForUser(userId, projectId, idempotencyKey, repository, hash)).ok);
  const job = [...repository.jobs.values()][0];
  assert.equal(job.requestSnapshot.sceneDirection, project.sceneDirection);
  assert.equal(job.requestSnapshot.spokenDialogue, project.spokenDialogue);
  assert.equal(job.requestSnapshot.script, project.spokenDialogue);
  const before = JSON.stringify(job.requestSnapshot);
  project.sceneDirection = "Pan to the bottle.";
  assert.deepEqual(await prepareUgcJobForUser(userId, projectId, idempotencyKey, repository, hash), { ok: false, code: "conflict" });
  project.sceneDirection = "Hold the product beside a window.";
  project.spokenDialogue = project.script = "Hello world!";
  assert.deepEqual(await prepareUgcJobForUser(userId, projectId, idempotencyKey, repository, hash), { ok: false, code: "conflict" });
  assert.equal(JSON.stringify(job.requestSnapshot), before);
});

test("tiers hydrate legacy drafts as Premium and participate in immutable snapshot idempotency", async () => {
  const legacy = validateUgcDraftInput(payload); assert.ok(legacy.ok); assert.equal(legacy.value.modelTier, "premium");
  const standard = validateUgcDraftInput({ ...payload, modelTier: "standard" }); assert.ok(standard.ok);
  assert.equal(serializeUgcConfiguration(standard.value).modelTier, "standard");
  for (const tier of [null, "unknown", {}, 1]) assert.equal(validateUgcDraftInput({ ...payload, modelTier: tier }).ok, false);
  const repository = new MemoryRepository(); const project = ownedProject(); repository.projects.set(projectId, project);
  assert.equal((await prepareUgcJobCore(userId, projectId, idempotencyKey, repository, hash)).ok, false);
  assert.equal(repository.jobs.size, 0); // No implicit unvalidated model resolver.
  assert.ok((await prepareUgcJobForUser(userId, projectId, idempotencyKey, repository, hash)).ok);
  const saved = [...repository.jobs.values()][0]; const before = JSON.stringify(saved.requestSnapshot);
  assert.deepEqual(saved.requestSnapshot.model, { tier: "premium", provider: "fal", version: 1, endpointId: "bytedance/seedance-2.5/reference-to-video" });
  project.modelTier = "standard";
  assert.deepEqual(await prepareUgcJobForUser(userId, projectId, idempotencyKey, repository, hash), { ok: false, code: "conflict" });
  assert.equal(JSON.stringify(saved.requestSnapshot), before);
});
