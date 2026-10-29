import type { ProductProfile } from "@/lib/product-understanding/product-profile";
import { isUnsafeProductMotion, productVideoNegativePrompt, VIDEO_PRESERVATION_VERSION } from "@/lib/video-generation/preservation";
import type { VideoGenerationDraft } from "@/lib/video-generation/types";
import { VIDEO_DIRECTOR_VERSION, videoDirectorPresets, shotPurposes, type ShotPurpose, type VideoPresetId, type VideoShotMode } from "./presets";
import { compileKlingShot } from "./kling-compiler";
import { unsupportedProductClaim, interpretCreativeIntent, type CreativeIntentContract } from "./creative-request";
import { KLING_MULTI_PROMPT_MAX_CHARS } from "../video-generation/fal-request";
import { directorProductContext } from "./product-context";
import { presetFocusEvidence } from "./preset-recommendations";
import { DIRECTOR_GENERIC_FOCUS_VALUES, DIRECTOR_SHOT_TEXT_LIMIT, DIRECTOR_TEXT_LIMIT, DirectorStructuredOutputError, directorShotContract, selectedCameras, shotFields } from "./plan-contract";
export { DIRECTOR_GENERIC_FOCUS_VALUES, shotFields } from "./plan-contract";

import { parseReferenceReviews, type ReferenceReview } from "../video-generation/product-references";

export type VideoDirectorSelection = { presetId: VideoPresetId; shotMode: VideoShotMode; receipt: string };
export type VideoDirectorInput = {
  referenceImages?: { profile?: ProductProfile | null; prepared: Buffer; sourceSha256: string; purpose: string }[];
  draft: VideoGenerationDraft;
  presetId: VideoPresetId;
  shotMode: VideoShotMode;
  profile: ProductProfile | null;
};
export type VideoDirectorShot = Record<typeof shotFields[number], string> & { durationSeconds: number; purpose: ShotPurpose; evidenceRefs: number[] };
export type VideoDirectorPlan = {
  version: typeof VIDEO_DIRECTOR_VERSION;
  presetId: VideoPresetId;
  presetVersion: number;
  shotMode: VideoShotMode;
  referenceReviews?: ReferenceReview[];
  origin: "ai" | "fallback";
  intent: string;
  intentContract: CreativeIntentContract;
  summary: string;
  shots: VideoDirectorShot[];
};
export type KlingMultiPrompt = { prompt: string; duration: string }[];

const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const text = (v: unknown, max: number): v is string => typeof v === "string" && Boolean(v.trim()) && v.length <= max;
function matchesCreativeIntent(value: unknown, expected: CreativeIntentContract) {
  if (!record(value)) return false;
  const keys = ["camera", "focusRequested", "focusEvidenceId", "focusPosition", "sequence", "safeAdjustment"];
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key) && value[key] === expected[key as keyof CreativeIntentContract]);
}

type CameraKind = "static" | "dolly-in" | "dolly-out" | "pan-left" | "pan-right" | "lateral" | "other";
function cameraKinds(value: string): CameraKind[] {
  value = value.replace(/\b(?:fixed|static|stationary|still)\s+(?:lighting|lights?|background|product|model|subject|item|jacket)\b/gi, "")
    .replace(/\b(?:product|model|subject|item|jacket)\s+(?:stays?|remains?|is)\s+(?:stationary|still)\b/gi, "")
    .replace(/\b(?:all\s+)?product\s+parts\s+(?:still|stationary)\b/gi, "")
    .replace(/\b(?:then|and|to|with)\s+(?:(?:a|the)\s+)?(?:(?:brief|calm|final)\s+)*(?:locked|static|fixed|still)\s+(?:final\s+)?hold\b/gi, "");
  const matches: CameraKind[] = [];
  if (/\b(?:locked|static|fixed|stationary|still)\b|\bno (?:camera )?movement\b/i.test(value)) matches.push("static");
  if (/\b(?:push(?:es|ing)?[ -]?(?:in|toward)|dolly[ -]?in|track(?:s|ing)?[ -]?in|zoom(?:s|ing)?[ -]?in|advance(?:s|ing)?|move(?:s|ment|ing)? closer|approach(?:es|ing)?)\b/i.test(value)) matches.push("dolly-in");
  if (/\b(?:pull(?:s|ing)?[ -]?(?:back|away)|dolly[ -]?out|zoom(?:s|ing)?[ -]?out|move(?:s|ment|ing)? away|retreat(?:s|ing)?)\b/i.test(value)) matches.push("dolly-out");
  if (/\bpan(?:s|ning)?[ -]?left\b/i.test(value)) matches.push("pan-left");
  if (/\bpan(?:s|ning)?[ -]?right\b/i.test(value)) matches.push("pan-right");
  if (!matches.includes("pan-left") && !matches.includes("pan-right") && /\b(?:lateral|sideways|slid(?:e|es|ing)|glid(?:e|es|ing)|truck(?:s|ing)?)\b/i.test(value)) matches.push("lateral");
  if (/\b(?:tilt(?:s|ing)?|sweep(?:s|ing)?|crane(?:s|ing)?|swing(?:s|ing)?|arc(?:s|ing)?)\b/i.test(value)) matches.push("other");
  return matches;
}
function frameScale(value: string): "close" | "full" | "medium" {
  return /macro|close|tight|crop/i.test(value) ? "close" : /full|wide|complete|silhouette|overview/i.test(value) ? "full" : "medium";
}
function carryLens(action: string, sourceCamera: string) {
  const lens = /long[ -]lens/i.test(sourceCamera) ? "Long-lens " : /\bmacro\b/i.test(sourceCamera) ? "Macro " : "";
  return lens ? `${lens}${action.charAt(0).toLowerCase()}${action.slice(1)}` : action;
}

