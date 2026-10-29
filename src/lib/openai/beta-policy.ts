import { canAccessVideoBeta } from "@/lib/video-generation/beta-policy";

export type OpenAIBudgetKind = "image" | "analysis";
export type OpenAIBetaPolicy = {
  limits: Record<OpenAIBudgetKind, { user: number; global: number }>;
  imageModel: string;
  analysisModels: readonly string[];
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Environment = Record<string, string | undefined>;

function limit(value: string | undefined, fallback: number, maximum: number): number | null {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}
/** The authenticated Video Studio uses the same atomic analysis budget without OpenAI beta allowlisting. */
export function getVideoStudioOpenAIPolicy(userId: string | null, model: string, env: Environment = process.env): OpenAIBetaPolicy | null {
  if (!userId || !uuid.test(userId) || !canAccessVideoBeta(userId, env) || model !== "gpt-4o-mini") return null;
  const analysis = limit(env.OPENAI_BETA_USER_DAILY_ANALYSES, 24, 1000);
  const globalAnalysis = limit(env.OPENAI_BETA_GLOBAL_DAILY_ANALYSES, 120, 10000);
  if (analysis === null || globalAnalysis === null) return null;
  return { limits: { image: { user: 0, global: 0 }, analysis: { user: analysis, global: globalAnalysis } },
    imageModel: "", analysisModels: [model] };
}

/** Server-only configuration: missing, malformed or wildcard access always denies. */
export function getOpenAIBetaPolicy(userId: string | null, env: Environment = process.env): OpenAIBetaPolicy | null {
  if (!userId || !uuid.test(userId) || env.OPENAI_BETA_ENABLED !== "true") return null;
  const users = env.OPENAI_BETA_USER_IDS?.split(",").map(value => value.trim()) ?? [];
  if (!users.length || users.some(value => !uuid.test(value)) || !users.includes(userId)) return null;
  const image = limit(env.OPENAI_BETA_USER_DAILY_IMAGES, 4, 100);
  const analysis = limit(env.OPENAI_BETA_USER_DAILY_ANALYSES, 24, 1000);
  const globalImage = limit(env.OPENAI_BETA_GLOBAL_DAILY_IMAGES, 20, 1000);
  const globalAnalysis = limit(env.OPENAI_BETA_GLOBAL_DAILY_ANALYSES, 120, 10000);
  if (image === null || analysis === null || globalImage === null || globalAnalysis === null) return null;
  const referenceModel = env.OPENAI_REFERENCE_ANALYSIS_MODEL?.trim() || env.OPENAI_PROMPT_ENHANCEMENT_MODEL?.trim() || "gpt-4o-mini";
  return {
    limits: { image: { user: image, global: globalImage }, analysis: { user: analysis, global: globalAnalysis } },
    imageModel: env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2.5-sunburst",
    analysisModels: [...new Set([referenceModel, env.OPENAI_PROMPT_ENHANCEMENT_MODEL?.trim() || "gpt-4o-mini",
      env.OPENAI_PRODUCT_UNDERSTANDING_MODEL?.trim() || referenceModel,
      env.OPENAI_FIDELITY_VALIDATION_MODEL?.trim() || referenceModel,
      env.OPENAI_REFERENCE_ANALYSIS_MODEL?.trim() || "gpt-4.1-mini"])],
  };
}
