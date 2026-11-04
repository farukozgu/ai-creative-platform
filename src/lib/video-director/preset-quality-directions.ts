import type { DurationStrategy } from "./duration-strategy";
import { durationStrategy } from "./duration-strategy";
import type { Direction, ShotPurpose } from "./preset-contract";

export const qualityPresetVersions = { "material-detail": 3, "macro-detail-reveal": 5, "product-spotlight": 3 } as const;
export type QualityPresetId = keyof typeof qualityPresetVersions;
type FocusRole = "texture" | "feature" | "form";
type Beat = Direction & { purpose: ShotPurpose };
type QualityDirection = DurationStrategy & { focusRoles: readonly FocusRole[]; shotGrammar: readonly string[]; evidenceDirection: string };
type Evidence = { id: number; detail: string };

export function categoryPresentationDirection(presetId: string, category: string, mode: "single" | "multi", duration: number) {
  if (!["culinary-texture", "window-display"].includes(presetId)) return null;
  const context = categoryMinimalDirection(category, mode, duration);
  const surface = categoryMaterialDirection(category, mode, duration);
  if (!context || !surface) return null;
  const culinary = presetId === "culinary-texture", long = duration === 10;
  const framing = context.shots[0].composition;
  const light = culinary ? "Soft top-side light preserves original surface colors" : "Balanced soft overhead light defines the original outline";
  const opening = culinary ? shot("material-study", "Locked close surface framing", "One verified surface or layer at source-resolved scale", light,
    mode === "single" ? long ? "Settle 2s; sensory study 6s; hold 2s" : "Settle 1s; sensory study 3s; hold 1s" : long ? "Four-second sensory surface study" : "Three-second sensory surface study")
    : shot("hero-reveal", mode === "single" ? "Slow long-lens push-in within the source view" : "Locked long-lens product overview", framing, light,
      mode === "single" ? long ? "Settle 2s; display approach 5s; hold 3s" : "Settle 1s; display approach 3s; hold 1s" : long ? "Three-second elegant establishment" : "Two-second elegant establishment");
  const contextual = shot("lighting-reveal", culinary ? "Locked medium product framing" : "Locked off-center medium framing",
    culinary ? "Medium product view restores the original surface context" : "Medium product view with measured display-like margins",
    culinary ? "Broad soft fill restores the existing form" : "Restrained side fill preserves existing markings", culinary ? "Two-second surface context reveal" : "Three-second balanced light reveal");
  const final = shot("final-hero", culinary ? "Slow pull-back to full product framing" : "Locked symmetrical long-lens product framing",
    culinary ? "Complete product with calm balanced margins" : "Complete product with elegant balanced negative space",
    "Even diffuse fill preserves original colors and markings", long ? "Four-second resolved product hold" : culinary ? "Two-second sensory recognition hold" : "Three-second composed product hold");
  const shots = mode === "single" ? [opening] : [opening, ...(long ? [contextual] : []), final];
  const pattern = category === "food" ? /layer|surface|texture|edge/i : new RegExp(surface.patterns.map(item => item.source).join("|"), "i");
  return { shots, detailIndex: culinary ? 0 : -1, patterns: [pattern, pattern], allowWideFallback: true,
    durations: mode === "single" ? [duration] : culinary ? long ? [4, 2, 4] : [3, 2] : long ? [3, 3, 4] : [2, 3] };
}

export function categoryProductDetailDirection(presetId: string, category: string, mode: "single" | "multi", duration: number) {
  if (!["label-reveal", "sneaker-hero", "upholstery-macro"].includes(presetId)) return null;
  const context = categoryMinimalDirection(category, mode, duration);
  const surface = categoryMaterialDirection(category, mode, duration);
  if (!context || !surface) return null;
  const label = presetId === "label-reveal", sneaker = presetId === "sneaker-hero", long = duration === 10;
  const framing = context.shots[0].composition;
  const study = label ? shot("macro-detail", "Locked source-facing close framing", "One verified marking at a readable source-resolved scale", "Even diffuse light preserves the original visible layout",
    mode === "single" ? long ? "Settle 2s; read 6s; hold 2s" : "Settle 1s; read 3s; hold 1s" : long ? "Four-second verified marking hold" : "Two-second verified marking hold")
    : sneaker ? shot("controlled-motion", "Short lateral camera glide within the source view", "Medium product view with assertive diagonal negative space", "Directional side light preserves the original outline",
      mode === "single" ? long ? "Settle 2s; graphic glide 5s; hold 3s" : "Settle 1s; graphic glide 3s; hold 1s" : long ? "Four-second dynamic graphic glide" : "Three-second dynamic graphic glide")
      : shot("material-study", "Slow pan left across the visible surface", "One verified surface junction at source-resolved scale", "Broad grazing light traces existing relief",
        mode === "single" ? long ? "Settle 2s; trace 6s; hold 2s" : "Settle 1s; trace 3s; hold 1s" : long ? "Four-second surface junction trace" : "Three-second surface junction trace");
  const final = shot("final-hero", label ? "Locked balanced full product framing" : sneaker ? "Locked low-amplitude product overview" : "Slow pull-back to full product framing",
    label ? "Complete product with its original graphics in context" : sneaker ? "Complete product with strong forward campaign space" : "Complete product with quiet surface context",
    "Soft fill preserves source colors and original markings", long ? label ? "Four-second clear product hold" : "Three-second recognition hold" : label ? "Three-second clear product hold" : "Two-second recognition hold");
  const opening = shot("hero-reveal", "Locked wide product framing", framing, "Soft side light defines the original silhouette", label ? "Two-second product establishment" : "Three-second silhouette establishment");
  const shots = mode === "single" ? [study] : label || sneaker ? [...(long ? [opening] : []), study, final]
    : [study, ...(long ? [shot("lighting-reveal", "Locked medium product framing", "Medium product view restores the original surface context", "Diffuse side light restores the product volume", "Three-second contextual light reveal")] : []), final];
  const pattern = label ? /\b(?:labels?|logo\w*|text|lettering|inscription\w*)\b/i : new RegExp(surface.patterns.map(item => item.source).join("|"), "i");
  return { shots, detailIndex: sneaker ? -1 : label && mode === "multi" && long ? 1 : 0, patterns: [pattern, pattern], allowWideFallback: true,
    durations: mode === "single" ? [duration] : label ? long ? [2, 4, 4] : [2, 3] : sneaker ? long ? [3, 4, 3] : [3, 2] : long ? [4, 3, 3] : [3, 2] };
}

