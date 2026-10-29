import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import { isAvifImage, prepareVideoSourceImage } from "../src/lib/video-generation/prepare-source-image";

const root = "tmp/video-source-repro";
const fixtures = [
  { name: "example1.png", width: 1070, height: 1338 },
  { name: "0RB2140__1446R5__P21__shad__qt.png", width: 720, height: 386 },
] as const;
const available = fixtures.every(fixture => existsSync(`${root}/${fixture.name}`));

test("real reported AVIF-in-PNG uploads transform to readable 16:9 PNG", { skip: !available }, async () => {
  for (const fixture of fixtures) {
    const bytes = readFileSync(`${root}/${fixture.name}`);
    assert.equal(isAvifImage(bytes), true);
    const source = await sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 }).metadata();
    assert.equal(source.format, "heif");
    assert.equal(source.pages ?? 1, 1);
    assert.equal(source.width, fixture.width);
    assert.equal(source.height, fixture.height);

    const prepared = await prepareVideoSourceImage(bytes, "16:9");
    const output = await sharp(prepared.image, { failOn: "error" }).metadata();
    assert.equal(output.format, "png");
    assert.equal(output.width, 1920);
    assert.equal(output.height, 1080);
    assert.equal(output.hasAlpha, false);
  }
});
