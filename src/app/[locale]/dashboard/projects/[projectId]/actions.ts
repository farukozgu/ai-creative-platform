"use server";

import { revalidatePath } from "next/cache";

import { isSupportedLocale, type AppLocale } from "@/i18n/routing";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import {
  getProjectReferenceAssets,
  isReferenceImageMimeType,
  MAX_PROJECT_REFERENCE_IMAGES,
} from "@/lib/assets/reference-assets";
import {
  canAddProductImages,
  isProductImageMimeType,
  MAX_PRODUCT_IMAGE_FILE_SIZE,
  MAX_PROJECT_PRODUCT_IMAGES,
  nextProductAssetRole,
  type ProductAssetRole,
} from "@/lib/assets/product-asset-constraints";
import { getProjectProductAssets } from "@/lib/assets/product-assets";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { assertImageInputDecodable, getDecodedImageMimeType, getImageInputDecodeDiagnostic } from "@/lib/generation/providers/normalize-image-input";

export type RegisterProductAssetResult = {
  status: "error" | "invalid_image" | "limit" | "success";
  asset?: { id: string; objectPath: string; role: ProductAssetRole; sortOrder: number };
};

export type ProductAssetMutationResult = { status: "error" | "minimum" | "success" };

export type RegisterReferenceAssetResult = {
  status: "error" | "limit" | "success";
};

export type UpdateCreativeDirectionState = {
  status: "error" | "idle" | "success" | "validation";
};

export type RenameProjectState = { status: "idle" | "error" | "success" | "validation" };


const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const supportedReferenceFilePattern = /^reference-[0-9a-f-]{36}\.(jpg|png|webp)$/i;
const supportedProductFilePattern = /^[0-9a-f-]{36}\.(jpg|png|webp)$/i;

export async function renameProject(locale: AppLocale, projectId: string, _previousState: RenameProjectState, formData: FormData): Promise<RenameProjectState> {
  if (!isSupportedLocale(locale) || !uuidPattern.test(projectId)) return { status: "error" };
  const title = formData.get("title");
  if (typeof title !== "string" || Array.from(title.trim()).length > 120) return { status: "validation" };
  const userId = await getAuthenticatedUserId();
  if (!userId) return { status: "error" };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("projects").update({ title: title.trim() || "İsimsiz Proje" }).eq("id", projectId).eq("user_id", userId).select("id").maybeSingle();
    if (error || !data) return { status: "error" };
  } catch { return { status: "error" }; }
  revalidatePath(`/${locale}/dashboard/projects/${projectId}`, "page");
  revalidatePath(`/${locale}/dashboard/projects`, "page");
  revalidatePath(`/${locale}/dashboard`, "page");
  return { status: "success" };
}

function hasValidObjectPath(userId: string, projectId: string, objectPath: string) {
  const segments = objectPath.split("/");

  return (
    segments.length === 3 &&
    segments[0] === userId &&
    segments[1] === projectId &&
    segments[2].length > 0
  );
}


