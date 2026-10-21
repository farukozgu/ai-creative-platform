import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import styles from "@/features/video/video-studio-workspace.module.css";

export function VideoGenerationStrip({
  title,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <section className={styles.generationStrip} aria-labelledby="video-generations-title">
      <div className={styles.stripHeading}>
        <h2 id="video-generations-title">{title}</h2>
      </div>
      <div className={styles.stripEmpty}>
        <DashboardIcon name="video" />
        <div>
          <strong>{emptyTitle}</strong>
          <p>{emptyDescription}</p>
        </div>
      </div>
    </section>
  );
}
