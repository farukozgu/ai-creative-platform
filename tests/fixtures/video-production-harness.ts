import assert from "node:assert/strict";
import { createHash, randomUUID, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import ts from "typescript";
import type * as actions from "../../src/app/[locale]/dashboard/video/generation-actions";
import type * as directorRuntime from "../../src/lib/video-director/runtime";
import type * as core from "../../src/lib/video-director/core";
import type * as receipts from "../../src/lib/video-director/receipt";
import type * as quotes from "../../src/lib/video-generation/quote-receipt";
import type * as runtime from "../../src/lib/video-generation/beta-runtime";
import type { VideoGenerationDraft, VideoPreservationSnapshot } from "../../src/lib/video-generation/types";
import { directorProducts } from "./video-director-fixtures";

export const videoTestOwner = "10000000-0000-4000-8000-000000000001";
export const videoTestSource = "10000000-0000-4000-8000-000000000002";
const secret = "isolated-video-test-secret";
const root = process.cwd();
const requirePackage = createRequire(import.meta.url);
const compiled = new Map<string, string>();
type Row = Record<string, unknown>;
type Stored = { bytes: Buffer; contentType: string };
type Task = { status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED"; error?: string; input: Row; resultStatus?: number; missingVideo?: boolean; url?: string };

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const fingerprint = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Real application modules and both vendor SDKs; only auth and HTTP services are
 * substituted. The in-memory HTTP service models SQL uniqueness, one-shot RPC
 * reservations, due-time leases, fenced writes and immutable terminal rows.
 * It is not a replacement for running the migrations on PostgreSQL.
 */
export class VideoProductionHarness {
  now = Date.now();
  owner: string | null = videoTestOwner;
  rows: Row[] = [];
  assets: Row[] = [];
  objects = new Map<string, Stored>();
  reservations = new Map<string, { id: string; finalized: boolean; cost: number }>();
  tasks = new Map<string, Task>();
  posts: Array<{ endpoint: string; input: Row }> = [];
  requests: Array<{ host: string; method: string; path: string }> = [];
  logs: unknown[][] = [];
  unexpected: string[] = [];
  uploadAttempts = 0;
  uploadDelayMs = 0;
  terminalWrites = 0;
  submitOutcome: "accepted" | "rejected" | "timeout" | "lost-response" = "accepted";
  failUploads = 0;
  failFinalizations = 0;
  failClaims = false;
  failProviderReads = false;
  corruptVideo = false;
  rate = { standard: 0.14, pro: 0.168 };
  api!: typeof actions;
  private modules = new Map<string, unknown>();
  private client = createClient("https://video-test.invalid", "fake-service-key", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, init) => this.http(url, init) } });
  readonly profile = structuredClone(directorProducts[2]);
  readonly env: Record<string, string> = { NODE_ENV: "development", FAL_KEY: "fake-fal-key", SUPABASE_SECRET_KEY: secret,
    VIDEO_STUDIO_ENABLED: "true", VIDEO_STUDIO_ACCESS_MODE: "allowlist", VIDEO_STUDIO_USER_IDS: videoTestOwner,
    VIDEO_STUDIO_SPENDING_ENABLED: "true", VIDEO_GENERATION_ENABLED: "true" };

  static async create() {
    const fixture = new VideoProductionHarness();
    await fixture.addSource(videoTestSource);
    fixture.api = fixture.load<typeof actions>("src/app/[locale]/dashboard/video/generation-actions.ts");
    return fixture;
  }

  async addSource(id: string, owner = videoTestOwner, color = "white") {
    const bytes = await sharp({ create: { width: 512, height: 512, channels: 3, background: color } }).png().toBuffer();
    const path = `${owner}/${id}/prepared-v1.png`;
    this.assets = this.assets.filter(asset => asset.id !== id);
    this.assets.push({ id, owner_id: owner, bucket_id: "video-source-images", object_path: path, width: 512, height: 512 });
    this.objects.set(`video-source-images/${path}`, { bytes, contentType: "image/png" });
    return fingerprint(bytes);
  }

  draft(quality: "standard" | "pro" = "standard", durationSeconds: 5 | 10 = 5, shotMode: "single" | "multi" = "single"): VideoGenerationDraft {
    return { clientSubmissionId: randomUUID(), mode: "image", quality, durationSeconds, shotMode, aspectRatio: "1:1", cameraMovement: "auto",
      prompt: "", source: { kind: "uploaded-image", sourceAssetId: videoTestSource } };
  }

  signDirector(draft: VideoGenerationDraft, origin: "ai" | "fallback") {
    const core = this.load<typeof import("../../src/lib/video-director/core")>("src/lib/video-director/core.ts");
    const receipt = this.load<typeof receipts>("src/lib/video-director/receipt.ts");
    const context = this.load<typeof import("../../src/lib/video-director/product-context")>("src/lib/video-director/product-context.ts");
    const intent = this.load<typeof import("../../src/lib/video-director/creative-request")>("src/lib/video-director/creative-request.ts");
    const input: core.VideoDirectorInput = { draft, profile: this.profile, presetId: "cinematic-dial", shotMode: draft.shotMode! };
    const evidence = context.directorProductContext(input.profile).evidence;
    const focus = evidence.find(item => /dial/.test(item.detail))!;
    const durations = input.shotMode === "single" ? [draft.durationSeconds] : draft.durationSeconds === 5 ? [2, 3] : [3, 4, 3];
    const reviews = draft.productReferences?.map((_, index) => ({ index, status: "matched" as const, reason: "Consistent visible identity", details: [] }));
    const plan = origin === "fallback" ? core.fallbackDirectorPlan(input) : core.parseDirectorOutput({
      summary: "A source-facing campaign with sculpted light", intent: "Study the visible watch face, then settle into a hero view",
      intentContract: intent.interpretCreativeIntent(draft.prompt, evidence, input.shotMode, draft.cameraMovement),
      ...(reviews?.length ? { referenceReviews: reviews } : {}),
      shots: durations.map((durationSeconds, index) => ({ durationSeconds, purpose: ["hero-reveal", "macro-detail", "final-hero"][index],
        focus: `verified-evidence:${focus.id}`, camera: ["Slow dolly-in", "Locked close framing", "Slow pull-back"][index],
        composition: ["Full visible product", "Close view of the existing detail", "Complete product with clear margins"][index],
        lighting: "Soft side light", motion: "Product stays still", pace: "Measured final hold" })),
    }, input);
    assert.ok(plan);
    const source = this.objects.get(`video-source-images/${videoTestOwner}/${videoTestSource}/prepared-v1.png`)!;
    const key = receipt.directorCacheKey(videoTestOwner, fingerprint(source.bytes), "gpt-4o-mini", input);
    const token = receipt.sealDirectorPlan(key, plan, secret, this.now, input.profile);
    assert.ok(token.length <= 14000);
    draft.director = { presetId: input.presetId, shotMode: input.shotMode, receipt: token };
    return plan;
  }

  signedQuote(draft: VideoGenerationDraft, cost: number, hash: string, now: number) {
    return this.load<typeof quotes>("src/lib/video-generation/quote-receipt.ts").sealVideoQuote(videoTestOwner, draft, cost, secret, now, hash);
  }
  snapshotHash(draft: VideoGenerationDraft, snapshot: VideoPreservationSnapshot) {
    return this.load<typeof import("../../src/lib/video-generation/payload-summary")>("src/lib/video-generation/payload-summary.ts").summarizeVideoPayload(draft, snapshot).snapshotHash;
  }
  async reconcile(jobId: string) { return this.load<typeof runtime>("src/lib/video-generation/beta-runtime.ts").reconcileVideoBeta(videoTestOwner, jobId); }
  planReader() { return this.load<typeof directorRuntime>("src/lib/video-director/runtime.ts"); }
  receiptReader() { return this.load<typeof receipts>("src/lib/video-director/receipt.ts"); }
  readPlayback(url: string) { return this.http(url); }
  runScheduler(authorization?: string, method: "GET" | "POST" = "POST") {
    const route = this.load<typeof import("../../src/app/api/internal/video-reconciliation/route")>("src/app/api/internal/video-reconciliation/route.ts");
    return route[method](new Request("https://app-test.invalid/api/internal/video-reconciliation", {
      method, headers: authorization ? { authorization } : {},
    }));
  }
  advance(ms = 301_000) { this.now += ms; }
  task(jobId: string) { const row = this.rows.find(row => row.id === jobId)!; return this.tasks.get(String(row.provider_request_id))!; }
  assertIsolated() { assert.deepEqual(this.unexpected, [], "all HTTP destinations must be mocked"); }

  private load<T>(file: string): T {
    const filename = resolve(root, file);
    if (this.modules.has(filename)) return this.modules.get(filename) as T;
    const exports = {};
    this.modules.set(filename, exports);
    let code = compiled.get(filename);
    if (!code) {
      code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
      } }).outputText;
      compiled.set(filename, code);
    }
    const currentTime = () => this.now;
    class TestDate extends Date {
      constructor(value?: string | number) { super(value ?? currentTime()); }
      static now() { return currentTime(); }
    }
    runInNewContext(code, { exports, Buffer, URL, URLSearchParams, Date: TestDate, AbortSignal, Response, Request, Headers, Blob, FormData,
      TransformStream, ReadableStream, crypto: webcrypto, setTimeout, clearTimeout, process: { env: this.env },
      fetch: (url: Parameters<typeof fetch>[0], init?: RequestInit) => this.http(url, init),
      console: { info: (...args: unknown[]) => this.logs.push(args), warn: (...args: unknown[]) => this.logs.push(args), error: (...args: unknown[]) => this.logs.push(args) },
      require: (name: string) => {
        if (name === "server-only") return {};
        if (name === "@/lib/auth/require-user") return { getAuthenticatedUserId: async () => this.owner };
        if (name === "@/lib/supabase/admin") return { getSupabaseAdminClient: () => this.client };
        if (name === "@/lib/video-fidelity/availability") return { getVideoFidelityAnalysisAvailability: () => ({ enabled: false }) };
        if (name === "@/lib/video-fidelity/reviews") return { videoFidelitySchemaReady: async () => false };
        if (name === "./openai-director" || name === "@/lib/video-director/openai-director") return { createOpenAIVideoPlan: () => { throw new Error("OpenAI calls forbidden in this fixture"); } };
        if (name.startsWith("@/")) return this.load(`${name.replace("@/", "src/")}.ts`);
        if (name.startsWith(".")) return this.load(`${resolve(dirname(filename), name)}.ts`);
        return requirePackage(name);
      },
    });
    return exports as T;
  }

  private matches(row: Row, url: URL) {
    return [...url.searchParams].every(([key, value]) => {
      if (["select", "order", "limit"].includes(key)) return true;
      if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
      if (value === "is.null") return row[key] === null || row[key] === undefined;
      if (value.startsWith("gt.")) return String(row[key]) > value.slice(3);
      if (value.startsWith("in.(")) return value.slice(4, -1).split(",").includes(String(row[key]));
      throw new Error(`Unexpected REST filter: ${key}/${value}`);
    });
  }
  private representation(data: Row[], headers: Headers) {
    if (headers.get("accept")?.includes("vnd.pgrst.object")) return data.length === 1 ? json(data[0]) : json({ code: "PGRST116", message: "No row" }, 406);
    return json(data);
  }

  private async http(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method?.toUpperCase() ?? (input instanceof Request ? input.method : "GET");
    this.requests.push({ host: url.hostname, method, path: url.pathname });
    const body: Row = typeof init?.body === "string" ? JSON.parse(init.body) as Row : {};
    if (url.origin === "https://api.fal.ai" && url.pathname === "/v1/models/pricing" && method === "GET") {
      const endpoint = url.searchParams.get("endpoint_id")!;
      return json({ prices: [{ endpoint_id: endpoint, unit: "seconds", currency: "USD", unit_price: endpoint.includes("/pro/") ? this.rate.pro : this.rate.standard }] });
    }
    if (url.origin === "https://queue.fal.run") {
      if (method === "POST") {
        assert.match(url.pathname, /^\/fal-ai\/kling-video\/v3\/(standard|pro)\/image-to-video$/);
        this.posts.push({ endpoint: url.pathname.slice(1), input: body });
        if (this.submitOutcome === "rejected") return json({ detail: "Invalid shot" }, 422);
        if (this.submitOutcome === "timeout") throw new DOMException("Test deadline", "TimeoutError");
        const id = `mock-task-${this.posts.length}`;
        this.tasks.set(id, { status: "IN_QUEUE", input: body });
        if (this.submitOutcome === "lost-response") throw new TypeError("Connection lost after acceptance");
        return json({ request_id: id, status: "IN_QUEUE" });
      }
      const match = /^\/fal-ai\/kling-video\/requests\/(mock-task-\d+)(\/status)?$/.exec(url.pathname);
      assert.ok(match, `Unexpected SDK queue URL: ${url.pathname}`);
      if (this.failProviderReads) throw new DOMException("Test provider deadline", "AbortError");
      const task = this.tasks.get(match[1])!;
      if (match[2]) return json({ status: task.status, ...(task.error ? { error: task.error, error_type: "content_policy_violation" } : {}) });
      if (task.resultStatus) return json({ detail: "Inference failed" }, task.resultStatus);
      if (task.missingVideo) return json(null);
      const bytes = this.videoBytes(Number(task.input.duration));
      return json({ video: { url: task.url ?? `https://v3b.fal.media/${match[1]}.mp4`, content_type: "video/mp4", file_size: bytes.length } });
    }
    if (url.origin === "https://v3b.fal.media") {
      const task = this.tasks.get(url.pathname.slice(1).replace(/\.mp4$/, ""))!;
      const bytes = this.corruptVideo ? Buffer.from("not an mp4 container") : this.videoBytes(Number(task.input.duration));
      return new Response(bytes, { headers: { "content-type": "video/mp4", "content-length": String(bytes.length) } });
    }
    if (url.origin === "https://video-test.invalid") {
      if (url.pathname.startsWith("/rest/v1/rpc/")) return this.rpc(url.pathname.split("/").at(-1)!, body);
      if (url.pathname.startsWith("/rest/v1/")) {
        const table = url.pathname.split("/").at(-1);
        assert.ok(table === "generations" || table === "video_source_assets", `Unexpected table: ${table}`);
        const headers = new Headers(init?.headers);
        let data = (table === "generations" ? this.rows : this.assets).filter(row => this.matches(row, url));
        if (method === "POST") {
          // Match the deployed PostgreSQL CHECK, including intentionally blank UI intent.
          if (!String(body.creative_direction_snapshot ?? "").trim() || String(body.creative_direction_snapshot).length > 4000)
            return json({ code: "23514", message: "generations_creative_direction_length_check" }, 400);
          if (this.rows.some(row => row.owner_id === body.owner_id && row.client_submission_id === body.client_submission_id)) return json({ code: "23505" }, 409);
          const row = { ...body, id: randomUUID(), created_at: new Date(this.now).toISOString(), processing_started_at: null,
            processing_completed_at: null, reconciliation_attempts: 0, next_reconciliation_at: null,
            reconciliation_lease_token: null, reconciliation_lease_version: 0, reconciliation_lease_expires_at: null };
          this.rows.push(row); data = [row];
        } else if (method === "PATCH") {
          if (data.some(row => row.status === "succeeded" || row.status === "failed")) {
            this.terminalWrites++; return json({ code: "P0001", message: "terminal video generations are immutable" }, 400);
          }
          for (const row of data) {
            if (body.status === "processing" && !row.processing_started_at) row.processing_started_at = new Date(this.now).toISOString();
            if (body.status === "succeeded" || body.status === "failed") row.processing_completed_at = new Date(this.now).toISOString();
            Object.assign(row, body);
          }
        } else assert.equal(method, "GET");
        if (url.searchParams.get("order")) data.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        return this.representation(data.map(row => ({ ...row })), headers);
      }
      const storage = /^\/storage\/v1\/object\/(info\/|sign\/|authenticated\/)?(.+)$/.exec(url.pathname);
      if (storage) {
        const [, operation, path] = storage;
        if (operation === "sign/" && method === "POST") return json({ signedURL: `/object/sign/${path}?token=mock-private-token` });
        const file = this.objects.get(path);
        if (operation === "info/") return file ? json({ metadata: { aspect_ratio: "1:1", mimetype: file.contentType, size: file.bytes.length } }) : json({ message: "Object not found" }, 404);
        if (method === "GET") return file ? new Response(new Uint8Array(file.bytes), { headers: { "content-type": file.contentType } }) : json({ message: "Object not found" }, 404);
        assert.equal(method, "POST");
        this.uploadAttempts++;
        if (this.failUploads > 0) { this.failUploads--; return json({ message: "Storage temporarily unavailable" }, 503); }
        if (file) return json({ message: "Asset already exists" }, 409);
        const headers = new Headers(init?.headers);
        const bytes = Buffer.from(await new Response(init?.body).arrayBuffer());
        this.objects.set(path, { bytes, contentType: headers.get("content-type")! });
        this.now += this.uploadDelayMs; this.uploadDelayMs = 0;
        return json({ Key: path });
      }
    }
    this.unexpected.push(`${method} ${url.origin}${url.pathname}`);
    throw new Error("Unmocked HTTP request blocked");
  }

  private videoBytes(duration: number) { return readFileSync(resolve(root, `tests/fixtures/kling-test-${duration}s.mp4`)); }
  private rpc(name: string, body: Row) {
    if (name === "reserve_video_studio_budget_once") {
      const key = `${body.p_owner}/${body.p_submission}`;
      if (this.reservations.has(key)) return json(null);
      assert.ok(Number(body.p_cost) > 0 && Number(body.p_cost) <= 2);
      const id = randomUUID();
      this.reservations.set(key, { id, finalized: false, cost: Number(body.p_cost) });
      return json(id);
    }
    if (name === "claim_video_beta_reconciliations") {
      if (this.failClaims) return json({ message: "Reconciliation temporarily unavailable" }, 503);
      const claimed = this.rows.filter(row => (!body.p_owner || row.owner_id === body.p_owner) && (!body.p_job || row.id === body.p_job)
        && ["queued", "processing"].includes(String(row.status)) && row.provider_request_id
        && (!row.next_reconciliation_at || Date.parse(String(row.next_reconciliation_at)) <= this.now)
        && (!row.reconciliation_lease_expires_at || Date.parse(String(row.reconciliation_lease_expires_at)) <= this.now)).slice(0, Number(body.p_limit));
      for (const row of claimed) Object.assign(row, { reconciliation_lease_token: randomUUID(),
        reconciliation_lease_version: Number(row.reconciliation_lease_version) + 1,
        reconciliation_lease_expires_at: new Date(this.now + 120_000).toISOString() });
      return json(claimed);
    }
    if (name === "finalize_video_beta_budget") {
      if (this.failFinalizations > 0) { this.failFinalizations--; return json({ message: "Ledger temporarily unavailable" }, 503); }
      const row = this.rows.find(row => row.id === body.p_job);
      if (!row || row.status !== "processing" || row.reconciliation_lease_token !== body.p_token || row.reconciliation_lease_version !== body.p_version
        || Date.parse(String(row.reconciliation_lease_expires_at)) <= this.now || row.billing_reservation_id !== body.p_reservation) return json(false);
      const reservation = [...this.reservations.values()].find(item => item.id === body.p_reservation)!;
      reservation.finalized = true;
      return json(true);
    }
    throw new Error(`Unexpected RPC: ${name}`);
  }
}
