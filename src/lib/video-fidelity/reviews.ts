import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { SupabaseVideoJobRepository } from "@/lib/video-generation/supabase-repository";
import type { VideoGenerationDraft } from "@/lib/video-generation/types";
import { getVideoFidelityAnalysisAvailability } from "./availability";
import { quoteVideoFidelity } from "./pricing";
import { prepareOwnedVideoFidelity } from "./prepare-owned";
import { analyzeVideoFidelity } from "./analyze-video";
import { VIDEO_FIDELITY_VERSION } from "./types";
import { restoredReviewStatus, runVideoFidelityReview, type PersistedVideoReview } from "./review-service";

export async function videoFidelitySchemaReady() {
  const result = await getSupabaseAdminClient().from("video_fidelity_reviews").select("job_id").limit(0);
  return !result.error;
}

export async function readOwnedVideoReview(ownerId: string, jobId: string): Promise<PersistedVideoReview | null> {
  const { data, error } = await getSupabaseAdminClient().from("video_fidelity_reviews").select("status,report,error_code,lease_expires_at")
    .eq("owner_id", ownerId).eq("job_id", jobId).eq("evaluator_version", VIDEO_FIDELITY_VERSION).maybeSingle();
  if (error) throw new Error("Review schema unavailable.");
  return data ? { status: restoredReviewStatus(data.status, data.lease_expires_at), report: data.report, errorCode: data.error_code } : null;
}

export async function resumeOwnedVideoReview(ownerId: string, jobId: string, manualConsent?: NonNullable<VideoGenerationDraft["analysisConsent"]>, locale: "tr" | "en" = "tr") {
  const job = await new SupabaseVideoJobRepository().findOwned(ownerId, jobId);
  if (!job || job.status !== "succeeded" || job.provider !== "fal") throw new Error("Owned completed Kling video required.");
  const availability = getVideoFidelityAnalysisAvailability(ownerId, Boolean(job.preservation?.criticalRegion));
  const quote = quoteVideoFidelity(Boolean(job.preservation?.criticalRegion));
  if (!availability.enabled || !quote) throw new Error("Paid review is disabled.");
  const consent = job.preservation?.analysisConsent ?? manualConsent;
  locale = consent?.locale ?? locale;
  let existing = await readOwnedVideoReview(ownerId, jobId);
  const admin = getSupabaseAdminClient();
  if (!existing) {
    if (!consent || consent.model !== quote.model || consent.pricingVersion !== quote.pricingVersion || consent.maximumCostUsd !== quote.maximumEstimatedCostUsd) throw new Error("Current analysis cost confirmation required.");
    const inserted = await admin.from("video_fidelity_reviews").insert({ owner_id: ownerId, job_id: jobId, evaluator_version: VIDEO_FIDELITY_VERSION,
      model: consent.model, maximum_cost_usd: consent.maximumCostUsd, pricing_version: consent.pricingVersion, locale });
    if (inserted.error && inserted.error.code !== "23505") throw new Error("Unable to persist analysis consent.");
    existing = await readOwnedVideoReview(ownerId, jobId);
  }
  if (existing?.status === "succeeded" || existing?.status === "failed" || existing?.status === "uncertain") return existing;
  const row = await admin.from("video_fidelity_reviews").select("maximum_cost_usd,model,pricing_version,locale").eq("owner_id", ownerId).eq("job_id", jobId).eq("evaluator_version", VIDEO_FIDELITY_VERSION).single();
  if (row.error || !row.data) throw new Error("Review consent unavailable.");
  await runVideoFidelityReview({
    claim: async () => {
      const claimed = await admin.rpc("claim_video_fidelity_review", { p_owner: ownerId, p_job: jobId, p_version: VIDEO_FIDELITY_VERSION });
      if (claimed.error) throw new Error("Review claim unavailable.");
      return typeof claimed.data === "string" ? claimed.data : null;
    },
    prepare: async () => {
      if (row.data.model !== quote.model || row.data.pricing_version !== quote.pricingVersion || Number(row.data.maximum_cost_usd) < quote.maximumEstimatedCostUsd) throw new Error("Analysis pricing changed.");
      return prepareOwnedVideoFidelity(ownerId, jobId);
    },
    markSubmitting: async token => {
      const marked = await admin.rpc("mark_video_fidelity_submitting", { p_owner: ownerId, p_job: jobId, p_version: VIDEO_FIDELITY_VERSION, p_token: token });
      if (marked.error) throw new Error("Submission marker response unknown.");
      return marked.data === true;
    },
    analyze: async input => analyzeVideoFidelity({ jobId, sourceAssetId: job.sourceId!, sourceImage: input.sourceImage.data, sourceMimeType: input.sourceImage.mimeType,
      frames: input.frames, durationSeconds: job.durationSeconds, criticalRegion: input.criticalRegion, closeups: input.closeups, locale: row.data.locale }),
    finish: async (token, status, report) => {
      const result = await admin.from("video_fidelity_reviews").update({ status, report, error_code: report ? null : status === "uncertain" ? "provider_outcome_unknown" : "preparation_failed", completed_at: new Date().toISOString() })
        .eq("owner_id", ownerId).eq("job_id", jobId).eq("evaluator_version", VIDEO_FIDELITY_VERSION).eq("claim_token", token).in("status", status === "failed" ? ["processing"] : ["processing", "submitting"]);
      if (result.error) throw new Error("Review checkpoint unavailable.");
    },
  });
  return readOwnedVideoReview(ownerId, jobId);
}
