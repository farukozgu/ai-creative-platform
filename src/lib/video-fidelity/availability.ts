import "server-only";

import { getFidelityValidationModel } from "@/lib/fidelity-validation/validate-generated-image";
import { getOpenAIBetaPolicy } from "@/lib/openai/beta-policy";
import type { VideoFidelityAnalysisAvailability } from "./types";
import { quoteVideoFidelity } from "./pricing";

/** Bounded overview/closeup quote for the fixed, existing mini vision model. */
export function getVideoFidelityAnalysisAvailability(userId: string, hasRegion = false): VideoFidelityAnalysisAvailability {
  const model = getFidelityValidationModel();
  const quote = model === "gpt-4o-mini" ? quoteVideoFidelity(hasRegion) : null;
  const policy = getOpenAIBetaPolicy(userId);
  return {
    ...(quote ? { model: quote.model, pricingVersion: quote.pricingVersion } : {}),
    enabled: Boolean(
      quote && process.env.VIDEO_FIDELITY_ENABLED === "true"
      && process.env.OPENAI_API_KEY
      && policy?.analysisModels.includes(model),
    ),
    maximumEstimatedCostUsd: quote?.maximumEstimatedCostUsd ?? null,
  };
}
