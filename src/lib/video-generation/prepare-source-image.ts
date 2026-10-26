import sharp from "sharp";
import type { VideoGenerationAspectRatio } from "./types";

export const videoSourceFrameSizes = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
} satisfies Record<VideoGenerationAspectRatio, { width: number; height: number }>;

/** Bounded decoding; the original bytes are never modified. Padding uses the median edge colour. */
export async function prepareVideoSourceImage(bytes: Buffer, aspectRatio: VideoGenerationAspectRatio) {
  if (!bytes.length || bytes.length > 25 * 1024 * 1024 || !Object.hasOwn(videoSourceFrameSizes, aspectRatio)) throw new Error("Invalid video source.");
  const input = sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 });
  const metadata = await input.metadata();
  if (!metadata.width || !metadata.height || !["jpeg", "png"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1) throw new Error("Unsupported video source.");
  const { data, info } = await input.clone().rotate().flatten({ background: { r: 255, g: 255, b: 255 } })
    .toColourspace("srgb").resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const channels: number[][] = [[], [], []];
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (x !== 0 && y !== 0 && x !== info.width - 1 && y !== info.height - 1) continue;
    for (let c = 0; c < 3; c++) channels[c].push(data[(y * info.width + x) * info.channels + c]);
  }
  const median = channels.map(values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]);
  const background = { r: median[0], g: median[1], b: median[2] };
  const dimensions = videoSourceFrameSizes[aspectRatio];
  const image = await input.clone().rotate().flatten({ background }).toColourspace("srgb")
    .resize({ ...dimensions, fit: "contain", position: "centre", background })
    .png({ compressionLevel: 6 }).toBuffer();
  return { image, ...dimensions, mimeType: "image/png" as const };
}
