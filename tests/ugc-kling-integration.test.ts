import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

import type { UgcPreparedJob } from "../src/features/ugc/ugc-studio-contract";
import { prepareUgcKlingIntegration } from "../src/lib/ugc/ugc-kling-preparation";
import { videoEndpointCapabilities } from "../src/lib/video-generation/capabilities";
import type { UgcKlingTaskReference, UgcKlingVideoProvider } from "../src/lib/ugc/ugc-kling-provider";
import type { SupabaseUgcProjectRepository } from "../src/lib/ugc/ugc-projects";

const ownerId = "10000000-0000-4000-8000-000000000001";
const projectId = "20000000-0000-4000-8000-000000000001";
const jobId = "30000000-0000-4000-8000-000000000001";

function fixture(duration = "30", subtitles = true): UgcPreparedJob {
  return {
    id: jobId, ownerId, projectId, idempotencyKey: jobId, requestHash: "a".repeat(64), status: "draft", createdAt: "2026-10-25T10:00:00Z",
    requestSnapshot: {
      creatorConcept: { selectionId: "ada", referenceType: "placeholder_visual" }, format: "testimonial", script: "Meet our serum.",
      product: { objectPath: `${ownerId}/${projectId}/${jobId}.webp`, contentType: "image/webp", byteSize: 4000, fileName: "serum.webp" },
      settings: { language: "tr", tone: "natural", voice: "warm", environment: "home", lighting: "daylight", framing: "medium", duration, aspectRatio: "9:16", subtitles },
    },
  };
}

