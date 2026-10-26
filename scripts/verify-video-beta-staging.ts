/** Explicit disposable-project integration test. No provider inference, production DB or customer credits. */
import assert from "node:assert/strict";
import { execSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInThisContext } from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { loadEnvConfig } from "@next/env";

// Execute actual server modules with the same marker-only alias Next applies.
const requirePackage = createRequire(import.meta.url);
const cache = new Map<string, Record<string, unknown>>();
function loadServer<T>(file: string): T {
  const absolute = resolve(file);
  if (cache.has(absolute)) return cache.get(absolute) as T;
  const exports: Record<string, unknown> = {}; cache.set(absolute, exports);
  const code = ts.transpileModule(readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const require = (name: string): unknown => {
    if (name === "server-only") return {};
    if (name.startsWith("@/")) return loadServer("src/" + name.slice(2) + ".ts");
    if (name.startsWith(".")) return loadServer(resolve(dirname(absolute), name + ".ts"));
    return requirePackage(name);
  };
  runInThisContext("(function(require,exports){" + code + "\n})")(require, exports);
  return exports as T;
}

async function main() {
const ref = "gklpgcyndeghjgemoonk";
if (process.env.VIDEO_QA_PROJECT_REF !== ref) throw new Error("Set VIDEO_QA_PROJECT_REF to the disposable project explicitly.");
loadEnvConfig(process.cwd());
const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${ref} --output json`, { encoding: "utf8", windowsHide: true })) as Array<{ name: string; api_key: string }>;
const secret = keys.find(key => key.name === "service_role")?.api_key;
const anon = keys.find(key => key.name === "anon")?.api_key;
assert.ok(secret && anon);
process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${ref}.supabase.co`;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = anon;
process.env.SUPABASE_SECRET_KEY = secret;
process.env.VIDEO_BETA_ENABLED = "true";
process.env.VIDEO_GENERATION_ENABLED = "false";
process.env.VIDEO_BETA_APPROVED_SUBMISSION_ID = "";
process.env.VIDEO_BETA_APPROVED_MAX_COST_USD = "0";
process.env.OPENAI_BETA_ENABLED = "false";
process.env.OPENAI_API_KEY = "";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const users: string[] = [];
const objects: Array<{ bucket: string; path: string }> = [];
let server: ReturnType<typeof spawn> | undefined;
let passed = 0;
function check(value: unknown, message: string): asserts value { assert.ok(value, message); passed++; console.log(`PASS ${message}`); }
const password = "VideoQA-Disposable!2026"; // Synthetic, temporary account; removed at test exit.
try {
  for (let i = 0; i < 2; i++) {
    const result = await admin.auth.admin.createUser({ email: `video-qa-${randomUUID()}@staging.invalid`, password, email_confirm: true });
    assert.ifError(result.error); users.push(result.data.user!.id);
  }
  const owner = users[0];
  process.env.VIDEO_BETA_USER_IDS = owner;
  const ownerRecord = await admin.auth.admin.getUserById(owner);
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.ifError((await client.auth.signInWithPassword({ email: ownerRecord.data.user!.email!, password })).error);
  const [{ createVideoSourceUploadTicket, finalizeVideoSourceUpload, createAuthorizedVideoPlaybackUrl }, { SupabaseVideoSourceResolver }, { SupabaseVideoJobRepository }, { VideoBetaBudget }, { submitVideoGeneration }, { reconcileClaimedVideoGeneration }, { SupabaseDurableVideoOutputStore }, { videoEndpointCapabilities }] = [loadServer<typeof import("../src/lib/video-generation/media-access")>("src/lib/video-generation/media-access.ts"),
    loadServer<typeof import("../src/lib/video-generation/supabase-source-resolver")>("src/lib/video-generation/supabase-source-resolver.ts"),
    loadServer<typeof import("../src/lib/video-generation/supabase-repository")>("src/lib/video-generation/supabase-repository.ts"),
    loadServer<typeof import("../src/lib/video-generation/beta-runtime")>("src/lib/video-generation/beta-runtime.ts"),
    loadServer<typeof import("../src/lib/video-generation/service")>("src/lib/video-generation/service.ts"),
    loadServer<typeof import("../src/lib/video-generation/reconciliation")>("src/lib/video-generation/reconciliation.ts"),
    loadServer<typeof import("../src/lib/video-generation/output")>("src/lib/video-generation/output.ts"),
    loadServer<typeof import("../src/lib/video-generation/capabilities")>("src/lib/video-generation/capabilities.ts")];
  const ticket = await createVideoSourceUploadTicket(owner, "qa.png");
  objects.push({ bucket: "video-source-images", path: ticket.objectPath });
  const image = await sharp({ create: { width: 1280, height: 720, channels: 3, background: "white" } }).png().toBuffer();
  assert.ifError((await client.storage.from("video-source-images").uploadToSignedUrl(ticket.objectPath, ticket.token, image, { contentType: "image/png" })).error);
  const source = await finalizeVideoSourceUpload(owner, ticket.sourceAssetId, ticket.objectPath); check(source, "signed upload and owned source finalization");
  check(await finalizeVideoSourceUpload(owner, ticket.sourceAssetId, ticket.objectPath), "source finalization is idempotent");
  check(!await finalizeVideoSourceUpload(users[1], ticket.sourceAssetId, ticket.objectPath), "cross-owner source denied");
  const resolver = new SupabaseVideoSourceResolver();
  const resolved = await resolver.resolveOwned(owner, source); check(resolved?.aspectRatio === "16:9", "decoded source dimensions and ratio");
  check((await fetch(resolved!.providerUrl)).ok, "provider can access signed private input URL");
  check(!(await fetch(client.storage.from("video-source-images").getPublicUrl(ticket.objectPath).data.publicUrl, { signal: AbortSignal.timeout(15_000) })).ok, "anonymous public source access denied");
  const repository = new SupabaseVideoJobRepository();
  const billing = new VideoBetaBudget();
  let posts = 0;
  const provider = { name: "fal" as const, submit: async () => { posts++; return { requestId: `qa-${randomUUID()}` }; },
    getStatus: async () => "completed" as const, getResult: async () => ({ url: "https://storage.googleapis.com/falserverless/example_outputs/kling-v3/standard-i2v/out.mp4", contentType: "video/mp4", sizeBytes: null }) };
  const draft = { clientSubmissionId: randomUUID(), mode: "image" as const, source, prompt: "Synthetic video integration test", quality: "standard" as const, aspectRatio: "16:9" as const, durationSeconds: 5 as const, cameraMovement: "auto" as const };
  const dependencies = { repository, billing, provider, sourceResolver: resolver, capability: { ...videoEndpointCapabilities.klingV3StandardImage, productionApproved: true }, env: { VIDEO_GENERATION_ENABLED: "true" } };
  const results = await Promise.all([submitVideoGeneration(owner, draft, dependencies), submitVideoGeneration(owner, draft, dependencies)]);
  check(results.every(result => result.ok) && posts === 1, "concurrent duplicate submissions yield one provider task (mock only)");
  assert.ok(results[0].ok); const jobId = results[0].jobId;
  const job = await repository.findOwned(owner, jobId); check(job?.providerRequestId, "provider task ID persisted in PostgreSQL");
  const claims = await Promise.all([admin.rpc("claim_video_beta_reconciliations", { p_owner: owner, p_job: jobId, p_limit: 1 }), admin.rpc("claim_video_beta_reconciliations", { p_owner: owner, p_job: jobId, p_limit: 1 })]);
  check(claims.every(c => !c.error) && claims.reduce((n, c) => n + (c.data?.length ?? 0), 0) === 1, "concurrent PostgreSQL reconciliation claims have one winner");
  const row = claims.flatMap(c => c.data ?? [])[0]; const claim = repository.toReconciliationClaim(row);
  check(!await repository.transitionClaimed({ ...claim, leaseVersion: claim.leaseVersion - 1 }, ["queued"], { status: "processing" }), "stale lease fenced");
  objects.push({ bucket: "generated-videos", path: `${owner}/${jobId}/output.mp4` });
  const reconciled = await reconcileClaimedVideoGeneration(claim, { repository, provider, billing, outputStore: new SupabaseDurableVideoOutputStore() });
  check(reconciled.status === "succeeded", "MP4 persisted privately before fenced beta completion");
  check((await new SupabaseDurableVideoOutputStore().recover(job!))?.objectPath === `${owner}/${jobId}/output.mp4`, "lost output checkpoint recovers the private MP4");
  const playback = await createAuthorizedVideoPlaybackUrl(owner, jobId); check(playback, "owned playback signing");
  const playbackResponse = await fetch(playback!, { signal: AbortSignal.timeout(20_000) }); check(playbackResponse.ok && playbackResponse.headers.get("content-type")?.startsWith("video/mp4"), "private MP4 playback accessible");
  await playbackResponse.body?.cancel();
  const download = await createAuthorizedVideoPlaybackUrl(owner, jobId, true); assert.ok(download);
  const attachment = await fetch(download, { signal: AbortSignal.timeout(20_000) });
  check(attachment.headers.has("content-disposition"), "signed MP4 attachment download"); await attachment.body?.cancel();
  check(!await createAuthorizedVideoPlaybackUrl(users[1], jobId), "cross-owner playback denied");
  const publicUrl = admin.storage.from("generated-videos").getPublicUrl(`${owner}/${jobId}/output.mp4`).data.publicUrl;
  check(!(await fetch(publicUrl)).ok, "anonymous public MP4 access denied");
  const foreign = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, anon, { auth: { persistSession: false } });
  const other = await admin.auth.admin.getUserById(users[1]); assert.ifError((await foreign.auth.signInWithPassword({ email: other.data.user!.email!, password })).error);
  const hidden = await foreign.from("generations").select("id").eq("id", jobId); check(!hidden.error && hidden.data.length === 0, "authenticated owner RLS hides foreign jobs");
  const denied = await client.rpc("reserve_video_beta_budget", { p_owner: owner, p_submission: randomUUID(), p_cost: 0.7, p_tier: "standard", p_duration: 5 });
  check(denied.error, "browser cannot reserve USD budget through RPC");
  const budgetRace = await Promise.all(Array.from({ length: 8 }, () => admin.rpc("reserve_video_beta_budget", { p_owner: users[1], p_submission: randomUUID(), p_cost: 0.7, p_tier: "standard", p_duration: 5 })));
  check(budgetRace.filter(r => !r.error).length === 2, "concurrent budget calls respect 2 USD daily ceiling");
  console.log(`Video beta staging: ${passed}/${passed}. Paid inference calls: 0. Production mutations: 0.`);
  if (process.argv.includes("--serve")) {
    console.log(`Browser QA: http://127.0.0.1:3100/tr/login ; synthetic email: ${ownerRecord.data.user!.email}; password is the disposable fixture in this script.`);
    server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3100"], { env: process.env, stdio: "inherit", windowsHide: true });
    await new Promise<void>(done => { process.once("SIGINT", done); process.once("SIGTERM", done); server!.once("exit", () => done()); });
  }
} finally {
  server?.kill();
  const extraSources = await admin.from("video_source_assets").select("bucket_id,object_path").in("owner_id", users);
  for (const source of extraSources.data ?? []) objects.push({ bucket: source.bucket_id, path: source.object_path });
  for (const object of objects) assert.ifError((await admin.storage.from(object.bucket).remove([object.path])).error);
  for (const id of users) assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  console.log("Disposable Auth, job, budget and Storage fixtures cleaned.");
}

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
