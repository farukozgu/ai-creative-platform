import type { ApparelArtworkIdentitySource } from "@/lib/generation/types";
import { attachOpenAIResponseTelemetry } from "@/lib/openai/response-telemetry";

async function getSharp() {
  const sharpModule = await import("sharp");
  return sharpModule.default;
}

export type ArtworkLocalization = {
  detected: boolean;
  side: "front" | "back" | "unknown";
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  confidence: number;
  containsText: boolean;
  multipleRegions: boolean;
};

const schema = {
  type: "object", additionalProperties: false,
  required: ["detected", "side", "boundingBox", "confidence", "containsText", "multipleRegions"],
  properties: {
    detected: { type: "boolean" }, side: { type: "string", enum: ["front", "back", "unknown"] },
    boundingBox: { type: ["object", "null"], additionalProperties: false, required: ["x", "y", "width", "height"], properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } } },
    confidence: { type: "number" }, containsText: { type: "boolean" }, multipleRegions: { type: "boolean" },
  },
} as const;

export function isValidNormalizedBox(box: ArtworkLocalization["boundingBox"]): box is NonNullable<ArtworkLocalization["boundingBox"]> {
  return Boolean(box && [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0 && box.x + box.width <= 1 && box.y + box.height <= 1);
}

export async function localizeApparelArtwork(data: Buffer): Promise<ArtworkLocalization | null> {
  try {
    const { getOpenAIClient } = await import("@/lib/openai/client");
    const { structuredResponseText } = await import("@/lib/openai/structured-response");
    const { getReferenceAnalysisModel } = await import("@/lib/generation/references/reference-analysis");
    const response = await getOpenAIClient().responses.create({
      model: getReferenceAnalysisModel(), store: false, max_output_tokens: 300,
      instructions: "Locate meaningful printed artwork on this apparel image only. Do not describe, transcribe, recreate, or interpret the design. Return whether meaningful artwork exists, garment side (front/back/unknown), one normalized bounding box containing all visible artwork (union if multiple separated regions), confidence from 0 to 1, visible text presence, and whether multiple separated regions exist. Coordinates are normalized to the full image, origin top-left. Return detected=false and null box if no artwork.",
      input: [{ role: "user", content: [{ type: "input_image", image_url: `data:image/png;base64,${data.toString("base64")}`, detail: "high" }] }],
      text: structuredResponseText({ type: "json_schema", name: "apparel_artwork_localization_v2", description: "Artwork localization only", schema, strict: true }),
    });
    const parsed = JSON.parse(response.output_text ?? "") as ArtworkLocalization;
    if (typeof parsed.detected !== "boolean" || !["front", "back", "unknown"].includes(parsed.side) || !Number.isFinite(parsed.confidence) || parsed.confidence < 0 || parsed.confidence > 1 || typeof parsed.containsText !== "boolean" || typeof parsed.multipleRegions !== "boolean") return null;
    if (!parsed.detected) return attachOpenAIResponseTelemetry({ ...parsed, boundingBox: null }, response);
    return isValidNormalizedBox(parsed.boundingBox) ? attachOpenAIResponseTelemetry(parsed, response) : null;
  } catch {
    return null;
  }
}

/** Safe, deterministic 8% padding, clamped to image bounds. Crop bytes come only from source pixels. */
export async function createApparelArtworkCrop(input: { data: Buffer; assetId: string; side: ArtworkLocalization["side"]; boundingBox: NonNullable<ArtworkLocalization["boundingBox"]>; confidence: number; containsText: boolean; detected?: boolean }): Promise<{ data: Buffer; mimeType: "image/png"; identitySource: ApparelArtworkIdentitySource } | null> {
  try {
    if (input.detected === false) return null;
    if (!isValidNormalizedBox(input.boundingBox)) return null;
    const sharp = await getSharp();
    const metadata = await sharp(input.data, { limitInputPixels: 50_000_000 }).metadata();
    if (!metadata.width || !metadata.height) return null;
    const sourceWidth = metadata.width, sourceHeight = metadata.height;
    const left = Math.max(0, Math.floor(input.boundingBox.x * sourceWidth - input.boundingBox.width * sourceWidth * 0.08));
    const top = Math.max(0, Math.floor(input.boundingBox.y * sourceHeight - input.boundingBox.height * sourceHeight * 0.08));
    const right = Math.min(sourceWidth, Math.ceil((input.boundingBox.x + input.boundingBox.width * 1.08) * sourceWidth));
    const bottom = Math.min(sourceHeight, Math.ceil((input.boundingBox.y + input.boundingBox.height * 1.08) * sourceHeight));
    const width = right - left, height = bottom - top;
    if (width < 1 || height < 1) return null;
    const data = await sharp(input.data, { limitInputPixels: 50_000_000 }).extract({ left, top, width, height }).png().toBuffer();
    return { data, mimeType: "image/png", identitySource: { assetId: input.assetId, side: input.side, source: "detected_crop", boundingBox: input.boundingBox, cropMetadata: { sourceWidth, sourceHeight, left, top, width, height }, confidence: input.confidence, containsText: input.containsText, identityCritical: input.containsText } };
  } catch { return null; }
}