/** An explicit selection wins only where the model's camera direction conflicts. */
function resolveShotCamera(shot: VideoDirectorShot, preference: VideoGenerationDraft["cameraMovement"]): VideoDirectorShot {
  if (preference === "auto") return shot;
  if (preference === "orbit") throw new Error("unsupported_camera");
  const selected = selectedCameras[preference];
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
export type DirectorValidationFailure = { jsonPath: string; reasonCode: string; expected: string; matchedTerm?: string };

/** Labels describe trusted plan metadata; focus labels are complete verified atoms. */
export function directorPlanDescriptions(input: VideoDirectorInput, shotCount: number) {
  const summary = `${input.presetId} · ${input.shotMode} · ${shotCount} shots · ${input.draft.durationSeconds}s`;
  const labels: string[] = [];
  for (const { detail } of directorProductContext(input.profile).evidence) {
    if (unsupportedProductClaim(detail, input.profile) || labels.includes(detail)) continue;
    if (`Verified focus: ${[...labels, detail].join(" | ")}`.length > DIRECTOR_TEXT_LIMIT) continue;
    labels.push(detail);
    if (labels.length === 2) break;
  }
  return { summary, intent: labels.length ? `Verified focus: ${labels.join(" | ")}` : "Source-visible product form." };
}
export function parseDirectorOutput(value: unknown, input: VideoDirectorInput, onReject?: (failure: DirectorValidationFailure) => void): VideoDirectorPlan | null {
  const reject = (jsonPath: string, reasonCode: string, expected: string, matchedTerm?: string) => { onReject?.({ jsonPath, reasonCode, expected, ...(matchedTerm ? { matchedTerm: matchedTerm.slice(0, 60) } : {}) }); return null; };
  const contractBounds = directorShotContract(input.shotMode, input.draft.durationSeconds);
  if (input.draft.cameraMovement === "orbit" || !record(value) || !text(value.summary, DIRECTOR_TEXT_LIMIT) || !text(value.intent, DIRECTOR_TEXT_LIMIT) || !Array.isArray(value.shots)
    || value.shots.length < contractBounds.minShots || value.shots.length > contractBounds.maxShots
) return reject("$", "invalid_plan_envelope", "summary/intent <= 240 chars and shot count matching shotMode and duration");
  const count = input.draft.productReferences?.length ?? 0;
  const referenceReviews = parseReferenceReviews(value.referenceReviews, count);
  if (!referenceReviews && !(value.origin === "fallback" && count)) return reject("$.referenceReviews", "invalid_reference_reviews", `exactly ${count} ordered reviews`);
  const baseEvidence = directorProductContext(input.profile).evidence;
  const additions = (referenceReviews ?? []).filter(r => r.status === "matched").flatMap(r => r.details);
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
  const expectedIntent = interpretCreativeIntent(input.draft.prompt, baseEvidence, input.shotMode, input.draft.cameraMovement);
  if (!matchesCreativeIntent(value.intentContract, expectedIntent)) return reject("$.intentContract", "intent_contract_mismatch", "exact supplied camera/focus/sequence contract");
  const shots: VideoDirectorShot[] = [];
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
    if (hasEvidenceRefs && !Array.isArray(shot.evidenceRefs) || evidenceRefs.length > 1
      || evidenceRefs.some(id => !Number.isInteger(id) || !evidence[Number(id)])) {
      return reject(`$.shots[${shots.length}].evidenceRefs`, "invalid_evidence_reference", "at most one existing verified evidence id");
    }
    // Specific focus must quote an existing evidence atom, not model-invented detail.
    const focus = evidenceRefs.length ? evidence[Number(evidenceRefs[0])].detail : resolvedFocus;
    if (!text(focus, DIRECTOR_SHOT_TEXT_LIMIT)) return reject(`$.shots[${shots.length}].focus`, "invalid_shot_fields", "focus <= 100 characters");
    if ((focusEvidenceToken && (!tokenEvidence || evidenceRefs.length !== 1 || evidenceRefs[0] !== tokenEvidence.id))
      || focus !== resolvedFocus || !evidenceRefs.length && !DIRECTOR_GENERIC_FOCUS_VALUES.includes(focus as typeof DIRECTOR_GENERIC_FOCUS_VALUES[number])) {
      return reject(`$.shots[${shots.length}].focus`, "focus_not_evidence_bound", "a verified-evidence:<id> present in the validated product evidence, or an allowed generic focus without evidenceRefs");
    }
    for (const field of shotFields) {
      const direction = field === "focus" ? focus : shot[field] as string;
      if (isUnsafeProductMotion(direction, input.draft.cameraMovement)
        || /\b(?:rear|backside|underside|interior|hidden mechanism|unseen surface|new (?:logo|label|accessory|prop)|open (?:the )?(?:cap|lid|clasp|zipper))\b/i.test(direction)) {
        return reject(`$.shots[${shots.length}].${field}`, "unsafe_product_action", "source-facing action without hidden surfaces or identity changes");
      }
      if (/\b(?:cut to|cutaway|crossfade|dissolve to|montage|jump cut|scene change)\b/i.test(direction)) {
        return reject(`$.shots[${shots.length}].${field}`, "internal_scene_cut", "one continuous action per shot");
      }
      // Resolved focus is copied from canonical evidence, never reinterpreted prose.
      const matchedTerm = field !== "focus" ? unsupportedProductClaim(direction, enrichedProfile) : null;
      if (matchedTerm) {
        return reject(`$.shots[${shots.length}].${field}`, "unsupported_product_claim", "only claims supported by verified product evidence", matchedTerm);
      }
    }
    const resolved = resolveShotCamera({ durationSeconds: shot.durationSeconds, purpose: shot.purpose as ShotPurpose, evidenceRefs: evidenceRefs as number[],
      ...Object.fromEntries(shotFields.map(field => [field, field === "focus" ? focus : shot[field]])) } as VideoDirectorShot, input.draft.cameraMovement);
    const movements = new Set(cameraKinds(resolved.camera));
    for (const field of ["composition", "motion", "pace", "lighting", "focus"] as const) {
      if (/\b(?:camera|frame|viewpoint|shot)\b/i.test(resolved[field])) cameraKinds(resolved[field]).forEach(kind => movements.add(kind));
    }
    if (movements.size > 1) return reject(`$.shots[${shots.length}].camera`, "conflicting_camera_directions", "one coherent camera trajectory");
    shots.push(resolved);
  }
  if (shots.reduce((sum, shot) => sum + shot.durationSeconds, 0) !== input.draft.durationSeconds) return reject("$.shots[*].durationSeconds", "total_duration_mismatch", `sum exactly ${input.draft.durationSeconds} seconds`);
  if (input.shotMode === "multi") {
    if (new Set(shots.map(shot => shot.purpose)).size !== shots.length) return reject("$.shots[*].purpose", "repeated_shot_purpose", "distinct purpose per shot");
    if (new Set(shots.map(shot => `${shot.camera}|${shot.composition}|${shot.focus}`.toLowerCase())).size !== shots.length) return reject("$.shots[*]", "repeated_shot_direction", "distinct camera/composition/focus per shot");
    // With automatic direction, multiple identical push-ins are not a shot strategy.
    if (input.draft.cameraMovement === "auto" && shots.every(shot => cameraKinds(shot.camera).includes("dolly-in"))) return reject("$.shots[*].camera", "repeated_push_in", "vary shot scale or camera direction for automatic multi-shot");
  }
  const contract = expectedIntent;
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
  if (contract.focusEvidenceId !== null) {
    const target = evidence[contract.focusEvidenceId]?.detail;
    const targetShots = shots.filter(shot => shot.focus === target);
    if (!targetShots.length || contract.focusPosition === "first" && shots[0].focus !== target
      || contract.focusPosition === "last" && shots.at(-1)!.focus !== target) return reject("$.shots[*].focus", "requested_focus_not_preserved", "requested verified evidence at requested position");
  }
  return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: videoDirectorPresets[input.presetId].version,
    shotMode: input.shotMode, ...(referenceReviews?.length ? { referenceReviews } : {}), origin: "ai", intent: value.intent.trim(), intentContract: expectedIntent, summary: value.summary.trim(), shots };
}

