import "server-only";

import sharp from "sharp";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { VideoSourceReference } from "@/lib/video-generation/types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedSourceTypes = new Set(["image/jpeg", "image/png"]);

export async function createVideoSourceUploadTicket(ownerId: string, fileName: string) {
  const id = crypto.randomUUID();
  const extension = fileName.toLowerCase().endsWith(".png") ? "png" : "jpg";
  const objectPath = `${ownerId}/${id}/source.${extension}`;
  const { data, error } = await getSupabaseAdminClient().storage.from("video-source-images").createSignedUploadUrl(objectPath, { upsert: false });
  if (error || !data) throw new Error("Unable to create a private video source upload.");
  return { sourceAssetId: id, objectPath, token: data.token };
}

export async function finalizeVideoSourceUpload(ownerId: string, sourceAssetId: string, objectPath: string) {
  if (!uuidPattern.test(sourceAssetId) || objectPath.split("/").length !== 3 || !objectPath.startsWith(`${ownerId}/${sourceAssetId}/`)) return null;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage.from("video-source-images").download(objectPath);
  if (error || !data || data.size <= 0 || data.size > 25 * 1024 * 1024 || !allowedSourceTypes.has(data.type)) return null;
  const bytes = Buffer.from(await data.arrayBuffer());
  const metadata = await sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 }).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 360 || metadata.height < 360 || metadata.width > 2000 || metadata.height > 2000) return null;
  const { data: row, error: insertError } = await supabase.from("video_source_assets").insert({
    id: sourceAssetId, owner_id: ownerId, object_path: objectPath, mime_type: data.type,
    size_bytes: data.size, width: metadata.width, height: metadata.height,
  }).select("id").single();
  if (insertError || !row) return null;
  return { kind: "uploaded-image", sourceAssetId: row.id } satisfies VideoSourceReference;
}

export async function createAuthorizedVideoPlaybackUrl(ownerId: string, jobId: string, download = false) {
  if (!uuidPattern.test(jobId)) return null;
  const supabase = getSupabaseAdminClient();
  const { data: job, error } = await supabase.from("generations").select("output_bucket_id, output_object_path, status").eq("generation_type", "video").eq("id", jobId).eq("owner_id", ownerId).maybeSingle();
  if (error || !job || job.status !== "succeeded" || job.output_bucket_id !== "generated-videos" || !job.output_object_path) return null;
  const signed = await supabase.storage.from(job.output_bucket_id).createSignedUrl(job.output_object_path, 300, download ? { download: true } : undefined);
  return signed.error ? null : signed.data.signedUrl;
}
