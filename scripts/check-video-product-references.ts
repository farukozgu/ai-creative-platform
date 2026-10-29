import { writeFileSync } from "node:fs";
import { directorProducts, directorFixtureInput } from "../tests/fixtures/video-director-fixtures";
import { fallbackDirectorPlan, parseDirectorOutput, compileDirectorPlan } from "../src/lib/video-director/core";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import type { VideoPresetId } from "../src/lib/video-director/presets";

// Offline authored assessments exercise the production compiler; these are not live model judgments.
globalThis.fetch = async () => { throw new Error("Network disabled for reference checks"); };
const examples = [0, 1, 2, 4].map(index => {
  const product = directorProducts[index];
  const presetId: VideoPresetId = index === 0 ? "macro-stitching" : index === 1 ? "label-reveal" : index === 2 ? "precision-macro" : "hardware-reveal";
  const base = directorFixtureInput(product);
  const input = { ...base, presetId, draft: { ...base.draft, productReferences: [1, 2].map(n => ({
    source: { kind: "uploaded-image" as const, sourceAssetId: `10000000-0000-4000-8000-00000000000${n}` },
    sha256: String(n).repeat(64), purpose: n === 1 ? "detail" : "angle",
  })) } };
  const authored = { ...fallbackDirectorPlan(input), referenceReviews: [0, 1].map(index => ({
    index, status: "matched", reason: "Authored fixture: consistent main-product outline", details: [],
  })) };
  const plan = parseDirectorOutput(authored, input);
  if (!plan) throw new Error("Invalid fixture assessment");
  const compiled = compileDirectorPlan(plan, input);
  const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: "kling-v3-standard-image",
    endpointId: "", sourceUrl: "https://private.example/main.png",
    elementImageUrls: ["https://private.example/detail.png", "https://private.example/angle.png"] });
  return { product: product.productId, presetId, provenance: "offline-authored-assessment", plan, payload,
    promptCharacters: compiled.multiPrompt!.map(shot => shot.prompt.length) };
});
writeFileSync("docs/video-product-references-examples.json", JSON.stringify(examples, null, 2) + "\n");
console.log(JSON.stringify({ examples: examples.length, paidCalls: 0, valid: true }));
