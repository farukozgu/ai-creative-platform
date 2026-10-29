export type OpenAIBudgetFailure = "configuration_error" | "budget_unavailable" | "quota_limited";

export class OpenAIBudgetError extends Error {
  constructor(readonly budgetFailure: OpenAIBudgetFailure) {
    super(budgetFailure === "configuration_error" ? "OpenAI budget RPC is not configured."
      : budgetFailure === "quota_limited" ? "OpenAI request budget is exhausted."
        : "OpenAI budget reservation is unavailable.");
    this.name = "OpenAIBudgetError";
  }
}

export function classifyOpenAIBudgetRpcFailure(error: unknown): "configuration_error" | "budget_unavailable" {
  if (!error || typeof error !== "object") return "budget_unavailable";
  const value = error as { code?: unknown; message?: unknown };
  return value.code === "PGRST202"
    || (typeof value.message === "string" && /function .*consume_openai_beta_request.*(not found|schema cache)/i.test(value.message))
    ? "configuration_error" : "budget_unavailable";
}
