import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ProductAnalysisResult } from "./analyze-product-asset";
import {
  type ProductReanalysisAdmissionDecision,
  type ProductReanalysisAdmissionState,
  type ProductReanalysisTransition,
} from "./product-reanalysis-admission-contract";

export type ManualProductReanalysisResult = ProductAnalysisResult | {
  status: "unavailable";
  reason: "reanalysis_unavailable" | "reanalysis_in_progress" | "reanalysis_cooldown" | "reanalysis_reconciliation_required";
};

type AdmissionRow = {
  outcome: string;
  admission_id: string | null;
  state: ProductReanalysisAdmissionState | null;
  lease_token: string | null;
  lease_version: number | null;
};

export type ProductReanalysisAdmissionGateway = {
  admit(input: { ownerId: string; assetId: string }): Promise<ProductReanalysisAdmissionDecision>;
  transition(input: ProductReanalysisTransition): Promise<boolean>;
};

export type ProductReanalysisAnalyzer = (input: {
  assetId: string;
  force: true;
  userId: string;
  providerLifecycle: {
    beforeProviderSubmission(): Promise<boolean>;
    providerResponseReceived(): Promise<boolean>;
  };
}) => Promise<ProductAnalysisResult>;

/** Fails closed when the additive RPC migration is absent or unreachable. */
export const supabaseProductReanalysisAdmissionGateway: ProductReanalysisAdmissionGateway = {
  async admit(input) {
    try {
      const { data, error } = await getSupabaseAdminClient().rpc("admit_product_reanalysis", {
        p_owner_id: input.ownerId,
        p_asset_id: input.assetId,
      });
      const row = (data?.[0] ?? null) as AdmissionRow | null;
      if (error || !row) return { kind: "rejected", reason: "unavailable" };
      if (row.outcome === "admitted" && row.admission_id && row.lease_token && typeof row.lease_version === "number" && Number.isSafeInteger(row.lease_version)) {
        return { kind: "admitted", admissionId: row.admission_id, leaseToken: row.lease_token, leaseVersion: row.lease_version };
      }
      if (row.outcome === "replay" && row.state) return { kind: "replay", state: row.state };
      if (row.outcome === "capacity" || row.outcome === "cooldown" || row.outcome === "unauthorized") return { kind: "rejected", reason: row.outcome };
      return { kind: "rejected", reason: "unavailable" };
    } catch {
      return { kind: "rejected", reason: "unavailable" };
    }
  },
  async transition(input) {
    try {
      const { data, error } = await getSupabaseAdminClient().rpc("transition_product_reanalysis_admission", {
        p_admission_id: input.admissionId,
        p_lease_token: input.leaseToken,
        p_lease_version: input.leaseVersion,
        p_state: input.state,
      });
      return !error && data === true;
    } catch {
      return false;
    }
  },
};

function unavailableForDecision(decision: Exclude<ProductReanalysisAdmissionDecision, { kind: "admitted" }>): ManualProductReanalysisResult {
  if (decision.kind === "replay") {
    return {
      status: "unavailable",
      reason: decision.state === "reconciliation_required" || decision.state === "possibly_submitted" || decision.state === "provider_responded"
        ? "reanalysis_reconciliation_required"
        : "reanalysis_in_progress",
    };
  }
  return { status: "unavailable", reason: decision.reason === "cooldown" ? "reanalysis_cooldown" : "reanalysis_unavailable" };
}

/**
 * Runs one manually requested reanalysis after the owner-scoped database
 * admission has succeeded. Provider ambiguity is deliberately terminal for
 * automation: a later operator reconciliation, not a retry, decides recovery.
 */
export async function runManualProductReanalysis(
  input: { ownerId: string; assetId: string },
  dependencies: { gateway: ProductReanalysisAdmissionGateway; analyze: ProductReanalysisAnalyzer },
): Promise<ManualProductReanalysisResult> {
  const decision = await dependencies.gateway.admit(input);
  if (decision.kind !== "admitted") return unavailableForDecision(decision);

  const lease = { admissionId: decision.admissionId, leaseToken: decision.leaseToken, leaseVersion: decision.leaseVersion };
  if (!await dependencies.gateway.transition({ ...lease, state: "preparing_submission" })) {
    return { status: "unavailable", reason: "reanalysis_unavailable" };
  }

  let providerMayHaveBeenCalled = false;
  let providerResponded = false;
  const result = await dependencies.analyze({
    assetId: input.assetId,
    force: true,
    userId: input.ownerId,
    providerLifecycle: {
      async beforeProviderSubmission() {
        if (!await dependencies.gateway.transition({ ...lease, state: "possibly_submitted" })) return false;
        providerMayHaveBeenCalled = true;
        return true;
      },
      async providerResponseReceived() {
        providerResponded = true;
        return dependencies.gateway.transition({ ...lease, state: "provider_responded" });
      },
    },
  });

  if (!providerMayHaveBeenCalled) {
    const finalized = await dependencies.gateway.transition({ ...lease, state: "failed_pre_provider" });
    return finalized ? result : { status: "unavailable", reason: "reanalysis_unavailable" };
  }

  if (!providerResponded || result.status === "failed") {
    await dependencies.gateway.transition({ ...lease, state: "reconciliation_required" });
    return { status: "unavailable", reason: "reanalysis_reconciliation_required" };
  }

  const finalized = await dependencies.gateway.transition({ ...lease, state: "completed" });
  return finalized ? result : { status: "unavailable", reason: "reanalysis_reconciliation_required" };
}
