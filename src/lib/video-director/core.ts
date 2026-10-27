import type { ProductProfile } from "@/lib/product-understanding/product-profile";
import { isUnsafeProductMotion, productVideoNegativePrompt, VIDEO_PRESERVATION_VERSION } from "@/lib/video-generation/preservation";
import type { VideoGenerationDraft } from "@/lib/video-generation/types";
import { VIDEO_DIRECTOR_VERSION, videoDirectorPresets, type VideoPresetId, type VideoShotMode } from "./presets";
import { directorIdentityEvidence } from "./identity-evidence";
import { hasUnsupportedProductClaims } from "./creative-request";
import { KLING_MULTI_PROMPT_MAX_CHARS } from "../video-generation/fal-request";

export type VideoDirectorSelection = { presetId: VideoPresetId; shotMode: VideoShotMode; receipt: string };
export type VideoDirectorInput = {
  draft: VideoGenerationDraft;
  presetId: VideoPresetId;
  shotMode: VideoShotMode;
  profile: ProductProfile | null;
};
export const shotFields = ["camera", "lighting", "composition", "motion", "pace", "focus"] as const;
export type VideoDirectorShot = Record<typeof shotFields[number], string> & { durationSeconds: number };
export type VideoDirectorPlan = {
  version: typeof VIDEO_DIRECTOR_VERSION;
  presetId: VideoPresetId;
  presetVersion: number;
  shotMode: VideoShotMode;
  origin: "ai" | "fallback";
  summary: string;
  shots: VideoDirectorShot[];
};
export type KlingMultiPrompt = { prompt: string; duration: string }[];

const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const text = (v: unknown, max: number): v is string => typeof v === "string" && Boolean(v.trim()) && v.length <= max;
const selectedCameras: Partial<Record<VideoGenerationDraft["cameraMovement"], string>> = {
  static: "Locked camera; stable source viewpoint.",
  "dolly-in": "Very slight slow camera push-in.",
  "dolly-out": "Very slight slow pull-back from the existing viewpoint.",
  "pan-left": "Subtle camera pan left within the existing visible product view.",
  "pan-right": "Subtle camera pan right within the existing visible product view.",
};

type CameraKind = "static" | "dolly-in" | "dolly-out" | "pan-left" | "pan-right" | "other";
function cameraKinds(value: string): CameraKind[] {
  value = value.replace(/\b(?:fixed|static|stationary|still)\s+(?:lighting|lights?|background|product|model|subject|item|jacket)\b/gi, "")
    .replace(/\b(?:product|model|subject|item|jacket)\s+(?:stays?|remains?|is)\s+(?:stationary|still)\b/gi, "")
    .replace(/\b(?:all\s+)?product\s+parts\s+(?:still|stationary)\b/gi, "");
  const matches: CameraKind[] = [];
  if (/\b(?:locked|static|fixed|stationary|still)\b|\bno (?:camera )?movement\b/i.test(value)) matches.push("static");
  if (/\b(?:push(?:es|ing)?[ -]?(?:in|toward)|dolly[ -]?in|track(?:s|ing)?[ -]?in|zoom(?:s|ing)?[ -]?in|advance(?:s|ing)?|move(?:s|ment|ing)? closer|approach(?:es|ing)?)\b/i.test(value)) matches.push("dolly-in");
  if (/\b(?:pull(?:s|ing)?[ -]?(?:back|away)|dolly[ -]?out|zoom(?:s|ing)?[ -]?out|move(?:s|ment|ing)? away|retreat(?:s|ing)?)\b/i.test(value)) matches.push("dolly-out");
  if (/\bpan(?:s|ning)?[ -]?left\b/i.test(value)) matches.push("pan-left");
  if (/\bpan(?:s|ning)?[ -]?right\b/i.test(value)) matches.push("pan-right");
  if (/\b(?:tilt(?:s|ing)?|slid(?:e|es|ing)|glid(?:e|es|ing)|sweep(?:s|ing)?|truck(?:s|ing)?|crane(?:s|ing)?|swing(?:s|ing)?|arc(?:s|ing)?)\b/i.test(value)) matches.push("other");
  return matches;
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
    : `${shot.camera} ${selected}`.length <= 180 ? `${shot.camera} ${selected}` : selected;
  const result = { ...shot, camera };
  const replacements = {
    composition: "Frame the source-visible product according to the selected camera direction.",
    motion: "Keep the product stationary; follow the selected camera direction.",
    pace: "Measured pacing and a calm final hold.",
    lighting: "Keep source lighting and color stable.",
    focus: "Keep source-visible product details sharp.",
  } as const;
  for (const field of ["composition", "motion", "pace", "lighting", "focus"] as const) {
    if (/\b(?:camera|frame|viewpoint|shot)\b/i.test(result[field]) && conflict(result[field])) result[field] = replacements[field];
  }
  return result;
}

