"use client";

import { Button } from "@/components/ui/button";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { RegisterReferenceAssetResult } from "@/app/[locale]/dashboard/projects/[projectId]/actions";
import { MAX_PROJECT_REFERENCE_IMAGES } from "@/lib/assets/reference-asset-constraints";
import { createClient } from "@/lib/supabase/client";
import { isSupportedProductImageType, MAX_PRODUCT_IMAGE_FILE_SIZE, productImageExtensions } from "./product-image-upload";

export function ReferenceAssetList({ projectId, userId, initialUrls, registerAsset }: { projectId: string; userId: string; initialUrls: string[]; registerAsset: (projectId: string, objectPath: string) => Promise<RegisterReferenceAssetResult> }) {
  const t = useTranslations("Dashboard.project.references");
  const inputRef = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState(initialUrls);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addReferences(files: File[]) {
    if (uploading) return;
    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      const nextUrls = [...urls];
      for (const file of files.slice(0, MAX_PROJECT_REFERENCE_IMAGES - urls.length)) {
        if (!isSupportedProductImageType(file.type) || file.size > MAX_PRODUCT_IMAGE_FILE_SIZE) {
          setError(t("invalidFile"));
          continue;
        }
        const path = `${userId}/${projectId}/reference-${crypto.randomUUID()}.${productImageExtensions[file.type]}`;
        const { error: uploadError } = await supabase.storage.from("product-assets").upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        const result = await registerAsset(projectId, path);
        if (result.status !== "success") { setError(result.status === "limit" ? t("limit") : t("uploadError")); break; }
        const { data } = await supabase.storage.from("product-assets").createSignedUrl(path, 3600);
        if (data?.signedUrl) nextUrls.push(data.signedUrl);
      }
      setUrls(nextUrls);
    } catch { setError(t("uploadError")); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  return <section className="project-control-section project-reference-direction-section" aria-labelledby="project-references-heading">
    <div className="project-control-heading"><h3 id="project-references-heading">{t("heading")}</h3><span>{urls.length}/{MAX_PROJECT_REFERENCE_IMAGES}</span></div>
    <p>{t("description")}</p>
    <div className="project-reference-list">
      {urls.length === 0 ? <span className="project-reference-empty">{t("empty")}</span> : null}
      {urls.map((url, index) => (
        // Private signed URLs intentionally bypass the public image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img key={url} src={url} alt={t("previewAlt", { index: index + 1 })} />
      ))}
      {urls.length < MAX_PROJECT_REFERENCE_IMAGES ? <Button variant="outline" size="sm" type="button" className="project-reference-add" disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? t("uploading") : t("add")}</Button> : null}
    </div>
    <input ref={inputRef} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" multiple aria-label={t("add")} onChange={(event) => void addReferences(Array.from(event.target.files ?? []))} />
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
