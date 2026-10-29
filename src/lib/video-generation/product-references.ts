import type { VideoPresetProduct } from "../video-director/preset-recommendations";
import { videoDirectorPresets, type VideoPresetId } from "../video-director/presets";
export type ReferenceReview = { index: number; status: "matched" | "conflict" | "uncertain"; reason: string; details: string[] };
const suggestions: Record<string, string[]> = {
  apparel: ["texture", "construction", "side"], watches: ["dial", "case", "strap"], cosmetics: ["label", "cap", "side"],
  bags: ["label", "hardware", "side"], footwear: ["sole", "side", "texture"], jewelry: ["craft", "angle", "texture"],
  furniture: ["texture", "construction", "side"], electronics: ["controls", "label", "side"], eyewear: ["frame", "hinge", "side"],
  headwear: ["texture", "construction", "side"], food: ["texture", "angle", "packaging"], "packaged-food": ["label", "packaging", "side"],
};
export function suggestProductReferences(product: VideoPresetProduct, presetId: VideoPresetId) {
  const terms = videoDirectorPresets[presetId].strategy.detailTerms.join(" ");
  const category = suggestions[product.category] ?? ["detail", "angle", "label"];
  const priority = /label|logo/.test(terms) ? "label" : /texture|fabric|stitch|seam/.test(terms) ? "texture"
    : /dial|marker/.test(terms) ? "dial" : /hardware|clasp|zip/.test(terms) ? "hardware" : null;
  return [...new Set([...(priority && category.includes(priority) ? [priority] : []), ...category])].slice(0, 3);
}
/** Unknown identity never becomes evidence. Reviews are persisted in the signed plan. */
export function parseReferenceReviews(value: unknown, count: number): ReferenceReview[] | null {
  if (!count) return value === undefined || Array.isArray(value) && !value.length ? [] : null;
  if (!Array.isArray(value) || value.length !== count) return null;
  const result: ReferenceReview[] = [];
  for (const [index, item] of value.entries()) {
    if (!item || item.index !== index || !["matched", "conflict", "uncertain"].includes(item.status)
      || typeof item.reason !== "string" || !item.reason.trim() || item.reason.length > 120 || !Array.isArray(item.details)
      || item.details.length > 2 || item.details.some((d: unknown) => typeof d !== "string" || !d.trim() || d.length > 70)) return null;
    if (item.status !== "matched" && item.details.length) return null;
    if (item.details.some((d: string) => /\b(?:leather|silk|cotton|gold|diamond|steel|rear|interior|hidden|genuine|brand)\b/i.test(d))) return null;
    result.push(item);
  }
  return result;
}
