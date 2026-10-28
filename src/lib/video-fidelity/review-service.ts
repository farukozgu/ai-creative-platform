import type { VideoFidelityReport } from "./types";

export type ReviewStatus = "queued" | "processing" | "submitting" | "succeeded" | "failed" | "uncertain";
export type PersistedVideoReview = { status: ReviewStatus; report: VideoFidelityReport | null; errorCode: string | null };
export function restoredReviewStatus(status: ReviewStatus, leaseExpiresAt: string | null, now = Date.now()): ReviewStatus {
  const expired = leaseExpiresAt !== null && Date.parse(leaseExpiresAt) < now;
  if (expired && status === "submitting") return "uncertain";
  if (expired && status === "processing") return "failed";
  return status;
}
export type ReviewRunnerDependencies<T> = {
  claim(): Promise<string | null>;
  prepare(): Promise<T>;
  markSubmitting(token: string): Promise<boolean>;
  analyze(input: T): Promise<VideoFidelityReport>;
  finish(token: string, status: "succeeded" | "failed" | "uncertain", report: VideoFidelityReport | null): Promise<void>;
};

/** A durable submission marker precedes the only paid attempt. A lost marker response never sends. */
export async function runVideoFidelityReview<T>(deps: ReviewRunnerDependencies<T>) {
  const token = await deps.claim();
  if (!token) return;
  let mayHaveSubmitted = false;
  try {
    const input = await deps.prepare();
    mayHaveSubmitted = true;
    if (!await deps.markSubmitting(token)) return;
    const report = await deps.analyze(input);
    await deps.finish(token, "succeeded", report);
  } catch {
    await deps.finish(token, mayHaveSubmitted ? "uncertain" : "failed", null).catch(() => undefined);
  }
}
