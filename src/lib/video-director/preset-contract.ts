export const videoCategories = ["apparel", "bags", "watches", "headwear", "eyewear", "jewelry", "cosmetics", "footwear", "furniture", "food", "packaged-food", "electronics"] as const;
export type VideoCategory = typeof videoCategories[number];

/** Refines Product Understanding's stable verticals into Video Studio's preset taxonomy. */
export function normalizeVideoProductSubtype(subtype: string | null | undefined): VideoCategory | null {
  if (!subtype) return null;
  const refinements: Array<[VideoCategory, RegExp]> = [
    ["headwear", /\b(?:hat|cap|headwear)\b|şapka/i],
    ["eyewear", /\b(?:eyewear|glasses|spectacles|sunglasses)\b|gözlük/i],
    ["furniture", /\b(?:furniture|armchair|sofa|chair|table|seating)\b|mobilya|koltuk|sandalye/i],
    ["packaged-food", /\b(?:beverage|food packaging|beverage can|coffee tin|snack pack|packaged food)\b|paketli gıda|içecek|kahve kutusu/i],
    ["food", /\b(?:food|cake|pastry|bread|sandwich|dessert|culinary)\b|yiyecek|pasta|ekmek/i],
    ["electronics", /\b(?:electronics|phone|headphones|speaker|laptop|earbuds)\b|elektronik|telefon|kulaklık/i],
  ];
  return refinements.find(([, pattern]) => pattern.test(subtype))?.[0] ?? null;
}
export type PresetRisk = "unseen-surfaces" | "deformation" | "reflection" | "micro-detail" | "unverified-process" | "new-setting" | "mechanism" | "interaction" | "layout-change";
export type ShotPurpose = "hero-reveal" | "macro-detail" | "material-study" | "controlled-motion" | "lighting-reveal" | "final-hero";
export type Direction = { camera: string; lighting: string; composition: string; motion: string; pace: string; focus: string };
export type PresetStrategy = {
  categories: readonly VideoCategory[];
  objective: string;
  cameraStrategy: readonly [string, string, string];
  framing: readonly [string, string, string];
  lighting: string;
  tempo: string;
  detailTerms: readonly string[];
  supportedMotion: readonly string[];
  risks: readonly PresetRisk[];
  variations: Partial<Record<VideoCategory, string>>;
};
export type VideoPreset = Direction & {
  execution?: import("./duration-strategy").DurationStrategy;
  version: number; brief: string;
  shots: readonly (Direction & { purpose: ShotPurpose })[];
  strategy: PresetStrategy;
  structure: { single: string; fiveSeconds: readonly [number, number]; tenSeconds: readonly [number, number, number] };
  preservation: readonly string[];
};
export const sourcePreservation = ["Source-visible geometry and parts", "Original color, material appearance and pattern", "Exact existing marks and lettering", "Known surfaces only"];
export const sourceStructure = { single: "One coherent trajectory, resolve the selected visible feature, final hold", fiveSeconds: [2, 3], tenSeconds: [3, 4, 3] } as const;
export const riskAlternatives: Record<PresetRisk, { condition: string; alternative: string }> = {
  "unseen-surfaces": { condition: "A single image does not verify other sides", alternative: "Short lateral parallax within the visible face, never a complete turn" },
  deformation: { condition: "Movement must retain silhouette and marks", alternative: "Use moving highlights or camera travel instead of reshaping" },
  reflection: { condition: "Material and readable marks must remain unchanged", alternative: "Soft highlight over evidenced surface, no invented reflections or glass" },
  "micro-detail": { condition: "Only resolved detail from existing evidence may be enlarged", alternative: "Use a wider clear crop of visible form" },
  "unverified-process": { condition: "Production history and internal assembly are not established", alternative: "Study finished visible workmanship instead of manufacturing or exploded components" },
  "new-setting": { condition: "Do not invent a shop, pedestal or mannequin", alternative: "Use campaign framing and light in the source setting" },
  mechanism: { condition: "A visible closure does not verify operation", alternative: "Trace the existing outline without opening, dispensing or activating" },
  interaction: { condition: "Do not introduce hands or a new wearer", alternative: "Camera-led inspection of the source-visible product" },
  "layout-change": { condition: "Flat-lay does not establish an upright or airborne view", alternative: "Keep source orientation and suggest lift with a camera glide" },
};
