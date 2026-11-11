import type { VideoDirectorInput, VideoDirectorPlan, VideoDirectorShot } from "./core";
import { directorProductContext } from "./product-context";
import type { ReferenceReview } from "../video-generation/product-references";

/** Current D1 only; the new scene limit does not change other 5s or any 10s mode. */
export function usesD1FiveSecondMulti(input: { presetId?: string; shotMode: string; draft: { durationSeconds: number } }) {
  return input.shotMode === "multi" && input.draft.durationSeconds === 5
    && (input.presetId === "minimal-studio" || input.presetId === "metallic-light-sweep");
}

export function isD1FiveSecondPlan(plan: VideoDirectorPlan | undefined) {
  return Boolean(plan && usesD1FiveSecondMulti({ ...plan, draft: { durationSeconds: 5 } })
    && [3, 4, 5].includes(plan.shots.length) && plan.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0) === 5);
}

export function isCurrentD1FiveSecondPlan(plan: VideoDirectorPlan | undefined) {
  return isD1FiveSecondPlan(plan) && plan?.shots.length === 3;
}

export const d1AlternateShotIndex = (plan: VideoDirectorPlan) => plan.shots.length === 3 ? 1 : 2;

/** Identity/completeness is necessary, but cannot itself authorize a creative side shot. */
export function isCreativeSafeD1Side(review: ReferenceReview, purpose: string) {
  return review.status === "matched" && review.view === "side" && review.creativeSafeSide === true
    && (purpose === "side-profile" && review.wholeSideVisible === true
      || purpose === "other-product-view" && review.wholeViewVisible === true)
    && !/\b(?:back|rear|rolled|inverted|ambiguous|clasp)\b/i.test([purpose, review.reason, ...review.details].join(" "));
}

const assetIdentity = (source: NonNullable<VideoDirectorInput["draft"]["source"]>) =>
  source.kind === "uploaded-image" ? "uploaded-image:" + source.sourceAssetId : "generated-image:" + source.generationId;

function alternateView(input: VideoDirectorInput, reviews: ReferenceReview[]) {
  const refs = input.draft.productReferences ?? [];
  const primary = input.draft.source && assetIdentity(input.draft.source);
  const primaryHashes = new Set(refs.filter(ref => assetIdentity(ref.source) === primary).map(ref => ref.sha256));
  const rank = (review: ReferenceReview) => refs[review.index].purpose === "side-profile" ? 0 : 1;
  return reviews.filter(review => {
    const ref = refs[review.index];
    return ref && assetIdentity(ref.source) !== primary && !primaryHashes.has(ref.sha256)
      && isCreativeSafeD1Side(review, ref.purpose);
  }).sort((a, b) => rank(a) - rank(b) || refs[a.index].sha256.localeCompare(refs[b.index].sha256)
    || assetIdentity(refs[a.index].source).localeCompare(assetIdentity(refs[b.index].source)))[0];
}

