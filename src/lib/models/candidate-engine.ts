import { parseModelAppearanceDraft, type ModelAppearanceDraft } from "@/features/models/model-profile";

export const MODEL_CANDIDATE_COUNT_LIMIT = 1;
export type CandidateProviderRequest = { model: string; prompt: string; count: 1; aspectRatio: "4:5"; quality: "high" };
export type CandidateProviderResult = { imageData: Buffer; mimeType: "image/png"; providerRequestId: string | null; usage: { inputTokens?: number; outputTokens?: number } | undefined };
export type CandidateProvider = { generate(request: CandidateProviderRequest): Promise<CandidateProviderResult> };

export function buildModelCandidatePrompt(input: unknown) {
  const draft = parseModelAppearanceDraft(input);
  if (!draft) return null;
  const traits = [draft.gender && draft.gender !== "prefer_not_to_say" ? `gender ${draft.gender.replaceAll("_", " ")}` : "", draft.presentation, `adult age ${draft.ageRange}`, draft.skinTone, `${draft.hairColor} ${draft.hairstyle} hair`, `${draft.eyeColor} eyes`, draft.silhouette, draft.visualStyle].filter(Boolean).join(", ");
  return `Create one photorealistic fictional adult human identity portrait. Stable appearance: ${traits}. Neutral identity-reference photography, head-and-shoulders framing, natural facial proportions, realistic skin texture, minimal accessories, no branding, no text. Keep clothing, pose, lighting, and background neutral; do not depict a real person, celebrity, or minor.`;
}

export function resolveCandidateProviderRequest(input: unknown): CandidateProviderRequest | null { const prompt = buildModelCandidatePrompt(input); return prompt ? { model: process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2.5-sunburst", prompt, count: MODEL_CANDIDATE_COUNT_LIMIT, aspectRatio: "4:5", quality: "high" } : null; }
export function validateCandidateOutput(result: CandidateProviderResult) { return result.mimeType === "image/png" && result.imageData.length > 0 && result.imageData.length <= 20 * 1024 * 1024; }
export async function executeModelCandidateWhenEnabled(provider: CandidateProvider, appearance: ModelAppearanceDraft) { const policy = { enabled: false as const, billing: "closed" as const }; if (!policy.enabled) return { status: "disabled" as const, policy }; const request = resolveCandidateProviderRequest(appearance); if (!request) return { status: "invalid" as const, policy }; const output = await provider.generate(request); return validateCandidateOutput(output) ? { status: "ready" as const, policy, output } : { status: "failed" as const, policy }; }
