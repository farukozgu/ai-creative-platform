/** Local-only acceptance. Never imports Supabase, FAL or OpenAI clients. Private inputs stay outside git. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { prepareVideoSourceImage } from "../src/lib/video-generation/prepare-source-image";
import { extractVideoFrames, renderSourceMotion, sourceMotionTransform } from "../src/lib/video-generation/source-motion";
import { mapRegionToFrame, parseCriticalProductRegion, sourceFrameGeometry } from "../src/lib/video-generation/preservation";
import { cropProductRegion } from "../src/lib/video-fidelity/crop-region";
import { sampleVideoFrameTimestamps } from "../src/lib/video-fidelity/sampling";

async function main() {
  const sourcePath = process.env.VIDEO_QA_LOCAL_SOURCE, videoPath = process.env.VIDEO_QA_LOCAL_VIDEO, outputDir = process.env.VIDEO_QA_LOCAL_OUTPUT;
  const region = parseCriticalProductRegion(JSON.parse(process.env.VIDEO_QA_LOCAL_REGION ?? "null"));
  assert.ok(sourcePath && videoPath && outputDir && region, "Explicit local source/video/output and normalized region required.");
  const source = await readFile(sourcePath), existing = await readFile(videoPath);
  const sourceHash = createHash("sha256").update(source).digest("hex");
  const meta = await sharp(source).metadata(); assert.ok(meta.width && meta.height);
  await mkdir(resolve(outputDir), { recursive: true });
  for (const ratio of ["9:16", "16:9", "1:1"] as const) { const frame = await prepareVideoSourceImage(source, ratio); await writeFile(join(outputDir, `prepared-${ratio.replace(":", "x")}.png`), frame.image); }
  const prepared = await prepareVideoSourceImage(source, "9:16");
  const geometry = sourceFrameGeometry(meta.width, meta.height, prepared.width, prepared.height);
  const frameRegion = mapRegionToFrame(region, geometry);
  const rendered = await renderSourceMotion({ source: prepared.image, aspectRatio: "9:16", durationSeconds: 5, preset: "dolly-in" });
  const safeVideo = join(outputDir, "source-motion-safe.mp4"); await writeFile(safeVideo, rendered);
  const times = sampleVideoFrameTimestamps(5);
  const [originalFrames, safeFrames] = await Promise.all([extractVideoFrames(existing, 5, times), extractVideoFrames(rendered, 5, times)]);
  const comparisons: { label: string; data: Buffer }[] = [{ label: "Original source", data: await cropProductRegion(source, region, false) },
    { label: "720p scaled reference", data: await cropProductRegion(await sharp(prepared.image).resize(720, 1280).png().toBuffer(), frameRegion, false) }];
  for (const frame of [originalFrames[2], originalFrames[4]]) comparisons.push({ label: `Existing Kling ${frame.timestampSeconds}s`, data: await cropProductRegion(frame.data, frameRegion, true) });
  for (const frame of [safeFrames[2], safeFrames[4]]) {
    const { scale, x, y } = sourceMotionTransform("dolly-in", frame.timestampSeconds / 5);
    const transformed = { ...frameRegion, x: (1 - scale) / 2 + x + frameRegion.x * scale, y: (1 - scale) / 2 + y + frameRegion.y * scale, width: frameRegion.width * scale, height: frameRegion.height * scale };
    comparisons.push({ label: `Photo motion ${frame.timestampSeconds}s`, data: await cropProductRegion(frame.data, transformed, false) });
  }
  const tiles: { input: Buffer; left: number; top: number }[] = [];
  for (let i = 0; i < comparisons.length; i++) {
    const item = comparisons[i]; const crop = await sharp(item.data).resize(300, 240, { fit: "contain", background: "white" }).png().toBuffer();
    await writeFile(join(outputDir, `closeup-${i}.jpg`), item.data);
    tiles.push({ input: crop, left: (i % 3) * 300, top: Math.floor(i / 3) * 270 }, { input: Buffer.from(`<svg width="300" height="30"><rect width="300" height="30" fill="white"/><text x="8" y="22" font-family="Arial" font-size="16">${item.label}</text></svg>`), left: (i % 3) * 300, top: Math.floor(i / 3) * 270 + 240 });
  }
  await sharp({ create: { width: 900, height: 540, channels: 3, background: "white" } }).composite(tiles).png().toFile(join(outputDir, "label-comparison.png"));
  assert.equal(createHash("sha256").update(await readFile(sourcePath)).digest("hex"), sourceHash, "Original is unchanged.");
  const report = { sourceHash, originalPreserved: true, sampledTimestamps: times, existingVideoFramesDecoded: originalFrames.length,
    localVideoFramesDecoded: safeFrames.length, sourceMotionVideoBytes: rendered.length, semanticAnalysisPerformed: false,
    automaticLabelDistortionDetectionVerified: false, paidProviderCalls: 0 };
  await writeFile(join(outputDir, "acceptance.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, safeVideo, contactSheet: join(outputDir, "label-comparison.png") }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Local validation failed"); process.exitCode = 1; });
