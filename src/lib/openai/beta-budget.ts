import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { OpenAIBudgetKind } from "./beta-policy";
import { classifyOpenAIBudgetRpcFailure, OpenAIBudgetError } from "./budget-error";

export async function reserveOpenAIBetaRequest(userId: string, kind: OpenAIBudgetKind, limits: { user: number; global: number }) {
  try {
    const { data, error } = await getSupabaseAdminClient().rpc("consume_openai_beta_request", {
      p_owner: userId, p_kind: kind, p_user_limit: limits.user, p_global_limit: limits.global,
    }).abortSignal(AbortSignal.timeout(5_000));
    if (error) {
      throw new OpenAIBudgetError(classifyOpenAIBudgetRpcFailure(error));
    }
    if (data !== true && data !== false) throw new OpenAIBudgetError("configuration_error");
    return data;
  } catch (error) {
    if (error instanceof OpenAIBudgetError) throw error;
    throw new OpenAIBudgetError("budget_unavailable");
  }
}
