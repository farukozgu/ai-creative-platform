import sharp from "sharp";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

export const MAX_ANALYZABLE_VIDEO_BYTES = 32 * 1024 * 1024;

async function runFrameDecoder(args: string[], timeoutMs: number) {
  const binary = ffmpegPath;
  if (!binary) throw new Error("FFmpeg unavailable on this platform.");
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

/** Bounded local decoding for fidelity review; callers must pass an owned MP4 buffer. */
export async function extractVideoFrames(bytes: Buffer, durationSeconds: number, timestamps: readonly number[]) {
  if (bytes.length < 12 || bytes.length > MAX_ANALYZABLE_VIDEO_BYTES || bytes.toString("ascii", 4, 8) !== "ftyp" || durationSeconds <= 0 || durationSeconds > 15 || timestamps.length > 5
    || timestamps.some(t => !Number.isFinite(t) || t < 0 || t >= durationSeconds)) throw new Error("Unsupported video for analysis.");
  const directory = await mkdtemp(join(tmpdir(), "klay-video-frames-"));
  try {
    const video = join(directory, "input.mp4"); await writeFile(video, bytes);
    const args = ["-threads", "2", "-max_pixels", "40000000", "-i", video];
    timestamps.forEach((time, index) => args.push("-ss", String(time), "-frames:v", "1", "-vf", "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease", "-threads", "1", "-y", join(directory, `${index}.png`)));
    await runFrameDecoder(args, 30_000);
    return await Promise.all(timestamps.map(async (timestampSeconds, index) => ({ timestampSeconds, data: await sharp(await readFile(join(directory, `${index}.png`)), { limitInputPixels: 40_000_000 }).jpeg({ quality: 90 }).toBuffer() })));
  } finally { await rm(directory, { recursive: true, force: true }); }
}