export function categoryFashionMotionDirection(presetId: string, category: string, mode: "single" | "multi", duration: number) {
  if (!["floating-fashion", "fabric-motion", "floating-accessory"].includes(presetId)) return null;
  const context = categoryMinimalDirection(category, mode, duration);
  if (!context) return null;
  const fashion = presetId === "floating-fashion", fabric = presetId === "fabric-motion", long = duration === 10;
  const framing = context.shots[0].composition;
  const light = fashion ? "Broad soft side light preserves the original contact cues" : fabric ? "Grazing soft light traces existing surface relief" : "Soft edge light separates the existing contour";
  // Source pixels do not establish wind, flexible motion or a suspended pose.
  // Suggest lightness through framing and camera travel; retain the source pose.
  const study = shot(fabric ? "material-study" : "controlled-motion",
    fashion ? "Slow upward camera glide within the source view" : fabric ? "Slow pan right across the visible surface" : "Short lateral long-lens camera glide",
    fashion ? "Medium product view with airy vertical negative space" : fabric ? "One verified textile texture at source-resolved scale" : "Medium product view with balanced open negative space",
    light, mode === "single" ? long ? "Settle 2s; measured study 5s; hold 3s" : "Settle 1s; measured study 3s; hold 1s"
      : fashion ? "Four-second airy vertical glide" : fabric ? long ? "Five-second tactile light response" : "Three-second tactile light response" : "Three-second poised lateral glide");
  const final = shot("final-hero", fashion ? "Locked full product framing" : fabric ? "Slow pull-back to full product framing" : "Locked long-lens product overview",
    fashion ? "Complete product with spacious vertical campaign margins" : fabric ? "Complete product with the original surface in context" : "Complete product with quiet balanced display margins",
    "Even soft fill preserves original colors and markings", long ? fashion || !fabric ? "Four-second poised final hold" : "Three-second tactile recognition hold" : fabric || !fashion ? "Two-second recognition hold" : "Three-second airy final hold");
  const opening = shot("hero-reveal", "Locked wide product framing", framing, fashion ? light : "Broad soft fill preserves the original outline",
    fashion || fabric ? "Two-second product establishment" : "Three-second poised establishment");
  const shots = mode === "single" ? [study] : fashion ? [opening, ...(long ? [study] : []), final]
    : [...(long ? [opening] : []), study, final];
  const pattern = ["apparel", "bags", "headwear", "footwear", "furniture"].includes(category) ? /fabric|woven|weave|knit|textile|denim/i : /^$/;
  return { shots, detailIndex: fabric ? mode === "multi" && long ? 1 : 0 : -1, patterns: [pattern, pattern], allowWideFallback: true,
    durations: mode === "single" ? [duration] : fashion ? long ? [2, 4, 4] : [2, 3] : fabric ? long ? [2, 5, 3] : [3, 2] : long ? [3, 3, 4] : [3, 2] };
}