export async function registerProductAsset(
  locale: AppLocale,
  projectId: unknown,
  objectPath: unknown,
): Promise<RegisterProductAssetResult> {
  if (
    !isSupportedLocale(locale) ||
    typeof projectId !== "string" ||
    typeof objectPath !== "string"
  ) {
    return { status: "error" };
  }

  const userId = await getAuthenticatedUserId();
  if (!userId || !hasValidObjectPath(userId, projectId, objectPath)) {
    return { status: "error" };
  }

  let registeredAsset: NonNullable<RegisterProductAssetResult["asset"]> | null = null;
  try {
    const supabase = await createClient();
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (projectError || !project) {
      return { status: "error" };
    }

    if (!supportedProductFilePattern.test(objectPath.split("/")[2] ?? "")) return { status: "error" };

    const existingAssets = await getProjectProductAssets(userId, projectId);
    if (!canAddProductImages(existingAssets.length)) return { status: "limit" };

    const admin = getSupabaseAdminClient();
    const { data: uploadedImage, error: downloadError } = await admin.storage.from("product-assets").download(objectPath);
    if (
      downloadError ||
      !uploadedImage ||
      !isProductImageMimeType(uploadedImage.type) ||
      uploadedImage.size > MAX_PRODUCT_IMAGE_FILE_SIZE
    ) {
      await admin.storage.from("product-assets").remove([objectPath]);
      return { status: "error" };
    }
    try {
      await assertImageInputDecodable(Buffer.from(await uploadedImage.arrayBuffer()));
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[product-asset] image_decode_rejected", getImageInputDecodeDiagnostic(error));
      }
      await admin.storage.from("product-assets").remove([objectPath]);
      return { status: "invalid_image" };
    }

    const role = nextProductAssetRole(existingAssets.length);
    const sortOrder = existingAssets.length;
    const { data: asset, error: assetError } = await admin.from("assets").insert({
      user_id: userId,
      project_id: projectId,
      bucket_id: "product-assets",
      object_path: objectPath,
      asset_type: "product",
      product_role: role,
      sort_order: sortOrder,
    }).select("id, product_role, sort_order").single();

    if (assetError || !asset || (asset.product_role !== "primary" && asset.product_role !== "supporting") || !Number.isInteger(asset.sort_order)) {
      await admin.storage.from("product-assets").remove([objectPath]);
      return { status: existingAssets.length >= MAX_PROJECT_PRODUCT_IMAGES ? "limit" : "error" };
    }

    // The primary image owns the canonical ProductProfile. Supporting views are
    // retained as identity evidence for generation and validation without a
    // second full Product Understanding request.
    // The database trigger serializes concurrent registrations and can change
    // the optimistic role computed above. Only the persisted primary owns the
    // canonical profile and its one Product Understanding call.
    if (asset.product_role === "primary") {
      const [{ analyzeProductAsset }, { triggerProductAnalysisAfterRegistration }] = await Promise.all([
        import("@/lib/product-understanding/analyze-product-asset"),
        import("@/lib/product-understanding/product-analysis-trigger"),
      ]);
      await triggerProductAnalysisAfterRegistration({ assetId: asset.id, projectId, userId }, analyzeProductAsset);
    }
    registeredAsset = { id: asset.id, objectPath, role: asset.product_role, sortOrder: asset.sort_order };
  } catch {
    return { status: "error" };
  }

  revalidatePath(`/${locale}/dashboard/projects/${projectId}`, "page");

  return registeredAsset ? { status: "success", asset: registeredAsset } : { status: "error" };
}

export async function deleteProductAsset(
  locale: AppLocale,
  projectId: unknown,
  assetId: unknown,
): Promise<ProductAssetMutationResult> {
  if (!isSupportedLocale(locale) || typeof projectId !== "string" || typeof assetId !== "string" || !uuidPattern.test(assetId)) return { status: "error" };
  const userId = await getAuthenticatedUserId();
  if (!userId) return { status: "error" };
  try {
    const assets = await getProjectProductAssets(userId, projectId);
    const target = assets.find((asset) => asset.id === assetId);
    if (!target) return { status: "error" };
    if (assets.length <= 1) return { status: "minimum" };
    const supabase = await createClient();
    const { data: removedPath, error } = await supabase.rpc("delete_project_product_asset", { p_asset_id: assetId });
    if (error || removedPath !== target.object_path) return { status: "error" };
    await getSupabaseAdminClient().storage.from("product-assets").remove([target.object_path]);
  } catch { return { status: "error" }; }
  revalidatePath(`/${locale}/dashboard/projects/${projectId}`, "page");
  return { status: "success" };
}

