import type { VideoGenerationDraft, VideoReconciliationClaim } from "@/lib/video-generation/types";

export type VideoBillingReservation = { id: string; status: "reserved" };
export type VideoCreditQuote = { id: string; requiredCredits: number };
export type VideoCreditQuotePresentation =
  | { status: "unavailable" }
  | { status: "available"; requiredCredits: number; availableCredits: number; sufficient: boolean };
export type VideoBillingDecision =
  | { ok: true; reservation: VideoBillingReservation }
  | { ok: false; code: "billing_unavailable" | "insufficient_balance" };

export interface VideoBillingPolicy {
  // All operations must be idempotent by reservation ID; reconciliation can repeat after a crash.
  reserve(ownerId: string, submissionId: string, maximumProviderCostUsd: number, draft: VideoGenerationDraft): Promise<VideoBillingDecision>;
  finalize(reservationId: string, actualProviderCostUsd: number | null): Promise<void>;
  release(reservationId: string): Promise<void>;
  markForReconciliation(reservationId: string): Promise<void>;
}

/** An explicit boundary: provider USD estimates never become customer credits by default. */
export interface VideoCreditPricingPolicy {
  resolveQuote(draft: VideoGenerationDraft, maximumProviderCostUsd: number): Promise<VideoCreditQuote | null>;
}

export class ClosedVideoCreditPricingPolicy implements VideoCreditPricingPolicy {
  async resolveQuote(draft: VideoGenerationDraft, maximumProviderCostUsd: number): Promise<VideoCreditQuote | null> {
    void draft;
    void maximumProviderCostUsd;
    return null;
  }
}

/**
 * Claimed reconciliation must use this interface. Its SQL settlement function
 * verifies the Phase 5C lease token/version before touching financial records.
 */
export interface FencedVideoBillingPolicy extends VideoBillingPolicy {
  finalizeClaimed(reservationId: string, actualProviderCostUsd: number | null, claim: VideoReconciliationClaim): Promise<void>;
}

export type ConfirmedRefundReason = "confirmed_provider_failure" | "delivery_failure" | "internal_failure" | "confirmed_cancellation";

/** Reserved for confirmed non-delivery; ambiguous outcomes must remain in reconciliation. */
export interface SourceAwareVideoBillingPolicy extends FencedVideoBillingPolicy {
  refundConfirmed(reservationId: string, idempotencyKey: string, reason: ConfirmedRefundReason): Promise<void>;
  refundConfirmedClaimed(reservationId: string, idempotencyKey: string, reason: ConfirmedRefundReason, claim: VideoReconciliationClaim): Promise<void>;
}

/** Safe default until Klay has an approved, atomic customer-credit ledger. */
export class DisabledVideoBillingPolicy implements VideoBillingPolicy {
  async reserve(): Promise<VideoBillingDecision> { return { ok: false, code: "billing_unavailable" }; }
  async finalize(): Promise<void> { throw new Error("Video billing is not configured."); }
  async release(): Promise<void> { throw new Error("Video billing is not configured."); }
  async markForReconciliation(): Promise<void> { throw new Error("Video billing is not configured."); }
}
