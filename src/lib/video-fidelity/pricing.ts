/** Official gpt-4o-mini pricing/vision rules checked 2026-10-26. Fail closed after expiry.
 * https://developers.openai.com/api/docs/models/gpt-4o-mini
 * https://developers.openai.com/api/docs/guides/images-vision#tile-based-image-tokenization
 */
export const VIDEO_ANALYSIS_MODEL = "gpt-4o-mini" as const;
export const VIDEO_ANALYSIS_PRICING_VERSION = "gpt-4o-mini-2026-10-26";
export const VIDEO_ANALYSIS_MAX_OUTPUT_TOKENS = 2200;
export const VIDEO_ANALYSIS_MAX_TEXT_BYTES = 16_000;
export type VisionImageSize = { width: number; height: number; detail: "low" | "high" };
export function miniVisionTokens(image: VisionImageSize) {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || image.width > 1024 || image.height > 1024) throw new Error("Unpriced image dimensions.");
  if (image.detail === "low") return 2833;
  const scale = Math.min(1, 768 / Math.min(image.width, image.height));
  return 2833 + 5667 * Math.ceil(Math.floor(image.width * scale) / 512) * Math.ceil(Math.floor(image.height * scale) / 512);
}
export function quoteVideoFidelity(hasRegion: boolean, now = Date.now()) {
  if (now < Date.parse("2026-10-26T00:00:00Z") || now >= Date.parse("2026-11-26T00:00:00Z")) return null;
  const images: VisionImageSize[] = Array.from({ length: 6 }, () => ({ width: 1024, height: 1024, detail: "low" }));
  if (hasRegion) images.push(...Array.from({ length: 3 }, () => ({ width: 1024, height: 1024, detail: "high" as const })));
  const inputTokenLimit = images.reduce((sum, image) => sum + miniVisionTokens(image), VIDEO_ANALYSIS_MAX_TEXT_BYTES);
  // 0.15 USD input / 0.60 USD output per million. Integer microdollars; always round up.
  const micros = (BigInt(inputTokenLimit) * BigInt(15) + BigInt(VIDEO_ANALYSIS_MAX_OUTPUT_TOKENS) * BigInt(60) + BigInt(99)) / BigInt(100);
  return { model: VIDEO_ANALYSIS_MODEL, pricingVersion: VIDEO_ANALYSIS_PRICING_VERSION, maximumEstimatedCostUsd: Number(micros) / 1_000_000, inputTokenLimit, maximumImages: images.length };
}
