import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createContext, runInContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import sharp from "sharp";
import type * as Planner from "../src/lib/ugc/ugc-request-planner";
import type * as Submission from "../src/lib/ugc/ugc-fal-submission";
import type * as Pipeline from "../src/lib/ugc/ugc-pipeline";
import type * as Media from "../src/lib/ugc/ugc-private-media";
import type * as Seedance from "../src/lib/ugc/ugc-seedance-planner";
import type * as SeedanceProvider from "../src/lib/ugc/ugc-seedance-provider";
import type { UgcClaim, UgcClaimPatch, UgcPipelineJob, UgcPipelineRepository, UgcStoredVideo, UgcLegacyKlingTaskPlan } from "../src/lib/ugc/ugc-pipeline-types";

const requirePackage = createRequire(import.meta.url);
const ownerId = "10000000-0000-4000-8000-000000000001";
const projectId = "20000000-0000-4000-8000-000000000001";
const jobId = "30000000-0000-4000-8000-000000000001";
const imagePath = `${ownerId}/${projectId}/${jobId}.webp`;
const fakeFetch: typeof fetch = async () => { throw new Error("Live network forbidden in UGC tests"); };
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object" && value !== null) return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function harness(overrides: Record<string, unknown> = {}) {
  const context = createContext({ Buffer, URL, AbortSignal, Response, ReadableStream, TransformStream, console,
    fetch: fakeFetch, process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" } } });
  runInContext("globalThis.structuredClone = value => JSON.parse(JSON.stringify(value))", context);
  const cache = new Map<string, Record<string, unknown>>();
  function load(name: string): Record<string, unknown> {
    if (name in overrides) return overrides[name] as Record<string, unknown>;
    if (name === "server-only") return {};
    if (!name.startsWith("@/")) return requirePackage(name);
    if (cache.has(name)) return cache.get(name)!;
    const source = readFileSync(`src/${name.slice(2)}.ts`, "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const exports: Record<string, unknown> = {};
    cache.set(name, exports);
    const evaluate = runInContext(`(function(require, exports) { ${compiled}\n })`, context);
    evaluate(load, exports);
    return exports;
  }
  const planner = load("@/lib/ugc/ugc-request-planner") as typeof Planner;
  const pipeline = load("@/lib/ugc/ugc-pipeline") as typeof Pipeline;
  const submission = load("@/lib/ugc/ugc-fal-submission") as typeof Submission;
  return { load, planner, pipeline, submission };
}

function job(): UgcPipelineJob {
  const image = { objectPath: imagePath, sha256: "a".repeat(64), width: 108, height: 192 };
  const requestSnapshot = {
    creatorConcept: { selectionId: "ada", referenceType: "image_reference" }, product: { objectPath: imagePath },
    format: "demo", script: "", spokenDialogue: "", sceneDirection: "Lift the product slowly.",
    settings: { language: "en", voice: "warm", tone: "natural", environment: "home", lighting: "daylight", framing: "medium", duration: "15", aspectRatio: "9:16", subtitles: false },
    referenceImages: { startImage: image, creator: { frontal: image, references: [image] }, product: { frontal: image, references: [image] } },
  };
  return { id: jobId, ownerId, projectId, requestSnapshot, requestHash: createHash("sha256").update(stable(requestSnapshot)).digest("hex"),
    status: "draft", providerRequestId: null, providerPlan: null, attempts: 0 };
}
function rehash(value: UgcPipelineJob) { value.requestHash = createHash("sha256").update(stable(value.requestSnapshot)).digest("hex"); return value; }
const output: UgcStoredVideo = { bucketId: "ugc-generated-videos", objectPath: `${ownerId}/${projectId}/${jobId}.mp4`, contentType: "video/mp4", byteSize: 1024, durationSeconds: 15 };

class MemoryRepository implements UgcPipelineRepository {
  records = new Map<string, UgcPipelineJob>();
  claims = new Map<string, UgcClaim>();
  patches: UgcClaimPatch[] = [];
  version = 0;
  async findOwned(owner: string, id: string) { const found = this.records.get(id); return found?.ownerId === owner ? structuredClone(found) : null; }
  async claimSubmission(value: UgcPipelineJob, plan: Planner.UgcVisualPlan) {
    const current = this.records.get(value.id);
    if (!current || current.status !== "draft" || current.requestHash !== value.requestHash
      || !planMatchesSnapshot(plan, current.requestSnapshot)
      || [...this.records.values()].some(record => record.projectId === current.projectId && ["queued", "processing", "provider_submission_ambiguous"].includes(record.status))) return null;
    current.status = "queued"; current.providerPlan = structuredClone(plan);
    return this.claim(current);
  }
  private claim(current: UgcPipelineJob) {
    const claim = { job: structuredClone(current), token: `token-${++this.version}`, version: this.version };
    this.claims.set(current.id, claim); return structuredClone(claim);
  }
  async claimReconciliation(owner: string, id: string) {
    const current = this.records.get(id);
    if (!current || current.ownerId !== owner || this.claims.has(id)
      || (!["queued", "processing"].includes(current.status)
        && !(current.status === "provider_submission_ambiguous" && Boolean(current.providerRequestId)))) return null;
    current.attempts++; return this.claim(current);
  }
  async finish(claim: UgcClaim, patch: UgcClaimPatch) {
    const active = this.claims.get(claim.job.id);
    const current = this.records.get(claim.job.id)!;
    if (active?.token !== claim.token || active.version !== claim.version) return false;
    assert.ok(!(current.status === "processing" && patch.status === "queued"));
    if (patch.status === "succeeded") assert.ok(patch.output);
    this.patches.push(patch); current.status = patch.status;
    if (patch.providerRequestId) current.providerRequestId = patch.providerRequestId;
    this.claims.delete(current.id); return true;
  }
  async isCurrent(claim: UgcClaim) { return this.claims.get(claim.job.id)?.token === claim.token; }
}
function planMatchesSnapshot(plan: Planner.UgcVisualPlan | UgcLegacyKlingTaskPlan, snapshot: Record<string, unknown>) {
  const model = snapshot.model as { tier?: string } | undefined;
  return plan.version === 1 ? model === undefined
    : plan.version === 2 ? model === undefined || model.tier === "premium"
      : model?.tier === "standard";
}
function dependencies(repository: MemoryRepository): Pipeline.UgcPipelineDependencies {
  return { repository, planRequest: harness().planner.planUgcKlingRequest, media: { resolveInput: async () => ({ start_image_url: "https://signed.invalid/source", prompt: "motion", duration: "15", generate_audio: false, enable_safety_checker: true, elements: [] }), recover: async () => null, persist: async () => output },
    transport: { submit: async () => "task-1", getStatus: async () => "completed", getResult: async () => ({ url: "https://v3.fal.media/video.mp4", contentType: "video/mp4", sizeBytes: 1024 }) } };
}

test("15-second planner pins references/visual inputs and rejects every unsupported speech setting", () => {
  const { planner } = harness();
  const value = job();
  const before = JSON.stringify(value);
  const planned = planner.planUgcKlingRequest(value);
  assert.ok(planned.ok);
  assert.equal(planned.plan.durationSeconds, 15);
  assert.ok(planned.plan.prompt.includes("@Element1"));
  assert.ok(planned.plan.prompt.includes("home"));
  assert.ok(planned.plan.prompt.includes("medium"));
  assert.equal(JSON.stringify(value), before);
  assert.equal(planner.planUgcKlingRequest({ ...value, requestHash: "b".repeat(64) }).ok, false);
  const speech = job();
  speech.requestSnapshot.spokenDialogue = speech.requestSnapshot.script = "Merhaba dünya!";
  (speech.requestSnapshot.settings as Record<string, unknown>).language = "tr";
  (speech.requestSnapshot.settings as Record<string, unknown>).subtitles = true;
  speech.requestSnapshot.creatorConcept = { selectionId: "ada", referenceType: "placeholder_visual" };
  const blocked = planner.planUgcKlingRequest(rehash(speech));
  assert.ok(!blocked.ok);
  for (const issue of ["exact_dialogue_unverified", "turkish_speech_unsupported", "voice_selection_unverified", "lip_sync_unverified", "subtitles_unsupported", "creator_reference_unavailable"]) assert.ok(blocked.issues.includes(issue as Planner.UgcPlanningIssue));
  for (const duration of ["30", "60"]) {
    const other = job(); (other.requestSnapshot.settings as Record<string, unknown>).duration = duration;
    const result = planner.planUgcKlingRequest(rehash(other));
    assert.ok(!result.ok && result.issues.includes("unsupported_duration"));
  }
  const mismatched = job();
  (mismatched.requestSnapshot.settings as Record<string, unknown>).aspectRatio = "16:9";
  const mismatch = planner.planUgcKlingRequest(rehash(mismatched));
  assert.ok(!mismatch.ok && mismatch.issues.includes("source_ratio_mismatch"));
});

test("documented Kling payload uses signed references without ratio, voice or dialogue inventions", () => {
  const { planner, submission } = harness();
  const planned = planner.planUgcKlingRequest(job()); assert.ok(planned.ok);
  const input = submission.buildUgcKlingInput(planned.plan, new Map([[imagePath, "https://private.invalid/signed?token=secret"]]));
  assert.equal(input.duration, "15"); assert.equal(input.generate_audio, false);
  assert.equal(input.elements.length, 2);
  assert.equal(input.elements[0].reference_image_urls.length, 1);
  for (const invented of ["aspect_ratio", "voice", "language", "spoken_dialogue", "lip_sync"]) assert.ok(!(invented in input));
  assert.throws(() => submission.buildUgcKlingInput(planned.plan, new Map()));
});

test("JSONB key reordering preserves canonical snapshot and plan identity", () => {
  const { planner } = harness();
  const value = job();
  const first = planner.planUgcKlingRequest(value); assert.ok(first.ok);
  function reorder(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(reorder);
    if (typeof input === "object" && input !== null) return Object.fromEntries(Object.entries(input).reverse().map(([key, child]) => [key, reorder(child)]));
    return input;
  }
  value.requestSnapshot = reorder(value.requestSnapshot) as Record<string, unknown>;
  const after = planner.planUgcKlingRequest(value); assert.ok(after.ok);
  assert.equal(after.plan.snapshotDigest, first.plan.snapshotDigest);
  assert.equal(planner.canonicalUgcJson(after.plan), planner.canonicalUgcJson(reorder(first.plan)));
});

test("shared fal task reader preserves valid status mappings and rejects unknown provider responses", async () => {
  let status = "IN_QUEUE";
  const { load } = harness({ "@fal-ai/client": { createFalClient: () => ({ queue: {
    status: async () => ({ status }), result: async () => ({ data: { wrong: "output" } }),
  } }) } });
  const { FalVideoGenerationProvider } = load("@/lib/video-generation/fal-provider") as typeof import("../src/lib/video-generation/fal-provider");
  const provider = new FalVideoGenerationProvider("fake-test-key");
  for (const [raw, expected] of [["IN_QUEUE", "queued"], ["IN_PROGRESS", "processing"], ["COMPLETED", "completed"]]) {
    status = raw; assert.equal(await provider.getStatus("endpoint", "task"), expected);
  }
  status = "UNKNOWN"; await assert.rejects(provider.getStatus("endpoint", "task"));
  await assert.rejects(provider.getResult("endpoint", "task"));
});

test("actual fal SDK cannot repeat a UGC POST on network errors, 429/502/503/504 or malformed responses", async () => {
  const { planner, submission } = harness();
  const planned = planner.planUgcKlingRequest(job()); assert.ok(planned.ok);
  const input = submission.buildUgcKlingInput(planned.plan, new Map([[imagePath, "https://private.invalid/image"]]));
  for (const status of [429, 502, 503, 504, 0, 200]) {
    let sent = 0;
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      sent++; assert.equal(init?.redirect, "error");
      if (!status) throw new TypeError("fetch failed");
      return new Response(status === 200 ? "not json" : "{}", { status });
    };
    await assert.rejects(submission.submitUgcKlingOnce(input, { credentials: "test-key-never-live", fetch }));
    assert.equal(sent, 1);
  }
  let sent = 0;
  assert.equal(await submission.submitUgcKlingOnce(input, { credentials: "test-key-never-live", fetch: async () => { sent++; return Response.json({ request_id: "task-123" }); } }), "task-123");
  assert.equal(sent, 1);
});

test("duplicate job claims and different keys for one project submit at most once", async () => {
  const { pipeline } = harness(); const repository = new MemoryRepository(); const deps = dependencies(repository);
  repository.records.set(jobId, job());
  let calls = 0; deps.transport.submit = async () => { calls++; return "task-1"; };
  await Promise.all(Array.from({ length: 10 }, () => pipeline.verifyUgcSubmission(ownerId, jobId, deps)));
  assert.equal(calls, 1); assert.equal(repository.records.get(jobId)?.providerRequestId, "task-1");
  const other = { ...job(), id: "30000000-0000-4000-8000-000000000002" }; repository.records.set(other.id, other);
  await pipeline.verifyUgcSubmission(ownerId, other.id, deps); assert.equal(calls, 1);
  const rejected = await pipeline.verifyUgcSubmission("other-owner", jobId, deps);
  assert.ok("kind" in rejected && rejected.kind === "not_found");
  assert.equal((await pipeline.requestUgcGeneration()).code, "generation_disabled");
});

test("uncertain submissions and failed task attachment never retry paid submission", async () => {
  for (const attachFailure of [false, true]) {
    const { pipeline } = harness(); const repository = new MemoryRepository(); const deps = dependencies(repository);
    repository.records.set(jobId, job()); let calls = 0;
    deps.transport.submit = async () => { calls++; if (!attachFailure) throw new Error("timeout"); return "task-accepted"; };
    const finish = repository.finish.bind(repository);
    repository.finish = async (claim, patch) => { if (patch.providerRequestId) throw new Error("database unavailable"); return finish(claim, patch); };
    assert.equal((await pipeline.verifyUgcSubmission(ownerId, jobId, deps) as { kind: string }).kind, "ambiguous");
    await pipeline.verifyUgcSubmission(ownerId, jobId, deps);
    assert.equal(calls, 1); assert.equal(repository.records.get(jobId)?.status, "provider_submission_ambiguous");
  }
});

test("expired claims without IDs become ambiguous and stale leases cannot commit", async () => {
  const { pipeline, planner } = harness(); const repository = new MemoryRepository(); const deps = dependencies(repository);
  const value = job(); repository.records.set(jobId, value);
  const plan = planner.planUgcKlingRequest(value); assert.ok(plan.ok);
  const old = await repository.claimSubmission(value, plan.plan); assert.ok(old);
  repository.claims.delete(jobId); // Simulate process death and lease expiry; never reclaim for POST.
  assert.equal((await pipeline.verifyUgcReconciliation(ownerId, jobId, deps)).kind, "ambiguous");
  assert.equal(await repository.finish(old, { status: "queued", providerRequestId: "late-task" }), false);
});

test("source failure or expired claim prevents any provider POST", async () => {
  for (const expired of [false, true]) {
    const { pipeline } = harness(); const repository = new MemoryRepository(); const deps = dependencies(repository);
    repository.records.set(jobId, job()); let sent = 0;
    deps.transport.submit = async () => { sent++; return "task"; };
    if (expired) {
      const resolve = deps.media.resolveInput;
      deps.media.resolveInput = async (...args) => { repository.claims.delete(jobId); return resolve(...args); };
    } else deps.media.resolveInput = async () => { throw new Error("private source unavailable"); };
    await pipeline.verifyUgcSubmission(ownerId, jobId, deps);
    assert.equal(sent, 0);
  }
});

test("reconciliation preserves processing, recovers uploaded output and commits success only after persistence", async () => {
  const { pipeline } = harness(); const repository = new MemoryRepository(); const deps = dependencies(repository);
  repository.records.set(jobId, job()); await pipeline.verifyUgcSubmission(ownerId, jobId, deps);
  repository.records.get(jobId)!.status = "processing";
  deps.transport.getStatus = async () => "queued";
  await pipeline.verifyUgcReconciliation(ownerId, jobId, deps);
  assert.equal(repository.records.get(jobId)?.status, "processing");
  deps.transport.getStatus = async () => "completed";
  deps.media.persist = async () => { throw new Error("storage offline"); };
  assert.equal((await pipeline.verifyUgcReconciliation(ownerId, jobId, deps)).kind, "output_retry");
  assert.equal(repository.records.get(jobId)?.status, "processing");
  deps.media.recover = async () => output;
  deps.transport.getStatus = async () => { throw new Error("Should recover private object before polling"); };
  assert.equal((await pipeline.verifyUgcReconciliation(ownerId, jobId, deps)).kind, "succeeded");
  assert.equal(repository.patches.at(-1)?.output?.objectPath, output.objectPath);
  assert.equal((await pipeline.verifyUgcReconciliation("not-owner", jobId, deps)).kind, "unchanged");
});

test("invalid output and retry exhaustion produce safe terminal errors", async () => {
  const { pipeline, load } = harness();
  const { UgcOutputInvalidError } = load("@/lib/ugc/ugc-pipeline-types") as typeof import("../src/lib/ugc/ugc-pipeline-types");
  for (const exhausted of [false, true]) {
    const repository = new MemoryRepository(); const deps = dependencies(repository);
    repository.records.set(jobId, job()); await pipeline.verifyUgcSubmission(ownerId, jobId, deps);
    if (exhausted) repository.records.get(jobId)!.attempts = 24;
    deps.media.persist = async () => { throw new UgcOutputInvalidError(); };
    await pipeline.verifyUgcReconciliation(ownerId, jobId, deps);
    assert.equal(repository.records.get(jobId)?.status, "failed");
    assert.equal(repository.patches.at(-1)?.errorCode, exhausted ? "retry_limit_reached" : "output_invalid");
  }
});

function mp4(duration = 15, width = 108, height = 192) {
  const box = (type: string, ...parts: Buffer[]) => { const body = Buffer.concat(parts); const head = Buffer.alloc(8); head.writeUInt32BE(body.length + 8); head.write(type, 4, "ascii"); return Buffer.concat([head, body]); };
  const tkhd = Buffer.alloc(84); tkhd.writeUInt32BE(width * 65536, 76); tkhd.writeUInt32BE(height * 65536, 80);
  const mdhd = Buffer.alloc(24); mdhd.writeUInt32BE(1000, 12); mdhd.writeUInt32BE(duration * 1000, 16);
  const hdlr = Buffer.alloc(24); hdlr.write("vide", 8, "ascii");
  return Buffer.concat([box("ftyp", Buffer.from("isom0000")), box("moov", box("trak", box("tkhd", tkhd), box("mdia", box("mdhd", mdhd), box("hdlr", hdlr)))), box("mdat", Buffer.from([1, 2, 3]))]);
}

test("MP4 inspection rejects malformed containers, missing video, wrong duration and wrong ratio", () => {
  const { load } = harness({ "@/lib/supabase/admin": {} });
  const { inspectUgcMp4 } = load("@/lib/ugc/ugc-private-media") as typeof Media;
  assert.equal(inspectUgcMp4(mp4(), "9:16").durationSeconds, 15);
  for (const bytes of [Buffer.from("not video"), mp4().subarray(0, 100), mp4(30), mp4(15, 192, 108)]) assert.throws(() => inspectUgcMp4(bytes, "9:16"));
});

test("private output persistence rejects malicious responses and accepts bounded chunked MP4 without public URLs", async () => {
  let uploads = 0;
  const { load } = harness({ "@/lib/supabase/admin": { getSupabaseAdminClient: () => ({ storage: { from: (bucket: string) => ({ upload: async (path: string, _bytes: Buffer, options: { upsert: boolean }) => {
    uploads++; assert.equal(bucket, "ugc-generated-videos"); assert.equal(path, output.objectPath); assert.equal(options.upsert, false); return { error: null };
  } }) } }) } });
  const { SupabaseUgcPrivateMedia } = load("@/lib/ugc/ugc-private-media") as typeof Media;
  let downloads = 0;
  const media = new SupabaseUgcPrivateMedia(async (_url, init) => { downloads++; assert.equal(init?.redirect, "error"); return new Response(mp4(), { headers: { "content-type": "video/mp4" } }); });
  for (const file of [
    { url: "http://v3.fal.media/output", contentType: "video/mp4", sizeBytes: null },
    { url: "https://fal.media.evil.invalid/out", contentType: "video/mp4", sizeBytes: null },
    { url: "https://v3.fal.media/out", contentType: "text/html", sizeBytes: null },
  ]) await assert.rejects(media.persist(job(), file));
  assert.equal(downloads, 0);
  const result = await media.persist(job(), { url: "https://v3.fal.media/out", contentType: "video/mp4", sizeBytes: null });
  assert.equal(result.durationSeconds, 15); assert.equal(uploads, 1);
  const html = new SupabaseUgcPrivateMedia(async () => new Response("html", { headers: { "content-type": "text/html" } }));
  await assert.rejects(html.persist(job(), { url: "https://v3.fal.media/out", contentType: "video/mp4", sizeBytes: null }));
  const oversized = new SupabaseUgcPrivateMedia(async () => new Response(mp4(), { headers: { "content-type": "video/mp4", "content-length": "262144001" } }));
  await assert.rejects(oversized.persist(job(), { url: "https://v3.fal.media/out", contentType: "video/mp4", sizeBytes: null }));
});

test("source resolution rejects cross-owner references and changed image bytes before signing", async () => {
  const bytes = await sharp({ create: { width: 108, height: 192, channels: 3, background: "white" } }).webp().toBuffer();
  let signed = 0;
  const { load, planner } = harness({ "@/lib/supabase/admin": { getSupabaseAdminClient: () => ({ storage: { from: () => ({
    download: async () => ({ data: new Blob([Uint8Array.from(bytes)], { type: "image/webp" }), error: null }),
    createSignedUrl: async () => { signed++; return { data: { signedUrl: "https://project.supabase.co/storage/v1/object/sign/ugc-product-assets/source?token=secret" }, error: null }; },
  }) } }) } });
  const { SupabaseUgcPrivateMedia } = load("@/lib/ugc/ugc-private-media") as typeof Media;
  const media = new SupabaseUgcPrivateMedia(fakeFetch);
  const planned = planner.planUgcKlingRequest(job()); assert.ok(planned.ok);
  await assert.rejects(media.resolveInput(job(), planned.plan)); assert.equal(signed, 0);
  for (const image of [planned.plan.startImage, ...planned.plan.elements.flatMap(element => [element.frontal, ...element.references])]) image.sha256 = createHash("sha256").update(bytes).digest("hex");
  const input = await media.resolveInput(job(), planned.plan); assert.equal(input.elements.length, 2); assert.equal(signed, 1);
  planned.plan.startImage.objectPath = `other/${projectId}/${jobId}.webp`;
  await assert.rejects(media.resolveInput(job(), planned.plan)); assert.equal(signed, 1);
});

test("private result access checks authenticated identity, owned success and exact output path before signing", async () => {
  let signed = 0;
  let user = ownerId;
  let row: Record<string, unknown> | null = { id: jobId, owner_id: ownerId, project_id: projectId, status: "succeeded", output_bucket_id: "ugc-generated-videos", output_object_path: output.objectPath };
  const chain = { select() { return chain; }, eq() { return chain; }, maybeSingle: async () => ({ data: row, error: null }) };
  const { load } = harness({ "@/lib/supabase/admin": {}, "@/lib/supabase/server": { createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: user } } }) }, from: () => chain,
    storage: { from: () => ({ createSignedUrl: async (_path: string, ttl: number) => { signed++; assert.equal(ttl, 300); return { data: { signedUrl: "private-signed" }, error: null }; } }) },
  }) } });
  const { createOwnedUgcVideoAccess } = load("@/lib/ugc/ugc-private-media") as typeof Media;
  user = "other"; assert.equal(await createOwnedUgcVideoAccess(ownerId, jobId), null); assert.equal(signed, 0);
  user = ownerId; row!.output_object_path = "other/path.mp4";
  assert.equal(await createOwnedUgcVideoAccess(ownerId, jobId), null); assert.equal(signed, 0);
  row!.output_object_path = output.objectPath;
  assert.equal(await createOwnedUgcVideoAccess(ownerId, jobId), "private-signed"); assert.equal(signed, 1);
  row = null; assert.equal(await createOwnedUgcVideoAccess(ownerId, jobId), null);
});

