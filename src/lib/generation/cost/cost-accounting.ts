export type CostOperation = "image_initial" | "image_repair" | "fidelity_validation" | "repair_validation" | "prompt_enhancement" | "reference_analysis" | "product_understanding" | "artwork_analysis" | "segmentation" | "projection_analysis";
export type CostStatus = "priced" | "unpriced_model" | "incomplete_usage" | "unknown" | "potentially_billed" | "zero";
export type UsageUnits = { inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null; imageInputTokens: number | null; imageOutputTokens: number | null; otherUnits: Record<string, number> | null };
export type CostUsageEvent = { operation: CostOperation; provider: "openai" | "fal"; model: string; requestId: string | null; phase: "initial" | "repair" | "supporting"; occurredAt: string; usage: UsageUnits; pricingCatalogVersion: string; status: CostStatus; costUsd: string | null; basis: "provider_usage" | "known_zero" | "unknown" | "potentially_billed" };

type TokenPricing = {
  textInputPerMillionUsd?: string;
  textOutputPerMillionUsd?: string;
  cachedInputPerMillionUsd?: string;
  imageInputPerMillionUsd?: string;
  imageOutputPerMillionUsd?: string;
};
const catalog: Record<string, TokenPricing> = {
  "gpt-image-2.5-sunburst": { textInputPerMillionUsd: "5", cachedInputPerMillionUsd: "1.25", imageInputPerMillionUsd: "8", imageOutputPerMillionUsd: "30" },
  "gpt-image-2.5-flare": { textInputPerMillionUsd: "5", cachedInputPerMillionUsd: "1.25", imageInputPerMillionUsd: "8", imageOutputPerMillionUsd: "30" },
  "gpt-4o-mini": { textInputPerMillionUsd: "0.15", cachedInputPerMillionUsd: "0.075", textOutputPerMillionUsd: "0.60" },
  "fal-ai/birefnet/v2": {},
};
export const COST_PRICING_CATALOG_VERSION = "openai-fal-2026-10-20";
export const unknownUsage: UsageUnits = { inputTokens: null, outputTokens: null, cachedInputTokens: null, imageInputTokens: null, imageOutputTokens: null, otherUnits: null };

function microUsd(tokens: number, rate: string) { return Math.round(tokens * Number(rate)); }
function usd(micro: number) { return (micro / 1_000_000).toFixed(6); }

export function parseProviderUsage(value: unknown): UsageUnits {
  if (!value || typeof value !== "object") return unknownUsage;
  const source = value as Record<string, unknown>;
  const details = source.input_tokens_details && typeof source.input_tokens_details === "object" ? source.input_tokens_details as Record<string, unknown> : {};
  const image = source.image_tokens && typeof source.image_tokens === "object" ? source.image_tokens as Record<string, unknown> : {};
  const number = (input: unknown) => typeof input === "number" && Number.isFinite(input) && input >= 0 ? input : null;
  return { inputTokens: number(source.input_tokens), outputTokens: number(source.output_tokens), cachedInputTokens: number(details.cached_tokens), imageInputTokens: number(image.input_tokens ?? source.image_input_tokens), imageOutputTokens: number(image.output_tokens ?? source.image_output_tokens), otherUnits: null };
}

export function toUsageUnits(value: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; imageInputTokens?: number; imageOutputTokens?: number } | undefined): UsageUnits {
  return { inputTokens: value?.inputTokens ?? null, outputTokens: value?.outputTokens ?? null, cachedInputTokens: value?.cachedInputTokens ?? null, imageInputTokens: value?.imageInputTokens ?? null, imageOutputTokens: value?.imageOutputTokens ?? null, otherUnits: null };
}

