/* eslint-disable @next/next/no-img-element -- source and video thumbnails can be expiring authenticated URLs. */

import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { isVideoPlayable } from "@/features/video/video-library-state";
import type {
  VideoCameraMovement,
  VideoPresentationRecord,
  VideoStatus,
} from "@/features/video/video-studio-types";
import { Link } from "@/i18n/navigation";
import styles from "@/features/video/video-library.module.css";
import { VideoJobProgress } from "./video-job-progress";
import { VideoDownloadButton } from "./video-download-button";

export type VideoDetailCopy = {
  back: string;
  download: string;
  playerLabel: string;
  thumbnailAlt: string;
  sourceAlt: string;
  unavailable: Record<VideoStatus, { title: string; description: string }>;
  detailsTitle: string;
  labels: {
    mode: string;
    prompt: string;
    camera: string;
    quality: string;
    aspectRatio: string;
    duration: string;
    createdAt: string;
    source: string;
  };
  mode: Record<VideoPresentationRecord["generationMode"], string>;
  status: Record<VideoStatus, string>;
  camera: Record<VideoCameraMovement, string>;
  quality: Record<NonNullable<VideoPresentationRecord["quality"]>, string>;
  seconds: (value: number) => string;
};

type VideoDetailProps = {
  record: VideoPresentationRecord;
  locale: string;
  copy: VideoDetailCopy;
};

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(date);
}

export function VideoDetail({ record, locale, copy }: VideoDetailProps) {
  const playable = isVideoPlayable(record);
  const createdAt = formatDate(record.createdAt, locale);
  const metadata = [
    { label: copy.labels.mode, value: copy.mode[record.generationMode] },
    { label: copy.labels.prompt, value: record.prompt },
    { label: copy.labels.camera, value: record.cameraMovement ? copy.camera[record.cameraMovement] : null },
    { label: copy.labels.quality, value: record.quality ? copy.quality[record.quality] : null },
    { label: copy.labels.aspectRatio, value: record.aspectRatio },
    { label: copy.labels.duration, value: record.durationSeconds ? copy.seconds(record.durationSeconds) : null },
    { label: copy.labels.createdAt, value: createdAt },
    { label: copy.labels.source, value: record.sourceImage?.name },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));

  return (
    <main className="dashboard-main">
      <div className={`dashboard-main-inner dashboard-container ${styles.detailPage}`}>
        <header className={styles.detailHeader}>
          <Link href="/dashboard/videos" className={styles.backLink}>
            <DashboardIcon name="arrow" />
            <span>{copy.back}</span>
          </Link>
          <div className={styles.detailHeading}>
            <div>
              <h1>{record.title}</h1>
              <p><span className={`${styles.status} ${styles[`status_${record.status}`]}`}>{copy.status[record.status]}</span></p>
            </div>
            {playable ? <VideoDownloadButton jobId={record.id} label={copy.download} /> : null}
          </div>
        </header>
        {record.status === "queued" || record.status === "processing" ? <VideoJobProgress jobId={record.id} /> : null}

        <section className={styles.detailLayout}>
          <div className={styles.playerPanel} aria-label={copy.playerLabel}>
            <div className={styles.playerStage} data-aspect-ratio={record.aspectRatio ?? "16:9"}>
              {playable ? (
                <video controls preload="metadata" playsInline poster={record.thumbnailUrl ?? undefined}>
                  <source src={record.playbackUrl ?? undefined} />
                </video>
              ) : (
                <div className={styles.playerEmpty} role="status">
                  {record.thumbnailUrl ? <img src={record.thumbnailUrl} alt={copy.thumbnailAlt} /> : null}
                  <span className={styles.emptyIcon} aria-hidden="true"><DashboardIcon name="video" /></span>
                  <h2>{copy.unavailable[record.status].title}</h2>
                  <p>{copy.unavailable[record.status].description}</p>
                </div>
              )}
            </div>
          </div>

          {metadata.length > 0 || record.sourceImage?.thumbnailUrl ? (
            <aside className={styles.metadataPanel}>
              <h2>{copy.detailsTitle}</h2>
              {metadata.length > 0 ? (
                <dl>
                  {metadata.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
                </dl>
              ) : null}
              {record.sourceImage?.thumbnailUrl ? (
                <div className={styles.sourceImage}>
                  <img src={record.sourceImage.thumbnailUrl} alt={copy.sourceAlt} />
                </div>
              ) : null}
            </aside>
          ) : null}
        </section>
      </div>
    </main>
  );
}
