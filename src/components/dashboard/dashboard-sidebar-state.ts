export function resolveDashboardSidebarCollapsed(savedPreference: string | null) {
  if (savedPreference === "true") return true;
  if (savedPreference === "false") return false;
  return true;
}
