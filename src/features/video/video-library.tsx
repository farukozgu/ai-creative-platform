"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { VideoCard, type VideoCardCopy } from "@/features/video/video-card";
import {
  filterVideoRecords,
  type VideoLibraryFilter,
  type VideoLibrarySort,
} from "@/features/video/video-library-state";
import type { VideoPresentationRecord, VideoStatus } from "@/features/video/video-studio-types";
import { Link } from "@/i18n/navigation";
import { listVideoGenerationsAction } from "@/app/[locale]/dashboard/video/generation-actions";
import styles from "@/features/video/video-library.module.css";

type VideoLibraryProps = {
  records: readonly VideoPresentationRecord[];
  locale: string;
};

const filters: VideoLibraryFilter[] = ["all", "image"];
const statuses: VideoStatus[] = ["queued", "processing", "ready", "failed", "unavailable"];

export function VideoLibrary({ records: initialRecords, locale }: VideoLibraryProps) {
  const [records, setRecords] = useState(initialRecords);
  useEffect(() => {
    if (!records.some(record => record.status === "queued" || record.status === "processing")) return;
    let active = true;
    const timer = setTimeout(() => { void listVideoGenerationsAction().then(result => {
      if (active) setRecords(result.status === "success" ? result.records : [...records]);
    }).catch(() => { if (active) setRecords([...records]); }); }, 8_000);
    return () => { active = false; clearTimeout(timer); };
  }, [records]);
  const t = useTranslations("Dashboard.videoLibrary");
  const [filter, setFilter] = useState<VideoLibraryFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<VideoLibrarySort>("newest");
  const visibleRecords = useMemo(
    () => filterVideoRecords(records, { filter, query, sort }),
    [records, filter, query, sort],
  );
  const isEmpty = records.length === 0;
  const cardCopy: VideoCardCopy = {
    open: t("card.open"),
    download: t("card.download"),
    noPreview: t("card.noPreview"),
    thumbnailAlt: t("card.thumbnailAlt"),
    mode: { image: t("modes.image"), text: t("modes.text") },
    status: Object.fromEntries(statuses.map((status) => [status, t(`status.${status}`)])) as Record<VideoStatus, string>,
    seconds: (value) => t("card.seconds", { value }),
  };

  function resetControls() {
    setFilter("all");
    setQuery("");
    setSort("newest");
  }

  return (
    <main className="dashboard-main">
      <div className={`dashboard-main-inner dashboard-container ${styles.page}`}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>{t("eyebrow")}</p>
            <h1>{t("title")}</h1>
            <p>{t("description")}</p>
          </div>
          <Link href="/dashboard/video" className={styles.primaryAction}>
            <DashboardIcon name="plus" />
            <span>{t("newVideo")}</span>
          </Link>
        </header>

        <section className={styles.toolbar} aria-label={t("toolbar.label")}>
          <div className={styles.filters} role="group" aria-label={t("toolbar.filterLabel")}>
            {filters.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                disabled={isEmpty}
                onClick={() => setFilter(value)}
              >
                {t(`filters.${value}`)}
              </button>
            ))}
          </div>
          <label className={styles.search}>
            <span className="sr-only">{t("toolbar.searchLabel")}</span>
            <DashboardIcon name="search" />
            <input
              type="search"
              value={query}
              disabled={isEmpty}
              placeholder={t("toolbar.searchPlaceholder")}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className={styles.sort}>
            <span>{t("toolbar.sortLabel")}</span>
            <select
              value={sort}
              disabled={isEmpty}
              onChange={(event) => setSort(event.target.value as VideoLibrarySort)}
            >
              <option value="newest">{t("sort.newest")}</option>
              <option value="oldest">{t("sort.oldest")}</option>
            </select>
          </label>
        </section>

        {isEmpty ? (
          <section className={styles.emptyState} role="status">
            <span className={styles.emptyIcon} aria-hidden="true"><DashboardIcon name="videoLibrary" /></span>
            <h2>{t("empty.title")}</h2>
            <p>{t("empty.description")}</p>
            <Link href="/dashboard/video" className={styles.secondaryAction}>{t("empty.action")}</Link>
          </section>
        ) : visibleRecords.length === 0 ? (
          <section className={styles.emptyState} role="status">
            <span className={styles.emptyIcon} aria-hidden="true"><DashboardIcon name="search" /></span>
            <h2>{t("noResults.title")}</h2>
            <p>{t("noResults.description")}</p>
            <button type="button" className={styles.secondaryAction} onClick={resetControls}>{t("noResults.action")}</button>
          </section>
        ) : (
          <section aria-label={t("galleryLabel")}>
            <p className={styles.resultCount}>{t("resultCount", { count: visibleRecords.length })}</p>
            <ul className={styles.grid}>
              {visibleRecords.map((record) => <VideoCard key={record.id} record={record} locale={locale} copy={cardCopy} />)}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
