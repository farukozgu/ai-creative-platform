import type { VideoDirectorInput, VideoDirectorShot } from "./core";
import { directorProductContext } from "./product-context";
import type { ReferenceReview } from "../video-generation/product-references";

/** Frozen first D1 revision: receipt replay only, never selected for new planning. */
const assetIdentity = (source: NonNullable<VideoDirectorInput["draft"]["source"]>) =>
  source.kind === "uploaded-image" ? "uploaded-image:" + source.sourceAssetId : "generated-image:" + source.generationId;

/** Only a complete reviewed view can own the inspection shot. Slot names are not authority. */
function alternateView(input: VideoDirectorInput, reviews: ReferenceReview[]) {
  const refs = input.draft.productReferences ?? [];
  const primary = input.draft.source && assetIdentity(input.draft.source);
  // Runtime also removes whole-view authority for canonical content-hash duplicates.
  const primaryHashes = new Set(refs.filter(ref => assetIdentity(ref.source) === primary).map(ref => ref.sha256));
  const rank = (review: ReferenceReview) => refs[review.index].purpose === "side-profile" ? 0 : 1;
  return reviews.filter(review => {
    const ref = refs[review.index];
    return review.status === "matched" && ref && assetIdentity(ref.source) !== primary && !primaryHashes.has(ref.sha256)
      && (ref.purpose === "side-profile" && review.view === "side" && review.wholeSideVisible === true
        || ref.purpose === "other-product-view" && ["front", "back", "side"].includes(review.view ?? "") && review.wholeViewVisible === true);
  }).sort((a, b) => rank(a) - rank(b) || refs[a.index].sha256.localeCompare(refs[b.index].sha256)
    || assetIdentity(refs[a.index].source).localeCompare(assetIdentity(refs[b.index].source)))[0];
}

export function legacyD1FiveSecondShots(input: VideoDirectorInput, reviews: ReferenceReview[]): VideoDirectorShot[] {
  const signature = input.presetId === "minimal-studio";
  const alternate = alternateView(input, reviews);
  const evidence = directorProductContext(input.profile).evidence;
  const families = [/dial|marker|indices/i, /case|bezel|contour|edge/i, /strap|bracelet/i, /button|zip|clasp|closure|cap/i,
    /collar|lapel/i, /seam|stitch/i, /setting|stone/i, /label|logo|letter|text/i, /handle|hinge|rim|sole/i, /texture|weave|grain|surface|finish/i];
  const used = new Set<number>();
  const details = evidence.filter(item => {
    if (item.detail.length > 80 || item.detail === input.profile?.productShape
      || input.profile?.materials.includes(item.detail) || input.profile?.dominantColors.includes(item.detail)
      || /\b(?:logos?|labels?|text|letters?|lettering|embroider\w*|symbols?|brands?|monograms?)\b/i.test(item.detail)) return false;
    const family = families.findIndex(pattern => pattern.test(item.detail));
    if (family < 0 || used.has(family)) return false;
    used.add(family); return true;
  });
  const rich = Boolean(alternate || (signature ? details.length : details.length >= 2));
  const shot = (purpose: VideoDirectorShot["purpose"], durationSeconds: number, camera: string, composition: string,
    lighting: string, pace: string, detail?: typeof evidence[number]): VideoDirectorShot => ({
    purpose, durationSeconds, camera, composition, lighting, pace, motion: "Product fixed in the primary orientation",
    focus: detail?.detail ?? "Source-visible product form", evidenceRefs: detail ? [detail.id] : [],
  });
  const opening = shot("hero-reveal", 1, "Locked full product framing", signature
    ? "Complete product; asymmetric campaign negative space" : "Complete product; generous readable margins",
  signature ? "Clean directional studio key" : "Restrained readable soft key", "Immediate graphic recognition");
  const setup = shot(signature ? "controlled-motion" : "macro-detail", 1,
    signature ? "Locked offset medium framing" : details[0] ? "Locked close contour framing" : "Locked contour framing",
    signature ? "Offset medium crop; generous space on the opposite side" : details[0]
      ? "Tight evidenced primary region; clear contour margins" : "Source-visible contour in a bounded primary crop",
    signature ? "Steady directional studio key" : "Restrained edge accent; steady fill",
    signature ? "Crisp editorial reframe" : "Brief contour setup", signature ? undefined : details[0]);
  const inspection = shot(signature ? "material-study" : "lighting-reveal", rich ? 1 : 2,
    alternate ? "Locked complete reference view" : signature && rich ? "Locked detail framing" : "Locked offset medium framing",
    alternate ? "Complete verified view; exact pictured orientation" : signature
      ? rich ? "One evidenced primary region; clear offset margins" : "Source-visible contour; developed graphic negative space"
      : rich ? "Distinct evidenced primary contour crop" : "Primary contour in recognizable offset product context",
    signature ? "Steady directional key defines the visible contour" : "One controlled left-to-right highlight pass",
    signature ? "Precise source-bound inspection" : "One defining highlight event",
    alternate ? undefined : signature ? details[0] : rich ? details[1] : undefined);
  if (alternate) {
    inspection.referenceIndex = alternate.index;
    inspection.motion = "Product fixed in the verified pictured orientation";
  }
  const reset = shot(signature ? "lighting-reveal" : "controlled-motion", 1, "Locked recognition framing", signature
    ? "Larger primary product; narrow top and open lower margins" : "Medium primary product; distinct contour context",
  signature ? "Balanced readable studio fill" : "Small steady secondary edge accent", "Immediate recognition reset");
  const hero = shot("final-hero", 1, "Locked balanced full product hero", "Complete primary product; balanced commercial margins",
    signature ? "Steady resolved studio key and fill" : "Steady clean hero fill", "Stable full-product hold for all 1s");
  hero.motion = "Product and camera completely still; primary orientation";
  return [opening, setup, inspection, ...(rich ? [reset] : []), hero];
}

