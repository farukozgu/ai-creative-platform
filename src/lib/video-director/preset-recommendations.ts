import type { ProductProfile } from "@/lib/product-understanding/product-profile";
import { directorProductContext } from "./product-context";
import { normalizeVideoProductSubtype, videoCategories, type VideoCategory } from "./preset-contract";
import { videoDirectorPresets, videoPresetIds, type VideoPresetId } from "./presets";

export type VideoPresetProduct = { category: VideoCategory | "unknown"; evidence: string[] };
export const unknownPresetProduct: VideoPresetProduct = { category: "unknown", evidence: [] };

/** Existing profile only; this never runs vision or promotes a user's category filter to a fact. */
export function presetProduct(profile: ProductProfile | null): VideoPresetProduct {
  const context = directorProductContext(profile);
  const confidence = profile?.confidence?.overall ?? 0;
  // Video-only refinement of a confident persisted subtype; do not expand the DB taxonomy.
  const type = confidence >= 0.7 && (profile?.confidence.fields?.subcategory ?? confidence) >= 0.7
    ? profile?.subcategory?.toLowerCase() ?? "" : "";
  const category = normalizeVideoProductSubtype(type)
    ?? videoCategories.find(category => category === context.category) ?? "unknown";
  return { category, evidence: context.evidence.map(item => item.detail) };
}

export function recommendVideoPresets(product: VideoPresetProduct): VideoPresetId[] {
  return videoPresetIds.map((id, order) => {
    const strategy = videoDirectorPresets[id].strategy;
    const relevant = strategy.categories.length === 0 || strategy.categories.includes(product.category as VideoCategory);
    const matches = product.evidence.some(detail => strategy.detailTerms.some(term => detail.toLowerCase().includes(term)));
    const categoryScore = strategy.categories.length && relevant ? 20 : relevant ? 3 : -10;
    return { id, order, score: categoryScore + (relevant && matches ? 6 : 0) };
  }).filter(item => item.score >= 0).sort((a, b) => b.score - a.score || a.order - b.order).slice(0, 6).map(item => item.id);
}

export function presetFocusEvidence(id: VideoPresetId, evidence: { id: number; detail: string }[]) {
  const terms = videoDirectorPresets[id].strategy.detailTerms;
  return evidence.filter(item => item.detail.length <= 80).map(item => ({ ...item,
    score: terms.reduce((sum, term, index) => sum + (item.detail.toLowerCase().includes(term) ? terms.length - index : 0), 0),
  })).filter(item => item.score > 0).sort((a, b) => b.score - a.score)[0];
}
