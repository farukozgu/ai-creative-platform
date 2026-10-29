import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { isProductProfile } from "../src/lib/product-understanding/product-profile";
import { presetProduct, unknownPresetProduct } from "../src/lib/video-director/preset-recommendations";
import { directorProducts } from "./fixtures/video-director-fixtures";
import type * as preparation from "../src/lib/video-generation/prepared-source";

const owner = "10000000-0000-4000-8000-000000000001";
const source = { kind: "generated-image" as const, generationId: "20000000-0000-4000-8000-000000000001" };
const requirePackage = createRequire(import.meta.url);
function fixture(owned: boolean, profileError: boolean, previewFailure = false) {
  let assetReads = 0, downloads = 0;
  const diagnostics: unknown[][] = [];
  const filters: { table: string; key: string; value: unknown }[] = [];
  const client = { from: (table: string) => {
    const query = {
      select: () => query, insert: () => query,
      eq: (key: string, value: unknown) => { filters.push({ table, key, value }); return query; },
      single: async () => ({ data: { id: "prepared" }, error: null }),
      maybeSingle: async () => {
        if (table === "generations") return { data: { project_id: "project", input_asset_id: "asset", generation_type: "image", status: "succeeded", output_bucket_id: "generated-assets", output_object_path: `${owner}/product.png` } };
        if (table === "projects") return { data: owned ? { id: "project" } : null };
        if (table === "assets") { assetReads++; if (profileError) throw Error("profile unavailable"); return { data: { product_profile: directorProducts[0] } }; }
        return { data: null };
      },
    };
    return query;
  }, storage: { from: () => ({
    download: async () => { downloads++; return { data: { type: "image/png", size: 3, arrayBuffer: async () => Buffer.from("src") } }; },
    upload: async () => ({}), createSignedUrl: async () => previewFailure
      ? ({ data: null, error: new Error("private storage detail") })
      : ({ data: { signedUrl: "https://invalid.example/owned" } }),
  }) } };
  const mocks: Record<string, unknown> = {
    "server-only": {}, sharp: () => ({ metadata: async () => ({ width: 100, height: 100 }) }),
    "./source-context": { sourceFrameGeometry: () => ({ originalWidth: 100, originalHeight: 100, contentRect: { x: 0, y: 0, width: 1, height: 1 } }) },
    "@/lib/supabase/admin": { getSupabaseAdminClient: () => client },
    "./prepare-source-image": { prepareVideoSourceImage: async () => ({ image: Buffer.from("prepared"), width: 100, height: 100, mimeType: "image/png" }) },
    "@/lib/product-understanding/product-profile": { isProductProfile },
    "@/lib/video-director/preset-recommendations": { presetProduct, unknownPresetProduct },
    "./diagnostics": { logVideoDiagnostic: (correlationId: string, stage: string, result: string, fields: unknown) => diagnostics.push([correlationId, stage, result, fields]) },
  };
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync("src/lib/video-generation/prepared-source.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { exports, Buffer, console: { error: (...args: unknown[]) => diagnostics.push(args) }, require: (name: string) => {
    if (name in mocks) return mocks[name];
    if (name.startsWith("node:")) return requirePackage(name);
    throw Error(`Unmocked I/O: ${name}`);
  } });
  return { api: exports as typeof preparation, filters, diagnostics, counts: () => ({ assetReads, downloads }) };
}

test("source suggestions read a profile only after project ownership and constrain it to that project", async () => {
  const blocked = fixture(false, false);
  await assert.rejects(blocked.api.prepareOwnedVideoSource(owner, source, "16:9"));
  assert.deepEqual(blocked.counts(), { assetReads: 0, downloads: 0 });
  const allowed = fixture(true, false);
  const result = await allowed.api.prepareOwnedVideoSource(owner, source, "16:9");
  assert.equal(result.presetContext.category, "apparel");
  assert.ok(allowed.filters.some(item => item.table === "projects" && item.key === "user_id" && item.value === owner));
  assert.ok(allowed.filters.some(item => item.table === "assets" && item.key === "project_id" && item.value === "project"));
  assert.deepEqual(allowed.counts(), { assetReads: 1, downloads: 1 });
});

test("unavailable product evidence preserves valid preparation and universal suggestions", async () => {
  const f = fixture(true, true);
  const result = await f.api.prepareOwnedVideoSource(owner, source, "16:9");
  assert.equal(result.presetContext.category, "unknown");
  assert.equal(result.previewUrl, "https://invalid.example/owned");
});

test("source preparation logs only a safe stage when signed preview creation fails", async () => {
  const f = fixture(true, false, true);
  await assert.rejects(f.api.prepareOwnedVideoSource(owner, source, "16:9", { correlationId: "test-correlation" }));
  assert.equal(f.diagnostics.length, 1);
  assert.equal(f.diagnostics[0][0], "test-correlation");
  assert.equal(f.diagnostics[0][1], "video_source_prepare");
  assert.equal(f.diagnostics[0][2], "failed");
  assert.equal((f.diagnostics[0][3] as { code: string }).code, "preview_url");
});
