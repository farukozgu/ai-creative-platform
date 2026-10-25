import assert from "node:assert/strict";
import test from "node:test";
import { authorizeImageDownload, type DownloadableImage, type ImageDownloadRepository } from "../src/lib/generations/image-download";

const user = "10000000-0000-4000-8000-000000000001";
const project = "20000000-0000-4000-8000-000000000001";
const generation = "30000000-0000-4000-8000-000000000001";
const origin = "https://test.supabase.co";
const record: DownloadableImage = { id: generation, projectId: project, ownerId: user, type: "image", status: "succeeded",
  bucket: "generated-assets", path: `${user}/${project}/${generation}.png`, mimeType: "image/png" };

function repository(image: DownloadableImage | null = record, overrideUrl?: string) {
  let reads = 0, signs = 0;
  const repo: ImageDownloadRepository = {
    async findOwned(owner, id) { reads++; assert.equal(owner, user); assert.equal(id, generation); return image; },
    async sign(path, expiry, name) {
      signs++; assert.equal(expiry, 60); assert.equal(path, record.path); assert.equal(name, `klay-${generation}.png`);
      return overrideUrl ?? `${origin}/storage/v1/object/sign/generated-assets/${path}?token=ephemeral&download=${name}`;
    },
  };
  return { repo, reads: () => reads, signs: () => signs };
}

test("download requires authentication and a valid ID before any storage lookup", async () => {
  const h = repository();
  for (const [owner, id] of [[null, generation], [user, "invalid"], ["invalid", generation]] as const) {
    assert.deepEqual(await authorizeImageDownload(owner, id, h.repo, origin), { ok: false });
  }
  assert.equal(h.reads(), 0); assert.equal(h.signs(), 0);
});

test("foreign, unfinished, non-image, wrong bucket and forged output paths never get signed", async () => {
  for (const patch of [null, { ownerId: project }, { status: "processing" }, { type: "video" },
    { bucket: "product-assets" }, { mimeType: "image/svg+xml" }, { path: `${project}/${user}/${generation}.png` },
    { path: `../${record.path}` }, { id: project }, { projectId: "invalid" }]) {
    const h = repository(patch === null ? null : { ...record, ...patch });
    assert.deepEqual(await authorizeImageDownload(user, generation, h.repo, origin), { ok: false });
    assert.equal(h.signs(), 0);
  }
});

test("each click reauthorizes and creates a fresh short-lived named download without a preview URL", async () => {
  const h = repository();
  for (let click = 0; click < 2; click++) {
    const result = await authorizeImageDownload(user, generation, h.repo, origin);
    assert.ok(result.ok);
    assert.equal(result.fileName, `klay-${generation}.png`);
    assert.equal(new URL(result.url).searchParams.get("download"), result.fileName);
  }
  assert.equal(h.signs(), 2); assert.equal(h.reads(), 2);
});

test("download denies unsafe signing responses and catches storage outages", async () => {
  for (const url of ["https://evil.invalid/output.png", `${origin}/storage/v1/object/sign/generated-assets/${record.path}?token=x`,
    `http://test.supabase.co/storage/v1/object/sign/generated-assets/${record.path}?token=x&download=klay-${generation}.png`]) {
    assert.deepEqual(await authorizeImageDownload(user, generation, repository(record, url).repo, origin), { ok: false });
  }
  const h = repository();
  h.repo.sign = async () => { throw new Error("storage offline"); };
  assert.deepEqual(await authorizeImageDownload(user, generation, h.repo, origin), { ok: false });
});
