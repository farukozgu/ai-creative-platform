import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { canSubmitVideoBeta } from "./beta-policy";
import { videoEndpointCapabilities, videoTierRouting } from "./capabilities";
import type { FencedVideoBillingPolicy, VideoBillingDecision } from "./billing";
import type { VideoGenerationDraft, VideoGenerationQuality, VideoReconciliationClaim } from "./types";
import { SupabaseVideoJobRepository } from "./supabase-repository";
import { reconcileClaimedVideoGeneration } from "./reconciliation";
import { FalVideoGenerationProvider } from "./fal-provider";
import { SupabaseDurableVideoOutputStore } from "./output";
import { usdProductToMicrosCeil } from "./money";

/** Read-only pricing, never inference. Unknown units/currency or inaccessible prices fail closed. */
export async function getVideoBetaQuote(quality: VideoGenerationQuality, duration: 5 | 10) {
  if (!["standard", "pro"].includes(quality) || ![5, 10].includes(duration)) throw new Error("Invalid video options.");
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
  const estimatedMaxCostMicros = usdProductToMicrosCeil(rate, duration);
  if (estimatedMaxCostMicros === null) throw new Error("Video pricing unavailable.");
  const estimatedMaxCostUsd = Number(estimatedMaxCostMicros) / 1_000_000;
  if (!Number.isSafeInteger(Number(estimatedMaxCostMicros)) || estimatedMaxCostUsd >= 1_000_000) throw new Error("Video pricing exceeds storage precision.");
  return { quality, duration, estimatedMaxCostUsd, rate, verifiedAt: new Date().toISOString() };
}

/** USD test allowance only. Never calls the customer wallet, subscription or payment APIs. */
export class VideoBetaBudget implements FencedVideoBillingPolicy {
  async reserve(ownerId: string, submissionId: string, cost: number, draft: VideoGenerationDraft): Promise<VideoBillingDecision> {
    if (submissionId !== draft.clientSubmissionId || !canSubmitVideoBeta(ownerId, draft, cost)) return { ok: false, code: "billing_unavailable" };
    const rpc = process.env.VIDEO_STUDIO_ENABLED === "true" ? "reserve_video_studio_budget_once" : "reserve_video_beta_budget_once";
    const { data, error } = await getSupabaseAdminClient().rpc(rpc, {
      p_owner: ownerId, p_submission: submissionId, p_cost: cost, p_tier: draft.quality, p_duration: draft.durationSeconds,
    });
    if (error) return { ok: false, code: "billing_unavailable" };
    if (data === null) return { ok: false, code: "insufficient_balance" };
    return typeof data === "string" ? { ok: true, reservation: { id: data, status: "reserved" } } : { ok: false, code: "billing_unavailable" };
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