export function priceUsage(model: string, usage: UsageUnits): Pick<CostUsageEvent, "status" | "costUsd" | "basis"> {
  const pricing = catalog[model];
  if (!pricing) return { status: "unpriced_model", costUsd: null, basis: "unknown" };
  if (model === "fal-ai/birefnet/v2") return { status: "zero", costUsd: "0.000000", basis: "known_zero" };
  const components: readonly [number | null, string | undefined, boolean][] = [
    [usage.inputTokens, pricing.textInputPerMillionUsd, false],
    [usage.outputTokens, pricing.textOutputPerMillionUsd, false],
    // Providers omit this field when no cache was used. It is therefore optional,
    // unlike the primary input/output units needed for a complete total.
    [usage.cachedInputTokens, pricing.cachedInputPerMillionUsd, true],
    [usage.imageInputTokens, pricing.imageInputPerMillionUsd, false],
    [usage.imageOutputTokens, pricing.imageOutputPerMillionUsd, false],
  ];
  let total = 0; let priced = false;
  for (const [tokens, rate, optional] of components) {
    if (rate !== undefined && tokens === null && !optional) return { status: "incomplete_usage", costUsd: null, basis: "unknown" };
    if (tokens !== null && rate !== undefined) { total += microUsd(tokens, rate); priced = true; }
  }
  return priced ? { status: "priced", costUsd: usd(total), basis: "provider_usage" } : { status: "incomplete_usage", costUsd: null, basis: "unknown" };
}

export function makeUsageEvent(input: Omit<CostUsageEvent, "pricingCatalogVersion" | "status" | "costUsd" | "basis"> & { ambiguous?: boolean }): CostUsageEvent {
  if (input.ambiguous) return { ...input, pricingCatalogVersion: COST_PRICING_CATALOG_VERSION, status: "potentially_billed", costUsd: null, basis: "potentially_billed" };
  return { ...input, pricingCatalogVersion: COST_PRICING_CATALOG_VERSION, ...priceUsage(input.model, input.usage) };
}

export function summarizeCostEvents(events: readonly CostUsageEvent[]) {
  const known = events.filter((event) => event.costUsd !== null);
  const subtotal = known.reduce((sum, event) => sum + Number(event.costUsd), 0);
  return { knownSubtotalUsd: subtotal.toFixed(6), unknownOperationCount: events.length - known.length, complete: known.length === events.length, eventCount: events.length };
}

/** Aggregates known costs without treating missing provider usage as zero. */
export function aggregateCostEvents(submissions: readonly (readonly CostUsageEvent[])[]) {
  const summaries = submissions.map(summarizeCostEvents);
  const known = summaries.filter((summary) => summary.complete);
  const knownTotals = known.map((summary) => Number(summary.knownSubtotalUsd)).sort((a, b) => a - b);
  const percentile = (fraction: number) => knownTotals.length ? knownTotals[Math.min(knownTotals.length - 1, Math.ceil(knownTotals.length * fraction) - 1)].toFixed(6) : null;
  const allEvents = submissions.flat();
  const repairEvents = allEvents.filter((event) => event.operation === "image_repair");
  const validationEvents = allEvents.filter((event) => event.operation === "fidelity_validation" || event.operation === "repair_validation");
  return {
    submissionCount: submissions.length,
    completeSubmissionCount: known.length,
    incompleteSubmissionCount: submissions.length - known.length,
    averageKnownCostPerSubmissionUsd: knownTotals.length ? (knownTotals.reduce((sum, value) => sum + value, 0) / knownTotals.length).toFixed(6) : null,
    medianKnownCostUsd: percentile(0.5),
    upperPercentileKnownCostUsd: percentile(0.9),
    repairFrequency: submissions.length ? (repairEvents.length / submissions.length).toFixed(6) : "0.000000",
    repairCostUsd: repairEvents.reduce((sum, event) => sum + Number(event.costUsd ?? 0), 0).toFixed(6),
    fidelityValidationCostUsd: validationEvents.reduce((sum, event) => sum + Number(event.costUsd ?? 0), 0).toFixed(6),
  };
}