test("forward-only migration contains bounded atomic/fenced claims and service-only permissions", () => {
  const sql = readFileSync("database/migrations/20261104000000_prepare_ugc_pipeline_claims.sql", "utf8");
  assert.match(sql, /for update skip locked/);
  assert.match(sql, /submission_started_at is null/);
  assert.match(sql, /lease_token = p_token and lease_version = p_version and lease_expires_at > clock_timestamp\(\)/);
  assert.match(sql, /provider plan is immutable/);
  assert.match(sql, /provider task identity is immutable/);
  assert.match(sql, /from public, anon, authenticated/);
  assert.doesNotMatch(sql.replace(/--[^\n]*/g, ""), /cron|http_post|billing|credits/i);
});

function seedanceJob() {
  const value = job();
  delete value.requestSnapshot.referenceImages;
  const product = { objectPath: imagePath, sha256: "a".repeat(64), width: 720, height: 1280 };
  value.requestSnapshot.seedanceReferences = { product, creator: { ...product, objectPath: imagePath.replace(jobId, "40000000-0000-4000-8000-000000000001") } };
  return rehash(value);
}

test("Seedance pins its independent route, positional references and separate immutable brief", () => {
  const { load, submission } = harness();
  const { planUgcSeedanceRequest, ugcSeedanceRoute } = load("@/lib/ugc/ugc-seedance-planner") as typeof Seedance;
  const value = seedanceJob(); const before = JSON.stringify(value);
  const result = planUgcSeedanceRequest(value); assert.ok(result.ok);
  assert.equal(result.plan.endpointId, "bytedance/seedance-2.5/reference-to-video");
  assert.equal(result.plan.endpointId, ugcSeedanceRoute.endpointId);
  assert.equal(result.plan.version, 2); assert.equal(result.plan.generateAudio, false);
  assert.equal(result.plan.brief.sceneDirection, value.requestSnapshot.sceneDirection);
  assert.equal(result.plan.brief.spokenDialogue, "");
  assert.ok(result.plan.prompt.includes("@Image1")); assert.ok(result.plan.prompt.includes("@Image2"));
  const urls = new Map(result.plan.images.map((image, index) => [image.objectPath, `https://private.invalid/${index}?token=secret`]));
  const input = submission.buildUgcSeedanceInput(result.plan, urls);
  assert.deepEqual(Array.from(input.image_urls), Array.from(urls.values()));
  assert.equal(input.aspect_ratio, "9:16"); assert.equal(input.duration, "15"); assert.equal(input.codec, "H264");
  for (const unsupported of ["elements", "start_image_url", "voice", "language", "audio_urls", "video_urls"]) assert.ok(!(unsupported in input));
  assert.equal(input.generate_audio, false); assert.equal(input.task, "reference");
  assert.equal(JSON.stringify(value), before);
  assert.ok(!JSON.stringify(result.plan).includes("https://"));
  assert.throws(() => submission.buildUgcSeedanceInput(result.plan, new Map()));
  assert.throws(() => submission.buildUgcSeedanceInput({ ...result.plan, durationSeconds: 60 } as unknown as Seedance.UgcSeedanceVisualPlan, urls));
  assert.ok(!planUgcSeedanceRequest({ ...value, requestHash: "f".repeat(64) }).ok);
  // Changes to a returned plan cannot mutate the source snapshot.
  result.plan.images[0].sha256 = "f".repeat(64);
  assert.equal(JSON.stringify(value), before);
});

