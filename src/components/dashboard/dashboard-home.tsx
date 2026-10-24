import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { DashboardIcon } from "./dashboard-icons";
import { DashboardWorkflowRail } from "./dashboard-workflow-rail";
import { CreationHomeEntry } from "@/features/generation/creation-home-entry";
import { creationHref } from "@/features/generation/creation-entry";
import { getCreativePreset } from "@/lib/creative-presets/creative-presets";
import { Link } from "@/i18n/navigation";
import { dashboardDiscoveryWorkflows, dashboardLauncherWorkflows } from "@/data/dashboard-home-workflows";
import styles from "./dashboard-home.module.css";

export async function DashboardHome() {
  const t = await getTranslations("Dashboard.home");

  return (
    <>
      <section className={styles.discovery} aria-labelledby="dashboard-discovery-title">
        <div className={styles.intro}>
          <p className={styles.eyebrow}><DashboardIcon name="spark" />{t("eyebrow")}</p>
          <h1 id="dashboard-discovery-title">{t("discoveryHeading")}</h1>
          <p>{t("discoveryDescription")}</p>
        </div>
        <DashboardWorkflowRail label={t("discoveryLabel")} previousLabel={t("previousWorkflow")} nextLabel={t("nextWorkflow")}>
          {dashboardDiscoveryWorkflows.map(({ key, presetId }, index) => {
            const preset = getCreativePreset(presetId);
            if (!preset) return null;
            return (
              <Link key={key} href={creationHref({ presetId, presentationMode: null })} className={styles.workflowCard}>
                <span className={styles.workflowMedia}>
                  <Image src={preset.thumbnail} alt="" fill sizes="(max-width: 639px) 82vw, (max-width: 1023px) 42vw, (max-width: 1199px) 30vw, 24vw" loading={index === 0 ? "eager" : "lazy"} />
                  <span className={styles.workflowCategory}>{t(`workflows.${key}.category`)}</span>
                  <span className={styles.workflowAction} aria-hidden="true">{t("workflowAction")}</span>
                </span>
                <span className={styles.workflowCopy}>
                  <strong>{t(`workflows.${key}.title`)}</strong>
                  <span>{t(`workflows.${key}.description`)}</span>
                  <span className={styles.workflowArrow}><DashboardIcon name="arrow" /></span>
                </span>
              </Link>
            );
          })}
        </DashboardWorkflowRail>
      </section>

      <section className={styles.launchSection} aria-labelledby="dashboard-launch-title">
        <div className={styles.sectionHeading}>
          <h2 id="dashboard-launch-title">{t("launcherHeading")}</h2>
          <p>{t("launcherDescription")}</p>
        </div>
        <div className={styles.launchGrid}>
          <CreationHomeEntry className={styles.launchRow}>
            <span className={styles.launchIcon}><DashboardIcon name="image" /></span>
            <span className={styles.launchCopy}><strong>{t("launchers.create.title")}</strong><span>{t("launchers.create.description")}</span></span>
            <DashboardIcon name="arrow" className={styles.launchArrow} />
          </CreationHomeEntry>
          {dashboardLauncherWorkflows.map(({ key, presetId }) => {
            const preset = getCreativePreset(presetId);
            if (!preset) return null;
            return (
              <Link key={key} href={creationHref({ presetId, presentationMode: null })} className={styles.launchRow}>
                <span className={styles.launchIcon}><DashboardIcon name={key === "fashion" ? "apparel" : "cosmetics"} /></span>
                <span className={styles.launchCopy}><strong>{t(`launchers.${key}.title`)}</strong><span>{t(`launchers.${key}.description`)}</span></span>
                <DashboardIcon name="arrow" className={styles.launchArrow} />
              </Link>
            );
          })}
          <Link href="/dashboard/projects" className={styles.launchRow}>
            <span className={styles.launchIcon}><DashboardIcon name="projects" /></span>
            <span className={styles.launchCopy}><strong>{t("launchers.projects.title")}</strong><span>{t("launchers.projects.description")}</span></span>
            <DashboardIcon name="arrow" className={styles.launchArrow} />
          </Link>
        </div>
      </section>
    </>
  );
}
