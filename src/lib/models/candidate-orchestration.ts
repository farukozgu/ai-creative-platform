import sharp from "sharp";
import type { CandidateProviderResult } from "@/lib/models/candidate-engine";
export type CandidateClaim = { jobId: string; leaseToken: string; leaseVersion: number; ownerId: string; modelId: string };
export function candidateExecutionGate() { return { scheduler: false as const, executor: false as const, billing: "closed" as const }; }
export function canFinalizeClaim(claim: CandidateClaim, current: Pick<CandidateClaim, "jobId" | "leaseToken" | "leaseVersion">) { return claim.jobId === current.jobId && claim.leaseToken === current.leaseToken && claim.leaseVersion === current.leaseVersion; }
export function candidateObjectPath(claim: CandidateClaim, candidateId: string) { return `${claim.ownerId}/${claim.modelId}/candidate-${candidateId}.png`; }
export async function validateCandidateImage(result: CandidateProviderResult) { if (result.mimeType !== "image/png" || result.imageData.length === 0 || result.imageData.length > 20 * 1024 * 1024) return null; const meta = await sharp(result.imageData).metadata(); return meta.format === "png" && !!meta.width && !!meta.height && meta.width >= 512 && meta.height >= 512 && meta.width <= 2048 && meta.height <= 2048 ? { width: meta.width, height: meta.height } : null; }