export function categoryPerspectiveDirection(presetId: string, category: string, mode: "single" | "multi", duration: number) {
  if (!["elegant-orbit", "optical-lines", "cinematic-dial"].includes(presetId)) return null;
  const context = categoryMinimalDirection(category, mode, duration);
  const evidence = categoryMacroDirection(category, mode, duration);
  if (!context || !evidence) return null;
  const elegant = presetId === "elegant-orbit", optical = presetId === "optical-lines", long = duration === 10;
  const framing = context.shots[0].composition;
  const light = elegant ? "Soft directional edge light preserves source colors" : optical ? "Broad diffuse edge light preserves existing geometry" : "Sculpted side light preserves the verified arrangement";
  const detailIndex = elegant || optical ? -1 : mode === "multi" && long ? 1 : 0;
  const study = elegant ? shot("controlled-motion", "Short lateral camera glide within the visible source view", "Medium product view with restrained perspective separation", light,
    mode === "single" ? long ? "Settle 2s; lateral glide 5s; hold 3s" : "Settle 1s; lateral glide 3s; hold 1s" : long ? "Four-second source-bound perspective glide" : "Two-second restrained perspective glide")
    : optical ? shot("controlled-motion", "Locked off-center product framing", "Medium product view aligned with existing graphic lines", light,
      mode === "single" ? long ? "Settle 2s; graphic study 5s; hold 3s" : "Settle 1s; graphic study 2s; hold 2s" : long ? "Three-second precise graphic study" : "Two-second graphic study")
      : shot("macro-detail", "Locked long-lens close framing", "One verified visible arrangement at source-resolved scale", light,
        mode === "single" ? long ? "Settle 2s; arrangement study 6s; hold 2s" : "Settle 1s; arrangement study 3s; hold 1s" : long ? "Five-second precise arrangement study" : "Three-second precise arrangement study");
  const final = shot("final-hero", elegant ? "Locked balanced full product framing" : optical ? "Locked symmetrical full product framing" : "Slow pull-back to full product framing",
    elegant ? "Complete product with fluid campaign negative space" : optical ? "Complete product with clean symmetrical margins" : "Complete product with balanced cinematic space",
    elegant ? "Soft side fill retains the original outline" : optical ? "Even soft light preserves existing graphic boundaries" : "Balanced side fill preserves source colors",
    long ? elegant || optical ? "Four-second resolved final hold" : "Three-second cinematic recognition hold" : optical ? "Three-second symmetrical final hold" : elegant ? "Three-second balanced final hold" : "Two-second cinematic recognition hold");
  const shots = mode === "single" ? [study] : [
    ...(long ? [shot("hero-reveal", "Locked wide product framing", framing, light, optical ? "Three-second geometric establishment" : "Two-second product establishment")] : []), study, final,
  ];
  const pattern = category === "watches" ? /dial|marker|indices/i : evidence.patterns[0];
  return { shots, detailIndex, patterns: [pattern, pattern], allowWideFallback: true,
    durations: mode === "single" ? [duration] : elegant ? long ? [2, 4, 4] : [2, 3] : optical ? long ? [3, 3, 4] : [2, 3] : long ? [2, 5, 3] : [3, 2] };
}

export function categoryLightingDirection(presetId: string, category: string, mode: "single" | "multi", duration: number) {
  if (!["glass-reflection", "dramatic-backlight", "metallic-light-sweep"].includes(presetId)) return null;
  const context = categoryMinimalDirection(category, mode, duration);
  if (!context) return null;
  const framing = context.shots[0].composition;
  const glass = presetId === "glass-reflection", backlight = presetId === "dramatic-backlight";
  const long = duration === 10;
  // Neutral lighting language works on the actual source surface, without asserting
  // glass, transparency or metal when the product evidence does not establish it.
  const light = glass ? "A broad soft highlight travels across the existing surface"
    : backlight ? "Soft rim light separates the original outline; restrained fill"
      : "A narrow soft highlight travels across existing relief";
  const opening = shot(glass ? "lighting-reveal" : backlight ? "hero-reveal" : "material-study",
    mode === "single" ? glass ? "Short lateral camera glide within the source view" : backlight ? "Locked long-lens overview" : "Locked medium product framing"
      : glass ? "Locked medium product framing" : backlight ? "Locked wide product framing" : "Locked balanced product framing",
    mode === "multi" && long && !glass && !backlight ? "Medium product view with offset surface context" : framing, light, mode === "single" ? long ? "Settle 2s; light passage 6s; hold 2s" : "Settle 1s; light passage 3s; hold 1s"
      : glass ? long ? "Three-second soft highlight passage" : "Two-second soft highlight reveal"
        : backlight ? "Two-second silhouette establishment" : long ? "Four-second narrow highlight study" : "Three-second narrow highlight study");
  const final = shot("final-hero", glass ? "Locked balanced full product framing" : backlight ? "Locked symmetrical long-lens overview" : "Locked frontal full product framing",
    glass ? "Complete product with clear lateral margins" : backlight ? "Complete silhouette within strong negative space" : "Complete product with precise graphic margins",
    glass ? "Soft diffuse fill preserves existing markings" : backlight ? "Balanced rim light keeps original markings visible" : "Even side fill preserves original colors",
    long && !backlight ? "Four-second recognition hold" : !glass && !backlight ? "Two-second recognition hold" : "Three-second recognition hold");
  const shots = mode === "single" ? [opening] : glass ? [opening,
    ...(long ? [shot("controlled-motion", "Slow pull-back to full product framing", "Medium opening resolves to complete product context", "Steady soft fill preserves original colors", "Three-second contextual pull-back")] : []), final]
    : backlight ? [opening, ...(long ? [shot("lighting-reveal", "Locked medium product framing", "Medium product view with offset contour space", light, "Five-second contour light study")] : []), final]
      : [...(long ? [shot("hero-reveal", "Locked wide product framing", framing, "Even soft light establishes the original outline", "Two-second product establishment")] : []), opening, final];
  return { shots, durations: mode === "single" ? [duration] : glass ? long ? [3, 3, 4] : [2, 3] : backlight ? long ? [2, 5, 3] : [2, 3] : long ? [2, 4, 4] : [3, 2], patterns: [/^$/, /^$/], allowWideFallback: true };
}

