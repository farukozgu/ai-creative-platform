/* eslint-disable @next/next/no-img-element -- blob URLs and expiring authorized URLs are not image-optimizer inputs. */

import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type {
  VideoAspectRatio,
  VideoSource,
} from "@/features/video/video-studio-types";
import styles from "@/features/video/video-studio-workspace.module.css";

type VideoCanvasProps = {
  onUpload: () => void;
  onChooseLibrary: () => void;
  emptyCopy: { upload: string; library: string; example: string; exampleAlt: string; steps: string[] };
  showExample: boolean;
  criticalRegion?: import("@/lib/video-generation/preservation").CriticalProductRegion | null;
  source: VideoSource | null;
  aspectRatio: VideoAspectRatio;
  previewLabel: string;
  draftLabel: string;
  libraryLabel: string;
  sourceAlt: string;
  imageEmptyTitle: string;
  imageEmptyDescription: string;
};

export function VideoCanvas({
  onUpload,
  onChooseLibrary,
  emptyCopy,
  showExample,
  criticalRegion,
  source,
  aspectRatio,
  previewLabel,
  draftLabel,
  libraryLabel,
  sourceAlt,
  imageEmptyTitle,
  imageEmptyDescription,
}: VideoCanvasProps) {
  const region = criticalRegion;
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
        <div className={styles.preview} data-empty={!source || undefined}>
            {source ? <div className={styles.mediaFrame} data-aspect-ratio={aspectRatio}>
              <img src={source.previewUrl} alt={sourceAlt} />
              {region ? <span className={styles.regionBox} aria-hidden="true" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }} /> : null}
            </div> : (
              <div className={styles.canvasEmpty} aria-live="polite">
                {showExample ? <figure className={styles.exampleVisual}>
                  <Image src="/workspace-demo/fashion/campaign.webp" alt={emptyCopy.exampleAlt} width={1536} height={1024} sizes="(max-width: 1023px) 90vw, 45vw" />
                  <figcaption><DashboardIcon name="video" />{emptyCopy.example}</figcaption>
                </figure> : <span className={styles.progressSpinner} aria-hidden="true" />}
                <h2>{imageEmptyTitle}</h2>
                <p>{imageEmptyDescription}</p>
                <div className={styles.emptyActions}>
                  <Button onClick={onUpload}>{emptyCopy.upload}</Button>
                  <Button variant="secondary" onClick={onChooseLibrary}>{emptyCopy.library}</Button>
                </div>
                <ol className={styles.emptyGuide}>{emptyCopy.steps.map((step, index) => <li key={step}><span aria-hidden="true">{index + 1}</span>{step}</li>)}</ol>
              </div>
            )}
        </div>
      </div>
    </section>
  );
}
