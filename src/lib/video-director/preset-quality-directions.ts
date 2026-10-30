import type { DurationStrategy } from "./duration-strategy";
import type { Direction, ShotPurpose } from "./preset-contract";

export const qualityPresetVersions = { "material-detail": 2, "macro-detail-reveal": 4, "product-spotlight": 2 } as const;
export type QualityPresetId = keyof typeof qualityPresetVersions;
type FocusRole = "texture" | "feature" | "form";
type Beat = Direction & { purpose: ShotPurpose };
type QualityDirection = DurationStrategy & { focusRoles: readonly FocusRole[]; shotGrammar: readonly string[]; evidenceDirection: string };
type Evidence = { id: number; detail: string };

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
