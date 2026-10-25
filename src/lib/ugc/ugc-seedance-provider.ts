import "server-only";

import { FalVideoGenerationProvider } from "@/lib/video-generation/fal-provider";
import { planUgcSeedanceRequest, ugcSeedanceRoute } from "@/lib/ugc/ugc-seedance-planner";
import type { UgcSnapshotJob } from "@/lib/ugc/ugc-request-planner";
import type { VideoGenerationProvider } from "@/lib/video-generation/types";
import type { UgcProviderJobStatus, UgcProviderRequest, UgcProviderSubmission, UgcVideoProvider } from "@/lib/ugc/ugc-video-provider";

type TaskReader = Pick<VideoGenerationProvider, "getStatus" | "getResult">;
export type UgcSeedanceTaskReference = {
  ownerId: string; provider: string; modelId: string; endpointId: string;
  providerRequestId: string | null; status: "draft" | UgcProviderJobStatus;
};

/** Internal read-only adapter. Paid submission is structurally unavailable. */
export class UgcSeedanceVideoProvider implements UgcVideoProvider {
  readonly provider = ugcSeedanceRoute.provider;
  readonly endpointId = ugcSeedanceRoute.endpointId;
  readonly modelId = ugcSeedanceRoute.modelId;
  readonly generationEnabled = false;

  constructor(private readonly getTaskReader: () => TaskReader) {}

  async submit(request: UgcProviderRequest): Promise<UgcProviderSubmission> {
    void request;
    return { kind: "blocked", safeErrorCode: "generation_disabled" };
  }

  async getStatus(providerRequestId: string) {
    this.validateTaskId(providerRequestId);
    return this.getTaskReader().getStatus(this.endpointId, providerRequestId);
  }

  async getResult(providerRequestId: string) {
    this.validateTaskId(providerRequestId);
    return this.getTaskReader().getResult(this.endpointId, providerRequestId);
  }

  async inspectOwnedTask(ownerId: string, task: UgcSeedanceTaskReference) {
    if (!ownerId || task.ownerId !== ownerId) return { kind: "blocked", code: "unauthorized" } as const;
    if (task.provider !== this.provider || task.modelId !== this.modelId || task.endpointId !== this.endpointId) {
      return { kind: "blocked", code: "routing_mismatch" } as const;
    }
    if (task.status === "succeeded" || task.status === "failed" || task.status === "draft") return { kind: "unchanged", status: task.status } as const;
    if (task.status === "provider_submission_ambiguous") return { kind: "blocked", code: "manual_reconciliation_required" } as const;
    if (!task.providerRequestId) return { kind: "blocked", code: "awaiting_provider_id" } as const;
    const observed = await this.getStatus(task.providerRequestId);
    return { kind: "observed", status: observed === "queued" ? task.status : "processing", outputReady: observed === "completed" } as const;
  }

  private validateTaskId(value: string) {
    if (!/^[a-zA-Z0-9_-]{1,255}$/.test(value)) throw new Error("Invalid UGC provider task ID.");
  }
}

/** This is the new UGC factory; legacy Kling tasks retain their old adapter. */
export function createUgcVideoProvider(): UgcSeedanceVideoProvider {
  let reader: TaskReader | undefined;
  return new UgcSeedanceVideoProvider(() => reader ??= new FalVideoGenerationProvider());
}

export function prepareUgcSeedanceIntegration(job: UgcSnapshotJob) {
  return { ...ugcSeedanceRoute, submitted: false, generationEnabled: false, assessment: planUgcSeedanceRequest(job) } as const;
}
