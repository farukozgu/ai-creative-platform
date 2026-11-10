import type { VideoPresetProduct } from "../video-director/preset-recommendations";
import { videoDirectorPresets, type VideoPresetId } from "../video-director/presets";
import type { VideoDirectorPlan } from "../video-director/core";
export const referenceViews = ["front", "back", "side", "detail", "unknown"] as const;
export type ReferenceView = typeof referenceViews[number];
export type ReferenceReview = { index: number; status: "matched" | "conflict" | "uncertain"; reason: string; details: string[]; view?: ReferenceView; wholeSideVisible?: boolean };
export const supportsReferenceDeclaredText = (purpose: string) => /\b(?:logo|text|label|detail)\b/i.test(purpose);
export function parseReferenceDeclaredText(value: unknown): string | null {
  if (typeof value !== "string" || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(value)) return null;
  const text = value.trim();
  return text.length <= 80 ? text : null;
}
/** User text is quoted identity data, never Director evidence or creative direction. */
export function referenceTextPreservation(reviews: ReferenceReview[], references: readonly { purpose: string; declaredText?: string }[] = [], compact = false) {
  return references.flatMap((reference, index) => {
    if (!supportsReferenceDeclaredText(reference.purpose) || !reviews.some(review => review.index === index && review.status === "matched")) return [];
    const text = parseReferenceDeclaredText(reference.declaredText);
    if (text === null || !text) return [];
    if (compact) return [`Keep ${JSON.stringify(text)} exact in shape, size and position.`];
    return [`Preserve the exact visible text ${JSON.stringify(text)}; keep spelling, character order, case, placement and proportions unchanged.`];
  }).join(" ");
}
export const backViewTerms = /\b(?:back|rear|backside|back-facing)\b/i;
/** Orientation is established by the image review, never the upload-slot label. */
export function referenceClaimDetails(review: ReferenceReview) {
  return review.details.map(detail => detail.replace(/\b(?:front|back|rear|backside|side)[ -]?(?:facing)?\b/gi, " ").replace(/\s+/g, " ").trim());
}
export const REFERENCE_SHOT_PREFIX_MAX_CHARS = 52;
/** Crops are accuracy evidence, never independently renderable Kling subjects. */
export function klingElementReferences(reviews: ReferenceReview[], references: readonly { purpose: string }[] = []) {
  return reviews.filter(review => review.status === "matched" && ["front", "back", "side"].includes(review.view ?? "")
    && !/\b(?:logo|label|text|symbol|mark|brand|emblem)\b/i.test(references[review.index]?.purpose ?? ""));
}
export function directorElementReferences(plan: VideoDirectorPlan | undefined, references: readonly { purpose: string }[] = []) {
  const matched = klingElementReferences(plan?.referenceReviews ?? [], references);
  if (!plan?.editorialStoryboard) return matched;
  return matched.filter(review => review.index === plan.shots[1]?.referenceIndex);
}

export function referenceShotPrefix(referenceIndex: number | undefined, reviews: ReferenceReview[], references: readonly { purpose: string }[] = []) {
  return elementShotPrefix(referenceIndex, klingElementReferences(reviews, references));
}

export function elementShotPrefix(referenceIndex: number | undefined, matched: ReferenceReview[]) {
  const position = matched.findIndex(review => review.index === referenceIndex);
  const view = matched[position]?.view;
  return position >= 0 && view && view !== "unknown" && view !== "detail"
    ? `@Element1: Use ${view} view from reference image ${position + 1}. ` : "@Element1: ";
}
const suggestions: Record<string, string[]> = {
  apparel: ["texture", "construction", "side"], watches: ["dial", "case", "strap"], cosmetics: ["label", "cap", "side"],
  bags: ["label", "hardware", "side"], footwear: ["sole", "side", "texture"], jewelry: ["craft", "angle", "texture"],
  furniture: ["texture", "construction", "side"], electronics: ["controls", "label", "side"], eyewear: ["frame", "hinge", "side"],
  headwear: ["texture", "construction", "side"], food: ["texture", "angle", "packaging"], "packaged-food": ["label", "packaging", "side"],
};
export function suggestProductReferences(product: VideoPresetProduct, presetId?: VideoPresetId) {
  const terms = presetId ? videoDirectorPresets[presetId].strategy.detailTerms.join(" ") : "";
  const category = suggestions[product.category] ?? ["detail", "angle", "label"];
  const priority = /label|logo/.test(terms) ? "label" : /texture|fabric|stitch|seam/.test(terms) ? "texture"
    : /dial|marker/.test(terms) ? "dial" : /hardware|clasp|zip/.test(terms) ? "hardware" : null;
  return [...new Set([...(priority && category.includes(priority) ? [priority] : []), ...category])].slice(0, 3);
}
/** Unknown identity never becomes evidence. Reviews are persisted in the signed plan. */
export function parseReferenceReviews(value: unknown, count: number, onReject?: (path: string, reason: string) => void): ReferenceReview[] | null {
  const reject = (path: string, reason: string) => { onReject?.(path, reason); return null; };
  if (!count) return value === undefined || Array.isArray(value) && !value.length ? [] : null;
  if (!Array.isArray(value) || value.length !== count) return reject("$.referenceReviews", `exactly ${count} ordered reviews`);
  const result: ReferenceReview[] = [];
  for (const [index, item] of value.entries()) {
    if (!item || item.index !== index || !["matched", "conflict", "uncertain"].includes(item.status)
      || typeof item.reason !== "string" || !item.reason.trim() || item.reason.length > 120 || !Array.isArray(item.details)
      || item.details.length > 2 || item.details.some((d: unknown) => typeof d !== "string" || !d.trim() || d.length > 70)) return reject(`$.referenceReviews[${index}]`, "ordered index, valid status, reason <=120 chars, at most two details <=70 chars");
    if (item.status !== "matched" && item.details.length) return reject(`$.referenceReviews[${index}].details`, "unverified references cannot add evidence");
    if (item.view !== undefined && !referenceViews.includes(item.view)) return reject(`$.referenceReviews[${index}].view`, "supported reference view");
    if (item.wholeSideVisible !== undefined && typeof item.wholeSideVisible !== "boolean") return reject(`$.referenceReviews[${index}].wholeSideVisible`, "boolean");
    if (item.status !== "matched" && item.view !== undefined && item.view !== "unknown") return reject(`$.referenceReviews[${index}].view`, "unverified reference view must be unknown");
    if (item.details.some((d: string) => /\b(?:leather|silk|cotton|gold|diamond|steel|interior|hidden|genuine|brand|underside)\b/i.test(d)
      || backViewTerms.test(d) && item.view !== "back")) return reject(`$.referenceReviews[${index}].details`, "no unverified materials, brands or hidden surfaces; rear details require a back view");
    result.push(item);
  }
  return result;
}
