/* eslint-disable @next/next/no-img-element -- blob URLs and expiring authorized URLs are not image-optimizer inputs. */

import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { VideoGenerationStrip } from "@/features/video/video-generation-strip";
import { Link } from "@/i18n/navigation";
import type {
  VideoAspectRatio,
  VideoSource,
} from "@/features/video/video-studio-types";
import styles from "@/features/video/video-studio-workspace.module.css";

type VideoCanvasProps = {
  source: VideoSource | null;
  aspectRatio: VideoAspectRatio;
  previewLabel: string;
  draftLabel: string;
  libraryLabel: string;
  sourceAlt: string;
  imageEmptyTitle: string;
  imageEmptyDescription: string;
  generationsTitle: string;
  generationsEmptyTitle: string;
  generationsEmptyDescription: string;
};

export function VideoCanvas({
  source,
  aspectRatio,
  previewLabel,
  draftLabel,
  libraryLabel,
  sourceAlt,
  imageEmptyTitle,
  imageEmptyDescription,
  generationsTitle,
  generationsEmptyTitle,
  generationsEmptyDescription,
}: VideoCanvasProps) {
  return (
    <section className={styles.canvas} aria-label={previewLabel}>
      <div className={styles.canvasPanel}>
        <header className={styles.canvasToolbar}>
          <span>{previewLabel}</span>
          <div>
            <Link href="/dashboard/videos" className={styles.canvasLibraryLink}>{libraryLabel}</Link>
            <span className={styles.canvasStatus}>{draftLabel}</span>
            <strong>{aspectRatio}</strong>
          </div>
        </header>
        <div className={styles.preview}>
          <div className={styles.mediaFrame} data-aspect-ratio={aspectRatio}>
            {source ? (
              <img src={source.previewUrl} alt={sourceAlt} />
            ) : (
              <div className={styles.canvasEmpty} aria-live="polite">
                <span className={styles.canvasIcon} aria-hidden="true">
                  <DashboardIcon name="image" />
                </span>
                <h2>{imageEmptyTitle}</h2>
                <p>{imageEmptyDescription}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <VideoGenerationStrip
        title={generationsTitle}
        emptyTitle={generationsEmptyTitle}
        emptyDescription={generationsEmptyDescription}
      />
    </section>
  );
}
