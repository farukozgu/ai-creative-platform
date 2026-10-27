import "server-only";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isProductProfile, type ProductProfile } from "@/lib/product-understanding/product-profile";
import { prepareVideoSourceImage } from "./prepare-source-image";
import type { VideoGenerationAspectRatio, VideoSourceReference } from "./types";
import { sourceFrameGeometry } from "./preservation";
export { sourceFrameGeometry } from "./preservation";

export const videoSourceSha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Prepared DB row proves ownership; provenance hash binds its private original bytes. */
export async function readOwnedPreparedVideoSource(ownerId: string, source: VideoSourceReference, ratio: VideoGenerationAspectRatio) {
  if (source.kind !== "uploaded-image") throw new Error("A prepared image is required.");
  const admin = getSupabaseAdminClient();
  const objectPath = `${ownerId}/${source.sourceAssetId}/prepared-v1.png`;
  const { data: asset, error } = await admin.from("video_source_assets").select("id,object_path,width,height")
    .eq("id", source.sourceAssetId).eq("owner_id", ownerId).eq("bucket_id", "video-source-images").eq("object_path", objectPath).maybeSingle();
  if (error || !asset) throw new Error("Source ownership unavailable.");
  const [file, info] = await Promise.all([admin.storage.from("video-source-images").download(objectPath), admin.storage.from("video-source-images").info(objectPath)]);
  if (file.error || !file.data || file.data.size > 25 * 1024 * 1024) throw new Error("Prepared source unavailable.");
  const prepared = Buffer.from(await file.data.arrayBuffer());
  const metadata = info.data?.metadata as Record<string, unknown> | undefined;
  if (!metadata || (metadata.aspect_ratio ?? metadata.aspectRatio) !== ratio) throw new Error("Source ratio mismatch.");
  let original = prepared;
  let profile: ProductProfile | null = null;
  const bucket = metadata.source_bucket ?? metadata.sourceBucket, path = metadata.source_path ?? metadata.sourcePath;
  const sourceHash = metadata.source_sha256 ?? metadata.sourceSha256;
  if (typeof bucket === "string" && typeof path === "string" && ["video-source-images", "generated-assets"].includes(bucket)
    && path.startsWith(`${ownerId}/`) && !path.includes("..") && !path.includes("\\") && typeof sourceHash === "string") {
    const raw = await admin.storage.from(bucket).download(path);
    if (!raw.error && raw.data && raw.data.size <= 25 * 1024 * 1024) {
      const candidate = Buffer.from(await raw.data.arrayBuffer());
      if (videoSourceSha256(candidate) === sourceHash) original = candidate;
    }
    if (bucket === "generated-assets") {
      const generation = await admin.from("generations").select("input_asset_id,project_id").eq("owner_id", ownerId).eq("generation_type", "image").eq("status", "succeeded").eq("output_bucket_id", bucket).eq("output_object_path", path).maybeSingle();
      if (generation.data?.input_asset_id) {
        const assetProfile = await admin.from("assets").select("product_profile").eq("id", generation.data.input_asset_id).eq("project_id", generation.data.project_id).maybeSingle();
        if (isProductProfile(assetProfile.data?.product_profile)) profile = assetProfile.data.product_profile;
      }
    }
  }
  const image = sharp(original, { failOn: "error", limitInputPixels: 40_000_000 });
  const meta = await image.metadata();
  if (!meta.width || !meta.height || !["jpeg", "png"].includes(meta.format ?? "") || (meta.pages ?? 1) !== 1) throw new Error("Invalid original image.");
  const rotated = (meta.orientation ?? 1) >= 5;
  const geometry = sourceFrameGeometry(rotated ? meta.height : meta.width, rotated ? meta.width : meta.height, asset.width, asset.height);
  const verified = await prepareVideoSourceImage(original, ratio);
  if (original !== prepared && !verified.image.equals(prepared)) throw new Error("Prepared source provenance mismatch.");
  return { original, prepared, geometry, profile, sourceSha256: videoSourceSha256(original) };
}
