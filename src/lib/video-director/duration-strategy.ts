import type { Direction, ShotPurpose } from "./preset-contract";
import { cinematicHeroSingleFiveSeconds } from "./preset-library";

export const durationAwarePresetIds = ["cinematic-hero", "macro-detail-reveal", "luxury-fashion-film"] as const;
type DirectedPreset = typeof durationAwarePresetIds[number];
export type CreativeDuration = 5 | 10 | 15;
type Beat = Direction & { purpose: ShotPurpose };
export type DurationStrategy = {
  durationSeconds: CreativeDuration;
  mode: "single" | "multi";
  available: boolean;
  grammar: string;
  transitions: string;
  durations: readonly number[];
  shots: readonly Beat[];
};

const beat = (purpose: ShotPurpose, camera: string, composition: string, lighting: string, pace: string): Beat => ({
  purpose, camera, composition, lighting, pace, motion: "Keep the product still",
  focus: purpose === "macro-detail" || purpose === "material-study" ? "Source-visible surface detail" : "Source-visible product form",
});

const cinematic: readonly Beat[] = [
  beat("hero-reveal", "Locked medium overview", "Complete product; strong diagonal space", "Directional edge light shapes the contour", "Crisp opening"),
  beat("material-study", "Locked close framing", "Resolvable surface crop", "Grazing light defines existing relief", "Quick tactile accent"),
  beat("controlled-motion", "Short lateral camera glide", "Offset medium view of the same visible face", "Narrow side light defines visible edges", "Brisk visual reset"),
  beat("macro-detail", "Locked off-center close framing", "Alternate evidenced detail; clear margins", "Raking light reveals existing relief", "Precise detail accent"),
  beat("final-hero", "Locked symmetrical hero frame", "Full product with clean campaign space", "Balanced edge light preserves source colors", "Decisive final hold"),
];
const macro: readonly Beat[] = [
  beat("macro-detail", "Locked close framing", "Resolvable evidenced detail fills the frame", "Raking light defines existing relief", "Immediate detail hook"),
  beat("material-study", "Short lateral macro camera glide", "Adjacent evidenced surface; clear margins", "Grazing light traces existing relief", "Tactile inspection"),
  beat("lighting-reveal", "Locked medium framing", "Recognizable visible form around the detail", "A narrow highlight defines visible edges", "Scale reset"),
  beat("final-hero", "Slow pull-back within the visible face", "Full recognizable product with clean margins", "Even fill preserves source colors", "Calm recognition hold"),
];
const luxury: readonly Beat[] = [
  beat("hero-reveal", "Locked long-lens overview", "Full silhouette; generous negative space", "Sculpted side light shapes the contour", "Poised opening"),
  beat("lighting-reveal", "Short lateral long-lens camera glide", "Offset medium crop; same visible face", "Narrow contour light with restrained fill", "Editorial accent"),
  beat("material-study", "Locked close framing", "Isolated evidenced detail; quiet margins", "Feathered side light defines existing relief", "Deliberate detail pause"),
  beat("final-hero", "Locked long-lens hero frame", "Complete silhouette; asymmetric campaign space", "Sculpted contour light preserves source colors", "Confident lingering hold"),
];
const sequences: Record<DirectedPreset, readonly Beat[]> = {
  "cinematic-hero": cinematic, "macro-detail-reveal": macro, "luxury-fashion-film": luxury,
};
const timing: Record<DirectedPreset, Record<CreativeDuration, readonly number[]>> = {
  "cinematic-hero": { 5: [1, 1, 1, 1, 1], 10: [2, 2, 2, 1, 3], 15: [3, 3, 3, 2, 4] },
  "macro-detail-reveal": { 5: [1, 1, 1, 2], 10: [3, 3, 1, 3], 15: [4, 4, 2, 5] },
  "luxury-fashion-film": { 5: [1, 1, 1, 2], 10: [2, 2, 3, 3], 15: [3, 3, 4, 5] },
};

