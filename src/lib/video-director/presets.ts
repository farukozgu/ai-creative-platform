import { durationStrategy } from "./duration-strategy";
import { qualityPresetDirection, qualityPresetVersions } from "./preset-quality-directions";
import { additionalVideoPresets, extraVideoPresetIds } from "./preset-library";
import { sourcePreservation, sourceStructure, type VideoPreset as LibraryPreset } from "./preset-contract";
export const VIDEO_DIRECTOR_VERSION = "video-director-3.2-reference-views-v2";
export const legacyVideoPresetIds = ["luxury-fashion-film", "macro-detail-reveal", "minimal-studio"] as const;
export const videoPresetIds = [...legacyVideoPresetIds, ...extraVideoPresetIds] as const;
export type VideoPresetId = typeof videoPresetIds[number];
export type VideoShotMode = "single" | "multi";
export const shotPurposes = ["hero-reveal", "macro-detail", "material-study", "controlled-motion", "lighting-reveal", "final-hero"] as const;
export type ShotPurpose = typeof shotPurposes[number];

type Direction = { camera: string; lighting: string; composition: string; motion: string; pace: string; focus: string };
type VideoPreset = Direction & { version: number; brief: string; shots: readonly (Direction & { purpose: ShotPurpose })[] };

/** Creative briefs guide the AI; these concise directions are only the free fallback. */
const legacyPresets = {
  "luxury-fashion-film": {
    version: 3,
    brief: "Editorial luxury campaign. Sculpted directional light, long-lens negative space, composed reveal and confident hero finish. Adapt to this product, not just garments.",
    camera: "Long-lens slow push-in from the source view",
    lighting: "Soft directional light shapes the visible contour",
    composition: "Complete silhouette with campaign negative space",
    motion: "Controlled advance settles into a hero hold",
    pace: "Measured, confident finish",
    focus: "Source-visible product silhouette",
    shots: [
      { purpose: "hero-reveal", camera: "Long-lens slow push-in", lighting: "Soft directional contour light", composition: "Full visible silhouette with negative space", motion: "Advance settles at the source-facing view", pace: "Measured opening", focus: "Source-visible product silhouette" },
      { purpose: "lighting-reveal", camera: "Short lateral camera glide within the source view", lighting: "A soft highlight travels over the visible surface", composition: "Off-center close framing of the chosen detail", motion: "Highlight reveals existing relief", pace: "Deliberate reveal", focus: "Source-visible surface detail" },
      { purpose: "final-hero", camera: "Long-lens locked hero frame", lighting: "Soft directional contour light", composition: "Return to full product with campaign negative space", motion: "Settle into the recognizable source-facing pose", pace: "Confident final hold", focus: "Source-visible product form" },
    ],
  },
  "macro-detail-reveal": {
    version: 3,
    brief: "Tactile detail-led film. Select an evidenced feature, use source-resolvable macro scale and grazing soft light. Alternate detail scale and recognizable product form.",
    camera: "Slow optical push toward the chosen visible detail",
    lighting: "Grazing soft light defines existing surface relief",
    composition: "Source-resolvable close detail with breathing room",
    motion: "Approach the detail, then hold it sharply",
    pace: "Patient detail study",
    focus: "Source-visible surface detail",
    shots: [
      { purpose: "hero-reveal", camera: "Locked medium product overview", lighting: "Soft edge light preserves source colors", composition: "Establish the recognizable visible product", motion: "Hold the source-facing pose", pace: "Brief introduction", focus: "Source-visible product form" },
      { purpose: "macro-detail", camera: "Restrained macro push toward the visible detail", lighting: "Grazing soft light reveals existing relief", composition: "Close framing at source-resolvable detail scale", motion: "Approach settles into a sharp detail hold", pace: "Patient detail hold", focus: "Source-visible surface detail" },
      { purpose: "final-hero", camera: "Slow pull-back to medium hero framing", lighting: "Soft edge light preserves source colors", composition: "Return to recognizable product form", motion: "Widen within the known source-facing view", pace: "Calm closing hold", focus: "Source-visible product form" },
    ],
  },
  "minimal-studio": {
    version: 3,
    brief: "Quiet graphic studio film. Stable diffuse light, balanced margins, mostly locked camera and clean changes of scale. Product shape and original marks lead; restrained pace.",
    camera: "Locked camera at the source-facing viewpoint",
    lighting: "Diffuse studio light preserves source colors",
    composition: "Centered full product with balanced margins",
    motion: "A gentle focus settle resolves the visible form",
    pace: "Quiet sustained hero hold",
    focus: "Source-visible product form",
    shots: [
      { purpose: "hero-reveal", camera: "Locked balanced studio overview", lighting: "Diffuse soft light with natural contact shadow", composition: "Centered complete product with clean margins", motion: "Focus settles on the visible contour", pace: "Quiet opening hold", focus: "Source-visible product form" },
      { purpose: "material-study", camera: "Locked close framing", lighting: "Even diffuse light defines existing texture", composition: "Graphic crop of the chosen source-visible detail", motion: "Gentle focus settle on the existing surface", pace: "Steady detail hold", focus: "Source-visible surface detail" },
      { purpose: "final-hero", camera: "Locked symmetrical hero frame", lighting: "Diffuse soft light with natural contact shadow", composition: "Return to the full product with balanced space", motion: "Hold the recognizable source-facing pose", pace: "Sustained final hold", focus: "Source-visible product form" },
    ],
  },
} as const satisfies Record<typeof legacyVideoPresetIds[number], VideoPreset>;

