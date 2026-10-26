import "server-only";

import { getFidelityValidationModel } from "@/lib/fidelity-validation/validate-generated-image";
import { getOpenAIBetaPolicy } from "@/lib/openai/beta-policy";
import type { VideoFidelityAnalysisAvailability } from "./types";

/** Rounded-up estimate for one 1024px source + five frames on the fixed, existing mini vision model. */
export const VIDEO_FIDELITY_ESTIMATED_MAX_COST_USD = 0.02;

export function getVideoFidelityAnalysisAvailability(userId: string): VideoFidelityAnalysisAvailability {
  const model = getFidelityValidationModel();
  const costIsVerified = model === "gpt-4o-mini";
  const policy = getOpenAIBetaPolicy(userId);
  return {
    enabled: Boolean(
      costIsVerified
      && process.env.OPENAI_API_KEY
      && policy?.analysisModels.includes(model),
    ),
    maximumEstimatedCostUsd: costIsVerified ? VIDEO_FIDELITY_ESTIMATED_MAX_COST_USD : null,
  };
}
