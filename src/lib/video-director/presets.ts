export const VIDEO_DIRECTOR_VERSION = "video-director-v3";
export const videoPresetIds = ["luxury-fashion-film", "macro-detail-reveal", "minimal-studio"] as const;
export type VideoPresetId = typeof videoPresetIds[number];
export type VideoShotMode = "single" | "multi";

type VideoPreset = {
  version: number;
  camera: string;
  lighting: string;
  composition: string;
  motion: string;
  pace: string;
  focus: string;
  shots: readonly { camera: string; composition: string; motion: string; pace: string; focus: string }[];
};

/** Video-only production defaults. Image presets and Composer remain independent. */
export const videoDirectorPresets = {
  "luxury-fashion-film": {
    version: 2,
    camera: "Restrained editorial push-in with a long-lens perspective; preserve the source viewpoint.",
    lighting: "Maintain source exposure and color; retain soft directional highlights and natural contact shadows.",
    composition: "Campaign hero framing with clean negative space; keep the complete silhouette and branding readable.",
    motion: "Stationary product and model; movement comes only from a subtle camera advance.",
    pace: "Measured opening, gentle advance, settled final hero hold.",
    focus: "Prioritize silhouette, tailoring, material character and visible craftsmanship already present in the source.",
    shots: [
      { camera: "Long-lens editorial framing with a restrained push-in.", composition: "Establish the complete visible silhouette with balanced negative space.", motion: "The product stays stationary.", pace: "Measured opening.", focus: "Visible silhouette and tailoring." },
      { camera: "Long-lens close framing of a visible construction detail.", composition: "Frame a source-visible material or construction detail without inventing surfaces.", motion: "The product stays stationary.", pace: "A deliberate detail hold.", focus: "Source-visible craftsmanship and texture." },
      { camera: "Long-lens hero framing with a gentle final hold.", composition: "Return to a composed view of the complete visible product.", motion: "The product stays stationary.", pace: "Settle into a quiet campaign finish.", focus: "Visible identity and silhouette." },
    ],
  },
  "macro-detail-reveal": {
    version: 2,
    camera: "Small optical push toward a visible detail from the existing viewpoint; avoid extreme magnification.",
    lighting: "Retain the source white balance and fixed soft highlights; protect fine texture from clipped reflections.",
    composition: "Establish the product before a restrained close view of a source-visible material or construction detail.",
    motion: "Keep all product parts still; use only a small camera movement toward the chosen visible detail.",
    pace: "Slow approach with a generous sharp detail hold; no abrupt focus changes.",
    focus: "Highlight source-visible material, texture and construction details; keep visible marks legible.",
    shots: [
      { camera: "Controlled product overview from the source viewpoint.", composition: "Establish the complete visible product before the detail.", motion: "The product stays stationary.", pace: "Brief, clear introduction.", focus: "Visible product form." },
      { camera: "Restrained macro framing on a source-visible detail.", composition: "Close view of visible texture or construction; preserve source detail and orientation.", motion: "The product stays stationary.", pace: "Hold the detail sharply without abrupt focus changes.", focus: "A visible material, seam or hardware detail already in the source." },
      { camera: "Calm medium product framing at the source viewpoint.", composition: "Return to a recognizable hero view of the visible product.", motion: "The product stays stationary.", pace: "A composed closing hold.", focus: "Visible identity and overall form." },
    ],
  },
  "minimal-studio": {
    version: 2,
    camera: "Locked camera with a stable, natural product perspective.",
    lighting: "Preserve source lighting, neutral color and stable contact shadows throughout.",
    composition: "Clean hero composition in the existing setting; balanced margins and complete product visibility.",
    motion: "Keep the product completely still; retain a stable frame.",
    pace: "Quiet opening and sustained hero hold with a calm finish.",
    focus: "Keep original branding, surface texture, color boundaries and construction edges sharp.",
    shots: [
      { camera: "Locked, balanced studio overview.", composition: "Establish a centered hero view with clean margins.", motion: "The product stays stationary.", pace: "A quiet opening hold.", focus: "Complete visible product and branding." },
      { camera: "Locked close framing on a source-visible detail.", composition: "Clean close view of an existing surface or construction detail.", motion: "The product stays stationary.", pace: "A steady detail hold.", focus: "Visible texture and construction edges." },
      { camera: "Locked, symmetrical hero frame.", composition: "Return to the complete visible product with balanced space.", motion: "The product stays stationary.", pace: "A sustained, still final hold.", focus: "Visible branding and source colors." },
    ],
  },
} as const satisfies Record<VideoPresetId, VideoPreset>;

export function isVideoPresetId(value: unknown): value is VideoPresetId {
  return typeof value === "string" && videoPresetIds.some(id => id === value);
}
