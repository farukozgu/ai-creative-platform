import type { ProductProfile } from "../../src/lib/product-understanding/product-profile";
import { directorProductContext } from "../../src/lib/video-director/product-context";
import { fallbackDirectorPlan, type VideoDirectorInput, type VideoDirectorPlan } from "../../src/lib/video-director/core";

const base: Pick<ProductProfile, "schemaVersion" | "analysisVersion" | "wearability" | "rigidity" | "visibleBranding"
  | "interactionTargets" | "allowedTransformations" | "forbiddenTransformations" | "sceneAffinities" | "confidence" | "source"> = {
  schemaVersion: 3, analysisVersion: "fixture", wearability: "non_wearable", rigidity: "rigid",
  visibleBranding: { hasLogo: true, hasReadableText: true, hasArtwork: false, logoRegions: [], textRegions: [], artworkRegions: [] },
  interactionTargets: ["none"], allowedTransformations: ["lighting_or_reflection_change"],
  forbiddenTransformations: ["recolor", "geometry_redesign", "logo_movement", "text_or_artwork_change"],
  sceneAffinities: { recommendedSceneTags: [], discouragedSceneTags: [] }, confidence: { overall: 0.95 },
  source: { model: "fixture-only", analysisVersion: "fixture", analyzedAt: "2026-10-28" },
};

export const directorProducts: ProductProfile[] = [
  { ...structuredClone(base), productId: "jacket", vertical: "apparel", subcategory: "belted jacket", wearability: "wearable", rigidity: "deformable",
    materials: ["glossy coated fabric"], dominantColors: ["black"], productShape: "belted jacket silhouette",
    identityCriticalAttributes: ["wide notched collar", "two visible front buttons", "front belt knot", "glossy coated fabric"].map(attribute => ({ attribute, rationale: "source-visible", regions: [] })),
    verticalAttributes: { vertical: "apparel", details: { garmentType: "jacket", primaryColor: "black", artworkOrLogoLocations: [], closures: ["two visible front buttons"], pocketStructure: [], hoodOrCollar: "wide notched collar", constructionDetails: ["front belt knot"], identitySides: ["front"] } } },
  { ...structuredClone(base), productId: "perfume", vertical: "cosmetics", subcategory: "perfume bottle",
    materials: ["clear glass"], dominantColors: ["amber"], productShape: "rectangular bottle geometry",
    identityCriticalAttributes: ["rectangular glass bottle", "flat black cap", "centered front label"].map(attribute => ({ attribute, rationale: "source-visible", regions: [] })),
    verticalAttributes: { vertical: "cosmetics", details: { packageType: "perfume", packageGeometry: "rectangular bottle geometry", containerForm: "bottle", closureOrDispenser: "cap", materialOpacity: "transparent", liquidVisibility: "visible", labelRegions: [], logoRegions: [] } } },
  { ...structuredClone(base), productId: "watch", vertical: "watches", subcategory: "wristwatch",
    materials: ["brushed steel"], dominantColors: ["silver"], productShape: "round watch case",
    identityCriticalAttributes: [{ attribute: "blue dial with visible hands", rationale: "source-visible", regions: [] }],
    verticalAttributes: { vertical: "watches", details: { caseShape: "round watch case", caseMaterialOrColor: "brushed steel", dialColor: "blue dial", bezel: null, crownSide: "not_visible", pushers: null, braceletOrStrap: "steel bracelet", indicesOrMarkers: "slim dial markers", dateWindow: null, subdials: null, dialBrandingRegions: [] } } },
  { ...structuredClone(base), productId: "ring", vertical: "jewelry", subcategory: "ring",
    materials: ["silver metal"], dominantColors: ["silver"], productShape: "slim ring silhouette",
    identityCriticalAttributes: [{ attribute: "oval center stone setting", rationale: "source-visible", regions: [] }],
    verticalAttributes: { vertical: "jewelry", details: { jewelryType: "ring", metalColorOrMaterial: "silver metal", centerStone: true, centerStoneShape: "oval center stone", centerStoneColor: null, stoneCount: null, stoneLayout: null, settingStyle: "oval center stone setting", bandOrChainStructure: "slim band", bodyPlacementTarget: "finger" } } },
  { ...structuredClone(base), productId: "bag", vertical: "bags", subcategory: "handbag",
    materials: ["pebbled leather"], dominantColors: ["brown"], productShape: "structured bag silhouette",
    identityCriticalAttributes: [{ attribute: "arched front handle", rationale: "source-visible", regions: [] }],
    verticalAttributes: { vertical: "bags", details: { bagType: "handbag", silhouette: "structured bag silhouette", proportions: null, bodyStructure: null, handleCount: 1, handleGeometry: "arched front handle", handleAttachmentPoints: [], strapCount: null, strapPlacement: [], strapWidth: null, strapLengthClass: null, closureType: "front clasp", flapOrOpeningShape: null, zipperLayout: [], pocketLayout: [], panelConstruction: [], stitchingPattern: "visible edge stitching", pipingOrEdgeTreatment: null, hardwareLayout: [], hardwareColor: null, logoOrMonogramPlacement: [], material: "pebbled leather", materialTexture: "pebbled leather grain", colorBlocking: [], patternOrPrint: null, baseShape: null, baseFeetHardware: null, chainStrap: null, decorativeCharms: [], asymmetricDetails: [] } } },
  { ...structuredClone(base), productId: "shoe", vertical: "footwear", subcategory: "sneaker",
    materials: ["woven fabric"], dominantColors: ["white"], productShape: "low shoe silhouette",
    identityCriticalAttributes: [{ attribute: "woven upper texture", rationale: "source-visible", regions: [] }],
    verticalAttributes: { vertical: "footwear", details: { shoeType: "sneaker", silhouette: "low shoe silhouette", upperMaterial: ["woven upper texture"], outsole: "visible sole edge", midsole: null, panelStructure: [], lacing: "crossed laces", tongue: null, heel: null, logoRegions: [], colorBlocking: [] } } },
];

