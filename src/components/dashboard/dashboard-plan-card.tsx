"use client";

import { useTranslations } from "next-intl";
import { dashboardPlanPreview } from "@/data/dashboard-plan-preview";
import { Link } from "@/i18n/navigation";

export function DashboardPlanCard({ collapsed = false }: { collapsed?: boolean }) {
  const t = useTranslations("Dashboard.navigation.plan");
  if (collapsed) return <div className="dashboard-plan-compact" tabIndex={0} aria-label={`${t("label")}: ${t("creditsUnavailable")}`}>
    <span aria-hidden="true">✦</span>
    <div className="dashboard-plan-compact-tooltip" role="group" aria-label={t("label")}>
      <div className="dashboard-plan-card-heading"><span>{t("label")}</span><strong>{dashboardPlanPreview.planName}</strong></div>
      <strong className="dashboard-plan-credit-count">{t("creditsUnavailable")}</strong>
      <Link className="dashboard-plan-upgrade" href="/dashboard/account">{t("upgrade")}</Link>
    </div>
  </div>;
  return <section className="dashboard-plan-card" aria-label={t("label")}>
    <div className="dashboard-plan-card-heading"><span>{t("label")}</span><strong>{dashboardPlanPreview.planName}</strong></div>
    <strong className="dashboard-plan-credit-count">{t("creditsUnavailable")}</strong>
    <Link className="dashboard-plan-upgrade" href="/dashboard/account">{t("upgrade")}</Link>
  </section>;
}
