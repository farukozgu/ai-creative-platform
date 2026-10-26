"use client";

/* eslint-disable @next/next/no-img-element -- the browser creates these transient frame preview data URLs locally. */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import type { VideoFidelityAnalysisAvailability } from "@/lib/video-fidelity/types";
import { sampleVideoFrameTimestamps } from "@/lib/video-fidelity/sampling";
import { parseVideoFidelitySessionCache } from "@/lib/video-fidelity/session-cache";
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
type PreparedReview = { sourcePreview: string; frames: Frame[] };

type VideoFidelityAnalysisProps = {
  videoId: string;
  durationSeconds: number;
  availability: VideoFidelityAnalysisAvailability;
  copy: VideoFidelityCopy;
};

function waitForMedia(video: HTMLVideoElement, eventName: "loadedmetadata" | "loadeddata" | "seeked", timeoutMs: number) {
  if (eventName === "loadedmetadata" && video.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  if (eventName === "loadeddata" && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error("Media operation timed out.")), timeoutMs);
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, onReady);
      video.removeEventListener("error", onError);
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => finish();
    const onError = () => finish(new Error("Media could not be decoded."));
    video.addEventListener(eventName, onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

async function canvasImageData(canvas: HTMLCanvasElement): Promise<string> {
  const toBlob = (quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  let blob = await toBlob(0.84);
  if (!blob) throw new Error("Frame could not be encoded.");
  if (blob.size > 900 * 1024) {
    blob = await toBlob(0.7);
    if (!blob) throw new Error("Frame could not be encoded.");
  }
  if (blob.size > 900 * 1024) throw new Error("Frame exceeds the safe image size.");
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Frame could not be read."));
    reader.onerror = () => reject(new Error("Frame could not be read."));
    reader.readAsDataURL(blob);
  });
}

async function prepareSourcePreview(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Image canvas is unavailable.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvasImageData(canvas);
  } finally {
    bitmap.close();
  }
}