export function fallbackDirectorPlan(input: VideoDirectorInput): VideoDirectorPlan {
  const preset = videoDirectorPresets[input.presetId];
  const evidence = directorProductContext(input.profile).evidence;
  const intentContract = interpretCreativeIntent(input.draft.prompt, evidence, input.shotMode, input.draft.cameraMovement);
  const durations = input.shotMode === "single" ? [input.draft.durationSeconds]
    : input.draft.durationSeconds === 5 ? [2, 3] : [3, 4, 3];
  const requestedEvidence = intentContract.focusEvidenceId === null ? undefined : evidence[intentContract.focusEvidenceId];
  const isDetailPreset = preset.strategy.detailTerms.length > 0 && /macro|detail|label|stitch|hardware|texture|dial|craft/i.test(`${preset.brief} ${preset.strategy.objective} ${preset.strategy.detailTerms.join(" ")}`);
  const fallbackDetail = requestedEvidence ?? presetFocusEvidence(input.presetId, evidence)
    ?? (isDetailPreset ? evidence.find(item => item.detail.length <= 100 && !/silhouette|shape|form|geometr/i.test(item.detail)) : undefined);
  const form = evidence.find(item => item.detail.length <= 100 && /silhouette|shape|form|geometr/i.test(item.detail));
  const supportingEvidence = evidence.find(item => item.id !== fallbackDetail?.id);
  const singleDetail = intentContract.focusRequested || isDetailPreset;
  const summary = intentContract.safeAdjustment === "unseen-side-to-source-facing-camera"
    ? "The requested unseen-side turn is replaced with a source-facing camera move; verified product details and color remain unchanged."
    : intentContract.focusRequested && !requestedEvidence
      ? "The requested detail is not verified in the product profile, so the plan uses a wider source-visible view without inventing it."
    : singleDetail && !fallbackDetail && input.shotMode === "single"
      ? "No verified close-detail evidence is available, so this continuous take stays at a clear product view instead of inventing a feature."
      : "Preset direction adapted to the explicit camera and focus request using only verified product evidence.";
  return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: preset.version, shotMode: input.shotMode,
    origin: "fallback", intent: input.draft.prompt.trim() ? "Explicit camera, evidence-backed focus and feasible shot order are applied; unsupported details stay source-bound." : "Preset direction selected from verified product evidence.", intentContract,
    summary,
    shots: durations.map((durationSeconds, index) => {
      const presetIndex = durations.length === 2 ? index + 1 : index;
      const direction = input.shotMode === "single" ? preset : preset.shots[presetIndex];
      const sequenceDetail = intentContract.sequence === "detail-to-hero" && (index === 0 || index === durations.length - 1);
      const isDetail = input.shotMode === "single" ? singleDetail : presetIndex === 1 || sequenceDetail;
      const requestedFocusShot = intentContract.focusPosition === "first" && index === 0
        || intentContract.focusPosition === "last" && index === durations.length - 1;
      const chosen = requestedFocusShot ? requestedEvidence : isDetail ? fallbackDetail : form ?? supportingEvidence;
      let camera = direction.camera;
      let composition = direction.composition;
      if (sequenceDetail) {
        camera = carryLens(index === 0 ? "Slow dolly-in into source-resolved close framing" : "Slow pull-back to the complete visible product", direction.camera);
        composition = index === 0 ? "Close framing on the requested visible detail" : "Complete visible product with balanced margins";
      }
      if (input.shotMode === "single" && intentContract.sequence === "detail-to-hero") {
        camera = carryLens("Slow pull-back from a source-resolved close view to the complete product", direction.camera);
        composition = `Start close on ${chosen?.detail ?? "the visible product form"}, then finish on the complete visible product`;
      }
      if (input.shotMode === "single" && isDetailPreset && !fallbackDetail && intentContract.focusEvidenceId === null) {
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
      return resolveShotCamera({ durationSeconds, purpose: input.shotMode === "single"
        ? isDetail ? "material-study" : "hero-reveal" : preset.shots[presetIndex].purpose,
        evidenceRefs: chosen ? [chosen.id] : [],
        camera, lighting: direction.lighting,
        composition: isDetail && !chosen ? "Wider view of the source-visible product form; no unverified detail is enlarged" : composition,
        motion: direction.motion, pace: direction.pace,
        focus: chosen?.detail ?? (isDetail ? "Source-visible surface detail" : "Source-visible product form"),
      }, input.draft.cameraMovement);
    }) };
}

