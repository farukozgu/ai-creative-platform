import type { ProductProfile } from "@/lib/product-understanding/product-profile";
import { videoStudioPresetIds } from "@/features/video/video-preset-catalog";
import { isUnsafeProductMotion, productVideoNegativePrompt, VIDEO_PRESERVATION_VERSION } from "@/lib/video-generation/preservation";
import type { VideoGenerationDraft } from "@/lib/video-generation/types";
import { VIDEO_DIRECTOR_VERSION, videoDirectorPresets, getVideoDirectorPreset, shotPurposes, type ShotPurpose, type VideoPresetId, type VideoShotMode } from "./presets";
import { cinematicHeroSingleNegativeTerms } from "./preset-library";
import { categoryPresentationDirection, categoryProductDetailDirection, categoryFashionMotionDirection, categoryPerspectiveDirection, categoryLightingDirection, categoryCraftDirection, categoryPrecisionDirection, categoryLuxuryDirection, categoryMinimalDirection, categorySpotlightDirection, categoryMaterialDirection, categoryMacroDirection, qualityFallbackDirection, qualityPresetDirection } from "./preset-quality-directions";
import { compileKlingShot } from "./kling-compiler";
import { unsupportedProductClaim, interpretCreativeIntent, type CreativeIntentContract } from "./creative-request";
import { customCreativeIntent, executableCustomCamera, numberedCreativeBeats, staticCustomFraming, cameraTrajectoryInMotion, unsafeCameraOrbit, foreignCameraContext, normalizeCustomCamera } from "./custom-brief";
import { KLING_MULTI_PROMPT_MAX_CHARS } from "../video-generation/fal-request";
import { directorProductContext } from "./product-context";
import { presetFocusEvidence } from "./preset-recommendations";
import { DIRECTOR_GENERIC_FOCUS_VALUES, DIRECTOR_SHOT_TEXT_LIMIT, DIRECTOR_TEXT_LIMIT, DirectorStructuredOutputError, directorShotContract, selectedCameras, shotFields } from "./plan-contract";
export { DIRECTOR_GENERIC_FOCUS_VALUES, shotFields } from "./plan-contract";

import { backViewTerms, directorElementReferences, elementShotPrefix, klingElementReferences, parseReferenceReviews, referenceClaimDetails, referenceTextPreservation, type ReferenceReview } from "../video-generation/product-references";
import { isEditorialSideRole, productReferencePolicy, usesEditorialStoryboard } from "../video-generation/product-reference-policy";
import { compileD1FiveSecondShot, d1FiveSecondShots, isD1FiveSecondPlan, usesD1FiveSecondMulti } from "./five-second-multi";
import { compileLegacyD1FiveSecondShot, legacyD1FiveSecondShots } from "./five-second-multi-legacy";

export type VideoDirectorSelection = ({ presetId: VideoPresetId; creativeMode?: "preset" } | { creativeMode: "custom"; presetId?: never }) & { shotMode: VideoShotMode; receipt: string };
export type VideoDirectionId = VideoPresetId | "custom";
export const directorSelectionId = (selection: VideoDirectorSelection): VideoDirectionId => selection.creativeMode === "custom" ? "custom" : selection.presetId;
export const directorPresetVersion = (id: VideoDirectionId) => id === "custom" ? 1 : videoDirectorPresets[id].version;
export type VideoDirectorInput = {
  referenceImages?: { profile?: ProductProfile | null; prepared: Buffer; sourceSha256: string; purpose: string }[];
  draft: VideoGenerationDraft;
  presetId: VideoDirectionId;
  shotMode: VideoShotMode;
  profile: ProductProfile | null;
};
export type VideoDirectorShot = Record<typeof shotFields[number], string> & { durationSeconds: number; purpose: ShotPurpose; evidenceRefs: number[]; referenceIndex?: number };
export type VideoDirectorPlan = {
  version: typeof VIDEO_DIRECTOR_VERSION;
  presetId: VideoDirectionId;
  presetVersion: number;
  shotMode: VideoShotMode;
  editorialStoryboard?: true;
  referenceReviews?: ReferenceReview[];
  origin: "ai" | "fallback";
  intent: string;
  intentContract: CreativeIntentContract;
  summary: string;
  shots: VideoDirectorShot[];
};
export type KlingMultiPrompt = { prompt: string; duration: string }[];

export function presetCreativeIntent(input: VideoDirectorInput, evidence: { id: number; detail: string }[]) {
  const { prompt, cameraMovement } = input.draft;
  // Identity-preservation wording does not request a dedicated logo crop.
  const direction = prompt.replace(/\bdüğme\p{L}*/giu, "button")
    .replace(/\b(?:mevcut\s+)?(?:renk(?:leri?)?\s+ve\s+)?logoyu\s+koru\b/gi, "");
  const intent = interpretCreativeIntent(direction, evidence, input.shotMode, cameraMovement);
  if (input.shotMode === "single" && intent.sequence === "detail-to-hero" && intent.camera !== "auto" && intent.camera !== "dolly-out") {
    intent.sequence = "preset";
  }
  if (intent.focusEvidenceId === null) return intent;
  const requested = evidence.find(item => item.id === intent.focusEvidenceId);
  const supported = requested && requested.detail.length <= DIRECTOR_SHOT_TEXT_LIMIT
    && !unsupportedProductClaim(prompt, input.profile, evidence.map(item => item.detail));
  return { ...intent, focusRequested: true, focusEvidenceId: supported ? intent.focusEvidenceId : null };
}

function hasGoldenStoryboard(input: VideoDirectorInput) {
  return input.shotMode === "multi" && input.draft.durationSeconds === 10
    && videoStudioPresetIds.some(id => id === input.presetId);
}

const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const text = (v: unknown, max: number): v is string => typeof v === "string" && Boolean(v.trim()) && v.length <= max;
function matchesCreativeIntent(value: unknown, expected: CreativeIntentContract) {
  if (!record(value)) return false;
  const keys = ["camera", "focusRequested", "focusEvidenceId", "focusPosition", "sequence", "safeAdjustment"];
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key) && value[key] === expected[key as keyof CreativeIntentContract]);
}

type CameraKind = "static" | "dolly-in" | "dolly-out" | "pan-left" | "pan-right" | "lateral" | "other";
export function cameraKinds(value: string, custom = false): CameraKind[] {
  value = value.replace(/\b(?:fixed|static|stationary|still)\s+(?:lighting|lights?|background|product|model|subject|item|jacket)\b/gi, "")
    .replace(/\b(?:product|model|subject|item|jacket)\s+(?:stays?|remains?|is)\s+(?:stationary|still)\b/gi, "")
    .replace(/\b(?:all\s+)?product\s+parts\s+(?:still|stationary)\b/gi, "")
    .replace(/\b(?:then|and|to|with)\s+(?:(?:a|the)\s+)?(?:(?:brief|calm|final)\s+)*(?:locked|static|fixed|still)\s+(?:final\s+)?hold\b/gi, "");
  const matches: CameraKind[] = [];
  let lockedFraming = false;
  if (custom) {
    // Consume a compound trajectory as one semantic unit before classifying
    // the remaining independent instructions. Framing is orthogonal to motion.
    value = value.replace(/\b(?:lateral\s+(?:(?:controlled|gentle|slow|short)\s+)?arc(?:s|ing)?|curved\s+lateral\s+(?:move|movement))\b/gi, () => {
      matches.push("lateral");
      return "";
    }).replace(/\b(?:locked|fixed|static)\s+(?:(?:medium|close[ -]up|close|low[ -]angle|high[ -]angle|eye[ -]level|wide|full|overhead)\s+)*framing\b/gi, () => {
      lockedFraming = true;
      return "";
    });
    if (/\btrack(?:s|ing)?\s+forward\b/i.test(value)) matches.push("dolly-in");
    if (/\btrack(?:s|ing)?\s+backward\b/i.test(value)) matches.push("dolly-out");
  }
  if (/\b(?:locked|static|fixed|stationary|still)\b|\bno (?:camera )?movement\b/i.test(value)) matches.push("static");
  if (/\b(?:push(?:es|ing)?[ -]?(?:in|toward)|dolly[ -]?in|track(?:s|ing)?[ -]?in|zoom(?:s|ing)?[ -]?in|advance(?:s|ing)?|move(?:s|ment|ing)? closer|approach(?:es|ing)?)\b/i.test(value)) matches.push("dolly-in");
  if (/\b(?:pull(?:s|ing)?[ -]?(?:back|away)|dolly[ -]?out|zoom(?:s|ing)?[ -]?out|move(?:s|ment|ing)? away|retreat(?:s|ing)?)\b/i.test(value)) matches.push("dolly-out");
  if (/\bpan(?:s|ning)?[ -]?left\b/i.test(value)) matches.push("pan-left");
  if (/\bpan(?:s|ning)?[ -]?right\b/i.test(value)) matches.push("pan-right");
  if (!matches.includes("pan-left") && !matches.includes("pan-right") && /\b(?:lateral|sideways|slid(?:e|es|ing)|glid(?:e|es|ing)|truck(?:s|ing)?)\b/i.test(value)) matches.push("lateral");
  if (/\b(?:tilt(?:s|ing)?|sweep(?:s|ing)?|crane(?:s|ing)?|swing(?:s|ing)?|arc(?:s|ing)?)\b/i.test(value)) matches.push("other");
  if (custom && lockedFraming && !matches.length) matches.push("static");
  return [...new Set(matches)];
}
function frameScale(value: string): "close" | "full" | "medium" {
  return /macro|close|tight|crop/i.test(value) ? "close" : /full|wide|complete|silhouette|overview/i.test(value) ? "full" : "medium";
}
function carryLens(action: string, sourceCamera: string) {
  const lens = /long[ -]lens/i.test(sourceCamera) ? "Long-lens " : /\bmacro\b/i.test(sourceCamera) ? "Macro " : "";
  return lens ? `${lens}${action.charAt(0).toLowerCase()}${action.slice(1)}` : action;
}

/** A detail visible in a contextual product view is not a dedicated detail shot. */
function dedicatedDetail(shot: VideoDirectorShot) {
  const composition = shot.composition;
  // A whole-product composition remains contextual even when a detail is visible.
  if (/\b(?:full|wide\w*|complete|overview)\b/i.test(composition)
    && !/\b(?:focus on|finish on|isolated|fills? the frame)\b/i.test(composition)) return false;
  if (/\b(?:close|macro|tight|isolated|fills? the frame|focus on|finish on)\b/i.test(composition)) return true;
  if (/\b(?:full|wide\w*|complete|overview|recognizable|medium|context|hero|packshot)\b/i.test(composition)) return false;
  return /\bcrop\b/i.test(composition) || frameScale(shot.camera) === "close" || ["macro-detail", "material-study"].includes(shot.purpose);
}

function showDetailInContext(shot: VideoDirectorShot, composition: string): VideoDirectorShot {
  const camera = shot.camera.replace(/\b(?:macro|close|tight)(?:[- ]up)? (?:framing|view|crop)\b/gi, "medium product framing")
    .replace(/\b(?:macro|close)\s+(?=camera\b)/gi, "");
  return { ...shot, camera, composition, focus: "Source-visible product form", evidenceRefs: [] };
}

const detailWording = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function detailSubject(shot: VideoDirectorShot, profile: ProductProfile | null) {
  const focus = detailWording(shot.focus);
  const generic = DIRECTOR_GENERIC_FOCUS_VALUES.some(value => detailWording(value) === focus);
  const wording = generic ? shot.composition : `${shot.focus} ${shot.composition}`;
  // Canonical evidence IDs can describe the same physical feature in different words.
  const families = [
    /\b(?:logo\w*|label\w*|text|letter\w*|symbol\w*|emblem\w*|monogram\w*|embroider\w*)\b/i,
    /\b(?:zipper\w*|zip)\b/i, /\bbuttons?\b/i, /\b(?:collar|lapel)\w*\b/i,
    /\b(?:cap|lid|dispenser)\w*\b/i, /\b(?:dial|indices|markers?|watch face)\b/i,
    /\b(?:stone|setting)\w*\b/i, /\b(?:seam|stitch)\w*\b/i,
    /\b(?:texture|grain|weave|woven|fabric|surface|finish|material)\w*\b/i,
    /\bhandle\w*\b/i, /\b(?:strap|bracelet)\w*\b/i, /\b(?:clasp|buckle)\w*\b/i,
    /\b(?:sole|outsole|midsole)\w*\b/i, /\b(?:lace|lacing)\w*\b/i, /\bhinge\w*\b/i, /\bscreen\w*\b/i,
  ];
  const matchedNames = families.flatMap((pattern, index) => pattern.test(wording) ? [String(index)] : []);
  const names = matchedNames.length > 1 ? matchedNames.filter(name => name !== "8") : matchedNames;
  const regions = [
    ...(profile?.identityCriticalAttributes.flatMap(item => detailWording(item.attribute) === focus ? item.regions.map(region => region.location) : []) ?? []),
    ...[...(profile?.visibleBranding.logoRegions ?? []), ...(profile?.visibleBranding.textRegions ?? []), ...(profile?.visibleBranding.artworkRegions ?? [])]
      .filter(region => detailWording(region.description) === focus).map(region => region.location),
  ].map(detailWording).filter(location => location && !/^(?:front|side|product|surface|unknown)$/.test(location));
  const namedRegions = [...(generic ? shot.composition : shot.focus).toLowerCase().matchAll(/\b(?:chest|cuff|hem|collar|neck|brim|toe|heel|sleeve|waist)\b/g)].map(match => match[0]);
  return { focus: generic ? names.length ? "" : "unresolved visible detail" : focus, names, regions, namedRegions,
    position: /\b(left|right|upper|lower|top|bottom)\b/i.exec(wording)?.[1]?.toLowerCase().replace("top", "upper").replace("bottom", "lower") };
}

function sameDetail(a: VideoDirectorShot, b: VideoDirectorShot, profile: ProductProfile | null) {
  const first = detailSubject(a, profile), second = detailSubject(b, profile);
  if (first.focus && first.focus === second.focus) return true;
  if (first.regions.length && second.regions.length) return first.regions.some(region => second.regions.includes(region));
  if (first.namedRegions.length && second.namedRegions.length && !first.namedRegions.some(region => second.namedRegions.includes(region))) return false;
  if (first.position && second.position && ["left:right", "right:left", "upper:lower", "lower:upper"].includes(`${first.position}:${second.position}`)) return false;
  return first.names.some(name => second.names.includes(name));
}

function repeatedDetail(shots: VideoDirectorShot[], profile: ProductProfile | null) {
  return shots.findIndex((shot, index) => dedicatedDetail(shot)
    && shots.slice(0, index).some(previous => dedicatedDetail(previous) && sameDetail(previous, shot, profile)));
}

/** An explicit selection wins only where the model's camera direction conflicts. */
function resolveShotCamera(shot: VideoDirectorShot, preference: VideoGenerationDraft["cameraMovement"] | "lateral", direction?: string): VideoDirectorShot {
  if (preference === "auto") return shot;
  if (preference === "orbit") throw new Error("unsupported_camera");
  const selected = direction ?? (preference === "lateral" ? "Short lateral camera glide across the visible source view" : selectedCameras[preference]);
  if (!selected) throw new Error("unsupported_camera");
  const conflict = (value: string) => cameraKinds(value).some(kind => kind !== preference)
    || preference === "static" && /\b(?:camera|frame)\b.*\b(?:movement|motion|moving|track(?:ing)?)\b/i.test(value)
      && !/\bno (?:camera )?(?:movement|motion)\b/i.test(value);
  const kinds = cameraKinds(shot.camera);
  const framing = /\bmacro\b/i.test(shot.camera) ? "Macro framing. "
    : /\b(?:close[ -]?(?:up|framing|view)|closeup)\b/i.test(shot.camera) ? "Close framing. "
      : /\blong[ -]lens\b/i.test(shot.camera) ? "Long-lens framing. " : "";
  const camera = conflict(shot.camera) ? `${framing}${selected}` : kinds.includes(preference) ? shot.camera
    : `${shot.camera} ${selected}`.length <= DIRECTOR_SHOT_TEXT_LIMIT ? `${shot.camera} ${selected}` : selected;
  const result = { ...shot, camera };
  const replacements = {
    composition: "Frame the source-visible product according to the selected camera direction.",
    motion: "Follow the selected camera direction",
    pace: "Measured pacing and a calm final hold.",
    lighting: "Soft light preserves source colors",
    focus: "Keep source-visible product details sharp.",
  } as const;
  for (const field of ["composition", "motion", "pace", "lighting", "focus"] as const) {
    if (/\b(?:camera|frame|viewpoint|shot)\b/i.test(result[field]) && conflict(result[field])) result[field] = replacements[field];
  }
  return result;
}

/** Runtime validation remains necessary even with strict Structured Outputs. */
export type DirectorValidationFailure = { jsonPath: string; reasonCode: string; expected: string; matchedTerm?: string; originalShots?: unknown[]; failingPaths?: string[] };

export function parseCameraRepairs(value: unknown, paths: string[], shotCount: number): { shotIndex: number; camera: string }[] | null {
  const indices = paths.map(path => /^\$\.shots\[(\d+)\]\.camera$/.exec(path)).map(match => match ? Number(match[1]) : -1);
  if (!indices.length || new Set(indices).size !== indices.length || indices.some(index => index < 0 || index >= shotCount)
    || !record(value) || Object.keys(value).length !== 1 || !Array.isArray(value.cameraRepairs)
    || value.cameraRepairs.length !== indices.length) return null;
  const repairs: { shotIndex: number; camera: string }[] = [];
  for (const repair of value.cameraRepairs) {
    if (!record(repair) || Object.keys(repair).length !== 2 || !Number.isInteger(repair.shotIndex)
      || !indices.includes(Number(repair.shotIndex)) || repairs.some(item => item.shotIndex === repair.shotIndex)
      || !text(repair.camera, DIRECTOR_SHOT_TEXT_LIMIT) || !executableCustomCamera(repair.camera)) return null;
    repairs.push({ shotIndex: Number(repair.shotIndex), camera: repair.camera });
  }
  return repairs;
}