export function categoryCraftDirection(presetId: string, category: string, mode: "single" | "multi", duration: number) {
  if (!["macro-stitching", "hardware-reveal", "craftsmanship-study"].includes(presetId) || !categoryMacroDirection(category, mode, duration)) return null;
  const features: Record<string, readonly [RegExp, RegExp, RegExp]> = {
    apparel: [/stitch|seam|hem|construction/i, /zip|button|buckle|closure/i, /weave|fabric|stitch|collar/i],
    bags: [/stitch|seam|panel/i, /clasp|zip|buckle|attachment|hardware/i, /grain|leather|stitch|edge/i],
    watches: [/junction|join|case edge/i, /crown|pusher|clasp|buckle/i, /brushed|finish|case|bracelet/i],
    cosmetics: [/junction|join|edge/i, /cap|lid|dispenser|closure/i, /glass|finish|bottle|edge/i],
    headwear: [/stitch|seam|hem/i, /buckle|closure|attachment/i, /fabric|weave|brim|panel/i],
    eyewear: [/join|junction/i, /hinge|attachment/i, /frame|rim|bridge|finish/i],
    jewelry: [/join|junction/i, /clasp|attachment/i, /setting|band|chain|finish/i],
    footwear: [/stitch|seam|panel/i, /eyelet|buckle|zip|hardware/i, /upper|sole|edge|texture/i],
    furniture: [/seam|stitch|join/i, /fastener|hinge|bracket/i, /upholstery|grain|texture|edge/i],
    food: [/^$/, /^$/, /layer|surface|texture|edge/i],
    "packaged-food": [/seam|join|junction/i, /lid|cap|closure|tab/i, /finish|container|edge|packaging/i],
    electronics: [/join|junction|seam/i, /button|hinge|connector|control/i, /housing|finish|edge/i],
  };
  const stitching = presetId === "macro-stitching", hardware = presetId === "hardware-reveal";
  const pattern = features[category][stitching ? 0 : hardware ? 1 : 2];
  const long = duration === 10;
  const detailIndex = mode === "multi" && long && hardware ? 1 : 0;
  const detail = stitching
    ? shot("macro-detail", "Slow pan left along the visible detail", "Isolated verified junction at source-resolved scale", "Raking soft light traces the existing relief", mode === "single" ? long ? "Settle 2s; trace 6s; hold 2s" : "Settle 1s; trace 3s; hold 1s" : long ? "Three-second construction trace" : "Two-second construction trace")
    : hardware
      ? shot(mode === "multi" && !long ? "lighting-reveal" : "macro-detail", "Locked oblique close framing", "Isolated verified fitting with clear margins", "Diffuse edge light preserves existing geometry", mode === "single" ? long ? "Settle 2s; inspect 6s; hold 2s" : "Settle 1s; inspect 3s; hold 1s" : long ? "Four-second fitting inspection" : "Two-second fitting inspection")
      : shot("material-study", "Short lateral macro camera glide", "Isolated verified finished surface with quiet margins", "Feathered side light defines existing relief", mode === "single" ? long ? "Settle 2s; study 6s; hold 2s" : "Settle 1s; study 3s; hold 1s" : long ? "Four-second finished surface study" : "Three-second finished surface study");
  const final = shot("final-hero", stitching ? "Locked balanced full product framing" : hardware ? "Locked symmetrical product overview" : "Slow pull-back to full product framing",
    stitching ? "Complete product with construction in context" : hardware ? "Complete product with clear graphic side margins" : "Complete product within quiet campaign space",
    "Soft fill preserves original colors and markings", hardware && long ? "Four-second clear final hold" : !stitching && !hardware && !long ? "Two-second recognition hold" : "Three-second recognition hold");
  const shots = mode === "single" ? [detail] : hardware && long ? [
    shot("hero-reveal", "Locked medium product overview", "Complete product with precise negative space", "Even diffuse light preserves original colors", "Two-second product establishment"), detail, final,
  ] : [detail, ...(long ? [stitching
    ? shot("controlled-motion", "Locked medium product framing", "Medium product view restores construction context", "Steady side fill defines the original outline", "Four-second context hold")
    : shot("lighting-reveal", "Locked medium product framing", "Medium product view restores material context", "A broad diffuse highlight traces the original form", "Three-second finished form reveal")] : []), final];
  return { shots, detailIndex, patterns: [pattern, pattern], allowWideFallback: true,
    durations: mode === "single" ? [duration] : stitching ? long ? [3, 4, 3] : [2, 3] : hardware ? long ? [2, 4, 4] : [2, 3] : long ? [4, 3, 3] : [3, 2] };
}

export function categoryPrecisionDirection(category: string, mode: "single" | "multi", duration: number) {
  const macro = categoryMacroDirection(category, mode, duration);
  if (!macro) return null;
  const cameras: Record<string, string> = {
    apparel: "Locked macro framing parallel to the visible detail",
    bags: "Locked off-center macro framing",
    watches: "Locked symmetrical macro framing",
    cosmetics: "Locked macro framing with clear edge separation",
    headwear: "Locked low-angle macro framing within the source view",
    eyewear: "Locked parallel macro framing within the source view",
    jewelry: "Locked centered macro framing",
    footwear: "Locked oblique macro framing within the source view",
    furniture: "Locked parallel macro framing",
    food: "Locked overhead macro framing within the source view",
    "packaged-food": "Locked frontal macro framing within the source view",
    electronics: "Locked orthogonal macro framing",
  };
  const long = duration === 10;
  const detail = shot("macro-detail", cameras[category], "One verified technical feature at source-resolved scale",
    "Narrow diffuse light defines existing edges", mode === "single" ? long ? "Settle 2s; inspect 6s; hold 2s" : "Settle 1s; inspect 3s; hold 1s" : long ? "Five-second precise feature inspection" : "Two-second precise feature inspection");
  const shots = mode === "single" ? [detail] : [
    ...(long ? [shot("hero-reveal", "Locked long-lens overview", "Complete product with clear technical context", "Even diffuse light preserves source colors", "Two-second orientation hold")] : []), detail,
    shot("final-hero", "Locked full product framing", "Complete product with clean balanced margins", "Even soft fill preserves existing markings", "Three-second clear recognition hold"),
  ];
  return { shots, durations: mode === "single" ? [duration] : long ? [2, 5, 3] : [2, 3], patterns: [macro.patterns[0], macro.patterns[0]], allowWideFallback: true };
}

