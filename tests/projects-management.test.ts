import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import test from "node:test";
import ts from "typescript";
import {toggleProjectSelection, validateProjectIds, maxProjectDeleteBatch} from "../src/lib/projects/project-selection";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const compile = (path: string) => ts.transpileModule(readFileSync(path, "utf8"), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

test("selection toggles cards and discards IDs outside the current page", () => {
  const page = [id(1), id(2)];
  let selected = toggleProjectSelection([], id(1), page);
  assert.deepEqual(selected, [id(1)]);
  selected = toggleProjectSelection(selected, id(2), page);
  assert.deepEqual(selected, page);
  assert.deepEqual(toggleProjectSelection(selected, id(1), page), [id(2)]);
  assert.deepEqual(toggleProjectSelection(selected, id(3), [id(3)]), [id(3)]);
  assert.deepEqual(toggleProjectSelection(selected, id(99), page), page);
});

test("delete batches reject malformed, empty and oversized requests and deduplicate IDs", () => {
  for (const value of [null, {}, "bad", [], ["bad"], [id(1), 4], Array(maxProjectDeleteBatch + 1).fill(id(1))]) assert.equal(validateProjectIds(value), null);
  assert.deepEqual(validateProjectIds([id(1), id(1)]), [id(1)]);
});

async function deletionFixture(input: unknown, options: {unauthenticated?: boolean; fail?: number; missing?: number; locale?: string; single?: boolean} = {}) {
  const deleted: string[] = [], paths: string[] = [], reads: string[][] = [];
  const owned = [id(1), id(2), id(3)];
  const client = {from(table: string) {
    assert.equal(table, "projects");
    const filters: Record<string, unknown> = {};
    let mutation = false;
    const builder = {
      select() { return builder; }, delete() { mutation = true; return builder; },
      eq(key: string, value: unknown) { filters[key] = value; return builder; },
      in(key: string, values: string[]) { filters[key] = values; return builder; },
      async maybeSingle() {
        assert.equal(filters.user_id, "owner");
        assert.ok(owned.includes(String(filters.id)));
        assert.equal(mutation, true);
        if (filters.id === id(options.fail ?? -1)) return {error: new Error("DB conflict"), data: null};
        if (filters.id === id(options.missing ?? -1)) return {error: null, data: null};
        deleted.push(String(filters.id));
        return {error: null, data: {id: filters.id}};
      },
      then(resolve: (v: unknown) => unknown) {
        assert.equal(mutation, false);
        assert.equal(filters.user_id, "owner");
        const requested = filters.id as string[];
        reads.push(requested);
        return Promise.resolve({error: null, data: owned.filter(value => requested.includes(value)).map(value => ({id: value}))}).then(resolve);
      },
    };
    return builder;
  }};
  const exported: {deleteProjects?: (locale: string, value: unknown) => Promise<unknown>; deleteProject?: (locale: string, value: unknown, state: object, data: object) => Promise<unknown>} = {};
  runInNewContext(compile("src/app/[locale]/dashboard/actions.ts"), {exports: exported, require(name: string) {
    if (name === "next/cache") return {revalidatePath: (path: string) => paths.push(path)};
    if (name.endsWith("/i18n/routing")) return {isSupportedLocale: (value: string) => ["tr", "en"].includes(value)};
    if (name.endsWith("/auth/require-user")) return {getAuthenticatedUserId: async () => options.unauthenticated ? null : "owner"};
    if (name.endsWith("/supabase/admin")) return {getSupabaseAdminClient: () => client};
    if (name.endsWith("/supabase/server")) return {createClient: () => {throw new Error("Unexpected create");}};
    if (name.endsWith("/projects/project-selection")) return {validateProjectIds};
    throw new Error(name);
  }});
  const result = options.single ? await exported.deleteProject!(options.locale ?? "tr", input, {}, {}) : await exported.deleteProjects!(options.locale ?? "tr", input);
  return {result: plain(result) as {status: string; deletedIds: string[]; failedIds: string[]}, deleted, paths, reads};
}

test("bulk deletion verifies every ID, never deletes another owner's project and reports partial success", async () => {
  const {result, deleted, paths} = await deletionFixture([id(1), id(2), id(99)], {fail: 2});
  assert.deepEqual(result, {status: "partial", deletedIds: [id(1)], failedIds: [id(2), id(99)]});
  assert.deepEqual(deleted, [id(1)]);
  assert.ok(paths.includes("/tr/dashboard/projects"));
  assert.ok(paths.includes(`/tr/dashboard/projects/${id(1)}`));
});

test("zero-row deletion is failure and full success requires all requested projects", async () => {
  assert.equal((await deletionFixture([id(1), id(2)])).result.status, "success");
  const result = (await deletionFixture([id(1)], {missing: 1})).result;
  assert.equal(result.status, "error");
  assert.deepEqual(result.deletedIds, []);
  assert.deepEqual(result.failedIds, [id(1)]);
});

test("malformed batches, invalid locale and unauthenticated calls perform no project reads or mutations", async () => {
  for (const [input, options] of [[['bad'], {}], [[id(1)], {locale: "de"}], [[id(1)], {unauthenticated: true}]] as const) {
    const result = await deletionFixture(input, options);
    assert.equal(result.result.status, "error");
    assert.equal(result.deleted.length, 0);
    assert.equal(result.reads.length, 0);
  }
});

test("single deletion shares the authorized contract and never reports success for missing projects", async () => {
  assert.equal((await deletionFixture(id(1), {single: true, locale: "en"})).result.status, "success");
  assert.equal((await deletionFixture(id(99), {single: true})).result.status, "error");
  assert.equal((await deletionFixture("bad", {single: true})).result.status, "error");
});

test("selection controls, confirmations and feedback have complete TR/EN translations", () => {
  const ui = readFileSync("src/components/projects/projects-selection.tsx", "utf8") + readFileSync("src/components/projects/project-delete-button.tsx", "utf8");
  const en = JSON.parse(readFileSync("src/messages/en.json", "utf8")).Dashboard.projectManagement;
  const tr = JSON.parse(readFileSync("src/messages/tr.json", "utf8")).Dashboard.projectManagement;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(tr).sort());
  for (const catalog of [en, tr]) for (const [, key] of ui.matchAll(/\bt\("([A-Za-z]+)"/g)) assert.ok(catalog[key], key);
  assert.match(ui, /type="checkbox"/);
  assert.match(ui, /indeterminate = selected.length > 0/);
  assert.match(ui, /setSelectedIds\(allSelected \? \[\] : \[\.\.\.pageIds\]\)/);
  assert.match(ui, /submissionRef.current \|\| busy/);
  assert.match(ui, /setSelectedIds\(result.failedIds\)/);
  assert.match(ui, /aria-labelledby=\{titleId\}/);
  assert.match(ui, /dialog.showModal\(\)/);
  assert.match(ui, /onCancel=/);
  assert.match(ui, /router.refresh\(\)/);
});