export function cameraPatchDiagnostics(value: unknown, paths: string[]) {
  const repairs: unknown[] = record(value) && Array.isArray(value.cameraRepairs) ? value.cameraRepairs : [];
  const indices = repairs.flatMap(repair => record(repair) && Number.isSafeInteger(repair.shotIndex) ? [Number(repair.shotIndex)] : []);
  const returnedPaths = indices.map(index => `$.shots[${index}].camera`);
  return { requestedPathCount: paths.length, returnedRepairCount: repairs.length, returnedShotIndexes: indices,
    duplicatePath: new Set(returnedPaths).size !== returnedPaths.length,
    missingPath: paths.some(path => !returnedPaths.includes(path)),
    extraPath: repairs.length !== indices.length || returnedPaths.some(path => !paths.includes(path)),
    valueTooLong: repairs.some(repair => record(repair) && typeof repair.camera === "string" && repair.camera.length > DIRECTOR_SHOT_TEXT_LIMIT),
    executableValidation: repairs.length > 0 && repairs.every(repair => record(repair) && typeof repair.camera === "string" && executableCustomCamera(repair.camera)) };
}

function parseShotFieldRepairs(value: unknown, paths: string[], shotCount: number): { shotIndex: number; field: "camera" | "motion"; value: string }[] | null {
  if (!record(value) || Object.keys(value).length !== 1 || !Array.isArray(value.shotRepairs) || value.shotRepairs.length !== paths.length) return null;
  const seen = new Set<string>();
  const patches: { shotIndex: number; field: "camera" | "motion"; value: string }[] = [];
  for (const patch of value.shotRepairs) {
    if (!record(patch) || Object.keys(patch).length !== 3 || !Number.isInteger(patch.shotIndex)
      || Number(patch.shotIndex) < 0 || Number(patch.shotIndex) >= shotCount || !["camera", "motion"].includes(String(patch.field))
      || !text(patch.value, DIRECTOR_SHOT_TEXT_LIMIT)) return null;
    const path = `$.shots[${patch.shotIndex}].${patch.field}`;
    if (!paths.includes(path) || seen.has(path) || patch.field === "camera" && !executableCustomCamera(patch.value)
      || patch.field === "motion" && cameraTrajectoryInMotion(patch.value)) return null;
    seen.add(path);
    patches.push({ shotIndex: Number(patch.shotIndex), field: patch.field as "camera" | "motion", value: patch.value });
  }
  return patches;
}

export function parseCoherenceFieldRepairs(value: unknown, paths: string[], shotCount: number) {
  if (!paths.length || new Set(paths).size !== paths.length || paths.some(path => {
    const match = /^\$\.shots\[(0|[1-9]\d*)\]\.(camera|motion)$/.exec(path);
    return !match || Number(match[1]) >= shotCount;
  }) || !record(value) || Object.keys(value).length !== 1 || !Array.isArray(value.fieldRepairs)) return null;
  return parseShotFieldRepairs({ shotRepairs: value.fieldRepairs }, paths, shotCount);
}

function deterministicUnsafeActionPatch(output: unknown, paths: string[], profile: ProductProfile | null) {
  if (!record(output) || !Array.isArray(output.shots)) return null;
  const actionRepairs: { shotIndex: number; field: "camera" | "motion"; value: string }[] = [];
  for (const path of paths) {
    const match = /^\$\.shots\[(\d+)\]\.(camera|motion)$/.exec(path);
    if (!match) return null;
    const shotIndex = Number(match[1]), field = match[2] as "camera" | "motion";
    const shot = output.shots[shotIndex];
    if (!record(shot) || typeof shot[field] !== "string") return null;
    const action = shot[field] as string;
    const rotation = /\b(?:360|spin\w*|revolv\w*|full\s+orbit)\b/i.test(action);
    if (!rotation || !/\b(?:product|garment|jacket|item|bottle|watch|ring|bag|shoe)\b/i.test(action)
      || /\b(?:open|unzip|unbutton|remove|morph|deform|recolor|redesign|change|replace)\b/i.test(action)
      || unsupportedProductClaim(action, profile)) return null;
    actionRepairs.push({ shotIndex, field, value: field === "camera" ? "Short lateral source-facing reveal across visible surfaces"
      : /\b(?:suspended|floating)\b/i.test(String(shot.composition)) ? "Product remains suspended, still and source-facing" : "Product remains still and source-facing" });
  }
  return actionRepairs.length ? { actionRepairs } : null;
}

