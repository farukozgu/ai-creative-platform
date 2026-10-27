import "server-only";
import { getOpenAIBetaPolicy } from "@/lib/openai/beta-policy";
import { getPromptEnhancementModel } from "@/lib/generation/prompts/prompt-enhancer-config";
import { quoteVideoFidelity } from "@/lib/video-fidelity/pricing";
import { canAccessVideoBeta } from "@/lib/video-generation/beta-policy";
import { compileDirectorPlan, directVideoWithClient, fallbackDirectorPlan, type VideoDirectorInput } from "./core";
import { createOpenAIVideoPlan } from "./openai-director";
import { directorCacheKey, DirectorPlanCache, openDirectorPlan, sealDirectorPlan } from "./receipt";
import { matchesUsdQuoteConfirmation } from "@/lib/video-generation/money";

const cache = new DirectorPlanCache();

export function getVideoDirectorQuote(ownerId: string) {
  const model = getPromptEnhancementModel();
  const policy = getOpenAIBetaPolicy(ownerId);
  // The existing six-frame analysis ceiling conservatively covers one low-detail source
  // plus <=16k UTF-8 bytes of context, instructions and schema and <=2200 output tokens.
  const quote = model === "gpt-4o-mini" ? quoteVideoFidelity(false) : null;
  return canAccessVideoBeta(ownerId) && process.env.VIDEO_DIRECTOR_ENABLED === "true" && process.env.OPENAI_API_KEY
    && process.env.SUPABASE_SECRET_KEY && policy?.analysisModels.includes(model)
    && policy.limits.analysis.user > 0 && policy.limits.analysis.global > 0 && quote ? quote : null;
}

export function readVerifiedDirectorPlan(ownerId: string, sourceSha256: string, input: VideoDirectorInput, receipt: unknown) {
  const key = directorCacheKey(ownerId, sourceSha256, getPromptEnhancementModel(), input);
  return openDirectorPlan(receipt, key, input, process.env.SUPABASE_SECRET_KEY ?? "");
}

/** Only this explicit consent path may call OpenAI. Submission never calls it. */
export async function prepareVideoDirectorPlan(ownerId: string, source: Buffer, sourceSha256: string, input: VideoDirectorInput,
  approval?: { maximumCostUsd: number; pricingVersion: string }, existingReceipt?: string) {
  const key = directorCacheKey(ownerId, sourceSha256, getPromptEnhancementModel(), input);
  const secret = process.env.SUPABASE_SECRET_KEY ?? "";
  const existing = openDirectorPlan(existingReceipt, key, input, secret);
  if (existing && (!approval || existing.origin === "ai")) return { plan: existing, receipt: existingReceipt! };
  const quote = getVideoDirectorQuote(ownerId);
  if (approval && (!quote || approval.pricingVersion !== quote.pricingVersion
    || !matchesUsdQuoteConfirmation(quote.maximumEstimatedCostUsd, approval.maximumCostUsd))) return null;
  const plan = approval
    ? await cache.getOrCreate(key, () => directVideoWithClient(input, { createPlan: value => createOpenAIVideoPlan(value, source) }))
    : fallbackDirectorPlan(input);
  compileDirectorPlan(plan, input);
  return { plan, receipt: sealDirectorPlan(key, plan, secret) };
}