export function categoryLuxuryDirection(category: string, mode: "single" | "multi", duration: number) {
  const source = durationStrategy("luxury-fashion-film", mode, duration);
  const surface = categoryMaterialDirection(category, mode, duration);
  if (!source?.available || !surface) return null;
  const framing: Record<string, string> = {
    apparel: "Full silhouette; generous negative space",
    bags: "Full product with asymmetric editorial side margins",
    watches: "Complete product with precise balanced campaign space",
    cosmetics: "Complete product within tall editorial negative space",
    headwear: "Complete product with low editorial breathing room",
    eyewear: "Complete product with generous lateral negative space",
    jewelry: "Complete product in restrained central campaign space",
    footwear: "Complete product with forward editorial breathing room",
    furniture: "Complete product with spacious grounded campaign margins",
    food: "Complete product in its original presentation with quiet margins",
    "packaged-food": "Complete product within balanced graphic campaign space",
    electronics: "Complete product with precise angular negative space",
  };
  const detailPattern = new RegExp(surface.patterns.map(pattern => pattern.source).join("|"), "i");
  return { shots: source.shots.map((beat, index) => ({ ...beat,
    ...(category !== "apparel" && index === 0 && !(mode === "multi" && duration === 5) ? { composition: framing[category] } : {}) })),
    durations: [...source.durations], patterns: [detailPattern, detailPattern, detailPattern], allowWideFallback: true };
}

export function categoryMinimalDirection(category: string, mode: "single" | "multi", duration: number) {
  if (![5, 10].includes(duration)) return null;
  const framing: Record<string, string> = {
    apparel: "Complete product with quiet vertical margins",
    bags: "Complete product with balanced side margins",
    watches: "Complete product in a centered compact composition",
    cosmetics: "Complete product with restrained vertical space",
    headwear: "Complete product with low horizontal breathing room",
    eyewear: "Complete product with balanced horizontal margins",
    jewelry: "Complete product within quiet centered negative space",
    footwear: "Complete product with clean forward breathing room",
    furniture: "Complete product with spacious grounded margins",
    food: "Complete product in its original presentation",
    "packaged-food": "Complete product with even graphic margins",
    electronics: "Complete product within simple rectangular space",
  };
  if (!framing[category]) return null;
  const light = "Even diffuse studio light preserves original colors";
  const long = duration === 10;
  const shots = mode === "single" ? [shot("hero-reveal", "Locked wide product framing", framing[category], light,
    long ? "Settle 2s; quiet study 5s; hold 3s" : "Settle 1s; quiet study 2s; hold 2s")] : [
    shot("hero-reveal", "Locked wide product framing", framing[category], light, long ? "Three-second quiet establishment" : "Two-second quiet establishment"),
    ...(long ? [shot("controlled-motion", "Locked medium product framing", "Medium product view with restrained offset margins", light, "Four-second measured scale study")] : []),
    shot("final-hero", "Locked symmetrical product framing", "Complete product with calm symmetrical margins", light, "Three-second calm recognition hold"),
  ];
  return { shots, durations: mode === "single" ? [duration] : long ? [3, 4, 3] : [2, 3], patterns: [/^$/, /^$/], allowWideFallback: true };
}

