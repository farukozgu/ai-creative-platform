import { isDeepStrictEqual } from "node:util";
import { videoStudioPresetIds } from "../../src/features/video/video-preset-catalog";
import { fallbackDirectorPlan, type VideoDirectorInput, type VideoDirectorPlan, type VideoDirectorShot } from "../../src/lib/video-director/core";
import { directorProductContext } from "../../src/lib/video-director/product-context";
import { hasUnsupportedProductClaims } from "../../src/lib/video-director/creative-request";
import { directorShotContract } from "../../src/lib/video-director/plan-contract";
import { usesD1FiveSecondMulti } from "../../src/lib/video-director/five-second-multi";
import type { IntentContract, BenchmarkProduct } from "./dataset";

export type Failure = "invented-detail" | "unjustified-intent-loss" | "shot-mode-conflict" | "repeated-scene" | "payload-limit" | "signed-preview-payload-mismatch" | "unseen-surface" | "unexplained-risk" | "five-second-overload";
export type Parts = { product: number; cinema: number; difference: number; intent: number; identity: number; prompt: number };
export const weights: Parts = { product: 25, cinema: 20, difference: 20, intent: 15, identity: 15, prompt: 5 };
const normalized = (s: string) => s.toLowerCase().replace(/[.;,]/g, "").replace(/\s+/g, " ").trim();

/** Observable decisions; adjectives/word diversity and preset names are excluded. */
export function cameraMoves(text: string) {
  const s = text.toLowerCase(), moves: string[] = [];
  if (/push|dolly.in|approach|advance|zoom.in/.test(s)) moves.push("in");
  if (/pull.back|dolly.out|zoom.out|retreat|widen/.test(s)) moves.push("out");
  if (/pan.left/.test(s)) moves.push("left");
  if (/pan.right/.test(s)) moves.push("right");
  if (/vertical|upward|tilt/.test(s)) moves.push("vertical");
  else if (/glide|slide|pan |parallax/.test(s) && !moves.includes("left") && !moves.includes("right")) moves.push("lateral");
  else if (/tracking/.test(s)) moves.push("tracking-unspecified");
  if (/locked|static|fixed/.test(s)) moves.push("static");
  return [...new Set(moves)].sort();
}
function scale(s: string) {
  if (/macro|close|tight|crop/i.test(s)) return "close";
  if (/full|wide|complete|silhouette|overview/i.test(s)) return "full";
  return "medium";
}
function creativeText(text: string) {
  return text.toLowerCase().split(/[;.!?](?=\s|$)/)
    .filter(clause => !/^\s*(?:no\b|never\b|do not\b|without\b|(?:keep|preserve|retain)\s+(?:the\s+)?(?:source|original|exact|known)\b)/.test(clause))
    .map(clause => clause.replace(/\s+(?:without|no|never|do not)\s+.*$/, ""))
    .join(" ");
}

function trajectory(s: string) {
  // Preserve the order of positive movements and distinguish optical zoom from translation.
  return [...s.matchAll(/\b(zoom[ -]in|zoom[ -]out|push(?:[ -]in)?|dolly[ -]in|approach|advance|pull[ -]back|dolly[ -]out|retreat|pan (?:left|right)|tilt (?:up|down)|arc|orbit|glide|slide|parallax)\b/g)]
    .map(([move]) => {
      if (/^(?:push|dolly[ -]in|approach|advance)/.test(move)) return "push-in";
      if (/^(?:pull|dolly[ -]out|retreat)/.test(move)) return "pull-back";
      if (/^(?:glide|slide|parallax)$/.test(move)) return "glide";
      return move.replace(/[ -]/g, "-");
    });
}

function layout(s: string) {
  if (/asymmetr|off.center|diagonal/.test(s)) return "asymmetric";
  if (/symmetr/.test(s)) return "symmetric";
  if (/centered|balanced (?:full|hero|product) framing/.test(s)) return "centered";
  if (/vertical (?:space|margins)|space above/.test(s)) return "vertical-space";
  if (/horizontal (?:space|margins|breathing)|side margins/.test(s)) return "side-space";
  if (/forward (?:graphic space|breathing)/.test(s)) return "forward-space";
  return /negative space|margins|breathing/.test(s) ? "space" : "neutral";
}