/** Labels describe trusted plan metadata; focus labels are complete verified atoms. */
export function directorPlanDescriptions(input: VideoDirectorInput, shotCount: number) {
  const summary = `${input.presetId} · ${input.shotMode} · ${shotCount} shots · ${input.draft.durationSeconds}s`;
  if (input.presetId === "custom") return { summary, intent: "User-directed creative sequence; preserve source product identity." };
  const labels: string[] = [];
  for (const { detail } of directorProductContext(input.profile).evidence) {
    if (unsupportedProductClaim(detail, input.profile) || labels.includes(detail)) continue;
    if (`Verified focus: ${[...labels, detail].join(" | ")}`.length > DIRECTOR_TEXT_LIMIT) continue;
    labels.push(detail);
    if (labels.length === 2) break;
  }
  return { summary, intent: labels.length ? `Verified focus: ${labels.join(" | ")}` : "Source-visible product form." };
}
export function fixedQuickCutsDirectorPlan(input: VideoDirectorInput): VideoDirectorPlan | null {
  if (input.presetId !== "cinematic-hero" || input.shotMode !== "multi" || input.draft.durationSeconds !== 10) return null;
  const context = directorProductContext(input.profile);
  const featurePatterns: Record<string, RegExp> = {
    apparel: /\b(?:seam|stitch\w*|panel)\b/i,
    cosmetics: /\b(?:label|cap)\b/i,
    watches: /\b(?:dial|marker\w*|indices|setting)\b/i,
    jewelry: /\b(?:setting\w*)\b/i,
    footwear: /\b(?:upper|sole|lace\w*|lacing)\b/i,
    bags: /\b(?:handle|clasp|zip\w*|stitch\w*|panel|hardware)\b/i,
    headwear: /\b(?:brim|stitch\w*|panel)\b/i,
    eyewear: /\b(?:frame|rim|hinge)\b/i,
  };
  const eligible = context.evidence.filter(item => item.detail.length <= DIRECTOR_SHOT_TEXT_LIMIT
    && !/\b(?:and|with|plus|or)\b|[,;+/&]/i.test(item.detail));
  const feature = featurePatterns[context.category];
  const chosen = (feature ? eligible.find(item => feature.test(item.detail)) : undefined)
    ?? eligible.find(item => /\b(?:surface|texture|edge|contour|relief)\b/i.test(item.detail));
  const execution = getVideoDirectorPreset(input.presetId, input.shotMode, input.draft.durationSeconds).execution!;
  const shots: VideoDirectorShot[] = execution.shots.map((direction, index) => ({ ...direction,
    durationSeconds: 2, motion: "Product still; retain source orientation",
    focus: index === 1 ? chosen?.detail ?? "Source-visible surface detail" : "Source-visible product form",
    evidenceRefs: index === 1 && chosen ? [chosen.id] : [],
  }));
  return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
    shotMode: input.shotMode, origin: "fallback", ...directorPlanDescriptions(input, shots.length),
    intentContract: interpretCreativeIntent(input.draft.prompt, context.evidence, input.shotMode, input.draft.cameraMovement), shots };
}
export function fixedMacroDirectorPlan(input: VideoDirectorInput, macroStoryboard = true, honorFocus = true): VideoDirectorPlan | null {
  if (input.presetId !== "macro-detail-reveal") return null;
  const context = directorProductContext(input.profile);
  if (macroStoryboard && input.shotMode === "multi" && input.draft.durationSeconds === 10) {
    const featurePatterns: Record<string, RegExp> = {
      apparel: /\b(?:seam|stitch\w*|panel)\b/i,
      cosmetics: /\b(?:label|logo|cap)\b/i,
      watches: /\b(?:dial|marker\w*|indices|setting)\b/i,
      jewelry: /\b(?:setting\w*)\b/i,
      footwear: /\b(?:upper|sole|lace\w*|lacing)\b/i,
      eyewear: /\b(?:frame|rim|hinge)\b/i,
    };
    // Select one evidence atom, never a combined list of independent targets.
    const eligible = context.evidence.filter(item => item.detail.length <= DIRECTOR_SHOT_TEXT_LIMIT
      && !/\b(?:and|with|plus|or)\b|[,;+/&]/i.test(item.detail));
    const intentContract = presetCreativeIntent(input, context.evidence);
    const feature = featurePatterns[context.category];
    const chosen = honorFocus && intentContract.focusRequested && intentContract.focusPosition === "any"
      ? eligible.find(item => item.id === intentContract.focusEvidenceId)
      : (feature ? eligible.find(item => feature.test(item.detail)) : undefined)
        ?? eligible.find(item => /\b(?:surface|texture|edge|contour|relief)\b/i.test(item.detail));
    const shots: VideoDirectorShot[] = [
      { purpose: "hero-reveal", durationSeconds: 3, camera: "Locked medium product framing",
        composition: "Complete product; clean margins; source-facing view",
        lighting: "Soft neutral directional studio light", motion: "Product still; retain source orientation",
        pace: "Brief product orientation", focus: "Source-visible product form", evidenceRefs: [] },
      { purpose: "macro-detail", durationSeconds: 4, camera: "Locked macro framing",
        composition: "One region at source-resolvable macro scale",
        lighting: "Grazing soft light reveals existing relief", motion: "Product still; retain source orientation",
        pace: "Restrained local inspection", focus: chosen?.detail ?? "Source-visible surface detail", evidenceRefs: chosen ? [chosen.id] : [] },
      { purpose: "final-hero", durationSeconds: 3, camera: "Slow pull-back to full product framing",
        composition: "Restore complete recognizable product in frame",
        lighting: "Resolved soft fill preserves original appearance", motion: "Product still; retain source orientation",
        pace: "Clear recognition hold", focus: "Source-visible product form", evidenceRefs: [] },
    ];
    return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
      shotMode: input.shotMode, origin: "fallback", ...directorPlanDescriptions(input, shots.length),
      intentContract, shots };
  }
  const template = categoryMacroDirection(context.category, input.shotMode, input.draft.durationSeconds);
  if (!template) return null;
  const assigned: VideoDirectorShot[] = [];
  const shots = template.shots.map((direction, index): VideoDirectorShot => {
    const detail = index === 0 || input.shotMode === "multi" && input.draft.durationSeconds === 10 && index === 1;
    const chosen = detail ? context.evidence.find(item => item.detail.length <= DIRECTOR_SHOT_TEXT_LIMIT
      && template.patterns[index].test(item.detail) && !assigned.some(previous => sameDetail(previous, { ...direction, durationSeconds: 1, evidenceRefs: [], focus: item.detail }, input.profile))) : undefined;
    if (detail && !chosen && !template.allowWideFallback) throw new DirectorStructuredOutputError("insufficient_fixed_macro_evidence");
    const shot = { ...direction, ...(detail && !chosen ? { camera: "Locked wide product framing", lighting: "Soft diffuse light preserves source colors",
      composition: index === 0 ? "Complete product in its original presentation" : "Wide product view with offset margins" } : {}),
      durationSeconds: template.durations[index], focus: chosen?.detail ?? "Source-visible product form", evidenceRefs: chosen ? [chosen.id] : [] };
    if (detail) assigned.push(shot);
    return shot;
  });
  return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
    shotMode: input.shotMode, origin: "fallback", ...directorPlanDescriptions(input, shots.length),
    intentContract: interpretCreativeIntent(input.draft.prompt, context.evidence, input.shotMode, input.draft.cameraMovement), shots };
}
export function fixedMaterialDirectorPlan(input: VideoDirectorInput, surfaceStoryboard = true): VideoDirectorPlan | null {
  if (input.presetId !== "material-detail") return null;
  const context = directorProductContext(input.profile);
  if (surfaceStoryboard && input.shotMode === "multi" && input.draft.durationSeconds === 10) {
    // Surface observations only. Keep one bounded evidence atom, not a feature or a list of regions.
    const chosen = context.evidence.find(item => item.detail.length <= 80
      && /\b(?:surface|texture|relief|weave|woven|pattern\w*|grain|smooth\w*|reflect\w*|matte|gloss\w*|edge transition)\b/i.test(item.detail)
      && !/\b(?:logo\w*|label\w*|clasp|hinge|dial|marker\w*|button\w*|mechanism|hardware|seam|stitch\w*|and|with|plus|or)\b|[,;+/&]/i.test(item.detail));
    const shots: VideoDirectorShot[] = [
      { purpose: "hero-reveal", durationSeconds: 3, camera: "Locked medium-close product framing",
        composition: "Recognizable product section; full form context",
        lighting: "Soft directional light defines visible surface", motion: "Product and camera still; source-facing",
        pace: "Brief surface context", focus: "Source-visible product form", evidenceRefs: [] },
      { purpose: "material-study", durationSeconds: 4, camera: "Very short source-facing lateral macro glide",
        composition: "One source-resolvable surface region",
        lighting: "Grazing light angle shifts subtly", motion: "Product stays still",
        pace: "Restrained surface study", focus: chosen?.detail ?? "Source-visible surface detail", evidenceRefs: chosen ? [chosen.id] : [] },
      { purpose: "final-hero", durationSeconds: 3, camera: "Locked balanced product framing",
        composition: "Complete recognizable source-facing product",
        lighting: "Resolved soft fill preserves surface character", motion: "Product and camera still; source-facing",
        pace: "Clear commercial hero hold", focus: "Source-visible product form", evidenceRefs: [] },
    ];
    return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
      shotMode: input.shotMode, origin: "fallback", ...directorPlanDescriptions(input, shots.length),
      intentContract: interpretCreativeIntent(input.draft.prompt, context.evidence, input.shotMode, input.draft.cameraMovement), shots };
  }
  const template = categoryMaterialDirection(context.category, input.shotMode, input.draft.durationSeconds);
  if (!template) return null;
  const assigned: VideoDirectorShot[] = [];
  const shots = template.shots.map((direction, index): VideoDirectorShot => {
    const detail = index === 0 || input.shotMode === "multi" && input.draft.durationSeconds === 10 && index === 1;
    const chosen = detail ? context.evidence.find(item => item.detail.length <= DIRECTOR_SHOT_TEXT_LIMIT
      && template.patterns[index].test(item.detail) && !assigned.some(previous => sameDetail(previous, { ...direction, durationSeconds: 1, evidenceRefs: [], focus: item.detail }, input.profile))) : undefined;
    if (detail && !chosen && !template.allowWideFallback) throw new DirectorStructuredOutputError("insufficient_fixed_macro_evidence");
    const shot = { ...direction, ...(detail && !chosen ? { camera: "Locked wide product framing",
      composition: index === 0 ? "Complete product in its original presentation" : "Wide product view with offset margins" } : {}),
      durationSeconds: template.durations[index], focus: chosen?.detail ?? "Source-visible product form", evidenceRefs: chosen ? [chosen.id] : [] };
    if (detail) assigned.push(shot);
    return shot;
  });
  return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
    shotMode: input.shotMode, origin: "fallback", ...directorPlanDescriptions(input, shots.length),
    intentContract: interpretCreativeIntent(input.draft.prompt, context.evidence, input.shotMode, input.draft.cameraMovement), shots };
}
export function fixedPrecisionDirectorPlan(input: VideoDirectorInput): VideoDirectorPlan | null {
  if (input.presetId !== "precision-macro") return null;
  const context = directorProductContext(input.profile);
  const template = categoryPrecisionDirection(context.category, input.shotMode, input.draft.durationSeconds);
  if (!template) return null;
  const assigned: VideoDirectorShot[] = [];
  const shots = template.shots.map((direction, index): VideoDirectorShot => {
    const detail = index === (input.shotMode === "multi" && input.draft.durationSeconds === 10 ? 1 : 0);
    const chosen = detail ? context.evidence.find(item => item.detail.length <= DIRECTOR_SHOT_TEXT_LIMIT
      && template.patterns[index].test(item.detail) && !assigned.some(previous => sameDetail(previous, { ...direction, durationSeconds: 1, evidenceRefs: [], focus: item.detail }, input.profile))) : undefined;
    if (detail && !chosen && !template.allowWideFallback) throw new DirectorStructuredOutputError("insufficient_fixed_macro_evidence");
    const shot = { ...direction, ...(detail && !chosen ? { camera: "Locked wide product framing",
      composition: index === 0 ? "Complete product in its original presentation" : "Wide product view with offset margins" } : {}),
      durationSeconds: template.durations[index], focus: chosen?.detail ?? "Source-visible product form", evidenceRefs: chosen ? [chosen.id] : [] };
    if (detail) assigned.push(shot);
    return shot;
  });
  return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
    shotMode: input.shotMode, origin: "fallback", ...directorPlanDescriptions(input, shots.length),
    intentContract: interpretCreativeIntent(input.draft.prompt, context.evidence, input.shotMode, input.draft.cameraMovement), shots };
}
export function fixedCraftDirectorPlan(input: VideoDirectorInput): VideoDirectorPlan | null {
  if (!["macro-stitching", "hardware-reveal", "craftsmanship-study"].includes(input.presetId)) return null;
  const context = directorProductContext(input.profile);
  const template = categoryCraftDirection(input.presetId, context.category, input.shotMode, input.draft.durationSeconds);
  if (!template) return null;
  const assigned: VideoDirectorShot[] = [];
  const shots = template.shots.map((direction, index): VideoDirectorShot => {
    const detail = index === template.detailIndex;
    const chosen = detail ? context.evidence.find(item => item.detail.length <= DIRECTOR_SHOT_TEXT_LIMIT
      && template.patterns[index].test(item.detail) && !assigned.some(previous => sameDetail(previous, { ...direction, durationSeconds: 1, evidenceRefs: [], focus: item.detail }, input.profile))) : undefined;
    if (detail && !chosen && !template.allowWideFallback) throw new DirectorStructuredOutputError("insufficient_fixed_macro_evidence");
    const shot = { ...direction, ...(detail && !chosen ? { camera: "Locked wide product framing",
      composition: index === 0 ? "Complete product in its original presentation" : "Wide product view with offset margins" } : {}),
      durationSeconds: template.durations[index], focus: chosen?.detail ?? "Source-visible product form", evidenceRefs: chosen ? [chosen.id] : [] };
    if (detail) assigned.push(shot);
    return shot;
  });
  return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
    shotMode: input.shotMode, origin: "fallback", ...directorPlanDescriptions(input, shots.length),
    intentContract: interpretCreativeIntent(input.draft.prompt, context.evidence, input.shotMode, input.draft.cameraMovement), shots };
}
export function fixedPerspectiveDirectorPlan(input: VideoDirectorInput): VideoDirectorPlan | null {
  if (!["elegant-orbit", "optical-lines", "cinematic-dial"].includes(input.presetId)) return null;
  const context = directorProductContext(input.profile);
  const template = categoryPerspectiveDirection(input.presetId, context.category, input.shotMode, input.draft.durationSeconds);
  if (!template) return null;
  const assigned: VideoDirectorShot[] = [];
  const shots = template.shots.map((direction, index): VideoDirectorShot => {
    const detail = index === template.detailIndex;
    const chosen = detail ? context.evidence.find(item => item.detail.length <= DIRECTOR_SHOT_TEXT_LIMIT
      && template.patterns[index].test(item.detail) && !assigned.some(previous => sameDetail(previous, { ...direction, durationSeconds: 1, evidenceRefs: [], focus: item.detail }, input.profile))) : undefined;
    if (detail && !chosen && !template.allowWideFallback) throw new DirectorStructuredOutputError("insufficient_fixed_macro_evidence");
    const shot = { ...direction, ...(detail && !chosen ? { camera: "Locked wide product framing",
      composition: index === 0 ? "Complete product in its original presentation" : "Wide product view with offset margins" } : {}),
      durationSeconds: template.durations[index], focus: chosen?.detail ?? "Source-visible product form", evidenceRefs: chosen ? [chosen.id] : [] };
    if (detail) assigned.push(shot);
    return shot;
  });
  return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
    shotMode: input.shotMode, origin: "fallback", ...directorPlanDescriptions(input, shots.length),
    intentContract: interpretCreativeIntent(input.draft.prompt, context.evidence, input.shotMode, input.draft.cameraMovement), shots };
}
export function fixedFashionMotionDirectorPlan(input: VideoDirectorInput, floatingStoryboard = true): VideoDirectorPlan | null {
  if (!["floating-fashion", "fabric-motion", "floating-accessory"].includes(input.presetId)) return null;
  const context = directorProductContext(input.profile);
  if (floatingStoryboard && input.presetId === "floating-accessory" && input.shotMode === "multi" && input.draft.durationSeconds === 10) {
    const shots: VideoDirectorShot[] = [
      { purpose: "hero-reveal", durationSeconds: 3, camera: "Locked medium hero framing",
        composition: "Complete product; clean studio; open margins",
        lighting: "Broad soft directional studio light", motion: "Gentle suspended upward drift; source-facing",
        pace: "Calm weightless opening", focus: "Source-visible product form", evidenceRefs: [] },
      { purpose: "controlled-motion", durationSeconds: 4, camera: "Locked medium-close framing",
        composition: "Whole source-facing silhouette; open margins",
        lighting: "Soft edge light traces visible silhouette", motion: "Small rise then soft settle; source-facing",
        pace: "One controlled float cycle", focus: "Source-visible product form", evidenceRefs: [] },
      { purpose: "final-hero", durationSeconds: 3, camera: "Locked balanced hero framing",
        composition: "Complete recognizable product; balanced margins",
        lighting: "Clean soft hero separation", motion: "Damped float settles to a near-still hold",
        pace: "Resolved calm finish", focus: "Source-visible product form", evidenceRefs: [] },
    ];
    return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
      shotMode: input.shotMode, origin: "fallback", ...directorPlanDescriptions(input, shots.length),
      intentContract: interpretCreativeIntent(input.draft.prompt, context.evidence, input.shotMode, input.draft.cameraMovement), shots };
  }
  const template = categoryFashionMotionDirection(input.presetId, context.category, input.shotMode, input.draft.durationSeconds);
  if (!template) return null;
  const assigned: VideoDirectorShot[] = [];
  const shots = template.shots.map((direction, index): VideoDirectorShot => {
    const detail = index === template.detailIndex;
    const chosen = detail ? context.evidence.find(item => item.detail.length <= DIRECTOR_SHOT_TEXT_LIMIT
      && template.patterns[index].test(item.detail) && !assigned.some(previous => sameDetail(previous, { ...direction, durationSeconds: 1, evidenceRefs: [], focus: item.detail }, input.profile))) : undefined;
    if (detail && !chosen && !template.allowWideFallback) throw new DirectorStructuredOutputError("insufficient_fixed_macro_evidence");
    const shot = { ...direction, ...(detail && !chosen ? { camera: "Locked wide product framing",
      composition: index === 0 ? "Complete product in its original presentation" : "Wide product view with offset margins" } : {}),
      durationSeconds: template.durations[index], focus: chosen?.detail ?? "Source-visible product form", evidenceRefs: chosen ? [chosen.id] : [] };
    if (detail) assigned.push(shot);
    return shot;
  });
  return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
    shotMode: input.shotMode, origin: "fallback", ...directorPlanDescriptions(input, shots.length),
    intentContract: interpretCreativeIntent(input.draft.prompt, context.evidence, input.shotMode, input.draft.cameraMovement), shots };
}
export function fixedProductDetailDirectorPlan(input: VideoDirectorInput): VideoDirectorPlan | null {
  if (!["label-reveal", "sneaker-hero", "upholstery-macro"].includes(input.presetId)) return null;
  const context = directorProductContext(input.profile);
  const template = categoryProductDetailDirection(input.presetId, context.category, input.shotMode, input.draft.durationSeconds);
  if (!template) return null;
  const assigned: VideoDirectorShot[] = [];
  const shots = template.shots.map((direction, index): VideoDirectorShot => {
    const detail = index === template.detailIndex;
    const chosen = detail ? context.evidence.find(item => item.detail.length <= DIRECTOR_SHOT_TEXT_LIMIT
      && template.patterns[index].test(item.detail) && !assigned.some(previous => sameDetail(previous, { ...direction, durationSeconds: 1, evidenceRefs: [], focus: item.detail }, input.profile))) : undefined;
    if (detail && !chosen && !template.allowWideFallback) throw new DirectorStructuredOutputError("insufficient_fixed_macro_evidence");
    const shot = { ...direction, ...(detail && !chosen ? { camera: "Locked wide product framing",
      composition: index === 0 ? "Complete product in its original presentation" : "Wide product view with offset margins" } : {}),
      durationSeconds: template.durations[index], focus: chosen?.detail ?? "Source-visible product form", evidenceRefs: chosen ? [chosen.id] : [] };
    if (detail) assigned.push(shot);
    return shot;
  });
  return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
    shotMode: input.shotMode, origin: "fallback", ...directorPlanDescriptions(input, shots.length),
    intentContract: interpretCreativeIntent(input.draft.prompt, context.evidence, input.shotMode, input.draft.cameraMovement), shots };
}
export function fixedPresentationDirectorPlan(input: VideoDirectorInput, windowStoryboard = true): VideoDirectorPlan | null {
  if (!["culinary-texture", "window-display"].includes(input.presetId)) return null;
  const context = directorProductContext(input.profile);
  if (windowStoryboard && input.presetId === "window-display" && input.shotMode === "multi" && input.draft.durationSeconds === 10) {
    const displayFraming = context.category === "apparel" ? "Complete product dominates source-safe display"
      : ["cosmetics", "watches", "jewelry"].includes(context.category) ? "Complete product dominates small pedestal display"
      : ["footwear", "bags", "headwear", "eyewear"].includes(context.category) ? "Complete product dominates elevated display platform"
      : context.category === "furniture" ? "Complete product dominates large showroom display"
      : ["food", "packaged-food"].includes(context.category) ? "Complete product dominates clean display shelf"
      : "Complete product dominates simple pedestal display";
    const shots: VideoDirectorShot[] = [
      { purpose: "hero-reveal", durationSeconds: 4, camera: "Slow restrained push toward storefront display",
        composition: "Full product prominent; minimal storefront display",
        lighting: "Soft display light; faint ambient light bands", motion: "Product still; source-facing orientation",
        pace: "Measured retail approach", focus: "Source-visible product form", evidenceRefs: [] },
      { purpose: "lighting-reveal", durationSeconds: 3, camera: "Short controlled source-facing lateral glide",
        composition: "Recognizable product at display window plane",
        lighting: "Display key; abstract band shifts on window", motion: "Product still; source-facing orientation",
        pace: "One restrained window accent", focus: "Source-visible product form", evidenceRefs: [] },
      { purpose: "final-hero", durationSeconds: 3, camera: "Locked premium display framing",
        composition: displayFraming,
        lighting: "Clean controlled retail hero light", motion: "Product still; source-facing orientation",
        pace: "Confident product hold", focus: "Source-visible product form", evidenceRefs: [] },
    ];
    return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
      shotMode: input.shotMode, origin: "fallback", ...directorPlanDescriptions(input, shots.length),
      intentContract: interpretCreativeIntent(input.draft.prompt, context.evidence, input.shotMode, input.draft.cameraMovement), shots };
  }
  const template = categoryPresentationDirection(input.presetId, context.category, input.shotMode, input.draft.durationSeconds);
  if (!template) return null;
  const assigned: VideoDirectorShot[] = [];
  const shots = template.shots.map((direction, index): VideoDirectorShot => {
    const detail = index === template.detailIndex;
    const chosen = detail ? context.evidence.find(item => item.detail.length <= DIRECTOR_SHOT_TEXT_LIMIT
      && template.patterns[index].test(item.detail) && !assigned.some(previous => sameDetail(previous, { ...direction, durationSeconds: 1, evidenceRefs: [], focus: item.detail }, input.profile))) : undefined;
    if (detail && !chosen && !template.allowWideFallback) throw new DirectorStructuredOutputError("insufficient_fixed_macro_evidence");
    const shot = { ...direction, ...(detail && !chosen ? { camera: "Locked wide product framing",
      composition: index === 0 ? "Complete product in its original presentation" : "Wide product view with offset margins" } : {}),
      durationSeconds: template.durations[index], focus: chosen?.detail ?? "Source-visible product form", evidenceRefs: chosen ? [chosen.id] : [] };
    if (detail) assigned.push(shot);
    return shot;
  });
  return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
    shotMode: input.shotMode, origin: "fallback", ...directorPlanDescriptions(input, shots.length),
    intentContract: interpretCreativeIntent(input.draft.prompt, context.evidence, input.shotMode, input.draft.cameraMovement), shots };
}
export function fixedLuxuryDirectorPlan(input: VideoDirectorInput): VideoDirectorPlan | null {
  if (input.presetId !== "luxury-fashion-film") return null;
  const context = directorProductContext(input.profile);
  const template = categoryLuxuryDirection(context.category, input.shotMode, input.draft.durationSeconds);
  if (!template) return null;
  const assigned: VideoDirectorShot[] = [];
  const shots = template.shots.map((direction, index): VideoDirectorShot => {
    const detail = input.shotMode === "multi" && index === 2;
    const chosen = detail ? context.evidence.find(item => item.detail.length <= DIRECTOR_SHOT_TEXT_LIMIT
      && template.patterns[index].test(item.detail) && !assigned.some(previous => sameDetail(previous, { ...direction, durationSeconds: 1, evidenceRefs: [], focus: item.detail }, input.profile))) : undefined;
    if (detail && !chosen && !template.allowWideFallback) throw new DirectorStructuredOutputError("insufficient_fixed_macro_evidence");
    const shot = { ...direction, ...(detail && !chosen ? { camera: "Locked wide product framing",
      composition: "Wide product view with offset margins" } : {}),
      ...(context.category === "watches" && !context.evidence.some(item => /dial/i.test(item.detail)) ? { camera: direction.camera.replace("within the visible face", "to full product framing"), composition: detail && !chosen ? "Wide product view with offset margins" : direction.composition.replace("same visible face", "same source view") } : {}),
      durationSeconds: template.durations[index], focus: chosen?.detail ?? "Source-visible product form", evidenceRefs: chosen ? [chosen.id] : [] };
    if (detail) assigned.push(shot);
    return shot;
  });
  return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
    shotMode: input.shotMode, origin: "fallback", ...directorPlanDescriptions(input, shots.length),
    intentContract: interpretCreativeIntent(input.draft.prompt, context.evidence, input.shotMode, input.draft.cameraMovement), shots };
}
export function fixedSpotlightDirectorPlan(input: VideoDirectorInput): VideoDirectorPlan | null {
  if (input.presetId !== "product-spotlight") return null;
  const context = directorProductContext(input.profile);
  const template = categorySpotlightDirection(context.category, input.shotMode, input.draft.durationSeconds);
  if (!template) return null;
  return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
    shotMode: input.shotMode, origin: "fallback", ...directorPlanDescriptions(input, template.shots.length),
    intentContract: interpretCreativeIntent(input.draft.prompt, context.evidence, input.shotMode, input.draft.cameraMovement),
    shots: template.shots.map((direction, index) => ({ ...direction, durationSeconds: template.durations[index], focus: "Source-visible product form", evidenceRefs: [] })) };
}
export function fixedMinimalDirectorPlan(input: VideoDirectorInput, signatureStoryboard = true, axialDiscipline = true): VideoDirectorPlan | null {
  if (input.presetId !== "minimal-studio") return null;
  const context = directorProductContext(input.profile);
  if (signatureStoryboard && input.shotMode === "multi" && input.draft.durationSeconds === 10) {
    // Primary-image evidence only. Color/material names alone are not a visible region.
    const detail = context.evidence.find(item => /\b(?:contour|surface|texture|grain|seam|stitch\w*|collar|label|logo|panel|edge|cap|lacing|lace\w*|sole|closure)\b/i.test(item.detail));
    const shots: VideoDirectorShot[] = [
      { purpose: "hero-reveal", durationSeconds: 4, camera: axialDiscipline ? "Straight axial long-lens push-in" : "Slow long-lens push-in",
        composition: "Full product inside frame; clean premium negative space",
        lighting: "Soft sculpted directional studio light", motion: axialDiscipline ? "Product stays perfectly fixed and source-facing" : "Product still; source orientation unchanged",
        pace: "Restrained establishment", focus: "Source-visible product form", evidenceRefs: [] },
      { purpose: "lighting-reveal", durationSeconds: 3, camera: "Short lateral camera glide",
        composition: detail ? "One verified region at source-resolved scale" : "Visible contour and surface with clear margins",
        lighting: "Controlled highlight travels across visible surface", motion: "Product still; source orientation unchanged",
        pace: "Measured light reveal", focus: detail?.detail ?? "Source-visible surface detail", evidenceRefs: detail ? [detail.id] : [] },
      { purpose: "final-hero", durationSeconds: 3, camera: axialDiscipline ? "Locked static hero framing" : "Locked hero framing",
        composition: "Complete product; clean advertising frame",
        lighting: "Resolved soft directional hero light", motion: axialDiscipline ? "Product and camera remain completely still and source-facing for the entire shot" : "Product still; settle into final hold",
        pace: axialDiscipline ? "Stable three-second premium hero hold" : "Resolved final hold", focus: "Source-visible product form", evidenceRefs: [] },
    ];
    return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
      shotMode: input.shotMode, origin: "fallback", ...directorPlanDescriptions(input, shots.length),
      intentContract: interpretCreativeIntent(input.draft.prompt, context.evidence, input.shotMode, input.draft.cameraMovement), shots };
  }
  const template = categoryMinimalDirection(context.category, input.shotMode, input.draft.durationSeconds);
  if (!template) return null;
  return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
    shotMode: input.shotMode, origin: "fallback", ...directorPlanDescriptions(input, template.shots.length),
    intentContract: interpretCreativeIntent(input.draft.prompt, context.evidence, input.shotMode, input.draft.cameraMovement),
    shots: template.shots.map((direction, index) => ({ ...direction, durationSeconds: template.durations[index], focus: "Source-visible product form", evidenceRefs: [] })) };
}
export function fixedLightingDirectorPlan(input: VideoDirectorInput, lightingStoryboard = true, legacyLightSweep = false): VideoDirectorPlan | null {
  if (!["glass-reflection", "dramatic-backlight", "metallic-light-sweep"].includes(input.presetId)) return null;
  const context = directorProductContext(input.profile);
  if (lightingStoryboard && input.presetId === "dramatic-backlight" && input.shotMode === "multi" && input.draft.durationSeconds === 10) {
    const shots: VideoDirectorShot[] = [
      { purpose: "hero-reveal", durationSeconds: 3, camera: "Locked medium hero framing",
        composition: "Dark neutral studio; full silhouette; clean margins",
        lighting: "Dim neutral rim light; silhouette stays readable", motion: "Product and camera still; source-facing",
        pace: "Quiet shadow establishment", focus: "Source-visible product form", evidenceRefs: [] },
      { purpose: "lighting-reveal", durationSeconds: 4, camera: "Locked medium-close source-facing framing",
        composition: "Dark neutral studio; source-facing medium form",
        lighting: "Soft rim light grows into a neutral key", motion: "Product and camera still; source-facing",
        pace: "One gradual reveal", focus: "Source-visible product form", evidenceRefs: [] },
      { purpose: "final-hero", durationSeconds: 3, camera: "Locked balanced hero framing",
        composition: "Dark neutral studio; complete source-facing product",
        lighting: "Stable low-key fill; clear form and separation", motion: "Product and camera still; source-facing",
        pace: "Confident final hold", focus: "Source-visible product form", evidenceRefs: [] },
    ];
    return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
      shotMode: input.shotMode, origin: "fallback", ...directorPlanDescriptions(input, shots.length),
      intentContract: interpretCreativeIntent(input.draft.prompt, context.evidence, input.shotMode, input.draft.cameraMovement), shots };
  }
  if (lightingStoryboard && input.presetId === "metallic-light-sweep" && input.shotMode === "multi" && input.draft.durationSeconds === 10) {
    // Retain the locked storyboard for existing receipts and explicit camera selections.
    const moving = !legacyLightSweep && input.draft.cameraMovement === "auto";
    const fixedProduct = "Product fixed and source-facing";
    const shots: VideoDirectorShot[] = [
      { purpose: "hero-reveal", durationSeconds: 3, camera: moving ? "Slow straight axial push-in" : "Locked medium hero framing",
        composition: "Complete product; clean studio; balanced negative space",
        lighting: "Restrained soft directional light defines form", motion: moving ? fixedProduct : "Product and camera stay still",
        pace: "Quiet setup before sweep", focus: "Source-visible product form", evidenceRefs: [] },
      { purpose: "lighting-reveal", durationSeconds: 4, camera: moving ? "Slow controlled axial push to close framing" : "Locked close product framing",
        composition: "Visible contour and surface; source-facing view",
        lighting: "One soft highlight travels left-to-right on surface", motion: moving ? fixedProduct : "Product and camera stay still",
        pace: "One measured light pass", focus: "Source-visible surface detail", evidenceRefs: [] },
      { purpose: "final-hero", durationSeconds: 3, camera: moving ? "Very slow controlled axial pull-back into balanced hero framing" : "Locked balanced hero framing",
        composition: "Complete product; clean advertising frame",
        lighting: "Clean key/fill; stronger separation than opening", motion: moving ? fixedProduct : "Product and camera still; final hold",
        pace: moving ? "Stable hero hold for final 1s" : "Resolved advertising hold", focus: "Source-visible product form", evidenceRefs: [] },
    ];
    return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
      shotMode: input.shotMode, origin: "fallback", ...directorPlanDescriptions(input, shots.length),
      intentContract: interpretCreativeIntent(input.draft.prompt, context.evidence, input.shotMode, input.draft.cameraMovement), shots };
  }
  const template = categoryLightingDirection(input.presetId, context.category, input.shotMode, input.draft.durationSeconds);
  if (!template) return null;
  return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
    shotMode: input.shotMode, origin: "fallback", ...directorPlanDescriptions(input, template.shots.length),
    intentContract: interpretCreativeIntent(input.draft.prompt, context.evidence, input.shotMode, input.draft.cameraMovement),
    shots: template.shots.map((direction, index) => ({ ...direction, durationSeconds: template.durations[index], focus: "Source-visible product form", evidenceRefs: [] })) };
}
function fixedFallbackPlan(input: VideoDirectorInput) {
  const fixed = ["culinary-texture", "window-display"].includes(input.presetId) ? fixedPresentationDirectorPlan(input) : ["label-reveal", "sneaker-hero", "upholstery-macro"].includes(input.presetId) ? fixedProductDetailDirectorPlan(input) : ["floating-fashion", "fabric-motion", "floating-accessory"].includes(input.presetId) ? fixedFashionMotionDirectorPlan(input) : ["elegant-orbit", "optical-lines", "cinematic-dial"].includes(input.presetId) ? fixedPerspectiveDirectorPlan(input) : ["glass-reflection", "dramatic-backlight", "metallic-light-sweep"].includes(input.presetId) ? fixedLightingDirectorPlan(input) : ["macro-stitching", "hardware-reveal", "craftsmanship-study"].includes(input.presetId) ? fixedCraftDirectorPlan(input) : input.presetId === "precision-macro" ? fixedPrecisionDirectorPlan(input) : input.presetId === "luxury-fashion-film" ? fixedLuxuryDirectorPlan(input) : input.presetId === "minimal-studio" ? fixedMinimalDirectorPlan(input) : input.presetId === "product-spotlight" ? fixedSpotlightDirectorPlan(input) : input.presetId === "material-detail" ? fixedMaterialDirectorPlan(input) : fixedMacroDirectorPlan(input);
  return fixed ? applyFixedPlanIntent(fixed, input) : null;
}

