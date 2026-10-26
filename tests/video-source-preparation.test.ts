import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { prepareVideoSourceImage, videoSourceFrameSizes } from "../src/lib/video-generation/prepare-source-image";

async function jacketSizeFixture() {
  const tile = (r: number, g: number, b: number, width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r, g, b } } }).png().toBuffer();
  const input = await sharp({ create: { width: 2400, height: 3600, channels: 3, background: { r: 238, g: 232, b: 220 } } }).composite([
    { input: await tile(180, 20, 180, 1200, 1800), left: 600, top: 900 },
    { input: await tile(255, 0, 0, 100, 100), left: 0, top: 0 },
    { input: await tile(0, 255, 0, 100, 100), left: 2300, top: 0 },
    { input: await tile(0, 0, 255, 100, 100), left: 0, top: 3500 },
    { input: await tile(0, 0, 0, 100, 100), left: 2300, top: 3500 },
  ]).jpeg({ quality: 100, chromaSubsampling: "4:4:4" }).toBuffer();
  return input;
}

for (const ratio of ["9:16", "16:9", "1:1"] as const) test(`2400×3600 JPEG becomes ${ratio} without cropping or stretching the product`, async () => {
  const input = await jacketSizeFixture();
  const hash = createHash("sha256").update(input).digest("hex");
  const frame = await prepareVideoSourceImage(input, ratio);
  const { data, info } = await sharp(frame.image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual({ width: info.width, height: info.height }, videoSourceFrameSizes[ratio]);
  const colours = [0, 0, 0, 0];
  const product = { left: Infinity, top: Infinity, right: -1, bottom: -1 };
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * info.channels;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (r > 230 && g < 25 && b < 25) colours[0]++;
    if (g > 230 && r < 25 && b < 25) colours[1]++;
    if (b > 230 && r < 25 && g < 25) colours[2]++;
    if (r < 25 && g < 25 && b < 25) colours[3]++;
    if (r > 150 && r < 205 && g < 45 && b > 150 && b < 205) {
      product.left = Math.min(product.left, x); product.right = Math.max(product.right, x);
      product.top = Math.min(product.top, y); product.bottom = Math.max(product.bottom, y);
    }
  }
  assert.ok(colours.every(count => count > 100), "all four original corners survive");
  assert.ok(Math.abs((product.right - product.left + 1) / (product.bottom - product.top + 1) - 2 / 3) < 0.01, "product proportions survive");
  assert.equal(createHash("sha256").update(input).digest("hex"), hash, "original bytes unchanged");
  assert.equal((await sharp(frame.image).metadata()).format, "png");
  assert.ok(frame.image.length < 25 * 1024 * 1024);
});

test("preparation rejects unsupported formats, corrupt data, oversized files and decompression bombs", async () => {
  await assert.rejects(prepareVideoSourceImage(Buffer.from("broken"), "9:16"));
  await assert.rejects(prepareVideoSourceImage(Buffer.alloc(25 * 1024 * 1024 + 1), "9:16"));
  const webp = await sharp({ create: { width: 500, height: 500, channels: 3, background: "white" } }).webp().toBuffer();
  await assert.rejects(prepareVideoSourceImage(webp, "1:1"));
  const pixels = await sharp({ create: { width: 8000, height: 6000, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(prepareVideoSourceImage(pixels, "1:1"));
});

test("transparent PNG and EXIF-oriented JPEG are normalized to an opaque safe frame", async () => {
  const png = await sharp({ create: { width: 300, height: 450, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const jpeg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "white" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  for (const input of [png, jpeg]) {
    const result = await prepareVideoSourceImage(input, "9:16");
    const metadata = await sharp(result.image).metadata();
    assert.equal(metadata.width, 1080); assert.equal(metadata.height, 1920);
    assert.equal(metadata.orientation, undefined); assert.equal(metadata.hasAlpha, false);
  }
});
