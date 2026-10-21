import { makeUsageEvent, summarizeCostEvents, unknownUsage, type CostOperation, type CostUsageEvent, type UsageUnits } from "./cost/cost-accounting";

export type CostTelemetryOutcome = "succeeded" | "failed" | "unverified";

export type CostTelemetryInput = {
  productUnderstandingCalls: number;
  referenceAnalysisCalls: number;
  imageGenerationCalls: number;
  validationCalls: number;
  repairGenerationCalls: number;
  promptEnhancementCalls?: number;
  artworkAnalysisCalls?: number;
  segmentationCalls?: number;
  projectionAnalysisCalls?: number;
  // A failure before asset loading cannot truthfully report zero inputs.
  inputProductImageCount: number | null;
  inputReferenceCount: number | null;
  repairAttempted: boolean;
  finalOutcome: CostTelemetryOutcome;
  validationOutcome: string;
  providerUsage?: unknown;
  events?: CostUsageEvent[];
};

export function createCostTelemetry(input: CostTelemetryInput) {
  const promptEnhancementCalls = input.promptEnhancementCalls ?? 0;
  const artworkAnalysisCalls = input.artworkAnalysisCalls ?? 0;
  const segmentationCalls = input.segmentationCalls ?? 0;
  const projectionAnalysisCalls = input.projectionAnalysisCalls ?? 0;
  const events = input.events?.slice(0, 16) ?? [];
  return {
    version: "generation-cost-v1",
    productUnderstandingCalls: input.productUnderstandingCalls,
    referenceAnalysisCalls: input.referenceAnalysisCalls,
    imageGenerationCalls: input.imageGenerationCalls,
    validationCalls: input.validationCalls,
    repairGenerationCalls: input.repairGenerationCalls,
    promptEnhancementCalls,
    artworkAnalysisCalls,
    segmentationCalls,
    projectionAnalysisCalls,
    totalExternalAICalls: input.productUnderstandingCalls + input.referenceAnalysisCalls + input.imageGenerationCalls + input.validationCalls + input.repairGenerationCalls + promptEnhancementCalls + artworkAnalysisCalls + segmentationCalls + projectionAnalysisCalls,
    inputProductImageCount: input.inputProductImageCount,
    inputReferenceCount: input.inputReferenceCount,
    repairAttempted: input.repairAttempted,
    finalOutcome: input.finalOutcome,
    validationOutcome: input.validationOutcome,
    ...(input.providerUsage === undefined ? {} : { providerUsage: input.providerUsage }),
    costTelemetryV2: { version: "cost-telemetry-v2", events, summary: summarizeCostEvents(events) },
  };
}
export function createUnknownOperationEvent(input: { operation: CostOperation; provider: "openai" | "fal"; model: string; phase?: "initial" | "repair" | "supporting"; requestId?: string | null; occurredAt?: string; ambiguous?: boolean }): CostUsageEvent {
  return makeUsageEvent({ operation: input.operation, provider: input.provider, model: input.model, requestId: input.requestId ?? null, phase: input.phase ?? "supporting", occurredAt: input.occurredAt ?? new Date().toISOString(), usage: unknownUsage, ambiguous: input.ambiguous });
}

export function createProviderUsageEvent(input: { operation: CostOperation; provider?: "openai" | "fal"; model: string; phase: "initial" | "repair" | "supporting"; requestId: string | null; usage: UsageUnits; occurredAt?: string; ambiguous?: boolean }): CostUsageEvent {
  return makeUsageEvent({ operation: input.operation, provider: input.provider ?? "openai", model: input.model, requestId: input.requestId, phase: input.phase, occurredAt: input.occurredAt ?? new Date().toISOString(), usage: input.usage, ambiguous: input.ambiguous });
}