function multiDirection(preset: DirectedPreset, seconds: CreativeDuration): readonly Beat[] {
  const shots = sequences[preset];
  if (seconds === 5) return shots;
  return shots.map((shot, index) => {
    const pace = seconds === 10
      ? ["Measured establishment", "Sustained surface study", "Deliberate visual reset", "Resolved detail pause", "Extended hero hold"]
      : ["Patient establishment", "Slow tactile inspection", "Breathing-space reset", "Lingering detail study", "Campaign closing hold"];
    if (preset === "cinematic-hero" && index === 1) return { ...shot,
      camera: "Short lateral macro camera glide", pace: pace[index] };
    if (preset === "macro-detail-reveal" && index === 0) return { ...shot,
      camera: "Slow optical push toward the visible detail", pace: seconds === 10 ? "Three-second detail discovery" : "Four-second detail discovery" };
    if (preset === "luxury-fashion-film" && index === 0) return { ...shot,
      camera: "Slow long-lens pull-back within the visible face", pace: seconds === 10 ? "Measured spatial reveal" : "Patient spatial reveal" };
    return { ...shot, pace: index === shots.length - 1 ? pace[4] : pace[index] };
  });
}

/** 15s is an authored direction only: production duration gates remain 5/10. */
export function durationStrategy(id: string, mode: "single" | "multi", duration: number): DurationStrategy | null {
  if (!durationAwarePresetIds.some(preset => preset === id) || ![5, 10, 15].includes(duration)) return null;
  const preset = id as DirectedPreset, seconds = duration as CreativeDuration;
  const available = seconds !== 15;
  if (mode === "multi") return {
    durationSeconds: seconds, mode, available, durations: timing[preset][seconds], shots: multiDirection(preset, seconds),
    grammar: (seconds === 5 ? "Fast accents and direct scale changes: "
      : seconds === 10 ? "Develop each view with travel and a resolved hold: "
        : "Patient discovery, breathing space and extended campaign resolution: ")
      + (preset === "cinematic-hero" ? "Overview, surface, reframed visible angle, evidenced construction, hero"
      : preset === "macro-detail-reveal" ? "Detail first, adjacent texture, context reset, recognizable hero"
        : "Silhouette, editorial contour, isolated detail, campaign hero"),
    transitions: "Direct cuts between entries only; match visible outline or detail position. No in-shot cuts or invented angles.",
  };
  let shot: Beat;
  if (preset === "cinematic-hero" && seconds === 5) shot = { ...cinematic[0], ...cinematicHeroSingleFiveSeconds };
  else if (preset === "cinematic-hero") shot = seconds === 10
    ? beat("hero-reveal", "Short lateral camera glide", "Full product; offset start to balanced finish", "A narrow highlight traces the visible contour", "Two-second settle; six-second glide; final hold")
    : beat("hero-reveal", "Slow pull-back within the visible face", "Begin medium; finish full with campaign space", "Directional contour light with steady fill", "Three-second settle; eight-second reveal; hold");
  else if (preset === "macro-detail-reveal") shot = seconds === 5
    ? beat("macro-detail", "Locked close framing", "Resolvable evidenced detail; clear margins", "Grazing light reveals existing relief", "Brief focus settle; sustained detail hold")
    : seconds === 10
      ? beat("material-study", "Short lateral macro camera glide", "Trace one evidenced detail at resolvable scale", "Raking light defines existing relief", "Two-second settle; six-second trace; hold")
      : beat("final-hero", "Slow pull-back within the visible face", "Start on evidenced detail; finish full product", "Steady grazing light and gentle fill", "Four-second detail; eight-second reveal; hold");
  else shot = seconds === 5
    ? beat("lighting-reveal", "Locked long-lens overview", "Complete silhouette; asymmetric negative space", "A narrow contour highlight travels slowly", "Poised reveal; confident final hold")
    : seconds === 10
      ? beat("hero-reveal", "Short lateral long-lens camera glide", "Full silhouette across generous campaign space", "Sculpted side light with restrained fill", "Three-second poise; four-second glide; hold")
      : beat("hero-reveal", "Slow long-lens pull-back within the visible face", "Medium opening opens to full campaign margins", "Feathered side light shapes the contour", "Four-second poise; seven-second reveal; hold");
  return { durationSeconds: seconds, mode, available, durations: [seconds], shots: [shot],
    grammar: "One continuous take; one camera trajectory, staged light or focus, final hold",
    transitions: "Continuous only; no montage, cuts, dissolves or scene changes" };
}