function editorialStoryboard(input: VideoDirectorInput, reviews: ReferenceReview[]): VideoDirectorPlan | null {
  if (!usesEditorialStoryboard(input)) return null;
  const signature = input.presetId === "minimal-studio";
  const base = signature ? fixedMinimalDirectorPlan(input)! : fixedLightingDirectorPlan(input)!;
  const refs = input.draft.productReferences ?? [];
  const assetIdentity = (source: NonNullable<VideoGenerationDraft["source"]>) =>
    source.kind === "uploaded-image" ? "uploaded-image:" + source.sourceAssetId : "generated-image:" + source.generationId;
  const primary = input.draft.source && assetIdentity(input.draft.source);
  const candidates = signature || productReferencePolicy(input.profile) === "watch"
    ? reviews.filter(review => review.status === "matched" && review.view === "side" && review.wholeSideVisible === true
      && refs[review.index] && isEditorialSideRole(refs[review.index].purpose) && assetIdentity(refs[review.index].source) !== primary)
    : [];
  const alternate = candidates.sort((a, b) => {
    const left = refs[a.index], right = refs[b.index];
    return Number(right.purpose === "side-profile") - Number(left.purpose === "side-profile")
      || left.sha256.localeCompare(right.sha256)
      || assetIdentity(left.source).localeCompare(assetIdentity(right.source));
  })[0];
  const [opening, inspection, hero] = base.shots;
  const criticalDetails = signature && !alternate ? reviews.flatMap(review => review.status === "matched" && review.view === "detail"
    && refs[review.index]?.purpose === "critical-detail" ? review.details : []) : [];
  const detail = criticalDetails.length ? directorProductContext(input.profile).evidence.find(item => item.detail.length <= DIRECTOR_SHOT_TEXT_LIMIT
    && criticalDetails.some(value => value.toLowerCase() === item.detail.toLowerCase()) && !unsupportedProductClaim(item.detail, input.profile)) : undefined;
  const middle: VideoDirectorShot = {
    ...inspection,
    camera: signature ? "Locked offset medium framing" : "Locked offset close framing",
    composition: alternate ? (signature ? "Verified side silhouette with open margins" : "Visible contour on the verified side")
      : signature ? (detail || inspection.evidenceRefs.length ? "One verified region with offset margins" : "Visible contour in offset negative space")
        : "Visible contour and surface in an offset primary-view crop",
    lighting: signature ? "Steady directional key defines the contour" : "One soft highlight travels left-to-right across the visible surface",
    motion: alternate ? "Product fixed in the verified orientation" : "Product fixed and source-facing",
    pace: signature ? "Measured editorial inspection" : "One measured highlight pass",
    ...(alternate ? { referenceIndex: alternate.index, focus: "Source-visible surface detail", evidenceRefs: [] }
      : detail ? { focus: detail.detail, evidenceRefs: [detail.id] } : {}),
  };
  const shots = signature ? [opening, middle, { ...hero, composition: "Complete product centered in a balanced advertising frame",
    lighting: "Clean key and soft fill separate the product" }]
    : [
      { ...opening, camera: "Locked full product framing", motion: "Product fixed and source-facing" },
      middle,
      { ...hero, camera: "Locked balanced hero framing", motion: "Product and camera still; source-facing", pace: "Stable full-product hold for all 3s" },
    ];
  return { ...applyFixedPlanIntent(base, input), editorialStoryboard: true, shots, ...(reviews.length ? { referenceReviews: reviews } : {}) };
}

export function fixedLegacyDirectorPlan(input: VideoDirectorInput) {
  return hasGoldenStoryboard(input) ? null : fixedFallbackPlan(input);
}

function applyFixedPlanIntent(plan: VideoDirectorPlan, input: VideoDirectorInput): VideoDirectorPlan {
  const evidence = directorProductContext(input.profile).evidence;
  const intent = presetCreativeIntent(input, evidence);
  if (hasGoldenStoryboard(input)) return { ...plan, intentContract: intent };
  if (intent.camera === "auto" && !intent.focusRequested && intent.sequence === "preset") return { ...plan, intentContract: intent };

  const requested = evidence.find(item => item.id === intent.focusEvidenceId);
  const last = plan.shots.length - 1;
  const existingFocus = requested ? plan.shots.findIndex(shot => shot.evidenceRefs.includes(requested.id)) : -1;
  const detailShot = plan.shots.findIndex(dedicatedDetail);
  const focusIndex = intent.focusPosition === "last" ? last
    : intent.focusPosition === "first" || intent.sequence === "detail-to-hero" ? 0 : Math.max(0, existingFocus >= 0 ? existingFocus : detailShot);
  const shots = plan.shots.map((original, index) => {
    let shot = original;
    const focusHere = intent.focusRequested && index === focusIndex;
    if (focusHere) shot = { ...shot, focus: requested?.detail ?? "Source-visible product form", evidenceRefs: requested ? [requested.id] : [] };

    let camera = intent.camera;
    if (camera === "in-out") camera = index === 0 ? "dolly-in" : index === last ? "dolly-out" : "auto";
    if (camera === "auto" && last === 0 && intent.sequence === "detail-to-hero") camera = "dolly-out";
    if (input.draft.cameraMovement === "auto" && last > 0 && intent.sequence === "preset") {
      if (camera === "dolly-in" && index !== 0 || camera === "dolly-out" && index !== last) camera = "auto";
    }
    if (camera !== "auto") {
      // Retain the light and visual job. A take with a different trajectory
      // cannot also promise the preset's original widening action.
      if (camera !== "dolly-out" && cameraKinds(shot.camera).includes("dolly-out")) {
        shot = { ...shot,
          composition: /\b(?:start|finish|opening|opens|resolves)\b/i.test(shot.composition)
            ? dedicatedDetail(shot) ? "Resolvable evidenced feature with clear margins" : "Complete product with balanced campaign space"
            : shot.composition,
          pace: /\b(?:widen|pull-back|reveal \d+s)\b/i.test(shot.pace) ? "Measured light study; final hold" : shot.pace,
        };
      }
      const direction = input.draft.cameraMovement === "auto" && camera === "dolly-in"
        ? "Slow dolly-in within the visible source view" : undefined;
      shot = resolveShotCamera(shot, camera, direction);
    }
    if (intent.sequence === "detail-to-hero") {
      if (last === 0) shot = { ...shot,
        composition: "Start in close framing on the visible product, then finish on the complete visible product" };
      else if (index === 0) shot = { ...shot, composition: "Start close on one source-visible region" };
      else if (index === last) shot = { ...shot, composition: "Complete visible product with balanced margins" };
    }
    if (focusHere && requested && intent.focusPosition === "last") {
      shot = { ...shot, composition: "Finish on the verified source-visible detail" };
    }
    return shot;
  });
  const focused = shots[focusIndex];
  if (intent.focusRequested && dedicatedDetail(focused)) {
    // Reserving the requested region can displace a preset's original detail.
    // Its other beat becomes product context instead of repeating the crop.
    for (const [index, shot] of shots.entries()) {
      if (index === focusIndex || !dedicatedDetail(shot) || !sameDetail(focused, shot, input.profile)) continue;
      shots[index] = showDetailInContext(shot, "Complete product around the visible region");
    }
  }
  return { ...plan, shots, intentContract: intent,
    intent: "Explicit camera, evidence-backed focus and feasible shot order are applied; unsupported details stay source-bound.",
    ...(intent.safeAdjustment === "unseen-side-to-source-facing-camera" ? {
      summary: "The requested unseen-side turn is replaced with a source-facing camera move; verified product details and color remain unchanged.",
    } : intent.focusRequested && !requested ? {
      summary: "The requested detail is not verified in the product profile, so the plan uses a source-visible view without inventing it.",
    } : {}),
  };
}

