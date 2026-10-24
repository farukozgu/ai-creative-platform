export type ThemePreference = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

export const dashboardThemePathPattern = "^/(?:tr/|en/)?dashboard(?:/|$)";

export function resolveRouteTheme(pathname: string, preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  return new RegExp(dashboardThemePathPattern).test(pathname)
    ? resolveTheme(preference, systemPrefersDark)
    : "light";
}

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "dark" || value === "light";
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  return preference === "system" ? (systemPrefersDark ? "dark" : "light") : preference;
}
