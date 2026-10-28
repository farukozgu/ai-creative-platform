import type { ProductProfile } from "@/lib/product-understanding/product-profile";

type Evidence = { priority: number; text: string };

/** Existing profile evidence is a hint; the actual source image remains authoritative. */
export function directorIdentityEvidence(profile: ProductProfile | null): string[] {
  if (!profile) return [];
  const candidates: Evidence[] = [];
  const add = (priority: number, value: string | null | undefined) => {
    if (typeof value !== "string") return;
    const text = value.trim().replace(/\s+/g, " ");
    // Keep complete evidence atoms only; exclude hidden/uncertain claims and instruction-like content.
    if (!text || text.length > 120 || /[\r\n<>`{}.;:!?]/.test(value)
      || /\b(?:hidden|unseen|not visible|unknown|imagined|assumed|underside|interior|backside|ignore|instructions?|system|prompt|override|disregard|follow|reveal|add|remove|change|replace|redesign|invent|rotate|transform|never|must|should)\b|\bdo not\b/i.test(text)) return;
    candidates.push({ priority, text });
  };
  for (const item of profile.identityCriticalAttributes) {
    const value = item?.attribute;
    if (typeof value !== "string") continue;
    if (/logo|brand|monogram|emblem/i.test(value) && profile.visibleBranding.hasLogo === false
      || /letter|text|label|inscription/i.test(value) && profile.visibleBranding.hasReadableText === false
      || /artwork|print/i.test(value) && profile.visibleBranding.hasArtwork === false) continue;
    const priority = /logo|brand|letter|text|label|monogram|print|artwork|mark|emblem|inscription/i.test(value) ? 0
      : /zip|buckle|button|clasp|hardware|closure|stone|setting/i.test(value) ? 1
        : /colo[u]?r|hue/i.test(value) ? 2 : /texture|grain|material|fabric|stitch|seam/i.test(value) ? 3 : 4;
    add(priority, value);
  }
  const visibleRegions = [
    ...(profile.visibleBranding.hasLogo === false || !Array.isArray(profile.visibleBranding.logoRegions) ? [] : profile.visibleBranding.logoRegions),
    ...(profile.visibleBranding.hasReadableText === false || !Array.isArray(profile.visibleBranding.textRegions) ? [] : profile.visibleBranding.textRegions),
    ...(profile.visibleBranding.hasArtwork === false || !Array.isArray(profile.visibleBranding.artworkRegions) ? [] : profile.visibleBranding.artworkRegions),
  ];
  for (const region of visibleRegions) {
    if (region && typeof region.location === "string" && !/\b(?:back|rear|inside|underside|hidden|unseen)\b/i.test(region.location)) add(0, region.description);
  }
  if (profile.verticalAttributes.vertical === "apparel") {
    for (const closure of Array.isArray(profile.verticalAttributes.details.closures) ? profile.verticalAttributes.details.closures : []) add(1, closure);
    for (const detail of Array.isArray(profile.verticalAttributes.details.constructionDetails) ? profile.verticalAttributes.details.constructionDetails : []) add(3, detail);
  }
  for (const color of profile.dominantColors) add(2, color);
  for (const material of profile.materials) add(3, material);
  add(4, profile.productShape);
  const ordered = candidates.sort((a, b) => a.priority - b.priority);
  const firstInCategory = new Set<number>();
  const first: Evidence[] = [], remaining: Evidence[] = [];
  for (const candidate of ordered) {
    if (firstInCategory.has(candidate.priority)) remaining.push(candidate);
    else { firstInCategory.add(candidate.priority); first.push(candidate); }
  }
  const seen = new Set<string>();
  return [...first, ...remaining].flatMap(({ text }) => {
    const key = text.toLocaleLowerCase("en-US");
    if (seen.has(key)) return [];
    seen.add(key);
    return [text];
  });
}
