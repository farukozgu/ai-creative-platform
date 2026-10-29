import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const code = ts.transpileModule(readFileSync("src/lib/generations/get-dashboard-generations.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function run(statuses: number[]) {
  let calls = 0;
  const logs: string[] = [];
  const exports: { getDashboardGenerations?: (id: string) => Promise<{ generations: unknown[] }> } = {};
  runInNewContext(code, { exports, process: { env: { NODE_ENV: "development" } }, console: { error: (_label: string, value: string) => logs.push(value) },
    require(name: string) {
      if (name === "server-only") return {};
      if (name.endsWith("/favorite-generation")) return { isMissingFavoriteColumnError: () => false };
      if (name.endsWith("/supabase/server")) return { createClient: async () => ({ from(table: string) {
        assert.equal(table, "projects");
        return { select: () => ({ eq: async (field: string, owner: string) => {
          assert.equal(field, "user_id"); assert.equal(owner, "fixture-owner");
          const status = statuses[calls++];
          return { status, data: status === 200 ? [] : null, error: status === 200 ? null : { code: status === 0 ? "" : "42501", message: "private error detail" } };
        } }) };
      } }) };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  let failed = false;
  try { const result = await exports.getDashboardGenerations!("fixture-owner"); assert.equal(result.generations.length, 0); } catch { failed = true; }
  return { calls, logs, failed };
}

test("dashboard project read recovers from one transport failure with the same ownership filter", async () => {
  const result = await run([0, 200]);
  assert.equal(result.calls, 2); assert.equal(result.failed, false); assert.equal(result.logs.length, 0);
});

test("persistent transport failure stays unavailable and logs a safe readable reason", async () => {
  const result = await run([0, 0]);
  assert.equal(result.calls, 2); assert.equal(result.failed, true);
  assert.equal(JSON.parse(result.logs[0]).category, "network_error");
  assert.ok(!result.logs[0].includes("private error detail"));
});

test("permission failures are never retried or shown as empty activity", async () => {
  const result = await run([403]);
  assert.equal(result.calls, 1); assert.equal(result.failed, true);
  assert.equal(JSON.parse(result.logs[0]).code, "42501");
});
