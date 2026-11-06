import { randomUUID } from "node:crypto";

export type VideoDiagnosticResult = "success" | "failed" | "skipped" | "cache_hit" | "fallback" | "rejected";

const transportCodes = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"]);
const providerCodes = new Set(["rate_limit_exceeded", "insufficient_quota", "invalid_api_key", "invalid_request_error", "rate_limit_error",
  "authentication_error", "permission_error", "server_error", "model_not_found", "invalid_json_schema", "context_length_exceeded", "content_filter"]);

export function safeOpenAIErrorCode(value: unknown) {
  return typeof value === "string" && (providerCodes.has(value) || transportCodes.has(value)) ? value : null;
}

export function createVideoCorrelationId() { return randomUUID(); }

export function logVideoDiagnostic(correlationId: string, stage: string, result: VideoDiagnosticResult,
  fields: Record<string, string | number | boolean | readonly number[] | null | undefined> = {}) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[video-studio]", JSON.stringify({ correlationId, stage, result, ...fields }));
}

export function safeOpenAIStatus(error: unknown): { status: number | null; code: string | null; category: "local_budget" | "local_access" | "provider_http" | "network" | "unknown" } {
  let current: unknown = error;
  const seen = new Set<unknown>();
  let status: number | null = null;
  let code: string | null = null;
  let category: "local_budget" | "local_access" | "provider_http" | "network" | "unknown" = "unknown";
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const value = current as { name?: unknown; status?: unknown; code?: unknown; budgetFailure?: unknown; cause?: unknown };
    if (value.name === "OpenAIBudgetError" && ["quota_limited", "budget_unavailable", "configuration_error"].includes(String(value.budgetFailure))) {
      return { status: null, code: String(value.budgetFailure), category: "local_budget" };
    }
    if (value.name === "OpenAIBetaAccessError") return { status: null, code: "access_denied", category: "local_access" };
    if (typeof value.status === "number" && Number.isInteger(value.status) && value.status >= 400 && value.status <= 599) {
      status = value.status;
      category = "provider_http";
    }
    const safeCode = safeOpenAIErrorCode(value.code);
    if (safeCode) code = safeCode;
    if (category !== "provider_http" && (safeCode && transportCodes.has(safeCode) || typeof value.name === "string" &&
      (/^APIConnection/.test(value.name) || value.name === "TypeError" && "message" in value && value.message === "fetch failed"))) category = "network";
    current = value.cause;
  }
  return { status, code, category };
}
