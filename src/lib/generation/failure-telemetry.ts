import { createCostTelemetry } from "./cost-telemetry";
import type { CostUsageEvent } from "./cost/cost-accounting";
import { GENERATION_EXECUTION_POLICY_VERSION } from "./execution-policy/execution-policy-version";
import type { GenerationPerformanceStage } from "./performance";

export type GenerationExecutionCounts = {
  imageGenerationCalls: number;
  visionValidationCalls: number;
  promptEnhancementCalls: number;
  productAnalysisCalls: number;
  referenceAnalysisCalls: number;
  artworkAnalysisCalls: number;
  segmentationCalls: number;
  projectionAnalysisCalls: number;
  repairCalls: number;
};

type FailureTelemetryInput = {
  executionCounts: GenerationExecutionCounts;
  inputProductImageCount: number | null;
  inputReferenceCount: number | null;
  stageDurations?: Partial<Record<GenerationPerformanceStage, number>>;
  events?: CostUsageEvent[];
};

/** Builds failure-only metadata without making lifecycle or persistence decisions. */
export function buildGenerationFailureTelemetry({
  executionCounts,
  inputProductImageCount,
  inputReferenceCount,
  stageDurations,
  events,
}: FailureTelemetryInput) {
  return {
    execution: {
      version: GENERATION_EXECUTION_POLICY_VERSION,
      imageGenerationCalls: executionCounts.imageGenerationCalls,
      visionValidationCalls: executionCounts.visionValidationCalls,
      promptEnhancementCalls: executionCounts.promptEnhancementCalls,
      productAnalysisCalls: executionCounts.productAnalysisCalls,
      referenceAnalysisCalls: executionCounts.referenceAnalysisCalls,
      artworkAnalysisCalls: executionCounts.artworkAnalysisCalls,
      segmentationCalls: executionCounts.segmentationCalls,
      projectionAnalysisCalls: executionCounts.projectionAnalysisCalls,
      repairCalls: executionCounts.repairCalls,
      ...(stageDurations ? { totalDurationMs: stageDurations.total, stages: stageDurations } : {}),
    },
    costTelemetry: createCostTelemetry({
      productUnderstandingCalls: executionCounts.productAnalysisCalls,
      referenceAnalysisCalls: executionCounts.referenceAnalysisCalls,
      imageGenerationCalls: executionCounts.imageGenerationCalls - executionCounts.repairCalls,
      validationCalls: executionCounts.visionValidationCalls,
      repairGenerationCalls: executionCounts.repairCalls,
      promptEnhancementCalls: executionCounts.promptEnhancementCalls,
      artworkAnalysisCalls: executionCounts.artworkAnalysisCalls,
      segmentationCalls: executionCounts.segmentationCalls,
      projectionAnalysisCalls: executionCounts.projectionAnalysisCalls,
      inputProductImageCount,
      inputReferenceCount,
      repairAttempted: executionCounts.repairCalls > 0,
      finalOutcome: "failed",
      validationOutcome: "not_completed",
      events,
    }),
  };
}
