"use client";
/* eslint-disable @next/next/no-img-element -- private expiring Storage URLs */
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { createVideoSourceUploadAction, prepareVideoSourceAction } from "@/app/[locale]/dashboard/video/generation-actions";
import { loadVideoSourceLibrary } from "@/app/[locale]/dashboard/video/actions";
import { parseReferenceDeclaredText, suggestProductReferences, supportsReferenceDeclaredText } from "@/lib/video-generation/product-references";
import { additionalProductReferenceRoles, type AdditionalProductReferenceRole } from "@/lib/video-generation/product-reference-policy";
import { VideoReferenceTextInput } from "./video-reference-text-input";
import { unknownPresetProduct, type VideoPresetProduct } from "@/lib/video-director/preset-recommendations";
import type { VideoPresetId } from "@/lib/video-director/presets";
import type { VideoGenerationDraft, VideoPreparationSource } from "@/lib/video-generation/types";
import type { VideoLibraryAsset } from "./video-studio-types";
import type { WatchDialDetailIssue } from "./video-studio-state";
import styles from "./video-studio-workspace.module.css";
type Reference = NonNullable<VideoGenerationDraft["productReferences"]>[number] & { previewUrl: string };
export function VideoProductReferences({ product = unknownPresetProduct, presetId, aspectRatio, disabled, dialDetailIssue, onChange, onBusyChange }: {
  product?: VideoPresetProduct; presetId?: VideoPresetId; aspectRatio: "9:16" | "16:9" | "1:1";
  dialDetailIssue?: WatchDialDetailIssue | null;
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
  const policy = product.referencePolicy;
  const preferredRoles: AdditionalProductReferenceRole[] = policy === "watch" ? ["dial-detail", "side-profile", "other-product-view"]
    : policy === "jewelry" ? ["critical-detail"] : policy === "cosmetics" ? ["label-branding-detail"] : [];
  const suggestions = suggestProductReferences(product, presetId).map((suggestion, index) => {
    const role = preferredRoles[index];
    return { purpose: role ?? suggestion, label: role ? t(`roles.${role}`) : t(`suggestions.${suggestion}`) };
  });
  const update = (index: number, ref: Reference | null) => {
    const next = refs.map((old, i) => index === i ? ref : old); setRefs(next);
    onChange(next.filter((r): r is Reference => r !== null).map(({ source, sha256, purpose, aspectRatio, declaredText }) => {
      const text = parseReferenceDeclaredText(declaredText);
      return { source, sha256, purpose, aspectRatio, ...(text ? { declaredText: text } : {}) };
    }));
  };
  async function prepare(index: number, origin: VideoPreparationSource) {
    const result = await prepareVideoSourceAction(origin, aspectRatio);
    if (result.status !== "success") throw new Error("Reference preparation failed");
    update(index, { source: result.source, sha256: result.sourceSha256, aspectRatio: result.aspectRatio, purpose: refs[index]?.purpose ?? suggestions[index].purpose, previewUrl: result.previewUrl });
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
    <div className={styles.referenceHeading}><div><h2>{t("heading")}</h2><p className={styles.fieldDescription}>{t(policy === "watch" ? "watchDescription" : "description")}</p></div>
      <span className={styles.referenceCount}>{refs.filter(Boolean).length}/3</span></div>
    {policy ? <div className={styles.referenceGuidance} role="status">
      <p><strong>{t(`policy.${policy}.heading`)}</strong> {t(`policy.${policy}.helper`)}</p>
      {policy === "watch" ? <p><strong>{t("policy.watch.sideHeading")}</strong> {t("policy.watch.sideHelper")}</p> : null}
    </div> : null}
    {policy === "watch" && dialDetailIssue ? <p className={styles.referenceWarning}>
      {t(dialDetailIssue === "rejected" ? "dialRejected" : "dialRequired")}
    </p> : null}
    <div className={styles.referenceGrid}>
    {suggestions.map(({ label, purpose }, index) => {
      const reference = refs[index];
      const activeRole = additionalProductReferenceRoles.find(role => role === reference?.purpose);
      const title = activeRole ? t(`roles.${activeRole}`) : reference && policy === "watch" ? t("suggestedRole") : label;
      const required = policy === "watch" && (reference?.purpose ?? purpose) === "dial-detail";
      return <article key={index} className={styles.referenceCard} aria-label={title} aria-busy={busy} data-required={required || undefined}>
      <div className={styles.referenceCardHeading}><span className={styles.referenceIcon} aria-hidden="true">✦</span>
        <div><h3>{title}</h3>{policy === "watch" ? <p>{t(required ? "required" : "optional")}</p>
          : !activeRole && preferredRoles[index] === undefined ? <p>{t("conditional")}</p> : null}</div></div>
      {reference ? <div className={styles.referencePreview}><img src={reference.previewUrl} width={72} height={72} alt={t("preview")} /><span>{t("added")}</span></div>
        : <button type="button" className={styles.referenceDropzone} disabled={busy || disabled} onClick={() => inputRefs.current[index]?.click()}
          aria-label={t("uploadFor", { type: label })}><span aria-hidden="true">↑</span><strong>{t("upload")}</strong><small>{t("fileHint")}</small></button>}
      {reference ? <>
        <label className={styles.referenceRole}>{t("role")}
          <select value={reference.purpose} disabled={busy || disabled} onChange={event => {
            const purpose = event.currentTarget.value;
            update(index, { ...reference, purpose, declaredText: supportsReferenceDeclaredText(purpose) ? reference.declaredText : undefined });
          }}>
            {!activeRole ? <option value={reference.purpose}>{t("suggestedRole")}</option> : null}
            {additionalProductReferenceRoles.map(role => <option key={role} value={role}>
              {policy === "watch" && role === "dial-detail" ? t("policy.watch.heading") : t(`roles.${role}`)}
            </option>)}
          </select>
        </label>
        <VideoReferenceTextInput key={reference.purpose} purpose={reference.purpose} value={reference.declaredText ?? ""}
          disabled={busy || disabled} onChange={declaredText => update(index, { ...reference, declaredText })} />
      </> : null}
      <input ref={node => { inputRefs.current[index] = node; }} className={styles.referenceFileInput} type="file" accept="image/jpeg,image/png"
        aria-label={t("uploadFor", { type: title })} onChange={handleFile(index)} tabIndex={-1} />
      <div className={styles.referenceActions}>
        {refs[index] ? <Button variant="secondary" size="sm" disabled={busy || disabled} onClick={() => inputRefs.current[index]?.click()}>{t("replace")}</Button> : null}
        <Button variant="ghost" size="sm" disabled={busy || disabled} onClick={async () => { setSlot(index); setBusy(true); setError(false);
          try { const result = await loadVideoSourceLibrary(); setLibrary(result.status === "success" ? result.assets : []); }
          catch { setError(true); } finally { setBusy(false); } }}>{t("library")}</Button>
        {refs[index] ? <Button variant="ghost" size="sm" disabled={busy || disabled} onClick={() => update(index, null)}>{t("remove")}</Button> : null}
      </div>
    </article>;
    })}
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
