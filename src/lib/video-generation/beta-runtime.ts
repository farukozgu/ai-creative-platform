import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { canAccessVideoBeta } from "./beta-policy";
import { videoEndpointCapabilities, videoTierRouting } from "./capabilities";
import type { FencedVideoBillingPolicy, VideoBillingDecision } from "./billing";
import type { VideoGenerationDraft, VideoGenerationQuality, VideoReconciliationClaim } from "./types";
import { SupabaseVideoJobRepository } from "./supabase-repository";
import { reconcileClaimedVideoGeneration } from "./reconciliation";
import { FalVideoGenerationProvider } from "./fal-provider";
import { SupabaseDurableVideoOutputStore } from "./output";

/** Read-only pricing, never inference. Unknown units/currency or inaccessible prices fail closed. */
export async function getVideoBetaQuote(quality: VideoGenerationQuality, duration: 5 | 10) {
  const capability = videoEndpointCapabilities[videoTierRouting[quality]];
  if (!process.env.FAL_KEY) throw new Error("Video pricing unavailable.");
  const response = await fetch(`https://api.fal.ai/v1/models/pricing?endpoint_id=${encodeURIComponent(capability.endpointId)}`, {
    headers: { Authorization: `Key ${process.env.FAL_KEY}` }, cache: "no-store", signal: AbortSignal.timeout(10_000), redirect: "error",
  });
  if (!response.ok) throw new Error("Video pricing unavailable.");
  const body: unknown = await response.json();
  const prices = body && typeof body === "object" && "prices" in body ? body.prices : null;
  const price: unknown = Array.isArray(prices) ? prices.find((p: Record<string, unknown>) => p.endpoint_id === capability.endpointId) : null;
  if (!price || typeof price !== "object" || !("unit" in price) || price.unit !== "seconds"
    || !("currency" in price) || price.currency !== "USD" || !("unit_price" in price)
    || typeof price.unit_price !== "number" || !Number.isFinite(price.unit_price) || price.unit_price <= 0) throw new Error("Video pricing unavailable.");
  // The live API's base unit and the model page's audio-off price can differ.
  // Reserve the larger verified value, not the lower marketing-page estimate.
  const rate = Math.max(price.unit_price, capability.pricing.basis === "per-second" ? capability.pricing.audioOffUsdPerSecond : 0);
  const estimatedMaxCostUsd = Math.ceil(rate * duration * 1_000_000) / 1_000_000;
  if (estimatedMaxCostUsd > 10) throw new Error("Video pricing exceeds the beta budget.");
  return { quality, duration, estimatedMaxCostUsd, rate, verifiedAt: new Date().toISOString() };
}

/** USD test allowance only. Never calls the customer wallet, subscription or payment APIs. */
export class VideoBetaBudget implements FencedVideoBillingPolicy {
  async reserve(ownerId: string, submissionId: string, cost: number, draft: VideoGenerationDraft): Promise<VideoBillingDecision> {
    if (!canAccessVideoBeta(ownerId)) return { ok: false, code: "billing_unavailable" };
    const { data, error } = await getSupabaseAdminClient().rpc("reserve_video_beta_budget", {
      p_owner: ownerId, p_submission: submissionId, p_cost: cost, p_tier: draft.quality, p_duration: draft.durationSeconds,
    });
    return error || typeof data !== "string" ? { ok: false, code: "billing_unavailable" } : { ok: true, reservation: { id: data, status: "reserved" } };
  }
  async finalize(): Promise<void> { throw new Error("Beta completion requires a fenced claim."); }
  async release(): Promise<void> { /* A failed/ambiguous attempt conservatively retains its allowance. */ }
  async markForReconciliation(): Promise<void> { /* The reservation remains consumed; no automatic refund/re-POST. */ }
  async finalizeClaimed(reservationId: string, _actual: number | null, claim: VideoReconciliationClaim) {
    const { data, error } = await getSupabaseAdminClient().rpc("finalize_video_beta_budget", {
      p_reservation: reservationId, p_job: claim.job.id, p_token: claim.leaseToken, p_version: claim.leaseVersion,
    });
    if (error || data !== true) throw new Error("Stale video beta completion.");
  }
}

export async function reconcileVideoBeta(ownerId: string | null, jobId: string | null, batchSize = 1) {
  const repository = new SupabaseVideoJobRepository();
  const { data, error } = await getSupabaseAdminClient().rpc("claim_video_beta_reconciliations", {
    p_owner: ownerId, p_job: jobId, p_limit: Math.max(1, Math.min(5, batchSize)),
  });
  if (error) throw new Error("Video beta reconciliation unavailable.");
  const dependencies = { repository, provider: new FalVideoGenerationProvider(), billing: new VideoBetaBudget(), outputStore: new SupabaseDurableVideoOutputStore() };
  for (const row of data ?? []) {
    const claim = repository.toReconciliationClaim(row as Record<string, unknown>);
    await reconcileClaimedVideoGeneration(claim, dependencies);
  }
  return (data ?? []).length;
}
