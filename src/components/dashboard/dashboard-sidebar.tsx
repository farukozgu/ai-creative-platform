"use client";

import { Button } from "@/components/ui/button";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { dashboardPrimaryNavigation } from "@/data/dashboard-navigation";
import { Link } from "@/i18n/navigation";
import { DashboardPlanCard } from "@/components/dashboard/dashboard-plan-card";
import { DashboardAccountMenu } from "@/components/dashboard/dashboard-account-menu";
import { useDashboardNavigationLocation } from "@/hooks/use-dashboard-navigation-location";
import styles from "@/components/dashboard/dashboard-sidebar.module.css";

type DashboardSidebarProps = {
  displayName?: string | null;
  collapsed: boolean;
  onToggle: () => void;
};

export function DashboardSidebar({ displayName, collapsed, onToggle }: DashboardSidebarProps) {
  const t = useTranslations("Dashboard.navigation");
  const { isActive } = useDashboardNavigationLocation();
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  function tooltip(label: string, id: string) {
    return collapsed ? <span id={id} role="tooltip" className={styles.tooltip}>{label}</span> : null;
  }

  return <aside className={styles.sidebar} aria-label={t("primaryLabel")} data-tooltip-dismissed={tooltipDismissed || undefined} onKeyDown={(event) => {
    if (event.key === "Escape") setTooltipDismissed(true);
  }} onFocusCapture={() => setTooltipDismissed(false)} onPointerLeave={() => setTooltipDismissed(false)}>
    <header className={styles.header}>
      <Link href="/dashboard" className={styles.brand} aria-label={t("brand")}>
        <span className={styles.brandName}>{t("brand")}</span>
      </Link>
      <Button variant="icon" size="sm" type="button" className={styles.toggle} aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")} aria-expanded={!collapsed} title={collapsed ? t("expandSidebar") : t("collapseSidebar")} onClick={onToggle}>
        <DashboardIcon name={collapsed ? "expand" : "collapse"} />
      </Button>
    </header>
    <div className={styles.body}>
      <section className={styles.navSection} aria-labelledby="sidebar-workspace-label">
        <span id="sidebar-workspace-label" className={styles.sectionLabel}>{t("workspaceGroup")}</span>
        <nav aria-label={t("primaryLabel")} className={styles.nav}>
        {dashboardPrimaryNavigation.map((item) => {
          const active = isActive(item);
          const label = t(`items.${item.key}`);
          const tooltipId = `sidebar-tooltip-${item.key}`;
          return <Link key={item.key} href={item.href} className={styles.navItem} aria-label={label} aria-describedby={collapsed ? tooltipId : undefined} aria-current={active ? "page" : undefined} data-active={active || undefined}>
            <DashboardIcon name={item.icon} className={styles.icon} />
            <span className={styles.label}>{label}</span>
            {tooltip(label, tooltipId)}
          </Link>;
        })}
        </nav>
      </section>
      <footer className={styles.footer}>
        <div className={styles.planSlot}>
          <DashboardPlanCard collapsed={collapsed} />
        </div>
        <Link href="/" className={styles.utilityItem} aria-label={t("returnToWebsite")} aria-describedby={collapsed ? "sidebar-tooltip-website" : undefined}>
          <DashboardIcon name="website" className={styles.icon} />
          <span className={styles.label}>{t("returnToWebsite")}</span>
          {tooltip(t("returnToWebsite"), "sidebar-tooltip-website")}
        </Link>
        <DashboardAccountMenu displayName={displayName} collapsed={collapsed} />
      </footer>
    </div>
  </aside>;
}
