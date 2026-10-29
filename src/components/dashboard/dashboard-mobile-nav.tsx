"use client";

import { Button } from "@/components/ui/button";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslations } from "next-intl";

import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import {
  dashboardFooterNavigation,
  dashboardPrimaryNavigation,
  type DashboardNavigationItem,
} from "@/data/dashboard-navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { DashboardPlanCard } from "@/components/dashboard/dashboard-plan-card";
import { DashboardAccountMenu } from "@/components/dashboard/dashboard-account-menu";
import { useDashboardNavigationLocation } from "@/hooks/use-dashboard-navigation-location";

export function DashboardMobileNav({ displayName }: { displayName?: string | null }) {
  const t = useTranslations("Dashboard.navigation");
  const drawerId = useId();
  const pathname = usePathname();
  const { hash, isActive } = useDashboardNavigationLocation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const locationKey = `${pathname}${hash}`;
  const previousLocationRef = useRef(locationKey);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (previousLocationRef.current !== locationKey) {
      previousLocationRef.current = locationKey;
      setIsOpen(false);
    }
  }, [locationKey]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  function closeDrawer(restoreFocus = false) {
    setIsOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }

  function handleDrawerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") {
      return;
    }

    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled])",
    );
    if (!focusable?.length) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function renderItem(item: DashboardNavigationItem, active = false) {
    const label = t(`items.${item.key}`);
    const content = (
      <>
        <DashboardIcon name={item.icon} className="dashboard-mobile-nav-icon" />
        <span>{label}</span>
      </>
    );

    if (item.href) {
      return (
        <Link
          key={item.key}
          href={item.href}
          aria-current={active ? "page" : undefined}
          className="dashboard-mobile-nav-item"
          data-active={active || undefined}
          onClick={() => closeDrawer()}
        >
          {content}
        </Link>
      );
    }

    return (
      <button
        key={item.key}
        type="button"
        aria-disabled="true"
        title={t("unavailable")}
        className="dashboard-mobile-nav-item"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="dashboard-mobile-navigation">
      <Button variant="icon" size="md"
        ref={triggerRef}
        type="button"
        aria-label={t("openMenu")}
        aria-expanded={isOpen}
        aria-controls={drawerId}
        aria-haspopup="dialog"
        className="dashboard-menu-trigger"
        onClick={() => setIsOpen(true)}
      >
        <DashboardIcon name="menu" />
      </Button>

      {isOpen ? (
        <div className="dashboard-drawer-layer">
          <button
            type="button"
            tabIndex={-1}
            aria-label={t("closeMenu")}
            className="dashboard-drawer-backdrop"
            onClick={() => closeDrawer(true)}
          />
          <aside
            ref={drawerRef}
            id={drawerId}
            role="dialog"
            aria-modal="true"
            aria-label={t("primaryLabel")}
            className="dashboard-drawer"
            onKeyDown={handleDrawerKeyDown}
          >
            <div className="dashboard-drawer-header">
              <Link href="/" aria-label={t("homeLabel")} className="dashboard-drawer-brand">
                {t("brand")}
              </Link>
              <Button variant="icon" size="md"
                ref={closeRef}
                type="button"
                aria-label={t("closeMenu")}
                className="dashboard-drawer-close"
                onClick={() => closeDrawer(true)}
              >
                <DashboardIcon name="close" />
              </Button>
            </div>

            <nav aria-label={t("primaryLabel")} className="dashboard-drawer-nav">
              <span className="dashboard-drawer-caption">{t("workspaceGroup")}</span>
              {dashboardPrimaryNavigation.map((item) => renderItem(item, isActive(item)))}
            </nav>
            <div className="dashboard-drawer-spacer" />
            <div className="dashboard-drawer-footer">
              <div className="dashboard-drawer-plan-slot"><DashboardPlanCard /></div>
              <nav aria-label={t("secondaryLabel")} className="dashboard-drawer-nav dashboard-drawer-nav-secondary">
                <span className="dashboard-drawer-caption">{t("accountGroup")}</span>
                {dashboardFooterNavigation.map((item) => renderItem(item, pathname === item.href))}
                <Link href="/" className="dashboard-mobile-nav-item" onClick={() => closeDrawer()}><DashboardIcon name="website" className="dashboard-mobile-nav-icon" /><span>{t("returnToWebsite")}</span></Link>
              </nav>
              <div className="dashboard-drawer-account">
                <DashboardAccountMenu displayName={displayName} compact />
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
