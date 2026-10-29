import type { ProductProfile } from "@/lib/product-understanding/product-profile";
import type { VideoGenerationDraft } from "../video-generation/types";
import { directorIdentityEvidence } from "./identity-evidence";
type ProductEvidence = { id: number; detail: string };

export type CreativeIntentContract = {
  camera: "auto" | "static" | "dolly-in" | "dolly-out" | "pan-left" | "pan-right" | "lateral" | "in-out";
  focusRequested: boolean;
  focusEvidenceId: number | null;
  focusPosition: "any" | "first" | "last";
  sequence: "preset" | "detail-to-hero";
  safeAdjustment: "none" | "unseen-side-to-source-facing-camera";
};

const detailTerms: [RegExp, RegExp][] = [
  [/button|düğme/i, /button|düğme/i], [/collar|lapel|yaka/i, /collar|lapel|yaka/i],
  [/belt|kemer/i, /belt|kemer/i], [/label|etiket|logo|mark/i, /label|etiket|logo|mark/i],
  [/cap|lid|cover|kapak/i, /cap|lid|cover|kapak/i], [/dial|kadran/i, /dial|kadran/i],
  [/buckle|clasp|toka|kilit/i, /buckle|clasp|toka|kilit/i], [/stitch|seam|dikiş/i, /stitch|seam|dikiş/i],
  [/lace|bağcık/i, /lace|bağcık/i], [/handle|kulp/i, /handle|kulp/i], [/stone|setting|taş/i, /stone|setting|taş/i],
  [/screen|ekran/i, /screen|ekran/i], [/texture|grain|doku/i, /texture|grain|doku/i],
  [/sole|taban/i, /sole|taban/i], [/strap|bracelet|kordon/i, /strap|bracelet|kordon/i],
  [/marker|indices|işaret/i, /marker|indices|işaret/i], [/edge|kenar/i, /edge|kenar/i],
  [/hinge|menteşe/i, /hinge|menteşe/i], [/frame|çerçeve/i, /frame|çerçeve/i],
];

