import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import "./credit-source-lifecycle.test";
import "./financial-read-permissions.test";

import { CREDIT_CATALOG_VERSION, PLAN_CATALOG, TOP_UP_CATALOG } from "../src/lib/credit-economy/catalog";
import { canUseVideoTier } from "../src/lib/credit-economy/entitlements";
import { GENERATION_CREDIT_PRICES, ApprovedVideoCreditPricingPolicy, resolveImageCreditQuote } from "../src/lib/credit-economy/pricing";
import { ClosedBillingEventAdapter } from "../src/lib/credit-economy/billing-events";
import type { VideoGenerationDraft } from "../src/lib/video-generation/types";

const periodEnd = "2099-11-01T00:00:00.000Z";
const draft = (quality: "standard" | "pro", durationSeconds: 5 | 10): VideoGenerationDraft => ({
  clientSubmissionId: "20000000-0000-4000-8000-000000000002", mode: "image", prompt: "Motion", quality,
  aspectRatio: "16:9", durationSeconds, cameraMovement: "auto",
  source: { kind: "generated-image", generationId: "30000000-0000-4000-8000-000000000003" },
});

test("approved plans use versioned integer prices and monthly credits", () => {
  assert.equal(CREDIT_CATALOG_VERSION, "2026-10-v1");
  assert.deepEqual(Object.values(PLAN_CATALOG).map(({ monthlyPriceCents, monthlyCredits }) => [monthlyPriceCents, monthlyCredits]), [[1500, 1200], [2900, 3500], [4900, 6500], [9900, 14000], [19900, 30000]]);
  assert.ok(Object.values(PLAN_CATALOG).every(({ version }) => version === CREDIT_CATALOG_VERSION));
});

test("top-ups are exact and carry no entitlement", () => {
  assert.deepEqual(Object.values(TOP_UP_CATALOG).map(({ priceCents, credits }) => [priceCents, credits]), [[1000, 1000], [3000, 3000], [10000, 10000]]);
  assert.ok(Object.values(TOP_UP_CATALOG).every((item) => !("entitlements" in item)));
});

test("Pro entitlement starts at Growth and inactive accounts have no access", () => {
  assert.equal(canUseVideoTier(null, "standard"), false);
  assert.equal(canUseVideoTier({ planId: "starter", status: "active", currentPeriodEnd: periodEnd }, "standard"), true);
  assert.equal(canUseVideoTier({ planId: "creator", status: "active", currentPeriodEnd: periodEnd }, "pro"), false);
  assert.equal(canUseVideoTier({ planId: "growth", status: "active", currentPeriodEnd: periodEnd }, "pro"), true);
  assert.equal(canUseVideoTier({ planId: "studio", status: "past_due", currentPeriodEnd: periodEnd }, "pro"), false);
});

test("Standard Video is quoted while Pro stays closed", async () => {
  const pricing = new ApprovedVideoCreditPricingPolicy();
  assert.equal((await pricing.resolveQuote(draft("standard", 5)))?.requiredCredits, 300);
  assert.equal((await pricing.resolveQuote(draft("standard", 10)))?.requiredCredits, 600);
  assert.equal(await pricing.resolveQuote(draft("pro", 5)), null);
  assert.equal(GENERATION_CREDIT_PRICES.proVideo, null);
});

test("image quotes require server classification and repairs never charge twice", () => {
  assert.equal(resolveImageCreditQuote({ executionClass: "standard", classifiedByServerPolicy: false, repairAttempt: false }), null);
  assert.equal(resolveImageCreditQuote({ executionClass: null, classifiedByServerPolicy: true, repairAttempt: false }), null);
  assert.equal(resolveImageCreditQuote({ executionClass: "precision", classifiedByServerPolicy: true, repairAttempt: true }), null);
  assert.equal(resolveImageCreditQuote({ executionClass: "precision", classifiedByServerPolicy: true, repairAttempt: false })?.requiredCredits, 120);
});

test("events and expiration remain closed; grants are idempotent and service-only", async () => {
  assert.equal(await new ClosedBillingEventAdapter().verifyAndNormalize(), null);
  const sql = readFileSync("database/migrations/20261024000000_add_credit_economy_foundation.sql", "utf8");
  assert.match(sql, /check \(expires_at is null\)/i);
  assert.match(sql, /unique \(provider, event_reference\)/i);
  assert.match(sql, /unique \(subscription_id, period_start, period_end\)/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /grant execute[\s\S]*to service_role/i);
  assert.match(sql, /credit_ledger_entries_immutable/i);
  assert.doesNotMatch(sql, /grant execute[\s\S]*to authenticated/i);
});
