"use client";

import { Button } from "@/components/ui/button";

import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { ProductAssetMutationResult, RegisterProductAssetResult } from "@/app/[locale]/dashboard/projects/[projectId]/actions";
import { isProductImageMimeType, MAX_PRODUCT_IMAGE_FILE_SIZE, MAX_PROJECT_PRODUCT_IMAGES, type ProductAssetRole } from "@/lib/assets/product-asset-constraints";
import { createClient } from "@/lib/supabase/client";

export { MAX_PRODUCT_IMAGE_FILE_SIZE } from "@/lib/assets/product-asset-constraints";
export const productImageExtensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type SupportedProductImageType = keyof typeof productImageExtensions;
export type ProductImageItem = { id: string; objectPath: string; signedUrl: string; role: ProductAssetRole; sortOrder: number };

type Props = {
  projectId: string; userId: string; initialAssets: ProductImageItem[];
  registerAsset: (projectId: string, objectPath: string) => Promise<RegisterProductAssetResult>;
  deleteAsset: (projectId: string, assetId: string) => Promise<ProductAssetMutationResult>;
  setPrimary: (projectId: string, assetId: string) => Promise<ProductAssetMutationResult>;
  reorderAssets: (projectId: string, assetIds: string[]) => Promise<ProductAssetMutationResult>;
};

export function isSupportedProductImageType(fileType: string): fileType is SupportedProductImageType { return isProductImageMimeType(fileType); }

