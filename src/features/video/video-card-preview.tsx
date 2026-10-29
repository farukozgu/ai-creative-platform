"use client";

/* eslint-disable @next/next/no-img-element -- media URLs are signed and expire. */
import { useEffect, useRef, useState } from "react";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { getVideoPlaybackAccessAction } from "@/app/[locale]/dashboard/video/generation-actions";
import type { VideoPresentationRecord } from "./video-studio-types";
import styles from "./video-library.module.css";

export function VideoCardPreview({ record, alt, unavailable }: {
  record: VideoPresentationRecord;
  alt: string;
  unavailable: string;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState(record.playbackUrl ?? null);
  const [videoFailed, setVideoFailed] = useState(false);
  const thumbnail = record.thumbnailUrl && !failedImages.includes(record.thumbnailUrl) ? record.thumbnailUrl : null;
  const source = record.sourceImage?.thumbnailUrl;
  const fallback = source && !failedImages.includes(source) ? source : null;

  useEffect(() => {
    if (thumbnail || record.status !== "ready" || videoUrl || videoFailed || !host.current) return;
    let active = true;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      void getVideoPlaybackAccessAction(record.id).then(result => {
        if (!active) return;
        if (result.status === "success") setVideoUrl(result.url);
        else setVideoFailed(true);
      }).catch(() => { if (active) setVideoFailed(true); });
    }, { rootMargin: "200px" });
    observer.observe(host.current);
    return () => { active = false; observer.disconnect(); };
  }, [record.id, record.status, thumbnail, videoUrl, videoFailed]);

  const image = thumbnail ?? fallback;
  return <span ref={host} className={styles.cardPreview}>
    {thumbnail || !videoUrl || videoFailed ? image ? (
      <img src={image} alt={alt} loading="lazy" decoding="async" onError={() => setFailedImages(previous => [...previous, image])} />
    ) : (
      <span className={styles.cardMediaEmpty}><DashboardIcon name="video" /><span>{unavailable}</span></span>
    ) : (
      <video src={videoUrl} muted playsInline preload="metadata" aria-label={alt}
        onLoadedMetadata={event => {
          // Seek just past the start so browsers display a frame without playback.
          const video = event.currentTarget;
          if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(0.1, video.duration / 2);
        }}
        onError={() => setVideoFailed(true)} />
    )}
  </span>;
}
