import "server-only";
import sharp from "sharp";
import { sourceFrameGeometry } from "./source-context";
import { createHash } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSafeVideoImageTransformDiagnostic, prepareVideoSourceImage } from "./prepare-source-image";
import type { VideoGenerationAspectRatio, VideoPreparationSource } from "./types";
import { isProductProfile } from "@/lib/product-understanding/product-profile";
import { presetProduct, unknownPresetProduct } from "@/lib/video-director/preset-recommendations";
import { logVideoDiagnostic } from "./diagnostics";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fingerprint = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
type VideoSourcePreparationStage = "source_validation" | "ownership_lookup" | "source_download" | "image_transform"
  | "source_metadata" | "prepared_storage_write" | "prepared_storage_recovery" | "source_record_write"
  | "source_record_recovery" | "preview_url";

/** Deterministic per original content and ratio. Never overwrites or removes the original. */
export async function prepareOwnedVideoSource(ownerId: string, source: VideoPreparationSource, aspectRatio: VideoGenerationAspectRatio,
  diagnostics?: { correlationId: string }) {
  let stage: VideoSourcePreparationStage = "source_validation";
  const startedAt = Date.now();
  const log = (result: "success" | "failed") => diagnostics && logVideoDiagnostic(diagnostics.correlationId, "video_source_prepare", result,
    { code: stage, durationMs: Date.now() - startedAt });
  try {
    const value = await prepareOwnedVideoSourceInternal(ownerId, source, aspectRatio, value => { stage = value; });
    log("success");
    return value;
  } catch (error) {
    log("failed");
    if (process.env.NODE_ENV === "development") {
      const transform = getSafeVideoImageTransformDiagnostic(error);
      console.error("[video-source-prepare] failed", {
        stage,
        ...(transform ?? {}),
      });
    }
    throw new Error("Source preparation failed.");
  }
}

async function prepareOwnedVideoSourceInternal(ownerId: string, source: VideoPreparationSource, aspectRatio: VideoGenerationAspectRatio,
  setStage: (stage: VideoSourcePreparationStage) => void) {
  const supabase = getSupabaseAdminClient();
  let bucket = "video-source-images";
  let path: string;
  let presetContext = unknownPresetProduct;
  if (source.kind === "upload") {
    if (!uuid.test(source.sourceAssetId) || ![`${ownerId}/${source.sourceAssetId}/source.jpg`, `${ownerId}/${source.sourceAssetId}/source.png`, `${ownerId}/${source.sourceAssetId}/source.webp`].includes(source.objectPath)) throw new Error("Invalid video source owner.");
    path = source.objectPath;
  } else {
    setStage("ownership_lookup");
    if (!uuid.test(source.generationId)) throw new Error("Invalid video source.");
    const { data: row, error } = await supabase.from("generations").select("project_id,input_asset_id,generation_type,status,output_bucket_id,output_object_path").eq("id", source.generationId).maybeSingle();
    if (error || !row || row.generation_type !== "image" || row.status !== "succeeded" || row.output_bucket_id !== "generated-assets" || !row.output_object_path) throw new Error("Source unavailable.");
    const project = await supabase.from("projects").select("id").eq("id", row.project_id).eq("user_id", ownerId).maybeSingle();
    if (project.error || !project.data) throw new Error("Source unavailable.");
    if (row.input_asset_id) {
      // Ownership has been established above; suggestions reuse only this project's profile.
      try {
        const profile = await supabase.from("assets").select("product_profile").eq("id", row.input_asset_id).eq("project_id", row.project_id).maybeSingle();
        if (!profile.error && isProductProfile(profile.data?.product_profile)) presetContext = presetProduct(profile.data.product_profile);
      } catch { /* Suggestions cannot make a valid source unavailable. */ }
    }
    bucket = row.output_bucket_id; path = row.output_object_path;
  }
  setStage("source_download");
  const downloaded = await supabase.storage.from(bucket).download(path);
  if (downloaded.error || !downloaded.data || !["image/jpeg", "image/png", "image/webp"].includes(downloaded.data.type)
    || downloaded.data.size <= 0 || downloaded.data.size > 25 * 1024 * 1024) throw new Error("Source unavailable.");
  const bytes = Buffer.from(await downloaded.data.arrayBuffer());
  setStage("image_transform");
  const prepared = await prepareVideoSourceImage(bytes, aspectRatio);
  setStage("source_metadata");
  const originalMetadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
  const swapped = (originalMetadata.orientation ?? 1) >= 5;
  const geometry = sourceFrameGeometry(swapped ? originalMetadata.height! : originalMetadata.width!, swapped ? originalMetadata.width! : originalMetadata.height!, prepared.width, prepared.height);
  const hash = createHash("sha256").update(`video-frame-v1:${ownerId}:${bucket}:${path}:${aspectRatio}:${fingerprint(bytes)}`).digest("hex");
  const sourceAssetId = `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
  const objectPath = `${ownerId}/${sourceAssetId}/prepared-v1.png`;
  setStage("prepared_storage_write");
  const upload = await supabase.storage.from("video-source-images").upload(objectPath, prepared.image, { contentType: prepared.mimeType, upsert: false,
    metadata: { preparation_version: 1, source_bucket: bucket, source_path: path, source_sha256: fingerprint(bytes), aspect_ratio: aspectRatio } });
  if (upload.error) {
    // Recover concurrent preparation or an upload whose response was lost, without replacing bytes.
    setStage("prepared_storage_recovery");
    const existing = await supabase.storage.from("video-source-images").download(objectPath);
    if (existing.error || !existing.data || existing.data.size !== prepared.image.length
      || fingerprint(Buffer.from(await existing.data.arrayBuffer())) !== fingerprint(prepared.image)) throw new Error("Prepared source storage unavailable.");
  }
  setStage("source_record_write");
  const inserted = await supabase.from("video_source_assets").insert({ id: sourceAssetId, owner_id: ownerId,
    object_path: objectPath, mime_type: prepared.mimeType, size_bytes: prepared.image.length, width: prepared.width, height: prepared.height }).select("id").single();
  if (inserted.error) {
    setStage("source_record_recovery");
    const existing = await supabase.from("video_source_assets").select("id").eq("id", sourceAssetId).eq("owner_id", ownerId).eq("object_path", objectPath).eq("mime_type", prepared.mimeType).eq("size_bytes", prepared.image.length).eq("width", prepared.width).eq("height", prepared.height).maybeSingle();
    if (existing.error || !existing.data) throw new Error("Prepared source record unavailable.");
  }
  setStage("preview_url");
  const signed = await supabase.storage.from("video-source-images").createSignedUrl(objectPath, 3600);
  if (signed.error || !signed.data) throw new Error("Prepared preview unavailable.");
  return { source: { kind: "uploaded-image" as const, sourceAssetId }, previewUrl: signed.data.signedUrl,
    sourceSha256: fingerprint(bytes), aspectRatio, width: prepared.width, height: prepared.height, geometry, presetContext };
}