export function ProductImageUpload({ projectId, userId, initialAssets, registerAsset, deleteAsset, setPrimary, reorderAssets }: Props) {
  const t = useTranslations("Dashboard.project.upload");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState(initialAssets);
  const [isBusy, setIsBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const atLimit = assets.length >= MAX_PROJECT_PRODUCT_IMAGES;

  async function uploadFiles(files: File[]) {
    if (isBusy || atLimit || !files.length) return;
    setError(null);
    if (files.length > MAX_PROJECT_PRODUCT_IMAGES - assets.length) { setError(t("limitError")); return; }
    if (files.some((file) => !isSupportedProductImageType(file.type))) { setError(t("invalidType")); return; }
    if (files.some((file) => file.size > MAX_PRODUCT_IMAGE_FILE_SIZE)) { setError(t("tooLarge")); return; }
    setIsBusy(true);
    const added: ProductImageItem[] = [];
    try {
      const supabase = createClient();
      for (const file of files) {
        const path = `${userId}/${projectId}/${crypto.randomUUID()}.${productImageExtensions[file.type as SupportedProductImageType]}`;
        const { error: uploadError } = await supabase.storage.from("product-assets").upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        const registration = await registerAsset(projectId, path);
        if (registration.status === "limit") { setError(t("limitError")); break; }
        if (registration.status === "invalid_image") { setError(t("invalidImage")); break; }
        if (registration.status !== "success" || !registration.asset) throw new Error("metadata");
        const { data, error: signedUrlError } = await supabase.storage.from("product-assets").createSignedUrl(path, 3600);
        if (signedUrlError || !data?.signedUrl) throw signedUrlError ?? new Error("signed-url");
        added.push({ ...registration.asset, signedUrl: data.signedUrl });
      }
      if (added.length) { setAssets((current) => [...current, ...added]); router.refresh(); }
    } catch { setError(t("uploadError")); }
    finally { setIsBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  async function removeAsset(asset: ProductImageItem) {
    if (isBusy) return;
    if (assets.length <= 1) { setError(t("minimumError")); return; }
    setIsBusy(true); setError(null);
    const result = await deleteAsset(projectId, asset.id);
    if (result.status === "success") {
      setAssets((current) => current.filter(({ id }) => id !== asset.id).map((item, index) => ({ ...item, role: index === 0 ? "primary" : "supporting", sortOrder: index })));
      router.refresh();
    } else setError(result.status === "minimum" ? t("minimumError") : t("mutationError"));
    setIsBusy(false);
  }

  async function makePrimary(assetId: string) {
    if (isBusy || assets[0]?.id === assetId) return;
    setIsBusy(true); setError(null);
    const result = await setPrimary(projectId, assetId);
    if (result.status === "success") {
      setAssets((current) => { const selected = current.find((asset) => asset.id === assetId); return selected ? [selected, ...current.filter((asset) => asset.id !== assetId)].map((asset, index) => ({ ...asset, role: index === 0 ? "primary" : "supporting", sortOrder: index })) : current; });
      router.refresh();
    } else setError(t("mutationError"));
    setIsBusy(false);
  }

  async function moveSupporting(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (isBusy || index < 1 || nextIndex < 1 || nextIndex >= assets.length) return;
    const next = [...assets]; [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
    setIsBusy(true); setError(null);
    const result = await reorderAssets(projectId, next.map(({ id }) => id));
    if (result.status === "success") setAssets(next.map((asset, order) => ({ ...asset, sortOrder: order })));
    else setError(t("mutationError"));
    setIsBusy(false);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) { event.preventDefault(); setIsDragging(false); void uploadFiles(Array.from(event.dataTransfer.files)); }

  return <section aria-labelledby="product-image-heading" className="project-control-section project-product-identity-section">
    <div><h3 id="product-image-heading" className="text-base font-semibold tracking-[-0.02em] text-[var(--dashboard-foreground)]">{t("heading")}</h3><p className="mt-1 text-sm leading-6 text-[var(--dashboard-muted)]">{t("multiViewDescription")}</p><p className="text-xs leading-5 text-[var(--dashboard-muted)]">{t("multiViewRules")}</p></div>
    <div className="project-product-grid" aria-live="polite" aria-busy={isBusy}>
      {assets.map((asset, index) => <article className="project-product-card" key={asset.id}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.signedUrl} alt={t("previewAltNumbered", { index: index + 1 })} />
        <span className="project-product-role">{index === 0 ? t("primary") : t("supporting")}</span>
        <div className="project-product-actions">
          {index > 0 ? <button type="button" onClick={() => void makePrimary(asset.id)} disabled={isBusy}>{t("setPrimary")}</button> : null}
          {index > 1 ? <Button variant="icon" size="sm" type="button" aria-label={t("moveEarlier", { index: index + 1 })} onClick={() => void moveSupporting(index, -1)} disabled={isBusy}>↑</Button> : null}
          {index > 0 && index < assets.length - 1 ? <Button variant="icon" size="sm" type="button" aria-label={t("moveLater", { index: index + 1 })} onClick={() => void moveSupporting(index, 1)} disabled={isBusy}>↓</Button> : null}
          <Button variant="icon" size="sm" type="button" aria-label={t("remove", { index: index + 1 })} onClick={() => void removeAsset(asset)} disabled={isBusy || assets.length === 1}>×</Button>
        </div>
      </article>)}
      {!atLimit ? <button type="button" className={`project-product-add ${isDragging ? "is-dragging" : ""}`} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); if (!isBusy) setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} disabled={isBusy} aria-describedby="product-upload-help"><span aria-hidden="true">+</span><strong>{isBusy ? t("uploading") : t("addView")}</strong></button> : null}
    </div>
    <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={isBusy || atLimit} aria-label={t("addView")} onChange={(event: ChangeEvent<HTMLInputElement>) => void uploadFiles(Array.from(event.target.files ?? []))} />
    <div id="product-upload-help" className="flex items-center justify-between gap-3 text-xs text-[var(--dashboard-muted)]"><span>{t("helper")}</span><span>{t("count", { count: assets.length })}</span></div>
    {atLimit ? <p role="status" className="text-xs text-[var(--dashboard-muted)]">{t("limitReached")}</p> : null}
    {error ? <p role="alert" className="text-sm text-[var(--dashboard-foreground)]">{error}</p> : null}
  </section>;
}
