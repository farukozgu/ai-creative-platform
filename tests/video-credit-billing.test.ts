import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ClosedVideoCreditPricingPolicy } from "../src/lib/video-generation/billing";

type Status = "reserved" | "finalized" | "released" | "reconciliation_required";
type Reservation = { id: string; ownerId: string; submissionId: string; credits: number; status: Status; leaseVersion?: number };

class MemoryCreditLedger {
  available: number;
  reserved = 0;
  reservations = new Map<string, Reservation>();
  constructor(available: number) { this.available = available; }
  reserve(ownerId: string, submissionId: string, credits: number) {
    const existing = [...this.reservations.values()].find((reservation) => reservation.ownerId === ownerId && reservation.submissionId === submissionId);
    if (existing) return existing.status === "reserved" ? { outcome: "existing_reserved", reservation: existing } : { outcome: "existing_non_reservable", reservation: existing };
    if (this.available < credits) return { outcome: "insufficient_balance" as const, reservation: null };
    const reservation: Reservation = { id: `reservation-${submissionId}`, ownerId, submissionId, credits, status: "reserved" };
    this.available -= credits; this.reserved += credits; this.reservations.set(reservation.id, reservation);
    return { outcome: "reserved" as const, reservation };
  }
  finalize(id: string, leaseVersion?: number) {
    const reservation = this.reservations.get(id); if (!reservation) return "not_found";
    if (leaseVersion !== undefined && reservation.leaseVersion !== leaseVersion) return "stale_lease";
    if (reservation.status === "finalized") return "finalized";
    if (reservation.status !== "reserved" && reservation.status !== "reconciliation_required") return "not_settleable";
    this.reserved -= reservation.credits; reservation.status = "finalized"; return "finalized";
  }
  release(id: string) {
    const reservation = this.reservations.get(id); if (!reservation) return "not_found";
    if (reservation.status === "released") return "released";
    if (reservation.status !== "reserved") return "not_releasable";
    this.reserved -= reservation.credits; this.available += reservation.credits; reservation.status = "released"; return "released";
  }
  reconcile(id: string) { const reservation = this.reservations.get(id); if (!reservation) return "not_found"; if (reservation.status === "reserved") reservation.status = "reconciliation_required"; return reservation.status; }
}

test("credit migration uses one owner account, transaction locks, idempotent reservations, and service-only RPCs", () => {
  const sql = readFileSync("database/migrations/20261022000000_create_video_credit_ledger.sql", "utf8");
  assert.match(sql, /create table public\.credit_accounts/i);
  assert.match(sql, /unique \(owner_id, submission_id\)/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /available_credits = available_credits - p_required_credits/i);
  assert.match(sql, /reconciliation_lease_token is distinct from p_lease_token/i);
  assert.match(sql, /revoke all on function[\s\S]*anon, authenticated/i);
  assert.match(sql, /grant execute[\s\S]*to service_role/i);
});

test("concurrent logical submissions and insufficient funds cannot overspend", () => {
  const ledger = new MemoryCreditLedger(10);
  const first = ledger.reserve("owner", "submission-a", 7);
  const second = ledger.reserve("owner", "submission-b", 7);
  const duplicate = ledger.reserve("owner", "submission-a", 7);
  assert.equal(first.outcome, "reserved"); assert.equal(second.outcome, "insufficient_balance"); assert.equal(duplicate.outcome, "existing_reserved");
  assert.equal(ledger.available, 3); assert.equal(ledger.reserved, 7);
});

test("settlement and release are idempotent while confirmed non-submission releases exactly once", () => {
  const ledger = new MemoryCreditLedger(20);
  const reserved = ledger.reserve("owner", "submission-a", 8).reservation!;
  assert.equal(ledger.finalize(reserved.id), "finalized"); assert.equal(ledger.finalize(reserved.id), "finalized");
  assert.equal(ledger.available, 12); assert.equal(ledger.reserved, 0);
  const releasable = ledger.reserve("owner", "submission-b", 5).reservation!;
  assert.equal(ledger.release(releasable.id), "released"); assert.equal(ledger.release(releasable.id), "released");
  assert.equal(ledger.available, 12); assert.equal(ledger.reserved, 0);
});

test("ambiguous provider outcomes remain reserved, and stale workers cannot settle", () => {
  const ledger = new MemoryCreditLedger(20);
  const reservation = ledger.reserve("owner", "submission-a", 8).reservation!;
  reservation.leaseVersion = 2;
  assert.equal(ledger.reconcile(reservation.id), "reconciliation_required"); assert.equal(ledger.release(reservation.id), "not_releasable");
  assert.equal(ledger.finalize(reservation.id, 1), "stale_lease"); assert.equal(ledger.finalize(reservation.id, 2), "finalized");
  assert.equal(ledger.available, 12); assert.equal(ledger.reserved, 0);
});

test("closed pricing never invents customer credits from provider cost", async () => {
  const pricing = new ClosedVideoCreditPricingPolicy();
  const quote = await pricing.resolveQuote({ clientSubmissionId: "20000000-0000-4000-8000-000000000002", mode: "image", prompt: "Video", quality: "standard", aspectRatio: "16:9", durationSeconds: 5, cameraMovement: "auto", source: { kind: "generated-image", generationId: "30000000-0000-4000-8000-000000000003" } }, 0.42);
  assert.equal(quote, null);
});