export function parseDirectorOutput(value: unknown, input: VideoDirectorInput, onReject?: (failure: DirectorValidationFailure) => void): VideoDirectorPlan | null {
  const reject = (jsonPath: string, reasonCode: string, expected: string, matchedTerm?: string) => { onReject?.({ jsonPath, reasonCode, expected, ...(matchedTerm ? { matchedTerm: matchedTerm.slice(0, 60) } : {}) }); return null; };
  if (![5, 10].includes(input.draft.durationSeconds)) return reject("$.durationSeconds", "unsupported_duration", "5 or 10 seconds");
  const custom = input.presetId === "custom";
  const goldenStoryboard = hasGoldenStoryboard(input);
  if (record(value) && value.editorialStoryboard !== undefined && (value.editorialStoryboard !== true || !usesEditorialStoryboard(input))) {
    return reject("$.editorialStoryboard", "invalid_editorial_storyboard", "Signature Studio or Light Sweep 10s Multi");
  }
  const beats = custom && input.shotMode === "multi" ? numberedCreativeBeats(input.draft.prompt) : [];
  const historicalD1 = usesD1FiveSecondMulti(input) && record(value) && Array.isArray(value.shots) && value.shots.length === 2;
  const earlierD1Edit = usesD1FiveSecondMulti(input) && record(value) && Array.isArray(value.shots) && [4, 5].includes(value.shots.length);
  // Earlier signed edits retain their original bounds only during verification.
  const contractBounds = directorShotContract(input.shotMode, input.draft.durationSeconds,
    historicalD1 ? undefined : earlierD1Edit ? "cinematic-hero" : input.presetId, input.draft.prompt);
  if (input.draft.cameraMovement === "orbit" || !record(value) || !text(value.summary, DIRECTOR_TEXT_LIMIT) || !text(value.intent, DIRECTOR_TEXT_LIMIT) || !Array.isArray(value.shots)
    || value.shots.length < contractBounds.minShots || value.shots.length > contractBounds.maxShots
) return reject("$", "invalid_plan_envelope", "summary/intent <= 240 chars and shot count matching shotMode and duration");
  // Receipts from the removed feature must be replanned, not silently reused.
  if ("identity" in value || "identityEvidence" in value) return reject("$", "unsupported_plan_fields", "current Director schema");
  const count = input.draft.productReferences?.length ?? 0;
  let referenceFailure: { path: string; reason: string } | undefined;
  const referenceReviews = parseReferenceReviews(value.referenceReviews, count, (path, reason) => { referenceFailure = { path, reason }; });
  if (!referenceReviews) return reject(referenceFailure?.path ?? "$.referenceReviews", "invalid_reference_reviews", referenceFailure?.reason ?? `exactly ${count} ordered reviews`);
  if (referenceReviews.some(review => review.status !== "matched")) return reject("$.referenceReviews", "references_not_verified", "every uploaded reference verified before generation");
  if (usesD1FiveSecondMulti(input) && referenceReviews.some(review => review.wholeViewVisible !== undefined && typeof review.wholeViewVisible !== "boolean")) {
    return reject("$.referenceReviews", "invalid_reference_reviews", "D1 whole-view completeness must be boolean");
  }
  const d1Storyboard = usesD1FiveSecondMulti(input) && value.shots.length !== 2;
  if (d1Storyboard && !earlierD1Edit && referenceReviews.some(review => review.creativeSafeSide !== undefined && typeof review.creativeSafeSide !== "boolean")) {
    return reject("$.referenceReviews", "invalid_reference_reviews", "D1 creative-side safety must be boolean");
  }
  const baseEvidence = directorProductContext(input.profile).evidence;
  const additionsWithSource = (referenceReviews ?? []).filter(r => r.status === "matched").flatMap(review => review.details.map(detail => ({ detail, review })));
  const additions = additionsWithSource.map(item => item.detail);
  const evidence = [...baseEvidence, ...additions.map((detail, index) => ({ id: baseEvidence.length + index, detail }))];
  const enrichedProfile = input.profile ? { ...input.profile, identityCriticalAttributes: [...input.profile.identityCriticalAttributes,
    ...additions.map(attribute => ({ attribute, rationale: "reference-visible", regions: [] }))] } : null;
  const descriptions = directorPlanDescriptions(input, value.shots.length);
  for (const field of ["summary", "intent"] as const) {
    // Exact server-owned preset/mode labels are metadata, never inferred facts.
    // Every included evidence label was separately validated before composition.
    if (value[field] === descriptions[field]) continue;
    const matchedTerm = unsupportedProductClaim(value[field] as string, enrichedProfile);
    if (matchedTerm) return reject(`$.${field}`, "unsupported_product_claim", "only claims supported by verified product evidence", matchedTerm);
  }
  const currentIntent = custom ? customCreativeIntent(input.draft.prompt, baseEvidence, input.shotMode, input.draft.cameraMovement)
    : presetCreativeIntent(input, baseEvidence);
  // Existing signed plans may carry the earlier interpretation. Provider
  // responses have no persisted envelope and must use the current contract.
  const persisted = value.version === VIDEO_DIRECTOR_VERSION && value.presetId === input.presetId
    && value.presetVersion === directorPresetVersion(input.presetId) && value.shotMode === input.shotMode;
  const legacyIntent = !custom && persisted && !matchesCreativeIntent(value.intentContract, currentIntent)
    ? interpretCreativeIntent(input.draft.prompt, baseEvidence, input.shotMode, input.draft.cameraMovement) : null;
  const expectedIntent = legacyIntent ?? currentIntent;
  if (!matchesCreativeIntent(value.intentContract, expectedIntent)) return reject("$.intentContract", "intent_contract_mismatch", "exact supplied camera/focus/sequence contract");
  const effectiveLegacyPlan = legacyIntent || d1Storyboard ? null : fixedLegacyDirectorPlan(input);
  const shots: VideoDirectorShot[] = [];
  const failingCameraPaths: string[] = [];
  const coherencePaths: string[] = [];
  const unsafeActionPaths: string[] = [];
  const shotContexts = value.shots.map((shot, index) => record(shot) ? `${beats[index] ?? ""} ${shot.composition} ${shot.focus}` : "");
  for (const shot of value.shots) {
    const focusText = record(shot) && typeof shot.focus === "string" ? shot.focus : "";
    const hasEvidenceRefs = record(shot) && Object.hasOwn(shot, "evidenceRefs");
    const suppliedEvidenceRefs: unknown[] = record(shot) && Array.isArray(shot.evidenceRefs) ? shot.evidenceRefs : [];
    const focusEvidenceToken = /^verified-evidence:(0|[1-9]\d*)$/.exec(focusText);
    const tokenEvidenceId = focusEvidenceToken ? Number(focusEvidenceToken[1]) : null;
    const tokenEvidence = tokenEvidenceId === null ? undefined : evidence[tokenEvidenceId];
    const exactFocusMatches = evidence.filter(item => item.detail === focusText);
    // A compact schema token is an explicit reference, not free-form detail.
    // Resolve it only against verified evidence; exact legacy detail values are
    // likewise linked only when they identify one unambiguous evidence atom.
    const evidenceRefs = suppliedEvidenceRefs.length === 0
      ? tokenEvidence ? [tokenEvidence.id] : exactFocusMatches.length === 1 ? [exactFocusMatches[0].id] : suppliedEvidenceRefs
      : suppliedEvidenceRefs;
    const resolvedFocus = tokenEvidence?.detail ?? focusText;
    if (!record(shot) || typeof shot.durationSeconds !== "number" || !Number.isInteger(shot.durationSeconds)
      || shot.durationSeconds < (input.shotMode === "multi" ? contractBounds.minDuration : 1) || shot.durationSeconds > 10
      || !shotPurposes.includes(shot.purpose as ShotPurpose)
      || !shotFields.every(field => text(shot[field], DIRECTOR_SHOT_TEXT_LIMIT))) return reject(`$.shots[${shots.length}]`, "invalid_shot_fields", "valid duration, purpose, evidenceRefs and bounded text");
    if (custom && !executableCustomCamera(shot.camera as string)) {
      failingCameraPaths.push(`$.shots[${shots.length}].camera`);
    }
    if (custom) {
      if (unsafeCameraOrbit(shot.camera as string) || foreignCameraContext(shot.camera as string, shotContexts[shots.length], shotContexts.filter((_, index) => index !== shots.length))) {
        coherencePaths.push(`$.shots[${shots.length}].camera`);
      }
      if (cameraTrajectoryInMotion(shot.motion as string)) {
        coherencePaths.push(`$.shots[${shots.length}].camera`, `$.shots[${shots.length}].motion`);
      }
    }
    const referenceIndex = shot.referenceIndex == null ? undefined : shot.referenceIndex;
    const shotReference = klingElementReferences(referenceReviews, input.draft.productReferences).find(review => review.index === referenceIndex);
    if (referenceIndex !== undefined && (!Number.isInteger(referenceIndex) || !shotReference)) {
      return reject(`$.shots[${shots.length}].referenceIndex`, "invalid_shot_reference", "an index of a matched product image");
    }
    const backShot = shotReference?.view === "back";
    if ((backShot || shotReference?.view === "side") && (input.shotMode !== "multi" || shots.length === 0)) {
      return reject(`$.shots[${shots.length}].referenceIndex`, "incompatible_reference_view", "alternate view only after the primary start shot in multi-shot");
    }
    if (hasEvidenceRefs && !Array.isArray(shot.evidenceRefs) || evidenceRefs.length > 1
      || evidenceRefs.some(id => !Number.isInteger(id) || !evidence[Number(id)])) {
      return reject(`$.shots[${shots.length}].evidenceRefs`, "invalid_evidence_reference", "at most one existing verified evidence id");
    }
    // Specific focus must quote an existing evidence atom, not model-invented detail.
    const focus = evidenceRefs.length ? evidence[Number(evidenceRefs[0])].detail : resolvedFocus;
    const focusSource = evidenceRefs.length ? additionsWithSource[Number(evidenceRefs[0]) - baseEvidence.length]?.review : undefined;
    if (focusSource) {
      return reject(`$.shots[${shots.length}].focus`, "preservation_reference_focus", "identity references preserve identity; primary product remains the shot subject");
    }
    if (backShot && evidenceRefs.length && !/silhouette|product form/i.test(focus)) {
      return reject(`$.shots[${shots.length}].focus`, "reference_focus_mismatch", "primary product silhouette or generic visible form; no front-only details");
    }
    if (!text(focus, DIRECTOR_SHOT_TEXT_LIMIT)) return reject(`$.shots[${shots.length}].focus`, "invalid_shot_fields", "focus <= 100 characters");
    if (custom) {
      const beatIntent = customCreativeIntent(beats[shots.length] ?? input.draft.prompt, baseEvidence, beats.length ? "single" : input.shotMode, input.draft.cameraMovement);
      const detailIntent = customCreativeIntent(`${focus} ${shot.composition}`, baseEvidence, "single", "auto");
      if (evidenceRefs.some(id => id !== beatIntent.focusEvidenceId)
        || dedicatedDetail(shot as VideoDirectorShot) && detailIntent.focusEvidenceId !== null && detailIntent.focusEvidenceId !== beatIntent.focusEvidenceId) {
        return reject(`$.shots[${shots.length}].focus`, "unrequested_detail_focus", "user-requested verified detail only; evidence otherwise preserves identity");
      }
      if (beats.length && beatIntent.focusEvidenceId !== null && !evidenceRefs.includes(beatIntent.focusEvidenceId)) {
        return reject(`$.shots[${shots.length}].focus`, "requested_focus_not_preserved", "requested verified focus in the same numbered beat");
      }
    }
    if ((focusEvidenceToken && (!tokenEvidence || evidenceRefs.length !== 1 || evidenceRefs[0] !== tokenEvidence.id))
      || focus !== resolvedFocus || !evidenceRefs.length && !DIRECTOR_GENERIC_FOCUS_VALUES.includes(focus as typeof DIRECTOR_GENERIC_FOCUS_VALUES[number])) {
      return reject(`$.shots[${shots.length}].focus`, "focus_not_evidence_bound", "a verified-evidence:<id> present in the validated product evidence, or an allowed generic focus without evidenceRefs");
    }
    for (const field of shotFields) {
      if (custom && coherencePaths.includes(`$.shots[${shots.length}].${field}`)) continue;
      if (custom && field === "camera" && !executableCustomCamera(shot.camera as string)) continue;
      const direction = field === "focus" ? focus : shot[field] as string;
      if (isUnsafeProductMotion(direction, input.draft.cameraMovement)
        || /\b(?:underside|interior|hidden mechanism|unseen surface|new (?:logo|label|accessory|prop)|open (?:the )?(?:cap|lid|clasp|zipper))\b/i.test(direction)
        || backViewTerms.test(direction.replace(/\b(?:pull[ -]back|pulling back)\b/gi, "")) && !backShot) {
        if (custom && (field === "camera" || field === "motion")) {
          unsafeActionPaths.push(`$.shots[${shots.length}].${field}`);
          continue;
        }
        return reject(`$.shots[${shots.length}].${field}`, "unsafe_product_action", "source-facing action without hidden surfaces or identity changes");
      }
      if (/\b(?:cuts? to|cutaway|crossfade|dissolve(?: to)?|montage|(?:hard|match|smash|jump) cuts?|scene changes?)\b/i.test(direction)) {
        return reject(`$.shots[${shots.length}].${field}`, "internal_scene_cut", "one continuous action per shot");
      }
      // Resolved focus is copied from canonical evidence, never reinterpreted prose.
      // A rear view inherits evidenced identity/color/material, not front-only parts.
      const backEvidence = backShot ? [...baseEvidence.filter(item => [...(input.profile?.materials ?? []), ...(input.profile?.dominantColors ?? [])].includes(item.detail)).map(item => item.detail),
        ...referenceClaimDetails(shotReference!)] : undefined;
      const matchedTerm = field !== "focus" ? unsupportedProductClaim(direction, enrichedProfile, backEvidence) : null;
      if (matchedTerm) {
        return reject(`$.shots[${shots.length}].${field}`, "unsupported_product_claim", "only claims supported by verified product evidence", matchedTerm);
      }
    }
    const resolved = resolveShotCamera({ durationSeconds: shot.durationSeconds, purpose: shot.purpose as ShotPurpose, evidenceRefs: evidenceRefs as number[],
      ...(referenceIndex !== undefined ? { referenceIndex: Number(referenceIndex) } : {}),
      ...Object.fromEntries(shotFields.map(field => [field, field === "focus" ? focus
        : field === "camera" && custom && staticCustomFraming(shot.camera as string) && !/\b(?:locked|static|fixed)\b/i.test(shot.camera as string)
          ? `Locked ${shot.camera}` : shot[field]])) } as VideoDirectorShot,
      goldenStoryboard || effectiveLegacyPlan || d1Storyboard ? "auto" : input.draft.cameraMovement);
    const movements = new Set(cameraKinds(resolved.camera, custom));
    for (const field of ["composition", "motion", "pace", "lighting", "focus"] as const) {
      if (custom && coherencePaths.includes(`$.shots[${shots.length}].${field}`)) continue;
      if (/\b(?:camera|frame|viewpoint|shot)\b/i.test(resolved[field])) cameraKinds(resolved[field], custom).forEach(kind => movements.add(kind));
    }
    if (movements.size > 1) return reject(`$.shots[${shots.length}].camera`, "conflicting_camera_directions", "one coherent camera trajectory");
    shots.push(resolved);
  }
  if (unsafeActionPaths.length) {
    onReject?.({ jsonPath: unsafeActionPaths[0], failingPaths: unsafeActionPaths, reasonCode: "unsafe_product_action",
      expected: "source-facing action without hidden surfaces or identity changes" });
    return null;
  }
  if (coherencePaths.length) {
    const failingPaths = [...new Set([...failingCameraPaths, ...coherencePaths])];
    onReject?.({ jsonPath: failingPaths[0], failingPaths, reasonCode: "custom_shot_coherence",
      expected: "shot-local source-facing camera; motion contains subject/product/environment action only" });
    return null;
  }
  if (failingCameraPaths.length) {
    onReject?.({ jsonPath: failingCameraPaths[0], failingPaths: failingCameraPaths, reasonCode: "non_executable_camera",
      expected: "concrete executable camera trajectory or framing; input auto is creative freedom" });
    return null;
  }
  if (shots.reduce((sum, shot) => sum + shot.durationSeconds, 0) !== input.draft.durationSeconds) return reject("$.shots[*].durationSeconds", "total_duration_mismatch", `sum exactly ${input.draft.durationSeconds} seconds`);
  if (d1Storyboard) {
    const expected = earlierD1Edit ? legacyD1FiveSecondShots(input, referenceReviews) : d1FiveSecondShots(input, referenceReviews);
    if (shots.length !== expected.length || shots.some((shot, index) => {
      const authored = expected[index];
      return shot.referenceIndex !== authored.referenceIndex || shot.durationSeconds !== authored.durationSeconds
        || shot.purpose !== authored.purpose || shotFields.some(field => shot[field] !== authored[field])
        || JSON.stringify(shot.evidenceRefs) !== JSON.stringify(authored.evidenceRefs);
    })) return reject("$.shots", "d1_storyboard_mismatch", "exact D1 5s shots and deterministic inspection binding");
  }
  const editorial = value.editorialStoryboard === true ? editorialStoryboard(input, referenceReviews) : null;
  if (editorial && (value.origin !== "fallback" || shots.length !== editorial.shots.length || !editorial.shots.every((expected, index) => {
    const shot = shots[index];
    return shot.referenceIndex === expected.referenceIndex && shot.durationSeconds === expected.durationSeconds
      && shot.purpose === expected.purpose && shotFields.every(field => shot[field] === expected[field])
      && JSON.stringify(shot.evidenceRefs) === JSON.stringify(expected.evidenceRefs);
  }))) return reject("$.shots", "editorial_storyboard_mismatch", "exact local storyboard and verified middle-shot binding");
  const signature = input.presetId === "minimal-studio" && input.shotMode === "multi" && input.draft.durationSeconds === 10
    ? fixedMinimalDirectorPlan(input) : null;
  const signatureMatches = signature && [signature, fixedMinimalDirectorPlan(input, true, false)!].some(candidate => shots.length === 3 && shots.every((shot, index) => {
    const expected = candidate.shots[index];
    return shot.durationSeconds === expected.durationSeconds && shot.purpose === expected.purpose
      && shotFields.every(field => shot[field] === expected[field])
      && JSON.stringify(shot.evidenceRefs) === JSON.stringify(expected.evidenceRefs);
  }));
  const lightSweep = input.presetId === "metallic-light-sweep" && input.shotMode === "multi" && input.draft.durationSeconds === 10
    ? fixedLightingDirectorPlan(input) : null;
  const lightSweepMatches = lightSweep && [lightSweep, fixedLightingDirectorPlan(input, true, true)!].some(candidate => shots.length === 3 && shots.every((shot, index) => {
    const expected = candidate.shots[index];
    return shot.durationSeconds === expected.durationSeconds && shot.purpose === expected.purpose
      && shotFields.every(field => shot[field] === expected[field]) && shot.evidenceRefs.length === 0;
  }));
  const macro = input.presetId === "macro-detail-reveal" && input.shotMode === "multi" && input.draft.durationSeconds === 10
    ? fixedMacroDirectorPlan(input) : null;
  const historicalMacro = persisted && macro && currentIntent.focusRequested ? fixedMacroDirectorPlan(input, true, false) : null;
  const macroMatches = macro && [macro, historicalMacro].some(candidate => candidate && shots.length === 3 && shots.every((shot, index) => {
    const expected = candidate.shots[index];
    return shot.durationSeconds === expected.durationSeconds && shot.purpose === expected.purpose
      && shotFields.every(field => shot[field] === expected[field])
      && JSON.stringify(shot.evidenceRefs) === JSON.stringify(expected.evidenceRefs);
  }));
  const floating = input.presetId === "floating-accessory" && input.shotMode === "multi" && input.draft.durationSeconds === 10
    ? fixedFashionMotionDirectorPlan(input) : null;
  const floatingMatches = floating && shots.length === 3 && shots.every((shot, index) => {
    const expected = floating.shots[index];
    return shot.durationSeconds === expected.durationSeconds && shot.purpose === expected.purpose
      && shotFields.every(field => shot[field] === expected[field]) && shot.evidenceRefs.length === 0;
  });
  const darkReveal = input.presetId === "dramatic-backlight" && input.shotMode === "multi" && input.draft.durationSeconds === 10
    ? fixedLightingDirectorPlan(input) : null;
  const darkRevealMatches = darkReveal && shots.length === 3 && shots.every((shot, index) => {
    const expected = darkReveal.shots[index];
    return shot.durationSeconds === expected.durationSeconds && shot.purpose === expected.purpose
      && shotFields.every(field => shot[field] === expected[field]) && shot.evidenceRefs.length === 0;
  });
  const materialStudy = input.presetId === "material-detail" && input.shotMode === "multi" && input.draft.durationSeconds === 10
    ? fixedMaterialDirectorPlan(input) : null;
  const materialStudyMatches = materialStudy && shots.length === 3 && shots.every((shot, index) => {
    const expected = materialStudy.shots[index];
    return shot.durationSeconds === expected.durationSeconds && shot.purpose === expected.purpose
      && shotFields.every(field => shot[field] === expected[field])
      && JSON.stringify(shot.evidenceRefs) === JSON.stringify(expected.evidenceRefs);
  });
  const windowDisplay = input.presetId === "window-display" && input.shotMode === "multi" && input.draft.durationSeconds === 10
    ? fixedPresentationDirectorPlan(input) : null;
  const windowDisplayMatches = windowDisplay && shots.length === 3 && shots.every((shot, index) => {
    const expected = windowDisplay.shots[index];
    return shot.durationSeconds === expected.durationSeconds && shot.purpose === expected.purpose
      && shotFields.every(field => shot[field] === expected[field]) && shot.evidenceRefs.length === 0;
  });
  const fixedTemplate = ["culinary-texture", "window-display"].includes(input.presetId) ? categoryPresentationDirection(input.presetId, directorProductContext(input.profile).category, input.shotMode, input.draft.durationSeconds) : ["label-reveal", "sneaker-hero", "upholstery-macro"].includes(input.presetId) ? categoryProductDetailDirection(input.presetId, directorProductContext(input.profile).category, input.shotMode, input.draft.durationSeconds) : ["floating-fashion", "fabric-motion", "floating-accessory"].includes(input.presetId) ? categoryFashionMotionDirection(input.presetId, directorProductContext(input.profile).category, input.shotMode, input.draft.durationSeconds) : ["elegant-orbit", "optical-lines", "cinematic-dial"].includes(input.presetId) ? categoryPerspectiveDirection(input.presetId, directorProductContext(input.profile).category, input.shotMode, input.draft.durationSeconds) : ["glass-reflection", "dramatic-backlight", "metallic-light-sweep"].includes(input.presetId) ? categoryLightingDirection(input.presetId, directorProductContext(input.profile).category, input.shotMode, input.draft.durationSeconds) : ["macro-stitching", "hardware-reveal", "craftsmanship-study"].includes(input.presetId) ? categoryCraftDirection(input.presetId, directorProductContext(input.profile).category, input.shotMode, input.draft.durationSeconds) : input.presetId === "precision-macro" ? categoryPrecisionDirection(directorProductContext(input.profile).category, input.shotMode, input.draft.durationSeconds) : input.presetId === "luxury-fashion-film" ? categoryLuxuryDirection(directorProductContext(input.profile).category, input.shotMode, input.draft.durationSeconds) : input.presetId === "minimal-studio" ? categoryMinimalDirection(directorProductContext(input.profile).category, input.shotMode, input.draft.durationSeconds) : input.presetId === "product-spotlight" ? categorySpotlightDirection(directorProductContext(input.profile).category, input.shotMode, input.draft.durationSeconds) : input.presetId === "material-detail" ? categoryMaterialDirection(directorProductContext(input.profile).category, input.shotMode, input.draft.durationSeconds) : input.presetId === "macro-detail-reveal" ? categoryMacroDirection(directorProductContext(input.profile).category, input.shotMode, input.draft.durationSeconds) : null;
  const safeFixedShots = fixedTemplate?.allowWideFallback ? (["culinary-texture", "window-display"].includes(input.presetId) ? fixedPresentationDirectorPlan(input, false) : ["label-reveal", "sneaker-hero", "upholstery-macro"].includes(input.presetId) ? fixedProductDetailDirectorPlan(input) : ["floating-fashion", "fabric-motion", "floating-accessory"].includes(input.presetId) ? fixedFashionMotionDirectorPlan(input, false) : ["elegant-orbit", "optical-lines", "cinematic-dial"].includes(input.presetId) ? fixedPerspectiveDirectorPlan(input) : ["glass-reflection", "dramatic-backlight", "metallic-light-sweep"].includes(input.presetId) ? fixedLightingDirectorPlan(input, false) : ["macro-stitching", "hardware-reveal", "craftsmanship-study"].includes(input.presetId) ? fixedCraftDirectorPlan(input) : input.presetId === "precision-macro" ? fixedPrecisionDirectorPlan(input) : input.presetId === "luxury-fashion-film" ? fixedLuxuryDirectorPlan(input) : input.presetId === "minimal-studio" ? fixedMinimalDirectorPlan(input, false) : input.presetId === "product-spotlight" ? fixedSpotlightDirectorPlan(input) : input.presetId === "material-detail" ? fixedMaterialDirectorPlan(input, false) : fixedMacroDirectorPlan(input, false))?.shots : undefined;
  const effectiveMatches = effectiveLegacyPlan && shots.length === effectiveLegacyPlan.shots.length && shots.every((shot, index) => {
    const expected = effectiveLegacyPlan.shots[index];
    return shot.durationSeconds === expected.durationSeconds && shot.purpose === expected.purpose
      && shotFields.every(field => shot[field] === expected[field])
      && shot.evidenceRefs.length === expected.evidenceRefs.length && shot.evidenceRefs[0] === expected.evidenceRefs[0];
  });
  if (effectiveLegacyPlan && (!persisted || value.origin === "fallback") && !effectiveMatches) {
    return reject("$.shots", "fixed_macro_template_mismatch", "the effective legacy preset shots in order");
  }
  // The historical matcher remains available for persisted plans and golden compatibility.
  if (!d1Storyboard && !editorial && !effectiveMatches && !signatureMatches && !lightSweepMatches && !macroMatches && !floatingMatches && !darkRevealMatches && !materialStudyMatches && !windowDisplayMatches && fixedTemplate && (shots.length !== fixedTemplate.shots.length || shots.some((shot, index) => shot.durationSeconds !== fixedTemplate.durations[index]
    || (safeFixedShots?.[index].evidenceRefs.length === 0 ? shot.focus !== "Source-visible product form" || shot.evidenceRefs.length > 0
      : (input.presetId === "luxury-fashion-film" ? input.shotMode === "multi" && index === 2 : index === 0 || input.shotMode === "multi" && input.draft.durationSeconds === 10 && index === 1)
      ? !shot.evidenceRefs.length || !fixedTemplate.patterns[index].test(shot.focus)
      : shot.focus !== "Source-visible product form" || shot.evidenceRefs.length > 0)
    || (["purpose", "camera", "composition", "lighting", "motion", "pace"] as const).some(field => shot[field] !== (safeFixedShots ?? fixedTemplate.shots)[index][field])))) {
    return reject("$.shots", "fixed_macro_template_mismatch", "the category-specific fixed Macro Detail Reveal template");
  }
  if (input.shotMode === "multi") {
    if (!custom && new Set(shots.map(shot => shot.purpose)).size !== shots.length) return reject("$.shots[*].purpose", "repeated_shot_purpose", "distinct purpose per shot");
    if (new Set(shots.map(shot => `${shot.camera}|${shot.composition}|${shot.focus}`.toLowerCase())).size !== shots.length) return reject("$.shots[*]", "repeated_shot_direction", "distinct camera/composition/focus per shot");
    // With automatic direction, multiple identical push-ins are not a shot strategy.
    if (input.draft.cameraMovement === "auto" && shots.every(shot => cameraKinds(shot.camera).includes("dolly-in"))) return reject("$.shots[*].camera", "repeated_push_in", "vary shot scale or camera direction for automatic multi-shot");
    const repeated = custom ? -1 : repeatedDetail(shots, input.profile);
    if (repeated >= 0) return reject(`$.shots[${repeated}].focus`, "repeated_detail_focus", "each dedicated shot targets a different verified detail or region");
    for (const [index, shot] of shots.entries()) {
      const duplicate = !dedicatedDetail(shot) && shots.slice(0, index).find(previous => !dedicatedDetail(previous)
        && detailWording(previous.composition) === detailWording(shot.composition));
      // Establishing the product and resolving it at the end are distinct tasks.
      if (!custom && duplicate && !(duplicate.purpose === "hero-reveal" && shot.purpose === "final-hero")) {
        return reject(`$.shots[${index}].composition`, "repeated_shot_direction", "different visual tasks, independent of camera and lighting wording");
      }
    }
  }
  const fixedGolden = d1Storyboard || editorial || signatureMatches || lightSweepMatches || macroMatches || floatingMatches || darkRevealMatches || materialStudyMatches || windowDisplayMatches
    || goldenStoryboard && fixedQuickCutsDirectorPlan(input)?.shots.every((expected, index, fixed) => fixed.length === shots.length
      && expected.durationSeconds === shots[index].durationSeconds && expected.purpose === shots[index].purpose
      && shotFields.every(field => expected[field] === shots[index][field]));
  const contract = fixedGolden ? { ...expectedIntent, camera: "auto" as const, sequence: "preset" as const } : expectedIntent;
  const movementMatches = (shot: VideoDirectorShot, direction: CreativeIntentContract["camera"]) => direction === "auto"
    || direction === "in-out" ? direction === "auto" || cameraKinds(shot.camera).includes("dolly-in") && cameraKinds(shot.camera).includes("dolly-out")
      : cameraKinds(shot.camera).includes(direction);
  if (contract.camera === "static" || contract.camera === "pan-left" || contract.camera === "pan-right" || contract.camera === "lateral") {
    if (!shots.every(shot => movementMatches(shot, contract.camera))) return reject("$.shots[*].camera", "requested_camera_not_preserved", `camera movement ${contract.camera}`);
  } else if (contract.camera === "in-out" && (!movementMatches(shots[0], "dolly-in") || !movementMatches(shots.at(-1)!, "dolly-out"))) return reject("$.shots[*].camera", "requested_camera_sequence_not_preserved", "dolly-in then dolly-out");
  else if (contract.camera === "dolly-in" && !shots.some(shot => movementMatches(shot, "dolly-in"))) return reject("$.shots[*].camera", "requested_camera_not_preserved", "at least one dolly-in");
  else if (contract.camera === "dolly-out" && !shots.some(shot => movementMatches(shot, "dolly-out"))) return reject("$.shots[*].camera", "requested_camera_not_preserved", "at least one dolly-out");
  if (contract.sequence === "detail-to-hero" && (frameScale(shots[0].camera + " " + shots[0].composition) !== "close"
    || (input.shotMode === "multi" && frameScale(shots.at(-1)!.composition) !== "full") || (input.shotMode === "multi" && contract.camera === "in-out"
      && (!movementMatches(shots[0], "dolly-in") || !movementMatches(shots.at(-1)!, "dolly-out")))
      || (input.shotMode === "single" && (!/start|begin/i.test(shots[0].composition)
      || !/finish|end|complete|full|wide/i.test(shots[0].composition) || !movementMatches(shots[0], "dolly-out"))))) return reject("$.shots[0].composition|$.shots[0].camera", "detail_to_hero_sequence_mismatch", "close start, complete/wide finish, pull-back");
  const focusId = contract.focusEvidenceId;
  if (focusId !== null && (!fixedGolden || macroMatches && contract.focusPosition === "any"
    && macro?.shots.some(shot => shot.evidenceRefs.includes(focusId)))) {
    const target = evidence[focusId]?.detail;
    const targetShots = shots.filter(shot => shot.focus === target);
    if (!targetShots.length || contract.focusPosition === "first" && shots[0].focus !== target
      || contract.focusPosition === "last" && shots.at(-1)!.focus !== target) return reject("$.shots[*].focus", "requested_focus_not_preserved", "requested verified evidence at requested position");
  }
  return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
    shotMode: input.shotMode, ...(editorial ? { editorialStoryboard: true as const } : {}),
    ...(referenceReviews?.length ? { referenceReviews } : {}), origin: editorial ? "fallback" : "ai", intent: value.intent.trim(), intentContract: expectedIntent, summary: value.summary.trim(), shots };
}

