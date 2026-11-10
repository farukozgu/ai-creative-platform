import "server-only";
import { getVideoStudioOpenAIPolicy } from "@/lib/openai/beta-policy";
import { getPromptEnhancementModel } from "@/lib/generation/prompts/prompt-enhancer-config";
import { compileDirectorPlan, directVideoWithClient, fallbackDirectorPlan, type VideoDirectorInput, type VideoDirectorPlan } from "./core";
import { createOpenAIReferenceReviews, createOpenAIVideoPlan, createOpenAICameraRepairs, createOpenAIActionRepairs } from "./openai-director";
import { directorCacheKey, DirectorPlanCache, openDirectorPlan, sealDirectorPlan } from "./receipt";
import { logVideoDiagnostic, safeOpenAIStatus } from "@/lib/video-generation/diagnostics";

const cache = new DirectorPlanCache();
const goldenPresetIds = new Set(["minimal-studio", "metallic-light-sweep", "macro-detail-reveal", "floating-accessory",
  "cinematic-hero", "dramatic-backlight", "material-detail", "window-display"]);

function isGoldenTenSecondMulti(input: VideoDirectorInput) {
  return goldenPresetIds.has(input.presetId) && input.shotMode === "multi" && input.draft.durationSeconds === 10;
}

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
  const log = (stage: string, result: "success" | "failed" | "skipped" | "cache_hit" | "fallback", fields: Record<string, string | number | boolean | readonly number[] | null | undefined> = {}) => {
    if (diagnostics) logVideoDiagnostic(diagnostics.correlationId, stage, result, { model: getPromptEnhancementModel(), durationMs: Date.now() - startedAt, ...fields });
  };
  log("director_start", "success");
  const key = directorCacheKey(ownerId, sourceSha256, getPromptEnhancementModel(), input);
  const secret = process.env.SUPABASE_SECRET_KEY ?? "";
  if (input.presetId === "cinematic-hero" && input.shotMode === "multi" && input.draft.durationSeconds === 5
    && !input.draft.productReferences?.length && !input.draft.prompt.trim() && input.draft.cameraMovement === "auto") {
    const plan = fallbackDirectorPlan(input);
    compileDirectorPlan(plan, input);
    log("director_preset", "success", { code: "classic_cinematic" });
    return { plan, receipt: sealDirectorPlan(key, plan, secret, Date.now(), input.profile) };
  }
  const existing = openDirectorPlan(existingReceipt, key, input, secret);
  if (isGoldenTenSecondMulti(input)) {
    let plan: VideoDirectorPlan;
    const references = input.draft.productReferences?.length ?? 0;
    const editorialReview = input.presetId === "minimal-studio" || input.presetId === "metallic-light-sweep";
    if (!references) {
      plan = fallbackDirectorPlan(input);
      log("director_creative_plan", "skipped", { code: "golden_local_plan" });
    } else if (allowAI && existing?.referenceReviews?.length && (!editorialReview || existing.editorialStoryboard)) {
      plan = fallbackDirectorPlan(input, existing.referenceReviews);
      log("director_reference_review", "cache_hit");
    } else {
      if (!allowAI || !isVideoDirectorAIAvailable(ownerId)) {
        const code = diagnostics?.fallbackReason ?? "configuration_error";
        log("director_reference_review", "failed", { code });
        throw Object.assign(new Error("references_not_verified"), { referenceFailure: code === "quota_limited" ? "quota" : "unavailable" });
      }
      try {
        const reviews = await createOpenAIReferenceReviews(input, source, diagnostics?.correlationId);
        if (reviews.length !== references || reviews.some(review => review.status !== "matched")) {
          const reason = reviews.some(review => review.status === "conflict") ? "conflict"
            : reviews.some(review => review.status === "uncertain") ? "uncertain" : "invalid_review";
          throw Object.assign(new Error("references_not_verified"), { referenceFailure: reason });
        }
        plan = fallbackDirectorPlan(input, reviews);
      } catch (error) {
        if (error && typeof error === "object" && "message" in error && error.message === "references_not_verified") throw error;
        const diagnostic = safeOpenAIStatus(error);
        log("director_reference_review", "failed", { category: diagnostic.category, code: diagnostic.code });
        throw Object.assign(new Error("references_not_verified"), {
          referenceFailure: diagnostic.category === "local_budget" && diagnostic.code === "quota_limited" ? "quota" : "unavailable",
        });
      }
    }
    compileDirectorPlan(plan, input);
    for (const review of plan.referenceReviews ?? []) log("director_reference_review", "success", { index: review.index, status: review.status, view: review.view ?? "unknown" });
    log("director_result", "success", { code: "golden_local_plan", referenceCount: references });
    return { plan, receipt: sealDirectorPlan(key, plan, secret, Date.now(), input.profile) };
  }
  if (allowAI && existing && (existing.origin === "ai" || existing.referenceReviews?.length)) { log("director_result", "cache_hit"); return { plan: existing, receipt: existingReceipt! }; }
  let fallbackReason: string | null = null;
  if (!allowAI) fallbackReason = diagnostics?.fallbackReason ?? "product_analysis_failed";
  else if (!isVideoDirectorAIAvailable(ownerId)) fallbackReason = "configuration_error";
  if (fallbackReason && input.draft.productReferences?.length) {
    log("director_reference_review", "failed", { code: fallbackReason });
    throw Object.assign(new Error("references_not_verified"), { referenceFailure: "unavailable" });
  }
  const plan = !fallbackReason ? await cache.getOrCreate(key, () =>
    directVideoWithClient(input, {
      createPlan: value => createOpenAIVideoPlan(value, source, diagnostics?.correlationId),
      repairPlan: (value, failure, reviews) => value.presetId === "custom" && failure.reasonCode === "unsafe_product_action"
        ? createOpenAIActionRepairs(value, source, failure, diagnostics?.correlationId)
        : value.presetId === "custom" && ["non_executable_camera", "custom_shot_coherence", "conflicting_camera_directions"].includes(failure.reasonCode)
        ? createOpenAICameraRepairs(value, source, failure, diagnostics?.correlationId)
        : createOpenAIVideoPlan(value, source, diagnostics?.correlationId, failure, reviews),
    }, event => {
      log(event.stage, event.result, { reasonCode: event.reasonCode ?? null, jsonPath: event.jsonPath ?? null, expected: event.expected ?? null, failingPaths: event.failingPaths ? JSON.stringify(event.failingPaths) : undefined,
        requestedPathCount: event.requestedPathCount, returnedRepairCount: event.returnedRepairCount,
        returnedShotIndexes: event.returnedShotIndexes,
        duplicatePath: event.duplicatePath, missingPath: event.missingPath,
        extraPath: event.extraPath, valueTooLong: event.valueTooLong,
        executableValidation: event.executableValidation });
      if (event.result === "failed" && event.stage !== "director_repair_attempt") cache.recordFailure(key, event);
    })) : fallbackDirectorPlan(input);
  compileDirectorPlan(plan, input);
  for (const review of plan.referenceReviews ?? []) {
    log("director_reference_review", "success", { index: review.index, status: review.status, view: review.view ?? "unknown",
      shotIndexes: plan.shots.flatMap((shot, index) => shot.referenceIndex === review.index ? [index] : []).join(",") });
  }
  const failure = !fallbackReason ? cache.getFailure(key) : undefined;
  log(plan.origin === "ai" ? "director_success" : "director_fallback", plan.origin === "ai" ? "success" : "fallback",
    { code: plan.origin === "ai" ? null : fallbackReason ?? failure?.reasonCode ?? "director_plan_rejected",
      failedStage: plan.origin === "ai" ? null : failure?.stage ?? (!allowAI ? "product_analysis_result" : "director_start"),
      jsonPath: failure?.jsonPath ?? null });
  return { plan, receipt: sealDirectorPlan(key, plan, secret, Date.now(), input.profile) };
}
