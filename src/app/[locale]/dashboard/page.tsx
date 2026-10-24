import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { RecentGenerations } from "@/components/dashboard/recent-generations";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { getDashboardOverview } from "@/lib/dashboard/get-dashboard-overview";
import { isSupportedLocale } from "@/i18n/routing";
import styles from "@/components/dashboard/dashboard-home.module.css";

type DashboardPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: DashboardPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: "Dashboard" });
  return {
    title: t("metadataTitle"),
    description: t("metadataDescription"),
  };
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const userId = await getAuthenticatedUserId();
  const [overview, t] = await Promise.all([
    userId ? getDashboardOverview(userId) : Promise.resolve({
      counts: { projects: null, images: null, models: null, videos: null },
      projects: [], models: [], creations: [],
    }),
    getTranslations({ locale, namespace: "Dashboard.homeOverview" }),
  ]);

  return (
    <main className="dashboard-main">
      <div className={`dashboard-main-inner dashboard-container ${styles.home}`}>
        <DashboardHome overview={overview} />
        {overview.creations === null ? <section className={styles.panel} aria-labelledby="overview-creations-title"><div className={styles.panelHeading}><h2 id="overview-creations-title">{t("recentCreations")}</h2></div><p className={styles.activityEmpty} role="status">{t("creationsUnavailable")}</p></section> : <RecentGenerations generations={overview.creations} />}
      </div>
    </main>
  );
}
