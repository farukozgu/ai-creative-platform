import type { ProductProfile } from "../../src/lib/product-understanding/product-profile";
import { libraryFixtures } from "../../tests/fixtures/video-preset-library-fixtures";
import { directorProducts } from "../../tests/fixtures/video-director-fixtures";
import type { VideoCategory } from "../../src/lib/video-director/preset-contract";
import { directorProductContext } from "../../src/lib/video-director/product-context";

export type IntentKind = "short" | "detailed" | "empty" | "conflicting";
export type IntentContract = { kind: IntentKind; text: string; camera?: "static" | "pan-right" | "in-out" | "push"; detail?: string; safeAdjustment?: boolean };
export type BenchmarkProduct = { id: string; name: string; category: VideoCategory | "unknown"; profile: ProductProfile | null; featureTargets: string[]; provenance: string };

const extra = (index: number, id: string, name: string, category: VideoCategory, profile: ProductProfile): BenchmarkProduct => ({
  id, name, category, profile, featureTargets: profile.identityCriticalAttributes.map(item => item.attribute), provenance: `Synthetic variant of existing fixture ${index}; no source pixels or live analysis`,
});
const watch = structuredClone(directorProducts[2]);
watch.productId = "benchmark-square-watch"; watch.productShape = "square watch case";
watch.identityCriticalAttributes = [{ attribute: "ivory dial with visible hands", rationale: "fixture visible evidence", regions: [] }];
if (watch.verticalAttributes.vertical === "watches") Object.assign(watch.verticalAttributes.details, { caseShape: "square watch case", dialColor: "ivory dial", indicesOrMarkers: "rectangular dial markers" });
const shoe = structuredClone(directorProducts[5]);
shoe.productId = "benchmark-boot"; shoe.subcategory = "ankle boot"; shoe.productShape = "ankle boot silhouette"; shoe.materials = ["smooth leather"];
shoe.identityCriticalAttributes = [{ attribute: "visible side stitching", rationale: "fixture visible evidence", regions: [] }];
if (shoe.verticalAttributes.vertical === "footwear") Object.assign(shoe.verticalAttributes.details, { shoeType: "ankle boot", silhouette: "ankle boot silhouette", upperMaterial: ["smooth leather texture"], lacing: null, outsole: "visible sole edge" });
const cosmetic = structuredClone(directorProducts[1]);
cosmetic.productId = "benchmark-lotion"; cosmetic.subcategory = "cosmetic bottle"; cosmetic.productShape = "rounded bottle geometry"; cosmetic.materials = ["opaque plastic"]; cosmetic.dominantColors = ["white"];
cosmetic.identityCriticalAttributes = ["rounded bottle geometry", "visible pump outline", "rectangular front label"].map(attribute => ({ attribute, rationale: "fixture visible evidence", regions: [] }));
if (cosmetic.verticalAttributes.vertical === "cosmetics") Object.assign(cosmetic.verticalAttributes.details, { packageType: "lotion bottle", packageGeometry: "rounded bottle geometry", closureOrDispenser: "pump", materialOpacity: "opaque", liquidVisibility: "not_visible" });
const furniture = structuredClone(libraryFixtures.find(f => f.category === "furniture")!.profile!);
furniture.productId = "benchmark-sofa"; furniture.subcategory = "sofa"; furniture.productShape = "wide sofa outline";
furniture.identityCriticalAttributes = ["visible panel junction", "woven surface relief"].map(attribute => ({ attribute, rationale: "fixture visible evidence", regions: [] }));
const food = structuredClone(libraryFixtures.find(f => f.category === "food")!.profile!);
food.productId = "benchmark-bread"; food.subcategory = "bread"; food.productShape = "oval bread silhouette";
food.identityCriticalAttributes = ["coarse crumb surface", "visible scored top"].map(attribute => ({ attribute, rationale: "fixture visible evidence", regions: [] }));

// Human-authored component targets from the existing typed fixtures, independent of preset choice.
// Do not score only identityCriticalAttributes: a valid clasp/dial marker may live in vertical details.
const componentTargets: Record<string, string[]> = {
  watch: ["blue dial", "slim dial markers", "steel bracelet", "brushed steel"],
  ring: ["oval center stone", "slim band"],
  bag: ["front clasp", "visible edge stitching", "pebbled leather grain"],
  shoe: ["crossed laces", "visible sole edge"],
  "benchmark-square-watch": ["ivory dial", "rectangular dial markers", "steel bracelet", "brushed steel"],
  "benchmark-boot": ["smooth leather texture", "visible sole edge"],
};

export const benchmarkProducts: BenchmarkProduct[] = [
  ...libraryFixtures.map((f, i) => ({ id: `product-${i}`, name: i === 0 ? "Parlak siyah kemerli ceket" : i === 3 ? "Deri çanta" : f.name, category: f.category, profile: f.profile,
    featureTargets: [...(f.profile?.identityCriticalAttributes.map(item => item.attribute) ?? []), ...(componentTargets[f.profile?.productId ?? ""] ?? [])],
    provenance: i < 8 ? "Existing Product Understanding / library fixture; not live image evidence" : "Existing synthetic subtype compatibility fixture; not live analysis",
  })),
  extra(2, "watch-square", "Kare kol saati", "watches", watch),
  extra(5, "boot", "Deri bot", "footwear", shoe),
  extra(1, "lotion", "Kozmetik şişesi", "cosmetics", cosmetic),
  extra(10, "sofa", "Kanepe", "furniture", furniture),
  extra(11, "bread", "Ekmek", "food", food),
].map(product => ({ ...product, featureTargets: [...new Set([...product.featureTargets, ...(componentTargets[product.profile?.productId ?? ""] ?? [])])] }));

/** Expectations are authored contracts, not extracted by counting words in prompts. */
export function intentContracts(product: BenchmarkProduct, multi: boolean): IntentContract[] {
  const evidence = directorProductContext(product.profile).evidence.map(item => item.detail);
  const detail = product.featureTargets.find(item => evidence.includes(item));
  return [
    { kind: "short", text: "Kamerayı sabit tut ve ürünü net göster.", camera: "static" },
    { kind: "detailed", text: multi
      ? `Start close on ${detail ?? "the visible form"}; gently push in, then pull back to the complete product. Keep source colors.`
      : `Use only a slow pan right. Keep ${detail ?? "the visible product form"} sharp throughout this continuous take.`, camera: multi ? "in-out" : "pan-right", detail },
    { kind: "empty", text: "" },
    { kind: "conflicting", text: "Ürünü 360 derece döndürüp arkasını göster; sonra yavaşça yaklaş. Mevcut renk ve logoyu koru.", camera: "push", safeAdjustment: true },
  ];
}
