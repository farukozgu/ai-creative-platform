"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { prepareVideoDirectorAction } from "@/app/[locale]/dashboard/video/director-actions";
import type { VideoGenerationDraft } from "@/lib/video-generation/types";
import { shotFields, type VideoDirectorPlan, type VideoDirectorSelection } from "@/lib/video-director/core";
import { videoPresetIds, type VideoPresetId, type VideoShotMode } from "@/lib/video-director/presets";
import type { quoteVideoFidelity } from "@/lib/video-fidelity/pricing";
import styles from "./video-studio-workspace.module.css";

type PreparedPlan = { plan: VideoDirectorPlan; receipt: string };

export function VideoDirectorPresetSelector({ presetId, disabled, onChange }: {
  presetId: VideoPresetId;
  disabled: boolean;
  onChange(presetId: VideoPresetId): void;
}) {
  const t = useTranslations("Dashboard.videoStudio.director");
  return <section className={styles.controlSection} aria-labelledby="video-director-heading">
    <div className={styles.controlHeading}>
      <h2 id="video-director-heading">{t("title")}</h2>
      <p>{t("description")}</p>
    </div>
    <fieldset className={styles.directorFields} disabled={disabled}>
      <legend>{t("preset")}</legend>
      <div className={styles.compactOptions}>
        {videoPresetIds.map(id => <label key={id}>
          <input type="radio" name="video-director-preset" value={id} checked={presetId === id}
            onChange={() => onChange(id)} />
          <span>{t(`presets.${id}.title`)}</span>
        </label>)}
      </div>
      <p className={styles.fieldDescription}>{t(`presets.${presetId}.description`)}</p>
    </fieldset>
  </section>;
}

export function VideoDirectorPanel({ draft, draftKey, quote, presetId, planDisabled, disabledReason, onPrepared, shotMode }: {
  draft: VideoGenerationDraft;
  draftKey: string;
  quote: ReturnType<typeof quoteVideoFidelity>;
  presetId: VideoPresetId;
  planDisabled: boolean;
  disabledReason: "planLocked" | "planNeedsSource" | "planNeedsPreparedSource" | "planNeedsReadyDraft" | null;
  onPrepared(selection: VideoDirectorSelection | null): void;
  shotMode: VideoShotMode;
}) {
  const t = useTranslations("Dashboard.videoStudio.director");
  const [prepared, setPrepared] = useState<PreparedPlan | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);
  const active = useRef(true);
  const selectionVersion = useRef(0);
  const previousShotMode = useRef(shotMode);
  const previousPresetId = useRef(presetId);
  const storageKey = `video-director-session-v1:${draftKey}:${presetId}:${shotMode}`;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (previousShotMode.current === shotMode) return;
    previousShotMode.current = shotMode;
    selectionVersion.current++;
    setPrepared(null); setConsent(false); setError(false);
  }, [shotMode]);
  useEffect(() => {
    if (previousPresetId.current === presetId) return;
    previousPresetId.current = presetId;
    selectionVersion.current++;
    setPrepared(null); setConsent(false); setError(false);
  }, [presetId]);

  async function prepare(paid: boolean) {
    if (inFlight.current || planDisabled || (paid && (!consent || !quote))) return;
    inFlight.current = true; setBusy(true); setError(false);
    const version = selectionVersion.current;
    let existingReceipt: string | undefined;
    try {
      // Reuse Video Studio's tab-scoped session-cache pattern. Server verifies every receipt.
      const raw: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if (raw && typeof raw === "object" && "receipt" in raw && typeof raw.receipt === "string") existingReceipt = raw.receipt;
    } catch { /* Session storage is optional. */ }
    try {
      const result = await prepareVideoDirectorAction(draft, presetId, shotMode,
        paid && quote ? { maximumCostUsd: quote.maximumEstimatedCostUsd, pricingVersion: quote.pricingVersion } : undefined, existingReceipt);
      if (!active.current || version !== selectionVersion.current) return;
      if (result.status !== "success" || result.plan.presetId !== presetId || result.plan.shotMode !== shotMode) {
        setError(true); return;
      }
      setPrepared(result); setConsent(false);
      onPrepared({ presetId, shotMode, receipt: result.receipt });
      try { sessionStorage.setItem(storageKey, JSON.stringify({ receipt: result.receipt })); } catch { /* Optional cache. */ }
    } catch { if (active.current && version === selectionVersion.current) setError(true); }
    finally { inFlight.current = false; if (active.current) setBusy(false); }
  }

  return <section className={styles.controlSection} aria-labelledby="video-director-plan-heading" aria-busy={busy}>
    <div className={styles.controlHeading}><h2 id="video-director-plan-heading">{t("planHeading")}</h2></div>
    {quote ? <label className={styles.directorConsent}>
      <input type="checkbox" checked={consent} disabled={busy || planDisabled} onChange={event => setConsent(event.target.checked)} />
      <span>{t("consent", { cost: quote.maximumEstimatedCostUsd.toFixed(6) })}</span>
    </label> : <p className={styles.fieldDescription}>{t("unavailable")}</p>}
    {disabledReason ? <p className={styles.fieldDescription} role="status">{t(disabledReason)}</p> : null}
    <Button variant="secondary" disabled={planDisabled || busy || !consent || !quote} onClick={() => void prepare(true)}>
      {t(busy ? "preparing" : "prepare")}
    </Button>
    <Button variant="ghost" disabled={planDisabled || busy} onClick={() => void prepare(false)}>{t("fallbackButton")}</Button>
    <p className={styles.fieldDescription}>{t("separateApproval")}</p>
    <div aria-live="polite">
      {error ? <p role="alert">{t("error")}</p> : null}
      {prepared ? <article className={styles.directorPlan}>
        <h3>{t(prepared.plan.origin === "ai" ? "aiPlan" : "fallbackPlan")}</h3>
        {prepared.plan.origin === "fallback" ? <p>{t("fallbackNotice")}</p> : null}
        <p lang="en">{prepared.plan.summary}</p>
        <ul>{prepared.plan.shots.map((shot, index) => <li key={index}>{t("shot", { number: index + 1, seconds: shot.durationSeconds })} · {shot.focus}</li>)}</ul>
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
      </article> : <p className={styles.fieldDescription}>{t("planRequired")}</p>}
    </div>
  </section>;
}
