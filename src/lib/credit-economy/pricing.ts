import type { VideoGenerationDraft } from "@/lib/video-generation/types";
import type { VideoCreditPricingPolicy, VideoCreditQuote } from "@/lib/video-generation/billing";

export const GENERATION_PRICING_VERSION = "2026-10-v1" as const;

export const GENERATION_CREDIT_PRICES = {
  standardImage: 60,
  precisionImage: 120,
  standardVideo5Seconds: 300,
  standardVideo10Seconds: 600,
  proVideo: null,
} as const;

export type ImageExecutionPricingEvidence = {
  executionClass: "standard" | "precision" | null;
  classifiedByServerPolicy: boolean;
  repairAttempt: boolean;
};

/** Image charging remains closed unless execution policy supplies authoritative evidence. Repairs never create a second charge. */
export function resolveImageCreditQuote(evidence: ImageExecutionPricingEvidence): VideoCreditQuote | null {
  if (!evidence.classifiedByServerPolicy || !evidence.executionClass || evidence.repairAttempt) return null;
  const requiredCredits = evidence.executionClass === "standard"
    ? GENERATION_CREDIT_PRICES.standardImage
    : GENERATION_CREDIT_PRICES.precisionImage;
  return { id: `${GENERATION_PRICING_VERSION}:image:${evidence.executionClass}`, requiredCredits };
}

export class ApprovedVideoCreditPricingPolicy implements VideoCreditPricingPolicy {
  async resolveQuote(draft: VideoGenerationDraft): Promise<VideoCreditQuote | null> {
    if (draft.quality === "pro") return null;
    const requiredCredits = draft.durationSeconds === 5
      ? GENERATION_CREDIT_PRICES.standardVideo5Seconds
      : GENERATION_CREDIT_PRICES.standardVideo10Seconds;
    return { id: `${GENERATION_PRICING_VERSION}:video:standard:${draft.durationSeconds}s`, requiredCredits };
  }
}
