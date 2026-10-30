import { riskAlternatives, sourcePreservation, sourceStructure, type PresetStrategy, type ShotPurpose, type VideoPreset } from "./preset-contract";

export const extraVideoPresetIds = ["floating-fashion", "precision-macro", "glass-reflection", "product-spotlight", "elegant-orbit", "cinematic-hero", "material-detail", "macro-stitching", "fabric-motion", "label-reveal", "dramatic-backlight", "cinematic-dial", "metallic-light-sweep", "hardware-reveal", "floating-accessory", "sneaker-hero", "upholstery-macro", "culinary-texture", "optical-lines", "craftsmanship-study", "window-display"] as const;
type ExtraPresetId = typeof extraVideoPresetIds[number];
type Seed = Pick<PresetStrategy, "categories" | "objective" | "cameraStrategy" | "framing" | "lighting" | "tempo" | "detailTerms" | "risks" | "variations"> & { purpose: ShotPurpose };

// Retained single 5s direction; other pilot modes use duration-strategy.
export const cinematicHeroSingleFiveSeconds = {
  camera: "Slow steady push-in with a level, stable horizon",
  lighting: "A soft highlight travels slowly across the surface during the approach",
  composition: "Centered product with wide clean margins on all sides, calm backdrop",
  motion: "Only the camera and the light move; the product stays still",
  pace: "Calm, premium, unhurried",
};
export const cinematicHeroSingleNegativeTerms = "rotation, orbit, camera turn, cropped product, product leaving frame, morphing, extra parts, texture change";

