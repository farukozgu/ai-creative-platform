"use client";

/* eslint-disable @next/next/no-img-element -- the browser creates these transient frame preview data URLs locally. */

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import type { VideoFidelityAnalysisAvailability } from "@/lib/video-fidelity/types";
import type { VideoFidelityReport } from "@/lib/video-fidelity/types";
import libraryStyles from "./video-library.module.css";
import styles from "./video-fidelity-analysis.module.css";

export type VideoFidelityCopy = {
  title: string;
  description: string;
  prepare: string;
  preparing: string;
  preparingSource: string;
  extractingFrames: string;
  freeStep: string;
  sourceFrame: string;
  frameUnavailable: string;
  analysisDisabled: string;
  pricingUnavailable: string;
  consentLead: string;
  consentDetails: string;
  analyzing: string;
  cancel: string;
  profileTitle: string;
  brandingText: string;
  shapeProportions: string;
  colorMaterial: string;
  constructionDetails: string;
  motionDeformation: string;
  category: string;
  color: string;
  shape: string;
  material: string;
  branding: string;
  readableText: string;
  noVisibleBranding: string;
  observations: string;
  checksTitle: string;
  overallTitle: string;
  statuses: Record<"preserved" | "suspicious_change" | "clear_distortion" | "unverified", string>;
  overallStatuses: Record<"clear_distortion" | "review_recommended" | "no_clear_change_detected" | "inconclusive", string>;
  confidence: Record<"high" | "medium" | "low", string>;
  causes: Record<"product_change" | "camera_angle" | "lighting" | "partial_visibility" | "motion_blur" | "unclear", string>;
  verticals: Record<"apparel" | "jewelry" | "watches" | "cosmetics" | "footwear" | "bags", string>;
  noText: string;
  prepareError: string;
  unavailable: string;
  uncertain: string;
  failed: string;
};

type Frame = { timestampSeconds: number; dataUrl: string };
type PreparedReview = { sourcePreview: string; frames: Frame[]; closeups: { label: string; timestampSeconds: number | null; dataUrl: string }[] };

type VideoFidelityAnalysisProps = {
  analysisRequested?: boolean;
  videoId: string;
  durationSeconds: number;
  availability: VideoFidelityAnalysisAvailability;
  copy: VideoFidelityCopy;
};

