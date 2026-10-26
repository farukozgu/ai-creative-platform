import "server-only";

import { FalVideoGenerationProvider } from "@/lib/video-generation/fal-provider";
import { videoEndpointCapabilities } from "@/lib/video-generation/capabilities";
import type { VideoGenerationProvider } from "@/lib/video-generation/types";
import type { UgcProviderJobStatus, UgcProviderRequest, UgcProviderSubmission, UgcVideoProvider } from "@/lib/ugc/ugc-video-provider";
import type { UgcModelTier } from "@/features/ugc/ugc-model-contract";

type TaskReader = Pick<VideoGenerationProvider, "getStatus" | "getResult">;

/** Load this from trusted job storage, including a versioned immutable routing plan. */
export type UgcKlingTaskReference = {
  ownerId: string;
  provider: string;
  modelId: string;
  endpointId: string;
  providerRequestId: string | null;
  status: "draft" | UgcProviderJobStatus;
};

/** Internal task transport only. Callers must first load an owned, pinned UGC task. */
export class UgcKlingVideoProvider implements UgcVideoProvider {
  readonly provider = videoEndpointCapabilities.klingV3ProImage.provider;
  readonly endpointId: string;
  readonly modelId: string;
  readonly generationEnabled = false;

  constructor(private readonly getTaskReader: () => TaskReader, tier: UgcModelTier = "premium") {
    const capability = tier === "standard" ? videoEndpointCapabilities.klingV3StandardImage : videoEndpointCapabilities.klingV3ProImage;
    this.endpointId = capability.endpointId;
    this.modelId = capability.id;
  }

  async submit(request: UgcProviderRequest): Promise<UgcProviderSubmission> {
    void request;
    // Deliberately no submit transport: flags or credentials cannot enable a paid POST.
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

  /** Produces a transition proposal only; a future fenced worker must commit it. */
  async inspectOwnedTask(ownerId: string, task: UgcKlingTaskReference) {
    if (!ownerId || task.ownerId !== ownerId) return { kind: "blocked", code: "unauthorized" } as const;
    if (task.provider !== this.provider || task.modelId !== this.modelId || task.endpointId !== this.endpointId) {
      return { kind: "blocked", code: "routing_mismatch" } as const;
    }
    if (task.status === "succeeded" || task.status === "failed" || task.status === "draft") {
      return { kind: "unchanged", status: task.status } as const;
    }
    if (task.status === "provider_submission_ambiguous") return { kind: "blocked", code: "manual_reconciliation_required" } as const;
    if (!task.providerRequestId) return { kind: "blocked", code: "awaiting_provider_id" } as const;
    const observed = await this.getStatus(task.providerRequestId);
    return {
      kind: "observed" as const,
      status: observed === "queued" ? task.status : "processing" as const,
      outputReady: observed === "completed",
    };
  }

  private validateTaskId(value: string) {
    if (!value || value.length > 255 || /\s/.test(value)) throw new Error("Invalid UGC provider task ID.");
  }
}

/** Shares the existing server-only client/auth; preparing or blocking a job needs no key. */
export function createUgcVideoProvider(tier: UgcModelTier = "premium"): UgcKlingVideoProvider {
  let reader: TaskReader | undefined;
  return new UgcKlingVideoProvider(() => reader ??= new FalVideoGenerationProvider(), tier);
}