// These are production strategies, not final prompts. AI chooses evidence and actions.
const seeds: Record<ExtraPresetId, Seed> = {
  "floating-fashion": {
    categories: ["apparel", "headwear"], objective: "Airy fashion silhouette with a weightless visual rhythm",
    cameraStrategy: ["Slow upward camera glide within the source view", "Long-lens locked close framing", "Slow pull-back to a balanced hero view"],
    framing: ["Full silhouette with open margins", "Close crop of the chosen visible detail", "Full form with generous space above"],
    lighting: "Broad soft light outlines the existing silhouette", tempo: "Airy measured rhythm", detailTerms: ["silhouette", "collar", "seam", "panel"], risks: ["layout-change", "deformation", "unseen-surfaces"], purpose: "controlled-motion",
    variations: { apparel: "Keep actual garment drape; suggest lift without changing its orientation", headwear: "Emphasize the visible outline and front panel without revealing a rear panel" },
  },
  "precision-macro": {
    categories: ["watches", "jewelry", "electronics", "eyewear"], objective: "An exacting inspection of a source-resolved feature",
    cameraStrategy: ["Locked close framing", "Short lateral macro camera glide", "Slow pull-back to the complete visible form"],
    framing: ["Tight crop on the chosen evidenced feature", "Parallel close view of existing surface relief", "Centered recognizable hero view"], lighting: "Narrow diffuse light defines existing edges", tempo: "Patient precise rhythm", detailTerms: ["dial", "setting", "edge", "marker", "button", "screen"], risks: ["micro-detail", "mechanism"], purpose: "macro-detail",
    variations: { watches: "Retain visible hand positions and marker layout", jewelry: "Follow existing settings without inferring stone type", electronics: "Inspect visible controls without activating a screen" },
  },
  "glass-reflection": {
    categories: ["cosmetics", "eyewear", "packaged-food"], objective: "A reflection study of an evidenced reflective surface",
    cameraStrategy: ["Locked medium framing", "Macro vertical camera tilt within the visible face", "Locked symmetrical hero framing"],
    framing: ["Clean outline with lateral breathing room", "Close crop of a source-visible reflective edge", "Full form with readable existing marks"], lighting: "A broad soft highlight travels over the surface", tempo: "Smooth luminous rhythm", detailTerms: ["glass", "transparent", "bottle", "lens", "label"], risks: ["reflection", "mechanism"], purpose: "lighting-reveal",
    variations: { cosmetics: "Use bottle geometry only if evidenced; otherwise study the outer contour", eyewear: "Protect original lens appearance and frame shape", "packaged-food": "Never infer liquid or a transparent container" },
  },
  "product-spotlight": {
    categories: [], objective: "Isolate product form through a controlled pool of light",
    cameraStrategy: ["Locked wide product framing", "Long-lens locked close framing", "Locked medium hero framing"], framing: ["Full form in balanced negative space", "Centered graphic crop in a defined pool of light", "Centered silhouette with clean margins"], lighting: "A soft focused light pass defines the contour", tempo: "Deliberate light reveal", detailTerms: ["shape", "contour", "logo"], risks: ["reflection"], purpose: "lighting-reveal", variations: { headwear: "Follow the visible front contour", furniture: "Use the visible furniture outline, not imagined joints" },
  },
  "elegant-orbit": {
    categories: ["bags", "watches", "jewelry", "eyewear", "footwear"], objective: "Suggest depth with restrained source-facing parallax",
    cameraStrategy: ["Short lateral camera glide across the visible face", "Long-lens locked close framing", "Slow pull-back within the source view"], framing: ["Angled full form retaining source orientation", "Diagonal close crop tracing the visible curve", "Balanced recognizable hero frame"], lighting: "Soft directional edge light retains natural source colors", tempo: "Fluid restrained rhythm", detailTerms: ["form", "setting", "handle", "edge"], risks: ["unseen-surfaces"], purpose: "controlled-motion", variations: { jewelry: "Trace the visible curve instead of circling behind it", bags: "Keep handle attachments in their source positions" },
  },
  "cinematic-hero": {
    categories: [], objective: "Build from a dramatic product introduction to a confident campaign finish",
    cameraStrategy: ["Slow low-amplitude dolly-in", "Locked off-center close framing", "Slow pull-back to wide hero framing"], framing: ["Complete visible form with campaign negative space", "Tight asymmetric crop of the chosen detail", "Wide hero composition with strong visual balance"], lighting: "Sculpted side light retains source color boundaries", tempo: "Confident cinematic rhythm", detailTerms: ["silhouette", "form", "shape"], risks: ["unseen-surfaces"], purpose: "material-study", variations: { electronics: "Use the visible housing outline", food: "Keep the actual food presentation intact" },
  },
  "material-detail": {
    categories: [], objective: "Make existing surface character tangible without asserting a material type",
    cameraStrategy: ["Locked close framing", "Slow pan right across the visible surface", "Slow pull-back to medium product framing"], framing: ["Source-resolved crop of the selected surface", "Parallel crop emphasizing existing relief", "Recognizable full form with clear surface context"], lighting: "Grazing soft light defines existing surface relief", tempo: "Tactile unhurried rhythm", detailTerms: ["texture", "grain", "fabric", "surface", "weave"], risks: ["micro-detail"], purpose: "material-study", variations: { furniture: "Study existing finish, seams or exposed joinery only", footwear: "Follow evidenced upper texture without inventing an outsole" },
  },
  "macro-stitching": {
    categories: ["apparel", "headwear", "bags", "footwear", "furniture"], objective: "Trace visible construction lines and resolve the complete product",
    cameraStrategy: ["Locked macro framing", "Macro pan left along the selected visible detail", "Slow pull-back to full product framing"], framing: ["Close view of evidenced construction", "Diagonal crop following the existing detail line", "Full visible silhouette with clean margins"], lighting: "Soft raking light reveals existing relief", tempo: "Measured craft study", detailTerms: ["stitch", "seam", "collar", "panel"], risks: ["micro-detail", "unverified-process"], purpose: "macro-detail", variations: { apparel: "Denim hems, tee collars or jacket seams only when evidenced", headwear: "Use visible front embroidery or brim lines, not hidden mesh" },
  },
  "fabric-motion": {
    categories: ["apparel", "headwear"], objective: "Suggest a kinetic fashion rhythm while retaining the actual drape",
    cameraStrategy: ["Slow vertical tracking within the visible face", "Locked close framing", "Slow pull-back to a clean silhouette"], framing: ["Long visible contour in a narrow composition", "Source-resolved crop of existing folds", "Full form with balanced breathing room"], lighting: "A gentle light sweep follows existing folds", tempo: "Soft kinetic rhythm", detailTerms: ["fabric", "fold", "weave", "drape"], risks: ["deformation", "layout-change"], purpose: "controlled-motion", variations: { apparel: "Use light response rather than wind deformation unless natural flex is explicitly supported" },
  },
  "label-reveal": {
    categories: ["cosmetics", "packaged-food", "electronics", "headwear"], objective: "Lead attention from product form to an evidenced original mark",
    cameraStrategy: ["Slow dolly-in within the source view", "Locked close framing", "Locked medium packshot"], framing: ["Complete product with the visible mark in context", "Readable crop at source-resolved scale", "Balanced front-facing product composition"], lighting: "Even soft light keeps existing marks readable", tempo: "Clear measured reveal", detailTerms: ["label", "logo", "text", "mark", "emblem"], risks: ["micro-detail"], purpose: "macro-detail", variations: { "packaged-food": "Retain exact packaging graphics without rewriting claims", cosmetics: "Keep the original label and cap outline unchanged" },
  },
  "dramatic-backlight": {
    categories: ["cosmetics", "jewelry", "eyewear", "packaged-food"], objective: "Reveal the visible outline through rim light, without inventing transparency",
    cameraStrategy: ["Locked medium silhouette view", "Short lateral close camera glide", "Locked full product hero frame"], framing: ["Complete outline with dark negative space", "Close crop of a source-visible edge", "Balanced outline with readable existing marks"], lighting: "Soft rim light separates the existing contour", tempo: "Gradual dramatic reveal", detailTerms: ["outline", "edge", "bottle", "geometry"], risks: ["reflection", "mechanism"], purpose: "lighting-reveal", variations: { cosmetics: "Replace an unverified spray event with a light reveal; never dispense liquid", "packaged-food": "Keep opaque packaging opaque" },
  },
  "cinematic-dial": {
    categories: ["watches"], objective: "A graphic timepiece study of the evidenced face and its layout",
    cameraStrategy: ["Slow optical push toward the selected visible detail", "Locked close framing", "Slow pull-back to a composed hero view"], framing: ["Visible face in a balanced graphic composition", "Asymmetric close crop of evidenced layout", "Complete product with clean surrounding space"], lighting: "A narrow highlight crosses the existing relief", tempo: "Precise editorial rhythm", detailTerms: ["dial", "hands", "marker", "indices"], risks: ["micro-detail", "mechanism"], purpose: "macro-detail", variations: { watches: "Do not animate hands or infer movement internals; flare must not hide markers" },
  },
  "metallic-light-sweep": {
    categories: ["watches", "jewelry", "bags", "electronics", "packaged-food"], objective: "Reveal evidenced surface finish with a traveling highlight",
    cameraStrategy: ["Locked balanced product view", "Locked close framing", "Locked long-lens hero view"], framing: ["Full form with broad side margins", "Close crop of the selected reflective detail", "Balanced full form with clear original markings"], lighting: "A narrow soft light band crosses the visible face", tempo: "Controlled light cadence", detailTerms: ["metal", "steel", "hardware", "clasp", "case"], risks: ["reflection"], purpose: "lighting-reveal", variations: { "packaged-food": "Study the actual can finish only if evidenced", jewelry: "Keep actual settings and surface relief intact" },
  },
  "hardware-reveal": {
    categories: ["bags", "footwear", "eyewear", "watches", "cosmetics"], objective: "Introduce a visible attachment as a design feature without operating it",
    cameraStrategy: ["Locked close framing", "Short lateral camera glide along the visible edge", "Slow pull-back to full product framing"], framing: ["Tight crop of evidenced construction", "Parallel detail view with clean margins", "Recognizable product with the detail in context"], lighting: "Directional soft light defines existing edges", tempo: "Crisp deliberate rhythm", detailTerms: ["clasp", "zip", "buckle", "hinge", "handle", "hardware", "cap", "neck"], risks: ["mechanism", "micro-detail"], purpose: "macro-detail", variations: { bags: "Trace actual handle, clasp or zipper placement", eyewear: "Inspect visible hinge lines without folding the frame", cosmetics: "Inspect the evidenced cap and neck outline without dispensing or opening" },
  },
  "floating-accessory": {
    categories: ["bags", "jewelry", "watches", "eyewear"], objective: "A poised accessory presentation with an impression of buoyancy",
    cameraStrategy: ["Slow upward camera glide in the existing view", "Short lateral close camera glide", "Locked wide hero frame"], framing: ["Full visible form with open vertical margins", "Close crop of the selected surface feature", "Airy balanced silhouette composition"], lighting: "A broad side key with gentle fill preserves the product's existing contact cues", tempo: "Poised floating rhythm", detailTerms: ["handle", "shape", "silhouette", "form"], risks: ["layout-change", "unseen-surfaces"], purpose: "controlled-motion", variations: { bags: "Preserve strap and handle geometry; suggest buoyancy through framing", watches: "Keep original orientation and bracelet contour" },
  },
  "sneaker-hero": {
    categories: ["footwear"], objective: "A graphic footwear campaign built around the existing silhouette",
    cameraStrategy: ["Short lateral camera glide at source level", "Long-lens locked close framing", "Slow pull-back to a wide hero view"], framing: ["Full visible profile with forward negative space", "Diagonal crop of the selected visible detail", "Complete product with an assertive graphic balance"], lighting: "A traveling side highlight traces only the evidenced contour breaks", tempo: "Crisp athletic rhythm", detailTerms: ["silhouette", "upper", "lacing", "sole", "panel"], risks: ["unseen-surfaces"], purpose: "macro-detail", variations: { footwear: "Sneakers, boots and loafers retain actual source orientation and evidenced details" },
  },
  "upholstery-macro": {
    categories: ["furniture"], objective: "A calm furniture study of evidenced surface, seams and scale",
    cameraStrategy: ["Locked wide product framing", "Slow pan left across the visible surface", "Slow pull-back to wide hero framing"], framing: ["Complete visible form with room to read scale", "Close crop of an evidenced surface junction", "Balanced full form with natural contact shadow"], lighting: "Broad overhead soft light gives upholstery a gradual falloff and grounded contact shadow", tempo: "Spacious unhurried rhythm", detailTerms: ["upholstery", "seam", "texture", "join", "edge"], risks: ["micro-detail", "mechanism"], purpose: "material-study", variations: { furniture: "Modular outlines, studs and joints only when evidenced; no opening mechanisms" },
  },
  "culinary-texture": {
    categories: ["food"], objective: "A tactile food presentation using only the existing visible surface",
    cameraStrategy: ["Locked medium product view", "Slow horizontal camera glide across the visible face", "Slow pull-back to a balanced presentation"], framing: ["Existing presentation with clean margins", "Source-resolved crop of existing surface layers", "Full visible form in its original arrangement"], lighting: "Soft top-side light brings out the finished food surface while holding its original color", tempo: "Patient sensory rhythm", detailTerms: ["surface", "layer", "texture", "edge"], risks: ["micro-detail", "interaction", "unverified-process"], purpose: "material-study", variations: { food: "No inferred ingredients, freshness, steam, cutting or preparation history" },
  },
  "optical-lines": {
    categories: ["eyewear", "electronics"], objective: "A graphic contour study that resolves into symmetry",
    cameraStrategy: ["Locked off-center close framing", "Macro pan right across the visible face", "Locked symmetrical hero framing"], framing: ["Asymmetric crop of an evidenced contour", "Horizontal composition retaining known edges", "Clean centered full product outline"], lighting: "Broad soft edge light preserves surface appearance", tempo: "Clean graphic rhythm", detailTerms: ["frame", "hinge", "edge", "form", "screen"], risks: ["reflection", "mechanism"], purpose: "controlled-motion", variations: { eyewear: "Only visible frame and hinge features; never infer inner inscriptions", electronics: "Keep visible screen contents and controls unchanged" },
  },
  "craftsmanship-study": {
    categories: [], objective: "Express craftsmanship through finished visible detail rather than an invented production story",
    cameraStrategy: ["Locked close framing", "Long-lens vertical camera tilt over the visible face", "Slow pull-back to the complete product"], framing: ["Close crop of the chosen existing workmanship", "Parallel view of evidenced construction lines", "Full visible product with quiet negative space"], lighting: "Soft directional light defines existing construction", tempo: "Deliberate craft rhythm", detailTerms: ["stitch", "seam", "setting", "edge", "join", "construction"], risks: ["unverified-process", "interaction", "mechanism"], purpose: "material-study", variations: { apparel: "Study completed stitching, never weaving a garment into existence", watches: "Study visible assembly lines without exploded internals", food: "Study the finished surface without inventing preparation" },
  },
  "window-display": {
    categories: ["apparel", "bags", "headwear", "jewelry", "furniture"], objective: "A retail-editorial reveal through framing and light in the existing setting",
    cameraStrategy: ["Slow long-lens push-in", "Short lateral close camera glide", "Slow pull-back to a spacious hero view"], framing: ["Full product with generous display-like margins", "Close crop of the chosen original design feature", "Wide balanced composition in the source setting"], lighting: "A focused overhead accent isolates the product like a retail display", tempo: "Elegant retail rhythm", detailTerms: ["silhouette", "logo", "handle", "form"], risks: ["new-setting", "interaction", "reflection"], purpose: "macro-detail", variations: { apparel: "Use an existing mannequin only if present in the source", bags: "Do not introduce a pedestal or storefront" },
  },
};

