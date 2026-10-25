"use server";

import { createHash } from "node:crypto";
import { isSupportedLocale } from "@/i18n/routing";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { ugcProjectRepository } from "@/lib/ugc/ugc-projects";
import { resolveUgcPreparationModel } from "@/lib/ugc/ugc-model-registry";
import { canonicalUgcJson } from "@/lib/ugc/ugc-request-planner";
import { createUgcProductUploadTicket, finalizeUgcProductUpload, removeUgcProduct } from "@/lib/ugc/ugc-product-storage";
import {
  prepareUgcJobForUser,
  saveUgcDraftForUser,
  type UgcProduct,
  type UgcSafeErrorCode,
} from "@/features/ugc/ugc-studio-contract";

type ActionResult<T> = { ok: true; value: T } | { ok: false; code: UgcSafeErrorCode };
const failed = (code: UgcSafeErrorCode = "unavailable") => ({ ok: false, code }) as const;

function validLocale(locale: string) {
  return isSupportedLocale(locale);
}

export async function saveUgcProjectDraftAction(locale: string, input: unknown): Promise<ActionResult<{ id: string; updatedAt: string }>> {
  if (!validLocale(locale)) return failed("invalid_input");
  const saved = await saveUgcDraftForUser(await getAuthenticatedUserId(), input, ugcProjectRepository);
  return saved.ok ? saved : failed(saved.code);
}

export async function createUgcProductUploadAction(
  locale: string,
  projectId: string,
  contentType: string,
  byteSize: number,
): Promise<ActionResult<{ path: string; token: string }>> {
  if (!validLocale(locale)) return failed("invalid_input");
  const userId = await getAuthenticatedUserId();
  if (!userId) return failed("unauthorized");
  try {
    const result = await createUgcProductUploadTicket(userId, projectId, contentType, byteSize);
    return result.ok ? result : failed(result.code);
  } catch {
    return failed("unavailable");
  }
}

export async function completeUgcProductUploadAction(
  locale: string,
  projectId: string,
  path: string,
  originalName: string,
): Promise<ActionResult<UgcProduct>> {
  if (!validLocale(locale)) return failed("invalid_input");
  const userId = await getAuthenticatedUserId();
  if (!userId) return failed("unauthorized");
  try {
    const result = await finalizeUgcProductUpload(userId, projectId, path, originalName);
    return result.ok ? result : failed(result.code);
  } catch {
    return failed("unavailable");
  }
}

export async function removeUgcProductAction(locale: string, projectId: string): Promise<ActionResult<null>> {
  if (!validLocale(locale)) return failed("invalid_input");
  const userId = await getAuthenticatedUserId();
  if (!userId) return failed("unauthorized");
  try {
    const result = await removeUgcProduct(userId, projectId);
    return result.ok ? result : failed(result.code);
  } catch {
    return failed("unavailable");
  }
}

export async function prepareUgcVideoRequestAction(
  locale: string,
  projectId: string,
  idempotencyKey: string,
): Promise<ActionResult<{ id: string; status: "draft"; submitted: false; createdAt: string }>> {
  if (!validLocale(locale)) return failed("invalid_input");
  const result = await prepareUgcJobForUser(
    await getAuthenticatedUserId(), projectId, idempotencyKey, ugcProjectRepository,
    snapshot => createHash("sha256").update(canonicalUgcJson(snapshot)).digest("hex"),
    resolveUgcPreparationModel,
  );
  return result.ok ? result : failed(result.code);
}
