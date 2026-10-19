"use client";

import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";

import { usePathname, useRouter } from "@/i18n/navigation";
import {
  isSupportedLocale,
  routing,
  type AppLocale,
} from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { useDismissiblePopover } from "@/hooks/use-dismissible-popover";

type LanguageSwitcherProps = {
  onLocaleChange?: () => void;
  variant?: "public" | "dashboard" | "mobile";
};

export function LanguageSwitcher({
  onLocaleChange,
  variant = "public",
}: LanguageSwitcherProps) {
  const locale = useLocale();
  const t = useTranslations("LanguageSwitcher");
  const pathname = usePathname();
  const router = useRouter();
  const menuId = useId();
  const { close, isOpen, open, rootRef, toggle, triggerRef } = useDismissiblePopover();
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeLocale = isSupportedLocale(locale)
    ? locale
    : routing.defaultLocale;
  const activeIndex = routing.locales.indexOf(activeLocale);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    optionRefs.current[activeIndex]?.focus();

  }, [activeIndex, isOpen]);

  function selectLocale(nextLocale: AppLocale) {
    close();
    onLocaleChange?.();

    if (nextLocale === activeLocale) {
      triggerRef.current?.focus();
      return;
    }

    const locationSuffix = `${window.location.search}${window.location.hash}`;
    router.replace(`${pathname}${locationSuffix}`, { locale: nextLocale });
  }

  function handleOptionKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number | undefined;

    if (event.key === "ArrowDown") {
      nextIndex = (index + 1) % routing.locales.length;
    } else if (event.key === "ArrowUp") {
      nextIndex =
        (index - 1 + routing.locales.length) % routing.locales.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = routing.locales.length - 1;
    }

    if (nextIndex !== undefined) {
      event.preventDefault();
      optionRefs.current[nextIndex]?.focus();
    }
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "language-switcher relative",
        `language-switcher-${variant}`,
        variant === "mobile" && "w-full",
      )}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={t("label")}
        className={cn(
          "language-switcher-trigger inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] font-medium text-[var(--foreground)] transition-colors duration-(--transition-fast) hover:bg-[var(--surface-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus-ring)]",
          variant === "mobile" && "w-full justify-between normal-case tracking-normal",
        )}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            open();
          }
        }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        >
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.9 12h16.2M12 3.5c2.1 2.3 3.2 5.16 3.2 8.5S14.1 18.2 12 20.5C9.9 18.2 8.8 15.34 8.8 12S9.9 5.8 12 3.5Z" />
        </svg>
        <span className={cn("language-switcher-name", (variant === "mobile" || variant === "dashboard") && "sr-only")}>
          {t(`localeNames.${activeLocale}`)}
        </span>
        <span aria-hidden="true" className="language-switcher-code">
          {activeLocale.toUpperCase()}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 12 8"
          className={cn(
            "language-switcher-chevron h-2 w-3 transition-transform duration-(--transition-fast) motion-reduce:transition-none",
            isOpen && "rotate-180",
          )}
        >
          <path
            d="M1 1.25 6 6.25l5-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
      </button>

      {isOpen ? (
        <div
          id={menuId}
          role="menu"
          aria-label={t("menuLabel")}
          className={cn(
            "language-menu absolute top-[calc(100%+0.5rem)] z-50 w-[min(15rem,calc(100vw-2rem))] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-subtle)]",
            variant === "mobile" ? "inset-x-0 w-full" : "right-0",
          )}
        >
          <div className="language-menu-heading">{t("menuLabel")}</div>
          {routing.locales.map((optionLocale, index) => {
            const isActive = optionLocale === activeLocale;
            const label = t(`localeNames.${optionLocale}`);

            return (
              <button
                key={optionLocale}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                aria-current={isActive ? "true" : undefined}
                aria-label={`${t("switchTo")} ${label}`}
                className={cn(
                  "language-menu-option flex min-h-14 w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-left transition-colors duration-(--transition-fast) hover:bg-[var(--surface-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus-ring)]",
                  isActive && "bg-[var(--surface-soft)] text-[var(--foreground)]",
                )}
                onClick={() => selectLocale(optionLocale)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
              >
                <span className="grid gap-0.5">
                  <span className="language-menu-name">{label}</span>
                  <span className="language-menu-description">
                    {t(`descriptions.${optionLocale}`)} · {optionLocale.toUpperCase()}
                  </span>
                </span>
                {isActive ? (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.7"
                  >
                    <path d="m3.5 8.2 2.8 2.8 6.2-6" />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
