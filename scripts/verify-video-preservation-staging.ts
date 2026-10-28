/** Explicit disposable project only. Synthetic accounts/media; FAL and OpenAI keys are erased. */
import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve, join } from "node:path";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { runInThisContext } from "node:vm";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import ts from "typescript";
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";

const requirePackage = createRequire(import.meta.url);
const cache = new Map<string, Record<string, unknown>>();
function loadServer<T>(file: string): T {
  const absolute = resolve(file); if (cache.has(absolute)) return cache.get(absolute) as T;
  const exports: Record<string, unknown> = {}; cache.set(absolute, exports);
  const code = ts.transpileModule(readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const require = (name: string): unknown => name === "server-only" ? {} : name.startsWith("@/") ? loadServer("src/" + name.slice(2) + ".ts") : name.startsWith(".") ? loadServer(resolve(dirname(absolute), name + ".ts")) : requirePackage(name);
  runInThisContext("(function(require,exports){" + code + "\n})")(require, exports); return exports as T;
}

async function main() {
  const ref = "gklpgcyndeghjgemoonk";
  if (process.env.VIDEO_QA_PROJECT_REF !== ref) throw new Error("Explicit disposable ref required.");
  loadEnvConfig(process.cwd());
  const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${ref} --output json`, { encoding: "utf8", windowsHide: true })) as Array<{ name: string; api_key: string }>;
  const secret = keys.find(key => key.name === "service_role")?.api_key, anon = keys.find(key => key.name === "anon")?.api_key;
  assert.ok(secret && anon);
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anon, SUPABASE_SECRET_KEY: secret,
    FAL_KEY: "", OPENAI_API_KEY: "", OPENAI_BETA_ENABLED: "false", VIDEO_FIDELITY_ENABLED: "false", VIDEO_GENERATION_ENABLED: "false", VIDEO_BETA_ENABLED: "true", VIDEO_BETA_TRANSACTION_APPROVALS_ENABLED: "false", KLAY_VIDEO_QA: "true" });
  const url = `https://${ref}.supabase.co`;
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const users: string[] = [];
  const directory = mkdtempSync(join(tmpdir(), "klay-preservation-qa-"));
  const password = "Disposable-Preservation!2026";
  let passed = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); passed++; console.log(`PASS ${label}`); };
  const tsFiles = ["tsconfig.json", "next-env.d.ts"].map(file => ({ file, original: readFileSync(file, "utf8") }));
  try {
    for (let i = 0; i < 2; i++) { const result = await admin.auth.admin.createUser({ email: `preservation-${randomUUID()}@staging.invalid`, password, email_confirm: true }); assert.ifError(result.error); users.push(result.data.user!.id); }
    const owner = users[0]; process.env.VIDEO_BETA_USER_IDS = owner;
    const account = await admin.auth.admin.getUserById(owner);
    const email = account.data.user!.email!;
    const ownerClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    assert.ifError((await ownerClient.auth.signInWithPassword({ email, password })).error);
    const sourcePath = `${owner}/${randomUUID()}/source.png`;
    const synthetic = await sharp(Buffer.from('<svg width="2400" height="3600"><rect width="2400" height="3600" fill="white"/><path d="M800 500 H1600 L2050 2200 L1650 2200 V3200 H750 V2200 H350 Z" fill="#222"/><rect x="1050" y="550" width="300" height="160" fill="white"/><text x="1080" y="650" font-family="Arial" font-size="70">TEST 42</text></svg>')).png().toBuffer();
    assert.ifError((await admin.storage.from("video-source-images").upload(sourcePath, synthetic, { contentType: "image/png" })).error);
    const { prepareOwnedVideoSource } = loadServer<typeof import("../src/lib/video-generation/prepared-source")>("src/lib/video-generation/prepared-source.ts");
    const prepared = await prepareOwnedVideoSource(owner, { kind: "upload", sourceAssetId: sourcePath.split("/")[1], objectPath: sourcePath }, "9:16");
    const { readOwnedPreparedVideoSource } = loadServer<typeof import("../src/lib/video-generation/source-context")>("src/lib/video-generation/source-context.ts");
    const context = await readOwnedPreparedVideoSource(owner, prepared.source, "9:16");
    check(context.original.equals(synthetic), "original private pixels recovered from owned prepared provenance");
    await assert.rejects(readOwnedPreparedVideoSource(users[1], prepared.source, "9:16")); passed++; console.log("PASS cross-owner prepared source rejected");
    const { videoDraftHash } = loadServer<typeof import("../src/lib/video-generation/request-identity")>("src/lib/video-generation/request-identity.ts");
    const draft: import("../src/lib/video-generation/types").VideoGenerationDraft = { clientSubmissionId: randomUUID(), method: "kling", mode: "image", prompt: "Gentle static product shot.", quality: "standard", aspectRatio: "9:16", durationSeconds: 5, cameraMovement: "static", source: prepared.source,
      criticalRegion: { x: 0.4375, y: 0.1528, width: 0.125, height: 0.0444, declaredText: "TEST 42" }, analysisConsent: null };
    const preservation = { version: "product-preservation-v2", method: "kling" as const, draftHash: videoDraftHash(draft), sourceSha256: context.sourceSha256, geometry: context.geometry, criticalRegion: draft.criticalRegion!, frameRegion: null, compiledPrompt: "Synthetic Kling test fixture.", negativePrompt: "", cfgScale: 0.5, analysisConsent: null };
    const { prepareOwnedVideoFidelity } = loadServer<typeof import("../src/lib/video-fidelity/prepare-owned")>("src/lib/video-fidelity/prepare-owned.ts");
    const { SupabaseVideoJobRepository } = loadServer<typeof import("../src/lib/video-generation/supabase-repository")>("src/lib/video-generation/supabase-repository.ts");
    const repo = new SupabaseVideoJobRepository();
    const mockJob = await repo.createOrGet({ ownerId: owner, clientSubmissionId: draft.clientSubmissionId, mode: draft.mode, prompt: draft.prompt, quality: draft.quality, aspectRatio: draft.aspectRatio, durationSeconds: draft.durationSeconds,
      cameraMovement: draft.cameraMovement, sourceKind: "uploaded-image", sourceId: prepared.source.sourceAssetId, provider: "fal", modelId: "mock-kling", endpointId: "mock-kling", providerRequestId: "mock-provider-task", status: "queued", errorCode: null,
      outputBucketId: null, outputObjectPath: null, outputMimeType: null, outputSizeBytes: null, estimatedProviderCostUsd: 0, actualProviderCostUsd: null, billingReservationId: null, billingStatus: "not_configured", preservation });
    check(mockJob.created, "synthetic Kling job fixture is persisted without provider submission");
    if (!ffmpegPath) throw new Error("FFmpeg fixture generator unavailable.");
    const fixturePath = join(directory, "mock-kling.mp4");
    execFileSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=1080x1920:r=24:d=5", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", fixturePath], { windowsHide: true });
    const mockMp4 = readFileSync(fixturePath);
    assert.ifError((await admin.storage.from("generated-videos").upload(`${owner}/${mockJob.job.id}/output.mp4`, mockMp4, { contentType: "video/mp4" })).error);
    await repo.transition(mockJob.job.id, ["queued"], { status: "processing" });
    await repo.transition(mockJob.job.id, ["processing"], { status: "succeeded", outputBucketId: "generated-videos", outputObjectPath: `${owner}/${mockJob.job.id}/output.mp4`, outputMimeType: "video/mp4", outputSizeBytes: mockMp4.length });
    const frames = await prepareOwnedVideoFidelity(owner, mockJob.job.id);
    check(frames.frames.length === 5 && frames.closeups.length === 3, "five server-decoded frames and three critical-region crops");
    const { readOwnedVideoFidelityMedia } = loadServer<typeof import("../src/lib/video-fidelity/private-media")>("src/lib/video-fidelity/private-media.ts");
    check(await readOwnedVideoFidelityMedia(users[1], mockJob.job.id, "video") === null, "private MP4 rejects the other owner");
    const version = "video-product-fidelity-v3";
    assert.ifError((await admin.from("video_fidelity_reviews").insert({ job_id: mockJob.job.id, owner_id: owner, evaluator_version: version, model: "gpt-4o-mini", maximum_cost_usd: 0.02, pricing_version: "test" })).error);
    const claims = await Promise.all([0, 1].map(() => admin.rpc("claim_video_fidelity_review", { p_owner: owner, p_job: mockJob.job.id, p_version: version })));
    check(claims.filter(c => c.data).length === 1 && claims.every(c => !c.error), "two concurrent database requests produce one review claim");
    const token = claims.find(c => c.data)!.data;
    assert.equal((await admin.rpc("mark_video_fidelity_submitting", { p_owner: owner, p_job: mockJob.job.id, p_version: version, p_token: token })).data, true);
    const mockReport = { evaluatorVersion: version, model: "mock-provider-no-paid-call", analyzedAt: new Date().toISOString(), sourceProfile: null, sourceDetails: null,
      overallStatus: "review_recommended", summary: "MOCK QA report, not real analysis. " + "LongDetail".repeat(45), checks: ["branding_text", "shape_proportions", "color_material", "construction_details", "motion_deformation"].map(category => ({ category, status: category === "branding_text" ? "suspicious_change" : "unverified", confidence: "low", likelyCause: "unclear", timestampsSeconds: [2.5], reason: "MOCK fixture only. " + "DetailWithoutSpaces".repeat(28) })) };
    assert.ifError((await admin.from("video_fidelity_reviews").update({ status: "succeeded", report: mockReport }).eq("job_id", mockJob.job.id).eq("evaluator_version", version).eq("claim_token", token)).error);
    const visible = await ownerClient.from("video_fidelity_reviews").select("job_id");
    check(!visible.error && visible.data.length === 1 && visible.data[0].job_id === mockJob.job.id, "authenticated owner can read the durable review");
    const forbidden = await ownerClient.from("video_fidelity_reviews").insert({ job_id: mockJob.job.id, owner_id: owner });
    check(Boolean(forbidden.error), "authenticated client cannot write consent or review status");

    if (process.env.VIDEO_QA_PLAYWRIGHT_MODULE) {
      const { verifyPreservationBrowser } = await import("./verify-video-preservation-browser.mjs");
      await verifyPreservationBrowser({ email, password, synthetic, jobId: mockJob.job.id, reviewJobId: mockJob.job.id, directory, check });
    }
    console.log(`Preservation staging: ${passed}/${passed}. No paid provider request; production untouched.`);
  } finally {
    for (const owner of users) {
      for (const bucket of ["generated-videos", "video-source-images"]) {
        const folders = await admin.storage.from(bucket).list(owner);
        for (const folder of folders.data ?? []) {
          const files = await admin.storage.from(bucket).list(`${owner}/${folder.name}`);
          const paths = (files.data ?? []).map(file => `${owner}/${folder.name}/${file.name}`);
          if (paths.length) await admin.storage.from(bucket).remove(paths);
        }
      }
      await admin.auth.admin.deleteUser(owner);
    }
    for (const { file, original } of tsFiles) { const current = readFileSync(file, "utf8"); if (current !== original && current.includes(".next-video-qa")) writeFileSync(file, original); }
    if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Staging validation failed"); process.exitCode = 1; });
