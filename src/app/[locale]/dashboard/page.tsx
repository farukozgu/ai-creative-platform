import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { RecentGenerations } from "@/components/dashboard/recent-generations";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { getDashboardGenerations } from "@/lib/generations/get-dashboard-generations";
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
  const dashboardData = userId ? await getDashboardGenerations(userId) : { generations: [] };

  return (
    <main className="dashboard-main">
      <div className={`dashboard-main-inner dashboard-container ${styles.home}`}>
        <DashboardHome />
        <RecentGenerations generations={dashboardData.generations} />
      </div>
    </main>
  );
}
