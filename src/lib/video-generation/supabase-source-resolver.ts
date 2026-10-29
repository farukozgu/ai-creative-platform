import "server-only";

import sharp from "sharp";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ResolvedVideoSource, VideoSourceResolver } from "@/lib/video-generation/source";
import type { VideoGenerationAspectRatio, VideoSourceReference } from "@/lib/video-generation/types";

function ratioFor(width: number, height: number): VideoGenerationAspectRatio | null {
  const ratio = width / height;
  const candidates: Array<[VideoGenerationAspectRatio, number]> = [["16:9", 16 / 9], ["9:16", 9 / 16], ["1:1", 1]];
  const match = candidates.find(([, target]) => Math.abs(ratio - target) / target <= 0.02);
  return match?.[0] ?? null;
}

export class SupabaseVideoSourceResolver implements VideoSourceResolver {
  constructor(private readonly preparedOnly = false) {}
  async resolveOwned(ownerId: string, source: VideoSourceReference): Promise<ResolvedVideoSource | null> {
    const supabase = getSupabaseAdminClient();
    let bucketId: string;
    let objectPath: string;
    if (source.kind === "uploaded-image") {
      const result = await supabase.from("video_source_assets").select("bucket_id, object_path").eq("id", source.sourceAssetId).eq("owner_id", ownerId).maybeSingle();
      if (result.error || !result.data) return null;
      bucketId = result.data.bucket_id;
      objectPath = result.data.object_path;
      if (this.preparedOnly && (bucketId !== "video-source-images" || objectPath !== `${ownerId}/${source.sourceAssetId}/prepared-v1.png`)) return null;
    } else {
      if (this.preparedOnly) return null;
      const result = await supabase.from("generations").select("project_id, generation_type, status, output_bucket_id, output_object_path").eq("id", source.generationId).maybeSingle();
      if (result.error || !result.data || result.data.generation_type !== "image" || result.data.status !== "succeeded" || !result.data.output_bucket_id || !result.data.output_object_path) return null;
      const project = await supabase.from("projects").select("id").eq("id", result.data.project_id).eq("user_id", ownerId).maybeSingle();
      if (project.error || !project.data) return null;
      bucketId = result.data.output_bucket_id;
      objectPath = result.data.output_object_path;
    }
    const downloaded = await supabase.storage.from(bucketId).download(objectPath);
    if (downloaded.error || !downloaded.data || downloaded.data.size <= 0 || downloaded.data.size > 25 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(downloaded.data.type)) return null;
    const metadata = await sharp(Buffer.from(await downloaded.data.arrayBuffer()), { failOn: "error", limitInputPixels: 40_000_000 }).metadata();
    if (!metadata.width || !metadata.height || metadata.width < 360 || metadata.height < 360 || metadata.width > 2000 || metadata.height > 2000
      || !["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1 || (metadata.orientation ?? 1) !== 1) return null;
    const aspectRatio = ratioFor(metadata.width, metadata.height);
    if (!aspectRatio) return null;
    const signed = await supabase.storage.from(bucketId).createSignedUrl(objectPath, 3600);
    if (signed.error || !signed.data) return null;
    return {
      reference: source, providerUrl: signed.data.signedUrl, expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      mimeType: downloaded.data.type as "image/jpeg" | "image/png" | "image/webp", sizeBytes: downloaded.data.size,
      width: metadata.width, height: metadata.height, aspectRatio,
    };
  }
}