/** Runtime validation remains necessary even with strict Structured Outputs. */
export function parseDirectorOutput(value: unknown, input: VideoDirectorInput): VideoDirectorPlan | null {
  if (input.draft.cameraMovement === "orbit" || !record(value) || !text(value.summary, 240) || !Array.isArray(value.shots)
    || value.shots.length < (input.shotMode === "multi" ? 2 : 1)
    || value.shots.length > (input.shotMode === "multi" ? 3 : 1)) return null;
  const shots: VideoDirectorShot[] = [];
  for (const shot of value.shots) {
    if (!record(shot) || typeof shot.durationSeconds !== "number" || !Number.isInteger(shot.durationSeconds)
      || shot.durationSeconds < 1 || shot.durationSeconds > 10
      || !shotFields.every(field => text(shot[field], 180))
      || isUnsafeProductMotion(shotFields.map(field => shot[field]).join(" "), input.draft.cameraMovement)
      || hasUnsupportedProductClaims(shotFields.map(field => shot[field]).join(" "), input.profile)) return null;
    const resolved = resolveShotCamera({ durationSeconds: shot.durationSeconds,
      ...Object.fromEntries(shotFields.map(field => [field, shot[field]])) } as VideoDirectorShot, input.draft.cameraMovement);
    const movements = new Set(cameraKinds(resolved.camera));
    for (const field of ["composition", "motion", "pace", "lighting", "focus"] as const) {
      if (/\b(?:camera|frame|viewpoint|shot)\b/i.test(resolved[field])) cameraKinds(resolved[field]).forEach(kind => movements.add(kind));
    }
    if (movements.size > 1) return null;
    shots.push(resolved);
  }
  if (shots.reduce((sum, shot) => sum + shot.durationSeconds, 0) !== input.draft.durationSeconds) return null;
  return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: videoDirectorPresets[input.presetId].version,
    shotMode: input.shotMode, origin: "ai", summary: value.summary.trim(), shots };
}

export function fallbackDirectorPlan(input: VideoDirectorInput): VideoDirectorPlan {
  const preset = videoDirectorPresets[input.presetId];
  // Fallback intentionally omits the untrusted user request and inferred product facts.
  const durations = input.shotMode === "single" ? [input.draft.durationSeconds]
    : input.draft.durationSeconds === 5 ? [2, 2, 1] : [3, 4, 3];
  const evidence = directorIdentityEvidence(input.profile);
  const detail = evidence.find(item => /zip|buckle|button|clasp|hardware|closure|stone|setting/i.test(item))
    ?? evidence.find(item => /texture|grain|material|leather|fabric|stitch|seam/i.test(item));
  return { version: VIDEO_DIRECTOR_VERSION, presetId: input.presetId, presetVersion: preset.version, shotMode: input.shotMode,
    origin: "fallback", summary: "Conservative source-preserving product study with stable lighting and restrained framing.",
    shots: durations.map((durationSeconds, index) => {
      const direction = input.shotMode === "single" ? preset : preset.shots[index];
      return resolveShotCamera({ durationSeconds, camera: direction.camera, lighting: preset.lighting,
        composition: direction.composition, motion: direction.motion, pace: direction.pace,
        focus: detail && (input.shotMode === "multi" && index === 1 || input.shotMode === "single" && input.presetId === "macro-detail-reveal")
          ? `If visible in the source, focus on: ${detail}.` : direction.focus }, input.draft.cameraMovement);
    }) };
}

