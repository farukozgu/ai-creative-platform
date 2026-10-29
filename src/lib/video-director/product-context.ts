import type { ProductProfile } from "@/lib/product-understanding/product-profile";
import { directorIdentityEvidence } from "./identity-evidence";
import { normalizeVideoProductSubtype } from "./preset-contract";

/** Bounded reuse of the persisted profile; this never runs Product Understanding. */
export function directorProductContext(profile: ProductProfile | null) {
  const confidence = profile?.confidence?.overall ?? 0;
  const classified = confidence >= 0.6 && (profile?.confidence.fields?.vertical ?? confidence) >= 0.6;
  const evidence = directorIdentityEvidence(profile).slice(0, 24);
  const verifiedSubtype = confidence >= 0.6 && (profile?.confidence.fields?.subcategory ?? confidence) >= 0.6 ? profile?.subcategory : null;
  return {
    category: normalizeVideoProductSubtype(verifiedSubtype) ?? (classified ? profile?.vertical ?? "unknown" : "unknown"),
    productType: verifiedSubtype && verifiedSubtype.length <= 100 ? verifiedSubtype : null,
    confidence,
    rigidity: classified ? profile?.rigidity ?? "unknown" : "unknown",
    forbiddenTransformations: profile?.forbiddenTransformations ?? [],
    evidence: evidence.map((detail, id) => ({ id, detail })),
    limitations: evidence.length ? "Use only source-visible evidence; unseen sides and mechanisms are unknown."
      : "Insufficient verified detail. Recognize the category from the image, but plan around visible form without asserting materials, mechanisms or branding.",
  };
}
