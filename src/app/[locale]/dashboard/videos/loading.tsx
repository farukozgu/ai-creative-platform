import { Skeleton } from "@/components/ui/skeleton";
import styles from "@/features/video/video-library.module.css";

export default function VideosLoading() {
  return (
    <main className="dashboard-main" aria-busy="true">
      <div className={`dashboard-main-inner dashboard-container ${styles.page}`} aria-hidden="true">
        <header className={styles.header}>
          <div><Skeleton className="skeleton-title" /><Skeleton className="skeleton-meta" /></div>
          <Skeleton className="projects-loading-button" />
        </header>
        <Skeleton className="projects-loading-toolbar" />
        <ul className={styles.grid}>
          {[0, 1, 2, 3].map((item) => <li key={item}><article className={styles.card}><Skeleton className="generation-card-skeleton-media" /><div className={styles.cardBody}><Skeleton className="skeleton-title" /><Skeleton className="skeleton-meta" /></div></article></li>)}
        </ul>
      </div>
    </main>
  );
}