export async function setPrimaryProductAsset(
  locale: AppLocale,
  projectId: unknown,
  assetId: unknown,
): Promise<ProductAssetMutationResult> {
  if (!isSupportedLocale(locale) || typeof projectId !== "string" || typeof assetId !== "string" || !uuidPattern.test(assetId)) return { status: "error" };
  const userId = await getAuthenticatedUserId();
  if (!userId) return { status: "error" };
  try {
    const assets = await getProjectProductAssets(userId, projectId);
    if (!assets.some((asset) => asset.id === assetId)) return { status: "error" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_project_product_primary", { p_asset_id: assetId });
    if (error) return { status: "error" };
  } catch { return { status: "error" }; }
  revalidatePath(`/${locale}/dashboard/projects/${projectId}`, "page");
  return { status: "success" };
}

export async function reorderProductAssets(
  locale: AppLocale,
  projectId: unknown,
  assetIds: unknown,
): Promise<ProductAssetMutationResult> {
  if (!isSupportedLocale(locale) || typeof projectId !== "string" || !Array.isArray(assetIds) || assetIds.some((id) => typeof id !== "string" || !uuidPattern.test(id))) return { status: "error" };
  const userId = await getAuthenticatedUserId();
  if (!userId) return { status: "error" };
  try {
    const current = await getProjectProductAssets(userId, projectId);
    if (current.length !== assetIds.length || new Set(assetIds).size !== current.length || assetIds.some((id) => !current.some((asset) => asset.id === id))) return { status: "error" };
    const primaryId = current.find((asset) => asset.product_role === "primary")?.id;
    if (assetIds[0] !== primaryId) return { status: "error" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("reorder_project_product_assets", { p_project_id: projectId, p_asset_ids: assetIds });
    if (error) return { status: "error" };
  } catch { return { status: "error" }; }
  revalidatePath(`/${locale}/dashboard/projects/${projectId}`, "page");
  return { status: "success" };
}

export async function reanalyzeProductAsset(assetId: unknown): Promise<import("@/lib/product-understanding/product-reanalysis-admission").ManualProductReanalysisResult> {
  if (typeof assetId !== "string" || !uuidPattern.test(assetId)) {
    return { status: "failed", reason: "asset_not_found" };
  }
  const userId = await getAuthenticatedUserId();
  if (!userId) return { status: "failed", reason: "asset_not_found" };
  const [{ analyzeProductAsset }, { supabaseProductReanalysisAdmissionGateway }, { runManualProductReanalysis }] = await Promise.all([
    import("@/lib/product-understanding/analyze-product-asset"),
    import("@/lib/product-understanding/product-reanalysis-admission"),
    import("@/lib/product-understanding/product-reanalysis-service"),
  ]);
  return runManualProductReanalysis({ assetId, ownerId: userId }, {
    analyze: analyzeProductAsset,
    gateway: supabaseProductReanalysisAdmissionGateway,
  });
}

export async function registerReferenceAsset(
  locale: AppLocale,
  projectId: unknown,
  objectPath: unknown,
): Promise<RegisterReferenceAssetResult> {
  if (!isSupportedLocale(locale) || typeof projectId !== "string" || typeof objectPath !== "string") {
    return { status: "error" };
  }

  const userId = await getAuthenticatedUserId();
  if (
    !userId ||
    !hasValidObjectPath(userId, projectId, objectPath) ||
    !supportedReferenceFilePattern.test(objectPath.split("/")[2] ?? "")
  ) {
    return { status: "error" };
  }

  try {
    const supabase = await createClient();
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (projectError || !project) return { status: "error" };

    const existingReferences = await getProjectReferenceAssets(userId, projectId);
    if (existingReferences.length >= MAX_PROJECT_REFERENCE_IMAGES) return { status: "limit" };

    const admin = getSupabaseAdminClient();
    const { data: referenceImage, error: downloadError } = await admin.storage
      .from("product-assets")
      .download(objectPath);
    if (downloadError || !referenceImage || !isReferenceImageMimeType(referenceImage.type)) {
      return { status: "error" };
    }
    if (referenceImage.size > 20 * 1024 * 1024) return { status: "error" };
    const decodedMimeType = await getDecodedImageMimeType(Buffer.from(await referenceImage.arrayBuffer()));
    if (decodedMimeType !== referenceImage.type) return { status: "error" };

    const { error: assetError } = await admin.from("assets").insert({
      user_id: userId,
      project_id: projectId,
      bucket_id: "product-assets",
      object_path: objectPath,
      asset_type: "reference_image",
    });
    if (assetError) return { status: "error" };
  } catch {
    return { status: "error" };
  }

  revalidatePath(`/${locale}/dashboard/projects/${projectId}`, "page");
  return { status: "success" };
}

export async function updateCreativeDirection(
  locale: AppLocale,
  projectId: string,
  _previousState: UpdateCreativeDirectionState,
  formData: FormData,
): Promise<UpdateCreativeDirectionState> {
  if (!isSupportedLocale(locale) || typeof projectId !== "string") {
    return { status: "error" };
  }

  const creativeDirection = formData.get("creative_direction");
  if (typeof creativeDirection !== "string") {
    return { status: "error" };
  }

  const normalizedCreativeDirection = creativeDirection.trim();
  if (Array.from(normalizedCreativeDirection).length > 4000) {
    return { status: "validation" };
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return { status: "error" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("projects")
      .update({
        creative_direction: normalizedCreativeDirection || null,
      })
      .eq("id", projectId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return { status: "error" };
    }
  } catch {
    return { status: "error" };
  }

  revalidatePath(`/${locale}/dashboard/projects/${projectId}`, "page");

  return { status: "success" };
}
