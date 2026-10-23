import sharp from "sharp";

type ImageInputData = Blob | Buffer;

export type ImageInputDecodeStage = "metadata" | "pixels";

export type ImageInputDecodeReason =
  | "corrupt_or_truncated"
  | "input_pixel_limit"
  | "unsupported_codec_or_format"
  | "unknown";

export class ImageInputDecodeError extends Error {
  readonly reason: ImageInputDecodeReason;
  readonly stage: ImageInputDecodeStage;

  constructor(stage: ImageInputDecodeStage, reason: ImageInputDecodeReason) {
    super("The uploaded image cannot be decoded. Please upload a valid JPEG, PNG, or WebP file.");
    this.name = "ImageInputDecodeError";
    this.stage = stage;
    this.reason = reason;
  }
}

export type NormalizedImageInput = {
  data: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};

const supportedFormats = new Set(["jpeg", "png", "webp"]);
const maxInputPixels = 24_000_000;

function classifyImageInputDecodeFailure(error: unknown): ImageInputDecodeReason {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("pixel limit")) return "input_pixel_limit";
  if (
    message.includes("unsupported") ||
    message.includes("not supported") ||
    message.includes("invalid input") ||
    message.includes("unknown image format")
  ) {
    return "unsupported_codec_or_format";
  }
  if (
    message.includes("premature end") ||
    message.includes("corrupt") ||
    message.includes("bad seek") ||
    message.includes("truncated")
  ) {
    return "corrupt_or_truncated";
  }

  return "unknown";
}

export function getImageInputDecodeDiagnostic(error: unknown): {
  errorClass: string;
  reason: ImageInputDecodeReason;
  stage: ImageInputDecodeStage | "unknown";
} {
  if (error instanceof ImageInputDecodeError) {
    return { errorClass: error.name, stage: error.stage, reason: error.reason };
  }

  return { errorClass: error instanceof Error ? error.name : "unknown", stage: "unknown", reason: "unknown" };
}

function mimeTypeForFormat(format: "jpeg" | "png" | "webp"): NormalizedImageInput["mimeType"] {
  return format === "jpeg" ? "image/jpeg" : `image/${format}`;
}

async function readImageMetadata(source: Buffer) {
  try {
    const metadata = await sharp(source, { failOn: "none", limitInputPixels: maxInputPixels, sequentialRead: true }).metadata();
    if (!metadata.format) throw new ImageInputDecodeError("metadata", "unsupported_codec_or_format");
    return metadata;
  } catch (error) {
    if (error instanceof ImageInputDecodeError) throw error;
    throw new ImageInputDecodeError("metadata", classifyImageInputDecodeFailure(error));
  }
}

/**
 * Validates actual image bytes rather than trusting upload MIME metadata.
 * Raw output forces libvips to decode every source pixel while the input-pixel
 * cap prevents an upload from allocating an unbounded decoded raster.
 */
export async function assertImageInputDecodable(data: ImageInputData): Promise<void> {
  const source = Buffer.isBuffer(data) ? data : Buffer.from(await data.arrayBuffer());
  await readImageMetadata(source);
  try {
    await sharp(source, { failOn: "warning", limitInputPixels: maxInputPixels, sequentialRead: true })
      .rotate()
      .raw()
      .toBuffer();
  } catch (error) {
    throw new ImageInputDecodeError("pixels", classifyImageInputDecodeFailure(error));
  }
}

/** Returns the decoded format so upload registration can reject MIME spoofing. */
export async function getDecodedImageMimeType(data: ImageInputData): Promise<NormalizedImageInput["mimeType"]> {
  const source = Buffer.isBuffer(data) ? data : Buffer.from(await data.arrayBuffer());
  const metadata = await readImageMetadata(source);
  if (!metadata.format || !supportedFormats.has(metadata.format)) throw new ImageInputDecodeError("metadata", "unsupported_codec_or_format");
  await assertImageInputDecodable(source);
  return mimeTypeForFormat(metadata.format as "jpeg" | "png" | "webp");
}

export async function normalizeImageInputForOpenAI(
  data: ImageInputData,
  fallbackMimeType: string,
): Promise<NormalizedImageInput> {
  const source = Buffer.isBuffer(data) ? data : Buffer.from(await data.arrayBuffer());
  const metadata = await readImageMetadata(source);
  const format = metadata.format;

  if (format && supportedFormats.has(format)) {
    return {
      data: source,
      mimeType: mimeTypeForFormat(format as "jpeg" | "png" | "webp"),
    };
  }

  let png: Buffer;
  try {
    png = await sharp(source, { failOn: "none", limitInputPixels: maxInputPixels, sequentialRead: true }).rotate().png().toBuffer();
  } catch {
    throw new ImageInputDecodeError("pixels", "unknown");
  }
  if (png.length === 0) {
    throw new Error(`Unable to normalize image input (${fallbackMimeType || "unknown"}).`);
  }

  return { data: png, mimeType: "image/png" };
}
