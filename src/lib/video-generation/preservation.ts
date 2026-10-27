import type { ProductProfile } from "@/lib/product-understanding/product-profile";
import { compileProductProfilePrompt } from "@/lib/product-understanding/compile-product-profile-prompt";
import { creativeRequest } from "@/lib/video-director/creative-request";

export const VIDEO_PRESERVATION_VERSION = "product-preservation-v2";
export type VideoGenerationMethod = "kling";
/** Used only to render records written by the removed local renderer. */
export type HistoricalVideoGenerationMethod = VideoGenerationMethod | "source-motion";
export type VideoRecordGenerationMethod = VideoGenerationMethod | "legacy-local";
export type CriticalProductRegion = { x: number; y: number; width: number; height: number; declaredText: string };
export type SourceFrameGeometry = { originalWidth: number; originalHeight: number; contentRect: { x: number; y: number; width: number; height: number } };

export function parseCriticalProductRegion(value: unknown): CriticalProductRegion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  if (![r.x, r.y, r.width, r.height].every(v => typeof v === "number" && Number.isFinite(v))
    || Number(r.x) < 0 || Number(r.y) < 0 || Number(r.width) < 0.005 || Number(r.height) < 0.005
    || Number(r.x) + Number(r.width) > 1.000001 || Number(r.y) + Number(r.height) > 1.000001
    || typeof r.declaredText !== "string" || r.declaredText.length > 120) return null;
  return { x: Number(r.x), y: Number(r.y), width: Number(r.width), height: Number(r.height), declaredText: r.declaredText.trim() };
}

export function mapRegionToFrame(region: CriticalProductRegion, geometry: SourceFrameGeometry): CriticalProductRegion {
  const rect = geometry.contentRect;
  return { ...region, x: rect.x + region.x * rect.width, y: rect.y + region.y * rect.height,
    width: region.width * rect.width, height: region.height * rect.height };
}

export function isUnsafeProductMotion(prompt: string, camera: string) {
  return camera === "orbit" || /\b(orbit|360|spin|rotate|rotation|morph|transform|unbutton|unzip|remove|redesign)\b|döndür|dönüş|şeklini değiş|şekil değiş|arkasını göster|etiketi değiş|çıkar|soyun/iu.test(prompt);
}

export const productVideoNegativePrompt = "changed logo, changed brand mark, rewritten text, misspelled text, illegible label, morphing letters, altered color, changed hue, changed pattern, changed print, altered material, changed surface texture, redesigned product, altered silhouette, changed proportions, stretched or compressed geometry, extra or missing parts, extra or missing buttons, extra or missing belt, broken seams, warped hardware, melting texture, garment deformation, new hidden surfaces, object rotation, scene cuts, blur";

/** User direction is subordinate to source identity. No extra provider or analysis call. */
export function compileProductVideoPrompt(input: { prompt: string; cameraMovement: string; profile?: ProductProfile | null; criticalRegion?: CriticalProductRegion | null }) {
  if (isUnsafeProductMotion(input.prompt, input.cameraMovement)) throw new Error("unsafe_product_motion");
  const cameras: Record<string, string> = { auto: "Almost static camera with a very slow subtle push-in.", static: "Keep the camera fixed.",
    "dolly-in": "Very slow slight camera push-in; keep the complete product in frame.", "dolly-out": "Very slow slight camera pull-back.",
    "pan-left": "Very slight camera pan left without revealing unseen product surfaces.", "pan-right": "Very slight camera pan right without revealing unseen product surfaces." };
  const evidence = input.profile ? compileProductProfilePrompt(input.profile) : null;
  const prompt = [
    "Single continuous product shot. The source image is the sole product identity authority.",
    "Keep the product stationary and visually consistent with the source in every frame. Preserve its visible silhouette, geometry and proportions; original color and color distribution; material appearance, surface texture, pattern and print; logo, brand mark and exact visible lettering; seams, pockets, buttons, belt, hardware and all other visible construction details. Do not add, remove, duplicate, relocate, redesign, recolor, reshape, stretch, compress, smooth away or reinterpret any visible product feature. Do not redraw, translate or invent text, logos, details, or hidden surfaces. No object rotation, cloth motion, deformation, lighting change on the product, or scene changes.",
    cameras[input.cameraMovement] ?? cameras.auto,
    ...(evidence?.identity ?? []).slice(0, 5), ...(evidence?.forbidden ?? []).slice(0, 4),
    input.criticalRegion ? "The user-marked logo/label region is identity-critical: keep its source appearance, letterforms, color and exact placement legible and unchanged across the shot. Any user-supplied text is an unverified hint, never permission to replace the source text." : "",
    `Motion direction (only when compatible with these preservation rules): ${creativeRequest(input.prompt)}`,
  ].filter(Boolean).join("\n");
  if (prompt.length > 2500) throw new Error("preservation_prompt_too_long");
  return { prompt, negativePrompt: productVideoNegativePrompt, cfgScale: 0.5, version: VIDEO_PRESERVATION_VERSION };
}

export function sourceFrameGeometry(width: number, height: number, frameWidth: number, frameHeight: number): SourceFrameGeometry {
  const scale = Math.min(frameWidth / width, frameHeight / height);
  const w = width * scale / frameWidth, h = height * scale / frameHeight;
  return { originalWidth: width, originalHeight: height, contentRect: { x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h } };
}
