import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

type QueryResult = { count: number | null; data: Record<string, unknown>[] | null; error: { code: string } | null };
type Operation = { method: string; args: unknown[] };
type Query = { table: string; operations: Operation[] };
const source = readFileSync("src/lib/dashboard/get-dashboard-overview.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

async function loadOverview(options: { empty?: boolean; unavailable?: boolean; rejected?: boolean; failedPrimary?: boolean } = {}) {
  const queries: Query[] = [];
  const ownImage = { id: "own-image", "projects.user_id": "owner", generation_type: "image", status: "succeeded" };
  const rows: Record<string, unknown>[] = options.empty ? [] : [
    ...Array.from({ length: 21 }, (_, i) => ({ ...ownImage, id: `image-${i}` })),
    { ...ownImage, id: "other-image", "projects.user_id": "other" },
    { ...ownImage, id: "failed-image", status: "failed" },
    { id: "own-video", owner_id: "owner", generation_type: "video", status: "succeeded" },
    { id: "failed-video", owner_id: "owner", generation_type: "video", status: "failed" },
    { id: "other-video", owner_id: "other", generation_type: "video", status: "succeeded" },
  ];
  const models = options.empty ? [] : Array.from({ length: 8 }, (_, i) => ({ id: `model-${i}`, user_id: i === 7 ? "other" : "owner", name: `Model ${i}`, status: "draft", updated_at: `2026-10-${String(i + 1).padStart(2, "0")}` }));
  const client = { from(table: string) {
    const query: Query = { table, operations: [] };
    queries.push(query);
    const builder = {
      select(...args: unknown[]) { query.operations.push({ method: "select", args }); return builder; },
      eq(...args: unknown[]) { query.operations.push({ method: "eq", args }); return builder; },
      order(...args: unknown[]) { query.operations.push({ method: "order", args }); return builder; },
      limit(...args: unknown[]) { query.operations.push({ method: "limit", args }); return builder; },
      then(resolve: (value: QueryResult) => unknown, reject: (reason: Error) => unknown) {
        const isOptional = table === "model_profiles" || query.operations.some(op => op.method === "eq" && op.args[1] === "video");
        if (options.rejected && isOptional) return Promise.reject(new Error("Unavailable")).then(resolve, reject);
        if (options.unavailable && isOptional) return Promise.resolve({ count: null, data: null, error: { code: table === "model_profiles" ? "42P01" : "42703" } }).then(resolve, reject);
        let data: Record<string, unknown>[] = table === "model_profiles" ? models : rows;
        for (const op of query.operations) if (op.method === "eq") data = data.filter(row => row[String(op.args[0])] === op.args[1]);
        const count = data.length;
        for (const op of query.operations) {
          if (op.method === "order") data = [...data].sort((a, b) => String(b[String(op.args[0])]).localeCompare(String(a[String(op.args[0])])));
          if (op.method === "limit") data = data.slice(0, Number(op.args[0]));
        }
        return Promise.resolve({ count, data, error: null }).then(resolve, reject);
      },
    };
    return builder;
  } };
  const moduleExports: { getDashboardOverview?: (id: string) => Promise<{
    counts: { projects: number | null; images: number | null; models: number | null; videos: number | null };
    projects: unknown[] | null; models: { id: string; status: string }[] | null; creations: unknown[] | null;
  }> } = {};
  runInNewContext(compiled, { exports: moduleExports, require(id: string) {
    if (id === "server-only") return {};
    if (id.endsWith("/supabase/server")) return { createClient: async () => client };
    if (id.endsWith("/projects/get-projects")) return { getProjectsPage: async (userId: string, params: Record<string, unknown>) => {
      assert.equal(userId, "owner");
      assert.equal(params.pageSize, 5);
      assert.equal(params.sort, "updated");
      if (options.failedPrimary) throw new Error("Projects failed");
      return { totalCount: options.empty ? 0 : 19, projects: options.empty ? [] : Array.from({ length: 5 }, (_, id) => ({ id })) };
    } };
    if (id.endsWith("/generations/get-dashboard-generations")) return { getDashboardGenerations: async (userId: string) => {
      assert.equal(userId, "owner");
      if (options.failedPrimary) throw new Error("Images failed");
      return { generations: options.empty ? [] : Array.from({ length: 6 }, (_, id) => ({ id })) };
    } };
    throw new Error(`Unexpected dependency: ${id}`);
  } });
  assert.ok(moduleExports.getDashboardOverview);
  return { result: await moduleExports.getDashboardOverview("owner"), queries };
}

test("KPIs count all owned successful records, independently of limited previews", async () => {
  const { result, queries } = await loadOverview();
  assert.deepEqual({ ...result.counts }, { projects: 19, images: 21, models: 7, videos: 1 });
  assert.equal(result.projects?.length, 5);
  assert.equal(result.creations?.length, 4);
  assert.equal(result.models?.length, 3);
  assert.equal(result.models?.[0].id, "model-6");
  assert.equal(result.models?.[0].status, "draft");
  for (const query of queries) {
    assert.ok(query.operations.some(op => op.method === "select" && (op.args[1] as { count?: string })?.count === "exact"));
    assert.ok(query.operations.some(op => op.method === "eq" && op.args[1] === "owner"));
  }
  const imageQuery = queries.find(query => query.operations.some(op => op.args[1] === "image"));
  assert.ok(imageQuery?.operations.some(op => op.method === "select" && String(op.args[0]).includes("projects!inner(user_id)")));
  assert.ok(imageQuery?.operations.some(op => op.method === "eq" && op.args[0] === "projects.user_id"));
  assert.ok(imageQuery?.operations.some(op => op.method === "eq" && op.args[1] === "succeeded"));
  assert.ok(!imageQuery?.operations.some(op => op.method === "limit"));
});

test("new users have genuine zero counts and empty activity lists", async () => {
  const { result } = await loadOverview({ empty: true });
  assert.deepEqual({ ...result.counts }, { projects: 0, images: 0, models: 0, videos: 0 });
  assert.equal(result.projects?.length, 0);
  assert.equal(result.models?.length, 0);
  assert.equal(result.creations?.length, 0);
});

for (const failure of ["unavailable", "rejected"] as const) test(`optional schema ${failure} preserves primary activity and shows unavailable counts`, async () => {
  const { result } = await loadOverview({ [failure]: true });
  assert.equal(result.counts.models, null);
  assert.equal(result.counts.videos, null);
  assert.equal(result.models, null);
  assert.equal(result.counts.images, 21);
  assert.equal(result.counts.projects, 19);
  assert.equal(result.creations?.length, 4);
});

test("failed project and recent image reads do not masquerade as empty histories", async () => {
  const { result } = await loadOverview({ failedPrimary: true });
  assert.equal(result.counts.projects, null);
  assert.equal(result.projects, null);
  assert.equal(result.creations, null);
  assert.equal(result.counts.images, 21);
  assert.equal(result.counts.models, 7);
});