async function prepareReview(videoId: string, durationSeconds: number): Promise<PreparedReview> {
  if (![5, 10].includes(durationSeconds)) throw new Error("Unsupported video duration.");
  const response = await fetch(`/api/dashboard/videos/${encodeURIComponent(videoId)}/fidelity-analysis?kind=frames`, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("Owned media is unavailable.");
  return await response.json() as PreparedReview;
}

function formatTime(value: number) {
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toFixed(1).padStart(4, "0")}`;
}

function renderTextList(values: readonly string[], fallback: string) {
  return values.length > 0 ? values.join(" · ") : fallback;
}

export function VideoFidelityAnalysis({ videoId, durationSeconds, availability, copy, analysisRequested = false }: VideoFidelityAnalysisProps) {
  const t = useTranslations("Dashboard.videoDetail.fidelityAnalysis");
  const locale = useLocale();
  const automaticStarted = useRef(false);
  const [reviewRefresh, setReviewRefresh] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState<PreparedReview | null>(null);
  const [prepareError, setPrepareError] = useState(false);
  const [consented, setConsented] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [report, setReport] = useState<VideoFidelityReport | null>(null);
  const [analysisOutcome, setAnalysisOutcome] = useState<"disabled" | "uncertain" | "failed" | null>(null);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [sessionCacheReady, setSessionCacheReady] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const endpoint = `/api/dashboard/videos/${encodeURIComponent(videoId)}/fidelity-analysis`;
    async function poll() {
      try {
        const response = await fetch(endpoint + "?kind=review", { cache: "no-store" });
        if (!response.ok) throw new Error("Review unavailable.");
        const result = await response.json() as { review: { status: string; report: VideoFidelityReport | null } | null };
        if (!active) return;
        setSessionCacheReady(true);
        const review = result.review;
        if (review?.status === "succeeded" && review.report) { setReport(review.report); setAnalysisStarted(true); setAnalyzing(false); setAnalysisOutcome(null); return; }
        if (review?.status === "failed" || review?.status === "uncertain") { setAnalysisStarted(true); setAnalyzing(false); setAnalysisOutcome(review.status); return; }
        if (analysisRequested && !automaticStarted.current) {
          automaticStarted.current = true;
          setAnalysisStarted(true); setAnalyzing(true);
          void fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resume: true, locale }) })
            .then(response => response.json()).then((result: { status?: string }) => {
              if (!active) return;
              if (result.status === "disabled" || result.status === "failed" || result.status === "uncertain") { setAnalyzing(false); setAnalysisOutcome(result.status); }
              else timer = setTimeout(() => void poll(), 1000);
            }).catch(() => { if (active) { setAnalyzing(false); setAnalysisOutcome("uncertain"); timer = setTimeout(() => void poll(), 3000); } });
          return;
        }
        if (review) { setAnalysisStarted(true); setAnalyzing(true); timer = setTimeout(() => void poll(), 3000); }
      } catch { if (active) { setSessionCacheReady(false); setAnalysisOutcome("disabled"); } }
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [videoId, analysisRequested, locale, reviewRefresh]);

  async function handlePrepare() {
    setPreparing(true);
    setPrepareError(false);
    try {
      setPrepared(await prepareReview(videoId, durationSeconds));
    } catch {
      setPrepareError(true);
    } finally {
      setPreparing(false);
    }
  }

  async function handleAnalyze() {
    if (!prepared || !availability.enabled || !availability.maximumEstimatedCostUsd || !consented || analysisStarted) return;
    setAnalysisStarted(true); setAnalyzing(true); setAnalysisOutcome(null);
    try {
      const response = await fetch(`/api/dashboard/videos/${encodeURIComponent(videoId)}/fidelity-analysis`, {
        method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, confirmedMaximumCostUsd: availability.maximumEstimatedCostUsd, pricingVersion: availability.pricingVersion, locale }),
      });
      const result = await response.json() as { status?: string; report?: VideoFidelityReport };
      if (response.ok && result.status === "success" && result.report) setReport(result.report);
      else setAnalysisOutcome(result.status === "disabled" ? "disabled" : result.status === "failed" || result.status === "confirmation_required" ? "failed" : "uncertain");
    } catch { setAnalysisOutcome("uncertain"); }
    finally { setAnalyzing(false); setReviewRefresh(value => value + 1); }
  }

  const profile = report?.sourceProfile;
  const sourceDetails = report?.sourceDetails;
  const checkLabels: Record<VideoFidelityReport["checks"][number]["category"], string> = {
    branding_text: copy.brandingText,
    shape_proportions: copy.shapeProportions,
    color_material: copy.colorMaterial,
    construction_details: copy.constructionDetails,
    motion_deformation: copy.motionDeformation,
  };

  return (
    <section className={styles.panel} aria-labelledby="video-fidelity-title">
      <div className={styles.heading}>
        <div>
          <h2 className={styles.eyebrow} id="video-fidelity-title">{copy.title}</h2>
          <p className={styles.description}>{copy.description}</p>
        </div>
      </div>

      {!prepared ? (
        <div className={styles.prepareBlock}>
          <p>{copy.freeStep}</p>
          <button type="button" className={libraryStyles.secondaryAction} onClick={handlePrepare} disabled={preparing}>
            {preparing ? copy.preparing : copy.prepare}
          </button>
          {preparing ? <p className={styles.liveStatus} role="status">{copy.preparingSource}<br />{copy.extractingFrames}</p> : null}
          {prepareError ? <p className={styles.error} role="status">{copy.prepareError}</p> : null}
        </div>
      ) : (
        <div className={styles.frameGrid} aria-label={copy.checksTitle}>
          <figure className={styles.frameCard}>
            <img src={prepared.sourcePreview} alt={copy.sourceFrame} />
            <figcaption>{copy.sourceFrame}</figcaption>
          </figure>
          {prepared.frames.map((frame, index) => (
            <figure className={styles.frameCard} key={frame.timestampSeconds} id={`fidelity-frame-${index}`}>
              <img src={frame.dataUrl} alt={t("videoFrame", { number: index + 1, timestamp: formatTime(frame.timestampSeconds) })} />
              <figcaption>{t("videoFrame", { number: index + 1, timestamp: formatTime(frame.timestampSeconds) })}</figcaption>
            </figure>
          ))}
          {(prepared.closeups ?? []).map((crop, index) => <figure className={styles.frameCard} key={index}>
            <img src={crop.dataUrl} alt={crop.timestampSeconds === null ? t("closeupSource") : t("closeupVideo", { time: crop.timestampSeconds })} />
            <figcaption>{crop.timestampSeconds === null ? t("closeupSource") : t("closeupVideo", { time: crop.timestampSeconds })}</figcaption>
          </figure>)}
        </div>
      )}

      {prepared && sessionCacheReady && !report && !analysisOutcome && !analysisStarted ? (
        <div className={styles.consentBlock}>
          {availability.enabled && availability.maximumEstimatedCostUsd !== null ? (
            <>
              <p className={styles.estimate}>{t("priceEstimate", { amount: availability.maximumEstimatedCostUsd.toFixed(6) })}</p>
              <p>{copy.consentLead}</p>
              <p className={styles.muted}>{copy.consentDetails}</p>
              <label className={styles.consentLabel}>
                <input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} />
                <span>{t("consentLabel", { amount: availability.maximumEstimatedCostUsd.toFixed(6) })}</span>
              </label>
              <button type="button" className={libraryStyles.primaryAction} onClick={handleAnalyze} disabled={!consented || analyzing}>
                {analyzing ? copy.analyzing : t("analyze", { amount: availability.maximumEstimatedCostUsd.toFixed(6) })}
              </button>
            </>
          ) : (
            <p className={styles.muted}>{availability.maximumEstimatedCostUsd === null ? copy.pricingUnavailable : copy.analysisDisabled}</p>
          )}
        </div>
      ) : null}

      {analyzing ? <p className={styles.liveStatus} role="status">{copy.analyzing}</p> : null}
      {analysisOutcome === "disabled" ? <p className={styles.error} role="status">{copy.analysisDisabled}</p> : null}
      {analysisOutcome === "uncertain" ? <p className={styles.error} role="status">{copy.uncertain}</p> : null}
      {analysisOutcome === "failed" ? <p className={styles.error} role="status">{copy.failed}</p> : null}

      {report ? (
        <div className={styles.results}>
              <header className={styles.overall}>
                <div>
                  <h3>{copy.overallTitle}</h3>
                  <span className={`${styles.status} ${styles[`status_${report.overallStatus}`]}`}>{copy.overallStatuses[report.overallStatus]}</span>
                </div>
                <p>{report.summary}</p>
              </header>

              <section className={styles.profile} aria-labelledby="video-fidelity-profile-title">
                <h3 id="video-fidelity-profile-title">{copy.profileTitle}</h3>
                {profile ? (
                  <dl>
                    <div><dt>{copy.category}</dt><dd>{[copy.verticals[profile.vertical], profile.subcategory].filter(Boolean).join(" · ")}</dd></div>
                    <div><dt>{copy.color}</dt><dd>{sourceDetails?.color ?? renderTextList(profile.dominantColors, copy.noText)}</dd></div>
                    <div><dt>{copy.shape}</dt><dd>{sourceDetails?.silhouette ?? (profile.productShape === "unknown" ? copy.noText : profile.productShape)}</dd></div>
                    <div><dt>{copy.material}</dt><dd>{sourceDetails?.material ?? renderTextList(profile.materials, copy.noText)}</dd></div>
                    <div><dt>{copy.branding}</dt><dd>{sourceDetails?.brandingVisible === false ? copy.noVisibleBranding : renderTextList([
                      sourceDetails?.brandingDescription ?? "",
                      ...(sourceDetails?.readableText ?? []).map((text) => `${copy.readableText}: “${text}”`),
                      ...(profile.identitySummary ?? []),
                    ].filter(Boolean), copy.noText)}</dd></div>
                    <div><dt>{copy.observations}</dt><dd>{renderTextList([
                      ...(sourceDetails?.distinctiveDetails ?? []),
                      ...(profile.sourceObservations ?? []),
                    ], copy.noText)}</dd></div>
                  </dl>
                ) : <p className={styles.muted}>{copy.noText}</p>}
              </section>

              <section className={styles.checks} aria-labelledby="video-fidelity-checks-title">
                <h3 id="video-fidelity-checks-title">{copy.checksTitle}</h3>
                <ul>
                  {report.checks.map((check) => (
                    <li key={check.category}>
                      <div className={styles.checkHeading}>
                        <strong>{checkLabels[check.category]}</strong>
                        <span className={`${styles.status} ${styles[`status_${check.status}`]}`}>{copy.statuses[check.status]}</span>
                      </div>
                      <p>{check.reason}</p>
                      {check.status !== "unverified" ? (
                        <div className={styles.checkMeta}>
                          <span>{copy.confidence[check.confidence]}</span>
                          <span>{copy.causes[check.likelyCause]}</span>
                          {check.timestampsSeconds.map((time) => {
                            if (!prepared) return <span key={time}>{t("timestamp", { value: formatTime(time) })}</span>;
                            const nearestIndex = prepared.frames.reduce((best, frame, index) => Math.abs(frame.timestampSeconds - time) < Math.abs(prepared.frames[best].timestampSeconds - time) ? index : best, 0);
                            return <a key={time} href={`#fidelity-frame-${nearestIndex}`}>{t("timestamp", { value: formatTime(time) })}</a>;
                          })}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
        </div>
      ) : null}
    </section>
  );
}