test("Seedance rejects speech, captions, long durations, legacy elements, extra modalities and unowned references", () => {
  const { load } = harness();
  const { planUgcSeedanceRequest } = load("@/lib/ugc/ugc-seedance-planner") as typeof Seedance;
  const check = (value: UgcPipelineJob, issue: Planner.UgcPlanningIssue) => {
    const result = planUgcSeedanceRequest(rehash(value));
    assert.ok(!result.ok && result.issues.includes(issue), issue);
  };
  for (const duration of ["60"]) {
    const value = seedanceJob(); (value.requestSnapshot.settings as Record<string, unknown>).duration = duration;
    check(value, "unsupported_duration");
  }
  for (const language of ["tr", "en"]) {
    const value = seedanceJob(); value.requestSnapshot.script = value.requestSnapshot.spokenDialogue = "Keep these exact words.";
    (value.requestSnapshot.settings as Record<string, unknown>).language = language;
    for (const issue of ["exact_dialogue_unverified", "voice_selection_unverified", "lip_sync_unverified"] as const) check(value, issue);
    if (language === "tr") check(value, "turkish_speech_unsupported");
  }
  const captions = seedanceJob(); (captions.requestSnapshot.settings as Record<string, unknown>).subtitles = true;
  check(captions, "subtitles_unsupported");
  const placeholder = seedanceJob(); placeholder.requestSnapshot.creatorConcept = { selectionId: "ada", referenceType: "placeholder_visual" };
  check(placeholder, "creator_reference_unavailable");
  const old = seedanceJob(); old.requestSnapshot.referenceImages = job().requestSnapshot.referenceImages;
  check(old, "reference_inputs_unsupported");
  const audio = seedanceJob(); (audio.requestSnapshot.seedanceReferences as Record<string, unknown>).audio = [];
  check(audio, "reference_inputs_unsupported");
  const unowned = seedanceJob(); (unowned.requestSnapshot.seedanceReferences as { creator: { objectPath: string } }).creator.objectPath = "other/private.webp";
  check(unowned, "reference_images_unavailable");
  const longPrompt = seedanceJob(); longPrompt.requestSnapshot.sceneDirection = "x".repeat(3000);
  check(longPrompt, "prompt_too_long");
  // Legacy UI draft bytes/hash stay intact and are rejected, never silently upgraded.
  const legacy = job(); const before = JSON.stringify(legacy); check(legacy, "reference_inputs_unsupported");
  assert.equal(JSON.stringify(legacy), before);
});