/** Preserve actual directing decisions; never replace them with generic zoom/hero templates. */
export function compileDirectorPlan(plan: VideoDirectorPlan, input: VideoDirectorInput) {
  if (plan.version !== VIDEO_DIRECTOR_VERSION || plan.presetId !== input.presetId || plan.shotMode !== input.shotMode
    || plan.presetVersion !== videoDirectorPresets[input.presetId].version) throw new Error("invalid_director_plan");
  const validated = parseDirectorOutput(plan, input);
  if (!validated) throw new Error("invalid_director_plan");
  const multi = plan.shotMode === "multi";
  const limit = multi ? KLING_MULTI_PROMPT_MAX_CHARS : 2500;
  const usesReferences = plan.origin === "ai" && validated.referenceReviews?.some(r => r.status === "matched");
  const prefix = usesReferences ? "@Element1: " : "";
  const prompts = validated.shots.map(shot => prefix + compileKlingShot(shot, limit - prefix.length, Boolean(input.draft.criticalRegion)));
  const negativePrompt = productVideoNegativePrompt.replace("object rotation, ", "");
  return { prompt: prompts[0], multiPrompt: multi
    ? prompts.map((prompt, index) => ({ prompt, duration: String(validated.shots[index].durationSeconds) })) : undefined,
    negativePrompt: multi ? negativePrompt.replace("scene cuts, ", "") : negativePrompt,
    cfgScale: 0.5, version: VIDEO_PRESERVATION_VERSION };
}

