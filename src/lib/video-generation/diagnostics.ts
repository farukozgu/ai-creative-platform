import { randomUUID } from "node:crypto";

export type VideoDiagnosticResult = "success" | "failed" | "skipped" | "cache_hit" | "fallback" | "rejected";

export function createVideoCorrelationId() { return randomUUID(); }

export function logVideoDiagnostic(correlationId: string, stage: string, result: VideoDiagnosticResult,
  fields: Record<string, string | number | null | undefined> = {}) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[video-studio]", { correlationId, stage, result, ...fields });
}

export function safeOpenAIStatus(error: unknown): { status: number | null; code: string | null } {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const value = current as { status?: unknown; code?: unknown; cause?: unknown };
    if (typeof value.status === "number" || typeof value.code === "string") return {
      status: typeof value.status === "number" ? value.status : null,
      code: typeof value.code === "string" && /^[a-z0-9_.-]{1,80}$/i.test(value.code) ? value.code : null,
    };
    current = value.cause;
  }
  return { status: null, code: null };
}