export function directorFixtureInput(profile: ProductProfile, prompt = ""): VideoDirectorInput {
  return { profile, presetId: "luxury-fashion-film", shotMode: "multi", draft: {
    clientSubmissionId: "20000000-0000-4000-8000-000000000001", mode: "image", shotMode: "multi", prompt,
    quality: "standard", aspectRatio: "9:16", durationSeconds: 10, cameraMovement: "auto",
    source: { kind: "uploaded-image", sourceAssetId: "10000000-0000-4000-8000-000000000001" },
  } };
}

/** Authored acceptance examples, NOT a claim of a live OpenAI response. */
export function authoredDirectorExample(input: VideoDirectorInput): VideoDirectorPlan {
  const jacket = input.profile?.vertical === "apparel";
  const focuses = jacket ? ["belted jacket silhouette", "two visible front buttons", "front belt knot"]
    : ["rectangular bottle geometry", "flat black cap", "centered front label"];
  const evidence = directorProductContext(input.profile).evidence;
  return { ...fallbackDirectorPlan(input), origin: "ai",
    intent: jacket ? "Approach slowly, study visible construction, then resolve the full silhouette."
      : "Use dramatic highlights to reveal bottle geometry, then finish on the front label.",
    summary: jacket ? "A deliberate front-facing campaign reveal with a tailored detail and a complete hero finish."
      : "A sculpted packaging study with a close light reveal and a clean branded finish.",
    shots: focuses.map((focus, index) => ({ durationSeconds: [3, 4, 3][index],
      purpose: (["hero-reveal", "macro-detail", "final-hero"] as const)[index],
      evidenceRefs: [evidence.find(item => item.detail === focus)!.id], focus,
      camera: jacket ? ["Slow dolly-in from the front", "Short lateral camera glide", "Locked medium hero framing"][index]
        : ["Slow vertical camera tilt within the front view", "Locked close framing", "Slow pull-back to medium hero framing"][index],
      composition: jacket ? ["Full silhouette with negative space", "Close crop on the evidenced front detail", "Full silhouette, knot at the visual center"][index]
        : ["Centered geometry with breathing room", "Tight source-facing detail with clean margins", "Full bottle, front label facing camera"][index],
      lighting: jacket ? "Soft side light traces the existing surface" : "A narrow soft highlight travels across the front",
      motion: "Hold the source-facing pose in the light",
      pace: ["Measured opening", "Patient detail hold", "Confident final hold"][index],
    })) };
}