/** Meaning-preserving compact D1 wording reserves identity and literal text first. */
export function compileLegacyD1FiveSecondShot(shot: VideoDirectorShot, prefix: string, watch: boolean, text: string, compactText: string, limit: number) {
  const dial = "Exact dial layout each frame: numerals, indices, logo, hands, date window, print and visible complications keep shape/position. No redraw, replacement, morphing or invented text.";
  const compactDial = "Exact dial layout each frame: numerals/indices/logo/hands/date window/print/visible complications fixed shape/position. No redraw, replacement, morphing or invented text.";
  const shortFrames: Record<string, string> = {
    "Complete product; asymmetric campaign negative space": "Full primary; asymmetric negative space",
    "Complete product; generous readable margins": "Full primary; readable margins",
    "Offset medium crop; generous space on the opposite side": "Offset primary medium; opposite negative space",
    "Source-visible contour in a bounded primary crop": "Bounded primary contour crop",
    "Tight evidenced primary region; clear contour margins": "Tight primary evidence; clear margins",
    "Complete verified view; exact pictured orientation": "Full verified view; pictured orientation",
    "One evidenced primary region; clear offset margins": "Primary detail; clear offset margins",
    "Source-visible contour; developed graphic negative space": "Primary contour; graphic negative space",
    "Distinct evidenced primary contour crop": "Distinct primary contour evidence",
    "Primary contour in recognizable offset product context": "Primary contour; offset recognizable context",
    "Larger primary product; narrow top and open lower margins": "Large primary; narrow top/open lower margins",
    "Medium primary product; distinct contour context": "Primary medium; distinct contour context",
    "Complete primary product; balanced commercial margins": "Full primary hero; balanced margins",
  };
  const shortLights: Record<string, string> = {
    "Steady directional key defines the visible contour": "Steady directional contour key",
    "Restrained edge accent; steady fill": "Restrained edge; steady fill",
  };
  for (const compact of [false, true]) {
    const prompt = prefix + [compact ? "Locked" : shot.camera,
      compact ? shortFrames[shot.composition] ?? shot.composition : shot.composition,
      compact ? shortLights[shot.lighting] ?? shot.lighting : shot.lighting,
      shot.purpose === "final-hero" ? "Product/camera still all 1s" : "Product/camera fixed",
      "Direct cuts; no rotation/interpolation; known surfaces",
      compact ? "Exact form/colors/material/marks/parts; pattern/text/logos/layout exact; keep support/contact/shadows"
        : "Exact source form/colors/material/marks/parts; pattern/text/logos/layout exact; keep support/contact/shadows",
      ...(shot.evidenceRefs.length ? [shot.focus] : []), watch ? compact ? compactDial : dial : "", compact ? compactText : text].filter(Boolean).join(". ");
    if (prompt.length <= limit) return prompt;
  }
  throw new Error("kling_scene_prompt_too_long");
}