function compatiblePreset(id: typeof legacyVideoPresetIds[number]): LibraryPreset {
  const preset = legacyPresets[id];
  return { ...preset, structure: sourceStructure, preservation: sourcePreservation, strategy: {
    categories: [], objective: preset.brief, cameraStrategy: [preset.shots[0].camera, preset.shots[1].camera, preset.shots[2].camera],
    framing: [preset.shots[0].composition, preset.shots[1].composition, preset.shots[2].composition], lighting: preset.lighting, tempo: preset.pace,
    detailTerms: ["zip", "buckle", "button", "clasp", "hardware", "closure", "stone", "setting", "texture", "grain"],
    supportedMotion: ["Source-facing camera travel", "Source-resolved close framing"], risks: ["micro-detail", "unseen-surfaces"], variations: {},
  } };
}
const compatiblePresets = {
  "luxury-fashion-film": compatiblePreset("luxury-fashion-film"),
  "macro-detail-reveal": compatiblePreset("macro-detail-reveal"),
  "minimal-studio": compatiblePreset("minimal-studio"),
};

const basePresets = { ...compatiblePresets, ...additionalVideoPresets };
export const videoDirectorPresets: Record<VideoPresetId, LibraryPreset> = { ...basePresets,
  "material-detail": { ...basePresets["material-detail"], version: qualityPresetVersions["material-detail"] },
  "macro-detail-reveal": { ...basePresets["macro-detail-reveal"], version: qualityPresetVersions["macro-detail-reveal"] },
  "product-spotlight": { ...basePresets["product-spotlight"], version: qualityPresetVersions["product-spotlight"] },
};

export function getVideoDirectorPreset(id: VideoPresetId, shotMode: VideoShotMode, durationSeconds: number): LibraryPreset {
  const preset = videoDirectorPresets[id];
  const execution = qualityPresetDirection(id, shotMode, durationSeconds) ?? durationStrategy(id, shotMode, durationSeconds);
  if (!execution?.available) return preset;
  const direction = execution.shots[0];
  return { ...preset, ...(shotMode === "single" ? direction : {}), execution,
    shots: shotMode === "multi" ? execution.shots : preset.shots,
    strategy: { ...preset.strategy,
      ...(shotMode === "single" ? { cameraStrategy: [direction.camera, direction.camera, direction.camera] as const,
        framing: [direction.composition, direction.composition, direction.composition] as const } : {}),
      lighting: direction.lighting, tempo: direction.pace } };
}

export function isVideoPresetId(value: unknown): value is VideoPresetId {
  return typeof value === "string" && videoPresetIds.some(id => id === value);
}
