import "server-only";

import sharp from "sharp";
import { sampleVideoFrameTimestamps } from "./sampling";
import type { VideoFidelityFrameInput } from "./types";

export const VIDEO_FIDELITY_MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const maxEncodedImageBytes = 900 * 1024;
const allowedSourceMimeTypes = new Set(["image/jpeg", "image/png"]);

type EncodedImage = { dataUrl: string; timestampSeconds?: number };

function decodeDataUrl(value: unknown, mimeTypes: ReadonlySet<string>): { data: Buffer; mimeType: string } | null {
  if (typeof value !== "string" || value.length > maxEncodedImageBytes * 1.4) return null;
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || !mimeTypes.has(match[1])) return null;
  const data = Buffer.from(match[2], "base64");
  if (data.length <= 0 || data.length > maxEncodedImageBytes || data.toString("base64") !== match[2]) return null;
  return { data, mimeType: match[1] };
}

async function normalizeImage(value: unknown, mimeTypes: ReadonlySet<string>) {
  const decoded = decodeDataUrl(value, mimeTypes);
  if (!decoded) return null;
  try {
    const image = sharp(decoded.data, { failOn: "error", limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    const expectedFormat = decoded.mimeType === "image/jpeg" ? "jpeg" : "png";
    if (metadata.format !== expectedFormat || !metadata.width || !metadata.height || metadata.width > 8192 || metadata.height > 8192 || (metadata.pages ?? 1) !== 1) return null;
    return {
      data: await image.rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer(),
      mimeType: "image/jpeg" as const,
    };
  } catch {
    return null;
  }
}

export async function prepareVideoFidelitySourcePreview(input: { data: Buffer; mimeType: string }) {
  if (!allowedSourceMimeTypes.has(input.mimeType) || input.data.length <= 0 || input.data.length > 25 * 1024 * 1024) return null;
  try {
    const image = sharp(input.data, { failOn: "error", limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    const expectedFormat = input.mimeType === "image/jpeg" ? "jpeg" : "png";
    if (metadata.format !== expectedFormat || !metadata.width || !metadata.height || metadata.width > 8192 || metadata.height > 8192 || (metadata.pages ?? 1) !== 1) return null;
    let preview = await image.clone().rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
    if (preview.length > maxEncodedImageBytes) {
      preview = await image.clone().rotate().resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 68, mozjpeg: true }).toBuffer();
    }
    return preview.length <= maxEncodedImageBytes ? { data: preview, mimeType: "image/jpeg" as const } : null;
  } catch {
    return null;
  }
}

export async function prepareVideoFidelityRequest(value: unknown, durationSeconds: number): Promise<{ source: { data: Buffer; mimeType: string }; frames: VideoFidelityFrameInput[] } | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const sourceInput = input.source as EncodedImage | undefined;
  if (!sourceInput || typeof sourceInput !== "object") return null;
  const source = await normalizeImage(sourceInput.dataUrl, allowedSourceMimeTypes);
  if (!source) return null;

  if (!Array.isArray(input.frames) || input.frames.length !== 5) return null;
  const expectedTimes = sampleVideoFrameTimestamps(durationSeconds);
  if (expectedTimes.length !== 5) return null;
  const frames: VideoFidelityFrameInput[] = [];
  for (let index = 0; index < input.frames.length; index += 1) {
    const frame = input.frames[index] as EncodedImage | null;
    const expectedTime = expectedTimes[index];
    if (!frame || typeof frame !== "object" || typeof frame.timestampSeconds !== "number" || !Number.isFinite(frame.timestampSeconds)
      || Math.abs(frame.timestampSeconds - expectedTime) > 0.3) return null;
    const prepared = await normalizeImage(frame.dataUrl, new Set(["image/jpeg"]));
    if (!prepared) return null;
    frames.push({ timestampSeconds: Math.round(frame.timestampSeconds * 10) / 10, data: prepared.data });
  }
  return { source, frames };
}