function fallbackMark(detail: string) {
  return /\b(?:text|embroider\w*|logo\w*|label\w*|symbol\w*|lettering|letters?|inscription\w*|typograph\w*|monogram\w*|emblem\w*|(?:embroidered|printed)\s+(?:mark\w*|text|logo|graphic\w*|artwork))\b/i.test(detail);
}

export function fallbackDirectorPlan(input: VideoDirectorInput, referenceReviews: ReferenceReview[] = []): VideoDirectorPlan {
  // Custom direction must never silently become a preset when planning fails.
  if (input.presetId === "custom") throw new DirectorStructuredOutputError("custom_director_unavailable");
  if (usesD1FiveSecondMulti(input)) {
    const shots = d1FiveSecondShots(input, referenceReviews);
    return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: directorPresetVersion(input.presetId),
      shotMode: input.shotMode, origin: "fallback", ...directorPlanDescriptions(input, shots.length),
      intentContract: presetCreativeIntent(input, directorProductContext(input.profile).evidence), shots,
      ...(referenceReviews.length ? { referenceReviews } : {}) };
  }
  const editorial = editorialStoryboard(input, referenceReviews);
  if (editorial) return editorial;
  const quickCuts = fixedQuickCutsDirectorPlan(input);
  if (quickCuts) return { ...applyFixedPlanIntent(quickCuts, input), ...(referenceReviews.length ? { referenceReviews } : {}) };
  const fixed = fixedFallbackPlan(input);
  if (fixed) return { ...fixed, ...(referenceReviews.length ? { referenceReviews } : {}) };
  if (![5, 10].includes(input.draft.durationSeconds)) throw new Error("unsupported_director_duration");
  let preset = getVideoDirectorPreset(input.presetId, input.shotMode, input.draft.durationSeconds);
  const allEvidence = directorProductContext(input.profile).evidence;
  const evidence = allEvidence.filter(item => !fallbackMark(item.detail));
  const quality = qualityPresetDirection(input.presetId, input.shotMode, input.draft.durationSeconds);
  const qualityFallback = quality ? qualityFallbackDirection(quality, evidence) : null;
  if (qualityFallback) preset = { ...preset, execution: qualityFallback, shots: qualityFallback.shots };
  const intentContract = presetCreativeIntent(input, allEvidence);
  const durations = preset.execution?.durations ?? (input.shotMode === "single" ? [input.draft.durationSeconds]
    : input.draft.durationSeconds === 5 ? [2, 3] : [3, 4, 3]);
  const requestedEvidence = allEvidence.find(item => item.id === intentContract.focusEvidenceId);
  const isDetailPreset = preset.strategy.detailTerms.length > 0 && /macro|detail|label|stitch|hardware|texture|dial|craft/i.test(`${preset.brief} ${preset.strategy.objective} ${preset.strategy.detailTerms.join(" ")}`);
  const detailEvidence = input.shotMode === "multi" ? evidence.filter(item => !/silhouette|shape|form|geometr|outline/i.test(item.detail)
    && !input.profile?.dominantColors.includes(item.detail)) : evidence;
  const fallbackDetail = requestedEvidence ?? presetFocusEvidence(input.presetId, detailEvidence)
    ?? (isDetailPreset ? detailEvidence.find(item => item.detail.length <= 100 && !/silhouette|shape|form|geometr/i.test(item.detail)) : undefined);
  const form = evidence.find(item => item.detail.length <= 100 && /silhouette|shape|form|geometr/i.test(item.detail));
  const supportingEvidence = evidence.find(item => item.id !== fallbackDetail?.id);
  const singleDetail = intentContract.focusRequested || (quality ? quality.focusRoles[0] !== "form"
    : preset.execution ? input.presetId === "macro-detail-reveal" : isDetailPreset);
  const missingDetail = qualityFallback && !intentContract.focusRequested ? qualityFallback.focusIds[0] === null : !fallbackDetail;
  const summary = intentContract.safeAdjustment === "unseen-side-to-source-facing-camera"
    ? "The requested unseen-side turn is replaced with a source-facing camera move; verified product details and color remain unchanged."
    : intentContract.focusRequested && !requestedEvidence
      ? "The requested detail is not verified in the product profile, so the plan uses a wider source-visible view without inventing it."
    : singleDetail && missingDetail && input.shotMode === "single"
      ? "No verified close-detail evidence is available, so this continuous take stays at a clear product view instead of inventing a feature."
      : "Preset direction adapted to the explicit camera and focus request using only verified product evidence.";
  const plan: VideoDirectorPlan = { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: preset.version, shotMode: input.shotMode,
    ...(referenceReviews.length ? { referenceReviews } : {}),
    origin: "fallback", intent: input.draft.prompt.trim() ? "Explicit camera, evidence-backed focus and feasible shot order are applied; unsupported details stay source-bound." : "Preset direction selected from verified product evidence.", intentContract,
    summary,
    shots: durations.map((durationSeconds, index) => {
      const presetIndex = !preset.execution && durations.length === 2 ? index + 1 : index;
      const direction = input.shotMode === "single" ? preset : preset.shots[presetIndex];
      const sequenceDetail = intentContract.sequence === "detail-to-hero" && (index === 0 || index === durations.length - 1);
      const isDetail = input.shotMode === "single" ? singleDetail : (preset.execution
        ? ["macro-detail", "material-study"].includes(preset.shots[presetIndex].purpose) : presetIndex === 1) || sequenceDetail;
      const requestedFocusShot = intentContract.focusPosition === "first" && index === 0
        || intentContract.focusPosition === "last" && index === durations.length - 1
        || Boolean(quality && requestedEvidence && intentContract.focusPosition === "any" && index === 0);
      const alternateDetail = preset.execution && isDetail && index > 1
        ? evidence.find(item => item.detail.length <= 80 && item.id !== fallbackDetail?.id && /stitch|seam|edge|construction|texture|grain/i.test(item.detail)) : undefined;
      const surfaceDetail = preset.execution && input.shotMode === "multi" && preset.shots[presetIndex].purpose === "material-study"
        ? evidence.find(item => item.detail.length <= 80 && /texture|grain|weave|surface|finish/i.test(item.detail))
          ?? evidence.find(item => item.detail.length <= 80 && /fabric|leather|material/i.test(item.detail)) : undefined;
      const chosen = sequenceDetail && index > 0 ? form : requestedFocusShot ? requestedEvidence : qualityFallback && !intentContract.focusRequested
        ? evidence.find(item => item.id === qualityFallback.focusIds[index]) : isDetail
        ? intentContract.focusRequested ? fallbackDetail : surfaceDetail ?? alternateDetail ?? fallbackDetail
        : form ?? supportingEvidence;
      let camera = direction.camera;
      let composition = direction.composition;
      let pace = direction.pace;
      if (quality && input.shotMode === "single" && intentContract.sequence === "preset"
        && /pull-back/i.test(camera) && intentContract.camera !== "auto" && intentContract.camera !== "dolly-out") {
        composition = singleDetail ? "Resolvable evidenced feature with clear margins" : "Complete product with balanced campaign space";
        pace = "Measured light study; final hold";
      }
      if (sequenceDetail) {
        camera = carryLens(index === 0 ? "Slow dolly-in into source-resolved close framing" : "Slow pull-back to the complete visible product", direction.camera);
        composition = index === 0 ? "Close framing on the requested visible detail" : "Complete visible product with balanced margins";
      }
      if (input.shotMode === "single" && intentContract.sequence === "detail-to-hero") {
        camera = carryLens("Slow pull-back from a source-resolved close view to the complete product", direction.camera);
        composition = `Start close on ${chosen?.detail ?? "the visible product form"}, then finish on the complete visible product`;
      }
      if (input.shotMode === "single" && singleDetail && missingDetail && intentContract.focusEvidenceId === null) {
        camera = "Locked medium product framing";
        composition = "Wide clear view of the source-visible product form; no unverified detail enlarged";
      }
      if (intentContract.camera === "in-out" && intentContract.sequence !== "detail-to-hero") camera = index === 0
        ? "Slow dolly-in within the visible source view" : index === durations.length - 1
          ? "Slow pull-back within the visible source view" : camera;
      if (intentContract.camera === "dolly-in" && intentContract.sequence !== "detail-to-hero" && index === 0) camera = carryLens("Slow dolly-in within the visible source view", direction.camera);
      if (intentContract.camera === "dolly-out" && index === durations.length - 1) camera = carryLens("Slow pull-back within the visible source view", direction.camera);
      if (intentContract.camera === "pan-left") camera = carryLens("Subtle camera pan left within the visible source view", direction.camera);
      if (intentContract.camera === "pan-right") camera = carryLens("Subtle camera pan right within the visible source view", direction.camera);
      if (intentContract.camera === "lateral") camera = carryLens("Short lateral camera glide across the visible source view", direction.camera);
      if (intentContract.camera === "static") camera = carryLens("Locked camera; stable source viewpoint", direction.camera);
      if (intentContract.focusPosition === "last" && index === durations.length - 1 && requestedEvidence) composition = `Finish on the verified ${requestedEvidence.detail}`;
      return resolveShotCamera({ durationSeconds, purpose: qualityFallback ? qualityFallback.shots[index].purpose : input.shotMode === "single"
        ? isDetail ? "material-study" : "hero-reveal" : preset.shots[presetIndex].purpose,
        evidenceRefs: chosen ? [chosen.id] : [],
        camera, lighting: direction.lighting,
        composition: isDetail && !chosen && !sequenceDetail ? (preset.execution && index > 1
          ? "Wider visible form with offset margins; no unverified detail enlarged"
          : "Wider view of the source-visible product form; no unverified detail is enlarged") : composition,
        motion: direction.motion, pace,
        focus: chosen?.detail ?? (isDetail ? "Source-visible surface detail" : "Source-visible product form"),
      }, input.draft.cameraMovement);
    }) };
  if (input.shotMode === "multi") {
    const reserved = intentContract.focusPosition === "last" ? plan.shots.at(-1)
      : intentContract.sequence === "detail-to-hero" ? plan.shots[0] : undefined;
    const assigned: VideoDirectorShot[] = reserved && dedicatedDetail(reserved) ? [reserved] : [];
    for (const shot of plan.shots) {
      if (!dedicatedDetail(shot) || shot === reserved) continue;
      if (assigned.some(previous => sameDetail(previous, shot, input.profile))) {
        const replacement = evidence.find(item => item.detail.length <= DIRECTOR_SHOT_TEXT_LIMIT
          && !input.profile?.dominantColors.includes(item.detail) && !/silhouette|shape|form|geometr|outline/i.test(item.detail)
          // A new focus must still describe the subject named by this composition.
          && (detailSubject({ ...shot, focus: "Source-visible surface detail" }, input.profile).names.length === 0
            || sameDetail({ ...shot, focus: "Source-visible surface detail" }, { ...shot, focus: item.detail, composition: "" }, input.profile))
          && !assigned.some(previous => sameDetail(previous, { ...shot, focus: item.detail }, input.profile)));
        if (!replacement && reserved === plan.shots[0] && sameDetail(reserved, shot, input.profile)) {
          Object.assign(shot, showDetailInContext(shot, shot.purpose === "material-study"
            ? "Complete product with the visible surface in context" : "Complete product with the source-visible feature in context"));
          continue;
        }
        if (!replacement) throw new DirectorStructuredOutputError("repeated_detail_focus");
        shot.focus = replacement.detail;
        shot.evidenceRefs = [replacement.id];
      }
      assigned.push(shot);
    }
  }
  return plan;
}

