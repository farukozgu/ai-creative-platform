import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Phase 5H.1 adds only the three intended financial read grants", () => {
  const sql = read("database/migrations/20261026000000_fix_financial_read_permissions.sql");
  assert.match(sql, /grant select on table public\.billing_subscriptions to service_role;/i);
  assert.match(sql, /grant select on table public\.credit_ledger_entries, public\.video_credit_reservations to authenticated;/i);
  assert.doesNotMatch(sql, /\b(insert|update|delete|all privileges|execute)\b/i);
  assert.doesNotMatch(sql, /\banon\b/i);
  assert.doesNotMatch(sql, /verified_billing_events/i);
});

test("owner-history policies are present and remain owner-scoped", () => {
  const sql = read("database/migrations/20261022000000_create_video_credit_ledger.sql");
  assert.match(sql, /create policy "Users can read their own video credit reservations"[\s\S]*for select to authenticated using \(\(select auth\.uid\(\)\) = owner_id\)/i);
  assert.match(sql, /create policy "Users can read their own credit ledger entries"[\s\S]*for select to authenticated using \(\(select auth\.uid\(\)\) = owner_id\)/i);
});

test("subscription entitlement resolution uses a server-only direct subscription read", () => {
  const source = read("src/lib/credit-economy/subscription-repository.ts");
  assert.match(source, /import "server-only"/);
  assert.match(source, /getSupabaseAdminClient\(\)[\s\S]*\.from\("billing_subscriptions"\)[\s\S]*\.eq\("owner_id", ownerId\)/);
});