export type DirectorPlanningDiagnostic = { stage: "director_provider_response_received" | "structured_output_parsed" | "director_business_validation" | "plan_integrity_validation" | "director_repair_attempt"; result: "success" | "failed"; reasonCode?: string; jsonPath?: string; expected?: string; matchedTerm?: string };

export async function directVideoWithClient(input: VideoDirectorInput, client: { createPlan(input: VideoDirectorInput): Promise<unknown>; repairPlan?(input: VideoDirectorInput, failure: DirectorValidationFailure): Promise<unknown> },
  onDiagnostic?: (event: DirectorPlanningDiagnostic) => void) {
  let failureReason = "provider_error";
  try {
    const output = await client.createPlan(input);
    onDiagnostic?.({ stage: "structured_output_parsed", result: "success" });
    const rejection: { current?: DirectorValidationFailure } = {};
    const reject = (failure: DirectorValidationFailure) => {
      rejection.current = failure;
      onDiagnostic?.({ stage: "director_business_validation", result: "failed", ...failure });
    };
    let plan = parseDirectorOutput(output, input, reject);
    if (!plan && rejection.current?.reasonCode === "unsupported_product_claim" && client.repairPlan) {
      const failure = rejection.current;
      onDiagnostic?.({ stage: "director_repair_attempt", result: "success", reasonCode: "repair_started", jsonPath: failure.jsonPath, matchedTerm: failure.matchedTerm });
      try {
        const repaired = await client.repairPlan(input, failure);
        plan = parseDirectorOutput(repaired, input, reject);
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
  const fallback = fallbackDirectorPlan(input);
  compileDirectorPlan(fallback, input);
  return fallback;
}
