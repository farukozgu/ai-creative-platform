import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ProductReanalysisAdmissionState } from "./product-reanalysis-admission-contract";
import type { ProductReanalysisAdmissionGateway } from "./product-reanalysis-service";

export type { ManualProductReanalysisResult } from "./product-reanalysis-service";

type AdmissionRow = {
  outcome: string;
  admission_id: string | null;
  state: ProductReanalysisAdmissionState | null;
  lease_token: string | null;
  lease_version: number | null;
};

/** Fails closed when the additive RPC migration is absent or unreachable. */
export const supabaseProductReanalysisAdmissionGateway: ProductReanalysisAdmissionGateway = {
  async admit(input) {
    try {
      const { data, error } = await getSupabaseAdminClient().rpc("admit_product_reanalysis", { p_owner_id: input.ownerId, p_asset_id: input.assetId });
      const row = (data?.[0] ?? null) as AdmissionRow | null;
      if (error || !row) return { kind: "rejected", reason: "unavailable" };
      if (row.outcome === "admitted" && row.admission_id && row.lease_token && typeof row.lease_version === "number" && Number.isSafeInteger(row.lease_version)) return { kind: "admitted", admissionId: row.admission_id, leaseToken: row.lease_token, leaseVersion: row.lease_version };
      if (row.outcome === "replay" && row.state) return { kind: "replay", state: row.state };
      if (row.outcome === "capacity" || row.outcome === "cooldown" || row.outcome === "unauthorized") return { kind: "rejected", reason: row.outcome };
      return { kind: "rejected", reason: "unavailable" };
    } catch {
      return { kind: "rejected", reason: "unavailable" };
    }
  },
  async transition(input) {
    try {
      const { data, error } = await getSupabaseAdminClient().rpc("transition_product_reanalysis_admission", { p_admission_id: input.admissionId, p_lease_token: input.leaseToken, p_lease_version: input.leaseVersion, p_state: input.state });
      return !error && data === true;
    } catch {
      return false;
    }
  },
};
