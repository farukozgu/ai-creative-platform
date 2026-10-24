import "server-only";

import { createFalClient, type FalClient } from "@fal-ai/client";

import { buildFalVideoRequestInput } from "@/lib/video-generation/fal-request";
import type { ProviderVideoFile, VideoGenerationProvider, VideoProviderRequest } from "@/lib/video-generation/types";

type FalOutput = { video?: { url?: unknown; content_type?: unknown; file_size?: unknown } };

/** Shared server credential/client construction; callers may constrain transport for verification. */
export function createServerFalClient(
  credentials = process.env.FAL_KEY,
  options: Pick<NonNullable<Parameters<typeof createFalClient>[0]>, "fetch" | "responseHandler"> = {},
) {
  if (!credentials) throw new Error("The server-side fal.ai credential is unavailable.");
  return createFalClient({ credentials, ...options });
}

export class FalVideoGenerationProvider implements VideoGenerationProvider {
  readonly name = "fal" as const;
  private readonly client: FalClient;

  constructor(credentials = process.env.FAL_KEY) {
    this.client = createServerFalClient(credentials);
  }

  async submit(request: VideoProviderRequest) {
    const input = buildFalVideoRequestInput(request);
    const response = await this.client.queue.submit(request.endpointId, {
      input,
      priority: "normal",
      storageSettings: { expiresIn: "1h" },
    });
    return { requestId: response.request_id };
  }

  async getStatus(endpointId: string, requestId: string) {
    const status = await this.client.queue.status(endpointId, { requestId, logs: false });
    if (status.status === "IN_QUEUE") return "queued" as const;
    if (status.status === "IN_PROGRESS") return "processing" as const;
    if (status.status === "COMPLETED") return "completed" as const;
    throw new Error("The provider returned an unknown video task status.");
  }

  async getResult(endpointId: string, requestId: string): Promise<ProviderVideoFile> {
    const response = await this.client.queue.result(endpointId, { requestId });
    const output = response.data as FalOutput;
    const video = output.video;
    if (!video || typeof video.url !== "string") throw new Error("The provider response did not include a video file.");
    return {
      url: video.url,
      contentType: typeof video.content_type === "string" ? video.content_type : null,
      sizeBytes: typeof video.file_size === "number" ? video.file_size : null,
    };
  }

  async cancel(endpointId: string, requestId: string) {
    await this.client.queue.cancel(endpointId, { requestId });
  }
}