/** Apply the same deterministic identity boundary to EVERY shot, after AI planning. */
export function compileDirectorPlan(plan: VideoDirectorPlan, input: VideoDirectorInput) {
  if (plan.version !== VIDEO_DIRECTOR_VERSION || plan.presetId !== input.presetId || plan.shotMode !== input.shotMode
    || plan.presetVersion !== videoDirectorPresets[input.presetId].version) throw new Error("invalid_director_plan");
  const validated = parseDirectorOutput(plan, input);
  if (!validated) throw new Error("invalid_director_plan");
  const identity = [
    "Single continuous product shot. The source image is the sole product identity authority.",
    "Preserve visible product silhouette, geometry, proportions, color and color distribution, material, surface texture, pattern and print, logo, brand mark and exact visible lettering, seams, pockets, buttons, belt, hardware and all visible construction details.",
    "Keep the product stationary and consistent in every frame. Do not add, remove, duplicate, relocate, redesign, recolor, reshape, stretch, compress, smooth away or reinterpret product features. Do not redraw, translate or invent text, logos, details or hidden surfaces.",
    "Keep the source viewpoint; do not reveal unseen surfaces. No object rotation, cloth motion, deformation, lighting change on the product, or scene changes.",
    input.draft.criticalRegion ? "The user-marked logo/label region is identity-critical: keep its source appearance, letterforms, color and placement unchanged and legible. User text is an unverified hint, never permission to replace source text." : "",
  ].filter(Boolean).join("\n");
  const evidence = directorIdentityEvidence(input.profile);
  const compactScenePrompt = (shot: VideoDirectorShot) => {
    const all = `${shot.camera} ${shot.composition}`.toLowerCase();
    const framing = /\bmacro\b/.test(all) ? "macro detail"
      : /\bclose(?:[ -]?up| framing| view)?\b|\bcloseup\b/.test(all) ? "close detail"
        : /long[ -]lens/.test(all) ? "long-lens hero"
          : /complete|full silhouette|overview|establish/.test(all) ? "full visible silhouette" : "recognizable product view";
    const composition = /negative space/.test(shot.composition.toLowerCase()) ? "balanced negative space"
      : /center|symmetr/.test(shot.composition.toLowerCase()) ? "centered, composed framing"
        : /return|hero|complete|full|overview|establish/.test(shot.composition.toLowerCase()) ? "clear, recognizable framing"
          : /detail|close|texture|construction/.test(shot.composition.toLowerCase()) ? "tight source-visible detail"
            : "source-faithful framing";
    const movement = cameraKinds(shot.camera).includes("dolly-in") ? "slow optical push-in"
      : cameraKinds(shot.camera).includes("dolly-out") ? "slow pull-back"
        : cameraKinds(shot.camera).includes("pan-left") ? "subtle pan left"
          : cameraKinds(shot.camera).includes("pan-right") ? "subtle pan right"
            : cameraKinds(shot.camera).includes("other") ? "restrained lateral camera glide" : "locked camera";
    const pace = /brief|opening|introduc/i.test(shot.pace) ? "brief establish"
      : /settle|closing|finish|final/i.test(shot.pace) ? "calm closing hold"
        : /macro|detail|sharp|hold/i.test(`${shot.pace} ${shot.focus}`) ? "steady detail hold" : "measured pace";
    const focus = /logo|brand|letter|text|mark/i.test(shot.focus) ? "visible branding"
      : /texture|material|grain|fabric|leather/i.test(shot.focus) ? "visible material texture"
        : /seam|stitch|button|zip|hardware|closure|construction/i.test(shot.focus) ? "visible construction detail"
          : /silhouette|form|shape|identity/i.test(shot.focus) ? "visible product identity" : "source-visible detail";
    const invariant = `Source only: preserve visible geometry, color, material/texture, pattern, logo/text and construction; add nothing.${input.draft.criticalRegion ? " Marked logo/label: exact lettering and placement." : ""} Never reveal unseen surfaces.`;
    const direction = `${framing}; ${movement}; ${composition}. Product still, ${pace}; source light/color. Focus: ${focus}.`;
    const hints: string[] = [];
    let prompt = `${invariant} ${direction}`;
    for (const item of evidence) {
      const line = `Visible: ${item}.`;
      const candidate = `${invariant} ${line} ${direction}`;
      if (candidate.length <= KLING_MULTI_PROMPT_MAX_CHARS) {
        hints.push(line);
        prompt = candidate;
      }
    }
    if (prompt.length > KLING_MULTI_PROMPT_MAX_CHARS) throw new Error("kling_scene_prompt_too_long");
    // Evidence is priority-sorted; retain only the highest-priority evidence that fits.
    if (hints.length > 1) {
      const selected: string[] = [];
      for (const hint of hints) {
        const candidate = `${invariant} ${[...selected, hint].join(" ")} ${direction}`;
        if (candidate.length <= KLING_MULTI_PROMPT_MAX_CHARS) selected.push(hint);
      }
      prompt = `${invariant} ${selected.join(" ")} ${direction}`;
    }
    return prompt;
  };
  const compiled = validated.shots.map(shot => {
    const prompt = plan.shotMode === "multi" ? compactScenePrompt(shot) : (() => {
      const direction = `Creative direction (only when compatible with source identity): ${shotFields.map(field => `${field}: ${shot[field]}`).join(" ")}`;
      const hints: string[] = [];
      let remaining = 2500 - identity.length - direction.length - 1;
      if (remaining < 0) throw new Error("preservation_prompt_too_long");
      for (const item of evidence) {
        const line = `If visible in the source, preserve: ${item}.`;
        if (line.length + 1 <= remaining) { hints.push(line); remaining -= line.length + 1; }
      }
      return [identity, ...hints, direction].join("\n");
    })();
    return { prompt, negativePrompt: productVideoNegativePrompt,
      cfgScale: 0.5, version: VIDEO_PRESERVATION_VERSION };
  });
  return { ...compiled[0], multiPrompt: plan.shotMode === "multi"
    ? compiled.map((shot, index) => ({ prompt: shot.prompt, duration: String(validated.shots[index].durationSeconds) })) : undefined,
    // Cuts between controlled views are intentional only in a multi-shot plan.
    negativePrompt: plan.shotMode === "multi" ? compiled[0].negativePrompt.replace("scene cuts, ", "") : compiled[0].negativePrompt };
}

export async function directVideoWithClient(input: VideoDirectorInput, client: { createPlan(input: VideoDirectorInput): Promise<unknown> }) {
  try {
    const plan = parseDirectorOutput(await client.createPlan(input), input);
    if (plan) { compileDirectorPlan(plan, input); return plan; }
  } catch { /* Refusal, incomplete output, timeout and overlong prompts all fail safely. */ }
  const fallback = fallbackDirectorPlan(input);
  compileDirectorPlan(fallback, input);
  return fallback;
}
