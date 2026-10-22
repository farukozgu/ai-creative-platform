export type IdentityFidelitySignal = "recognizable_face" | "facial_features_stable" | "hair_and_appearance_consistent" | "reference_quality_adequate" | "significant_identity_drift" | "evidence_missing" | "evidence_unusable";
export type IdentityFidelityOutcome = "pass" | "review_required" | "fail" | "unavailable";
export type IdentityFidelityEvidence = { signal: IdentityFidelitySignal; observed: boolean; source: "mock" | "future_visual_review" };
export type IdentityFidelityEvaluation = { outcome: IdentityFidelityOutcome; evidence: readonly IdentityFidelityEvidence[]; evaluated: false };

/** Deterministic policy only. It does not claim that mock evidence is visual validation. */
export function resolveIdentityFidelityEvaluation(evidence: readonly IdentityFidelityEvidence[]): IdentityFidelityEvaluation {
  const has = (signal: IdentityFidelitySignal) => evidence.some((item) => item.signal === signal && item.observed);
  const outcome: IdentityFidelityOutcome = has("evidence_missing") || has("evidence_unusable") ? "unavailable" : has("significant_identity_drift") ? "fail" : has("recognizable_face") && has("facial_features_stable") && has("hair_and_appearance_consistent") && has("reference_quality_adequate") ? "pass" : "review_required";
  return { outcome, evidence, evaluated: false };
}

export type ProposedIdentityRepair = { eligible: boolean; execution: "disabled"; maxAdditionalProviderCalls: 0; reusePinnedIdentityReferences: true; preserveOriginalProduct: true; preserveProductFidelitySafeguards: true; auditRequired: true };
export function proposeIdentityRepair(evaluation: IdentityFidelityEvaluation): ProposedIdentityRepair {
  return { eligible: evaluation.outcome === "fail", execution: "disabled", maxAdditionalProviderCalls: 0, reusePinnedIdentityReferences: true, preserveOriginalProduct: true, preserveProductFidelitySafeguards: true, auditRequired: true };
}
