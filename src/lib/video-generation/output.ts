import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { DurableVideoOutputStore, ProviderVideoFile, VideoJobRecord } from "@/lib/video-generation/types";

export const MAX_DURABLE_VIDEO_BYTES = 250 * 1024 * 1024;
const allowedProviderHosts = ["fal.media", "fal.ai", "googleapis.com"];

export function validateProviderVideo(file: ProviderVideoFile) {
  let url: URL;
  try { url = new URL(file.url); } catch { return { ok: false as const, reason: "invalid_url" }; }
  if (url.protocol !== "https:" || !allowedProviderHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return { ok: false as const, reason: "untrusted_host" };
  if (file.contentType !== null && file.contentType !== "video/mp4") return { ok: false as const, reason: "invalid_type" };
  if (file.sizeBytes !== null && (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes <= 0 || file.sizeBytes > MAX_DURABLE_VIDEO_BYTES)) return { ok: false as const, reason: "invalid_size" };
  return { ok: true as const, url };
}

export class SupabaseDurableVideoOutputStore implements DurableVideoOutputStore {
  async persist(job: VideoJobRecord, file: ProviderVideoFile) {
    const validation = validateProviderVideo(file);
    if (!validation.ok) throw new Error(`Invalid provider video: ${validation.reason}`);
    const response = await fetch(validation.url, { redirect: "error", signal: AbortSignal.timeout(60_000) });
    if (!response.ok || !response.body) throw new Error("Unable to download the provider video.");
    const responseType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
    if (responseType !== "video/mp4") throw new Error("Provider video has an unsupported content type.");
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && (declaredLength <= 0 || declaredLength > MAX_DURABLE_VIDEO_BYTES)) throw new Error("Provider video exceeds the size limit.");
    let transferred = 0;
    const limiter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        transferred += chunk.byteLength;
        if (transferred > MAX_DURABLE_VIDEO_BYTES) throw new Error("Provider video exceeds the size limit.");
        controller.enqueue(chunk);
      },
    });
    const objectPath = `${job.ownerId}/${job.id}/output.mp4`;
    const supabase = getSupabaseAdminClient();
    const source = response.body as ReadableStream<Uint8Array>;
    const { error } = await supabase.storage.from("generated-videos").upload(objectPath, source.pipeThrough(limiter), {
      contentType: "video/mp4", cacheControl: "3600", upsert: false,
    });
    if (error) throw new Error("Unable to persist the generated video.");
    return { bucketId: "generated-videos", objectPath, contentType: "video/mp4" as const, sizeBytes: transferred };
  }
}
