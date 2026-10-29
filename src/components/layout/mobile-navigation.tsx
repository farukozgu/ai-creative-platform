"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { navbarNavigationItems } from "@/data/navigation";
import { getPathname, Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

const mobileMenuId = "mobile-navigation-panel";

type MobileNavigationProps = {
  isAuthenticated: boolean;
};

export function MobileNavigation({isAuthenticated}: MobileNavigationProps) {
  const locale = useLocale();
  const navigationT = useTranslations("Navigation");
  const commonT = useTranslations("Common");
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isOpen = openPath === pathname;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenPath(null);
        triggerRef.current?.focus();
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setOpenPath(null);
      }
    }

    function handleTab(event: KeyboardEvent) {
      if (event.key !== "Tab" || !panelRef.current) {
        return;
      }

      const focusableElements = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        triggerRef.current?.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("keydown", handleTab);
    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("keydown", handleTab);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  function closeMenu() {
    setOpenPath(null);
  }

  function handleNavigation(
    key: (typeof navbarNavigationItems)[number]["key"],
  ) {
    closeMenu();

    if (key === "home" && pathname === "/") {
      window.scrollTo({ top: 0 });
    }
  }

  return (
    <div ref={rootRef} className="navbar-mobile-actions">
      <LanguageSwitcher />
      <button
        ref={triggerRef}
        type="button"
        className="navbar-menu-trigger group"
        aria-controls={mobileMenuId}
        aria-expanded={isOpen}
        aria-label={isOpen ? commonT("closeMenu") : commonT("openMenu")}
        onClick={() =>
          setOpenPath((current) => (current === pathname ? null : pathname))
        }
      >
        <span>{commonT("menu")}</span>
        <span aria-hidden="true" className="relative block h-4 w-5">
          <span
            className={cn(
              "absolute left-0 top-1 h-px w-5 bg-current transition-transform duration-(--navbar-transition-duration) ease-(--button-transition-ease) motion-reduce:transition-none",
              isOpen && "translate-y-1 rotate-45",
            )}
          />
          <span
            className={cn(
              "absolute bottom-1 left-0 h-px w-5 bg-current transition-transform duration-(--navbar-transition-duration) ease-(--button-transition-ease) motion-reduce:transition-none",
              isOpen && "-translate-y-1 -rotate-45",
            )}
          />
        </span>
      </button>

      {isOpen ? (
        <div
          ref={panelRef}
          id={mobileMenuId}
          className="navbar-mobile-panel"
        >
          <div className="p-3">
            <div className="navbar-mobile-links">
              {navbarNavigationItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={
                    "activePath" in item && pathname === item.activePath
                      ? "page"
                      : undefined
                  }
                  className={cn(
                    "navbar-mobile-link",
                    "activePath" in item &&
                      pathname === item.activePath &&
                      "font-semibold",
                  )}
                  onClick={() => handleNavigation(item.key)}
                >
                  {navigationT(item.key)}
                </Link>
              ))}
            </div>

            <div className="navbar-mobile-footer">
              {!isAuthenticated ? (
                <Link
                  href={siteConfig.routes.login}
                  className="navbar-mobile-sign-in"
                  onClick={closeMenu}
                >
                  {navigationT("signIn")}
                </Link>
              ) : null}
              <Button
                href={isAuthenticated ? getPathname({href: "/dashboard", locale}) : getPathname({href: siteConfig.routes.signup, locale})}
                variant="primary"
                size="md"
                className="flex-1"
                onClick={closeMenu}
              >
                {navigationT(isAuthenticated ? "workspace" : "tryForFree")}
              </Button>
            </div>

          </div>
        </div>
      ) : null}
    </div>
  );
}
