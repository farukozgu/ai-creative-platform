import type { VideoGenerationDraft } from "../video-generation/types";
import { interpretCreativeIntent, type CreativeIntentContract } from "./creative-request";

/** Only a complete, contiguous Shot 1: ... Shot N: brief fixes the scene count. */
export function numberedCreativeBeats(request: string): string[] {
  const labels = [...request.matchAll(/\bshot\s+(\d+)\s*:/gi)];
  if (labels.length < 2 || labels.length > 5 || labels.some((label, index) => Number(label[1]) !== index + 1)) return [];
  const beats = labels.map((label, index) => request.slice(label.index! + label[0].length, labels[index + 1]?.index).trim());
  return beats.every(Boolean) ? beats : [];
}

type Evidence = { id: number; detail: string }[];
export function customCreativeIntent(request: string, evidence: Evidence, shotMode: "single" | "multi",
  camera: VideoGenerationDraft["cameraMovement"]): CreativeIntentContract {
  const intent = interpretCreativeIntent(request, evidence, shotMode, camera, true);
  if (shotMode !== "multi" || !numberedCreativeBeats(request).length) return intent;
  // Numbered beats own their camera/focus decisions. A final spin request must
  // never force a lateral camera or a detail task onto every earlier beat.
  return { ...intent, camera: camera === "orbit" ? "auto" : camera, focusEvidenceId: null, focusPosition: "any", sequence: "preset" };
}

export function staticCustomFraming(camera: string) {
  return /^(?:(?:locked|static|fixed)\s+)?(?:(?:low[ -]angle|high[ -]angle|eye[ -]level|overhead|top[ -]down)\s+)?(?:medium|close[ -]up|close|wide|full|macro)\s*(?:shot|framing|view)$/i.test(camera.trim())
    || /^(?:low[ -]angle|high[ -]angle|eye[ -]level|overhead|top[ -]down)\s+framing$/i.test(camera.trim());
}

export function executableCustomCamera(camera: string) {
  if (/\bauto\b|^(?:automatic|default|unspecified|any|director.?s? choice|creative freedom)\b/i.test(camera.trim())) return false;
  if (staticCustomFraming(camera)) return true;
  if (/\b(?:camera|lens|viewpoint)\s+(?:orbits?|circles?|revolves?|arcs?)\b|^\s*(?:orbit|circle around|revolve around)\b/i.test(camera)) return true;
  // Vertical verbs require a camera subject, a camera-directed imperative, or
  // a named rig. A model dropping a hand is not a camera trajectory.
  const vertical = /(?:descend(?:s|ing)?|drop(?:s|ping)?|lower(?:s|ing)?|rise|rises|rising|raise|raises|raising|ascend(?:s|ing)?)/;
  if (new RegExp(`\\bcamera\\s+(?:(?:slowly|gently|smoothly)\\s+)?${vertical.source}\\b`, "i").test(camera)
    || new RegExp(`^\\s*${vertical.source}\\s+(?:the\\s+)?camera\\b`, "i").test(camera)
    || /^\s*(?:descend(?:ing)?|ascend(?:ing)?)\s+(?:toward|towards|to|into|beneath|through)\b/i.test(camera)
    || /\bcamera\s+(?:moves?|moving|travels?|traveling|travelling)\s+(?:downward|upward|down|up)\b/i.test(camera)
    || /^\s*(?:move|travel)\s+(?:(?:the\s+)?camera\s+)?(?:downward|upward|down|up)\b/i.test(camera)
    || /\b(?:tilt|crane|boom|pedestal)\s+(?:down|up)\b/i.test(camera)) return true;
  return /\b(?:locked|static|fixed|dolly|push|pull|pan|tilt|track|tracking|crane|lateral|slide|glide|arc|handheld|hand-held)\b/i.test(camera);
}

function trajectoryCue(value: string, userBeat = false) {
  if (/\b(?:then|and)\s+(?:camera\s+)?(?:rises?|descends?|ascends?|lowers?|raises?|pan\w*|tilt\w*|doll\w*|track\w*|retreat\w*|move\w*|crane\w*)\b/i.test(value)) return { canonical: null, explicit: true };
  const cues: [RegExp, string][] = [
    [/\b(?:lateral\s+arc|curved\s+lateral\s+move)\b/i, "Short controlled lateral arc"],
    [/\b(?:forward tracking|tracking\s+(?:forward|toward)|track\s+forward|dolly[ -]in|push[ -]in)\b/i, "Track forward"],
    [/\b(?:backward tracking|tracking\s+(?:backward|away)|track\s+backward|dolly[ -]out|pull[ -]back)\b/i, "Track backward"],
    [/\b(?:downward|lowering|descending)\b|\b(?:lower|drop)\s+(?:the\s+)?camera\b|\bcamera\s+(?:drops?|descends?|(?:moves?\s+)?lower)\b/i, "Lower camera"],
    [/\b(?:upward|rising|ascending)\b|\b(?:raise|lift)\s+(?:the\s+)?camera\b|\bcamera\s+(?:rises?|ascends?|(?:moves?\s+)?higher)\b/i, "Raise camera"],
    [/\bpan(?:ning)?\s+left\b/i, "Pan left"], [/\bpan(?:ning)?\s+right\b/i, "Pan right"],
    [/\btilt(?:ing)?\s+down\b/i, "Tilt down"], [/\btilt(?:ing)?\s+up\b/i, "Tilt up"],
    [/\bcrane\s+down\b/i, "Crane down"], [/\bcrane\s+up\b/i, "Crane up"],
    [/\blateral\s+(?:camera\s+)?(?:move|movement)\b/i, "Lateral camera move"],
  ];
  const verticalCameraContext = /\b(?:camera|lens|viewpoint)\s+(?:(?:slowly|gently|smoothly)\s+)?(?:moves?|travels?|drops?|descends?|ascends?|lowers?|raises?|rises?)\b|\b(?:lower|drop|raise|lift)\s+(?:the\s+)?camera\b|^\s*(?:descend|ascend|downward camera|upward camera)\b/i.test(value);
  const matches = [...new Set(cues.filter(([pattern, canonical]) => pattern.test(value)
    && (!userBeat || !["Lower camera", "Raise camera"].includes(canonical) || verticalCameraContext)).map(([, canonical]) => canonical))];
  const explicit = matches.length > 0 || /\b(?:360|orbit|whip|corkscrew|figure[ -]eight|camera movement|camera trajectory)\b|\b(?:camera|lens|viewpoint)\s+(?:performs?|follows?|swoops?|sweeps?|moves?|tracks?|pans?|tilts?|cranes?|arcs?|circles?)\b/i.test(value)
    || /kamera/i.test(value) && /aşağı|asagi|yukarı|yukari|indir|yüksel|yuksel|kaydır|kaydir|yaklaş|yaklas|uzaklaş|uzaklas|döndür|dondur/i.test(value);
  return { canonical: matches.length === 1 ? matches[0] : null, explicit };
}

