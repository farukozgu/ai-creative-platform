"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { resolveDashboardSidebarCollapsed } from "@/components/dashboard/dashboard-sidebar-state";
import styles from "@/components/dashboard/dashboard-sidebar.module.css";
import { usePathname } from "@/i18n/navigation";
import creationStyles from "@/features/generation/creation-workspace.module.css";
import videoStyles from "@/features/video/video-studio-workspace.module.css";

const storageKey = "klay-dashboard-sidebar-collapsed";
const sidebarChangeEvent = "klay-dashboard-sidebar-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(sidebarChangeEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(sidebarChangeEvent, onChange);
  };
}

function getCollapsed() {
  const saved = window.localStorage.getItem(storageKey);
  return resolveDashboardSidebarCollapsed(saved);
}

export function DashboardFrame({ children, topbar, displayName }: { children: React.ReactNode; topbar: React.ReactNode; displayName?: string | null }) {
  const collapsed = useSyncExternalStore(subscribe, getCollapsed, () => true);
  const pathname = usePathname();
  const isCreation = pathname === "/dashboard/create";
  const isVideoStudio = pathname === "/dashboard/video";
  const isCompactWorkspace = isCreation || isVideoStudio;
  const [expandedAt, setExpandedAt] = useState<string | null>(null);
  const compactNavigationExpanded = isCompactWorkspace && expandedAt === pathname;

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    function checkHorizontalOverflow() {
      const page = document.documentElement;
      if (page.scrollWidth > page.clientWidth) {
        console.warn(`Dashboard horizontal overflow at ${page.clientWidth}px: ${page.scrollWidth}px scroll width`);
      }
    }

    checkHorizontalOverflow();
    window.addEventListener("resize", checkHorizontalOverflow);
    return () => window.removeEventListener("resize", checkHorizontalOverflow);
  }, []);

  function toggleSidebar() {
    window.localStorage.setItem(storageKey, String(!collapsed));
    window.dispatchEvent(new Event(sidebarChangeEvent));
  }

  const effectiveCollapsed = isCompactWorkspace ? !compactNavigationExpanded : collapsed;
  return <div className={`dashboard-shell ${styles.frame} ${isCreation ? creationStyles.editorFrame : ""} ${isVideoStudio ? videoStyles.videoFrame : ""}`} data-collapsed={effectiveCollapsed || undefined} data-creation-expanded={isCreation && compactNavigationExpanded || undefined} data-video-expanded={isVideoStudio && compactNavigationExpanded || undefined} onKeyDown={(event) => {
    if (event.key === "Escape" && compactNavigationExpanded) setExpandedAt(null);
  }}>
    <DashboardSidebar displayName={displayName} collapsed={effectiveCollapsed} onToggle={isCompactWorkspace ? () => setExpandedAt(compactNavigationExpanded ? null : pathname) : toggleSidebar} />
    <div className={`dashboard-workspace-shell ${isCreation ? creationStyles.editorContent : ""} ${isVideoStudio ? videoStyles.videoContent : ""}`}>{topbar}{children}</div>
  </div>;
}
