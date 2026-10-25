export type ProviderFailureMetadata = {
  category: "provider_moderation_blocked" | "provider_submission_ambiguous" | "generation_failed";
  code: string | null;
  status: number | null;
  providerDecision: "moderation_blocked" | "provider_error";
  klayClassification: string | null;
  providerFalsePositiveCandidate: boolean;
};

/** Retains the generation snapshot while adding bounded, non-sensitive failure diagnostics. */
export function mergeProviderFailureMetadata(
  existing: Record<string, unknown> | null | undefined,
  failure: ProviderFailureMetadata,
): Record<string, unknown> {
  return { ...(existing ?? {}), providerFailure: failure };
}