export function categorySpotlightDirection(category: string, mode: "single" | "multi", duration: number) {
  if (![5, 10].includes(duration)) return null;
  const categories: Record<string, { framing: string; light: string }> = {
    apparel: { framing: "Complete product with vertical campaign space", light: "A tall pool of side light reveals the existing outline" },
    bags: { framing: "Complete product with asymmetric side margins", light: "Sculpted side light reveals the existing outline" },
    watches: { framing: "Complete product in a balanced circular light pool", light: "A narrow overhead light pool broadens over the product" },
    cosmetics: { framing: "Complete product with tall graphic negative space", light: "A vertical soft highlight reveals the existing outline" },
    headwear: { framing: "Complete product with low horizontal negative space", light: "Low raking light separates the existing outline" },
    eyewear: { framing: "Complete product with wide lateral breathing room", light: "Paired soft side lights define the existing outline" },
    jewelry: { framing: "Complete product within a restrained central light pool", light: "A small diffuse light pool reveals the existing contour" },
    footwear: { framing: "Complete product with forward graphic space", light: "A low side key reveals the existing profile" },
    furniture: { framing: "Complete product with spacious grounded margins", light: "Broad overhead light reveals the existing volume" },
    food: { framing: "Complete product in its original presentation", light: "Soft top-side light reveals the finished presentation" },
    "packaged-food": { framing: "Complete product with clean graphic side margins", light: "A broad frontal light pool preserves existing graphics" },
    electronics: { framing: "Complete product within angular negative space", light: "A controlled edge light reveals the existing outline" },
  };
  const categoryDirection = categories[category];
  if (!categoryDirection) return null;
  const long = duration === 10;
  const shots = mode === "single" ? [shot("lighting-reveal", long ? "Slow pull-back to full product framing" : "Locked wide product framing",
    categoryDirection.framing, categoryDirection.light, long ? "Light reveal 3s; widen 4s; hold 3s" : "Light reveal 3s; graphic hold 2s")] : [
    ...(long ? [shot("hero-reveal", "Locked wide product framing", categoryDirection.framing, "A restrained light pool establishes the product", "Two-second graphic establishment")] : []),
    shot("lighting-reveal", "Locked medium product framing", "Medium product view with an offset graphic balance", categoryDirection.light, long ? "Three-second sculpted light reveal" : "One-second light hook"),
    shot("controlled-motion", "Short lateral camera glide", "Medium product view shifts across negative space", "Steady side light preserves original colors", "Two-second graphic reframe"),
    shot("final-hero", "Locked symmetrical packshot", "Complete product with balanced campaign margins", "Balanced dramatic light preserves original markings", long ? "Three-second confident final hold" : "Two-second confident final hold"),
  ];
  return { shots, durations: mode === "single" ? [duration] : long ? [2, 3, 2, 3] : [1, 2, 2], patterns: [/^$/, /^$/], allowWideFallback: true };
}

export function categoryMaterialDirection(category: string, mode: "single" | "multi", duration: number) {
  if (![5, 10].includes(duration)) return null;
  const surfaces: Record<string, { patterns: RegExp[]; light: string }> = {
    apparel: { patterns: [/fabric|weave|texture|grain/i, /seam|stitch|collar/i], light: "Raking soft light traces existing fabric relief" },
    bags: { patterns: [/grain|texture|leather|panel/i, /stitch|seam|edge/i], light: "Broad grazing light traces the existing surface" },
    watches: { patterns: [/brushed|finish|steel|case/i, /strap|bracelet|dial/i], light: "Soft diffuse light traces the visible finish" },
    cosmetics: { patterns: [/glass|surface|finish|bottle/i, /cap|edge|closure/i], light: "Diffuse side light preserves container appearance" },
    headwear: { patterns: [/fabric|weave|panel|texture/i, /brim|seam|stitch/i], light: "Soft raking light defines visible panel relief" },
    eyewear: { patterns: [/frame|rim|finish/i, /hinge|bridge/i], light: "A broad highlight traces the visible frame" },
    jewelry: { patterns: [/metal|band|chain|finish/i, /setting|stone|clasp/i], light: "Soft diffuse light traces the existing finish" },
    footwear: { patterns: [/upper|weave|fabric|texture/i, /sole|panel|edge/i], light: "Grazing light follows the visible upper surface" },
    furniture: { patterns: [/upholstery|grain|texture|finish/i, /seam|join|edge/i], light: "Broad soft light traces existing surface relief" },
    food: { patterns: [/surface|texture|top/i, /layer|edge/i], light: "Soft top-side light preserves the finished surface" },
    "packaged-food": { patterns: [/surface|finish|container|packaging/i, /edge|rim|closure/i], light: "Broad diffuse light preserves packaging appearance" },
    electronics: { patterns: [/housing|surface|finish/i, /edge|button|control/i], light: "Soft side light traces the existing housing" },
  };
  const surface = surfaces[category];
  if (!surface) return null;
  const long = duration === 10;
  const shots = [shot("material-study", long ? "Slow pan right across the visible surface" : "Locked close framing", "One verified surface at source-resolved scale", surface.light, mode === "single" ? long ? "Settle 2s; surface study 6s; hold 2s" : "Settle 1s; surface study 3s; hold 1s" : long ? "Three-second surface trace" : "One-second tactile hook"),
    ...(mode === "multi" ? [
      ...(long ? [shot("macro-detail", "Locked off-center close framing", "A different verified surface junction", "Soft side light defines existing edges", "Two-second junction hold")] : []),
      shot("lighting-reveal", "Locked medium framing", "Surface in recognizable product context", "Broad diffuse light restores the visible form", "Two-second contextual light reveal"),
      shot("final-hero", "Slow pull-back to full product framing", "Complete product with balanced margins", "Broad fill preserves original colors", long ? "Three-second recognition hold" : "Two-second recognition hold"),
    ] : [])];
  return { shots, patterns: surface.patterns, durations: mode === "single" ? [duration] : long ? [3, 2, 2, 3] : [1, 2, 2], allowWideFallback: true };
}

