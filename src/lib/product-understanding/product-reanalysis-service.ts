import type { ProductAnalysisResult } from "./analyze-product-asset";
import type { ProductReanalysisAdmissionDecision, ProductReanalysisTransition } from "./product-reanalysis-admission-contract";

export type ManualProductReanalysisResult = ProductAnalysisResult | {
  status: "unavailable";
  reason: "reanalysis_unavailable" | "reanalysis_in_progress" | "reanalysis_cooldown" | "reanalysis_reconciliation_required";
};

export type ProductReanalysisAdmissionGateway = {
  admit(input: { ownerId: string; assetId: string }): Promise<ProductReanalysisAdmissionDecision>;
  transition(input: ProductReanalysisTransition): Promise<boolean>;
};
export type ProductReanalysisAnalyzer = (input: {
  assetId: string; force: true; userId: string;
  providerLifecycle: { beforeProviderSubmission(): Promise<boolean>; providerResponseReceived(): Promise<boolean> };
}) => Promise<ProductAnalysisResult>;

function unavailableForDecision(decision: Exclude<ProductReanalysisAdmissionDecision, { kind: "admitted" }>): ManualProductReanalysisResult {
  if (decision.kind === "replay") return { status: "unavailable", reason: decision.state === "reconciliation_required" || decision.state === "possibly_submitted" || decision.state === "provider_responded" ? "reanalysis_reconciliation_required" : "reanalysis_in_progress" };
  return { status: "unavailable", reason: decision.reason === "cooldown" ? "reanalysis_cooldown" : "reanalysis_unavailable" };
}

/** Provider ambiguity never causes an automatic reattempt. */
export async function runManualProductReanalysis(input: { ownerId: string; assetId: string }, dependencies: { gateway: ProductReanalysisAdmissionGateway; analyze: ProductReanalysisAnalyzer }): Promise<ManualProductReanalysisResult> {
  const decision = await dependencies.gateway.admit(input);
  if (decision.kind !== "admitted") return unavailableForDecision(decision);
  const lease = { admissionId: decision.admissionId, leaseToken: decision.leaseToken, leaseVersion: decision.leaseVersion };
  if (!await dependencies.gateway.transition({ ...lease, state: "preparing_submission" })) return { status: "unavailable", reason: "reanalysis_unavailable" };
  let providerMayHaveBeenCalled = false; let providerResponded = false;
  const result = await dependencies.analyze({ assetId: input.assetId, force: true, userId: input.ownerId, providerLifecycle: {
    async beforeProviderSubmission() { if (!await dependencies.gateway.transition({ ...lease, state: "possibly_submitted" })) return false; providerMayHaveBeenCalled = true; return true; },
    async providerResponseReceived() { providerResponded = true; return dependencies.gateway.transition({ ...lease, state: "provider_responded" }); },
  } });
  if (!providerMayHaveBeenCalled) return await dependencies.gateway.transition({ ...lease, state: "failed_pre_provider" }) ? result : { status: "unavailable", reason: "reanalysis_unavailable" };
  if (!providerResponded || result.status === "failed") { await dependencies.gateway.transition({ ...lease, state: "reconciliation_required" }); return { status: "unavailable", reason: "reanalysis_reconciliation_required" }; }
  return await dependencies.gateway.transition({ ...lease, state: "completed" }) ? result : { status: "unavailable", reason: "reanalysis_reconciliation_required" };
}
