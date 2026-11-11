import type { ProductProfile } from "@/lib/product-understanding/product-profile";
import { normalizeVideoProductSubtype } from "../video-director/preset-contract";
import type { ReferenceReview } from "./product-references";
import { isCreativeSafeD1Side } from "../video-director/five-second-multi";

export const additionalProductReferenceRoles = ["dial-detail", "side-profile", "critical-detail", "label-branding-detail", "other-product-view"] as const;
export type AdditionalProductReferenceRole = typeof additionalProductReferenceRoles[number];
export type ProductReferencePolicy = "watch" | "jewelry" | "cosmetics";
export const isAdditionalProductReferenceRole = (purpose: string): purpose is AdditionalProductReferenceRole =>
  additionalProductReferenceRoles.some(role => role === purpose);

export function usesEditorialStoryboard(input: { presetId: string; shotMode: string; draft: { durationSeconds: number } }) {
  return input.shotMode === "multi" && input.draft.durationSeconds === 10
    && (input.presetId === "minimal-studio" || input.presetId === "metallic-light-sweep");
}

export const isEditorialSideRole = (purpose: string) => purpose === "side-profile" || purpose === "other-product-view";

/** Scope new role reviews before they can supply an alternate shot view. Legacy reviews pass through. */
export function scopeProductReferenceReview(review: ReferenceReview & { dialDetailVisible?: unknown }, purpose: string, editorial = false): ReferenceReview {
  const { wholeSideVisible, ...legacy } = review;
  if (editorial && isEditorialSideRole(purpose) && review.status === "matched" && review.view === "side" && wholeSideVisible === true) {
    return { ...legacy, wholeSideVisible: true };
  }
  if (editorial && purpose === "other-product-view" && review.status === "matched" && review.view === "side") {
    return { ...legacy, view: "detail" };
  }
  if (!isAdditionalProductReferenceRole(purpose) || purpose === "other-product-view") return legacy;
  const { dialDetailVisible, ...identity } = legacy;
  if (identity.status !== "matched") return identity;
  if (purpose === "dial-detail" && (dialDetailVisible !== true || identity.view !== "detail")) {
    return { ...identity, view: "unknown", details: [] };
  }
  const details = purpose === "critical-detail"
    ? identity.details.filter(detail => !/\b(?:gold|silver|diamond|gemstone|sapphire|ruby|emerald|platinum|carat|karat)\b/i.test(detail))
    : identity.details;
  return { ...identity, view: "detail", details };
}

/** D1 whole-view authority is separate from the unchanged C1 side-only contract. */
export function scopeD1ProductReferenceReview(review: ReferenceReview & { dialDetailVisible?: unknown }, purpose: string): ReferenceReview {
  if (purpose === "side-profile" || purpose === "other-product-view") {
    const { wholeSideVisible, wholeViewVisible } = review;
    const identity: ReferenceReview = { index: review.index, status: review.status, view: review.view, reason: review.reason, details: review.details };
    if (identity.status !== "matched") return identity;
    const creativeSafeSide = isCreativeSafeD1Side(review, purpose);
    if (purpose === "side-profile" && identity.view === "side" && wholeSideVisible === true) return { ...identity, wholeSideVisible: true, creativeSafeSide };
    if (purpose === "other-product-view" && ["front", "back", "side"].includes(identity.view ?? "") && wholeViewVisible === true) return { ...identity, wholeViewVisible: true, creativeSafeSide };
    return { ...identity, view: "detail", creativeSafeSide: false };
  }
  return scopeProductReferenceReview(review, purpose);
}

export function productReferencePolicy(profile: ProductProfile | null): ProductReferencePolicy | undefined {
  if (!profile) return;
  const { overall, fields } = profile.confidence;
  if (overall < 0.7 || (fields?.vertical ?? overall) < 0.7) return;
  const subtype = (fields?.subcategory ?? overall) >= 0.7 ? profile.subcategory?.trim().toLowerCase() : undefined;
  if (profile.vertical === "watches" || /^(?:watch|watches|wristwatch|timepiece)$/.test(subtype ?? "")) return "watch";
  if (normalizeVideoProductSubtype(subtype)) return;
  if (profile.vertical === "cosmetics" || /^(?:fragrance|perfume)(?: bottle)?$/.test(subtype ?? "")) return "cosmetics";
  if (profile.vertical === "jewelry") return "jewelry";
}

export function hasDialDetailReference(
  references: readonly { purpose: string; sha256: string }[] | undefined,
  primarySha256: string,
  reviews?: readonly ReferenceReview[],
) {
  return references?.some((ref, index) => ref.purpose === "dial-detail" && ref.sha256 !== primarySha256
    && (!reviews || reviews.some(review => review.index === index && review.status === "matched" && review.view === "detail"))) ?? false;
}