async function prepareReview(videoId: string, durationSeconds: number): Promise<PreparedReview> {
  const prefix = `/api/dashboard/videos/${encodeURIComponent(videoId)}/fidelity-analysis`;
  const [sourceResponse, videoResponse] = await Promise.all([
    fetch(`${prefix}?kind=source`, { credentials: "same-origin", cache: "no-store" }),
    fetch(`${prefix}?kind=video`, { credentials: "same-origin", cache: "no-store" }),
  ]);
  if (!sourceResponse.ok || !videoResponse.ok) throw new Error("Owned media is unavailable.");
  const [sourceBlob, videoBlob] = await Promise.all([sourceResponse.blob(), videoResponse.blob()]);
  if (videoBlob.size <= 0 || videoBlob.size > 32 * 1024 * 1024) throw new Error("Video exceeds the local review limit.");
  const sourcePreview = await prepareSourcePreview(sourceBlob);

  const videoUrl = URL.createObjectURL(videoBlob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const metadataReady = waitForMedia(video, "loadedmetadata", 8000);
  video.src = videoUrl;
  try {
    await metadataReady;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration > 15
      || video.videoWidth <= 0 || video.videoHeight <= 0 || video.videoWidth > 4096 || video.videoHeight > 4096
      || video.videoWidth * video.videoHeight > 20_000_000) throw new Error("Video dimensions or duration exceed the local review limit.");
    const frameTimes = sampleVideoFrameTimestamps(durationSeconds);
    if (frameTimes.length !== 5 || video.duration + 0.3 < frameTimes[frameTimes.length - 1]) throw new Error("Video timeline is unavailable.");
    await waitForMedia(video, "loadeddata", 8000);
    const scale = Math.min(1, 1024 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Video frame canvas is unavailable.");

    const frames: Frame[] = [];
    for (const timestampSeconds of frameTimes) {
      if (Math.abs(video.currentTime - timestampSeconds) > 0.02) {
        const seeked = waitForMedia(video, "seeked", 5000);
        video.currentTime = timestampSeconds;
        await seeked;
      }
      if (Math.abs(video.currentTime - timestampSeconds) > 0.3) throw new Error("A representative video frame could not be sampled.");
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({ timestampSeconds: Math.round(video.currentTime * 10) / 10, dataUrl: await canvasImageData(canvas) });
    }
    return { sourcePreview, frames };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(videoUrl);
  }
}

function formatTime(value: number) {
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toFixed(1).padStart(4, "0")}`;
}

function renderTextList(values: readonly string[], fallback: string) {
  return values.length > 0 ? values.join(" · ") : fallback;
}

export function VideoFidelityAnalysis({ videoId, durationSeconds, availability, copy }: VideoFidelityAnalysisProps) {
  const t = useTranslations("Dashboard.videoDetail.fidelityAnalysis");
  const sessionCacheKey = `klay-video-fidelity-v2:${videoId}`;
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
    queueMicrotask(() => {
      if (!active) return;
      try {
        const cached = parseVideoFidelitySessionCache(window.sessionStorage.getItem(sessionCacheKey));
        if (cached?.status === "pending") {
          setAnalysisStarted(true);
          setAnalysisOutcome("uncertain");
        } else if (cached?.status === "complete") {
          setAnalysisStarted(true);
          setReport(cached.report);
        }
      } catch {
        // Session storage can be unavailable; the current page still works without it.
      } finally {
        setSessionCacheReady(true);
      }
    });
    return () => { active = false; };
  }, [sessionCacheKey]);

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
    setAnalysisStarted(true);
    setAnalyzing(true);
    setAnalysisOutcome(null);
    try {
      window.sessionStorage.setItem(sessionCacheKey, JSON.stringify({ status: "pending" }));
    } catch {
      // A storage restriction must not prevent an explicitly requested review.
    }
    try {
      const response = await fetch(`/api/dashboard/videos/${encodeURIComponent(videoId)}/fidelity-analysis`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent: true,
          confirmedMaximumCostUsd: availability.maximumEstimatedCostUsd,
          source: { dataUrl: prepared.sourcePreview },
          frames: prepared.frames,
        }),
      });
      const result = await response.json() as { status?: string; report?: VideoFidelityReport };
      if (response.ok && result.status === "success" && result.report) {
        setReport(result.report);
        try {
          window.sessionStorage.setItem(sessionCacheKey, JSON.stringify({ status: "complete", report: result.report }));
        } catch {
          // The report remains available in this view if session storage is full.
        }
      } else if (result.status === "disabled") {
        setAnalysisOutcome("disabled");
        try { window.sessionStorage.removeItem(sessionCacheKey); } catch { /* Storage is optional. */ }
      } else if (result.status === "invalid_media" || result.status === "confirmation_required") {
        setAnalysisOutcome("failed");
        try { window.sessionStorage.removeItem(sessionCacheKey); } catch { /* Storage is optional. */ }
      }
      else setAnalysisOutcome("uncertain");
    } catch {
      setAnalysisOutcome("uncertain");
    } finally {
      setAnalyzing(false);
    }
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
        </div>
      )}

      {prepared && sessionCacheReady && !report && !analysisOutcome && !analysisStarted ? (
        <div className={styles.consentBlock}>
          {availability.enabled && availability.maximumEstimatedCostUsd !== null ? (
            <>
              <p className={styles.estimate}>{t("priceEstimate", { amount: availability.maximumEstimatedCostUsd.toFixed(2) })}</p>
              <p>{copy.consentLead}</p>
              <p className={styles.muted}>{copy.consentDetails}</p>
              <label className={styles.consentLabel}>
                <input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} />
                <span>{t("consentLabel", { amount: availability.maximumEstimatedCostUsd.toFixed(2) })}</span>
              </label>
              <button type="button" className={libraryStyles.primaryAction} onClick={handleAnalyze} disabled={!consented || analyzing}>
                {analyzing ? copy.analyzing : t("analyze", { amount: availability.maximumEstimatedCostUsd.toFixed(2) })}
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
