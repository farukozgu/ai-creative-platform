"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { isThemePreference, resolveRouteTheme, type ThemePreference } from "./theme-state";

export type { ThemePreference } from "./theme-state";
type ThemeContextValue = { preference: ThemePreference; setPreference: (value: ThemePreference) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);
const storageKey = "klay-theme-preference";
const preferenceEvent = "klay-theme-preference-change";

function getStoredPreference(): ThemePreference | null {
  try {
    const saved = window.localStorage.getItem(storageKey);
    return isThemePreference(saved) ? saved : null;
  } catch { return null; }
}

function getPreference(): ThemePreference {
  return getStoredPreference() ?? "system";
}

function subscribePreference(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(preferenceEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(preferenceEvent, onChange);
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const preference = useSyncExternalStore(subscribePreference, getPreference, (): ThemePreference => "system");

  // Apply route changes before paint, including when leaving a dark dashboard.
  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const stored = getStoredPreference();
      const selected = stored ?? "system";
      const root = document.documentElement;
      root.dataset.theme = resolveRouteTheme(pathname, selected, media.matches);
      root.dataset.themePreference = selected;
      root.dataset.themePreferenceSource = stored ? "stored" : "default";
    };
    applyTheme();
    media.addEventListener("change", applyTheme);
    window.addEventListener("storage", applyTheme);
    return () => {
      media.removeEventListener("change", applyTheme);
      window.removeEventListener("storage", applyTheme);
    };
  }, [pathname, preference]);

  const setPreference = useCallback((value: ThemePreference) => {
    try { window.localStorage.setItem(storageKey, value); } catch { /* Keep the in-memory selection. */ }
    window.dispatchEvent(new Event(preferenceEvent));
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const root = document.documentElement;
    root.dataset.theme = resolveRouteTheme(pathname, value, media.matches);
    root.dataset.themePreference = value;
    root.dataset.themePreferenceSource = "stored";
  }, [pathname]);
  const context = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);
  return <ThemeContext.Provider value={context}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}
