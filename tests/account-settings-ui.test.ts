import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveSettingsSection, settingsHref, settingsSections, upcomingSettings } from "../src/app/[locale]/dashboard/account/settings-sections";

const read = (path: string) => readFileSync(path, "utf8");

test("settings URLs select working sections and default safely to Profile", () => {
  assert.equal(resolveSettingsSection(undefined), "profile");
  assert.equal(resolveSettingsSection(["security", "sessions"]), "profile");
  for (const section of settingsSections) {
    assert.equal(resolveSettingsSection(section), section);
    assert.deepEqual(settingsHref(section), { pathname: "/dashboard/account", query: { section } });
  }
  for (const section of [...upcomingSettings, "unknown", "__proto__"]) assert.equal(resolveSettingsSection(section), "profile");
});

test("the settings workspace renders only the URL-selected functional section", () => {
  const page = read("src/app/[locale]/dashboard/account/page.tsx");
  for (const section of settingsSections) assert.ok(page.includes(`{selected === "${section}" ? <section`));
  for (const component of ["ProfileForm", "PasswordChangeControl", "SessionManagement", "AppearanceControl", "LanguageSwitcher"]) assert.ok(page.includes(`<${component}`));
  assert.match(page, /hasPasswordIdentity\(providers\)/);
  assert.match(page, /user\.email_confirmed_at/);
  assert.doesNotMatch(page, /href="#(?:account|security|appearance)-settings"/);
});

test("settings navigation uses real query links and browser history with a mobile selector", () => {
  const navigation = read("src/app/[locale]/dashboard/account/settings-navigation.tsx");
  assert.match(navigation, /href=\{settingsHref\(section\)\}/);
  assert.match(navigation, /aria-current=\{selected === section \? "page"/);
  assert.match(navigation, /<select value=\{selected\}/);
  assert.match(navigation, /router\.push\(settingsHref\(resolveSettingsSection/);
  assert.doesNotMatch(navigation, /useState|localStorage|sessionStorage/);
});

test("upcoming settings are labeled and disabled without pretending to save", () => {
  assert.deepEqual(upcomingSettings, ["notifications", "usage", "brands", "team", "integrations"]);
  const navigation = read("src/app/[locale]/dashboard/account/settings-navigation.tsx");
  assert.match(navigation, /upcomingSettings\.map[\s\S]*?disabled>/);
  assert.match(navigation, /labels\.comingSoon/);
  assert.doesNotMatch(navigation, /<form|type="submit"|fetch\(/);
});

test("account dropdown and appearance page share the existing theme preference mechanism", () => {
  const menu = read("src/components/dashboard/dashboard-account-menu.tsx");
  const appearance = read("src/app/[locale]/dashboard/account/appearance-control.tsx");
  const control = read("src/components/theme/theme-preference-control.tsx");
  assert.match(menu, /<ThemePreferenceControl compact/);
  assert.match(appearance, /<ThemePreferenceControl labels=\{labels\}/);
  assert.match(control, /const \{ preference, setPreference \} = useTheme\(\)/);
  assert.doesNotMatch(menu + appearance + control, /localStorage|sessionStorage|createContext|ThemeProvider>/);
  assert.match(menu, /role="dialog"/);
  assert.match(menu, /popover="manual"/);
  assert.doesNotMatch(menu, /role="menuitem"/);
  assert.match(menu, /useDismissiblePopover\(\)/);
});

test("new settings and dropdown messages are complete in Turkish and English", () => {
  const keys = ["settingsHeading", "settingsDescription", "currentGroup", "upcomingGroup", "comingSoon", "settingsSection", "profileNavLabel", "appearanceLanguageLabel", "notificationsNavLabel", "usageNavLabel", "brandKitsNavLabel", "teamNavLabel", "integrationsNavLabel", "languageHeading", "languageDescription", "themeLabel", "emailLabel", "verifiedEmail", "unverifiedEmail", "googlePasswordNotice", "noPasswordNotice", "dropdownLabel", "accountSettingsLink"];
  for (const locale of ["tr", "en"]) {
    const messages = JSON.parse(read(`src/messages/${locale}.json`)).Dashboard.account;
    for (const key of keys) assert.ok(typeof messages[key] === "string" && messages[key].trim(), `${locale}: ${key}`);
  }
});
