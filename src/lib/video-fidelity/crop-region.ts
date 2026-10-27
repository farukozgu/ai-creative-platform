import sharp from "sharp";
import type { CriticalProductRegion } from "@/lib/video-generation/preservation";

export async function cropProductRegion(data: Buffer, box: CriticalProductRegion, context: boolean) {
  const image = sharp(data, { failOn: "error", limitInputPixels: 40_000_000 }).rotate();
  const normalized = await image.png().toBuffer();
  const meta = await sharp(normalized).metadata();
  const marginX = context ? Math.max(0.04, box.width) : box.width * 0.08;
  const marginY = context ? Math.max(0.04, box.height * 1.5) : box.height * 0.08;
  const left = Math.max(0, Math.floor((box.x - marginX) * meta.width!)), top = Math.max(0, Math.floor((box.y - marginY) * meta.height!));
  const right = Math.min(meta.width!, Math.ceil((box.x + box.width + marginX) * meta.width!)), bottom = Math.min(meta.height!, Math.ceil((box.y + box.height + marginY) * meta.height!));
  return sharp(normalized).extract({ left, top, width: right - left, height: bottom - top }).resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
}
