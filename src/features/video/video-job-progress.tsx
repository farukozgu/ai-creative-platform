"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getVideoPlaybackAccessAction, readVideoGenerationStatusAction } from "@/app/[locale]/dashboard/video/generation-actions";
import type { VideoPresentationRecord, VideoProgressPhase } from "./video-studio-types";
import { Link } from "@/i18n/navigation";
import { VideoDownloadButton } from "./video-download-button";
import styles from "./video-studio-workspace.module.css";

type ProgressStep = "source" | "request" | "provider" | "storage" | "ready";
const steps: ProgressStep[] = ["source", "request", "provider", "storage", "ready"];

function isTerminal(phase: VideoProgressPhase | null) {
  return phase === "ready" || phase === "failed" || phase === "ambiguous";
}

export function VideoJobProgress({ jobId, submitting = false, restoreUnavailable = false, submissionError = null }: { jobId: string | null; submitting?: boolean; restoreUnavailable?: boolean; submissionError?: "ambiguous" | "failed" | null }) {
  const t = useTranslations("Dashboard.videoStudio.beta");
  const [job, setJob] = useState<VideoPresentationRecord | null>(null);
  const [playback, setPlayback] = useState<string | null>(null);
  const [problem, setProblem] = useState(false);
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
        if (result.job.progressPhase === "ready") {
          const access = await getVideoPlaybackAccessAction(jobId!);
          if (active && access.status === "success") setPlayback(access.url);
          return;
        }
        if (isTerminal(result.job.progressPhase ?? null)) return;
      } catch { if (active) setProblem(true); }
      if (active) timer = setTimeout(() => { void poll(); }, 8_000);
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [jobId]);

  const phase: VideoProgressPhase | "submitting" | null = job?.progressPhase ?? (submitting ? "submitting" : submissionError ?? (restoreUnavailable ? "submission-uncertain" : null));
  if (!phase) return null;
  const isError = restoreUnavailable || phase === "failed" || phase === "ambiguous" || phase === "submission-uncertain" || submissionError !== null;
  const completedThrough = phase === "ready" ? 4
    : phase === "finalizing" ? 3
      : phase === "processing" || phase === "queued" ? 1
        : phase === "submitting" ? 0
          : phase === "failed" && job?.outputPersisted ? 3
            : phase === "failed" && job?.providerTaskKnown ? 1 : 0;
  const currentStep = phase === "ready" ? -1
    : phase === "finalizing" ? 4
      : phase === "processing" || phase === "queued" ? 2
        : phase === "submitting" ? 1
          : isError ? -1 : 0;
  const statusMessage = restoreUnavailable ? t("restoreUnavailable")
    : problem ? t("pollError")
    : phase === "submitting" ? t("sending")
      : phase === "queued" ? t("queued")
        : phase === "processing" ? t("processing")
          : phase === "finalizing" ? t("finalizing")
            : phase === "ready" ? t("ready")
              : phase === "ambiguous" || phase === "submission-uncertain" ? t("ambiguous")
                : phase === "failed" ? t("failed") : t("unknown");

  return <section className={styles.jobProgress} aria-live="polite" aria-busy={phase === "submitting" || phase === "queued" || phase === "processing" || phase === "finalizing"}>
    <div className={styles.jobProgressHeader}>
      <div>
        <h2>{t("progressTitle")}</h2>
        <p role={isError ? "alert" : "status"}>{statusMessage}</p>
      </div>
      {phase === "submitting" ? <span className={styles.progressSpinner} aria-hidden="true" /> : null}
    </div>
    {!restoreUnavailable ? <ol className={styles.progressSteps}>
      {steps.map((step, index) => {
        const done = index <= completedThrough;
        const current = index === currentStep;
        const label = step === "source" ? t("steps.source")
          : step === "request" ? t("steps.request")
            : step === "provider" ? phase === "queued" ? t("steps.queued") : t("steps.processing")
              : step === "storage" ? job?.outputPersisted ? t("steps.saved") : t("steps.storage")
                : t("steps.ready");
        return <li key={step} data-state={done ? "complete" : current ? "current" : "pending"} aria-current={current ? "step" : undefined}>
          <span aria-hidden="true">{done ? "✓" : index + 1}</span><span>{label}</span>
        </li>;
      })}
    </ol> : null}
    <div className={styles.progressActions}>
      {phase === "ready" && jobId ? <Link href={`/dashboard/videos/${jobId}`} className={styles.watchVideo}>{t("watchVideo")}</Link> : null}
      {jobId && phase === "ready" ? <VideoDownloadButton jobId={jobId} label={t("download")} /> : null}
      {playback && phase === "ready" ? <video className={styles.progressVideo} controls playsInline preload="metadata" src={playback} onError={() => { setPlayback(null); setProblem(true); }} /> : null}
      <Link href="/dashboard/videos" className={styles.libraryLink}>{t("libraryLink")}</Link>
    </div>
  </section>;
}