function normalized(value: string) {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Deterministic, evidence-bound interpretation for explicit requests; vague text stays preset-led. */
export function interpretCreativeIntent(text: string, evidence: ProductEvidence[], shotMode: "single" | "multi" = "multi",
  selectedCamera: VideoGenerationDraft["cameraMovement"] = "auto"): CreativeIntentContract {
  const request = normalized(text);
  let camera: CreativeIntentContract["camera"] = "auto";
  if (/\b(?:static|locked|fixed camera|no camera movement)\b|kamerayi? sabit|hareket etme|sabit tut/i.test(request)) camera = "static";
  else if (/\b(?:pan|slide|glide|truck)\s*(?:to\s*)?right\b|saga (?:pan|kay|kaydir)|yanal kay(?:dir)? saga/i.test(request)) camera = "pan-right";
  else if (/\b(?:pan|slide|glide|truck)\s*(?:to\s*)?left\b|sola (?:pan|kay|kaydir)|yanal kay(?:dir)? sola/i.test(request)) camera = "pan-left";
  else if (/\b(?:lateral|sideways|slide|glide|truck)\b|yanal kay(?:dir)?/i.test(request)) camera = "lateral";
  else if (/\b(?:pull back|dolly out|zoom out|move away|retreat)\b|uzaklas|geri cek/i.test(request)) camera = "dolly-out";
  else if (/\b(?:push in|dolly in|zoom in|move closer|approach)\b|yaklas|yakina gel/i.test(request)) camera = "dolly-in";

  let focusEvidenceId: number | null = null;
  const exactEvidence = evidence.find(item => normalized(item.detail).length >= 8 && request.includes(normalized(item.detail)));
  if (exactEvidence) focusEvidenceId = exactEvidence.id;
  for (const [requestTerm, evidenceTerm] of detailTerms) {
    if (focusEvidenceId !== null) break;
    if (requestTerm.test(request)) {
      const match = evidence.find(item => evidenceTerm.test(normalized(item.detail)));
      if (match) { focusEvidenceId = match.id; break; }
    }
  }
  if (focusEvidenceId === null && /\b(?:detail|macro|close.up|feature)\b|detay|makro|yakindan/i.test(request)) {
    focusEvidenceId = evidence.find(item => detailTerms.some(([, term]) => term.test(normalized(item.detail))))?.id ?? null;
  }
  const detailToHero = /\b(?:start|begin|first)\b.{0,70}\b(?:close|detail|macro)\b.{0,100}\b(?:then|finish|end|finally)\b.{0,50}\b(?:wide|full|hero|pull back)\b|once detay.{0,70}(?:sonra|ardindan).{0,60}(?:tam urun|genel plan|hero)/i.test(request);
  if (detailToHero && /\b(?:push in|dolly in|zoom in|approach)\b.{0,100}\b(?:pull back|dolly out|zoom out)\b/i.test(request))
    camera = shotMode === "single" ? "dolly-out" : "in-out";
  const unseenSide = /\b(?:360|orbit around|show the back|rear view|backside|underside)\b|360.{0,20}(?:don|cevir)|arkasini goster/i.test(request);
  if (unseenSide && camera === "auto") camera = "pan-right";
  const focusRequested = Boolean(exactEvidence) || /\b(?:detail|macro|close.up|feature|button|collar|belt|label|logo\w*|cap|dial|buckle|clasp|stitch|lace|handle|stone|screen|texture|sole|strap|marker|edge|hinge|frame)\b|detay|makro|yakindan|dugme|yaka|kemer|etiket|kapak|kadran|toka|dikis|bagcik|kulp|tas|ekran|doku|taban|kenar/i.test(request);
  if (selectedCamera !== "auto" && selectedCamera !== "orbit") camera = selectedCamera;
  // A fixed single take cannot also execute a pull-back. Explicit UI choices win;
  // requested evidence still survives through the independent focus contract.
  const executableSequence = detailToHero && !(shotMode === "single" && selectedCamera !== "auto" && selectedCamera !== "dolly-out");
  return { camera, focusRequested, focusEvidenceId, focusPosition: /\b(?:finish|end)\b.{0,60}\b(?:label|logo|mark)\b|etikette bitir|etiketle bitir/i.test(request) ? "last" : "any",
    sequence: executableSequence ? "detail-to-hero" : "preset", safeAdjustment: unseenSide ? "unseen-side-to-source-facing-camera" : "none" };
}

// Only known creative directions cross the untrusted user-text boundary. Product facts
// are supplied separately by the source and validated profile evidence.
export function creativeRequest(text: string): string {
  const directions: [RegExp, string][] = [
    [/\b(luxury|premium|high.end|fashion|editorial|campaign)\b|lüks|moda|kampanya/i, "Premium editorial campaign aesthetic."],
    [/\b(cinematic|dramatic|film)\b|sinematik|dramatik/i, "Cinematic presentation."],
    [/\b(studio|soft light|soft lighting|reflection)\b|stüdyo|yumuşak ışık|yansıma/i, "Soft studio lighting consistent with the source."],
    [/\b(macro|close.up|detail)\b|makro|yakın çekim|detay/i, "Feature a source-visible detail in close framing."],
    [/\b(hero|full.product|wide|general)\b|genel plan|ürünün tamamı/i, "Use recognizable product hero framing."],
    [/\b(slow|smooth|gentle|restrained)\b|yavaş|akıcı|yumuşak hareket/i, "Use smooth, restrained pacing."],
    [/\b(moody|noir|atmospheric)\b|atmosferik|karanlık atmosfer/i, "Use a moody editorial atmosphere consistent with the source."],
    [/\b(minimal|minimalist|clean)\b|minimal|sade/i, "Use a clean minimal presentation."],
    [/\b(push.in|dolly.in|zoom.in)\b|yakınlaş/i, "Use a gentle camera push-in when compatible with the selected camera."],
    [/\b(pull.back|dolly.out|zoom.out)\b|uzaklaş/i, "Use a gentle camera pull-back when compatible with the selected camera."],
    [/\bpan.left\b|sola (?:pan|kaydır)/i, "Use a subtle camera pan left when compatible with the selected camera."],
    [/\bpan.right\b|sağa (?:pan|kaydır)/i, "Use a subtle camera pan right when compatible with the selected camera."],
  ];
  return directions.filter(([pattern]) => pattern.test(text)).map(([, direction]) => direction).join(" ") || "A restrained product presentation.";
}

// Normalize morphology and true synonyms, never infer a material from its color
// (silver-colored is not silver, and steel is not necessarily stainless steel).
function claimWording(value: string, watch: boolean) {
  let result = value.toLowerCase().replace(/[–—-]/g, " ")
    .replace(/\bgrey\b/g, "gray").replace(/\baluminium\b/g, "aluminum")
    .replace(/\b(?:wristwatches|wristwatch|watches|timepieces?|time pieces?)\b/g, "watch")
    .replace(/\b(?:sneakers?|trainers?|shoes?)\b/g, "shoe")
    .replace(/\bhandbags?\b/g, "bag").replace(/\b(?:spectacles|sunglasses|eyeglasses)\b/g, "eyewear")
    .replace(/\bzips?\b/g, "zipper").replace(/\bstitches|stitched\b/g, "stitching")
    .replace(/\b(button|buckle|clasp|pearl|diamond|gem|gemstone|stone|seam|lapel|pocket|handle|lace|port|connector|hinge|hand|ring|bottle|jacket|coat|strap|bracelet|chain)s\b/g, "$1")
    .replace(/\bgem\b/g, "gemstone");
  if (watch) result = result.replace(/\b(?:watch face|face)\b/g, "dial")
    .replace(/\b(?:wristband|watchband|watch band|bracelet|band)\b/g, "strap")
    .replace(/\b(?:indices|indexes|markers|hour markers|hour marker)\b/g, "marker");
  return result;
}

/** Only these explicitly cinematic uses bypass product-fact matching. */
function productClaimText(value: string) {
  return value.replace(/\bwhite balance\b/gi, "exposure")
    .replace(/\bautomatic (?:focus|exposure)\b/gi, "focus control")
    .replace(/\bhand[ -]held camera\b/gi, "camera")
    .replace(/\bpolished (?:presentation|campaign|film|direction)\b/gi, "refined presentation")
    .replace(/\b(?:polished|brushed|matte|glossy)\s+(?:background|backdrop|lighting|light|highlights?|atmosphere)\b/gi, "studio atmosphere")
    .replace(/\bring light(?:ing)?\b/gi, "illumination")
    .replace(/\b(?:silk|velvet)[ -]smooth\b/gi, "smooth")
    .replace(/\b(?:black|white|red|blue|green|brown|beige|gray|grey|gold|silver)(?:[ -]toned?)?\s+(?:(?:studio|negative|fill|key|rim|edge|soft|diffuse)\s+){0,2}(?:background|backdrop|lighting|light|illumination|space)\b/gi, "studio atmosphere");
}

/** Reject concrete claims against complete, confidence-filtered evidence atoms.
 * Creative language stays open; evidence matching uses word boundaries, aliases
 * and attribute/part binding rather than substring matches across unrelated atoms.
 */
export function unsupportedProductClaim(text: string, profile: ProductProfile | null): string | null {
  const confidence = profile?.confidence?.overall ?? 0;
  const classification = confidence >= 0.6 && (profile?.confidence.fields?.subcategory ?? confidence) >= 0.6
    ? profile?.subcategory ?? "" : "";
  const watch = confidence >= 0.6 && profile?.vertical === "watches";
  const evidenceItems = directorIdentityEvidence(profile).map(item => claimWording(item, watch)
    .replace(/\b(?:diamond|gemstone)\b/g, "$& stone")
    .replace(/\bdiamond\b/g, "diamond gemstone"));
  const classified = claimWording(classification, watch);
  const claimsText = claimWording(productClaimText(text), watch);
  const contains = (value: string, claim: string) => new RegExp(`\\b${claim.replace(/ /g, "\\s+")}\\b`).test(value);
  const productTypes = ["bottle", "jacket", "coat", "shoe", "watch", "ring", "bag", "perfume", "lipstick", "eyewear"];
  const claims = claimsText.match(/\b(?:stainless\s+steel|leather|suede|denim|cotton|wool|silk|velvet|linen|polyester|glass|plastic|steel|aluminum|titanium|ceramic|rubber|satin|crystal|zipper|button|buckle|clasp|pearl|diamond|gemstone|stone|gold|silver|black|white|red|blue|green|brown|beige|gray|double\s+breasted|striped|floral|plaid|seam|stitching|collar|lapel|belt|pocket|hood|cap|pump|dropper|spray|dial|hand|bezel|crown|strap|bracelet|marker|chain|handle|lace|outsole|sole|screen|port|connector|hinge|bottle|jacket|coat|shoe|watch|ring|bag|perfume|lipstick|eyewear|waterproof|water\s+resistant|scratchproof|scratch\s+resistant|automatic|mechanical|quartz|chronograph|sapphire|polished|brushed|matte|glossy)\b/g) ?? [];
  const unsupported = claims.find(claim => !evidenceItems.some(item => contains(item, claim))
    // Classification proves type, never composition or a hidden mechanism.
    && !((productTypes.includes(claim) || watch && ["automatic", "mechanical", "quartz", "chronograph"].includes(claim)) && contains(classified, claim)));
  if (unsupported) return unsupported.slice(0, 60);
  const pairs = [...claimsText.matchAll(/\b(gold|silver|black|white|red|blue|green|brown|beige|gray|leather|suede|steel|titanium|plastic)\s+(?:(?:visible|front|rear|brushed|polished|metal|woven|pebbled|asymmetric|round|oval|toned?|colored?)\s+){0,3}(zipper|button|buckle|clasp|dial|strap|bracelet|bezel|crown|hand|cap|handle|hinge|leather|suede|denim|cotton|wool|silk|fabric)\b/g)];
  return pairs.find(([, attribute, part]) => !evidenceItems.some(item => contains(item, attribute) && contains(item, part)))?.[0].slice(0, 60) ?? null;
}

export function hasUnsupportedProductClaims(text: string, profile: ProductProfile | null): boolean {
  return unsupportedProductClaim(text, profile) !== null;
}
