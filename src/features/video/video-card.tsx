/* eslint-disable @next/next/no-img-element -- video thumbnails can be expiring authenticated URLs. */

import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { Link } from "@/i18n/navigation";
import { VideoDownloadButton } from "./video-download-button";
import type { VideoPresentationRecord, VideoStatus } from "@/features/video/video-studio-types";
import styles from "@/features/video/video-library.module.css";

export type VideoCardCopy = {
  legacyLocal: string;
  open: string;
  download: string;
  noPreview: string;
  thumbnailAlt: string;
  mode: Record<VideoPresentationRecord["generationMode"], string>;
  status: Record<VideoStatus, string>;
  seconds: (value: number) => string;
};

type VideoCardProps = {
  record: VideoPresentationRecord;
  locale: string;
  copy: VideoCardCopy;
};

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

export function VideoCard({ record, locale, copy }: VideoCardProps) {
  const createdAt = formatDate(record.createdAt, locale);
  const legacyLocal = record.generationMethod === "legacy-local";
  const title = legacyLocal ? copy.legacyLocal : record.title;

  return (
    <li>
      <article className={styles.card}>
        <Link
          href={`/dashboard/videos/${record.id}`}
          className={styles.cardMedia}
          aria-label={`${copy.open}: ${title}`}
        >
          {record.thumbnailUrl ? (
            <img src={record.thumbnailUrl} alt={copy.thumbnailAlt} />
          ) : (
            <span className={styles.cardMediaEmpty}>
              <DashboardIcon name="video" />
              <span>{copy.noPreview}</span>
            </span>
          )}
          <span className={styles.cardArrow} aria-hidden="true">
            <DashboardIcon name="arrow" />
          </span>
        </Link>

        <div className={styles.cardBody}>
          <div className={styles.cardTitleRow}>
            <h2><Link href={`/dashboard/videos/${record.id}`}>{title}</Link></h2>
            <span className={`${styles.status} ${styles[`status_${record.status}`]}`}>
              {copy.status[record.status]}
            </span>
          </div>
          <p className={styles.cardMeta}>
            <span>{legacyLocal ? copy.legacyLocal : copy.mode[record.generationMode]}</span>
            {record.aspectRatio ? <span>{record.aspectRatio}</span> : null}
            {record.durationSeconds ? <span>{copy.seconds(record.durationSeconds)}</span> : null}
            {createdAt ? <time dateTime={record.createdAt ?? undefined}>{createdAt}</time> : null}
          </p>
          <div className={styles.cardActions}>
            <Link href={`/dashboard/videos/${record.id}`}>{copy.open}</Link>
            {record.status === "ready" ? <VideoDownloadButton jobId={record.id} label={copy.download} /> : null}
          </div>
        </div>
      </article>
    </li>
  );
}
