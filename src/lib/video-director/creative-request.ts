import type { ProductProfile } from "@/lib/product-understanding/product-profile";
import { directorIdentityEvidence } from "./identity-evidence";
import { videoDirectorPresets } from "./presets";

const words = (value: string) => value.toLowerCase().match(/[a-z]+|\d+/g) ?? [];
// An unfamiliar product noun cannot be made safe by a model's confidence. A
// bounded creative vocabulary plus profile evidence makes unknown claims fail closed.
const creativeWords = new Set(words(JSON.stringify(videoDirectorPresets) + ` a an the and or of on in at to from with for without is are as if while
  camera frame shot view angle viewpoint lens composition framing lighting motion movement pace focus product source visible existing detail
  slow slowly subtle gently gentle static still locked fixed stable stationary hold maintain retain preserve close macro full wide medium
  push pull dolly pan left right zoom track advance approach settle return reveal opening closing introduction finish sequence
  minimal elegant refined cinematic premium luxury editorial commercial fashion film studio campaign aesthetic natural realistic photorealistic
  balanced clean clear calm controlled deliberate measured quiet smooth gradual softly soft directional highlights shadows exposure contrast
  shallow depth field sharp crisp crispness bokeh transition cuts restrained optical long perspective no new stays remains only its
  selected direction according compatible when can be keep follow light lights pushes zooms at least throughout same source details appearance identity overall`));

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

/** Reject concrete model claims unless the existing profile contains the same evidence. */
export function hasUnsupportedProductClaims(text: string, profile: ProductProfile | null): boolean {
  const evidenceItems = directorIdentityEvidence(profile).map(item => item.toLowerCase());
  const evidence = evidenceItems.join(" ");
  const evidencedWords = new Set(words(evidence));
  if (words(text).some(word => !creativeWords.has(word) && !evidencedWords.has(word))) return true;
  const claims = text.toLowerCase().replace(/\bwhite balance\b/g, "exposure").match(/\b(?:leather|suede|denim|cotton|wool|silk|velvet|linen|polyester|zipper|zippers|zip|buttons?|buckles?|clasps?|pearls?|diamonds?|gold|silver|black|white|red|blue|green|brown|beige|double.breasted|striped|floral|plaid)\b/g) ?? [];
  if (claims.some(claim => !evidence.includes(claim))) return true;
  const pairs = [...text.toLowerCase().matchAll(/\b(gold|silver|black|white|red|blue|green|brown|beige)\s+(?:\w+\s+){0,2}?(zipper|zip|buttons?|buckle|clasp|leather|suede|denim|cotton|wool|silk|fabric)\b/g)];
  return pairs.some(([, color, item]) => !evidenceItems.some(value => value.includes(color) && value.includes(item)));
}
