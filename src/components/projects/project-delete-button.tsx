"use client";

import {useState} from "react";
import {useTranslations} from "next-intl";
import {deleteProject} from "@/app/[locale]/dashboard/actions";
import {DeleteProjectModal} from "./delete-project-modal";
import {useProjectSelection} from "./projects-selection";
import type {AppLocale} from "@/i18n/routing";
import styles from "./projects-selection.module.css";

export function ProjectDeleteButton({projectId, title, locale, messages}: {
  projectId: string; title: string; locale: AppLocale;
  messages: {title: string; description: string; cancel: string; confirm: string; deleting: string; error: string};
}) {
  const [open, setOpen] = useState(false);
  const selection = useProjectSelection();
  const t = useTranslations("Dashboard.projectManagement");
  return <div className={styles.deleteControl} onClick={event => event.stopPropagation()}>
    <button type="button" className={styles.deleteButton} aria-label={t("deleteProject", {title})} title={t("deleteProject", {title})} disabled={selection?.busy} onClick={() => setOpen(true)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6m4-6v6" /></svg>
    </button>
    {open ? <DeleteProjectModal action={deleteProject.bind(null, locale, projectId)} open={open} onClose={() => setOpen(false)} onPendingChange={selection?.setSinglePending} messages={messages} /> : null}
  </div>;
}
