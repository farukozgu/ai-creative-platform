"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { buttonStyles } from "@/components/ui/button";
import { getVideoPlaybackAccessAction, readVideoGenerationStatusAction, resumeVideoFidelityReviewAction } from "@/app/[locale]/dashboard/video/generation-actions";
import type { VideoPresentationRecord, VideoProgressPhase } from "./video-studio-types";
import { Link } from "@/i18n/navigation";
import styles from "./video-studio-workspace.module.css";

type ProgressStep = "source" | "request" | "provider" | "storage" | "ready";
const steps: ProgressStep[] = ["source", "request", "provider", "storage", "ready"];

function isTerminal(phase: VideoProgressPhase | null) {
  return phase === "ready" || phase === "failed" || phase === "ambiguous";
}

export function VideoJobProgress({ jobId, submitting = false, restoreUnavailable = false, submissionError = null, showPlayer = false }: { jobId: string | null; submitting?: boolean; restoreUnavailable?: boolean; submissionError?: "ambiguous" | "failed" | null; showPlayer?: boolean }) {
  const t = useTranslations("Dashboard.videoStudio.beta");
  const [job, setJob] = useState<VideoPresentationRecord | null>(null);
  const [problem, setProblem] = useState(false);
  const [playback, setPlayback] = useState<{ url: string; error: boolean } | null>(null);
  useEffect(() => {
    if (!showPlayer || !jobId || job?.status !== "ready") return;
    let active = true;
    void getVideoPlaybackAccessAction(jobId).then(result => {
      if (active) setPlayback(result.status === "success" ? { url: result.url, error: false } : { url: "", error: true });
    }).catch(() => { if (active) setPlayback({ url: "", error: true }); });
    return () => { active = false; };
  }, [showPlayer, jobId, job?.status]);
  useEffect(() => {
    if (!jobId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await readVideoGenerationStatusAction(jobId!);
        if (!active) return;
        if (result.status !== "success") throw new Error("Video status unavailable.");
        setJob(result.job); setProblem(false);
        if (result.job.status === "ready" && result.job.analysisRequested) void resumeVideoFidelityReviewAction(jobId!);
        if (isTerminal(result.job.progressPhase ?? null)) return;
      } catch { if (active) setProblem(true); }
      if (active) timer = setTimeout(() => { void poll(); }, 8_000);
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [jobId]);

  const phase: VideoProgressPhase | "submitting" | "loading" | null = job?.progressPhase ?? (submitting ? "submitting" : submissionError ?? (restoreUnavailable ? "submission-uncertain" : jobId ? "loading" : null));
  if (!phase) return null;
  const isPending = ["loading", "submitting", "queued", "processing", "storage-retry", "finalizing"].includes(phase);
  const isError = restoreUnavailable || phase === "failed" || phase === "storage-retry" || phase === "ambiguous" || phase === "submission-uncertain" || submissionError !== null;
  const completedThrough = phase === "ready" ? 4
    : phase === "finalizing" ? 3 : phase === "storage-retry" ? 2
      : phase === "processing" || phase === "queued" ? 1
        : phase === "submitting" ? 0
          : phase === "failed" && job?.outputPersisted ? 3
            : phase === "failed" && job?.providerTaskKnown ? 1 : 0;
  const currentStep = phase === "ready" ? -1
    : phase === "finalizing" ? 4 : phase === "storage-retry" ? 3
      : phase === "processing" || phase === "queued" ? 2
        : phase === "submitting" ? 1
          : isError ? -1 : 0;
  const statusMessage = restoreUnavailable ? t("restoreUnavailable")
    : problem ? t("pollError")
    : phase === "loading" ? t("checkingPrevious")
    : phase === "submitting" ? t("sending")
      : phase === "queued" ? t("queued")
          : phase === "processing" ? t("processing")
          : phase === "storage-retry" ? t("storageRetry")
          : phase === "finalizing" ? t("finalizing")
            : phase === "ready" ? t("ready")
              : phase === "ambiguous" || phase === "submission-uncertain" ? t("ambiguous")
                : phase === "failed" ? t(job?.errorCode === "output_persistence_failure" ? "storageFailed" : "failed") : t("unknown");

  const needsAttention = isError || problem;
  const headline = needsAttention ? "attention"
    : phase === "ready" ? "ready"
      : phase === "finalizing" ? "finalizing"
        : phase === "processing" ? "processing"
          : phase === "queued" ? "queued"
            : phase === "submitting" ? "submitting" : "loading";

  return <section className={styles.jobProgress} data-phase={phase} data-attention={needsAttention || undefined} aria-label={t("progressTitle")} aria-live="polite" aria-busy={isPending}>
    <div className={styles.jobProgressHeader}>
      <span className={styles.progressEyebrow}>{t("progressTitle")}</span>
      <span className={styles.progressBadge}>
        {isPending && !needsAttention ? <span className={styles.progressSpinner} aria-hidden="true" /> : null}
        {t(needsAttention ? "progressLabels.attention" : phase === "ready" ? "progressLabels.ready" : "progressLabels.active")}
      </span>
    </div>
    <div className={styles.progressIntro}>
      <div className={styles.progressArtwork} aria-hidden="true">
        <span /><span /><span><DashboardIcon name={needsAttention ? "alert" : phase === "ready" ? "video" : "spark"} /></span>
      </div>
      <div className={styles.progressCopy}>
        <h2>{t(`progressHeadings.${headline}`)}</h2>
        <p role={isError ? "alert" : "status"}>{statusMessage}</p>
      </div>
    </div>
    {showPlayer && phase === "ready" && playback?.url ? <video className={styles.resultVideo} controls playsInline preload="metadata" poster={job?.thumbnailUrl ?? undefined} src={playback.url} aria-label={t("watchVideo")} onError={() => setPlayback({ url: "", error: true })} /> : null}
    {showPlayer && playback?.error ? <p className={styles.errorMessage} role="alert">{t("playbackError")}</p> : null}
    {!restoreUnavailable ? <ol className={styles.progressSteps}>
      {steps.map((step, index) => {
        const done = index <= completedThrough;
        const current = index === currentStep;
        const label = step === "source" ? t("steps.source")
          : step === "request" ? t("steps.request")
          : step === "provider" ? done ? t("steps.processed") : phase === "queued" ? t("steps.queued") : t("steps.processing")
              : step === "storage" ? done || job?.outputPersisted ? t("steps.saved") : t("steps.storage")
                : t("steps.ready");
        return <li key={step} data-state={done ? "complete" : current ? "current" : "pending"} aria-current={current ? "step" : undefined}>
          <span className={styles.progressStepMarker} aria-hidden="true">{done ? "✓" : String(index + 1).padStart(2, "0")}</span>
          <span className={styles.progressStepCopy}>
            <strong>{label}</strong>
            <span>{t(done ? "stepStates.complete" : needsAttention ? "stepStates.paused" : current ? "stepStates.current" : "stepStates.pending")}</span>
          </span>
        </li>;
      })}
    </ol> : null}
    <div className={styles.progressActions}>
      <p className={styles.progressFootnote}><DashboardIcon name="videoLibrary" />{t("progressLibraryHint")}</p>
      <div className={styles.progressLinks}>
        {phase === "ready" && jobId ? <Link href={`/dashboard/videos/${jobId}`} className={buttonStyles({ size: "sm" })}>{t("watchVideo")}<DashboardIcon name="arrow" /></Link> : null}
        <Link href="/dashboard/videos" className={buttonStyles({ variant: "secondary", size: "sm" })}>{t("libraryLink")}<DashboardIcon name="arrow" /></Link>
      </div>
    </div>
  </section>;
}