function lighting(s: string) {
  const event = /travel|crosses|crossing|sweep|moving|(?:light|highlight) pass|light band traces/.test(s) ? "travel"
    : /\b(?:grows|builds|brightens)\b/.test(s) ? "rise"
    : /\b(?:fades|dims)\b/.test(s) ? "fade"
    : /\bpulses?\b/.test(s) ? "pulse"
    : /\bshifts\b/.test(s) ? "shift" : "steady";
  const placement = /overhead|top.down/.test(s) ? "overhead" : /top.side/.test(s) ? "top-side"
    : /rim|backlight/.test(s) ? "rim" : /\bfill\b/.test(s) ? "fill" : "unspecified";
  const quality = /graz|raking/.test(s) ? "grazing" : /side|directional|edge|contour/.test(s) ? "directional" : "diffuse";
  const spread = /\b(?:narrow|focused|spot)\b/.test(s) ? "narrow" : /\b(?:broad|wide)\b/.test(s) ? "broad" : "unspecified";
  const direction = event === "travel" ? s.match(/\b(?:left.to.right|right.to.left)\b/)?.[0].replace(/[ -]/g, "-") : undefined;
  return { event, placement, quality, spread, direction };
}

function visualDecisions(shot: VideoDirectorShot) {
  const camera = creativeText(shot.camera);
  const frame = camera + " " + creativeText(shot.composition);
  const motion = creativeText(shot.motion);
  return {
    camera: { axes: cameraMoves(camera), trajectory: trajectory(camera), axial: /\baxial\b/.test(camera) },
    lens: /long.lens/.test(camera) ? "long-lens" : /macro/.test(camera) ? "macro" : "unspecified",
    lighting: lighting(creativeText(shot.lighting)),
    layout: layout(frame),
    scale: scale(frame),
    focus: normalized(shot.focus),
    motion: {
      floating: /\b(?:float\w*|suspend\w*|rise|rises|upward drift)\b/.test(motion),
      settling: /\bsettl\w*\b/.test(motion),
      fabric: /\b(?:rippl\w*|flutter\w*|sway\w*)\b/.test(motion),
      focusPull: /\b(?:rack focus|focus (?:pulls|shifts|settles))\b/.test(motion),
    },
  };
}

export function strategyRepresentation(plan: VideoDirectorPlan) {
  return plan.shots.map(shot => ({
    ...visualDecisions(shot),
    rhythm: { seconds: shot.durationSeconds,
      timedPhases: [...creativeText(shot.pace).matchAll(/\b(\d+(?:\.\d+)?)\s*(?:s\b|seconds?\b)/g)].map(match => Number(match[1])) },
  }));
}

const strategyWeights = { camera: 20, lens: 5, lighting: 20, layout: 10, scale: 15, focus: 10, motion: 10, rhythm: 10 } as const;
const strategyAxes = Object.keys(strategyWeights) as (keyof typeof strategyWeights)[];

export function planDistance(a: ReturnType<typeof strategyRepresentation>, b: ReturnType<typeof strategyRepresentation>) {
  const distance = strategyAxes.reduce((sum, axis) => sum + (isDeepStrictEqual(a.map(s => s[axis]), b.map(s => s[axis]))
    ? 0 : strategyWeights[axis]), 0);
  return distance / 100;
}

