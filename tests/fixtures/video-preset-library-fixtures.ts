import type { ProductProfile } from "../../src/lib/product-understanding/product-profile";
import type { VideoCategory } from "../../src/lib/video-director/preset-contract";
import type { VideoPresetId } from "../../src/lib/video-director/presets";
import { directorProducts } from "./video-director-fixtures";

/** Synthetic persisted-subtype compatibility cases. Not real image analyses.
 * A weak coarse vertical and strong subtype exercise video-only refinement without DB changes.
 */
function subtype(name: string, shape: string, attributes: string[], categoryBase = directorProducts[0]): ProductProfile {
  return { ...structuredClone(categoryBase), productId: `fixture-${name}`, subcategory: name, productShape: shape,
    materials: [], dominantColors: [], identityCriticalAttributes: attributes.map(attribute => ({ attribute, rationale: "fixture visible evidence", regions: [] })),
    confidence: { overall: 0.95, fields: { vertical: 0.2, subcategory: 0.95 } },
    visibleBranding: { hasLogo: false, hasReadableText: false, hasArtwork: false, logoRegions: [], textRegions: [], artworkRegions: [] },
    verticalAttributes: { vertical: "apparel", details: { garmentType: name, primaryColor: null, artworkOrLogoLocations: [], closures: [], pocketStructure: [], hoodOrCollar: null, constructionDetails: [], identitySides: [] } },
  };
}
export const libraryFixtures: { name: string; category: VideoCategory | "unknown"; profile: ProductProfile | null; presetId: VideoPresetId }[] = [
  { name: "Ceket", category: "apparel", profile: directorProducts[0], presetId: "floating-fashion" },
  { name: "Kot", category: "apparel", profile: { ...subtype("denim shorts", "shorts silhouette", ["visible hem stitching", "denim weave"]), confidence: { overall: 0.95 } }, presetId: "macro-stitching" },
  { name: "Tişört", category: "apparel", profile: { ...subtype("tee shirt", "shirt silhouette", ["ribbed collar seam", "woven fabric texture"]), confidence: { overall: 0.95 } }, presetId: "fabric-motion" },
  { name: "Çanta", category: "bags", profile: directorProducts[4], presetId: "hardware-reveal" },
  { name: "Saat", category: "watches", profile: directorProducts[2], presetId: "cinematic-dial" },
  { name: "Takı", category: "jewelry", profile: directorProducts[3], presetId: "precision-macro" },
  { name: "Parfüm", category: "cosmetics", profile: directorProducts[1], presetId: "glass-reflection" },
  { name: "Ayakkabı", category: "footwear", profile: directorProducts[5], presetId: "sneaker-hero" },
  { name: "Şapka", category: "headwear", profile: subtype("baseball cap", "curved brim silhouette", ["visible brim stitching", "front fabric panel"]), presetId: "macro-stitching" },
  { name: "Gözlük", category: "eyewear", profile: subtype("optical glasses", "curved frame silhouette", ["visible frame edge", "front hinge line"]), presetId: "optical-lines" },
  { name: "Mobilya", category: "furniture", profile: subtype("armchair", "wide chair outline", ["woven upholstery texture", "visible edge seam"]), presetId: "upholstery-macro" },
  { name: "Yiyecek", category: "food", profile: subtype("cake", "round food silhouette", ["visible layered surface", "textured top surface"]), presetId: "culinary-texture" },
  { name: "Paketli gıda", category: "packaged-food", profile: subtype("beverage can", "cylindrical container geometry", ["front label outline", "visible container edge"]), presetId: "label-reveal" },
  { name: "Elektronik", category: "electronics", profile: subtype("headphones", "curved housing silhouette", ["visible control button", "housing edge detail"]), presetId: "precision-macro" },
  { name: "Belirsiz profil", category: "unknown", profile: null, presetId: "cinematic-hero" },
];
