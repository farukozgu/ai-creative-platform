import { readFileSync } from "node:fs";
import { compileDirectorPlan, fallbackDirectorPlan, parseDirectorOutput, type VideoDirectorInput } from "../../src/lib/video-director/core";
import { directorCacheKey } from "../../src/lib/video-director/receipt";
import { getVideoDirectorPreset, videoPresetIds } from "../../src/lib/video-director/presets";
import { buildFalVideoRequestInput } from "../../src/lib/video-generation/fal-request";
import type { ProductProfile } from "../../src/lib/product-understanding/product-profile";
import { canonicalPresetOutputJson, presetOutputFingerprint } from "./preset-output-fingerprint";
import { directorProducts, directorFixtureInput } from "./video-director-fixtures";
import { frontBackInput, frontBackResponse } from "./video-front-back-fixture";
import { VideoProductionHarness } from "./video-production-harness";

const selectedIds = new Set(["material-detail", "macro-detail-reveal", "product-spotlight"]);

export function fixtureDirectorCacheKey(input: VideoDirectorInput) {
  // Freeze fixture field order before exercising the real, receipt-bound key.
  const json = canonicalPresetOutputJson({ draft: input.draft, profile: input.profile });
  const { draft, profile } = JSON.parse(json) as Pick<VideoDirectorInput, "draft" | "profile">;
  return directorCacheKey("owner", "source", "gpt-4o-mini", { ...input, draft, profile });
}

function directorRequest(harness: VideoProductionHarness, input: VideoDirectorInput) {
  const request = harness.directorRequest(input);
  return { ...request, context: JSON.parse(request.context) as unknown };
}

/**
 * The mixed hashes first committed in 1d4d124 already fail when replayed at
 * that revision. Its parent lacks the duration-aware preset and reference
 * contracts, and the persisted knitwear/duration fixtures cover only subsets.
 * Freeze the current contracts by component, preserving case and shot order.
 */
export async function protectedPresetFingerprints() {
  const successful = JSON.parse(readFileSync("tests/fixtures/cinematic-knitwear-success.json", "utf8")) as { profile: ProductProfile };
  const harness = await VideoProductionHarness.create();
  const result: Record<string, unknown> = {};
  for (const presetId of videoPresetIds.filter(id => !selectedIds.has(id))) {
    const presets: unknown[] = [];
    const plans: unknown[] = [];
    const compiledPrompts: unknown[] = [];
    const klingRequests: unknown[] = [];
    const cacheKeys: string[] = [];
    const directorRequests: unknown[] = [];
    for (const profile of [null, ...directorProducts, successful.profile])
      for (const quality of ["standard", "pro"] as const) for (const shotMode of ["single", "multi"] as const)
        for (const durationSeconds of [5, 10] as const) for (const cameraMovement of ["auto", "static"] as const) {
          const base = directorFixtureInput(directorProducts[0]);
          const input: VideoDirectorInput = { ...base, profile, presetId, shotMode, draft: { ...base.draft, quality, shotMode, durationSeconds, cameraMovement } };
          const plan = fallbackDirectorPlan(input);
          const compiled = compileDirectorPlan(plan, input);
          const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: `kling-v3-${quality}-image`, endpointId: "fixture", sourceUrl: "https://invalid.example/source" });
          presets.push(getVideoDirectorPreset(presetId, shotMode, durationSeconds));
          plans.push(plan);
          compiledPrompts.push(compiled);
          klingRequests.push(payload);
          cacheKeys.push(fixtureDirectorCacheKey(input));
          if (presetId === "cinematic-hero") directorRequests.push(directorRequest(harness, input));
        }
    const matrix = {
      cases: plans.length,
      preset: presetOutputFingerprint(presets),
      plan: presetOutputFingerprint(plans),
      compiled: presetOutputFingerprint(compiledPrompts),
      klingRequest: presetOutputFingerprint(klingRequests),
      cacheKey: presetOutputFingerprint(cacheKeys),
    };
    if (presetId === "cinematic-hero") {
      const input = frontBackInput("b".repeat(64));
      const plan = parseDirectorOutput(frontBackResponse(input), input);
      if (!plan) throw new Error("Invalid authored reference baseline");
      result[presetId] = {
        ...matrix,
        directorRequest: presetOutputFingerprint(directorRequests),
        frontBack: {
          plan: presetOutputFingerprint(plan),
          compiled: presetOutputFingerprint(compileDirectorPlan(plan, input)),
          directorRequest: presetOutputFingerprint(directorRequest(harness, input)),
          cacheKey: fixtureDirectorCacheKey(input),
        },
      };
    } else {
      result[presetId] = matrix;
    }
  }
  harness.assertIsolated();
  return result;
}
