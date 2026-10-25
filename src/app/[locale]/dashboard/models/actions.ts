"use server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { createModelProfile, updateModelProfile, archiveModelProfile } from "@/lib/models/model-profiles";
import { isSupportedLocale, type AppLocale } from "@/i18n/routing";
import { parseModelAppearanceDraft } from "@/features/models/model-profile";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateModelCandidate, type CandidateGenerationStatus } from "@/lib/models/candidate-generation";
import { candidateOpenAIProvider } from "@/lib/models/candidate-openai-provider";
import { getOpenAIBetaPolicy } from "@/lib/openai/beta-policy";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type ModelMutationResult = { status: "error" | "invalid" | "success"; id?: string };
function invalidate(locale: AppLocale, id?: string) { revalidatePath(`/${locale}/dashboard/models`, "page"); if (id) revalidatePath(`/${locale}/dashboard/models/${id}`, "page"); }
export async function saveModelDraft(locale: AppLocale, modelId: string | null, payload: unknown): Promise<ModelMutationResult> { if (!isSupportedLocale(locale)) return { status: "error" }; const draft = parseModelAppearanceDraft(payload); if (!draft) return { status: "invalid" }; const userId = await getAuthenticatedUserId(); if (!userId) return { status: "error" }; const profile = modelId ? (uuidPattern.test(modelId) ? await updateModelProfile(userId, modelId, draft) : null) : await createModelProfile(userId, draft); if (!profile) return { status: "error" }; invalidate(locale, profile.id); return { status: "success", id: profile.id }; }
export async function archiveModelDraft(locale: AppLocale, modelId: string): Promise<ModelMutationResult> { if (!isSupportedLocale(locale) || !uuidPattern.test(modelId)) return { status: "error" }; const userId = await getAuthenticatedUserId(); if (!userId || !await archiveModelProfile(userId, modelId)) return { status: "error" }; invalidate(locale, modelId); return { status: "success", id: modelId }; }

export async function generateModelPortrait(locale: AppLocale, modelId: string): Promise<{ status: CandidateGenerationStatus }> {
  if (!isSupportedLocale(locale) || !uuidPattern.test(modelId)) return { status: "invalid" };
  const userId = await getAuthenticatedUserId();
  if (!userId) return { status: "invalid" };
  if (!getOpenAIBetaPolicy(userId)) return { status: "error" };
  try {
    const status = await generateModelCandidate(getSupabaseAdminClient(), candidateOpenAIProvider, userId, modelId);
    invalidate(locale, modelId);
    return { status };
  } catch { return { status: "error" }; }
}
