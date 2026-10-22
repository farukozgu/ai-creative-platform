/**
 * Durable manual reanalysis states. The database is the source of truth; this
 * module only provides the shared, typed contract for the RPC boundary.
 */
export const PRODUCT_REANALYSIS_ACTIVE_LIMIT_DEFAULT = 1;
export const PRODUCT_REANALYSIS_COOLDOWN_SECONDS_DEFAULT = 60 * 60;

export type ProductReanalysisAdmissionState =
  | "admitted"
  | "preparing_submission"
  | "possibly_submitted"
  | "provider_responded"
  | "completed"
  | "reconciliation_required"
  | "failed_pre_provider"
  | "failed_terminal";

export type ProductReanalysisAdmissionDecision =
  | { kind: "admitted"; admissionId: string; leaseToken: string; leaseVersion: number }
  | { kind: "replay"; state: ProductReanalysisAdmissionState }
  | { kind: "rejected"; reason: "capacity" | "cooldown" | "unauthorized" | "unavailable" };

export type ProductReanalysisTransition = {
  admissionId: string;
  leaseToken: string;
  leaseVersion: number;
  state: ProductReanalysisAdmissionState;
};
