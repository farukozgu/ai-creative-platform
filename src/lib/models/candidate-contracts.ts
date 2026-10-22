import { parseModelAppearanceDraft, type ModelAppearanceDraft } from "@/features/models/model-profile";
export type CandidateJobStatus = "queued" | "processing" | "succeeded" | "failed" | "ambiguous";
export type CandidateApprovalEvidence = { candidateId: string; primaryReferenceAssetId: string; additionalReferenceAssetIds?: string[] };
export function validateCandidateSubmission(value: unknown): ModelAppearanceDraft | null { return parseModelAppearanceDraft(value); }
export function canApproveCandidate(input: { jobStatus: CandidateJobStatus; candidateStatus: "ready" | "pending" | "failed" | "rejected"; ownerMatches: boolean; primaryReferenceOwned: boolean }) { return input.jobStatus === "succeeded" && input.candidateStatus === "ready" && input.ownerMatches && input.primaryReferenceOwned; }
export function resolveCandidateGenerationPolicy() { return { enabled: false as const, billing: "closed" as const, executor: "disabled" as const, provider: "openai" as const }; }
