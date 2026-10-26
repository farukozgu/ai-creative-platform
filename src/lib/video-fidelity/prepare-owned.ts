import "server-only";
import { cropProductRegion } from "./crop-region";
import sharp from "sharp";
import { readOwnedPreparedVideoSource } from "@/lib/video-generation/source-context";
import { extractVideoFrames } from "@/lib/video-generation/source-motion";
import { mapRegionToFrame } from "@/lib/video-generation/preservation";
import { SupabaseVideoJobRepository } from "@/lib/video-generation/supabase-repository";
import { readOwnedVideoFidelityMedia } from "./private-media";
import { prepareVideoFidelitySourcePreview } from "./prepare-input";
import { sampleVideoFrameTimestamps } from "./sampling";


export async function prepareOwnedVideoFidelity(ownerId: string, jobId: string) {
  const job = await new SupabaseVideoJobRepository().findOwned(ownerId, jobId);
  if (!job || job.status !== "succeeded" || job.sourceKind !== "uploaded-image" || !job.sourceId) throw new Error("Owned completed video unavailable.");
  const source = await readOwnedPreparedVideoSource(ownerId, { kind: "uploaded-image", sourceAssetId: job.sourceId }, job.aspectRatio);
  const video = await readOwnedVideoFidelityMedia(ownerId, jobId, "video");
  if (!video) throw new Error("Owned MP4 unavailable.");
  const sourceImage = await prepareVideoFidelitySourcePreview({ data: source.original, mimeType: "image/" + ((await sharp(source.original).metadata()).format === "jpeg" ? "jpeg" : "png") });
  if (!sourceImage) throw new Error("Source image exceeds safe decode limits.");
  const nativeFrames = await extractVideoFrames(video.bytes, job.durationSeconds, sampleVideoFrameTimestamps(job.durationSeconds));
  const region = job.preservation?.criticalRegion ?? null;
  const closeups: { label: string; data: Buffer; timestampSeconds?: number }[] = [];
  if (region) {
    closeups.push({ label: "source critical region (original pixels)", data: await cropProductRegion(source.original, region, false) });
    const frameRegion = mapRegionToFrame(region, source.geometry);
    for (const frame of [nativeFrames[2], nativeFrames[4]]) closeups.push({ label: `context window at ${frame.timestampSeconds} seconds (alignment unverified)`, data: await cropProductRegion(frame.data, frameRegion, true), timestampSeconds: frame.timestampSeconds });
  }
  const frames = await Promise.all(nativeFrames.map(async frame => ({ timestampSeconds: frame.timestampSeconds, data: await sharp(frame.data).resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer() })));
  return { job, sourceImage, frames, closeups, criticalRegion: region };
}

export function fidelityPreviewData(input: Awaited<ReturnType<typeof prepareOwnedVideoFidelity>>) {
  const dataUrl = (data: Buffer) => `data:image/jpeg;base64,${data.toString("base64")}`;
  return { sourcePreview: dataUrl(input.sourceImage.data), frames: input.frames.map(frame => ({ timestampSeconds: frame.timestampSeconds, dataUrl: dataUrl(frame.data) })),
    closeups: input.closeups.map(crop => ({ label: crop.timestampSeconds === undefined ? "source" : "video", timestampSeconds: crop.timestampSeconds ?? null, dataUrl: dataUrl(crop.data) })) };
}
