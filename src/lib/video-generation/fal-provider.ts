import "server-only";

import { createFalClient, type FalClient } from "@fal-ai/client";

import { buildFalVideoRequestInput } from "@/lib/video-generation/fal-request";
import { DefiniteVideoProviderFailure, type ProviderVideoFile, type VideoGenerationProvider, type VideoProviderRequest } from "@/lib/video-generation/types";

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

  constructor(private readonly credentials = process.env.FAL_KEY, private readonly http: typeof fetch = fetch) {
    this.client = createServerFalClient(credentials, { fetch: (url, init) => http(url, { ...init, redirect: "error", signal: AbortSignal.timeout(20_000) }) });
  }

  async submit(request: VideoProviderRequest) {
    const input = buildFalVideoRequestInput(request);
    let sent = false;
    const client = createServerFalClient(this.credentials, {
      fetch: async (url, init) => {
        if (sent) throw new Error("Duplicate video submission blocked.");
        sent = true;
        const target = new URL(String(url));
        if (target.origin !== "https://queue.fal.run" || target.pathname !== `/${request.endpointId}` || target.search || init?.method !== "POST") throw new Error("Unexpected video submission.");
        try { return await this.http(url, { ...init, redirect: "error", signal: AbortSignal.timeout(40_000) }); }
        catch (error) { if (error instanceof DefiniteVideoProviderFailure) throw error; throw new Error("Video submission outcome is uncertain."); }
      },
      responseHandler: async response => {
        if (!response.ok) {
          if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) throw new DefiniteVideoProviderFailure();
          throw new Error("Video submission outcome is uncertain.");
        }
        try { return await response.json() as unknown; } catch { throw new Error("Invalid video submission response."); }
      },
    });
    const response = await client.queue.submit(request.endpointId, {
      input,
      priority: "normal",
      storageSettings: { expiresIn: "1h" },
    });
    if (typeof response.request_id !== "string" || !/^[a-zA-Z0-9_-]{1,255}$/.test(response.request_id)) throw new Error("Invalid video task ID.");
    return { requestId: response.request_id };
  }

  async getStatus(endpointId: string, requestId: string) {
    const status = await this.client.queue.status(endpointId, { requestId, logs: false });
    const providerStatus = (status as unknown as { status?: unknown }).status;
    if (providerStatus === "IN_QUEUE") return "queued" as const;
    if (providerStatus === "IN_PROGRESS") return "processing" as const;
    if (providerStatus === "COMPLETED") return "completed" as const;
    if (providerStatus === "FAILED" || providerStatus === "CANCELLED" || providerStatus === "CANCELED") return "failed" as const;
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
