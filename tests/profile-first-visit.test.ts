import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

test("first sign-in returns the inserted profile without reusing an empty request-memoized read", async () => {
  const profile = { id: "new-user", display_name: null, avatar_url: null, created_at: "now", updated_at: "now" };
  let reads = 0;
  const query = { select: () => query, eq: () => query, abortSignal: () => query, maybeSingle: async () => { reads++; return { data: null, error: null }; } };
  const client = { from: () => ({ ...query, insert: () => ({ select: () => ({ single: async () => ({ data: profile, error: null }) }) }) }) };
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync("src/lib/profile/get-or-create-profile.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, AbortSignal, require: (name: string) => name === "server-only" ? {} : { createClient: async () => client } });
  const get = exports.getOrCreateProfile as (id: string) => Promise<unknown>;
  assert.equal(await get("new-user"), profile);
  assert.equal(reads, 1);
});
