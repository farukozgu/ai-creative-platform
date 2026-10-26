import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { compileProductVideoPrompt, mapRegionToFrame, parseCriticalProductRegion } from "../src/lib/video-generation/preservation";
import { renderSourceMotion, extractVideoFrames, sourceMotionTransform } from "../src/lib/video-generation/source-motion";
import { miniVisionTokens, quoteVideoFidelity } from "../src/lib/video-fidelity/pricing";
import { restoredReviewStatus, runVideoFidelityReview } from "../src/lib/video-fidelity/review-service";
import type { VideoFidelityReport } from "../src/lib/video-fidelity/types";
import { videoDraftHash } from "../src/lib/video-generation/request-identity";
import type { VideoGenerationDraft } from "../src/lib/video-generation/types";
import { initialVideoStudioDraft, videoStudioReducer } from "../src/features/video/video-studio-state";

test("product preservation compiles camera direction and rejects invented surfaces before a provider call", () => {
  const compiled = compileProductVideoPrompt({ prompt: "Gentle product shot.", cameraMovement: "pan-left" });
  assert.match(compiled.prompt, /pan left/); assert.match(compiled.prompt, /exact silhouette/);
  assert.match(compiled.negativePrompt, /rewritten text/); assert.equal(compiled.cfgScale, 0.5);
  for (const prompt of ["Rotate 360 degrees", "Morph the jacket", "Ürünün arkasını göster"]) assert.throws(() => compileProductVideoPrompt({ prompt, cameraMovement: "static" }));
  assert.throws(() => compileProductVideoPrompt({ prompt: "Slow motion", cameraMovement: "orbit" }));
});

test("critical region validation and contain-coordinate mapping preserve original-image provenance", () => {
  assert.equal(parseCriticalProductRegion({ x: 0.8, y: 0, width: 0.3, height: 0.1, declaredText: "label" }), null);
  assert.equal(parseCriticalProductRegion({ x: NaN, y: 0, width: 0.1, height: 0.1, declaredText: "label" }), null);
  const region = parseCriticalProductRegion({ x: 0.4, y: 0.1, width: 0.2, height: 0.1, declaredText: "USER HINT" })!;
  const frame = mapRegionToFrame(region, { originalWidth: 2400, originalHeight: 3600, contentRect: { x: 0, y: 0.078125, width: 1, height: 0.84375 } });
  assert.equal(frame.x, 0.4); assert.equal(frame.y, 0.1625); assert.equal(frame.declaredText, "USER HINT");
});

test("all photo motion transforms keep the entire source inside the frame", () => {
  for (const preset of ["static", "dolly-in", "pan-left", "pan-right"] as const) for (let index = 0; index <= 100; index++) {
    const { scale, x, y } = sourceMotionTransform(preset, index / 100);
    assert.ok((1 - scale) / 2 + x >= 0); assert.ok((1 + scale) / 2 + x <= 1);
    assert.ok((1 - scale) / 2 + y >= 0); assert.ok((1 + scale) / 2 + y <= 1);
  }
});

test("analysis prices use mini vision tile rates, integer rounding and an expiring verified version", () => {
  assert.equal(miniVisionTokens({ width: 1024, height: 1024, detail: "low" }), 2833);
  assert.equal(miniVisionTokens({ width: 1024, height: 1024, detail: "high" }), 25501);
  const now = Date.parse("2026-10-26T12:00:00Z");
  assert.equal(quoteVideoFidelity(false, now)?.maximumEstimatedCostUsd, 0.006270);
  assert.equal(quoteVideoFidelity(true, now)?.maximumEstimatedCostUsd, 0.017746);
  assert.ok(quoteVideoFidelity(true, now)!.inputTokenLimit + 2200 < 128000);
  assert.equal(quoteVideoFidelity(true, Date.parse("2026-11-26T00:00:00Z")), null);
  assert.throws(() => miniVisionTokens({ width: 8192, height: 8192, detail: "high" }));
});

test("submission digest includes method, critical region and the separately approved analysis ceiling", () => {
  const draft: VideoGenerationDraft = { clientSubmissionId: "submission", mode: "image", quality: "standard", aspectRatio: "9:16", durationSeconds: 5, cameraMovement: "static", prompt: "Gentle", source: { kind: "uploaded-image", sourceAssetId: "source" } };
  assert.notEqual(videoDraftHash(draft), videoDraftHash({ ...draft, method: "source-motion" }));
  assert.notEqual(videoDraftHash(draft), videoDraftHash({ ...draft, criticalRegion: { x: 0.1, y: 0.1, width: 0.1, height: 0.1, declaredText: "Hint" } }));
  assert.notEqual(videoDraftHash(draft), videoDraftHash({ ...draft, analysisConsent: { model: "gpt-4o-mini", pricingVersion: "verified", maximumCostUsd: 0.02 } }));
});

