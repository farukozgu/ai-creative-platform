import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { OpenAIBudgetKind } from "./beta-policy";

export async function reserveOpenAIBetaRequest(userId: string, kind: OpenAIBudgetKind, limits: { user: number; global: number }) {
  try {
    const { data, error } = await getSupabaseAdminClient().rpc("consume_openai_beta_request", {
      p_owner: userId, p_kind: kind, p_user_limit: limits.user, p_global_limit: limits.global,
    }).abortSignal(AbortSignal.timeout(5_000));
    return !error && data === true;
  } catch {
    return false;
  }
}
