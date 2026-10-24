"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";

import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { useDismissiblePopover } from "@/hooks/use-dismissible-popover";
import { Link } from "@/i18n/navigation";
import { ThemePreferenceControl } from "@/components/theme/theme-preference-control";
import styles from "./dashboard-account-menu.module.css";

type DashboardAccountMenuProps = {
  displayName?: string | null;
  compact?: boolean;
  collapsed?: boolean;
};

export function DashboardAccountMenu({
  displayName,
  compact = false,
  collapsed = false,
}: DashboardAccountMenuProps) {
  const navigation = useTranslations("Dashboard.navigation");
  const topbar = useTranslations("Dashboard.topbar");
  const account = useTranslations("Dashboard.account");
  const locale = useLocale();
  const menuId = useId();
  const name = displayName?.trim() || navigation("items.account");
  const { close, isOpen, rootRef, toggle, triggerRef } = useDismissiblePopover();
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    if (!isOpen || !panel || !trigger) return;

    // The native top layer keeps the panel clear of studio clipping boundaries.
    const nativePopover = typeof panel.showPopover === "function";
    if (nativePopover) panel.showPopover();
    else {
      panel.removeAttribute("popover");
      panel.dataset.fallback = "true";
      const drawer = rootRef.current?.closest(".dashboard-drawer");
      if (drawer) panel.style.maxWidth = `${drawer.getBoundingClientRect().width - 32}px`;
    }
    function position() {
      if (!panel || !trigger) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 16;
      const besideSidebar = window.innerWidth >= 768 && !rootRef.current?.closest(".dashboard-drawer");
      const left = besideSidebar ? rect.right + 12 : rect.left;
      const top = besideSidebar ? rect.bottom - panel.offsetHeight : rect.top - panel.offsetHeight - 8;
      panel.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - panel.offsetWidth - margin))}px`;
      panel.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - panel.offsetHeight - margin))}px`;
    }
    position();
    panel.querySelector<HTMLAnchorElement>("a")?.focus({ preventScroll: true });
    const observer = new ResizeObserver(position);
    observer.observe(panel);
    observer.observe(trigger);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      if (nativePopover && panel.matches(":popover-open")) panel.hidePopover();
    };
  }, [isOpen, rootRef, triggerRef]);

  return (
    <div
      ref={rootRef}
      className={compact ? "dashboard-header-account-menu" : "dashboard-sidebar-account-menu"}
      onBlurCapture={(event) => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) close();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={compact ? "dashboard-header-account" : "dashboard-sidebar-account"}
        aria-label={`${navigation("items.account")}: ${name}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={menuId}
        title={collapsed ? name : undefined}
        onClick={toggle}
      >
        <span className="dashboard-sidebar-avatar" aria-hidden="true">
          {name.slice(0, 1).toLocaleUpperCase()}
        </span>
        {!compact ? (
          <span className="dashboard-sidebar-account-copy">
            <strong>{name}</strong>
            <small>{navigation("personalWorkspace")}</small>
          </span>
        ) : null}
        <DashboardIcon
          name="chevron"
          className={`dashboard-sidebar-chevron${isOpen ? " is-open" : ""}`}
        />
      </button>
      {isOpen ? (
        <div
          ref={panelRef}
          id={menuId}
          className={styles.panel}
          popover="manual"
          role="dialog"
          aria-label={account("dropdownLabel")}
          onKeyDownCapture={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close(true);
            }
          }}
        >
          <div className={styles.identity}><strong>{name}</strong><span>{navigation("personalWorkspace")}</span></div>
          <Link href="/dashboard/account" className={styles.action} onClick={() => close()}>
            <DashboardIcon name="account" />{account("accountSettingsLink")}
          </Link>
          <div className={styles.appearance}>
            <p>{account("themeLabel")}</p>
            <ThemePreferenceControl compact labels={{ group: account("themeLabel"), light: account("light"), dark: account("dark"), system: account("system") }} />
          </div>
          <form action={`/${locale}/auth/signout`} method="post">
            <button type="submit" className={styles.action}><DashboardIcon name="arrow" />{topbar("signOut")}</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
