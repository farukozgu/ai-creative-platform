"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { prepareVideoDirectorAction } from "@/app/[locale]/dashboard/video/director-actions";
import type { VideoGenerationDraft } from "@/lib/video-generation/types";
import { shotFields, type VideoDirectorPlan, type VideoDirectorSelection } from "@/lib/video-director/core";
import { VIDEO_DIRECTOR_VERSION, videoPresetIds, type VideoPresetId, type VideoShotMode } from "@/lib/video-director/presets";
import { videoDirectorPresets } from "@/lib/video-director/presets";
import { videoCategories, type VideoCategory } from "@/lib/video-director/preset-contract";
import { recommendVideoPresets, unknownPresetProduct, type VideoPresetProduct } from "@/lib/video-director/preset-recommendations";
import styles from "./video-studio-workspace.module.css";

export type VideoProductAnalysisDisplayStatus = "verified" | "not_analyzed" | "unsupported" | "quota_limited" | "budget_unavailable" | "configuration_error" | "provider_failed" | "pending";
type PreparedPlan = { plan: VideoDirectorPlan; receipt: string; analysisStatus: VideoProductAnalysisDisplayStatus };

const presetImages: Partial<Record<VideoPresetId, string>> = {
  "luxury-fashion-film": "/workspace-demo/fashion/campaign.webp",
  "macro-detail-reveal": "/workspace-demo/jewelry/macro.webp",
  "minimal-studio": "/images/presets/cosmetics-studio.webp",
};

export function VideoDirectorPresetSelector({ presetId, disabled, onChange, product = unknownPresetProduct, analysisStatus = "not_analyzed" }: {
  presetId: VideoPresetId;
  disabled: boolean;
  onChange(presetId: VideoPresetId): void;
  product?: VideoPresetProduct;
  analysisStatus?: VideoProductAnalysisDisplayStatus;
}) {
  const t = useTranslations("Dashboard.videoStudio.director");
  const [filter, setFilter] = useState("recommended");
  const [page, setPage] = useState(0);
  const recommended = recommendVideoPresets(product);
  const filtered = filter === "recommended" ? recommended : videoPresetIds.filter(id => filter === "all"
    || !videoDirectorPresets[id].strategy.categories.length || videoDirectorPresets[id].strategy.categories.includes(filter as VideoCategory));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 6) - 1));
  const visible = filtered.slice(currentPage * 6, currentPage * 6 + 6);
  const selected = videoDirectorPresets[presetId];
  return <section className={styles.controlSection} aria-labelledby="video-director-heading">
    <div className={styles.controlHeading}>
      <h2 id="video-director-heading"><span className={styles.stepNumber} aria-hidden="true">02</span>{t("styleHeading")}</h2>
      <p>{t("description")}</p>
    </div>
    <fieldset className={styles.directorFields} disabled={disabled}>
      <legend className="sr-only">{t("preset")}</legend>
      <label className={styles.presetToolbar}>
        <span>{t("library.filter")}</span>
        <select value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }}>
          <option value="recommended">{t("library.recommended")}</option>
          <option value="all">{t("library.all")}</option>
          {videoCategories.map(category => <option value={category} key={category}>{t(`library.categories.${category}`)}</option>)}
        </select>
      </label>
      <p className={styles.fieldDescription}>{t(product.category === "unknown" ? "library.unknown" : "library.profile", { category: product.category === "unknown" ? "" : t(`library.categories.${product.category}`) })}</p>
      <p className={styles.fieldDescription} role="status" aria-live="polite">{t(`library.analysis.${analysisStatus}`)}</p>
      <div className={styles.presetGrid}>
        {visible.map(id => <label key={id}>
          <input type="radio" name="video-director-preset" value={id} checked={presetId === id}
            onChange={() => onChange(id)} />
          <span className={styles.presetCard}>
            <span className={styles.presetImage}>
              <Image src={presetImages[id] ?? (videoDirectorPresets[id].strategy.categories.includes("apparel") ? presetImages["luxury-fashion-film"]! : presetImages["macro-detail-reveal"]!)} alt="" fill sizes="(max-width: 639px) 45vw, 180px" />
              <span className={styles.presetCheck} aria-hidden="true">{presetId === id ? "✓" : ""}</span>
            </span>
            <span className={styles.presetCopy}>
              <strong>{t(`presets.${id}.title`)}</strong>
              <small>{t(`presets.${id}.caption`)}</small>
              {recommended.includes(id) ? <Badge>{t("library.recommendedBadge")}</Badge> : null}
            </span>
          </span>
        </label>)}
      </div>
      <div className={styles.presetPagination}>
        <Button variant="ghost" size="sm" disabled={disabled || currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t("library.previous")}</Button>
        <span role="status">{t("library.count", { start: currentPage * 6 + 1, end: Math.min(filtered.length, (currentPage + 1) * 6), total: filtered.length })}</span>
        <Button variant="ghost" size="sm" disabled={disabled || (currentPage + 1) * 6 >= filtered.length} onClick={() => setPage(currentPage + 1)}>{t("library.next")}</Button>
      </div>
      <p className={styles.fieldDescription}>{t("library.selected", { name: t(`presets.${presetId}.title`) })}</p>
      <p className={styles.fieldDescription} aria-live="polite">{t(`presets.${presetId}.description`)}</p>
      <div className={styles.fieldDescription} aria-live="polite">
        <strong>{t("library.safeHeading")}</strong>
        <ul>{selected.strategy.risks.map(risk => <li key={risk}>{t(`library.risks.${risk}`)}</li>)}</ul>
        {selected.version === 1 && !product.evidence.some(detail => selected.strategy.detailTerms.some(term => detail.toLowerCase().includes(term)))
          ? <p>{t("library.noDetail")}</p> : null}
      </div>
    </fieldset>
  </section>;
}

