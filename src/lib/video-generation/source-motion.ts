import sharp from "sharp";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { videoSourceFrameSizes } from "./prepare-source-image";
import type { VideoGenerationAspectRatio } from "./types";

export const MAX_LOCAL_VIDEO_BYTES = 32 * 1024 * 1024;
export const SOURCE_MOTION_VERSION = "source-motion-v1";
export type SourceMotionPreset = "static" | "dolly-in" | "pan-left" | "pan-right";
const presets = new Set<SourceMotionPreset>(["static", "dolly-in", "pan-left", "pan-right"]);
export function isSourceMotionPreset(value: string): value is SourceMotionPreset { return presets.has(value as SourceMotionPreset); }

export function sourceMotionTransform(preset: SourceMotionPreset, progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  return { scale: preset === "dolly-in" ? 0.92 + 0.04 * p : 0.94,
    x: preset === "pan-left" ? 0.02 - 0.04 * p : preset === "pan-right" ? -0.02 + 0.04 * p : 0, y: 0 };
}

export async function runFfmpeg(args: string[], timeoutMs = 45_000) {
  if (!ffmpegPath) throw new Error("FFmpeg unavailable on this platform.");
  const binary = ffmpegPath;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(binary, ["-hide_banner", "-loglevel", "error", "-nostdin", "-max_alloc", "67108864", ...args], { shell: false, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let errorText = "";
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    child.stderr.on("data", (data: Buffer) => { errorText = (errorText + data.toString()).slice(-1600); });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => { clearTimeout(timer); if (timedOut) reject(new Error("Video processing timed out.")); else if (code === 0) resolve(); else reject(new Error(`Video processing failed (${code}): ${errorText}`)); });
  });
}

/** Full source stays inside the canvas. Only uniform 2D transforms and MP4 encoding. */
export async function renderSourceMotion(input: { source: Buffer; aspectRatio: VideoGenerationAspectRatio; durationSeconds: 5 | 10; preset: SourceMotionPreset }) {
  if (!input.source.length || input.source.length > 25 * 1024 * 1024 || ![5, 10].includes(input.durationSeconds) || !isSourceMotionPreset(input.preset)) throw new Error("Invalid source motion request.");
  const size = videoSourceFrameSizes[input.aspectRatio];
  if (!size) throw new Error("Unsupported ratio.");
  const directory = await mkdtemp(join(tmpdir(), "klay-source-motion-"));
  try {
    const image = sharp(input.source, { failOn: "error", limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || !["jpeg", "png"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1) throw new Error("Invalid source image.");
    const sourcePath = join(directory, "source.png"), outputPath = join(directory, "output.mp4");
    await image.resize({ ...size, fit: "contain" }).png().toFile(sourcePath);
    const frames = input.durationSeconds * 24;
    const edge = await sharp(sourcePath).extract({ left: 0, top: 0, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    const background = Array.from(edge.subarray(0, 3)).map(channel => channel.toString(16).padStart(2, "0")).join("");
    const scale = input.preset === "dolly-in" ? `0.92+0.04*n/${frames - 1}` : "0.94";
    const dx = input.preset === "pan-left" ? `0.02-0.04*t/${input.durationSeconds}` : input.preset === "pan-right" ? `-0.02+0.04*t/${input.durationSeconds}` : "0";
    // Even codec dimensions and a safety margin keep all motion inside the canvas.
    const filter = `[0:v]split=2[bg][fg];[bg]scale=${size.width}:${size.height},drawbox=x=0:y=0:w=iw:h=ih:color=0x${background}:t=fill[canvas];[fg]scale=w='trunc(${size.width}*(${scale})/2)*2':h='trunc(${size.height}*(${scale})/2)*2':eval=frame[product];[canvas][product]overlay=x='(W-w)/2+W*(${dx})':y='(H-h)/2':eval=frame,format=yuv420p[out]`;
    await runFfmpeg(["-loop", "1", "-framerate", "24", "-i", sourcePath, "-filter_complex_threads", "1", "-filter_complex", filter, "-map", "[out]", "-frames:v", String(frames), "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-threads", "2", "-an", "-movflags", "+faststart", "-fs", String(MAX_LOCAL_VIDEO_BYTES), "-y", outputPath]);
    const info = await stat(outputPath);
    if (info.size < 12 || info.size >= MAX_LOCAL_VIDEO_BYTES) throw new Error("Local MP4 exceeds limit.");
    const bytes = await readFile(outputPath);
    if (bytes.toString("ascii", 4, 8) !== "ftyp") throw new Error("Invalid MP4.");
    return bytes;
  } finally { await rm(directory, { recursive: true, force: true }); }
}

/** One bounded, local decoder. No URLs or user-authored filters reach FFmpeg. */
export async function extractVideoFrames(bytes: Buffer, durationSeconds: number, timestamps: readonly number[]) {
  if (bytes.length < 12 || bytes.length > MAX_LOCAL_VIDEO_BYTES || bytes.toString("ascii", 4, 8) !== "ftyp" || durationSeconds <= 0 || durationSeconds > 15 || timestamps.length > 5
    || timestamps.some(t => !Number.isFinite(t) || t < 0 || t >= durationSeconds)) throw new Error("Unsupported video for analysis.");
  const directory = await mkdtemp(join(tmpdir(), "klay-video-frames-"));
  try {
    const video = join(directory, "input.mp4"); await writeFile(video, bytes);
    const args = ["-threads", "2", "-max_pixels", "40000000", "-i", video];
    timestamps.forEach((time, index) => args.push("-ss", String(time), "-frames:v", "1", "-vf", "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease", "-threads", "1", "-y", join(directory, `${index}.png`)));
    await runFfmpeg(args, 30_000);
    return await Promise.all(timestamps.map(async (timestampSeconds, index) => ({ timestampSeconds, data: await sharp(await readFile(join(directory, `${index}.png`)), { limitInputPixels: 40_000_000 }).jpeg({ quality: 90 }).toBuffer() })));
  } finally { await rm(directory, { recursive: true, force: true }); }
}
