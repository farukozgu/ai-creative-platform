import type { UsageUnits } from "@/lib/generation/cost/cost-accounting";
import { parseProviderUsage } from "@/lib/generation/cost/cost-accounting";

export type OpenAIResponseTelemetry = {
  requestId: string | null;
  usage: UsageUnits;
};

const telemetrySymbol = Symbol("openai-response-telemetry");

function requestId(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const value = (response as Record<string, unknown>)._request_id;
  return typeof value === "string" ? value.slice(0, 255) : null;
}

/** Keeps provider accounting outside business payloads and JSON persistence. */
export function attachOpenAIResponseTelemetry<T extends object>(value: T, response: unknown): T {
  Object.defineProperty(value, telemetrySymbol, {
    value: { requestId: requestId(response), usage: parseProviderUsage(response && typeof response === "object" ? (response as Record<string, unknown>).usage : undefined) } satisfies OpenAIResponseTelemetry,
    enumerable: false,
  });
  return value;
}

export function getOpenAIResponseTelemetry(value: unknown): OpenAIResponseTelemetry | null {
  if (!value || typeof value !== "object") return null;
  const telemetry = (value as Record<PropertyKey, unknown>)[telemetrySymbol];
  return telemetry && typeof telemetry === "object" ? telemetry as OpenAIResponseTelemetry : null;
}
