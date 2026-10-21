"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { Link } from "@/i18n/navigation";
import type { PersistedModelProfile } from "@/features/models/model-profile";
import styles from "@/features/models/model-studio.module.css";

export function ModelLibrary({ records }: { records: PersistedModelProfile[] }) {
  const t = useTranslations("Dashboard.modelStudio.library");
  const draftT = useTranslations("Dashboard.modelStudioDraft");
  const [query, setQuery] = useState("");

  return <main className="dashboard-main"><div className={`dashboard-main-inner dashboard-container ${styles.page}`}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>{t("eyebrow")}</p><h1>{t("title")}</h1><p>{t("description")}</p></div>
      <Link href="/dashboard/models/create" className={styles.primaryAction}><DashboardIcon name="plus" /><span>{t("create")}</span></Link>
    </header>
    <section className={styles.toolbar} aria-label={t("toolbarLabel")}>
      <label className={styles.search}><span className="sr-only">{t("searchLabel")}</span><DashboardIcon name="search" /><input type="search" value={query} placeholder={t("searchPlaceholder")} onChange={(event) => setQuery(event.target.value)} /></label>
    </section>
    {records.length === 0 ? <section className={styles.emptyState} aria-live="polite">
      <span className={styles.emptyIcon} aria-hidden="true"><DashboardIcon name="models" /></span>
      <h2>{t("empty.title")}</h2><p>{t("empty.description")}</p>
      <Link href="/dashboard/models/create" className={styles.secondaryAction}>{t("empty.action")}</Link>
    </section> : <section aria-label={draftT("resultLabel")}><ul className={styles.grid}>{records.filter((record) => record.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((record) => <li key={record.id} className={styles.card}><Link href={`/dashboard/models/${record.id}`}><h2>{record.name}</h2><p>{draftT(record.status)}</p><time dateTime={record.updatedAt}>{draftT("updated", { date: new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(record.updatedAt)) })}</time></Link></li>)}</ul></section>}
  </div></main>;
}