test("Seedance adapter blocks concurrent submissions without constructing transport and scopes pinned task reads", async () => {
  const { load } = harness();
  const { UgcSeedanceVideoProvider, createUgcVideoProvider } = load("@/lib/ugc/ugc-seedance-provider") as typeof SeedanceProvider;
  let reads = 0; let status: "queued" | "processing" | "completed" = "queued";
  const provider: SeedanceProvider.UgcSeedanceVideoProvider = new UgcSeedanceVideoProvider(() => { reads++; return {
    getStatus: async (endpoint, task) => { assert.equal(endpoint, provider.endpointId); assert.equal(task, "task-1"); return status; },
    getResult: async endpoint => { assert.equal(endpoint, provider.endpointId); return { url: "https://v3.fal.media/output.mp4", contentType: "video/mp4", sizeBytes: null }; },
  }; });
  const request = { idempotencyKey: jobId, projectId, requestHash: "a".repeat(64), snapshot: seedanceJob().requestSnapshot };
  const blocked = await Promise.all(Array.from({ length: 10 }, () => provider.submit(request)));
  assert.ok(blocked.every(result => result.kind === "blocked")); assert.equal(reads, 0);
  // No FAL_KEY in harness: factory + blocked submit cannot construct a real client.
  assert.equal((await createUgcVideoProvider().submit(request)).kind, "blocked");
  const task: SeedanceProvider.UgcSeedanceTaskReference = { ownerId, provider: provider.provider, modelId: provider.modelId,
    endpointId: provider.endpointId, providerRequestId: "task-1", status: "processing" };
  assert.equal((await provider.inspectOwnedTask("other", task)).kind, "blocked");
  assert.equal((await provider.inspectOwnedTask(ownerId, { ...task, endpointId: "fal-ai/kling-video/v3/pro/image-to-video" })).kind, "blocked");
  for (const state of ["draft", "failed", "succeeded", "provider_submission_ambiguous"] as const) await provider.inspectOwnedTask(ownerId, { ...task, status: state });
  assert.equal(reads, 0);
  const pending = await provider.inspectOwnedTask(ownerId, task); assert.ok(pending.kind === "observed" && pending.status === "processing");
  status = "completed";
  const ready = await provider.inspectOwnedTask(ownerId, task); assert.ok(ready.kind === "observed" && ready.outputReady && ready.status === "processing");
  await provider.getResult("task-1");
  await assert.rejects(provider.getStatus("bad task"));
});

