export type DashboardIconName = "home" | "spark" | "image" | "video" | "videoLibrary" | "projects" | "templates" | "assets" | "usage" | "settings" | "upgrade" | "account";

export type DashboardNavigationItem = {
  key: string;
  icon: DashboardIconName;
  href: string;
};

export const dashboardPrimaryNavigation: DashboardNavigationItem[] = [
  { key: "home", icon: "home", href: "/dashboard" },
  { key: "create", icon: "image", href: "/dashboard/create" },
  { key: "video", icon: "video", href: "/dashboard/video" },
  { key: "videos", icon: "videoLibrary", href: "/dashboard/videos" },
  { key: "projects", icon: "projects", href: "/dashboard/projects" },
];

export const dashboardFooterNavigation: DashboardNavigationItem[] = [
  { key: "account", icon: "account", href: "/dashboard/account" },
];

export function isDashboardNavigationItemActive(
  item: DashboardNavigationItem,
  pathname: string,
  hash: string,
) {
  if (item.key === "home") return pathname === "/dashboard" && hash !== "#composer";
  if (item.key === "create") return pathname === "/dashboard/create" || (pathname === "/dashboard" && hash === "#composer");
  if (item.key === "video") return pathname === "/dashboard/video";
  if (item.key === "videos") return pathname.startsWith("/dashboard/videos");
  if (item.key === "projects") return pathname.startsWith("/dashboard/projects");
  return pathname === item.href;
}