/** Preserve actual directing decisions; never replace them with generic zoom/hero templates. */
export function compileDirectorPlan(plan: VideoDirectorPlan, input: VideoDirectorInput) {
  if (plan.version !== VIDEO_DIRECTOR_VERSION || plan.presetId !== input.presetId || plan.shotMode !== input.shotMode
    || plan.presetVersion !== directorPresetVersion(input.presetId)) throw new Error("invalid_director_plan");
  const validated = parseDirectorOutput(plan, input);
  if (!validated) throw new Error("invalid_director_plan");
  const multi = plan.shotMode === "multi";
  const limit = multi ? KLING_MULTI_PROMPT_MAX_CHARS : 2500;
  const elementReferences = directorElementReferences(validated, input.draft.productReferences);
  const classicCinematic = input.presetId === "cinematic-hero" && input.shotMode === "multi" && input.draft.durationSeconds === 5;
  const branding = input.profile?.visibleBranding;
  const verifiedDetails = new Set(directorProductContext(input.profile).evidence.map(item => item.detail));
  const primaryMarks = Boolean(branding && ([branding.logoRegions, branding.textRegions, branding.artworkRegions]
    .some(regions => regions?.some(region => verifiedDetails.has(region.description)))));
  const fallbackMarks = plan.origin === "fallback" ? [...verifiedDetails].filter(fallbackMark) : [];
  const markNames = [
    fallbackMarks.some(detail => /\bembroider\w*\b/i.test(detail)) ? (fallbackMarks.some(detail => /\btext\b/i.test(detail)) ? "embroidered text" : "embroidered marks") : fallbackMarks.some(detail => /\b(?:text|letter\w*|inscription\w*|typograph\w*)\b/i.test(detail)) ? "text" : null,
    fallbackMarks.some(detail => /logo|monogram|emblem/i.test(detail)) ? "logos" : null,
    fallbackMarks.some(detail => /label/i.test(detail)) ? "labels" : null,
    fallbackMarks.some(detail => /symbol/i.test(detail)) ? "symbols" : null,
    fallbackMarks.some(detail => /printed\s+(?:mark|graphic|artwork)/i.test(detail)) ? "printed marks" : null,
  ].filter((name): name is string => name !== null);
  const markList = markNames.length > 1 ? `${markNames.slice(0, -1).join(", ")} and ${markNames.at(-1)}` : markNames[0];
  const fallbackPreservation = markList ? `Keep the ${markList} exactly as in the source; do not enlarge, restyle or reposition them.` : undefined;
  const declaredTextPreservation = referenceTextPreservation(validated.referenceReviews ?? [], input.draft.productReferences);
  const editorialText = validated.editorialStoryboard
    ? referenceTextPreservation(validated.referenceReviews ?? [], input.draft.productReferences, true) : "";
  const signature = input.presetId === "minimal-studio" && input.shotMode === "multi" && input.draft.durationSeconds === 10
    ? fixedMinimalDirectorPlan(input) : null;
  const signatureStoryboard = signature && [signature, fixedMinimalDirectorPlan(input, true, false)!].some(candidate => validated.shots.length === 3 && validated.shots.every((shot, index) =>
    shot.durationSeconds === candidate.shots[index].durationSeconds && shot.purpose === candidate.shots[index].purpose
    && shotFields.every(field => shot[field] === candidate.shots[index][field])));
  const lightSweep = input.presetId === "metallic-light-sweep" && input.shotMode === "multi" && input.draft.durationSeconds === 10
    ? fixedLightingDirectorPlan(input) : null;
  const lightSweepStoryboard = lightSweep && [lightSweep, fixedLightingDirectorPlan(input, true, true)!].find(candidate =>
    validated.shots.length === 3 && validated.shots.every((shot, index) =>
      shot.durationSeconds === candidate.shots[index].durationSeconds && shot.purpose === candidate.shots[index].purpose
      && shotFields.every(field => shot[field] === candidate.shots[index][field])));
  const macro = input.presetId === "macro-detail-reveal" && input.shotMode === "multi" && input.draft.durationSeconds === 10
    ? fixedMacroDirectorPlan(input) : null;
  const macroStoryboard = macro && validated.shots.length === 3 && validated.shots.every((shot, index) =>
    shot.durationSeconds === macro.shots[index].durationSeconds && shot.purpose === macro.shots[index].purpose
    && shotFields.every(field => shot[field] === macro.shots[index][field]));
  const floating = input.presetId === "floating-accessory" && input.shotMode === "multi" && input.draft.durationSeconds === 10
    ? fixedFashionMotionDirectorPlan(input) : null;
  const floatingStoryboard = floating && validated.shots.length === 3 && validated.shots.every((shot, index) =>
    shot.durationSeconds === floating.shots[index].durationSeconds && shot.purpose === floating.shots[index].purpose
    && shotFields.every(field => shot[field] === floating.shots[index][field]));
  const quickCuts = fixedQuickCutsDirectorPlan(input);
  const quickCutsStoryboard = quickCuts && validated.shots.length === 5 && validated.shots.every((shot, index) =>
    shot.durationSeconds === 2 && shot.purpose === quickCuts.shots[index].purpose
    && shotFields.every(field => shot[field] === quickCuts.shots[index][field]));
  const darkReveal = input.presetId === "dramatic-backlight" && input.shotMode === "multi" && input.draft.durationSeconds === 10
    ? fixedLightingDirectorPlan(input) : null;
  const darkRevealStoryboard = darkReveal && validated.shots.length === 3 && validated.shots.every((shot, index) =>
    shot.durationSeconds === darkReveal.shots[index].durationSeconds && shot.purpose === darkReveal.shots[index].purpose
    && shotFields.every(field => shot[field] === darkReveal.shots[index][field]));
  const materialStudy = input.presetId === "material-detail" && input.shotMode === "multi" && input.draft.durationSeconds === 10
    ? fixedMaterialDirectorPlan(input) : null;
  const surfaceStoryboard = materialStudy && validated.shots.length === 3 && validated.shots.every((shot, index) =>
    shot.durationSeconds === materialStudy.shots[index].durationSeconds && shot.purpose === materialStudy.shots[index].purpose
    && shotFields.every(field => shot[field] === materialStudy.shots[index][field]));
  const windowDisplay = input.presetId === "window-display" && input.shotMode === "multi" && input.draft.durationSeconds === 10
    ? fixedPresentationDirectorPlan(input) : null;
  const windowStoryboard = windowDisplay && validated.shots.length === 3 && validated.shots.every((shot, index) =>
    shot.durationSeconds === windowDisplay.shots[index].durationSeconds && shot.purpose === windowDisplay.shots[index].purpose
    && shotFields.every(field => shot[field] === windowDisplay.shots[index][field]));
  const prompts = validated.shots.map(shot => {
    const prefix = elementReferences.some(review => review.index === shot.referenceIndex)
      ? elementShotPrefix(shot.referenceIndex, elementReferences) : "";
    const backShot = validated.referenceReviews?.some(review => review.index === shot.referenceIndex && review.view === "back");
    const referenceMarks = validated.referenceReviews?.some(review => review.status === "matched"
      && backShot && review.index === shot.referenceIndex
      && review.details.some(detail => /\b(?:text|letter\w*|logo|symbol|label|pattern|print|emblem|embroider\w*)\b/i.test(detail)));
    const editorialSignature = validated.editorialStoryboard && input.presetId === "minimal-studio";
    if (isD1FiveSecondPlan(validated)) {
      const alternate = shot.referenceIndex !== undefined;
      const alternateView = validated.referenceReviews?.find(review => review.index === shot.referenceIndex)?.view;
      const watch = (!alternate || alternateView === "front") && productReferencePolicy(input.profile) === "watch";
      const text = alternate ? "" : referenceTextPreservation(validated.referenceReviews ?? [], input.draft.productReferences, true);
      const compile = validated.shots.length === 3 ? compileD1FiveSecondShot : compileLegacyD1FiveSecondShot;
      return compile(shot, prefix, watch, alternate ? "" : declaredTextPreservation, text, limit);
    }
    if ((signatureStoryboard || editorialSignature) && (shot.camera === "Straight axial long-lens push-in" || shot.camera === "Locked static hero framing")) {
      const establish = shot.purpose === "hero-reveal";
      const discipline = establish
        ? "No arc, lateral drift, perspective swing or reorientation; no product rotation/yaw/pitch/roll"
        : "No rotation/yaw/pitch/roll, perspective change, translation, zoom/dolly/lateral movement";
      const fullMotion = establish ? "Camera moves straight toward the product only; product stays perfectly fixed and source-facing" : `${shot.motion}; hold full frame for all 3 seconds`;
      const compactMotion = establish ? "Product fixed and source-facing"
        : "Product/camera still, source-facing; full frame all 3s";
      for (const compact of [false, true]) {
        const text = compact && editorialSignature ? editorialText : declaredTextPreservation;
        const prompt = prefix + [shot.camera, shot.composition, shot.lighting, compact ? compactMotion : fullMotion, compact && !establish ? "Stable premium hero hold" : shot.pace,
          discipline, "Exact form/colors/marks/parts", ...(text ? [text] : [])].join(". ");
        if (prompt.length <= limit) return prompt;
      }
      if (editorialSignature) {
        const framing = establish ? "Full product with open margins" : "Balanced full product hero";
        const guard = establish ? "Product fixed, source-facing. Straight camera path only; no arc, drift, perspective swing or product rotation"
          : "Product and camera still, source-facing, all 3s. No turn, zoom, translation or perspective change";
        const prompt = [shot.camera, framing, shot.lighting, guard, "Exact form/colors/marks/parts", editorialText].filter(Boolean).join(". ");
        if (prompt.length <= limit) return prompt;
      }
      throw new Error("kling_scene_prompt_too_long");
    }
    if (validated.editorialStoryboard) {
      const side = shot.referenceIndex !== undefined;
      const direction = [shot.camera, shot.composition, shot.lighting, shot.motion, shot.pace,
        ...(shot.evidenceRefs.length ? [shot.focus] : [])].join(". ");
      const preservation = side
        ? "Exact visible side geometry, colors, material, marks and parts. Keep the pictured profile fixed."
        : "Exact source form/colors/material/marks/parts; known view only";
      const watch = !editorialSignature && !side && productReferencePolicy(input.profile) === "watch";
      const compactDial = "Exact source dial each frame: numerals, indices, logo, hands, date window, print and visible complications keep shape/position. No redraw, replacement, morphing or invented text.";
      const text = side ? "" : declaredTextPreservation;
      const prompt = prefix + [direction, preservation, watch ? compactDial : "", text].filter(Boolean).join(". ");
      if (prompt.length <= limit) return prompt;
      if (watch) {
        const sweep = shot.purpose === "lighting-reveal";
        const finish = shot.purpose === "final-hero";
        const compactDirection = sweep ? "Locked offset crop. One soft highlight travels left-to-right"
          : finish ? "Locked full hero all 3s; steady fill" : "Locked full product; soft key";
        const compact = [compactDirection, "Fixed source pose. Exact form/colors/material/marks/parts", compactDial, editorialText].filter(Boolean).join(". ");
        if (compact.length <= limit) return compact;
      } else if (!side && editorialText) {
        const compact = [direction, preservation, editorialText].join(". ");
        if (compact.length <= limit) return compact;
      }
      throw new Error("kling_scene_prompt_too_long");
    }
    if (signatureStoryboard) {
      // Fixed fields already express the visual task; avoid expanding them into generic prose.
      const prompt = prefix + [shot.camera, shot.composition, shot.lighting, shot.motion, shot.pace,
        ...(shot.evidenceRefs.length ? [shot.focus] : []),
        "Exact source shape/colors/marks/parts; known view only",
        ...(declaredTextPreservation ? [declaredTextPreservation] : [])].join(". ");
      if (prompt.length > limit) throw new Error("kling_scene_prompt_too_long");
      return prompt;
    }
    if (lightSweepStoryboard) {
      const moving = lightSweepStoryboard === lightSweep && input.draft.cameraMovement === "auto";
      if (moving && directorProductContext(input.profile).category === "watches") {
        const sweep = shot.purpose === "lighting-reveal";
        const finish = shot.purpose === "final-hero";
        const direction = sweep ? "One left-to-right highlight on bezel, case edges and strap junction"
          : finish ? `${shot.pace}. Steady soft light` : "Full product in soft studio light";
        const dial = "Preserve the exact dial layout from the source: every numeral, index marker, logo, hand, date window and printed marking stays fixed in shape and position. Do not redraw, replace, invent or morph dial graphics. Keep dial graphics temporally stable across every frame. Freeze visible complications. Do not invent readable text.";
        const referenceText = declaredTextPreservation ? [declaredTextPreservation] : [];
        const prompt = prefix + [shot.camera, shot.motion, direction, "Exact source form/colors/material", dial, ...referenceText].join(". ");
        if (prompt.length <= limit) return prompt;

        // Keep the verified text intact when it shares the scene budget with the dial.
        const compactDirection = sweep ? "Slow axial close push-in. One left-to-right case edge highlight"
          : finish ? "Very slow axial pull-back to hero. Hold final 1s" : "Slow axial push-in, full product";
        const compactDial = "Exact source dial each frame: numerals, indices, logo, hands, date window, print and visible complications keep shape/position. No redraw, replacement, morphing or invented text.";
        const compact = prefix + [compactDirection, shot.motion, compactDial, ...referenceText].join(". ");
        if (compact.length <= limit) return compact;
        throw new Error("kling_scene_prompt_too_long");
      }
      const prompt = prefix + [shot.camera, shot.composition, shot.lighting, shot.motion, shot.pace,
        "Exact source shape/colors/material/marks/parts; source orientation and visible surfaces only",
        ...(declaredTextPreservation ? [declaredTextPreservation] : [])].join(". ");
      if (prompt.length <= limit) return prompt;
      if (moving) {
        const compact = prefix + [shot.camera, shot.lighting, shot.motion,
          ...(shot.purpose === "final-hero" ? [shot.pace] : []), "Exact source shape/colors/material/marks/parts; visible surfaces only",
          ...(declaredTextPreservation ? [declaredTextPreservation] : [])].join(". ");
        if (compact.length <= limit) return compact;
      }
      throw new Error("kling_scene_prompt_too_long");
    }
    if (macroStoryboard) {
      const prompt = prefix + [shot.camera, shot.composition, shot.lighting, shot.motion, shot.pace,
        ...(shot.purpose === "macro-detail" ? [shot.focus] : []),
        "Exact source form/colors/material/marks/parts; known view only",
        ...(declaredTextPreservation ? [declaredTextPreservation] : [])].join(". ");
      if (prompt.length > limit) throw new Error("kling_scene_prompt_too_long");
      return prompt;
    }
    if (floatingStoryboard) {
      // This authorized vertical translation must not inherit the legacy stationary/support prose.
      const prompt = prefix + [shot.camera, shot.composition, shot.lighting, shot.motion, shot.pace,
        "Stable source-facing silhouette; no rotation/spin/flip",
        "Exact colors/material/marks/parts; known view",
        directorProductContext(input.profile).category === "apparel" ? "Keep source drape; no wind" : "One rigid-body float",
        ...(declaredTextPreservation ? [declaredTextPreservation] : [])].join(". ");
      if (prompt.length > limit) throw new Error("kling_scene_prompt_too_long");
      return prompt;
    }
    if (quickCutsStoryboard) {
      const prompt = prefix + [shot.camera, shot.composition, shot.lighting, shot.motion, shot.pace,
        ...(shot.purpose === "macro-detail" ? [shot.focus] : []),
        "Exact source form/colors/material/marks/parts; known view only",
        ...(declaredTextPreservation ? [declaredTextPreservation] : [])].join(". ");
      if (prompt.length > limit) throw new Error("kling_scene_prompt_too_long");
      return prompt;
    }
    if (darkRevealStoryboard) {
      const prompt = prefix + [shot.camera, shot.composition, shot.lighting, shot.motion, shot.pace,
        "Exact source form/colors/material/marks/parts; known view only",
        ...(declaredTextPreservation ? [declaredTextPreservation] : [])].join(". ");
      if (prompt.length > limit) throw new Error("kling_scene_prompt_too_long");
      return prompt;
    }
    if (surfaceStoryboard) {
      const prompt = prefix + [shot.camera, shot.composition, shot.lighting, shot.motion, shot.pace,
        ...(shot.purpose === "material-study" ? [shot.focus, "No material inference"] : []),
        "Exact source form/colors/marks/parts; known view",
        ...(declaredTextPreservation ? [declaredTextPreservation] : [])].join(". ");
      if (prompt.length > limit) throw new Error("kling_scene_prompt_too_long");
      return prompt;
    }
    if (windowStoryboard) {
      // Glazing belongs to the generated display, never an inferred product material or hidden view.
      const prompt = prefix + [shot.camera, shot.composition, shot.lighting, shot.motion, shot.pace,
        "One product; abstract glass bands; no mirror/signage",
        "Exact source form/colors/marks/parts; known view",
        ...(declaredTextPreservation ? [declaredTextPreservation] : [])].join(". ");
      if (prompt.length > limit) throw new Error("kling_scene_prompt_too_long");
      return prompt;
    }
    return prefix + compileKlingShot(shot, limit - prefix.length, Boolean(input.draft.criticalRegion) && !backShot, !classicCinematic && (!backShot && primaryMarks || Boolean(referenceMarks)), classicCinematic || backShot ? undefined : fallbackPreservation,
      ["floating-fashion", "floating-accessory"].includes(input.presetId) ? "floating"
        : ["culinary-texture", "fabric-motion"].includes(input.presetId) ? "surface"
        : ["elegant-orbit", "optical-lines", "cinematic-dial", "sneaker-hero"].includes(input.presetId) ? "perspective"
        : ["glass-reflection", "dramatic-backlight", "metallic-light-sweep"].includes(input.presetId) ? "lighting"
        : ["macro-stitching", "hardware-reveal", "craftsmanship-study", "upholstery-macro"].includes(input.presetId) ? "craft"
        : ["minimal-studio", "luxury-fashion-film", "product-spotlight", "macro-detail-reveal", "material-detail", "precision-macro", "label-reveal", "window-display"].includes(input.presetId), declaredTextPreservation);
  });
  const baseNegativePrompt = productVideoNegativePrompt.replace("object rotation, ", "");
  const negativePrompt = input.presetId === "cinematic-hero" && input.shotMode === "single" && input.draft.durationSeconds === 5
    ? `${baseNegativePrompt}, ${cinematicHeroSingleNegativeTerms}` : baseNegativePrompt;
  return { prompt: prompts[0], multiPrompt: multi
    ? prompts.map((prompt, index) => ({ prompt, duration: String(validated.shots[index].durationSeconds) })) : undefined,
    negativePrompt: multi ? negativePrompt.replace("scene cuts, ", "") : negativePrompt,
    cfgScale: 0.5, version: VIDEO_PRESERVATION_VERSION };
}

