import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { DurableVideoOutputStore, ProviderVideoFile, VideoJobRecord } from "@/lib/video-generation/types";

export const MAX_DURABLE_VIDEO_BYTES = 250 * 1024 * 1024;
const allowedProviderHosts = ["fal.media", "fal.ai", "googleapis.com"];

export function validateProviderVideo(file: ProviderVideoFile) {
  let url: URL;
  try { url = new URL(file.url); } catch { return { ok: false as const, reason: "invalid_url" }; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !allowedProviderHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return { ok: false as const, reason: "untrusted_host" };
  if (file.contentType !== null && file.contentType !== "video/mp4") return { ok: false as const, reason: "invalid_type" };
  if (file.sizeBytes !== null && (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes <= 0 || file.sizeBytes > MAX_DURABLE_VIDEO_BYTES)) return { ok: false as const, reason: "invalid_size" };
  return { ok: true as const, url };
}

export class SupabaseDurableVideoOutputStore implements DurableVideoOutputStore {
  constructor(private readonly download: typeof fetch = fetch) {}
  async recover(job: VideoJobRecord) {
    const objectPath = `${job.ownerId}/${job.id}/output.mp4`;
    const { data, error } = await getSupabaseAdminClient().storage.from("generated-videos").download(objectPath);
    if (error) {
      const code = String(error.statusCode);
      if (code === "404" || code === "400" && /not found/i.test(error.message)) return null;
      throw new Error("Unable to recover the private video.");
    }
    if (!data || data.type !== "video/mp4" || data.size < 12 || data.size > MAX_DURABLE_VIDEO_BYTES
      || Buffer.from(await data.slice(0, 12).arrayBuffer()).toString("ascii", 4, 8) !== "ftyp") throw new Error("Invalid private MP4.");
    return { bucketId: "generated-videos", objectPath, contentType: "video/mp4" as const, sizeBytes: data.size };
  }
  async persist(job: VideoJobRecord, file: ProviderVideoFile) {
    const validation = validateProviderVideo(file);
    if (!validation.ok) throw new Error(`Invalid provider video: ${validation.reason}`);
    const response = await this.download(validation.url, { redirect: "error", signal: AbortSignal.timeout(60_000) });
    if (!response.ok || !response.body) throw new Error("Unable to download the provider video.");
    const responseType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
    if (responseType !== "video/mp4") throw new Error("Provider video has an unsupported content type.");
    const declaredHeader = response.headers.get("content-length");
    const declaredLength = declaredHeader === null ? null : Number(declaredHeader);
    if (declaredLength !== null && (!Number.isSafeInteger(declaredLength) || declaredLength <= 0 || declaredLength > MAX_DURABLE_VIDEO_BYTES)) throw new Error("Provider video exceeds the size limit.");
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
    const bytes = await new Response(source.pipeThrough(limiter)).arrayBuffer();
    if (transferred < 12 || (declaredLength !== null && declaredLength !== transferred)
      || Buffer.from(bytes).toString("ascii", 4, 8) !== "ftyp") throw new Error("Invalid MP4 container.");
    const { error } = await supabase.storage.from("generated-videos").upload(objectPath, bytes, {
      contentType: "video/mp4", cacheControl: "3600", upsert: false,
    });
    if (error) {
      // Recover an upload whose response/checkpoint was lost. An existing private object
      // must have exactly the bytes we just validated; never overwrite a conflicting file.
      const existing = await supabase.storage.from("generated-videos").download(objectPath);
      if (existing.error || !existing.data || existing.data.size !== transferred
        || !Buffer.from(await existing.data.arrayBuffer()).equals(Buffer.from(bytes))) throw new Error("Unable to persist the generated video.");
    }
    return { bucketId: "generated-videos", objectPath, contentType: "video/mp4" as const, sizeBytes: transferred };
  }
}