test("Seedance reuses one-shot SDK protection for retryable errors without live requests", async () => {
  const { load, submission } = harness();
  const { planUgcSeedanceRequest } = load("@/lib/ugc/ugc-seedance-planner") as typeof Seedance;
  const planned = planUgcSeedanceRequest(seedanceJob()); assert.ok(planned.ok);
  const input = submission.buildUgcSeedanceInput(planned.plan, new Map(planned.plan.images.map(image => [image.objectPath, "https://private.invalid/image"])));
  for (const status of [0, 429, 502, 503, 504, 200]) {
    let calls = 0;
    await assert.rejects(submission.submitUgcSeedanceOnce(input, { credentials: "fake-never-live", fetch: async (url, init) => {
      calls++; assert.equal(String(url), `https://queue.fal.run/${planned.plan.endpointId}`);
      assert.equal(init?.redirect, "error");
      if (!status) throw new TypeError("fetch failed");
      return new Response(status === 200 ? "invalid-json" : "{}", { status });
    } }));
    assert.equal(calls, 1);
  }
});

test("default Seedance pipeline preserves safe claims, ambiguity, pinned reconciliation and private success ordering", async () => {
  for (const ambiguous of [false, true]) {
    const { load, pipeline, submission } = harness();
    const repository = new MemoryRepository(); const value = seedanceJob(); repository.records.set(jobId, value);
    const deps = dependencies(repository); delete deps.planRequest;
    deps.media.resolveInput = async (_job, plan) => {
      assert.equal(plan.version, 2); if (plan.version !== 2) throw new Error("Wrong provider");
      return submission.buildUgcSeedanceInput(plan, new Map(plan.images.map(image => [image.objectPath, "https://private.invalid/image"])));
    };
    let posts = 0; let persisted = 0;
    deps.transport.submit = async input => { posts++; assert.ok("image_urls" in input); if (ambiguous) throw new Error("timeout"); return "seedance-task"; };
    deps.transport.getStatus = async endpoint => { assert.equal(endpoint, "bytedance/seedance-2.5/reference-to-video"); return "completed"; };
    deps.media.persist = async () => { assert.notEqual(repository.records.get(jobId)?.status, "succeeded"); persisted++; return output; };
    await Promise.all(Array.from({ length: 8 }, () => pipeline.verifyUgcSubmission(ownerId, jobId, deps)));
    assert.equal(posts, 1);
    await pipeline.verifyUgcSubmission(ownerId, jobId, deps); assert.equal(posts, 1);
    if (ambiguous) {
      assert.equal(repository.records.get(jobId)?.status, "provider_submission_ambiguous");
      assert.equal((await pipeline.verifyUgcReconciliation(ownerId, jobId, deps)).kind, "unchanged");
      assert.equal(persisted, 0);
    } else {
      assert.equal((await pipeline.verifyUgcReconciliation(ownerId, jobId, deps)).kind, "succeeded");
      assert.equal(persisted, 1); assert.equal(repository.patches.at(-1)?.output?.objectPath, output.objectPath);
      // Changing a saved endpoint cannot reroute an owned task to a different model.
      const { planUgcSeedanceRequest } = load("@/lib/ugc/ugc-seedance-planner") as typeof Seedance;
      const planned = planUgcSeedanceRequest(value); assert.ok(planned.ok);
      value.status = "processing"; value.providerRequestId = "task"; value.providerPlan = planned.plan;
      (value.providerPlan as { endpointId: string }).endpointId = "wrong-route";
      assert.equal((await pipeline.verifyUgcReconciliation(ownerId, jobId, deps)).kind, "invalid_plan");
    }
    assert.equal((await pipeline.requestUgcGeneration()).code, "generation_disabled");
  }
});

