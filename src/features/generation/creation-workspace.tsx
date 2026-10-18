"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import styles from "./creation-workspace.module.css";

export function CreationWorkspace({ children }: { children: ReactNode }) {
  const t = useTranslations("Dashboard.creationWorkspace");
  const [view, setView] = useState<"controls" | "preview">("controls");
  return (
    <main className={styles.workspace} data-view={view} aria-label={t("title")}>
      <div className={styles.viewSwitch} role="group" aria-label={t("viewLabel")}>
        <button type="button" aria-pressed={view === "controls"} aria-controls="creation-inspector" onClick={() => setView("controls")}>{t("controls")}</button>
        <button type="button" aria-pressed={view === "preview"} aria-controls="creation-canvas" onClick={() => setView("preview")}>{t("preview")}</button>
      </div>
      <div id="creation-inspector" className={styles.inspector} onClickCapture={(event) => {
        if ((event.target as HTMLElement).closest(".creation-actions")) setView("controls");
      }}>
        {children}
      </div>
      <section id="creation-canvas" className={styles.canvas} aria-label={t("preview")}>
        <div className={styles.empty}>
          <DashboardIcon name="image" />
          <h2>{t("emptyTitle")}</h2>
          <p>{t("emptyDescription")}</p>
        </div>
      </section>
    </main>
  );
}
