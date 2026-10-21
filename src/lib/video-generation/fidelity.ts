import type { VideoJobRecord } from "@/lib/video-generation/types";

export type VideoFidelityAssessment = {
  status: "not_evaluated" | "passed" | "failed";
  evaluatorVersion: string | null;
  findings: readonly string[];
};

export interface VideoFidelityEvaluator {
  evaluate(job: VideoJobRecord): Promise<VideoFidelityAssessment>;
}

export class DeferredVideoFidelityEvaluator implements VideoFidelityEvaluator {
  async evaluate(): Promise<VideoFidelityAssessment> {
    return { status: "not_evaluated", evaluatorVersion: null, findings: [] };
  }
}
