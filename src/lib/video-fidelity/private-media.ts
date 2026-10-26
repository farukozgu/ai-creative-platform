import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { SupabaseVideoJobRepository } from "@/lib/video-generation/supabase-repository";
import { parsePreparedVideoSourceLocation } from "./source-location";

const maxSourceBytes = 25 * 1024 * 1024;
const maxVideoBytes = 32 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type VideoFidelityMediaKind = "source" | "video";

async function readOwnedOriginalSource(ownerId: string, location: NonNullable<ReturnType<typeof parsePreparedVideoSourceLocation>>) {
  const admin = getSupabaseAdminClient();
  let expectedMimeType: string | null = null;
  let maximumSize = maxSourceBytes;

  if (location.bucketId === "video-source-images" && location.uploadedAssetId) {
    const { data, error } = await admin.from("video_source_assets")
      .select("bucket_id,object_path,mime_type,size_bytes")
      .eq("id", location.uploadedAssetId).eq("owner_id", ownerId).maybeSingle();
    if (error || !data || data.bucket_id !== location.bucketId || data.object_path !== location.objectPath
      || data.size_bytes <= 0 || data.size_bytes > maxSourceBytes) return null;
    expectedMimeType = data.mime_type;
    maximumSize = data.size_bytes;
  } else if (location.bucketId === "generated-assets") {
    const { data, error } = await admin.from("generations")
      .select("project_id,output_mime_type,output_size_bytes")
      .eq("owner_id", ownerId).eq("generation_type", "image").eq("status", "succeeded")
      .eq("output_bucket_id", location.bucketId).eq("output_object_path", location.objectPath).maybeSingle();
    if (error || !data || !data.project_id || (data.output_size_bytes !== null && (data.output_size_bytes <= 0 || data.output_size_bytes > maxSourceBytes))) return null;
    const { data: project, error: projectError } = await admin.from("projects").select("id")
      .eq("id", data.project_id).eq("user_id", ownerId).maybeSingle();
    if (projectError || !project) return null;
    expectedMimeType = data.output_mime_type;
    if (data.output_size_bytes !== null) maximumSize = data.output_size_bytes;
  } else {
    return null;
  }

  const { data, error } = await admin.storage.from(location.bucketId).download(location.objectPath);
  if (error || !data || data.size <= 0 || data.size > maximumSize || !["image/jpeg", "image/png"].includes(data.type)) return null;
  if (expectedMimeType && expectedMimeType !== data.type) return null;
  return { bytes: Buffer.from(await data.arrayBuffer()), mimeType: data.type as "image/jpeg" | "image/png" };
}

export async function readOwnedVideoFidelityMedia(ownerId: string, jobId: string, kind: VideoFidelityMediaKind) {
  if (!uuid.test(ownerId) || !uuid.test(jobId)) return null;
  const job = await new SupabaseVideoJobRepository().findOwned(ownerId, jobId);
  if (!job || job.status !== "succeeded" || job.mode !== "image" || !job.sourceKind || !job.sourceId) return null;

  const admin = getSupabaseAdminClient();
  if (kind === "video") {
    const expectedPath = `${ownerId}/${jobId}/output.mp4`;
    if (job.outputBucketId !== "generated-videos" || job.outputObjectPath !== expectedPath || job.outputMimeType !== "video/mp4"
      || (job.outputSizeBytes !== null && job.outputSizeBytes > maxVideoBytes)) return null;
    const { data, error } = await admin.storage.from("generated-videos").download(expectedPath);
    if (error || !data || data.size <= 0 || data.size > maxVideoBytes) return null;
    const bytes = Buffer.from(await data.arrayBuffer());
    if (bytes.length < 12 || bytes.toString("ascii", 4, 8) !== "ftyp") return null;
    return { bytes, mimeType: "video/mp4" as const };
  }

  let bucketId: string;
  let objectPath: string;
  let expectedMimeType: string | null = null;
  if (job.sourceKind === "uploaded-image") {
    const { data, error } = await admin.from("video_source_assets")
      .select("bucket_id,object_path,mime_type,size_bytes")
      .eq("id", job.sourceId).eq("owner_id", ownerId).maybeSingle();
    if (error || !data || data.bucket_id !== "video-source-images"
      || ![`${ownerId}/${job.sourceId}/prepared-v1.png`, `${ownerId}/${job.sourceId}/source.jpg`, `${ownerId}/${job.sourceId}/source.png`].includes(data.object_path)
      || data.size_bytes <= 0 || data.size_bytes > maxSourceBytes) return null;
    bucketId = data.bucket_id;
    objectPath = data.object_path;
    expectedMimeType = data.mime_type;
    if (objectPath === `${ownerId}/${job.sourceId}/prepared-v1.png`) {
      const info = await admin.storage.from(bucketId).info(objectPath);
      if (!info.error && info.data) {
        const originalLocation = parsePreparedVideoSourceLocation(ownerId, info.data.metadata);
        if (originalLocation) {
          const original = await readOwnedOriginalSource(ownerId, originalLocation);
          if (original) return original;
        }
      }
    }
  } else if (job.sourceKind === "generated-image") {
    const { data: source, error: sourceError } = await admin.from("generations")
      .select("id,project_id,generation_type,status,output_bucket_id,output_object_path,output_mime_type,output_size_bytes")
      .eq("id", job.sourceId).eq("owner_id", ownerId).maybeSingle();
    if (sourceError || !source || source.generation_type !== "image" || source.status !== "succeeded"
      || source.output_bucket_id !== "generated-assets" || !source.output_object_path
      || (source.output_size_bytes !== null && source.output_size_bytes > maxSourceBytes)) return null;
    const { data: project, error: projectError } = await admin.from("projects").select("id").eq("id", source.project_id).eq("user_id", ownerId).maybeSingle();
    if (projectError || !project) return null;
    bucketId = "generated-assets";
    objectPath = source.output_object_path;
    expectedMimeType = source.output_mime_type;
  } else {
    return null;
  }

  const { data, error } = await admin.storage.from(bucketId).download(objectPath);
  if (error || !data || data.size <= 0 || data.size > maxSourceBytes || !["image/jpeg", "image/png"].includes(data.type)) return null;
  if (expectedMimeType && expectedMimeType !== data.type) return null;
  return { bytes: Buffer.from(await data.arrayBuffer()), mimeType: data.type as "image/jpeg" | "image/png" };
}
