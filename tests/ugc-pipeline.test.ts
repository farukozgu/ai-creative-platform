import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";
import { createContext, runInContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import sharp from "sharp";
import type * as Planner from "../src/lib/ugc/ugc-request-planner";
import type * as Submission from "../src/lib/ugc/ugc-fal-submission";
import type * as Pipeline from "../src/lib/ugc/ugc-pipeline";
import type * as Media from "../src/lib/ugc/ugc-private-media";
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
  function load(name: string, importer?: string): Record<string, unknown> {
    if (name in overrides) return overrides[name] as Record<string, unknown>;
    if (name === "server-only") return {};
    if ((name.startsWith("./") || name.startsWith("../")) && importer) {
      const basePath = resolve(dirname(importer), name);
      const resolvedPath = [basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}.js`].find(existsSync);
      if (!resolvedPath) throw new Error(`Cannot resolve ${name} from ${importer}`);
      const relativeToSource = relative(resolve("src"), resolvedPath);
      if (relativeToSource.startsWith(`..${sep}`)) throw new Error(`Relative import escaped src: ${name} from ${importer}`);
      return load(`@/${relativeToSource.replace(/\\/g, "/").replace(/\.(?:tsx?|js)$/, "")}`);
    }
    if (!name.startsWith("@/")) return requirePackage(name);
    if (cache.has(name)) return cache.get(name)!;
    const sourcePath = resolve("src", `${name.slice(2)}.ts`);
    const source = readFileSync(sourcePath, "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const exports: Record<string, unknown> = {};
    cache.set(name, exports);
    const evaluate = runInContext(`(function(require, exports) { ${compiled}\n })`, context);
    evaluate((dependency: string) => load(dependency, sourcePath), exports);
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
  return plan.version === 1 ? model === undefined : stable(plan.model) === stable(snapshot.model);
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

test("immutable Kling provider selection dispatches to the existing Kling planner", async () => {
  const { pipeline } = harness();
  const repository = new MemoryRepository();
  const value = job();
  value.requestSnapshot.providerSelection = "kling-v3-pro-image";
  rehash(value);
  repository.records.set(jobId, value);
  const deps = dependencies(repository);
  let submissions = 0;
  deps.transport.submit = async input => { submissions++; assert.ok("start_image_url" in input); return "kling-task"; };
  const result = await pipeline.verifyUgcSubmission(ownerId, jobId, deps);
  assert.equal("kind" in result && result.kind, "accepted");
  assert.equal(submissions, 1); // Injected test transport only; requestUgcGeneration remains disabled.
  assert.equal(repository.records.get(jobId)?.providerPlan?.version, 1);
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

test("server registry pins Kling routes and preflights combinations before job persistence", async () => {
  const { load } = harness();
  const registry = load("@/lib/ugc/ugc-model-registry") as typeof import("../src/lib/ugc/ugc-model-registry");
  const contract = load("@/features/ugc/ugc-studio-contract") as typeof import("../src/features/ugc/ugc-studio-contract");
  assert.equal(registry.ugcModelRegistry.standard.identity.endpointId, "fal-ai/kling-video/v3/standard/image-to-video");
  assert.deepEqual(Array.from(registry.ugcModelRegistry.premium.supported.durations), [15]);
  const snapshot = job().requestSnapshot;
  const project = { id: projectId, ownerId, title: null, modelTier: "standard" as "standard" | "premium", creatorConceptId: "ada" as const,
    format: "demo" as const, script: "", spokenDialogue: "", sceneDirection: "Lift the product.",
    settings: snapshot.settings as import("../src/features/ugc/ugc-studio-contract").UgcDraftSettings,
    product: { objectPath: imagePath, contentType: "image/webp" as const, byteSize: 1000, fileName: "product.webp" }, createdAt: "now", updatedAt: "now" };
  let writes = 0;
  const snapshots: Record<string, unknown>[] = [];
  const requestHashes: string[] = [];
  const repository = { getOwned: async () => project, prepareJob: async (input: Record<string, unknown>) => {
    writes++; snapshots.push(input.requestSnapshot as Record<string, unknown>);
    requestHashes.push(String(input.requestHash));
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
  assert.equal(JSON.stringify(snapshots[0].model), JSON.stringify(registry.ugcModelRegistry.standard.identity));
  assert.equal(snapshots[0].providerSelection, undefined);
  assert.equal(requestHashes[0], stable(snapshots[0]));
  project.modelTier = "premium";
  assert.ok((await contract.prepareUgcJobForUser(ownerId, projectId, jobId, repository, stable, registry.resolveUgcPreparationModel)).ok);
  assert.equal(writes, 2);
  assert.equal(JSON.stringify(snapshots[1].model), JSON.stringify(registry.ugcModelRegistry.premium.identity));
  assert.equal(snapshots[1].providerSelection, undefined);
  assert.equal(requestHashes[1], stable(snapshots[1]));
  const publicOptions = JSON.stringify(registry.getUgcModelOptions());
  assert.ok(!/endpoint|price|credit|token|credential/.test(publicOptions));
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


test("both new Kling tiers pin snapshot identity, payload and reconciliation endpoint", async () => {
  for (const tier of ["standard", "premium"] as const) {
    const { planner, pipeline, submission, load } = harness();
    const registry = load("@/lib/ugc/ugc-model-registry") as typeof import("../src/lib/ugc/ugc-model-registry");
    const value = job(); value.requestSnapshot.model = { ...registry.ugcModelRegistry[tier].identity }; rehash(value);
    const before = JSON.stringify(value);
    const result = planner.planUgcModelRequest(value); assert.ok(result.ok);
    assert.equal(result.plan.version, 4);
    assert.equal(result.plan.endpointId, registry.ugcModelRegistry[tier].identity.endpointId);
    assert.equal(JSON.stringify(value), before);
    const urls = new Map([[imagePath, "https://signed.invalid/source"]]);
    const payload = submission.buildUgcKlingInput(result.plan, urls);
    assert.equal(payload.start_image_url, "https://signed.invalid/source");
    assert.equal(payload.generate_audio, false); assert.equal(payload.duration, "15");
    assert.equal(payload.elements.length, 2); assert.ok(!("image_urls" in payload));
    assert.throws(() => submission.buildUgcKlingInput({ ...result.plan, endpointId: "wrong" }, urls));
    for (const duration of ["30", "60"]) {
      const invalid = structuredClone(value); (invalid.requestSnapshot.settings as Record<string, unknown>).duration = duration; rehash(invalid);
      assert.equal(planner.planUgcModelRequest(invalid).ok, false);
    }
    assert.equal(planner.planUgcKlingRequest(value).ok, false);
    const repository = new MemoryRepository(); repository.records.set(jobId, value);
    const deps = dependencies(repository); delete deps.planRequest;
    deps.media.resolveInput = async (_job, plan) => submission.buildUgcKlingInput(plan, urls);
    let posts = 0;
    deps.transport.submit = async () => { posts++; return "kling-task"; };
    deps.transport.getStatus = async endpoint => { assert.equal(endpoint, result.plan.endpointId); return "completed"; };
    const accepted = await pipeline.verifyUgcSubmission(ownerId, jobId, deps);
    assert.ok("kind" in accepted); assert.equal(accepted.kind, "accepted");
    const duplicate = await pipeline.verifyUgcSubmission(ownerId, jobId, deps);
    assert.ok("kind" in duplicate); assert.equal(duplicate.kind, "duplicate");
    assert.equal(posts, 1);
    assert.equal((await pipeline.verifyUgcReconciliation(ownerId, jobId, deps)).kind, "succeeded");
  }
});

test("removed model snapshots fail before claims or provider requests", async () => {
  const { pipeline, planner } = harness();
  for (const endpointId of ["bytedance/seedance-2.0/mini/reference-to-video", "bytedance/seedance-2.5/reference-to-video"]) {
    const value = job(); value.requestSnapshot.model = { tier: "premium", provider: "fal", version: 1, endpointId }; rehash(value);
    const repository = new MemoryRepository(); repository.records.set(jobId, value);
    const deps = dependencies(repository); delete deps.planRequest;
    let posts = 0; deps.transport.submit = async () => { posts++; return "forbidden"; };
    assert.equal(planner.planUgcModelRequest(value).ok, false);
    const rejected = await pipeline.verifyUgcSubmission(ownerId, jobId, deps);
    assert.ok("ok" in rejected && rejected.ok === false);
    assert.equal(posts, 0); assert.equal(repository.claims.size, 0);
    const before = JSON.stringify(value.requestSnapshot);
    value.status = "processing"; value.providerRequestId = "removed-task";
    value.providerPlan = { version: 2, endpointId } as unknown as Planner.UgcVisualPlan;
    deps.transport.getStatus = async () => { throw new Error("Removed provider must not be polled"); };
    assert.equal((await pipeline.verifyUgcReconciliation(ownerId, jobId, deps)).kind, "invalid_plan");
    assert.equal(JSON.stringify(value.requestSnapshot), before);
  }
});

test("verification submissions route both Kling tiers and retain one-shot SDK protection", async () => {
  const { load, submission } = harness();
  const registry = load("@/lib/ugc/ugc-model-registry") as typeof import("../src/lib/ugc/ugc-model-registry");
  for (const tier of ["standard", "premium"] as const) {
    const value = job(); value.requestSnapshot.model = { ...registry.ugcModelRegistry[tier].identity }; rehash(value);
    for (const status of [200, 429, 503]) {
      let posts = 0;
      const submit = submission.submitUgcModelOnce(value, new Map([[imagePath, "https://signed.invalid/source"]]), {
        credentials: "fake-never-live", fetch: async (url, init) => {
          posts++; assert.equal(String(url), "https://queue.fal.run/" + registry.ugcModelRegistry[tier].identity.endpointId);
          assert.equal(init?.method, "POST");
          return new Response(JSON.stringify({ request_id: "kling-task" }), { status, headers: { "content-type": "application/json" } });
        },
      });
      if (status === 200) assert.equal(await submit, "kling-task"); else await assert.rejects(submit);
      assert.equal(posts, 1);
    }
  }
});

test("Kling rollout admits v4 plans and refuses removed versions for new submission claims", () => {
  const sql = readFileSync("database/rollouts/kling-only-ugc.sql", "utf8");
  assert.match(sql, /version' = '4'/);
  assert.match(sql, /kling-v3-standard-image/);
  assert.match(sql, /p_plan->'model' = p_snapshot->'model'/);
  assert.match(sql, /not in \('1', '4'\)/);
  assert.match(sql, /for update skip locked/);
});