export function categoryMacroDirection(category: string, mode: "single" | "multi", duration: number) {
  if (![5, 10].includes(duration)) return null;
  const long = duration === 10;
  const categories: Record<string, { camera: string; light: string; patterns: RegExp[] }> = {
    apparel: { camera: "Locked close framing", light: "Raking side light defines existing construction", patterns: [/collar|button|zip|seam|stitch|knot/i, /texture|weave|fabric|grain/i] },
    watches: { camera: "Locked symmetrical close framing", light: "Narrow diffuse light preserves the visible face", patterns: [/dial|marker|indices/i, /strap|bracelet|case/i] },
    cosmetics: { camera: "Locked off-center close framing", light: "Soft edge light defines existing packaging", patterns: [/cap|lid|closure/i, /label|logo|text/i] },
    bags: { camera: "Locked close framing", light: "Soft side light defines existing attachments", patterns: [/handle|clasp|zip|hardware/i, /stitch|grain|texture|panel/i] },
    headwear: { camera: "Locked close framing", light: "Raking light traces existing brim construction", patterns: [/brim|stitch|seam/i, /fabric|panel|texture/i] },
    eyewear: { camera: "Locked off-center close framing", light: "Diffuse edge light defines the visible frame", patterns: [/hinge/i, /frame|rim|bridge/i] },
    jewelry: { camera: "Locked symmetrical close framing", light: "Soft raking light preserves existing settings", patterns: [/stone|setting/i, /band|chain|clasp/i] },
    footwear: { camera: "Locked close framing", light: "Soft side light traces existing upper relief", patterns: [/lace|lacing|upper/i, /sole|heel|panel/i] },
    furniture: { camera: "Locked close framing", light: "Broad raking light defines existing upholstery", patterns: [/seam|join|edge/i, /upholstery|texture|grain/i] },
    food: { camera: "Locked off-center close framing", light: "Soft top light preserves the finished surface", patterns: [/layer/i, /top|edge/i] },
    "packaged-food": { camera: "Locked close framing", light: "Even diffuse light preserves packaging graphics", patterns: [/label|text|logo/i, /edge|closure|rim/i] },
    electronics: { camera: "Locked close framing", light: "Soft edge light defines existing controls", patterns: [/button|control/i, /housing|edge|screen/i] },
  };
  const categoryDetails = categories[category];
  if (!categoryDetails) return null;
  const shots = [shot("macro-detail", categoryDetails.camera, "One verified feature in a source-resolved close view", categoryDetails.light, long ? "Feature study 3s; resolved hold" : "Feature hook 2s; precise hold"),
    ...(mode === "multi" ? [
      ...(long ? [shot("material-study", "Locked close framing", "A different verified detail with clear margins", categoryDetails.light, "Two-second secondary detail hold")] : []),
      shot("controlled-motion", "Short lateral camera glide", "Medium product view restores the feature context", "Soft side fill preserves source colors", long ? "Two-second context reveal" : "One-second scale reset"),
      shot("final-hero", "Locked balanced hero frame", "Complete product with clear campaign margins", "Even fill preserves original markings", long ? "Three-second recognition hold" : "Two-second recognition hold"),
    ] : [])];
  return { shots, durations: mode === "single" ? [duration] : long ? [3, 2, 2, 3] : [2, 1, 2], patterns: categoryDetails.patterns,
    allowWideFallback: true };
}

export function isQualityPreset(id: string): id is QualityPresetId {
  return Object.hasOwn(qualityPresetVersions, id);
}
const shot = (purpose: ShotPurpose, camera: string, composition: string, lighting: string, pace: string): Beat => ({
  purpose, camera, composition, lighting, pace, motion: "Keep the product still",
  focus: purpose === "material-study" || purpose === "macro-detail" ? "Source-visible surface detail" : "Source-visible product form",
});

