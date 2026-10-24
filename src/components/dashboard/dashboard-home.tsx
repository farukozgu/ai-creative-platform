import { getLocale, getTranslations } from "next-intl/server";

import { DashboardIcon } from "./dashboard-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, getPathname } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import type { DashboardOverview } from "@/lib/dashboard/get-dashboard-overview";
import styles from "./dashboard-home.module.css";

export async function DashboardHome({ overview }: { overview: DashboardOverview }) {
  const [t, projectT, modelT, locale] = await Promise.all([
    getTranslations("Dashboard.homeOverview"),
    getTranslations("Dashboard.projectsIndex"),
    getTranslations("Dashboard.modelStudioDraft"),
    getLocale(),
  ]);
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const numberFormatter = new Intl.NumberFormat(locale);
  const metrics = [
    { key: "projects", icon: "projects", href: "/dashboard/projects" },
    { key: "images", icon: "image", href: "/dashboard/projects" },
    { key: "models", icon: "models", href: "/dashboard/models" },
    { key: "videos", icon: "video", href: "/dashboard/videos" },
  ] as const;

  return <>
    <header className={styles.overviewHeader}>
      <div><h1>{t("title")}</h1><p>{t("description")}</p></div>
      <Button href={getPathname({ locale: locale as AppLocale, href: "/dashboard/create" })} className={styles.createAction}>
        <DashboardIcon name="plus" /><span>{t("create")}</span>
      </Button>
    </header>

    <section aria-label={t("statistics")}>
      <dl className={styles.statsGrid}>{metrics.map(({ key, icon, href }) => <div className={styles.statCard} key={key}>
        <dt><span className={styles.statIcon} data-kind={key}><DashboardIcon name={icon} /></span><Link href={href}>{t(`metrics.${key}`)}</Link></dt>
        <dd>{overview.counts[key] === null ? <span className={styles.unavailable}>{t("unavailable")}</span> : numberFormatter.format(overview.counts[key])}</dd>
      </div>)}</dl>
    </section>

    <div className={styles.activityGrid}>
      <section className={styles.panel} aria-labelledby="overview-projects-title">
        <div className={styles.panelHeading}><h2 id="overview-projects-title">{t("recentProjects")}</h2><Link href="/dashboard/projects">{t("allProjects")}<DashboardIcon name="arrow" /></Link></div>
        {overview.projects === null ? <p className={styles.activityEmpty} role="status">{t("projectsUnavailable")}</p> : overview.projects.length === 0 ? <div className={styles.activityEmpty}>
          <DashboardIcon name="projects" /><h3>{t("emptyProjectsTitle")}</h3><p>{t("emptyProjectsDescription")}</p><Link href="/dashboard/create">{t("create")}</Link>
        </div> : <ul className={styles.projectList}>{overview.projects.map(project => <li key={project.id}>
          <Link href={`/dashboard/projects/${project.id}`} className={styles.projectRow}>
            <span className={styles.projectPreview}>{project.thumbnail_url ? <>
              {/* Private signed URLs retain the existing storage access path. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={project.thumbnail_url} alt="" loading="lazy" />
            </> : <DashboardIcon name="projects" />}</span>
            <span className={styles.projectCopy}><strong>{project.title?.trim() || t("untitledProject")}</strong><time dateTime={project.updated_at}>{t("updated", { date: dateFormatter.format(new Date(project.updated_at)) })}</time></span>
            <Badge className={styles.status}>{projectT(project.status)}</Badge>
            <DashboardIcon name="arrow" className={styles.rowArrow} />
          </Link>
        </li>)}</ul>}
      </section>

      <section className={styles.panel} aria-labelledby="overview-models-title">
        <div className={styles.panelHeading}><h2 id="overview-models-title">{t("recentModels")}</h2><Link href="/dashboard/models">{t("allModels")}<DashboardIcon name="arrow" /></Link></div>
        {overview.models === null ? <p className={styles.activityEmpty} role="status">{t("modelsUnavailable")}</p> : overview.models.length === 0 ? <div className={styles.activityEmpty}>
          <DashboardIcon name="models" /><h3>{t("emptyModelsTitle")}</h3><p>{t("emptyModelsDescription")}</p><Link href="/dashboard/models/create">{t("createModel")}</Link>
        </div> : <ul className={styles.modelList}>{overview.models.map(model => <li key={model.id}>
          <Link href={`/dashboard/models/${model.id}`} className={styles.modelRow}>
            <span className={styles.modelIcon}><DashboardIcon name="models" /></span>
            <span className={styles.projectCopy}><strong>{model.name}</strong><span>{modelT(model.status)}</span><time dateTime={model.updated_at}>{dateFormatter.format(new Date(model.updated_at))}</time></span>
            <DashboardIcon name="arrow" className={styles.rowArrow} />
          </Link>
        </li>)}</ul>}
      </section>
    </div>
  </>;
}
