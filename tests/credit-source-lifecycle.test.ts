import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { allocateCredits, isSourceEligible, resolveRefundEligibility, type CreditSource } from "../src/lib/credit-economy/source-lifecycle";

const now = new Date("2026-10-21T12:00:00.000Z");
const sources: CreditSource[] = [
  { grantId: "top-up", kind: "top_up", availableCredits: 500, expiresAt: null, createdAt: "2026-09-01T00:00:00.000Z" },
  { grantId: "later", kind: "subscription_period", availableCredits: 200, expiresAt: "2026-11-30T00:00:00.000Z", createdAt: "2026-10-01T00:00:00.000Z" },
  { grantId: "sooner", kind: "subscription_period", availableCredits: 100, expiresAt: "2026-10-31T00:00:00.000Z", createdAt: "2026-10-01T00:00:00.000Z" },
  { grantId: "expired", kind: "subscription_period", availableCredits: 900, expiresAt: "2026-10-20T00:00:00.000Z", createdAt: "2026-09-01T00:00:00.000Z" },
];

test("verified period boundary expires monthly sources while top-ups never expire", () => {
  assert.equal(isSourceEligible(sources[2]!, new Date("2026-10-30T23:59:59.999Z")), true);
  assert.equal(isSourceEligible(sources[2]!, new Date("2026-10-31T00:00:00.000Z")), false);
  assert.equal(isSourceEligible(sources[0]!, new Date("2099-01-01T00:00:00.000Z")), true);
});

test("spending uses soonest-expiring subscriptions before top-ups and spans sources", () => {
  assert.deepEqual(allocateCredits(sources, 450, now), [
    { grantId: "sooner", credits: 100, expiresAt: "2026-10-31T00:00:00.000Z" },
    { grantId: "later", credits: 200, expiresAt: "2026-11-30T00:00:00.000Z" },
    { grantId: "top-up", credits: 150, expiresAt: null },
  ]);
  assert.equal(allocateCredits(sources, 801, now), null);
});

test("post-expiration subscription refunds stay expired while top-ups restore", () => {
  assert.deepEqual(resolveRefundEligibility({ grantId: "period", credits: 60, expiresAt: "2026-10-21T11:59:59.000Z" }, now), { availableCredits: 0, expiredCredits: 60 });
  assert.deepEqual(resolveRefundEligibility({ grantId: "top-up", credits: 60, expiresAt: null }, now), { availableCredits: 60, expiredCredits: 0 });
});

test("migration preserves in-flight reservations, fencing, idempotency, and append-only audit", () => {
  const sql = readFileSync("database/migrations/20261025000000_add_source_aware_credit_lifecycle.sql", "utf8");
  assert.match(sql, /available_credits \+ reserved_credits \+ consumed_credits \+ expired_credits = granted_credits/i);
  assert.match(sql, /order by expires_at asc nulls last, created_at, grant_id for update/i);
  assert.match(sql, /source_expires_at/i);
  assert.match(sql, /reserved_credits = reserved_credits - allocation\.allocated_credits, consumed_credits = consumed_credits \+ allocation\.allocated_credits/i);
  assert.match(sql, /idempotency_key text not null unique/i);
  assert.match(sql, /generation\.reconciliation_lease_token is distinct from p_lease_token/i);
  assert.match(sql, /movement_type[\s\S]*refund_expired[\s\S]*expiration/i);
  assert.match(sql, /credit_source_movements_immutable/i);
  assert.match(sql, /for update skip locked limit/i);
});

test("migration denies public mutation and refuses unsafe historical attribution", () => {
  const sql = readFileSync("database/migrations/20261025000000_add_source_aware_credit_lifecycle.sql", "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on function public\.refund_video_credit_reservation[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.refund_video_credit_reservation[\s\S]*to service_role/i);
  assert.match(sql, /requires an audited source backfill/i);
  assert.doesNotMatch(sql, /grant execute on function public\.refund_video_credit_reservation[^;]*to authenticated/i);
});

test("live image billing and video inference remain closed", () => {
  const capabilities = readFileSync("src/lib/video-generation/capabilities.ts", "utf8");
  const imageAction = readFileSync("src/app/[locale]/dashboard/projects/[projectId]/generation-actions.ts", "utf8");
  assert.match(capabilities, /productionApproved: false/g);
  assert.doesNotMatch(imageAction, /reserve_video_credits|SupabaseVideoCreditBillingPolicy/);
});