export function VideoDirectorPanel({ draft, draftKey, presetId, planDisabled, disabledReason, onPrepared, shotMode }: {
  draft: VideoGenerationDraft;
  draftKey: string;
  presetId: VideoPresetId;
  planDisabled: boolean;
  disabledReason: "planLocked" | "planNeedsSource" | "planNeedsPreparedSource" | "planNeedsReadyDraft" | null;
  onPrepared(selection: VideoDirectorSelection | null, productContext?: VideoPresetProduct, analysisStatus?: VideoProductAnalysisDisplayStatus): void;
  shotMode: VideoShotMode;
}) {
  const t = useTranslations("Dashboard.videoStudio.director");
  const referenceT = useTranslations("Dashboard.videoStudio.references");
  const [prepared, setPrepared] = useState<PreparedPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);
  const active = useRef(true);
  const selectionVersion = useRef(0);
  const previousShotMode = useRef(shotMode);
  const previousPresetId = useRef(presetId);
  const storageKey = `video-director-session:${VIDEO_DIRECTOR_VERSION}:${draftKey}:${presetId}:${shotMode}`;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (previousShotMode.current === shotMode) return;
    previousShotMode.current = shotMode;
    selectionVersion.current++;
    setPrepared(null); setError(false);
  }, [shotMode]);
  useEffect(() => {
    if (previousPresetId.current === presetId) return;
    previousPresetId.current = presetId;
    selectionVersion.current++;
    setPrepared(null); setError(false);
  }, [presetId]);

  async function prepare() {
    if (inFlight.current || planDisabled) return;
    inFlight.current = true; setBusy(true); setError(false);
    const version = selectionVersion.current;
    let existingReceipt: string | undefined;
    try {
      // Reuse Video Studio's tab-scoped session-cache pattern. Server verifies every receipt.
      const raw: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if (raw && typeof raw === "object" && "receipt" in raw && typeof raw.receipt === "string") existingReceipt = raw.receipt;
    } catch { /* Session storage is optional. */ }
    try {
      const result = await prepareVideoDirectorAction(draft, presetId, shotMode, existingReceipt);
      if (!active.current || version !== selectionVersion.current) return;
      if (result.status !== "success" || result.plan.presetId !== presetId || result.plan.shotMode !== shotMode) {
        setError(true); return;
      }
      setPrepared({ ...result, analysisStatus: result.analysisStatus });
      onPrepared({ presetId, shotMode, receipt: result.receipt }, result.productContext, result.analysisStatus);
      try { sessionStorage.setItem(storageKey, JSON.stringify({ receipt: result.receipt })); } catch { /* Optional cache. */ }
    } catch { if (active.current && version === selectionVersion.current) setError(true); }
    finally { inFlight.current = false; if (active.current) setBusy(false); }
  }

  return <section className={styles.controlSection} aria-labelledby="video-director-plan-heading" aria-busy={busy}>
    <div className={styles.controlHeading}>
      <h2 id="video-director-plan-heading"><span className={styles.stepNumber} aria-hidden="true">05</span>{t("planHeading")}</h2>
      <p>{t("planDescription")}</p>
    </div>
    {prepared ? <div className={styles.planReady} role="status"><span aria-hidden="true">✓</span>{t("planReady", { count: prepared.plan.shots.length })}</div> : null}
    <p className={styles.fieldDescription}>{t("automaticPlanning")}</p>
    {prepared ? <p className={styles.fieldDescription} role="status" aria-live="polite">{t(`library.analysis.${prepared.analysisStatus}`)}</p> : null}
    {disabledReason ? <p className={styles.fieldDescription} role="status">{t(disabledReason)}</p> : null}
    <div className={styles.planActions}>
      <Button variant="primary" disabled={planDisabled || busy} onClick={() => void prepare()}>
        {busy ? <span className={styles.generateSpinner} aria-hidden="true" /> : null}
        {t(busy ? "preparing" : prepared ? "prepareAgain" : "prepare")}
      </Button>
    </div>
    <div aria-live="polite">
      {error ? <p className={styles.errorMessage} role="alert">{t("error")}</p> : null}
      {prepared ? <article className={styles.directorPlan}>
        <h3>{t(prepared.plan.origin === "ai" ? "aiPlan" : "fallbackPlan")}</h3>
        {prepared.plan.origin === "fallback" ? <p>{t("fallbackNotice")}</p> : null}
        {prepared.plan.origin === "ai" ? <p lang="en"><strong>{t("intent")}: </strong>{prepared.plan.intent}</p> : null}
        <p lang="en">{prepared.plan.summary}</p>
        {prepared.plan.referenceReviews?.map(review => <p key={review.index}>{review.index + 1}: {referenceT(review.status)} — <span lang="en">{review.reason}</span></p>)}
        <ol className={styles.storyboard}>
          {prepared.plan.shots.map((shot, index) => <li key={index} className={styles.storyboardCard}>
            <div className={styles.shotHeader}>
              <span className={styles.shotIndex} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <h4>{t("shot", { number: index + 1, seconds: shot.durationSeconds })}</h4>
            </div>
            <dl>
              <div><dt>{t("purpose")}</dt><dd>{t(`purposes.${shot.purpose}`)}</dd></div>
              <div><dt>{t("focus")}</dt><dd lang="en">{shot.focus}</dd></div>
              <div><dt>{t("camera")}</dt><dd lang="en">{shot.camera}</dd></div>
            </dl>
          </li>)}
        </ol>
        <details>
          <summary>{t("fullPlan")}</summary>
          <ol>
            {prepared.plan.shots.map((shot, index) => <li key={index}>
              <h4>{t("shot", { number: index + 1, seconds: shot.durationSeconds })}</h4>
              <dl>{shotFields.map(field => <div key={field}><dt>{t(field)}</dt><dd lang="en">{shot[field]}</dd></div>)}</dl>
            </li>)}
          </ol>
        </details>
        <p>{t("review")}</p>
      </article> : <div className={styles.planEmpty}><span aria-hidden="true">01 → 02 → 03</span><p>{t("planRequired")}</p></div>}
    </div>
  </section>;
}
