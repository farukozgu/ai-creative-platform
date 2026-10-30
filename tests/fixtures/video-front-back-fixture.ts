import sharp from "sharp";
import { directorProducts, directorFixtureInput } from "./video-director-fixtures";
import { fallbackDirectorPlan, type VideoDirectorInput } from "../../src/lib/video-director/core";
import { directorProductContext } from "../../src/lib/video-director/product-context";
import type { ReferenceReview } from "../../src/lib/video-generation/product-references";
import type { ProductProfile } from "../../src/lib/product-understanding/product-profile";

export const backAssetId = "10000000-0000-4000-8000-000000000003";
export const frontBackProfile: ProductProfile = { ...structuredClone(directorProducts[0]), subcategory: "hooded jacket", productShape: "hooded jacket silhouette", materials: [],
  identityCriticalAttributes: ["centered front zipper", "visible surface texture", "hood outline", "horizontal padded panels"].map(attribute => ({ attribute, rationale: "source-visible", regions: [] })),
  verticalAttributes: { vertical: "apparel" as const, details: { garmentType: "hooded jacket", primaryColor: "black", artworkOrLogoLocations: [],
    closures: ["centered front zipper"], pocketStructure: [], hoodOrCollar: "hood outline", constructionDetails: ["horizontal padded panels"], identitySides: ["front"] } },
};

/** Representative synthetic garment pixels, not a live customer's photos or vision result. */
export async function jacketFixtureImage(view: "front" | "back") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs><linearGradient id="leather"><stop stop-color="#101114"/><stop offset=".46" stop-color="#37383b"/><stop offset=".6" stop-color="#111215"/><stop offset="1" stop-color="#242528"/></linearGradient></defs>
    <rect width="512" height="512" fill="#ddd9d3"/><ellipse cx="256" cy="455" rx="155" ry="15" fill="#b8b4ae"/>
    <path d="M185 77L223 59H289L327 77L374 105L419 299L362 315L332 205L339 438H173L180 205L150 315L93 299L138 105Z" fill="url(#leather)" stroke="#08090b" stroke-width="5"/>
    <path d="M188 150H324M179 220H333M177 290H335M176 360H336" stroke="#66666a" stroke-width="3"/>
    ${view === "front" ? '<path d="M224 62Q195 110 220 146L256 157L292 146Q317 110 287 62M256 157V430" fill="none" stroke="#99999b" stroke-width="4"/><path d="M186 300L229 280M290 280L326 300" stroke="#aaa" stroke-width="5"/>'
      : '<path d="M224 62Q195 110 222 146Q256 167 290 146Q317 110 287 62M256 70V140" fill="none" stroke="#6b6b6d" stroke-width="3"/>'}
    <path d="M184 420H334M145 277L159 276M355 276L370 277" stroke="#555659" stroke-width="4"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export function frontBackInput(sha256: string): VideoDirectorInput {
  const base = directorFixtureInput(frontBackProfile);
  return { ...base, presetId: "cinematic-hero", draft: { ...base.draft, durationSeconds: 5,
    productReferences: [{ source: { kind: "uploaded-image", sourceAssetId: backAssetId }, sha256, purpose: "texture" }] } };
}

/** Independent authored reference review / shot response, never a claim of live inference. */
export function frontBackResponse(input: VideoDirectorInput) {
  const evidence = directorProductContext(input.profile).evidence;
  const form = evidence.find(item => /silhouette/.test(item.detail))!.id;
  const surface = evidence.find(item => /texture/.test(item.detail))!.id;
  const reviews: ReferenceReview[] = [{ index: 0, status: "matched", view: "back", reason: "Consistent silhouette, hood and panel layout across opposite views", details: ["rear horizontal panel seams", "rear panel outline"] }];
  return { ...fallbackDirectorPlan(input), origin: "ai" as const, referenceReviews: reviews,
    shots: [
      { durationSeconds: 1, purpose: "hero-reveal" as const, camera: "Locked medium overview", composition: "Complete front product with clean margins", lighting: "Side light shapes the contour", motion: "Product stays still", pace: "Crisp opening", focus: `verified-evidence:${form}`, referenceIndex: null },
      { durationSeconds: 1, purpose: "material-study" as const, camera: "Locked close framing", composition: "Resolvable visible surface crop", lighting: "Grazing light defines existing relief", motion: "Product stays still", pace: "Quick tactile accent", focus: `verified-evidence:${surface}`, referenceIndex: null },
      { durationSeconds: 1, purpose: "controlled-motion" as const, camera: "Locked medium framing", composition: "Complete rear view with balanced margins", lighting: "Contour light defines the rear outline", motion: "Product stays still", pace: "Clear angle reset", focus: `verified-evidence:${evidence.length + 1}`, referenceIndex: 0 },
      { durationSeconds: 2, purpose: "final-hero" as const, camera: "Locked hero frame", composition: "Full front silhouette with campaign space", lighting: "Directional light preserves source colors", motion: "Product stays still", pace: "Confident closing hold", focus: `verified-evidence:${form}`, referenceIndex: null },
    ] };
}
