"use client";
/* eslint-disable @next/next/no-img-element -- private expiring Storage URLs */
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { createVideoSourceUploadAction, prepareVideoSourceAction } from "@/app/[locale]/dashboard/video/generation-actions";
import { loadVideoSourceLibrary } from "@/app/[locale]/dashboard/video/actions";
import { suggestProductReferences } from "@/lib/video-generation/product-references";
import type { VideoPresetProduct } from "@/lib/video-director/preset-recommendations";
import type { VideoPresetId } from "@/lib/video-director/presets";
import type { VideoGenerationDraft, VideoPreparationSource } from "@/lib/video-generation/types";
import type { VideoLibraryAsset } from "./video-studio-types";
import styles from "./video-studio-workspace.module.css";
type Reference = NonNullable<VideoGenerationDraft["productReferences"]>[number] & { previewUrl: string };
export function VideoProductReferences({ product, presetId, aspectRatio, disabled, onChange, onBusyChange }: {
  sourceKey: string; product: VideoPresetProduct; presetId: VideoPresetId; aspectRatio: "9:16" | "16:9" | "1:1";
  disabled: boolean; onChange: (refs: NonNullable<VideoGenerationDraft["productReferences"]>) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const t = useTranslations("Dashboard.videoStudio.references");
  const [refs, setRefs] = useState<(Reference | null)[]>([null, null, null]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);
  const [library, setLibrary] = useState<VideoLibraryAsset[] | null>(null);
  const [slot, setSlot] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const lock = useRef(false);
  const suggestions = suggestProductReferences(product, presetId);
  const update = (index: number, ref: Reference | null) => {
    const next = refs.map((old, i) => index === i ? ref : old); setRefs(next);
    onChange(next.filter((r): r is Reference => r !== null).map(({ source, sha256, purpose, aspectRatio }) => ({ source, sha256, purpose, aspectRatio })));
  };
  async function prepare(index: number, origin: VideoPreparationSource) {
    const result = await prepareVideoSourceAction(origin, aspectRatio);
    if (result.status !== "success") throw new Error("Reference preparation failed");
    update(index, { source: result.source, sha256: result.sourceSha256, aspectRatio: result.aspectRatio, purpose: suggestions[index] ?? "detail", previewUrl: result.previewUrl });
  }
  async function upload(index: number, file: File) {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(true); setError(false);
    try {
      if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Invalid image");
      const ticket = await createVideoSourceUploadAction(file.name);
      if (ticket.status !== "success") throw new Error("Upload unavailable");
      const uploaded = await createClient().storage.from("video-source-images").uploadToSignedUrl(ticket.objectPath, ticket.token, file, { contentType: file.type });
      if (uploaded.error) throw uploaded.error;
      await prepare(index, { kind: "upload", sourceAssetId: ticket.sourceAssetId, objectPath: ticket.objectPath });
    } catch { setError(true); } finally { lock.current = false; setBusy(false); }
  }
  const handleFile = (index: number) => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void upload(index, file);
  };
  return <section className={styles.controlSection} aria-busy={busy}>
    <div className={styles.referenceHeading}><div><h2>{t("heading")}</h2><p className={styles.fieldDescription}>{t("description")}</p></div>
      <span className={styles.referenceCount}>{refs.filter(Boolean).length}/3</span></div>
    <div className={styles.referenceGrid}>
    {suggestions.map((suggestion, index) => <article key={suggestion} className={styles.referenceCard} aria-busy={busy}>
      <div className={styles.referenceCardHeading}><span className={styles.referenceIcon} aria-hidden="true">✦</span>
        <div><h3>{t("suggestions." + suggestion)}</h3><p>{t("conditional")}</p></div></div>
      {refs[index] ? <div className={styles.referencePreview}><img src={refs[index]!.previewUrl} width={72} height={72} alt={t("preview")} /><span>{t("added")}</span></div>
        : <button type="button" className={styles.referenceDropzone} disabled={busy || disabled} onClick={() => inputRefs.current[index]?.click()}
          aria-label={t("uploadFor", { type: t("suggestions." + suggestion) })}><span aria-hidden="true">↑</span><strong>{t("upload")}</strong><small>{t("fileHint")}</small></button>}
      <input ref={node => { inputRefs.current[index] = node; }} className={styles.referenceFileInput} type="file" accept="image/jpeg,image/png"
        aria-label={t("uploadFor", { type: t("suggestions." + suggestion) })} onChange={handleFile(index)} tabIndex={-1} />
      <div className={styles.referenceActions}>
        {refs[index] ? <Button variant="secondary" size="sm" disabled={busy || disabled} onClick={() => inputRefs.current[index]?.click()}>{t("replace")}</Button> : null}
        <Button variant="ghost" size="sm" disabled={busy || disabled} onClick={async () => { setSlot(index); setBusy(true); setError(false);
          try { const result = await loadVideoSourceLibrary(); setLibrary(result.status === "success" ? result.assets : []); }
          catch { setError(true); } finally { setBusy(false); } }}>{t("library")}</Button>
        {refs[index] ? <Button variant="ghost" size="sm" disabled={busy || disabled} onClick={() => update(index, null)}>{t("remove")}</Button> : null}
      </div>
    </article>)}
    </div>
    {library ? <div className={styles.referenceLibrary} role="group" aria-label={t("library")}>
      <p>{library.length ? t("libraryPrompt") : t("libraryEmpty")}</p>
      {library.map(asset => <Button key={asset.id} variant="ghost" disabled={busy || disabled} onClick={async () => {
        if (lock.current) return; lock.current = true; setBusy(true);
        try { await prepare(slot, { kind: "generated-image", generationId: asset.generationId }); setLibrary(null); }
        catch { setError(true); } finally { lock.current = false; setBusy(false); }
      }}><img src={asset.previewUrl} width={56} height={56} alt={t("preview")} /></Button>)}
      <Button variant="ghost" disabled={busy} onClick={() => setLibrary(null)}>{t("close")}</Button>
    </div> : null}
    <p className={error ? styles.referenceError : styles.referenceStatus} role={error ? "alert" : "status"}>{busy ? t("loading") : error ? t("error") : t("analysisNotice")}</p>
  </section>;
}