export type DirectorPlanningDiagnostic = { stage: "director_provider_response_received" | "structured_output_parsed" | "director_business_validation" | "plan_integrity_validation" | "director_repair_attempt"; result: "success" | "failed"; reasonCode?: string; jsonPath?: string; failingPaths?: string[]; expected?: string; matchedTerm?: string }
  & Partial<ReturnType<typeof cameraPatchDiagnostics>>;

export async function directVideoWithClient(input: VideoDirectorInput, client: { createPlan(input: VideoDirectorInput): Promise<unknown>; repairPlan?(input: VideoDirectorInput, failure: DirectorValidationFailure, referenceReviews?: ReferenceReview[]): Promise<unknown> },
  onDiagnostic?: (event: DirectorPlanningDiagnostic) => void) {
  let failureReason = "provider_error";
  let referenceReviews: ReferenceReview[] | null = null;
  let retryableUnsafeRepair = false;
  let retryableCustomRepairValidation = false;
  try {
    const output = await client.createPlan(input);
    referenceReviews = record(output) ? parseReferenceReviews(output.referenceReviews, input.draft.productReferences?.length ?? 0) : null;
    if (input.presetId === "window-display" && input.shotMode === "multi" && input.draft.durationSeconds === 10
      && referenceReviews !== null && referenceReviews.every(review => review.status === "matched")) {
      const fixed = fallbackDirectorPlan(input, referenceReviews);
      const validated = parseDirectorOutput(fixed, input);
      if (validated) return validated;
    }
    if (input.presetId === "material-detail" && input.shotMode === "multi" && input.draft.durationSeconds === 10
      && referenceReviews !== null && referenceReviews.every(review => review.status === "matched")) {
      const fixed = fallbackDirectorPlan(input, referenceReviews);
      const validated = parseDirectorOutput(fixed, input);
      if (validated) return validated;
    }
    if (input.presetId === "dramatic-backlight" && input.shotMode === "multi" && input.draft.durationSeconds === 10
      && referenceReviews !== null && referenceReviews.every(review => review.status === "matched")) {
      const fixed = fallbackDirectorPlan(input, referenceReviews);
      const validated = parseDirectorOutput(fixed, input);
      if (validated) return validated;
    }
    if (input.presetId === "cinematic-hero" && input.shotMode === "multi" && input.draft.durationSeconds === 10
      && referenceReviews !== null && referenceReviews.every(review => review.status === "matched")) {
      const fixed = fallbackDirectorPlan(input, referenceReviews);
      const validated = parseDirectorOutput(fixed, input);
      if (validated) return validated;
    }
    if (input.presetId === "floating-accessory" && input.shotMode === "multi" && input.draft.durationSeconds === 10
      && referenceReviews !== null && referenceReviews.every(review => review.status === "matched")) {
      const fixed = fallbackDirectorPlan(input, referenceReviews);
      const validated = parseDirectorOutput(fixed, input);
      if (validated) return validated;
    }
    if (input.presetId === "macro-detail-reveal" && input.shotMode === "multi" && input.draft.durationSeconds === 10
      && referenceReviews !== null && referenceReviews.every(review => review.status === "matched")) {
      // Reviews authorize identity evidence, never a second detail or a different storyboard.
      const fixed = fallbackDirectorPlan(input, referenceReviews);
      const validated = parseDirectorOutput(fixed, input);
      if (validated) return validated;
    }
    if (input.presetId === "metallic-light-sweep" && input.shotMode === "multi" && input.draft.durationSeconds === 10
      && referenceReviews !== null && referenceReviews.every(review => review.status === "matched")) {
      // Reference reviews still gate identity; the provider cannot replace a moving light with a moving camera.
      const fixed = fallbackDirectorPlan(input, referenceReviews);
      const validated = parseDirectorOutput(fixed, input);
      if (validated) return validated;
    }
    if (input.presetId === "minimal-studio" && input.shotMode === "multi" && input.draft.durationSeconds === 10
      && referenceReviews !== null && referenceReviews.every(review => review.status === "matched")) {
      // Provider reviews still gate references, but cannot redesign this storyboard.
      const fixed = fallbackDirectorPlan(input, referenceReviews);
      const validated = parseDirectorOutput(fixed, input);
      if (validated) return validated;
    }
    onDiagnostic?.({ stage: "structured_output_parsed", result: "success" });
    const rejection: { current?: DirectorValidationFailure } = {};
    const reject = (failure: DirectorValidationFailure) => {
      rejection.current = failure;
      onDiagnostic?.({ stage: "director_business_validation", result: "failed", ...failure });
    };
    let plan = parseDirectorOutput(output, input, reject);
    const customRepair = input.presetId === "custom" && referenceReviews !== null
      && referenceReviews.every(review => review.status === "matched");
    if (!plan && customRepair && input.draft.cameraMovement === "auto" && rejection.current?.reasonCode === "non_executable_camera"
      && record(output) && Array.isArray(output.shots)) {
      retryableCustomRepairValidation = true;
      const originalShots: unknown[] = output.shots;
      const candidate = structuredClone({ ...output, shots: originalShots });
      const beats = input.shotMode === "multi" ? numberedCreativeBeats(input.draft.prompt) : [];
      let normalized = true;
      for (const path of rejection.current.failingPaths ?? [rejection.current.jsonPath]) {
        const match = /^\$\.shots\[(\d+)\]\.camera$/.exec(path);
        const index = match ? Number(match[1]) : -1;
        const shot = candidate.shots[index];
        if (!record(shot)) { normalized = false; break; }
        const camera = typeof shot.camera === "string" && typeof shot.composition === "string"
          ? normalizeCustomCamera(shot.camera, { composition: shot.composition, userBeat: beats[index] ?? input.draft.prompt }) : null;
        if (!camera || !text(camera, DIRECTOR_SHOT_TEXT_LIMIT) || !executableCustomCamera(camera)) { normalized = false; break; }
        shot.camera = camera;
      }
      if (normalized) {
        const normalizedPlan = parseDirectorOutput(candidate, input);
        if (normalizedPlan) {
          try {
            compileDirectorPlan(normalizedPlan, input);
            plan = normalizedPlan;
            onDiagnostic?.({ stage: "director_repair_attempt", result: "success", reasonCode: "deterministic_camera_normalization", failingPaths: rejection.current.failingPaths });
          } catch { /* Keep the original candidate and strict repair if compilation fails. */ }
        }
      }
    }
    if (!plan && rejection.current && (input.presetId === "custom" ? customRepair
      : rejection.current.reasonCode === "unsupported_product_claim") && client.repairPlan) {
      const failure = rejection.current;
      onDiagnostic?.({ stage: "director_repair_attempt", result: "success", reasonCode: "repair_started", jsonPath: failure.jsonPath, failingPaths: failure.failingPaths, expected: failure.expected, matchedTerm: failure.matchedTerm });
      try {
        let repaired: unknown;
        try {
          repaired = customRepair
            ? await client.repairPlan(input, { ...failure, ...(record(output) && Array.isArray(output.shots) ? { originalShots: output.shots } : {}) }, referenceReviews ?? [])
            : await client.repairPlan(input, failure);
        } catch (error) {
          if (!customRepair || failure.reasonCode !== "unsafe_product_action" || !record(error) || error.unsafeRepairRequestFailed !== true) throw error;
          retryableUnsafeRepair = true;
          repaired = error.transportFailure === true ? deterministicUnsafeActionPatch(output, failure.failingPaths ?? [failure.jsonPath], input.profile) : null;
          if (!repaired) throw error;
          onDiagnostic?.({ stage: "director_repair_attempt", result: "success", reasonCode: "deterministic_unsafe_action_patch", jsonPath: failure.jsonPath });
        }
        let candidate = repaired;
        if (customRepair && ["non_executable_camera", "custom_shot_coherence", "conflicting_camera_directions"].includes(failure.reasonCode)) {
          const originals = record(output) && Array.isArray(output.shots) ? output.shots : [];
          const paths = failure.failingPaths ?? [failure.jsonPath];
          const coherence = failure.reasonCode === "custom_shot_coherence";
          const patches = coherence ? parseCoherenceFieldRepairs(repaired, paths, originals.length)
            : parseCameraRepairs(repaired, paths, originals.length)?.map(patch => ({ shotIndex: patch.shotIndex, field: "camera" as const, value: patch.camera }));
          if (!patches) {
            retryableCustomRepairValidation = true;
            rejection.current = { jsonPath: coherence ? "$.fieldRepairs" : "$.cameraRepairs", reasonCode: coherence ? "invalid_coherence_patch" : "invalid_camera_patch", failingPaths: paths,
              expected: "exact requested field paths once each with bounded executable camera or subject-action values" };
            onDiagnostic?.({ stage: "director_repair_attempt", result: "failed", ...rejection.current,
              ...(!coherence ? cameraPatchDiagnostics(repaired, paths) : {}) });
            candidate = undefined;
          } else {
            candidate = structuredClone(output);
            if (record(candidate) && Array.isArray(candidate.shots)) for (const patch of patches) {
              candidate.shots[patch.shotIndex][patch.field] = patch.value;
            }
          }
        }
        if (customRepair && failure.reasonCode === "unsafe_product_action") {
          const originals = record(output) && Array.isArray(output.shots) ? output.shots : [];
          const patches = record(repaired) && Object.keys(repaired).length === 1 && Array.isArray(repaired.actionRepairs)
            ? parseShotFieldRepairs({ shotRepairs: repaired.actionRepairs }, failure.failingPaths ?? [failure.jsonPath], originals.length) : null;
          candidate = undefined;
          if (patches) {
            candidate = structuredClone(output);
            if (record(candidate) && Array.isArray(candidate.shots)) for (const patch of patches) candidate.shots[patch.shotIndex][patch.field] = patch.value;
          } else {
            rejection.current = { jsonPath: "$.actionRepairs", reasonCode: "invalid_action_patch", expected: "exact allowed unsafe action paths once each; bounded local values" };
            onDiagnostic?.({ stage: "director_repair_attempt", result: "failed", ...rejection.current });
          }
        }
        // Accuracy reviews belong to the original images, not the creative retry.
        plan = candidate === undefined ? null : parseDirectorOutput(customRepair && record(candidate)
          ? { ...candidate, referenceReviews } : candidate, input, reject);
        if (!plan && customRepair && ["custom_shot_coherence", "non_executable_camera", "conflicting_camera_directions"].includes(failure.reasonCode)) retryableCustomRepairValidation = true;
        onDiagnostic?.({ stage: "director_repair_attempt", result: plan ? "success" : "failed", reasonCode: plan ? "repair_accepted" : rejection.current?.reasonCode, jsonPath: failure.jsonPath, matchedTerm: failure.matchedTerm });
      } catch (error) {
        onDiagnostic?.({ stage: "director_repair_attempt", result: "failed", reasonCode: "repair_request_failed", jsonPath: failure.jsonPath, matchedTerm: failure.matchedTerm });
        throw error;
      }
    }
    if (!plan) {
      failureReason = "plan_business_validation_failed";
    } else {
      onDiagnostic?.({ stage: "director_business_validation", result: "success" });
      try {
        compileDirectorPlan(plan, input);
        onDiagnostic?.({ stage: "plan_integrity_validation", result: "success" });
        return plan;
      } catch (error) {
        failureReason = "plan_integrity_validation_failed";
        onDiagnostic?.({ stage: "plan_integrity_validation", result: "failed", reasonCode: error instanceof Error && error.message === "kling_scene_prompt_too_long" ? error.message : failureReason });
      }
    }
  } catch (error) {
    failureReason = error instanceof DirectorStructuredOutputError ? error.reasonCode : error instanceof SyntaxError ? "invalid_structured_output" : "provider_error";
    onDiagnostic?.({ stage: failureReason === "provider_error" ? "director_provider_response_received" : "structured_output_parsed", result: "failed", reasonCode: failureReason });
  }
  if (input.draft.productReferences?.length && (!referenceReviews || referenceReviews.some(review => review.status !== "matched"))) {
    const reason = referenceReviews?.some(review => review.status === "conflict") ? "conflict"
      : referenceReviews?.some(review => review.status === "uncertain") ? "uncertain"
        : failureReason === "provider_error" || failureReason.startsWith("incomplete_") ? "unavailable" : "invalid_review";
    throw Object.assign(new DirectorStructuredOutputError("references_not_verified"), { referenceFailure: reason });
  }
  if (input.presetId === "custom") throw Object.assign(new DirectorStructuredOutputError("custom_director_unavailable"), { retryableUnsafeRepair, retryableCustomRepairValidation });
  const fallback = fallbackDirectorPlan(input, referenceReviews ?? []);
  compileDirectorPlan(fallback, input);
  return fallback;
}
