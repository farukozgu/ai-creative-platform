import type { VideoDirectorInput, VideoDirectorPlan, VideoDirectorShot } from "../../src/lib/video-director/core";
import { directorProductContext } from "../../src/lib/video-director/product-context";
import { hasUnsupportedProductClaims } from "../../src/lib/video-director/creative-request";
import { directorShotContract } from "../../src/lib/video-director/plan-contract";
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
function layout(s: string) {
  return /asymmetr|off.center|diagonal/i.test(s) ? "asymmetric" : /negative space|margins|breathing|space above/i.test(s) ? "space" : /symmetr|center|balanced/i.test(s) ? "centered" : "neutral";
}
function light(s: string) {
  if (/travels|crosses|sweep|moving|light pass/i.test(s)) return "traveling";
  if (/rim|backlight/i.test(s)) return "rim";
  if (/graz|raking/i.test(s)) return "grazing";
  if (/narrow|focused|spot/i.test(s)) return "focused";
  if (/side|directional|edge|contour/i.test(s)) return "directional";
  return "diffuse";
}
export function shotDecisions(shot: VideoDirectorShot, product: BenchmarkProduct) {
  return { camera: cameraMoves(shot.camera), lens: /long.lens/i.test(shot.camera) ? "long-lens" : /macro/i.test(shot.camera) ? "macro" : "unspecified",
    scale: scale(shot.camera + " " + shot.composition), layout: layout(shot.composition),
    lighting: light(shot.lighting), focus: product.featureTargets.includes(shot.focus) ? "feature" : shot.evidenceRefs.length ? "evidenced-form" : "generic",
    purpose: shot.purpose };
}
export function visualSignature(shot: VideoDirectorShot, product: BenchmarkProduct) {
  const { camera, lens, scale, layout, lighting } = shotDecisions(shot, product);
  return JSON.stringify({ camera, lens, scale, layout, lighting, focus: normalized(shot.focus) });
}
export function planDistance(a: VideoDirectorPlan, b: VideoDirectorPlan, product: BenchmarkProduct) {
  const axes = ["camera", "lens", "lighting", "layout", "scale", "focus"] as const;
  const costs = [0.2, 0.1, 0.25, 0.15, 0.2, 0.1];
  const distance = axes.reduce((sum, axis, i) => {
    const av = a.shots.map(s => shotDecisions(s, product)[axis]), bv = b.shots.map(s => shotDecisions(s, product)[axis]);
    return sum + (JSON.stringify(av) === JSON.stringify(bv) ? 0 : costs[i]);
  }, 0);
  return Math.round(distance * 1000) / 1000;
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
  if (input.shotMode === "multi" && plan.shots.some((s, i) => i > 0 && visualSignature(s, product) === visualSignature(plan.shots[i - 1], product))) failures.push("repeated-scene");
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
  const explained = plan.origin === "fallback" && /not been interpreted/i.test(plan.intent) && notices.length > 0;
  const executed = cameraSatisfied && detailSatisfied && orderSatisfied;
  if (!executed && intent.kind !== "empty") {
    weaknesses.push("intent-not-executed");
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
  const visualCount = new Set(plan.shots.map(s => visualSignature(s, product))).size;
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
    decisions: plan.shots.map(s => shotDecisions(s, product)),
  };
}

export function auditBoundary(prompts: string[], preview: string[], signedPlanMatches: boolean, multi: boolean): Failure[] {
  const failures: Failure[] = [];
  if (prompts.some(s => !s.trim() || s.length > (multi ? 512 : 2500))) failures.push("payload-limit");
  if (!signedPlanMatches || JSON.stringify(prompts) !== JSON.stringify(preview)) failures.push("signed-preview-payload-mismatch");
  return failures;
}
