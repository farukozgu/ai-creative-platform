import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";
import { compileProductVideoPrompt, mapRegionToFrame, parseCriticalProductRegion } from "../src/lib/video-generation/preservation";
import { extractVideoFrames } from "../src/lib/video-fidelity/video-frame-extractor";
import { miniVisionTokens, quoteVideoFidelity } from "../src/lib/video-fidelity/pricing";
import { restoredReviewStatus, runVideoFidelityReview } from "../src/lib/video-fidelity/review-service";
import type { VideoFidelityReport } from "../src/lib/video-fidelity/types";
import { videoDraftHash } from "../src/lib/video-generation/request-identity";
import type { VideoGenerationDraft } from "../src/lib/video-generation/types";
import { initialVideoStudioDraft, videoStudioReducer } from "../src/features/video/video-studio-state";

test("product preservation compiles camera direction and rejects invented surfaces before a provider call", () => {
  const compiled = compileProductVideoPrompt({ prompt: "Gentle product shot.", cameraMovement: "pan-left" });
  assert.match(compiled.prompt, /pan left/); assert.match(compiled.prompt, /silhouette, geometry and proportions/);
  assert.match(compiled.negativePrompt, /rewritten text/); assert.equal(compiled.cfgScale, 0.5);
  for (const feature of ["color distribution", "surface texture", "pattern and print", "exact visible lettering", "silhouette, geometry and proportions"]) assert.match(compiled.prompt, new RegExp(feature));
  for (const risk of ["changed brand mark", "altered color", "changed pattern", "changed surface texture", "stretched or compressed geometry"]) assert.match(compiled.negativePrompt, new RegExp(risk));
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

test("submission digest includes critical region and the separately approved analysis ceiling", () => {
  const draft: VideoGenerationDraft = { clientSubmissionId: "submission", mode: "image", quality: "standard", aspectRatio: "9:16", durationSeconds: 5, cameraMovement: "static", prompt: "Gentle", source: { kind: "uploaded-image", sourceAssetId: "source" } };
  assert.notEqual(videoDraftHash(draft), videoDraftHash({ ...draft, criticalRegion: { x: 0.1, y: 0.1, width: 0.1, height: 0.1, declaredText: "Hint" } }));
  assert.notEqual(videoDraftHash(draft), videoDraftHash({ ...draft, analysisConsent: { model: "gpt-4o-mini", pricingVersion: "verified", maximumCostUsd: 0.02 } }));
});

test("changing critical evidence or duration invalidates the previous paid-analysis checkbox consent", () => {
  const state = { ...initialVideoStudioDraft, analyzeAfterGeneration: true };
  assert.equal(videoStudioReducer(state, { type: "set-critical-region", region: { x: 0.1, y: 0.1, width: 0.1, height: 0.1, declaredText: "hint" } }).analyzeAfterGeneration, false);
  assert.equal(videoStudioReducer(state, { type: "set-duration", duration: 10 }).analyzeAfterGeneration, false);
});

test("shared fidelity decoder extracts a frame from an MP4 within its input bounds", { timeout: 45_000 }, async () => {
  assert.ok(ffmpegPath);
  const directory = await mkdtemp(join(tmpdir(), "klay-fidelity-decoder-test-"));
  try {
    const output = join(directory, "fixture.mp4");
    execFileSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=160x90:r=1:d=1", "-frames:v", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", output], { windowsHide: true });
    const video = await readFile(output);
    const frames = await extractVideoFrames(video, 1, [0]);
    assert.equal(frames.length, 1);
    assert.equal(frames[0]?.timestampSeconds, 0);
    assert.ok((await sharp(frames[0]!.data).metadata()).width);
    await assert.rejects(extractVideoFrames(Buffer.from("not an mp4"), 1, [0]));
  } finally { await rm(directory, { recursive: true, force: true }); }
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
