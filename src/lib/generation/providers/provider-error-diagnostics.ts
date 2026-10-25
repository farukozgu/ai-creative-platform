import type { GenerationProvider } from "../types";

type ProviderErrorShape = { status?: unknown; code?: unknown; type?: unknown; param?: unknown; message?: unknown; cause?: unknown };
const text = (value: unknown) => typeof value === "string" ? value.slice(0, 500) : null;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

/** True only when a provider request may have been accepted without a usable response. */
export function isProviderOutcomeAmbiguous(error: unknown) {
  const chain: Array<Record<string, unknown>> = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    const value = current as Record<string, unknown>;
    chain.push(value);
    current = value.cause;
  }

  if (chain.some(({ name }) => name === "OpenAIBetaAccessError")) return false;
  const status = chain.map(({ status }) => number(status)).find((value) => value !== null);
  if (status !== undefined) return status === 408 || status >= 500;

  const details = chain.map(({ name, code, message }) => [name, code, message].filter((value): value is string => typeof value === "string").join(" ")).join(" ");
  return /api.?connection|timeout|timed out|network|fetch failed|socket|econn|etimedout|abort/i.test(details);
}

/** Extracts only safe provider fields; prompts, URLs and image payloads are never read. */
export function getSafeProviderErrorDiagnostics(error: unknown, input: {
  generationId: string; provider: GenerationProvider; model: string; imageCount: number;
  preservationMode: string; strategy: string; sceneFamily: string | null;
}) {
  const outer = error && typeof error === "object" ? error as ProviderErrorShape : {};
  const source = outer.cause && typeof outer.cause === "object" ? outer.cause as ProviderErrorShape : outer;
  return {
    generationId: input.generationId, provider: input.provider, model: input.model,
    status: number(source.status) ?? number(outer.status), code: text(source.code) ?? text(outer.code),
    type: text(source.type) ?? text(outer.type), param: text(source.param) ?? text(outer.param),
    message: text(source.message) ?? text(outer.message) ?? "Unknown provider error",
    imageCount: input.imageCount, preservationMode: input.preservationMode,
    strategy: input.strategy, sceneFamily: input.sceneFamily,
  };
}
