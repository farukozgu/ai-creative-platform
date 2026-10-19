import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

import { isThemePreference, resolveTheme } from "../src/components/theme/theme-state";

const source = (path: string) => readFileSync(path, "utf8");

function runInitializer(saved: string | null, systemPrefersDark: boolean, storageUnavailable = false) {
  const initializer = source("src/components/theme/theme-init-script.tsx");
  const script = initializer.match(/const script = `([^`]+)`;/)?.[1];
  assert.ok(script);
  const dataset: Record<string, string> = {};
  let reads = 0;
  runInNewContext(script, {
    document: { documentElement: { dataset } },
    localStorage: { getItem(key: string) {
      assert.equal(key, "klay-theme-preference");
      reads += 1;
      if (storageUnavailable) throw new Error("Storage unavailable");
      return saved;
    } },
    matchMedia(query: string) {
      assert.equal(query, "(prefers-color-scheme: dark)");
      return { matches: systemPrefersDark };
    },
  });
  assert.equal(reads, 1);
  return dataset;
}

test("theme preference defaults to system and follows a light or dark OS", () => {
  const saved: string | null = null;
  const preference = isThemePreference(saved) ? saved : "system";
  assert.equal(preference, "system");
  assert.equal(resolveTheme(preference, true), "dark");
  assert.equal(resolveTheme(preference, false), "light");
});

test("explicit preferences override the OS and remain valid persisted values", () => {
  for (const preference of ["dark", "light"] as const) {
    assert.equal(isThemePreference(preference), true);
    assert.equal(resolveTheme(preference, preference === "light"), preference);
    assert.equal(resolveTheme(preference, preference === "dark"), preference);
  }
  assert.equal(isThemePreference("invalid"), false);
});

test("system can respond to later OS preference changes without changing preference", () => {
  const preference = "system" as const;
  assert.equal(resolveTheme(preference, false), "light");
  assert.equal(resolveTheme(preference, true), "dark");
  assert.equal(preference, "system");
});

test("preference persists in local storage", () => {
  assert.match(source("src/components/theme/theme-provider.tsx"), /localStorage\.setItem\(storageKey, value\)/);
});

test("refresh initialization restores preference before paint", () => {
  const initializer = source("src/components/theme/theme-init-script.tsx");
  assert.match(initializer, /localStorage\.getItem\("klay-theme-preference"\)/);
  assert.match(initializer, /dataset\.theme=d/);
  assert.match(initializer, /dangerouslySetInnerHTML/);
  assert.match(initializer, /themePreferenceSource/);
  assert.match(source("src/app/[locale]/layout.tsx"), /<head><ThemeInitScript \/><\/head>[\s\S]*?<body/);
  assert.doesNotMatch(initializer, /next\/script|beforeInteractive/);
});

test("dashboard follows the resolved root theme from the first paint", () => {
  const css = source("src/app/globals.css");
  assert.match(css, /\.dashboard-shell \{[\s\S]*?--dashboard-background: #090909;/);
  assert.match(css, /:root\[data-theme="light"\] \.dashboard-shell \{[\s\S]*?--dashboard-background: #f2f1f5;/);
  assert.doesNotMatch(css, /data-theme-preference-source="stored"/);
});

test("initializer and provider agree for stored light, dark, system, and absent preferences", () => {
  for (const saved of ["light", "dark", "system", null]) {
    for (const systemPrefersDark of [false, true]) {
      const preference = isThemePreference(saved) ? saved : "system";
      const actual = runInitializer(saved, systemPrefersDark);
      assert.equal(actual.theme, resolveTheme(preference, systemPrefersDark));
      assert.equal(actual.themePreference, preference);
      assert.equal(actual.themePreferenceSource, saved === null ? "default" : "stored");
    }
  }
});

test("initializer uses system default when storage cannot be read", () => {
  assert.equal(runInitializer(null, true, true).theme, "dark");
  assert.equal(runInitializer(null, false, true).theme, "light");
});

test("system mode subscribes to live OS preference changes", () => {
  assert.match(source("src/components/theme/theme-provider.tsx"), /media\.addEventListener\("change", applyTheme\)/);
});

test("settings appearance options apply selection immediately and are keyboard operable", () => {
  const control = source("src/app/[locale]/dashboard/account/appearance-control.tsx");
  assert.match(control, /role="radiogroup"/);
  assert.match(control, /role="radio"/);
  assert.match(control, /onClick=\{\(\) => setPreference\(value\)\}/);
  assert.match(control, /ArrowRight/);
});

test("modal and dropdown surfaces use semantic theme tokens", () => {
  const css = source("src/app/globals.css");
  assert.match(css, /\.generation-progress-modal[^\n]*background: var\(--dashboard-surface\)/);
  const language = source("src/components/layout/language-switcher.tsx");
  assert.match(language, /bg-\[var\(--surface\)\]/);
});

test("mobile drawer and backdrop adapt to dashboard theme tokens", () => {
  const css = source("src/app/globals.css");
  assert.match(css, /\.dashboard-drawer \{[^\n]*background: var\(--dashboard-sidebar\)/);
  assert.match(css, /\.dashboard-drawer-backdrop \{[^\n]*background: rgba\(0, 0, 0/);
});

test("root theme initialization suppresses the expected hydration attribute mismatch", () => {
  const layout = source("src/app/[locale]/layout.tsx");
  assert.match(layout, /data-theme="light"/);
  assert.match(layout, /data-theme-preference-source="default"/);
  assert.match(layout, /suppressHydrationWarning/);
  assert.match(source("src/components/theme/theme-init-script.tsx"), /matchMedia\("\(prefers-color-scheme: dark\)"\)/);
});
