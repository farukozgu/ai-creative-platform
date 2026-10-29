"use client";

import { Button } from "@/components/ui/button";
/* eslint-disable @next/next/no-img-element -- private source previews may be blob URLs. */
import { useRef } from "react";
import { useTranslations } from "next-intl";
import type { CriticalProductRegion } from "@/lib/video-generation/preservation";
import styles from "./video-studio-workspace.module.css";

type Props = { region: CriticalProductRegion | null; sourceUrl: string | null; regionResolutionLabel?: string | null;
  analysis: { enabled: boolean; maximumEstimatedCostUsd: number | null; model?: string }; analyze: boolean;
  onRegion: (region: CriticalProductRegion | null) => void; onAnalyze: (value: boolean) => void };

export function VideoPreservationControls({ region, sourceUrl, regionResolutionLabel, analysis, analyze, onRegion, onAnalyze }: Props) {
  const t = useTranslations("Dashboard.videoStudio.preservation");
  const start = useRef<{ x: number; y: number } | null>(null);
  function point(event: React.PointerEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
  }
  function resizeRegion(key: "x" | "y" | "width" | "height", value: number) {
    if (!region || !Number.isFinite(value)) return;
    const next = { ...region, [key]: Math.max(0, Math.min(1, value / 100)) };
    next.width = Math.max(0.005, Math.min(next.width, 1 - next.x)); next.height = Math.max(0.005, Math.min(next.height, 1 - next.y));
    next.x = Math.min(next.x, 0.995); next.y = Math.min(next.y, 0.995);
    onRegion(next);
  }
  return <section className={styles.controlSection}>
    <p className={styles.fieldDescription}>{t("noGuarantee")}</p>
    {sourceUrl ? <details className={styles.regionEditor}>
      <summary>{t("regionTitle")}</summary>
      <p className={styles.fieldDescription}>{t("regionHelp")}</p>
      <button type="button" className={styles.regionCanvas} aria-label={t("regionSelect")}
        onPointerDown={event => { start.current = point(event); event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerUp={event => { if (!start.current) return; const end = point(event), origin = start.current; start.current = null;
          if (Math.abs(end.x - origin.x) >= 0.005 && Math.abs(end.y - origin.y) >= 0.005) onRegion({ x: Math.min(origin.x, end.x), y: Math.min(origin.y, end.y), width: Math.abs(end.x - origin.x), height: Math.abs(end.y - origin.y), declaredText: region?.declaredText ?? "" }); }}
        onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onRegion({ x: 0.4, y: 0.1, width: 0.2, height: 0.15, declaredText: region?.declaredText ?? "" }); } }}>
        <img src={sourceUrl} alt={t("sourceAlt")} draggable={false} />
        {region ? <span className={styles.regionBox} style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }} /> : null}
      </button>
      {region ? <>
        <div className={styles.regionCoordinates}>{(["x", "y", "width", "height"] as const).map(key => <label key={key}>{t(key)}<input type="number" min={key === "x" || key === "y" ? 0 : 0.5} max={100} step={0.5} value={Number((region[key] * 100).toFixed(1))} onChange={event => resizeRegion(key, event.target.valueAsNumber)} /></label>)}</div>
        <label className={styles.regionText}>{t("declaredText")}<input type="text" maxLength={120} value={region.declaredText} onChange={event => onRegion({ ...region, declaredText: event.target.value })} /></label>
        <p className={styles.fieldDescription}>{t("unverifiedHint")}</p>
        {regionResolutionLabel ? <p className={styles.fieldDescription} role="status">{regionResolutionLabel}</p> : null}
        <Button variant="ghost" size="sm" type="button" onClick={() => onRegion(null)}>{t("clearRegion")}</Button>
      </> : null}
    </details> : null}
    <div className={styles.analysisOptIn}>
      <label><input type="checkbox" checked={analyze && analysis.enabled} disabled={!analysis.enabled} onChange={event => onAnalyze(event.target.checked)} />{t("analysisOptIn")}</label>
      <p className={styles.fieldDescription}>{analysis.enabled ? t("analysisCost") : t("analysisDisabled")}</p>
      <p className={styles.fieldDescription}>{t("analysisConsent")}</p>
    </div>
  </section>;
}
