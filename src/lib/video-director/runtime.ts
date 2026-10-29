import "server-only";
import { getVideoStudioOpenAIPolicy } from "@/lib/openai/beta-policy";
import { getPromptEnhancementModel } from "@/lib/generation/prompts/prompt-enhancer-config";
import { compileDirectorPlan, directVideoWithClient, fallbackDirectorPlan, type VideoDirectorInput } from "./core";
import { createOpenAIVideoPlan } from "./openai-director";
import { directorCacheKey, DirectorPlanCache, openDirectorPlan, sealDirectorPlan } from "./receipt";
import { logVideoDiagnostic } from "@/lib/video-generation/diagnostics";

const cache = new DirectorPlanCache();

export function isVideoDirectorAIAvailable(ownerId: string) {
  const policy = getVideoStudioOpenAIPolicy(ownerId, getPromptEnhancementModel());
  return Boolean(process.env.OPENAI_API_KEY && process.env.SUPABASE_SECRET_KEY
    && policy?.limits.analysis.user && policy.limits.analysis.global);
}

export function readVerifiedDirectorPlan(ownerId: string, sourceSha256: string, input: VideoDirectorInput, receipt: unknown) {
  const key = directorCacheKey(ownerId, sourceSha256, getPromptEnhancementModel(), input);
  return openDirectorPlan(receipt, key, input, process.env.SUPABASE_SECRET_KEY ?? "");
}

/** Director planning is automatic for authorized Video Studio users; the shared transport reserves quota before OpenAI I/O. */
export async function prepareVideoDirectorPlan(ownerId: string, source: Buffer, sourceSha256: string, input: VideoDirectorInput,
  existingReceipt?: string, allowAI = true, diagnostics?: { correlationId: string; fallbackReason?: string }) {
  const startedAt = Date.now();
  const log = (stage: string, result: "success" | "failed" | "skipped" | "cache_hit" | "fallback", fields: Record<string, string | number | null | undefined> = {}) => {
    if (diagnostics) logVideoDiagnostic(diagnostics.correlationId, stage, result, { model: getPromptEnhancementModel(), durationMs: Date.now() - startedAt, ...fields });
  };
  log("director_start", "success");
  const key = directorCacheKey(ownerId, sourceSha256, getPromptEnhancementModel(), input);
  const secret = process.env.SUPABASE_SECRET_KEY ?? "";
  const existing = openDirectorPlan(existingReceipt, key, input, secret);
  if (allowAI && existing?.origin === "ai") { log("director_result", "cache_hit"); return { plan: existing, receipt: existingReceipt! }; }
  let fallbackReason: string | null = null;
  if (!allowAI) fallbackReason = diagnostics?.fallbackReason ?? "product_analysis_failed";
  else if (!isVideoDirectorAIAvailable(ownerId)) fallbackReason = "configuration_error";
  const plan = !fallbackReason ? await cache.getOrCreate(key, () =>
    directVideoWithClient(input, {
      createPlan: value => createOpenAIVideoPlan(value, source, diagnostics?.correlationId),
      repairPlan: (value, failure) => createOpenAIVideoPlan(value, source, diagnostics?.correlationId, failure),
    }, event => {
      log(event.stage, event.result, { reasonCode: event.reasonCode ?? null, jsonPath: event.jsonPath ?? null, expected: event.expected ?? null, matchedTerm: event.matchedTerm ?? null });
      if (event.result === "failed" && event.stage !== "director_repair_attempt") cache.recordFailure(key, event);
    })) : fallbackDirectorPlan(input);
  compileDirectorPlan(plan, input);
  const failure = !fallbackReason ? cache.getFailure(key) : undefined;
  log(plan.origin === "ai" ? "director_success" : "director_fallback", plan.origin === "ai" ? "success" : "fallback",
    { code: plan.origin === "ai" ? null : fallbackReason ?? failure?.reasonCode ?? "director_plan_rejected",
      failedStage: plan.origin === "ai" ? null : failure?.stage ?? (!allowAI ? "product_analysis_result" : "director_start"),
      jsonPath: failure?.jsonPath ?? null });
  return { plan, receipt: sealDirectorPlan(key, plan, secret, Date.now(), input.profile) };
}