function makePreset(seed: Seed): VideoPreset {
  const strategy: PresetStrategy = { ...seed, supportedMotion: ["Source-facing camera travel", "Controlled light response", "Source-resolved detail framing"] };
  const shots = seed.cameraStrategy.map((camera, i) => ({ camera, lighting: seed.lighting, composition: seed.framing[i],
    motion: "Focus resolves existing surface detail", pace: seed.tempo, focus: i === 1 ? "Source-visible surface detail" : "Source-visible product form",
    purpose: (i === 0 ? "hero-reveal" : i === 1 ? seed.purpose : "final-hero") as ShotPurpose }));
  return { ...shots[1], version: 1, brief: seed.objective, shots, strategy, structure: sourceStructure, preservation: sourcePreservation };
}

export const additionalVideoPresets = Object.fromEntries(extraVideoPresetIds.map(id => [id, makePreset(seeds[id])])) as Record<ExtraPresetId, VideoPreset>;

export function safePresetStrategy(preset: VideoPreset) {
  return { ...preset.strategy, structure: preset.execution
    ? { mode: preset.execution.mode, durations: preset.execution.durations, grammar: preset.execution.grammar }
    : preset.structure, preservation: preset.preservation,
    ...(preset.execution ? { execution: preset.execution } : {}),
    riskConditions: preset.strategy.risks.map(risk => riskAlternatives[risk]) };
}