test("Seedance private image resolver verifies bytes and signs only owned references", async () => {
  const bytes = await sharp({ create: { width: 720, height: 1280, channels: 3, background: "white" } }).webp().toBuffer();
  let signed = 0;
  const { load } = harness({ "@/lib/supabase/admin": { getSupabaseAdminClient: () => ({ storage: { from: () => ({
    download: async () => ({ data: new Blob([Uint8Array.from(bytes)], { type: "image/webp" }), error: null }),
    createSignedUrl: async () => { signed++; return { data: { signedUrl: "https://project.supabase.co/storage/v1/object/sign/ugc-product-assets/source?token=secret" }, error: null }; },
  }) } }) } });
  const { planUgcSeedanceRequest } = load("@/lib/ugc/ugc-seedance-planner") as typeof Seedance;
  const { SupabaseUgcPrivateMedia } = load("@/lib/ugc/ugc-private-media") as typeof Media;
  const media = new SupabaseUgcPrivateMedia(fakeFetch);
  const planned = planUgcSeedanceRequest(seedanceJob()); assert.ok(planned.ok);
  await assert.rejects(media.resolveInput(seedanceJob(), planned.plan)); assert.equal(signed, 0);
  for (const image of planned.plan.images) image.sha256 = createHash("sha256").update(bytes).digest("hex");
  const input = await media.resolveInput(seedanceJob(), planned.plan);
  assert.equal(input.image_urls.length, 2); assert.equal(signed, 2); assert.ok(!("elements" in input));
  planned.plan.images[0].objectPath = "other/private.webp";
  await assert.rejects(media.resolveInput(seedanceJob(), planned.plan)); assert.equal(signed, 2);
});

test("Seedance 30s planning preserves all three ratios and private output duration validation", async () => {
  const { load, submission } = harness();
  const { planUgcSeedanceRequest } = load("@/lib/ugc/ugc-seedance-planner") as typeof Seedance;
  const { inspectUgcMp4 } = load("@/lib/ugc/ugc-private-media") as typeof Media;
  for (const ratio of ["9:16", "1:1", "16:9"]) {
    const value = seedanceJob(); Object.assign(value.requestSnapshot.settings as object, { duration: "30", aspectRatio: ratio }); rehash(value);
    const before = JSON.stringify(value); const result = planUgcSeedanceRequest(value); assert.ok(result.ok);
    assert.equal(result.plan.durationSeconds, 30); assert.equal(result.plan.aspectRatio, ratio);
    const input = submission.buildUgcSeedanceInput(result.plan, new Map(result.plan.images.map(image => [image.objectPath, "https://private.invalid/image"])));
    assert.equal(input.duration, "30"); assert.equal(input.aspect_ratio, ratio); assert.equal(JSON.stringify(value), before);
  }
  assert.equal(inspectUgcMp4(mp4(30), "9:16", 30).durationSeconds, 30);
  assert.throws(() => inspectUgcMp4(mp4(15), "9:16", 30));
  assert.throws(() => inspectUgcMp4(mp4(30), "9:16", 15));
  assert.throws(() => inspectUgcMp4(mp4(60), "9:16", 60 as 30));
  let uploads = 0;
  const h = harness({ "@/lib/supabase/admin": { getSupabaseAdminClient: () => ({ storage: { from: () => ({
    upload: async () => { uploads++; return { error: null }; },
  }) } }) } });
  const { SupabaseUgcPrivateMedia } = h.load("@/lib/ugc/ugc-private-media") as typeof Media;
  const media = new SupabaseUgcPrivateMedia(async () => new Response(mp4(30), { headers: { "content-type": "video/mp4" } }));
  const value = seedanceJob(); (value.requestSnapshot.settings as Record<string, unknown>).duration = "30"; rehash(value);
  const file = { url: "https://v3.fal.media/output.mp4", contentType: "video/mp4", sizeBytes: null };
  assert.equal((await media.persist(value, file)).durationSeconds, 30); assert.equal(uploads, 1);
  await assert.rejects(media.persist(seedanceJob(), file)); assert.equal(uploads, 1);
});

test("Seedance audio planning accepts native audio and rejects unprovisioned private references before claims", async () => {
  const { load, submission } = harness();
  const { planUgcSeedanceRequest } = load("@/lib/ugc/ugc-seedance-planner") as typeof Seedance;
  const reference = { objectPath: `${ownerId}/${projectId}/${jobId}.mp3`, sha256: "b".repeat(64),
    byteSize: 1000, durationSeconds: 10, contentType: "audio/mpeg" };
  for (const mode of ["silent", "native"]) {
    const value = seedanceJob(); value.requestSnapshot.seedanceAudio = { mode }; rehash(value);
    const before = JSON.stringify(value); const result = planUgcSeedanceRequest(value); assert.ok(result.ok);
    const urls = new Map(result.plan.images.map(image => [image.objectPath, "https://private.invalid/image"] as const));
    const input = submission.buildUgcSeedanceInput(result.plan, urls);
    assert.equal(input.generate_audio, mode !== "silent"); assert.equal(result.plan.audio?.mode, mode);
    assert.equal("audio_urls" in input, false);
    assert.equal(JSON.stringify(value), before);
    assert.throws(() => submission.buildUgcSeedanceInput({ ...result.plan, generateAudio: !result.plan.generateAudio }, urls));
    value.requestSnapshot.script = value.requestSnapshot.spokenDialogue = "Say these exact words."; rehash(value);
    const speech = planUgcSeedanceRequest(value); assert.ok(!speech.ok && speech.issues.includes("exact_dialogue_unverified"));
  }
  const referenceJob = seedanceJob(); referenceJob.requestSnapshot.seedanceAudio = { mode: "reference", references: [reference] }; rehash(referenceJob);
  const referenceResult = planUgcSeedanceRequest(referenceJob);
  assert.ok(!referenceResult.ok && referenceResult.issues.includes("audio_reference_storage_unavailable"));
  for (const audio of [
    { mode: "native", voice: "warm" }, { mode: "reference", references: [] },
    { mode: "silent", references: [reference] }, { mode: "reference", references: [{ ...reference, objectPath: `other/${projectId}/${jobId}.mp3` }] },
    { mode: "reference", references: [{ ...reference, durationSeconds: 30.3 }] },
    { mode: "reference", references: [{ ...reference, byteSize: 15 * 1024 * 1024 + 1 }] },
    { mode: "reference", references: Array.from({ length: 11 }, () => ({ ...reference, durationSeconds: 1.8 })) },
    { mode: "reference", references: [{ ...reference, durationSeconds: 20 }, { ...reference, durationSeconds: 20 }] },
  ]) {
    const value = seedanceJob(); value.requestSnapshot.seedanceAudio = audio; rehash(value);
    assert.equal(planUgcSeedanceRequest(value).ok, false);
  }
});