export function d1FiveSecondShots(input: VideoDirectorInput, reviews: ReferenceReview[]): VideoDirectorShot[] {
  const signature = input.presetId === "minimal-studio";
  const alternate = alternateView(input, reviews);
  const detail = directorProductContext(input.profile).evidence.find(item => item.detail.length <= 80
    && item.detail !== input.profile?.productShape && !input.profile?.materials.includes(item.detail)
    && !input.profile?.dominantColors.includes(item.detail)
    && !/\b(?:logos?|labels?|text|letters?|lettering|embroider\w*|symbols?|brands?|monograms?)\b/i.test(item.detail)
    && /dial|marker|indices|case|bezel|contour|edge|strap|bracelet|button|zip|clasp|closure|cap|collar|lapel|seam|stitch|setting|stone|handle|hinge|rim|sole|texture|weave|grain|surface|finish/i.test(item.detail));
  const shot = (purpose: VideoDirectorShot["purpose"], durationSeconds: number, camera: string, composition: string,
    lighting: string, pace: string): VideoDirectorShot => ({
    purpose, durationSeconds, camera, composition, lighting, pace,
    motion: "Product fixed in the primary orientation", focus: "Source-visible product form", evidenceRefs: [],
  });
  const opening = shot("hero-reveal", signature ? 2 : 1,
    signature ? "Very slight axial push-in within the primary view" : "Locked full product framing",
    signature ? "Complete primary product; asymmetric negative space" : "Complete primary product; readable margins",
    signature ? "Clean directional studio key" : "Restrained readable soft key",
    signature ? "Gentle approach; readable establish" : "Brief readable establish");
  const inspection = shot(signature ? "material-study" : "lighting-reveal", 2,
    alternate ? "Tiny lateral reframe within the pictured side view"
      : signature ? "Tiny lateral reframe within the primary view" : "Very slight axial push-in within the primary view",
    alternate ? "Complete verified side; exact pictured orientation" : detail
      ? "One evidenced primary region; offset inspection" : "Primary contour in recognizable offset context",
    signature ? "Steady directional contour key" : "One controlled left-to-right highlight pass",
    signature ? "One measured editorial inspection" : "One readable highlight event");
  if (alternate) {
    inspection.referenceIndex = alternate.index;
    inspection.motion = "Product fixed in the pictured side orientation";
  } else if (detail) {
    inspection.focus = detail.detail;
    inspection.evidenceRefs = [detail.id];
  }
  const hero = shot("final-hero", signature ? 1 : 2,
    signature ? "Locked balanced full product hero" : "Very slight axial pull-back to primary hero",
    "Complete primary product; balanced commercial margins",
    signature ? "Steady resolved studio key and fill" : "Steady clean hero fill",
    signature ? "Stable full-product hold for all 1s" : "Tiny widen first 1s; stable final 1s");
  if (signature) hero.motion = "Product and camera completely still; primary orientation";
  return [opening, inspection, hero];
}

/** Compact the authored move, never replace a moving scene with a locked still. */
export function compileD1FiveSecondShot(shot: VideoDirectorShot, prefix: string, watch: boolean, text: string, compactText: string, limit: number) {
  const dial = "Exact dial layout each frame: numerals, indices, logo, hands, date window, print and visible complications keep shape/position. No redraw, replacement, morphing or invented text.";
  const compactDial = "Exact dial layout each frame: numerals/indices/logo/hands/date window/print/visible complications fixed shape/position. No redraw, replacement, morphing or invented text.";
  const cameras: Record<string, string> = {
    "Very slight axial push-in within the primary view": "Tiny primary-view push-in",
    "Locked full product framing": "Locked full product",
    "Tiny lateral reframe within the pictured side view": "Tiny pictured-side lateral reframe",
    "Tiny lateral reframe within the primary view": "Tiny primary-view lateral reframe",
    "Locked balanced full product hero": "Locked full primary hero",
    "Very slight axial pull-back to primary hero": "Tiny primary-view pull-back",
  };
  const frames: Record<string, string> = {
    "Complete primary product; asymmetric negative space": "Full primary; asymmetric space",
    "Complete primary product; readable margins": "Full primary; readable margins",
    "Complete verified side; exact pictured orientation": "Full verified side; pictured pose",
    "One evidenced primary region; offset inspection": "Offset primary detail",
    "Primary contour in recognizable offset context": "Primary contour; offset context",
    "Complete primary product; balanced commercial margins": "Full primary hero; balanced margins",
  };
  for (const compact of [false, true]) {
    const prompt = prefix + [compact ? cameras[shot.camera] ?? shot.camera : shot.camera,
      compact ? frames[shot.composition] ?? shot.composition : shot.composition,
      compact && shot.lighting === "One controlled left-to-right highlight pass" ? "One left-to-right highlight pass" : shot.lighting,
      "Product pose fixed", shot.purpose === "final-hero"
        ? compact && shot.durationSeconds === 1 ? "Hold full hero all 1s" : shot.pace : "",
      compact ? "Cuts; known view; no rotation/interpolation" : "Direct cuts between views; no rotation/interpolation; known surfaces",
      compact ? "Exact form/colors/material/marks/parts/pattern/text/logos/layout; keep support/contact/shadows"
        : "Exact source form/colors/material/marks/parts; pattern/text/logos/layout exact; keep support/contact/shadows",
      ...(shot.evidenceRefs.length ? [shot.focus] : []), watch ? compact ? compactDial : dial : "",
      compact ? compactText : text].filter(Boolean).join(". ");
    if (prompt.length <= limit) return prompt;
  }
  throw new Error("kling_scene_prompt_too_long");
}