export function assessPlan(plan: VideoDirectorPlan, input: VideoDirectorInput, product: BenchmarkProduct, intent: IntentContract, notices: string[]) {
  const failures: Failure[] = [], weaknesses: string[] = [], strengths: string[] = [];
  const evidence = directorProductContext(input.profile).evidence;
  const directions = plan.shots.map(s => [s.camera, s.composition, s.lighting, s.motion, s.focus].join(" ")).join(" ");
  const grounded = plan.shots.every(s => s.evidenceRefs.length ? s.evidenceRefs.every(id => evidence[id]?.detail === s.focus) : /^Source-visible/.test(s.focus));
  if (!grounded || hasUnsupportedProductClaims(directions, input.profile)) failures.push("invented-detail");
  const unseen = /\b(?:360|orbit around|rear view|backside|underside|unseen surface reveal|reveal the back)\b/i.test(directions);
  if (unseen) failures.push("unseen-surface");
  if ((unseen || /exploded|manufactur|workshop|spray from|new hands/i.test(directions)) && notices.length === 0) failures.push("unexplained-risk");
  if (plan.shotMode !== input.shotMode || input.shotMode === "single" && plan.shots.length !== 1 || /\b(?:cut to|montage|jump cut|crossfade)\b/i.test(directions)) failures.push("shot-mode-conflict");
  // A different duration or purpose label alone does not make a duplicate shot distinct.
  const visualSignatures = plan.shots.map(shot => JSON.stringify(visualDecisions(shot)));
  if (input.shotMode === "multi" && visualSignatures.some((signature, i) => i > 0 && signature === visualSignatures[i - 1])) failures.push("repeated-scene");
  const contract = directorShotContract(input.shotMode, input.draft.durationSeconds, input.presetId);
  const overload = input.draft.durationSeconds === 5 && (plan.shots.length > contract.maxShots
    || plan.shots.some(s => !Number.isFinite(s.durationSeconds) || s.durationSeconds < contract.minDuration || cameraMoves(s.camera).filter(m => m !== "static").length > 1));
  if (overload) failures.push("five-second-overload");
  const moves = plan.shots.map(s => cameraMoves(s.camera));
  let cameraSatisfied = true;
  if (intent.camera === "static") cameraSatisfied = moves.every(m => m.length === 1 && m[0] === "static");
  if (intent.camera === "pan-right") cameraSatisfied = moves.every(m => m.length === 1 && m[0] === "right");
  if (intent.camera === "in-out") cameraSatisfied = moves[0].includes("in") && moves.at(-1)!.includes("out");
  if (intent.camera === "push") cameraSatisfied = moves.some(m => m.includes("in"));
  const detailSatisfied = !intent.detail || plan.shots.some(s => s.focus === intent.detail);
  const orderSatisfied = intent.camera !== "in-out" || scale(plan.shots[0].camera + " " + plan.shots[0].composition) === "close"
    && scale(plan.shots.at(-1)!.composition) === "full";
  const executed = cameraSatisfied && detailSatisfied && orderSatisfied;
  // Public 10s and D1 5s multi keep the server-owned storyboard.
  const fixedStoryboard = !executed && intent.kind !== "empty" && plan.origin === "fallback"
    && (input.shotMode === "multi" && input.draft.durationSeconds === 10
      && videoStudioPresetIds.some(id => id === input.presetId) || usesD1FiveSecondMulti(input))
    && isDeepStrictEqual(plan.shots, fallbackDirectorPlan(input).shots);
  const explained = fixedStoryboard || plan.origin === "fallback" && /not been interpreted/i.test(plan.intent) && notices.length > 0;
  if (!executed && intent.kind !== "empty") {
    weaknesses.push(fixedStoryboard ? "fixed-storyboard-retained" : "intent-not-executed");
    if (!explained) failures.push("unjustified-intent-loss");
  }
  const detailShots = plan.shots.filter(s => scale(s.camera + " " + s.composition) === "close");
  const meaningfulDetail = detailShots.filter(s => product.featureTargets.includes(s.focus));
  const concrete = plan.shots.filter(s => product.featureTargets.includes(s.focus));
  const focusChanges = new Set(plan.shots.map(s => s.focus)).size > 1;
  const focusAligned = !detailShots.length || meaningfulDetail.length === detailShots.length;
  if (!focusAligned) weaknesses.push("close-frame-focuses-form-or-generic");
  if (!concrete.length) weaknesses.push("no-product-feature-selected");
  if (input.shotMode === "multi" && !focusChanges) weaknesses.push("same-focus-throughout");
  const allText = plan.shots.map(s => JSON.stringify(s));
  if (new Set(allText).size > 1) strengths.push("distinct-structured-directions");
  if (grounded) strengths.push("focus-grounded-to-fixture-or-generic");
  const visualCount = new Set(visualSignatures).size;
  const oneTrajectory = moves.every(m => m.length === 1);
  if (!oneTrajectory) weaknesses.push("ambiguous-or-multiple-camera-trajectories");
  const productScore = (grounded && evidence.length ? 7 : grounded ? 3 : 0)
    + (detailShots.length ? Math.round(8 * meaningfulDetail.length / detailShots.length) : concrete.length ? 4 : 0)
    + (focusAligned ? 4 : 0) + (focusChanges || input.shotMode === "single" && concrete.length ? 3 : 0) + (concrete.length ? 3 : 0);
  const cinemaScore = (oneTrajectory ? 4 : 0) + (!overload && plan.shots.reduce((n, s) => n + s.durationSeconds, 0) === input.draft.durationSeconds ? 4 : 0)
    + (focusAligned ? 4 : 0) + (input.shotMode === "single" ? 2 : visualCount >= 2 ? 4 : 0)
    + (unseen ? 0 : 2); // Two visual aesthetics points deliberately unawarded without images/video.
  const intentScore = intent.kind === "empty" ? 15 : (cameraSatisfied ? 8 : 0) + (detailSatisfied ? 4 : 0) + (orderSatisfied && (!intent.safeAdjustment || !unseen && notices.length > 0) ? 3 : 0);
  return { failures: [...new Set(failures)], weaknesses, strengths, executed, explained,
    parts: { product: productScore, cinema: cinemaScore, difference: 0, intent: intentScore, identity: grounded && !unseen ? 12 : 0, prompt: 0 } as Parts,
  };
}

export function auditBoundary(prompts: string[], preview: string[], signedPlanMatches: boolean, multi: boolean): Failure[] {
  const failures: Failure[] = [];
  if (prompts.some(s => !s.trim() || s.length > (multi ? 512 : 2500))) failures.push("payload-limit");
  if (!signedPlanMatches || JSON.stringify(prompts) !== JSON.stringify(preview)) failures.push("signed-preview-payload-mismatch");
  return failures;
}