test("historical silent Seedance plans retain canonical identity and SQL pins every immutable route", () => {
  const { load } = harness();
  const { planUgcSeedanceRequest } = load("@/lib/ugc/ugc-seedance-planner") as typeof Seedance;
  const original = planUgcSeedanceRequest(seedanceJob()); assert.ok(original.ok);
  assert.ok(!("audio" in original.plan)); assert.equal(original.plan.generateAudio, false);
  const sql = readFileSync("database/migrations/20261104000000_prepare_ugc_pipeline_claims.sql", "utf8");
  assert.match(sql, /version' = '1'[\s\S]*kling-v3-pro-image[\s\S]*durationSeconds' = '15'/);
  assert.match(sql, /version' = '2'[\s\S]*seedance-2\.5-reference[\s\S]*bytedance\/seedance-2\.5\/reference-to-video/);
  assert.match(sql, /version' = '3'[\s\S]*bytedance\/seedance-2\.0\/mini\/reference-to-video/);
  assert.match(sql, /ugc_pipeline_plan_matches_snapshot/);
  assert.match(sql, /Pin legacy UGC Kling task IDs/);
  assert.match(sql, /provider_submission_ambiguous' and provider_request_id is not null/);
  assert.match(sql, /create trigger ugc_pipeline_guard before insert or update/);
  assert.match(sql, /grant execute on function public\.ugc_pipeline_plan_matches_snapshot\(jsonb, jsonb\) to service_role/);
  assert.match(sql, /Duplicate UGC provider task IDs must be reviewed/);
  assert.match(sql, /finish_ugc_claim[\s\S]*status = 'provider_submission_ambiguous' and provider_request_id is not null/);
  assert.match(sql, /if j\.status = 'provider_submission_ambiguous' and p_status = 'queued'/);
  assert.match(sql, /claim_ugc_submission[\s\S]*provider route does not match immutable request/);
  const verify = readFileSync("database/verification/ugc_pipeline_preparation.sql", "utf8");
  assert.match(verify, /optional_reference_audio/);
  assert.match(verify, /atomic_submission_claim/);
  assert.match(verify, /reconciliation_lease_fencing/);
  assert.match(verify, /ambiguous_task_completion/);
  assert.match(verify, /optional capability is absent/i);
  assert.equal((verify.match(/select check_name, status, details from checks/g) ?? []).length, 1);
  assert.equal((verify.match(/select check_name, status, details from checks/g) ?? []).length, 1);
  assert.match(sql, /durationSeconds' in \('15', '30'\)/);
  assert.match(sql, /abs\(\(p_output->>'durationSeconds'\)::numeric - \(j.provider_plan->>'durationSeconds'\)::numeric\)/);
});

test("server registry pins documented Mini endpoint and preflights combinations before job persistence", async () => {
  const { load } = harness();
  const registry = load("@/lib/ugc/ugc-model-registry") as typeof import("../src/lib/ugc/ugc-model-registry");
  const contract = load("@/features/ugc/ugc-studio-contract") as typeof import("../src/features/ugc/ugc-studio-contract");
  assert.equal(registry.ugcModelRegistry.standard.identity.endpointId, "bytedance/seedance-2.0/mini/reference-to-video");
  assert.equal(registry.ugcModelRegistry.standard.documented.maxDuration, 15);
  const snapshot = seedanceJob().requestSnapshot;
  const project = { id: projectId, ownerId, title: null, modelTier: "standard" as const, creatorConceptId: "ada" as const,
    format: "demo" as const, script: "", spokenDialogue: "", sceneDirection: "Lift the product.",
    settings: snapshot.settings as import("../src/features/ugc/ugc-studio-contract").UgcDraftSettings,
    product: { objectPath: imagePath, contentType: "image/webp" as const, byteSize: 1000, fileName: "product.webp" }, createdAt: "now", updatedAt: "now" };
  let writes = 0;
  const repository = { getOwned: async () => project, prepareJob: async (input: Record<string, unknown>) => {
    writes++; assert.equal((input.requestSnapshot as { model: { tier: string } }).model.tier, "standard");
    return { ok: true, value: { ...input, id: jobId, createdAt: "now" } };
  } } as unknown as import("../src/features/ugc/ugc-studio-contract").UgcProjectRepository;
  project.settings.duration = "30";
  assert.equal((await contract.prepareUgcJobForUser(ownerId, projectId, jobId, repository, stable, registry.resolveUgcPreparationModel)).ok, false);
  project.settings.duration = "15"; project.spokenDialogue = "Say exactly this.";
  assert.equal((await contract.prepareUgcJobForUser(ownerId, projectId, jobId, repository, stable, registry.resolveUgcPreparationModel)).ok, false);
  project.spokenDialogue = ""; project.settings.subtitles = true;
  assert.equal((await contract.prepareUgcJobForUser(ownerId, projectId, jobId, repository, stable, registry.resolveUgcPreparationModel)).ok, false);
  assert.equal(writes, 0);
  project.settings.subtitles = false;
  assert.ok((await contract.prepareUgcJobForUser(ownerId, projectId, jobId, repository, stable, registry.resolveUgcPreparationModel)).ok);
  assert.equal(writes, 1);
  const publicOptions = JSON.stringify(registry.getUgcModelOptions());
  assert.ok(!/endpoint|price|credit|token|credential/.test(publicOptions));
});

test("Mini planning pins model identity, rejects long clips and emits only documented payload fields", async () => {
  const { load, submission, planner } = harness();
  const registry = load("@/lib/ugc/ugc-model-registry") as typeof import("../src/lib/ugc/ugc-model-registry");
  const seedance = load("@/lib/ugc/ugc-seedance-planner") as typeof Seedance;
  const value = seedanceJob(); value.requestSnapshot.model = { ...registry.ugcModelRegistry.standard.identity }; rehash(value);
  const before = JSON.stringify(value); const planned = seedance.planUgcModelRequest(value); assert.ok(planned.ok);
  assert.equal(planned.plan.version, 3); assert.equal(planned.plan.durationSeconds, 15);
  assert.equal(planned.plan.endpointId, registry.ugcModelRegistry.standard.identity.endpointId);
  const input = submission.buildUgcSeedanceInput(planned.plan, new Map(planned.plan.images.map(image => [image.objectPath, "https://private.invalid/image"])));
  assert.equal(input.duration, "15"); assert.equal(input.image_urls.length, 2);
  assert.ok(!("task" in input)); assert.ok(!("bitrate_mode" in input));
  assert.equal(JSON.stringify(value), before);
  assert.equal(seedance.planUgcSeedanceRequest(value).ok, false); // No silent fallback to Premium.
  assert.throws(() => submission.submitUgcSeedanceOnce(input, { credentials: "fake", fetch: fakeFetch }));
  let posts = 0;
  assert.equal(await submission.submitUgcMiniOnce(input, { credentials: "fake", fetch: async (url, init) => {
    posts++; assert.equal(String(url), `https://queue.fal.run/${planned.plan.endpointId}`); assert.equal(init?.method, "POST");
    return Response.json({ request_id: "mini-test-only" });
  } }), "mini-test-only");
  assert.equal(posts, 1);
  for (const duration of ["30", "60"]) {
    (value.requestSnapshot.settings as Record<string, unknown>).duration = duration; rehash(value);
    const rejected = seedance.planUgcModelRequest(value); assert.ok(!rejected.ok && rejected.issues.includes("unsupported_duration"));
  }
  (value.requestSnapshot.settings as Record<string, unknown>).duration = "15";
  value.requestSnapshot.model = { ...registry.ugcModelRegistry.standard.identity, version: 2 }; rehash(value);
  assert.equal(seedance.planUgcModelRequest(value).ok, false);
  const historical = seedanceJob();
  const original = seedance.planUgcSeedanceRequest(historical); assert.ok(original.ok);
  const routed = seedance.planUgcModelRequest(historical); assert.ok(routed.ok);
  assert.equal(planner.canonicalUgcJson(routed.plan), planner.canonicalUgcJson(original.plan));
  assert.ok(!("model" in original.plan));
});

test("Mini reference audio obeys lower limits while Premium keeps its existing capabilities", () => {
  const { load } = harness();
  const registry = load("@/lib/ugc/ugc-model-registry") as typeof import("../src/lib/ugc/ugc-model-registry");
  const seedance = load("@/lib/ugc/ugc-seedance-planner") as typeof Seedance;
  const ref = { objectPath: `${ownerId}/${projectId}/${jobId}.mp3`, sha256: "a".repeat(64), byteSize: 1000, durationSeconds: 5, contentType: "audio/mpeg" };
  for (const refs of [[ref], [ref, ref, ref], [ref, ref, ref, ref], [{ ...ref, durationSeconds: 16 }]]) {
    const value = seedanceJob(); value.requestSnapshot.model = { ...registry.ugcModelRegistry.standard.identity };
    value.requestSnapshot.seedanceAudio = { mode: "reference", references: refs }; rehash(value);
    const miniResult = seedance.planUgcModelRequest(value);
    assert.equal(miniResult.ok, false);
    if (refs.length <= 3 && refs.reduce((sum, item) => sum + item.durationSeconds, 0) <= 15) {
      assert.ok(!miniResult.ok && miniResult.issues.includes("audio_reference_storage_unavailable"));
    }
    value.requestSnapshot.model = { ...registry.ugcModelRegistry.premium.identity }; rehash(value);
    const premiumResult = seedance.planUgcModelRequest(value);
    assert.ok(!premiumResult.ok && premiumResult.issues.includes("audio_reference_storage_unavailable"));
  }
});

test("Mini default pipeline preserves duplicate claims and reconciles only its pinned model", async () => {
  const { load, pipeline, submission } = harness();
  const registry = load("@/lib/ugc/ugc-model-registry") as typeof import("../src/lib/ugc/ugc-model-registry");
  const value = seedanceJob(); value.requestSnapshot.model = { ...registry.ugcModelRegistry.standard.identity }; rehash(value);
  const repository = new MemoryRepository(); repository.records.set(jobId, value);
  const deps = dependencies(repository); delete deps.planRequest;
  deps.media.resolveInput = async (_job, plan) => {
    assert.equal(plan.version, 3); if (plan.version !== 3) throw new Error("Wrong model");
    return submission.buildUgcSeedanceInput(plan, new Map(plan.images.map(image => [image.objectPath, "https://private.invalid/image"])));
  };
  let posts = 0; deps.transport.submit = async input => { posts++; assert.ok(!("task" in input)); return "mini-task"; };
  deps.transport.getStatus = async endpoint => { assert.equal(endpoint, registry.ugcModelRegistry.standard.identity.endpointId); return "completed"; };
  deps.transport.getResult = async endpoint => { assert.equal(endpoint, registry.ugcModelRegistry.standard.identity.endpointId); return { url: "https://v3.fal.media/output.mp4", contentType: "video/mp4", sizeBytes: 1024 }; };
  await Promise.all(Array.from({ length: 8 }, () => pipeline.verifyUgcSubmission(ownerId, jobId, deps)));
  assert.equal(posts, 1);
  assert.equal((await pipeline.verifyUgcReconciliation(ownerId, jobId, deps)).kind, "succeeded");
  assert.equal(repository.patches.at(-1)?.output?.objectPath, output.objectPath);
  assert.equal((await pipeline.requestUgcGeneration()).code, "generation_disabled");
});

test("Premium pipeline keeps its pinned route and SQL identity rejects tier changes", async () => {
  const { load, pipeline, submission } = harness();
  const registry = load("@/lib/ugc/ugc-model-registry") as typeof import("../src/lib/ugc/ugc-model-registry");
  const value = seedanceJob(); value.requestSnapshot.model = { ...registry.ugcModelRegistry.premium.identity }; rehash(value);
  const repository = new MemoryRepository(); repository.records.set(jobId, value);
  const deps = dependencies(repository); delete deps.planRequest;
  deps.media.resolveInput = async (_job, plan) => {
    assert.equal(plan.version, 2); if (plan.version !== 2) throw new Error("Wrong tier");
    assert.equal(plan.endpointId, "bytedance/seedance-2.5/reference-to-video");
    return submission.buildUgcSeedanceInput(plan, new Map(plan.images.map(image => [image.objectPath, "https://private.invalid/image"])));
  };
  let posts = 0; deps.transport.submit = async () => { posts++; return "premium-task"; };
  const submitted = await pipeline.verifyUgcSubmission(ownerId, jobId, deps);
  assert.ok("kind" in submitted && submitted.kind === "accepted");
  assert.equal(posts, 1);
  const mini = { ...value, requestSnapshot: { ...value.requestSnapshot, model: { ...registry.ugcModelRegistry.standard.identity } } };
  const premiumPlan = (repository.records.get(jobId)?.providerPlan);
  assert.ok(premiumPlan);
  assert.equal(planMatchesSnapshot(premiumPlan, mini.requestSnapshot), false);
});

test("historical Kling task IDs without a stored plan reconcile on the migration-pinned route", async () => {
  const { pipeline } = harness();
  const value = job(); value.status = "processing"; value.providerRequestId = "old-kling-task";
  value.requestHash = "f".repeat(64); // Legacy hash serialization is retained in storage.
  value.providerPlan = { version: 1, legacyTask: true, snapshotDigest: value.requestHash, provider: "fal",
    modelId: "kling-v3-pro-image", endpointId: "fal-ai/kling-video/v3/pro/image-to-video", durationSeconds: 15 };
  const repository = new MemoryRepository(); repository.records.set(jobId, value);
  const deps = dependencies(repository); let endpoint = "";
  deps.transport.getStatus = async route => { endpoint = route; return "completed"; };
  const result = await pipeline.verifyUgcReconciliation(ownerId, jobId, deps);
  assert.equal(result.kind, "succeeded");
  assert.equal(endpoint, "fal-ai/kling-video/v3/pro/image-to-video");
  const persisted = repository.records.get(jobId)?.providerPlan;
  assert.ok(persisted?.version === 1 && persisted.legacyTask === true);
});