function loadModule(file: string, dependencies: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(compiled, { exports, require(name: string) {
    if (name === "server-only") return {};
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  return exports;
}

test("all current UGC durations remain unsupported without truncation or snapshot mutation", () => {
  for (const duration of ["15", "30", "60"]) {
    const job = fixture(duration);
    const original = JSON.stringify(job);
    Object.freeze(job.requestSnapshot.settings);
    Object.freeze(job.requestSnapshot);
    const plan = prepareUgcKlingIntegration(job);
    assert.equal(plan.endpointId, videoEndpointCapabilities.klingV3ProImage.endpointId);
    assert.equal(plan.modelId, videoEndpointCapabilities.klingV3ProImage.id);
    assert.equal(plan.submitted, false);
    assert.equal(plan.generationEnabled, false);
    for (const blocker of ["unsupported_duration", "creator_reference_unavailable", "prepared_start_frame_required", "source_ratio_verification_required", "speech_pipeline_required", "subtitle_pipeline_required"]) {
      assert.ok(plan.blockers.includes(blocker as (typeof plan.blockers)[number]));
    }
    assert.equal(JSON.stringify(job), original);
    assert.equal(plan.requestHash, job.requestHash);
    assert.deepEqual(plan.output, { bucketId: "ugc-generated-videos", objectPath: `${ownerId}/${projectId}/${jobId}.mp4`, contentType: "video/mp4" });
  }
  assert.ok(!prepareUgcKlingIntegration(fixture("15", false)).blockers.includes("subtitle_pipeline_required"));
});

test("invalid settings and cross-owner sources cannot become prepared provider input", () => {
  const invalid = fixture("5");
  assert.ok(prepareUgcKlingIntegration(invalid).blockers.includes("invalid_snapshot"));
  const crossOwner = fixture();
  crossOwner.requestSnapshot.product = { objectPath: `other/${projectId}/${jobId}.webp` };
  assert.ok(prepareUgcKlingIntegration(crossOwner).blockers.includes("invalid_snapshot"));
  const invalidIdentity = { ...fixture(), id: "../output" };
  assert.equal(prepareUgcKlingIntegration(invalidIdentity).output, null);
});

test("UGC adapter blocks concurrent/repeated submission before constructing the shared client", async () => {
  let constructed = 0;
  const loaded = loadModule("src/lib/ugc/ugc-kling-provider.ts", {
    "@/lib/video-generation/capabilities": { videoEndpointCapabilities },
    "@/lib/video-generation/fal-provider": { FalVideoGenerationProvider: class { constructor() { constructed++; throw new Error("No live transport permitted"); } } },
  });
  const create = loaded.createUgcVideoProvider as () => UgcKlingVideoProvider;
  const provider = create();
  const job = fixture();
  const request = { idempotencyKey: job.idempotencyKey, projectId, requestHash: job.requestHash, snapshot: job.requestSnapshot };
  const results = await Promise.all(Array.from({ length: 20 }, () => provider.submit(request)));
  assert.ok(results.every(result => result.kind === "blocked" && result.safeErrorCode === "generation_disabled"));
  assert.equal(constructed, 0);
});

test("UGC delegates status/result to the existing Kling endpoint and does not equate completion with success", async () => {
  const calls: string[][] = [];
  const file = { url: "https://v3.fal.media/output.mp4", contentType: "video/mp4", sizeBytes: 32 };
  const loaded = loadModule("src/lib/ugc/ugc-kling-provider.ts", {
    "@/lib/video-generation/capabilities": { videoEndpointCapabilities },
    "@/lib/video-generation/fal-provider": { FalVideoGenerationProvider: class {} },
  });
  const Provider = loaded.UgcKlingVideoProvider as typeof UgcKlingVideoProvider;
  for (const status of ["queued", "processing", "completed"] as const) {
    const provider = new Provider(() => ({
      getStatus: async (endpoint, id) => { calls.push([endpoint, id]); return status; },
      getResult: async (endpoint, id) => { calls.push([endpoint, id]); return file; },
    }));
    assert.equal(await provider.getStatus("existing-task"), status);
    assert.equal(await provider.getResult("existing-task"), file);
    await assert.rejects(provider.getStatus(""));
    await assert.rejects(provider.getResult("bad task"));
  }
  assert.equal(calls.length, 6);
  assert.ok(calls.every(([endpoint, id]) => endpoint === videoEndpointCapabilities.klingV3ProImage.endpointId && id === "existing-task"));
  const failed = new Provider(() => ({ getStatus: async () => { throw new Error("temporary"); }, getResult: async () => file }));
  await assert.rejects(failed.getStatus("existing-task"), /temporary/);
});

test("repository idempotency rejects identical snapshots from a different project including insert races", async () => {
  const job = fixture();
  for (const race of [false, true]) {
    let lookups = 0;
    const row = { id: job.id, owner_id: ownerId, project_id: "different-project", request_hash: job.requestHash, status: "draft" };
    const chain = {
      select() { return chain; }, eq() { return chain; },
      maybeSingle: async () => ({ data: race && lookups++ === 0 ? null : row, error: null }),
      insert() { return chain; }, single: async () => ({ data: null, error: { code: "23505" } }),
    };
    const loaded = loadModule("src/lib/ugc/ugc-projects.ts", {
      "@/lib/supabase/admin": { getSupabaseAdminClient: () => ({ from: () => chain }) },
      "@/lib/supabase/server": {},
      "@/features/ugc/ugc-studio-contract": {},
    });
    const Repository = loaded.SupabaseUgcProjectRepository as typeof SupabaseUgcProjectRepository;
    const result = await new Repository().prepareJob(job);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "conflict");
  }
});

test("owned task mapping checks pinned routing, preserves monotonic status, and waits for persistence", async () => {
  const loaded = loadModule("src/lib/ugc/ugc-kling-provider.ts", {
    "@/lib/video-generation/capabilities": { videoEndpointCapabilities },
    "@/lib/video-generation/fal-provider": { FalVideoGenerationProvider: class {} },
  });
  let polls = 0;
  let observed: "queued" | "completed" = "completed";
  const Provider = loaded.UgcKlingVideoProvider as typeof UgcKlingVideoProvider;
  const provider = new Provider(() => ({
    getStatus: async () => { polls++; return observed; },
    getResult: async () => { throw new Error("Worker persistence is not installed"); },
  }));
  const task: UgcKlingTaskReference = { ownerId, provider: "fal", modelId: provider.modelId, endpointId: provider.endpointId, providerRequestId: "task-1", status: "queued" };
  for (const invalid of [
    { ...task, ownerId: "someone-else" }, { ...task, endpointId: "different-endpoint" },
    { ...task, modelId: "different-model" }, { ...task, provider: "different-provider" },
    { ...task, providerRequestId: null }, { ...task, status: "provider_submission_ambiguous" as const },
  ]) assert.equal((await provider.inspectOwnedTask(ownerId, invalid)).kind, "blocked");
  for (const status of ["draft", "failed", "succeeded"] as const) {
    assert.equal((await provider.inspectOwnedTask(ownerId, { ...task, status })).kind, "unchanged");
  }
  assert.equal(polls, 0);
  const completed = await provider.inspectOwnedTask(ownerId, task);
  assert.equal(completed.kind, "observed");
  if (completed.kind === "observed") {
    assert.equal(completed.status, "processing");
    assert.equal(completed.outputReady, true);
  }
  observed = "queued";
  const stale = await provider.inspectOwnedTask(ownerId, { ...task, status: "processing" });
  assert.equal(stale.kind, "observed");
  if (stale.kind === "observed") assert.equal(stale.status, "processing");
});
