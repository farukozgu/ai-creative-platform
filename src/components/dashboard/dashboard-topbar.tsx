import { getTranslations } from "next-intl/server";

import { DashboardMobileNav } from "@/components/dashboard/dashboard-mobile-nav";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { WorkspaceCreateAction } from "@/components/dashboard/workspace-create-action";
import { NotificationCenter } from "@/components/dashboard/notification-center";
import type { NotificationItem } from "@/lib/notifications/types";

export async function DashboardTopbar({ displayName, notifications, notificationsRenderedAt, notificationsLoadFailed }: { displayName?: string | null; notifications: NotificationItem[]; notificationsRenderedAt: number; notificationsLoadFailed?: boolean }) {
  const t = await getTranslations("Dashboard.topbar");
  const notificationStateKey = `${notificationsLoadFailed ? "error" : "ready"}:${notifications.map((item) => `${item.id}:${item.isRead}`).join(",")}`;
  const name = displayName?.trim();

  return (
    <header className="dashboard-topbar">
      <div className="dashboard-topbar-inner dashboard-container">
        <DashboardMobileNav displayName={displayName} />
        <p className="dashboard-topbar-welcome">{name ? t("welcome", { name }) : t("welcomeWithoutName")}</p>
        <div className="dashboard-topbar-actions">
          <WorkspaceCreateAction label={t("newProject")} />
          <NotificationCenter key={notificationStateKey} initialItems={notifications} loadFailed={notificationsLoadFailed} renderedAt={notificationsRenderedAt} />
          <LanguageSwitcher variant="dashboard" />
        </div>
      </div>
    </header>
  );
}