test("changing critical evidence or duration invalidates the previous paid-analysis checkbox consent", () => {
  const state = { ...initialVideoStudioDraft, method: "kling" as const, analyzeAfterGeneration: true };
  assert.equal(videoStudioReducer(state, { type: "set-critical-region", region: { x: 0.1, y: 0.1, width: 0.1, height: 0.1, declaredText: "hint" } }).analyzeAfterGeneration, false);
  assert.equal(videoStudioReducer(state, { type: "set-duration", duration: 10 }).analyzeAfterGeneration, false);
});

test("duplicate analysis requests get one claim, one submission marker and one paid attempt", async () => {
  let claimed = false, attempts = 0, status = "queued";
  const deps = { claim: async () => { if (claimed) return null; claimed = true; return "token"; }, prepare: async () => ({}),
    markSubmitting: async () => { status = "submitting"; return true; }, analyze: async () => { attempts++; return {} as VideoFidelityReport; },
    finish: async (_token: string, result: string) => { status = result; } };
  await Promise.all([runVideoFidelityReview(deps), runVideoFidelityReview(deps)]);
  assert.equal(attempts, 1); assert.equal(status, "succeeded");
});

test("lost submission-marker response and provider timeout remain uncertain without a paid retry", async () => {
  for (const lostMarker of [true, false]) {
    let claimed = false, attempts = 0, status = "queued";
    const deps = { claim: async () => { if (claimed) return null; claimed = true; return "token"; }, prepare: async () => ({}),
      markSubmitting: async () => { if (lostMarker) throw new Error("Committed marker response lost"); return true; },
      analyze: async (): Promise<VideoFidelityReport> => { attempts++; throw new Error("Provider timeout"); },
      finish: async (_token: string, result: string) => { status = result; } };
    await runVideoFidelityReview(deps); await runVideoFidelityReview(deps);
    assert.equal(attempts, lostMarker ? 0 : 1); assert.equal(status, "uncertain");
  }
});

test("unreadable media fails before the paid submission marker", async () => {
  let markers = 0, calls = 0, outcome = "";
  await runVideoFidelityReview({ claim: async () => "token", prepare: async () => { throw new Error("Invalid MP4"); }, markSubmitting: async () => { markers++; return true; },
    analyze: async () => { calls++; return {} as VideoFidelityReport; }, finish: async (_token, status) => { outcome = status; } });
  assert.equal(markers, 0); assert.equal(calls, 0); assert.equal(outcome, "failed");
});

test("reload stops waiting for expired analysis preparation and never retries an expired submission", () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  const expired = "2026-10-26T11:59:59Z", active = "2026-10-26T12:01:00Z";
  assert.equal(restoredReviewStatus("processing", expired, now), "failed");
  assert.equal(restoredReviewStatus("submitting", expired, now), "uncertain");
  assert.equal(restoredReviewStatus("processing", active, now), "processing");
  assert.equal(restoredReviewStatus("succeeded", expired, now), "succeeded");
  assert.equal(restoredReviewStatus("queued", null, now), "queued");
});

for (const aspectRatio of ["9:16", "16:9", "1:1"] as const) for (const durationSeconds of [5, 10] as const) {
  test(`real local H.264 renderer and decoder: ${aspectRatio}, ${durationSeconds}s`, { timeout: 90_000 }, async () => {
    const source = await sharp(Buffer.from('<svg width="480" height="720"><rect width="480" height="720" fill="white"/><rect x="20" y="20" width="440" height="680" stroke="black" stroke-width="4" fill="#333"/><rect x="160" y="90" width="160" height="55" fill="white"/><text x="175" y="125" font-family="Arial" font-size="26">TEST 42</text></svg>')).png().toBuffer();
    const preset = aspectRatio === "9:16" ? "dolly-in" : aspectRatio === "16:9" ? "pan-left" : "pan-right";
    const mp4 = await renderSourceMotion({ source, aspectRatio, durationSeconds, preset });
    assert.equal(mp4.toString("ascii", 4, 8), "ftyp");
    const frames = await extractVideoFrames(mp4, durationSeconds, [0, durationSeconds / 2, durationSeconds * 0.95]);
    assert.equal(frames.length, 3);
    for (const frame of frames) {
      const meta = await sharp(frame.data).metadata();
      const expected = aspectRatio === "9:16" ? 9 / 16 : aspectRatio === "16:9" ? 16 / 9 : 1;
      assert.ok(Math.abs(meta.width! / meta.height! - expected) < 0.003);
      assert.ok(frame.data.length > 1000);
    }
  });
}