/** Deliberately separate from the frozen Cinematic/Luxury direction module. */
export function qualityPresetDirection(id: string, mode: "single" | "multi", duration: number): QualityDirection | null {
  if (!isQualityPreset(id) || (duration !== 5 && duration !== 10)) return null;
  const long = duration === 10;
  let shots: Beat[], durations: number[], focusRoles: FocusRole[], grammar: string;
  if (id === "material-detail") {
    grammar = long ? "Develop a surface trace, distinguish a junction, then let light restore product scale"
      : "Immediate tactile hook, quick relief accent, clear product recognition";
    if (mode === "single") {
      shots = [long
        ? shot("material-study", "Locked close framing", "Resolvable surface with quiet margins", "A narrow light band traces existing relief", "Settle 2s; light study 6s; hold 2s")
        : shot("material-study", "Slow pan right across the visible surface", "Parallel resolvable surface crop", "Fixed raking light defines existing relief", "Settle 1s; trace 3s; hold 1s")];
      durations = [duration]; focusRoles = ["texture"];
    } else {
      shots = [shot("material-study", long ? "Slow pan right across the visible surface" : "Locked close framing", "Resolvable surface crop with clear margins", "Raking light defines existing relief", long ? "Patient surface trace" : "Immediate tactile hook"),
        ...(long ? [shot("macro-detail", "Locked off-center close framing", "A different evidenced surface junction", "Narrow side light traces existing edges", "Precise junction pause")] : []),
        shot("lighting-reveal", "Locked medium framing", "Surface in recognizable product context", "A light band travels over existing relief", long ? "Measured relief reveal" : "Brief relief accent"),
        shot("final-hero", "Slow pull-back within the visible face", "Complete product with readable surface context", "Broad side fill preserves source colors", long ? "Sustained recognition hold" : "Clear recognition hold")];
      durations = long ? [3, 2, 2, 3] : [1, 2, 2]; focusRoles = long ? ["texture", "feature", "form", "form"] : ["texture", "form", "form"];
    }
  } else if (id === "macro-detail-reveal") {
    grammar = long ? "Discover one feature, connect a different surface, reveal context, then resolve the product"
      : "Give one feature time to read, reset scale briefly, finish with recognition";
    if (mode === "single") {
      shots = [long
        ? shot("macro-detail", "Slow pull-back within the visible face", "Start on evidenced detail; finish full product", "Steady grazing light with gentle fill", "Detail 3s; reveal 5s; hold 2s")
        : shot("macro-detail", "Slow optical push toward the visible detail", "One resolvable evidenced feature; clear margins", "Narrow raking light defines existing edges", "Approach 3s; precise hold 2s")];
      durations = [duration]; focusRoles = ["feature"];
    } else {
      shots = [shot("macro-detail", long ? "Slow optical push toward the visible detail" : "Locked close framing", "One resolvable evidenced feature fills the frame", "Narrow raking light defines existing edges", long ? "Deliberate feature discovery" : "Two-second detail hook"),
        ...(long ? [shot("material-study", "Short lateral macro camera glide", "Different adjacent evidenced surface crop", "Grazing light defines existing surface relief", "Short tactile connection")] : []),
        shot("controlled-motion", "Short lateral camera glide", "Medium view places the detail in context", "Restrained edge light preserves source colors", long ? "Measured context reveal" : "Quick scale reset"),
        shot("final-hero", "Locked balanced hero frame", "Full recognizable product with clear margins", "Even fill retains existing color boundaries", long ? "Resolved closing hold" : "Two-second recognition hold")];
      durations = long ? [3, 2, 2, 3] : [2, 1, 2]; focusRoles = long ? ["feature", "texture", "form", "form"] : ["feature", "form", "form"];
    }
  } else {
    grammar = long ? "Establish graphic space, develop contour light, reset the frame, linger on the packshot"
      : "Light is the immediate hook; one graphic reframe leads to a stable packshot";
    if (mode === "single") {
      shots = [long
        ? shot("lighting-reveal", "Slow pull-back within the visible face", "Medium opening opens to full campaign margins", "A focused light pool broadens over the contour", "Reveal 2s; widen 5s; hold 3s")
        : shot("lighting-reveal", "Locked wide product framing", "Complete form in asymmetric negative space", "A focused light pool reveals the visible contour", "Light reveal 3s; graphic hold 2s")];
      durations = [duration]; focusRoles = ["form"];
    } else {
      shots = [...(long ? [shot("hero-reveal", "Locked wide product framing", "Full form with strong diagonal negative space", "A narrow pool of light isolates the outline", "Graphic establishment")] : []),
        shot("lighting-reveal", long ? "Locked close framing" : "Locked medium framing", long ? "A visible contour segment with clean margins" : "Complete silhouette within the light pool", "A focused light pass defines existing edges", long ? "Developed contour reveal" : "Immediate light hook"),
        shot("controlled-motion", "Short lateral camera glide", "Offset medium view; product retains orientation", "Steady side key defines the visible outline", long ? "Deliberate graphic reset" : "Brief graphic reframe"),
        shot("final-hero", "Locked symmetrical packshot", "Complete product with balanced campaign space", "Balanced light keeps original marks readable", long ? "Confident three-second hold" : "Confident two-second hold")];
      durations = long ? [2, 3, 2, 3] : [1, 2, 2]; focusRoles = shots.map(() => "form");
    }
  }
  return { mode, durationSeconds: duration, available: true, shots, durations, focusRoles, grammar,
    shotGrammar: shots.map((beat, index) => `${durations[index]}s ${beat.purpose}: ${focusRoles[index]}`),
    transitions: mode === "single" ? "Continuous only; no cuts or new angles" : "Direct cuts between shots; match visible edges or feature position",
    evidenceDirection: "Use different verified atoms for feature and texture accents. With sparse evidence omit a redundant detail and extend the final hold. A matched back/side reference may serve the middle context/reframe shot in multi, never the primary opening or single take. Slot labels are not evidence; never infer weave, stitching, material or hidden surfaces." };
}

export function qualityFallbackDirection(direction: QualityDirection, evidence: readonly Evidence[]) {
  const patterns: Record<FocusRole, RegExp> = { texture: /texture|grain|weave|surface|fabric|finish|material/i,
    feature: /stitch|seam|junction|edge|zip|button|closure|clasp|collar|knot|setting|marker|label|logo|hardware/i,
    form: /silhouette|shape|form|geometr|outline/i };
  const used = new Set<number>();
  const shots: Beat[] = [], durations: number[] = [], focusIds: (number | null)[] = [];
  const focusRoles: FocusRole[] = [];
  let heldTime = 0, detailSeen = false;
  for (const [index, beat] of direction.shots.entries()) {
    const role = direction.focusRoles[index];
    const detail = role !== "form";
    const chosen = evidence.find(item => item.detail.length <= 80 && patterns[role].test(item.detail) && (!detail || !used.has(item.id)));
    if (detail && detailSeen && !chosen) { heldTime += direction.durations[index]; continue; }
    if (detail) { detailSeen = true; if (chosen) used.add(chosen.id); }
    shots.push(beat); durations.push(direction.durations[index]); focusIds.push(chosen?.id ?? null); focusRoles.push(role);
  }
  durations[durations.length - 1] += heldTime;
  return { ...direction, shots, durations, focusIds, focusRoles,
    shotGrammar: shots.map((beat, index) => `${durations[index]}s ${beat.purpose}: ${focusRoles[index]}`) };
}
