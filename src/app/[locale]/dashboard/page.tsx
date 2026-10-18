import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CreationHomeEntry } from "@/features/generation/creation-home-entry";
import { DashboardHomeHero } from "@/components/dashboard/dashboard-home-hero";
import { WorkspaceOverview } from "@/components/dashboard/workspace-overview";
import { RecentGenerations } from "@/components/dashboard/recent-generations";
import { TemplateRail } from "@/components/dashboard/template-rail";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { getDashboardGenerations } from "@/lib/generations/get-dashboard-generations";
import { isSupportedLocale } from "@/i18n/routing";

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
  const dashboardData = userId ? await getDashboardGenerations(userId) : { projectCount: 0, completedCount: 0, activeCount: 0, generations: [] };

  return (
    <main className="dashboard-main">
      <div className="dashboard-main-inner dashboard-container dashboard-home-inner">
        <DashboardHomeHero />
        <div className="dashboard-home-create">
          <CreationHomeEntry />
        </div>
        <TemplateRail />
        <RecentGenerations generations={dashboardData.generations} />
        <WorkspaceOverview projectCount={dashboardData.projectCount} completedCount={dashboardData.completedCount} activeCount={dashboardData.activeCount} />
      </div>
    </main>
  );
}
