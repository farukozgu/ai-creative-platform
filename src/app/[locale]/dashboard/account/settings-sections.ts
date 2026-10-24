export const settingsSections = ["profile", "security", "sessions", "appearance"] as const;
export type SettingsSection = (typeof settingsSections)[number];

export const upcomingSettings = ["notifications", "usage", "brands", "team", "integrations"] as const;
export type UpcomingSetting = (typeof upcomingSettings)[number];

export function resolveSettingsSection(value: string | string[] | undefined): SettingsSection {
  return settingsSections.find((section) => section === value) ?? "profile";
}

export function settingsHref(section: SettingsSection) {
  return { pathname: "/dashboard/account", query: { section } };
}
