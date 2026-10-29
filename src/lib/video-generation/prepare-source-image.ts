import sharp from "sharp";
import type { VideoGenerationAspectRatio } from "./types";

export const videoSourceFrameSizes = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
} satisfies Record<VideoGenerationAspectRatio, { width: number; height: number }>;

export type VideoImageTransformDiagnostic = {
  step: "metadata" | "edge_sample" | "frame_render";
  sharpFormat: string | null;
  pageCount: number | null;
  rejectionReason: "metadata_error" | "missing_dimensions" | "unsupported_format" | "multiple_pages" | null;
  inputMimeType: string | null;
  width: number | null;
  height: number | null;
  targetAspectRatio: VideoGenerationAspectRatio;
  sharpCode: string | null;
};

export class VideoImageTransformError extends Error {
  constructor(readonly diagnostic: VideoImageTransformDiagnostic) {
    super("Video source image could not be transformed.");
    this.name = "VideoImageTransformError";
  }
}

export function getSafeVideoImageTransformDiagnostic(error: unknown) {
  if (!(error instanceof VideoImageTransformError)) return null;
  return { ...error.diagnostic };
}

function safeSharpCode(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : null;
  return typeof code === "string" && /^[A-Z0-9_.-]{1,64}$/i.test(code) ? code : null;
}

export function isAvifImage(bytes: Buffer) {
  if (bytes.length < 12 || bytes.toString("ascii", 4, 8) !== "ftyp") return false;
  const brand = bytes.toString("ascii", 8, 12);
  if (brand === "avif" || brand === "avis") return true;
  for (let offset = 16; offset + 4 <= Math.min(bytes.length, 64); offset += 4) {
    const compatibleBrand = bytes.toString("ascii", offset, offset + 4);
    if (compatibleBrand === "avif" || compatibleBrand === "avis") return true;
  }
  return false;
}

function mimeTypeForFormat(format: string | undefined, bytes: Buffer) {
  if (format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  if (format === "heif" && isAvifImage(bytes)) return "image/avif";
  return null;
}

/** Bounded decoding; preserves source proportions, with edge-colour padding and no crop. */
export async function prepareVideoSourceImage(bytes: Buffer, aspectRatio: VideoGenerationAspectRatio) {
  if (!bytes.length || bytes.length > 25 * 1024 * 1024 || !Object.hasOwn(videoSourceFrameSizes, aspectRatio)) throw new Error("Invalid video source.");
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 }).metadata();
  } catch (error) {
    throw new VideoImageTransformError({ step: "metadata", sharpFormat: null, pageCount: null, rejectionReason: "metadata_error", inputMimeType: null,
      width: null, height: null, targetAspectRatio: aspectRatio, sharpCode: safeSharpCode(error) });
  }
  const inputMimeType = mimeTypeForFormat(metadata.format, bytes);
  const diagnostic = (step: VideoImageTransformDiagnostic["step"], error: unknown): VideoImageTransformError => new VideoImageTransformError({
    step, sharpFormat: metadata.format ?? null, pageCount: metadata.pages ?? 1, rejectionReason: null, inputMimeType,
    width: metadata.width ?? null, height: metadata.height ?? null, targetAspectRatio: aspectRatio, sharpCode: safeSharpCode(error),
  });
  if (!metadata.width || !metadata.height || !inputMimeType || (metadata.pages ?? 1) !== 1) {
    const rejectionReason = !metadata.width || !metadata.height ? "missing_dimensions" : !inputMimeType ? "unsupported_format" : "multiple_pages";
    throw new VideoImageTransformError({ step: "metadata", sharpFormat: metadata.format ?? null, pageCount: metadata.pages ?? 1, rejectionReason,
      inputMimeType, width: metadata.width ?? null, height: metadata.height ?? null, targetAspectRatio: aspectRatio, sharpCode: null });
  }

  let data: Buffer;
  let info: { width: number; height: number; channels: number };
  try {
    ({ data, info } = await sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 }).rotate().flatten({ background: { r: 255, g: 255, b: 255 } })
      .toColourspace("srgb").resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true }));
  } catch (error) {
    throw diagnostic("edge_sample", error);
  }

  const channels: number[][] = [[], [], []];
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (x !== 0 && y !== 0 && x !== info.width - 1 && y !== info.height - 1) continue;
    for (let c = 0; c < 3; c++) channels[c].push(data[(y * info.width + x) * info.channels + c]);
  }
  const median = channels.map(values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]);
  const background = { r: median[0], g: median[1], b: median[2] };
  const dimensions = videoSourceFrameSizes[aspectRatio];
  let image: Buffer;
  try {
    image = await sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 }).rotate().flatten({ background }).toColourspace("srgb")
      .resize({ ...dimensions, fit: "contain", position: "centre", background })
      .png({ compressionLevel: 6 }).toBuffer();
  } catch (error) {
    throw diagnostic("frame_render", error);
  }
  return { image, ...dimensions, mimeType: "image/png" as const };
}
