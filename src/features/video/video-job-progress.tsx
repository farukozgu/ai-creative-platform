"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getVideoPlaybackAccessAction, readVideoGenerationStatusAction } from "@/app/[locale]/dashboard/video/generation-actions";
import type { VideoPresentationRecord } from "./video-studio-types";
import { Link } from "@/i18n/navigation";
import { VideoDownloadButton } from "./video-download-button";
import styles from "./video-studio-workspace.module.css";

export function VideoJobProgress({ jobId }: { jobId: string }) {
  const t = useTranslations("Dashboard.videoStudio.beta");
  const [job, setJob] = useState<VideoPresentationRecord | null>(null);
  const [playback, setPlayback] = useState<string | null>(null);
  const [problem, setProblem] = useState(false);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await readVideoGenerationStatusAction(jobId);
        if (!active) return;
        if (result.status !== "success") throw new Error("Video status unavailable.");
        setJob(result.job); setProblem(false);
        if (result.job.status === "ready") {
          const access = await getVideoPlaybackAccessAction(jobId);
          if (active && access.status === "success") setPlayback(access.url);
          return;
        }
        if (result.job.status === "failed") return;
      } catch { if (active) setProblem(true); }
      if (active) timer = setTimeout(() => { void poll(); }, 8_000);
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [jobId]);

  return <section className={styles.generationStrip} aria-live="polite">
    <p>{problem ? t("pollError") : t(job?.status === "ready" ? "ready" : job?.status === "failed" ? "failed" : "processing")}</p>
    {playback ? <video className={styles.progressVideo} controls playsInline preload="metadata" src={playback} onError={() => { setPlayback(null); setProblem(true); }} /> : null}
    {job?.status === "ready" ? <VideoDownloadButton jobId={jobId} label={t("download")} /> : null}
    <Link href={`/dashboard/videos/${jobId}`}>{t("openVideo")}</Link>
  </section>;
}
