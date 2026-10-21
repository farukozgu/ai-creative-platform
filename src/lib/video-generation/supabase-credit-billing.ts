import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ConfirmedRefundReason, SourceAwareVideoBillingPolicy, VideoBillingDecision, VideoCreditPricingPolicy } from "@/lib/video-generation/billing";
import { ClosedVideoCreditPricingPolicy } from "@/lib/video-generation/billing";
import type { VideoGenerationDraft, VideoReconciliationClaim } from "@/lib/video-generation/types";

type ReservationRpcRow = { outcome: string; reservation_id: string | null };

export class SupabaseVideoCreditBillingPolicy implements SourceAwareVideoBillingPolicy {
  constructor(private readonly pricing: VideoCreditPricingPolicy = new ClosedVideoCreditPricingPolicy()) {}

  async reserve(ownerId: string, submissionId: string, maximumProviderCostUsd: number, draft: VideoGenerationDraft): Promise<VideoBillingDecision> {
    const quote = await this.pricing.resolveQuote(draft, maximumProviderCostUsd);
    if (!quote) return { ok: false, code: "billing_unavailable" };
    const { data, error } = await getSupabaseAdminClient().rpc("reserve_video_credits", { p_owner_id: ownerId, p_submission_id: submissionId, p_quote_id: quote.id, p_required_credits: quote.requiredCredits });
    if (error || !data?.[0]) return { ok: false, code: "billing_unavailable" };
    const row = data[0] as ReservationRpcRow;
    if (row.outcome === "insufficient_balance") return { ok: false, code: "insufficient_balance" };
    if ((row.outcome !== "reserved" && row.outcome !== "existing_reserved") || !row.reservation_id) return { ok: false, code: "billing_unavailable" };
    return { ok: true, reservation: { id: row.reservation_id, status: "reserved" } };
  }

  async finalize(reservationId: string, actualProviderCostUsd: number | null): Promise<void> {
    const { error } = await getSupabaseAdminClient().rpc("settle_video_credit_reservation", { p_reservation_id: reservationId, p_actual_provider_cost_usd: actualProviderCostUsd, p_generation_id: null, p_lease_token: null, p_lease_version: null });
    if (error) throw new Error("Unable to settle the video credit reservation.");
  }

  async finalizeClaimed(reservationId: string, actualProviderCostUsd: number | null, claim: VideoReconciliationClaim): Promise<void> {
    const { data, error } = await getSupabaseAdminClient().rpc("settle_video_credit_reservation", { p_reservation_id: reservationId, p_actual_provider_cost_usd: actualProviderCostUsd, p_generation_id: claim.job.id, p_lease_token: claim.leaseToken, p_lease_version: claim.leaseVersion });
    if (error || !data?.[0] || (data[0] as { outcome: string }).outcome === "stale_lease") throw new Error("Unable to settle the claimed video credit reservation.");
  }

  async release(reservationId: string): Promise<void> {
    const { error } = await getSupabaseAdminClient().rpc("release_video_credit_reservation", { p_reservation_id: reservationId });
    if (error) throw new Error("Unable to release the video credit reservation.");
  }

  async markForReconciliation(reservationId: string): Promise<void> {
    const { error } = await getSupabaseAdminClient().rpc("mark_video_credit_reconciliation", { p_reservation_id: reservationId });
    if (error) throw new Error("Unable to mark the video credit reservation for reconciliation.");
  }

  async refundConfirmed(reservationId: string, idempotencyKey: string, reason: ConfirmedRefundReason): Promise<void> {
    const { data, error } = await getSupabaseAdminClient().rpc("refund_video_credit_reservation", { p_reservation_id: reservationId, p_idempotency_key: idempotencyKey, p_reason: reason, p_generation_id: null, p_lease_token: null, p_lease_version: null });
    if (error || !data?.[0] || !["refunded", "already_refunded"].includes((data[0] as { outcome: string }).outcome)) throw new Error("Unable to refund the video credit reservation.");
  }

  async refundConfirmedClaimed(reservationId: string, idempotencyKey: string, reason: ConfirmedRefundReason, claim: VideoReconciliationClaim): Promise<void> {
    const { data, error } = await getSupabaseAdminClient().rpc("refund_video_credit_reservation", { p_reservation_id: reservationId, p_idempotency_key: idempotencyKey, p_reason: reason, p_generation_id: claim.job.id, p_lease_token: claim.leaseToken, p_lease_version: claim.leaseVersion });
    if (error || !data?.[0] || !["refunded", "already_refunded"].includes((data[0] as { outcome: string }).outcome)) throw new Error("Unable to refund the claimed video credit reservation.");
  }
}
