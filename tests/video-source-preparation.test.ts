import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { getSafeVideoImageTransformDiagnostic, prepareVideoSourceImage, videoSourceFrameSizes } from "../src/lib/video-generation/prepare-source-image";

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

test("preparation rejects corrupt data, oversized files and decompression bombs", async () => {
  await assert.rejects(prepareVideoSourceImage(Buffer.from("broken"), "9:16"));
  await assert.rejects(prepareVideoSourceImage(Buffer.alloc(25 * 1024 * 1024 + 1), "9:16"));
  const webp = await sharp({ create: { width: 500, height: 500, channels: 3, background: "white" } }).webp().toBuffer();
  const webpFrame = await prepareVideoSourceImage(webp, "1:1");
  assert.equal((await sharp(webpFrame.image).metadata()).format, "png");
  const pixels = await sharp({ create: { width: 8000, height: 6000, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(prepareVideoSourceImage(pixels, "1:1"));
});

test("PNG, JPEG, and WebP are normalized without cropping in portrait, landscape, and square sizes", async () => {
  const sources = [
    await sharp({ create: { width: 180, height: 320, channels: 4, background: { r: 20, g: 80, b: 160, alpha: 0.7 } } }).png().toBuffer(),
    await sharp({ create: { width: 640, height: 360, channels: 3, background: { r: 170, g: 110, b: 40 } } }).jpeg().toBuffer(),
    await sharp({ create: { width: 420, height: 420, channels: 3, background: { r: 40, g: 140, b: 90 } } }).webp().toBuffer(),
  ];
  for (const source of sources) for (const ratio of ["16:9", "9:16", "1:1"] as const) {
    const result = await prepareVideoSourceImage(source, ratio);
    assert.deepEqual({ width: result.width, height: result.height }, videoSourceFrameSizes[ratio]);
    const metadata = await sharp(result.image).metadata();
    assert.equal(metadata.format, "png");
    assert.equal(metadata.hasAlpha, false);
  }
});

test("reported shoe and glasses PNG dimensions prepare for landscape output", async () => {
  for (const [width, height] of [[1070, 1338], [720, 386]] as const) {
    const source = await sharp({ create: { width, height, channels: 4, background: { r: 90, g: 30, b: 20, alpha: 1 } } }).png().toBuffer();
    const result = await prepareVideoSourceImage(source, "16:9");
    const metadata = await sharp(result.image).metadata();
    assert.equal(metadata.format, "png");
    assert.equal(metadata.width, 1920);
    assert.equal(metadata.height, 1080);
    assert.equal(metadata.hasAlpha, false);
  }
});

test("invalid image data reports a safe metadata transform diagnostic", async () => {
  await assert.rejects(prepareVideoSourceImage(Buffer.from("not an image"), "16:9"), error => {
    const diagnostic = getSafeVideoImageTransformDiagnostic(error);
    assert.deepEqual(diagnostic, { step: "metadata", sharpFormat: null, pageCount: null, rejectionReason: "metadata_error", inputMimeType: null,
      width: null, height: null, targetAspectRatio: "16:9", sharpCode: null });
    return true;
  });
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
