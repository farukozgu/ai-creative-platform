import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import test from "node:test";
import ts from "typescript";

type Generation = {id: string; status: string; generation_type: string; created_at: string; output_bucket_id: string | null; output_object_path: string | null};
type Row = {id: string; user_id: string; title: string; status: string; created_at: string; updated_at: string; generations: Generation[]};
type Op = {name: string; args: unknown[]};
const timestamp = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString();
const generation = (id: string, status: string, minute: number): Generation => ({id, status, generation_type: "image", created_at: timestamp(minute), output_bucket_id: status === "succeeded" ? "private" : null, output_object_path: status === "succeeded" ? "output" : null});
const fixture: Row[] = Array.from({length: 245}, (_, i) => ({
  id: `project-${String(i).padStart(3, "0")}`, user_id: i < 240 ? "owner" : "other", title: i % 2 ? `Campaign ${i}` : `Product ${i}`,
  status: ["draft", "active", "completed"][i % 3], created_at: timestamp(i), updated_at: timestamp(300 - Math.floor(i / 2)),
  generations: i === 0 ? [] : i === 10 ? [generation("a", "succeeded", 1), generation("b", "failed", 1)] : i === 11 ? [generation("a", "failed", 1), generation("b", "succeeded", 1)] : [generation("old", "failed", 0), generation("success", "succeeded", 1), generation("latest", i % 3 === 0 ? "failed" : "succeeded", 2)],
}));
const latest = (row: Row) => [...row.generations].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
const code = ts.transpileModule(readFileSync("src/lib/projects/get-projects.ts", "utf8"), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;

async function queryProjects(options: {page: number; pageSize: number; search: string; status: string | null; sort: string}, rows = fixture) {
  const calls: Op[][] = [];
  const client = {from(table: string) {
    assert.equal(table, "projects");
    const ops: Op[] = [];
    calls.push(ops);
    const builder = {
      select(...args: unknown[]) {ops.push({name: "select", args}); return builder;},
      eq(...args: unknown[]) {ops.push({name: "eq", args}); return builder;},
      in(...args: unknown[]) {ops.push({name: "in", args}); return builder;},
      ilike(...args: unknown[]) {ops.push({name: "ilike", args}); return builder;},
      order(...args: unknown[]) {ops.push({name: "order", args}); return builder;},
      limit(...args: unknown[]) {ops.push({name: "limit", args}); return builder;},
      range(...args: unknown[]) {ops.push({name: "range", args}); return builder;},
      then(resolve: (value: unknown) => unknown) {
        assert.ok(ops.some(op => op.name === "eq" && op.args[0] === "user_id" && op.args[1] === "owner"));
        let data = rows.filter(row => ops.filter(op => op.name === "eq" && !String(op.args[0]).includes('.')).every(op => row[op.args[0] as keyof Row] === op.args[1]));
        for (const op of ops) {
          if (op.name === "in") data = data.filter(row => (op.args[1] as string[]).includes(String(row[op.args[0] as keyof Row])));
          if (op.name === "ilike") data = data.filter(row => row.title.toLowerCase().includes(String(op.args[1]).replaceAll('%', '').toLowerCase()));
        }
        const count = data.length;
        const orders = ops.filter(op => op.name === "order" && !(op.args[1] as {referencedTable?: string})?.referencedTable);
        data = [...data].sort((a,b) => { for (const op of orders) {const field = op.args[0] as keyof Row; const cmp = String(a[field]).localeCompare(String(b[field])); if(cmp) return (op.args[1] as {ascending: boolean}).ascending ? cmp : -cmp;} return 0;});
        const range = ops.find(op => op.name === "range");
        if (range && Number(range.args[0]) > 0 && Number(range.args[0]) >= data.length) throw new Error("Invalid PostgREST range");
        if (range) data = data.slice(Number(range.args[0]), Number(range.args[1]) + 1);
        const serialized = data.map(row => ({...row, latest_generation: latest(row) ? [latest(row)] : [], successful_generation: row.generations.filter(g => g.status === "succeeded").slice(0,1), product_asset: []}));
        return Promise.resolve({data: serialized, count, error: null}).then(resolve);
      },
    };
    return builder;
  }, storage: {from() {return {createSignedUrl: async () => ({data: {signedUrl: "signed-private-preview"}})};}}};
  const exported: {getProjectsPage?: (user: string, options: object) => Promise<{projects: {id: string; thumbnail_url: string | null; latest_generation: {status: string}}[]; resultCount: number; totalCount: number; page: number; pageCount: number}>} = {};
  runInNewContext(code, {exports: exported, process: {env: {NODE_ENV: "test"}}, require(name: string) {
    if(name === "server-only") return {};
    if(name.endsWith("/supabase/server")) return {createClient: async () => client};
    if(name.endsWith("/product-understanding/product-profile")) return {isProductProfile: () => false};
    throw new Error(name);
  }});
  return {result: await exported.getProjectsPage!("owner", options), calls};
}

for (const sort of ["updated", "newest", "oldest"]) test(`failed filter applies latest generation before pagination with ${sort} sorting`, async () => {
  const {result, calls} = await queryProjects({page: 2, pageSize: 16, search: "", status: "failed", sort});
  const field = sort === "updated" ? "updated_at" : "created_at";
  const expected = fixture.filter(row => row.user_id === "owner" && latest(row)?.status === "failed").sort((a,b) => (sort === "oldest" ? 1 : -1) * (a[field].localeCompare(b[field]) || a.id.localeCompare(b.id)));
  assert.equal(result.totalCount, 240);
  assert.equal(result.resultCount, expected.length);
  assert.deepEqual(Array.from(result.projects, p => p.id), expected.slice(16,32).map(p => p.id));
  assert.ok(calls.filter(ops => ops.some(op => op.name === "range" && op.args[1] === 199 || op.name === "range" && op.args[1] === 399)).length >= 2);
  const scans = calls.filter(ops => ops.some(op => op.name === "select" && op.args[0] === "id, latest_generation:generations(id, status, created_at)"));
  for (const ops of scans) {
    assert.ok(ops.some(op => op.name === "order" && op.args[0] === "created_at" && (op.args[1] as {referencedTable?: string}).referencedTable === "latest_generation"));
    assert.ok(ops.some(op => op.name === "order" && op.args[0] === "id" && (op.args[1] as {referencedTable?: string}).referencedTable === "latest_generation"));
    assert.ok(!ops.some(op => op.name === "eq" && op.args[1] === "failed"));
  }
});

test("search and failed filter share the correct matching count and final-page clamp", async () => {
  const {result} = await queryProjects({page: 999, pageSize: 5, search: "Campaign", status: "failed", sort: "newest"});
  const expected = fixture.filter(row => row.user_id === "owner" && row.title.includes("Campaign") && latest(row)?.status === "failed");
  assert.equal(result.resultCount, expected.length);
  assert.equal(result.page, Math.ceil(expected.length / 5));
  assert.equal(result.projects.length, expected.length % 5 || 5);
});

test("timestamp ties use generation ID; older successes retain the existing preview", async () => {
  const {result} = await queryProjects({page: 1, pageSize: 16, search: "", status: "failed", sort: "oldest"});
  const tiedFailure = result.projects.find(p => p.id === "project-010");
  assert.ok(tiedFailure);
  assert.equal(tiedFailure.latest_generation.status, "failed");
  assert.equal(tiedFailure.thumbnail_url, "signed-private-preview");
  assert.ok(!result.projects.some(p => p.id === "project-011" || p.id === "project-000"));
});

test("no failed matches returns a truthful empty result on page one", async () => {
  const {result} = await queryProjects({page: 9, pageSize: 16, search: "not found", status: "failed", sort: "updated"});
  assert.equal(result.resultCount, 0);
  assert.equal(result.projects.length, 0);
  assert.equal(result.page, 1);
  assert.equal(result.pageCount, 1);
});

for (const status of ["draft", "active", "completed"]) test(`existing ${status} project filter remains independent of generation status`, async () => {
  const {result} = await queryProjects({page: 1, pageSize: 16, search: "Campaign", status, sort: "updated"});
  assert.equal(result.resultCount, fixture.filter(row => row.user_id === "owner" && row.title.includes("Campaign") && row.status === status).length);
});

test("deletion refresh clamps an obsolete page before requesting a now-invalid range", async () => {
  for (const status of [null, "draft"]) {
    const {result} = await queryProjects({page: 99, pageSize: 16, search: "Campaign", status, sort: "updated"});
    assert.equal(result.page, Math.max(1, Math.ceil(result.resultCount / 16)));
    assert.ok(result.projects.length > 0);
  }
  const {result} = await queryProjects({page: 8, pageSize: 16, search: "", status: null, sort: "updated"}, []);
  assert.equal(result.page, 1);
  assert.equal(result.projects.length, 0);
});
