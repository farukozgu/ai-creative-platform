import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildUgcKlingInput, buildUgcSeedanceInput } from "@/lib/ugc/ugc-fal-submission";
import type { UgcFalInput, UgcKlingInput, UgcSeedanceInput } from "@/lib/ugc/ugc-fal-submission";
import type { UgcSeedanceVisualPlan, UgcMiniVisualPlan } from "@/lib/ugc/ugc-seedance-planner";
import { canonicalUgcJson, isOwnedUgcImage, isUgcUuid } from "@/lib/ugc/ugc-request-planner";
import type { UgcSnapshotJob, UgcVisualPlan, UgcKlingVisualPlan, UgcJobIdentity } from "@/lib/ugc/ugc-request-planner";
import type { UgcStoredVideo } from "@/lib/ugc/ugc-pipeline-types";
import { UgcOutputInvalidError } from "@/lib/ugc/ugc-pipeline-types";
import { validateProviderVideo, MAX_DURABLE_VIDEO_BYTES } from "@/lib/video-generation/output";
import type { ProviderVideoFile } from "@/lib/video-generation/types";

export function ugcVideoObjectPath(job: UgcJobIdentity) {
  if (![job.id, job.ownerId, job.projectId].every(isUgcUuid)) throw new Error("Invalid UGC output identity.");
  return `${job.ownerId}/${job.projectId}/${job.id}.mp4`;
}

/** Bounded ISO BMFF container inspection, not a full codec decoder or speech verification. */
export function inspectUgcMp4(bytes: Buffer, expectedRatio: string, expectedDuration: 15 | 30 = 15) {
  if (expectedDuration !== 15 && expectedDuration !== 30) throw new Error("Unsupported UGC duration.");
  type Box = { type: string; start: number; end: number };
  function boxes(start: number, end: number): Box[] {
    const found: Box[] = [];
    while (start < end) {
      if (end - start < 8 || found.length > 10000) throw new Error("Invalid MP4 box.");
      let size = bytes.readUInt32BE(start);
      const type = bytes.toString("ascii", start + 4, start + 8);
      let header = 8;
      if (size === 1) {
        if (end - start < 16) throw new Error("Invalid extended MP4 box.");
        const extended = bytes.readBigUInt64BE(start + 8);
        if (extended > BigInt(MAX_DURABLE_VIDEO_BYTES)) throw new Error("Oversized MP4 box.");
        size = Number(extended); header = 16;
      }
      if (size === 0) size = end - start;
      if (size < header || start + size > end) throw new Error("Truncated MP4 box.");
      found.push({ type, start: start + header, end: start + size });
      start += size;
    }
    return found;
  }
  if (bytes.length < 32 || bytes.length > MAX_DURABLE_VIDEO_BYTES) throw new Error("Invalid MP4 size.");
  const root = boxes(0, bytes.length);
  const ftyp = root.find(box => box.type === "ftyp");
  const moov = root.find(box => box.type === "moov");
  if (!ftyp || !moov || !root.some(box => box.type === "mdat" && box.end > box.start)
    || ftyp.end - ftyp.start < 8 || !/^(isom|iso[2-9]|mp41|mp42|avc1|dash)$/.test(bytes.toString("ascii", ftyp.start, ftyp.start + 4))) throw new Error("Unsupported MP4 container.");
  for (const track of boxes(moov.start, moov.end).filter(box => box.type === "trak")) {
    const children = boxes(track.start, track.end);
    const tkhd = children.find(box => box.type === "tkhd");
    const mdia = children.find(box => box.type === "mdia");
    if (!tkhd || !mdia) continue;
    const metadata = boxes(mdia.start, mdia.end);
    const hdlr = metadata.find(box => box.type === "hdlr");
    const mdhd = metadata.find(box => box.type === "mdhd");
    if (!hdlr || hdlr.end - hdlr.start < 12 || bytes.toString("ascii", hdlr.start + 8, hdlr.start + 12) !== "vide" || !mdhd) continue;
    const version = bytes[mdhd.start];
    if (![0, 1].includes(version) || mdhd.end - mdhd.start < (version === 1 ? 32 : 20)) throw new Error("Invalid MP4 timing.");
    const scale = bytes.readUInt32BE(mdhd.start + (version === 1 ? 20 : 12));
    const ticks = version === 1 ? Number(bytes.readBigUInt64BE(mdhd.start + 24)) : bytes.readUInt32BE(mdhd.start + 16);
    const durationSeconds = ticks / scale;
    if (!Number.isSafeInteger(ticks) || !scale || !Number.isFinite(durationSeconds) || Math.abs(durationSeconds - expectedDuration) > 0.5) throw new Error("Unexpected MP4 duration.");
    const tkVersion = bytes[tkhd.start];
    if (![0, 1].includes(tkVersion) || tkhd.end - tkhd.start < (tkVersion === 1 ? 96 : 84)) throw new Error("Invalid MP4 dimensions.");
    const width = bytes.readUInt32BE(tkhd.end - 8) / 65536;
    const height = bytes.readUInt32BE(tkhd.end - 4) / 65536;
    const [rw, rh] = expectedRatio.split(":").map(Number);
    if (!width || !height || !rw || !rh || Math.abs(width / height - rw / rh) > 0.01) throw new Error("Unexpected MP4 aspect ratio.");
    return { durationSeconds, width, height };
  }
  throw new Error("MP4 video track missing.");
}