function framingCue(value: string) {
  const angle = /\blow[ -]angle\b/i.test(value) ? "low-angle" : /\bhigh[ -]angle\b/i.test(value) ? "high-angle"
    : /\beye[ -]level\b/i.test(value) ? "eye-level" : /\b(?:overhead|top[ -]down)\b/i.test(value) ? "overhead" : "";
  const scale = /\bmacro\b/i.test(value) ? "macro" : /\b(?:close(?:[ -]up)?|detail)\b/i.test(value) ? "close-up"
    : /\bmedium\b/i.test(value) ? "medium" : /\b(?:wide|full|complete)\b/i.test(value) ? "wide" : "";
  return angle || scale ? `Locked ${[angle, scale].filter(Boolean).join(" ")} framing` : null;
}

/** Only the caller's pure Custom/auto camera rejection may use this normalizer. */
export function normalizeCustomCamera(camera: string, context: { composition: string; userBeat: string }): string | null {
  if (/^\s*(?:the\s+)?(?:model|product|foot|feet|fabric|rain|street)\b/i.test(camera)) return null;
  const original = trajectoryCue(camera);
  const requested = trajectoryCue(context.userBeat, true);
  const interpreted = interpretCreativeIntent(context.userBeat, [], "single", "auto", true);
  // Also protect existing TR/EN intent recognition; do not invent an equivalent
  // for an unrecognized, compound, orbit or hidden-side request.
  const explicit = requested.explicit || interpreted.camera !== "auto" || interpreted.safeAdjustment !== "none";
  if (requested.explicit && !requested.canonical && interpreted.camera !== "static" || interpreted.safeAdjustment !== "none") return null;
  const cameraFraming = /^(?:(?:low[ -]angle|high[ -]angle|eye[ -]level)\s+)?(?:medium|close(?:[ -]up)?|wide|full|macro|low[ -]angle|high[ -]angle|eye[ -]level|overhead|top[ -]down)(?:\s+(?:shot|view|framing))?(?:\s+(?:of|on|at|with)\b.*)?$/i.test(camera.trim());
  const framing = cameraFraming ? framingCue(camera) : null;
  if (interpreted.camera === "static") return original.explicit ? null : framing;
  if (original.canonical) {
    if (explicit && requested.canonical !== original.canonical) return null;
    return original.canonical;
  }
  if (original.explicit) return null;
  if (explicit) return framing && requested.canonical ? requested.canonical : null;
  if (framing) return framing;
  const generic = /^(?:auto|camera:\s*auto|automatic camera movement|cinematic camera|dynamic camera|professional camera|default|director's choice)$/i.test(camera.trim());
  if (!generic || !/\b(?:medium|close|detail|wide|full|complete|model|product|silhouette|hero|grate|pose)\b/i.test(context.composition)) return null;
  return framingCue(context.composition) ?? "Locked medium framing";
}

export function cameraTrajectoryInMotion(motion: string) {
  return /\b(?:camera|lens|viewpoint)\s+(?:(?:slowly|gently|smoothly)\s+)?(?:track\w*|mov\w*|lower\w*|ris\w*|descend\w*|ascend\w*|pan\w*|tilt\w*|doll\w*|cran\w*|boom\w*|pedestal\w*|orbit\w*|circl\w*|arc\w*|revolv\w*)\b/i.test(motion);
}

export function unsafeCameraOrbit(camera: string) {
  return /\b(?:orbit\w*|360|circl\w*\s+around|revolv\w*\s+around)\b|\b(?:camera|lens|viewpoint)\s+(?:circl\w*|revolv\w*)\b/i.test(camera);
}

/** Reject explicit environment/object imports from another beat, without guessing
 * new creative beats or treating shared product/framing vocabulary as leakage. */
export function foreignCameraContext(camera: string, local: string, others: string[]) {
  const subjects = /\b(?:grate|foot|feet|street|sidewalk|rain|rainy|NYC|studio|beach|forest|kitchen|bedroom|ocean|sand|snow)\b/gi;
  const tokens = [...camera.matchAll(subjects)].map(match => match[0].toLowerCase());
  const has = (value: string, token: string) => new RegExp(`\\b${token}\\b`, "i").test(value);
  return tokens.find(token => !has(local, token) && others.some(other => has(other, token))) ?? null;
}
