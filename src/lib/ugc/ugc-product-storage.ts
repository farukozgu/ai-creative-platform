import "server-only";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { ugcProjectRepository } from "@/lib/ugc/ugc-projects";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UgcResult, UgcProduct, UgcOwnedProject } from "@/features/ugc/ugc-studio-contract";

const bucket = "ugc-product-assets";
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sanitizeUgcFileName(value: string) {
  return value.replace(/[\\/\u0000-\u001f\u007f]/g, "_").trim().slice(0, 255) || "product-image";
}

export async function createUgcProductUploadTicket(
  ownerId: string,
  projectId: string,
  contentType: string,
  byteSize: number,
): Promise<UgcResult<{ path: string; token: string }>> {
  if (!uuidPattern.test(projectId) || !allowedTypes.has(contentType) || !Number.isInteger(byteSize) || byteSize < 1 || byteSize > 10 * 1024 * 1024) {
    return { ok: false, code: "invalid_input" };
  }
  if (!(await ugcProjectRepository.getOwned(ownerId, projectId))) return { ok: false, code: "not_found" };
  const extension = contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
  const path = `${ownerId}/${projectId}/${randomUUID()}.${extension}`;
  const { data, error } = await getSupabaseAdminClient().storage.from(bucket).createSignedUploadUrl(path, { upsert: false });
  if (error || !data) return { ok: false, code: "unavailable" };
  return { ok: true, value: { path, token: data.token } };
}

export async function finalizeUgcProductUpload(
  ownerId: string,
  projectId: string,
  uploadPath: string,
  originalName: string,
): Promise<UgcResult<UgcProduct>> {
  const owned = await ugcProjectRepository.getOwned(ownerId, projectId);
  if (!owned) return { ok: false, code: "not_found" };
  const [pathOwner, pathProject, objectName, extra] = uploadPath.split("/");
  if (pathOwner !== ownerId || pathProject !== projectId || extra !== undefined
    || !/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(objectName ?? "")) {
    return { ok: false, code: "invalid_input" };
  }

  const admin = getSupabaseAdminClient();
  const { data: source, error: downloadError } = await admin.storage.from(bucket).download(uploadPath);
  if (downloadError || !source || source.size < 1 || source.size > 10 * 1024 * 1024 || !allowedTypes.has(source.type)) {
    await admin.storage.from(bucket).remove([uploadPath]);
    return { ok: false, code: "invalid_input" };
  }

  let normalized: Buffer;
  try {
    normalized = await sharp(Buffer.from(await source.arrayBuffer()), { failOn: "error", limitInputPixels: 40_000_000 })
      .rotate().resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 }).toBuffer();
  } catch {
    await admin.storage.from(bucket).remove([uploadPath]);
    return { ok: false, code: "invalid_input" };
  }

  const finalPath = `${ownerId}/${projectId}/${randomUUID()}.webp`;
  const { error: storeError } = await admin.storage.from(bucket).upload(finalPath, normalized, {
    contentType: "image/webp", cacheControl: "3600", upsert: false,
  });
  if (storeError) {
    await admin.storage.from(bucket).remove([uploadPath]);
    return { ok: false, code: "unavailable" };
  }

  const product: NonNullable<UgcOwnedProject["product"]> = {
    fileName: sanitizeUgcFileName(originalName), contentType: "image/webp", byteSize: normalized.byteLength, objectPath: finalPath,
  };
  const saved = await ugcProjectRepository.setOwnedProduct(ownerId, projectId, product);
  await admin.storage.from(bucket).remove([uploadPath]);
  if (!saved) {
    await admin.storage.from(bucket).remove([finalPath]);
    return { ok: false, code: "not_found" };
  }

  const signed = await admin.storage.from(bucket).createSignedUrl(finalPath, 900);
  if (signed.error) return { ok: false, code: "unavailable" };
  if (owned.product && owned.product.objectPath !== finalPath) {
    await admin.storage.from(bucket).remove([owned.product.objectPath]);
  }
  return { ok: true, value: { ...product, previewUrl: signed.data.signedUrl } };
}

export async function removeUgcProduct(ownerId: string, projectId: string): Promise<UgcResult<null>> {
  const project = await ugcProjectRepository.getOwned(ownerId, projectId);
  if (!project) return { ok: false, code: "not_found" };
  if (!project.product) return { ok: true, value: null };
  const saved = await ugcProjectRepository.setOwnedProduct(ownerId, projectId, null);
  if (!saved) return { ok: false, code: "not_found" };
  await getSupabaseAdminClient().storage.from(bucket).remove([project.product.objectPath]);
  return { ok: true, value: null };
}
