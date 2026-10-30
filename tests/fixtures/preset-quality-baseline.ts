import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { compileDirectorPlan, fallbackDirectorPlan, parseDirectorOutput, type VideoDirectorInput } from "../../src/lib/video-director/core";
import { directorCacheKey } from "../../src/lib/video-director/receipt";
import { getVideoDirectorPreset, videoPresetIds } from "../../src/lib/video-director/presets";
import { buildFalVideoRequestInput } from "../../src/lib/video-generation/fal-request";
import type { ProductProfile } from "../../src/lib/product-understanding/product-profile";
import { directorProducts, directorFixtureInput } from "./video-director-fixtures";
import { VideoProductionHarness } from "./video-production-harness";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const selectedIds = new Set(["material-detail", "macro-detail-reveal", "product-spotlight"]);

/** Captured before the quality pilot. Never regenerates expected values in a test. */
export async function protectedPresetFingerprints() {
  const successful = JSON.parse(readFileSync("tests/fixtures/cinematic-knitwear-success.json", "utf8")) as { profile: ProductProfile };
  const harness = await VideoProductionHarness.create();
  const result: Record<string, { cases: number; fingerprint: string }> = {};
  for (const presetId of videoPresetIds.filter(id => !selectedIds.has(id))) {
    const signatures: string[] = [];
    for (const profile of [null, ...directorProducts, successful.profile])
      for (const quality of ["standard", "pro"] as const) for (const shotMode of ["single", "multi"] as const)
        for (const durationSeconds of [5, 10] as const) for (const cameraMovement of ["auto", "static"] as const) {
          const base = directorFixtureInput(directorProducts[0]);
          const input: VideoDirectorInput = { ...base, profile, presetId, shotMode, draft: { ...base.draft, quality, shotMode, durationSeconds, cameraMovement } };
          const plan = fallbackDirectorPlan(input);
          const compiled = compileDirectorPlan(plan, input);
          const preset = getVideoDirectorPreset(presetId, shotMode, durationSeconds);
          const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: `kling-v3-${quality}-image`, endpointId: "fixture", sourceUrl: "https://invalid.example/source" });
          signatures.push(hash({ preset, plan, compiled, payload, cacheKey: directorCacheKey("owner", "source", "gpt-4o-mini", input),
            ...(presetId === "cinematic-hero" ? { aiRequest: harness.directorRequest(input) } : {}) }));
        }
    // Also freeze Cinematic's reference context, signed-plan directions and cache.
    if (presetId === "cinematic-hero") {
      const { frontBackInput, frontBackResponse } = await import("./video-front-back-fixture");
      const input = frontBackInput("b".repeat(64));
      const plan = parseDirectorOutput(frontBackResponse(input), input);
      if (!plan) throw new Error("Invalid authored reference baseline");
      signatures.push(hash({ plan, compiled: compileDirectorPlan(plan, input), aiRequest: harness.directorRequest(input),
        cacheKey: directorCacheKey("owner", "source", "gpt-4o-mini", input) }));
    }
    result[presetId] = { cases: signatures.length, fingerprint: hash(signatures) };
  }
  return result;
}