async function readBounded(response: Response, maximum: number) {
  if (!response.ok || !response.body) throw new Error("Media download unavailable.");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) < 1 || Number(declared) > maximum)) throw new Error("Invalid media size.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximum) throw new Error("Media byte limit exceeded.");
      chunks.push(next.value);
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  finally { reader.releaseLock(); }
  if (total === 0 || (declared !== null && total !== Number(declared))) throw new Error("Incomplete media.");
  return Buffer.concat(chunks, total);
}

/** No instance is wired to a route or execution service in this phase. */
export class SupabaseUgcPrivateMedia {
  constructor(private readonly download: typeof fetch = fetch) {}

  async resolveInput(job: UgcSnapshotJob, plan: UgcKlingVisualPlan): Promise<UgcKlingInput>;
  async resolveInput(job: UgcSnapshotJob, plan: UgcSeedanceVisualPlan): Promise<UgcSeedanceInput>;
  async resolveInput(job: UgcSnapshotJob, plan: UgcMiniVisualPlan): Promise<UgcSeedanceInput>;
  async resolveInput(job: UgcSnapshotJob, plan: UgcVisualPlan): Promise<UgcFalInput>;
  async resolveInput(job: UgcSnapshotJob, plan: UgcVisualPlan): Promise<UgcFalInput> {
    // Planning supports audio references; private audio provisioning/decoding does not yet exist.
    // Never sign arbitrary URLs or widen the image-only bucket to bypass this boundary.
    if (plan.version !== 1 && plan.audio?.mode === "reference") throw new Error("UGC private audio reference storage unavailable.");
    const admin = getSupabaseAdminClient();
    const images = plan.version !== 1 ? plan.images : [plan.startImage, ...plan.elements.flatMap(element => [element.frontal, ...element.references])];
    const urls = new Map<string, string>();
    const pinnedImages = new Map<string, string>();
    for (const image of images) {
      if (!isOwnedUgcImage(job, image)) throw new Error("UGC source ownership mismatch.");
      const identity = canonicalUgcJson(image);
      if (pinnedImages.has(image.objectPath)) {
        if (pinnedImages.get(image.objectPath) !== identity) throw new Error("Conflicting UGC source identities.");
        continue;
      }
      pinnedImages.set(image.objectPath, identity);
      const downloaded = await admin.storage.from("ugc-product-assets").download(image.objectPath);
      if (downloaded.error || !downloaded.data || downloaded.data.size > 10 * 1024 * 1024) throw new Error("UGC source unavailable.");
      const bytes = Buffer.from(await downloaded.data.arrayBuffer());
      if (createHash("sha256").update(bytes).digest("hex") !== image.sha256) throw new Error("UGC source changed after snapshot.");
      const metadata = await sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 }).metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || metadata.width !== image.width || metadata.height !== image.height
        || (metadata.orientation !== undefined && metadata.orientation !== 1) || (metadata.pages ?? 1) > 1) throw new Error("UGC source dimensions/format invalid.");
      const signed = await admin.storage.from("ugc-product-assets").createSignedUrl(image.objectPath, 3600);
      if (signed.error || !signed.data?.signedUrl) throw new Error("UGC source signing unavailable.");
      const url = new URL(signed.data.signedUrl);
      const storageOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
      if (url.protocol !== "https:" || url.origin !== storageOrigin || !url.pathname.startsWith("/storage/v1/object/sign/ugc-product-assets/")) throw new Error("Invalid signed UGC source.");
      urls.set(image.objectPath, signed.data.signedUrl);
    }
    return plan.version !== 1 ? buildUgcSeedanceInput(plan, urls) : buildUgcKlingInput(plan, urls);
  }

  private stored(job: UgcSnapshotJob, bytes: Buffer): UgcStoredVideo {
    const settings = job.requestSnapshot.settings as { aspectRatio?: string; duration?: string } | undefined;
    let measured;
    try {
      if (settings?.duration !== "15" && settings?.duration !== "30") throw new Error("Unsupported UGC duration.");
      measured = inspectUgcMp4(bytes, settings.aspectRatio ?? "", settings.duration === "30" ? 30 : 15);
    }
    catch { throw new UgcOutputInvalidError(); }
    return { bucketId: "ugc-generated-videos", objectPath: ugcVideoObjectPath(job), contentType: "video/mp4", byteSize: bytes.length, durationSeconds: measured.durationSeconds };
  }

  async recover(job: UgcSnapshotJob): Promise<UgcStoredVideo | null> {
    const result = await getSupabaseAdminClient().storage.from("ugc-generated-videos").download(ugcVideoObjectPath(job));
    if (result.error) {
      if (String(result.error.statusCode) === "404" || String(result.error.statusCode) === "400" && /not found/i.test(result.error.message)) return null;
      throw new Error("UGC output recovery unavailable.");
    }
    if (!result.data || result.data.type !== "video/mp4" || result.data.size > MAX_DURABLE_VIDEO_BYTES) throw new UgcOutputInvalidError();
    return this.stored(job, Buffer.from(await result.data.arrayBuffer()));
  }

  async persist(job: UgcSnapshotJob, file: ProviderVideoFile) {
    const checked = validateProviderVideo(file);
    if (!checked.ok || checked.url.username || checked.url.password || checked.url.port
      || !(checked.url.hostname.endsWith(".fal.media") || checked.url.hostname === "fal.media" || checked.url.hostname === "storage.googleapis.com")) throw new UgcOutputInvalidError();
    const response = await this.download(checked.url, { redirect: "error", signal: AbortSignal.timeout(60_000) });
    if (response.headers.get("content-type")?.split(";", 1)[0].trim() !== "video/mp4") throw new UgcOutputInvalidError();
    const bytes = await readBounded(response, MAX_DURABLE_VIDEO_BYTES);
    if (file.sizeBytes !== null && file.sizeBytes !== bytes.length) throw new UgcOutputInvalidError();
    const output = this.stored(job, bytes);
    const saved = await getSupabaseAdminClient().storage.from(output.bucketId).upload(output.objectPath, bytes, { contentType: "video/mp4", upsert: false, cacheControl: "3600" });
    if (saved.error) {
      // A stale uploader may have won after a crash. Reuse only an independently validated private object.
      const existing = await this.recover(job);
      if (!existing) throw new Error("UGC output persistence unavailable.");
      return existing;
    }
    return output;
  }
}

/** Owner-scoped authenticated client; service role never signs a client-supplied output path. */
export async function createOwnedUgcVideoAccess(ownerId: string, jobId: string) {
  if (!isUgcUuid(ownerId) || !isUgcUuid(jobId)) return null;
  const { createClient } = await import("@/lib/supabase/server");
  const client = await createClient();
  const { data: auth } = await client.auth.getUser();
  if (auth.user?.id !== ownerId) return null;
  const { data, error } = await client.from("ugc_video_jobs").select("id, owner_id, project_id, status, output_bucket_id, output_object_path")
    .eq("owner_id", ownerId).eq("id", jobId).eq("status", "succeeded").maybeSingle();
  if (error || !data || data.id !== jobId || data.owner_id !== ownerId || data.status !== "succeeded" || data.output_bucket_id !== "ugc-generated-videos"
    || data.output_object_path !== ugcVideoObjectPath({ id: data.id, ownerId: data.owner_id, projectId: data.project_id })) return null;
  const signed = await client.storage.from("ugc-generated-videos").createSignedUrl(data.output_object_path, 300);
  return signed.error ? null : signed.data.signedUrl;
}
