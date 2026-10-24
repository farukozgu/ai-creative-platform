import type { SVGProps } from "react";

import type { DashboardIconName } from "@/data/dashboard-navigation";

type DashboardIconProps = SVGProps<SVGSVGElement> & {
  name: DashboardIconName | "menu" | "close" | "plus" | "arrow" | "collapse" | "expand" | "website" | "chevron" | "allCategories" | "apparel" | "jewelry" | "watch" | "footwear" | "cosmetics" | "bag" | "image" | "video" | "search" | "lock" | "bell" | "alert" | "edit";
};

export function DashboardIcon({ name, ...props }: DashboardIconProps) {
  const commonProps = {
    "aria-hidden": true,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    ...props,
  };

  switch (name) {
    case "home":
      return <svg {...commonProps}><path d="m3 10 7.15-6.1a2.85 2.85 0 0 1 3.7 0L21 10" /><path d="M5 8.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5M9 20v-5a3 3 0 0 1 6 0v5" /><path d="M11 9h2" /></svg>;
    case "spark":
      return <svg {...commonProps}><path d="m12 3 1.25 4.1a5.3 5.3 0 0 0 3.65 3.65L21 12l-4.1 1.25a5.3 5.3 0 0 0-3.65 3.65L12 21l-1.25-4.1a5.3 5.3 0 0 0-3.65-3.65L3 12l4.1-1.25a5.3 5.3 0 0 0 3.65-3.65L12 3Z" /></svg>;
    case "projects":
      return <svg {...commonProps}><path d="M5 7V5a2 2 0 0 1 2-2h4l2 2h5a2 2 0 0 1 2 2v1" /><path d="M3 10a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2l-1 6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2l-1-8Z" /><path d="M8 15h5" /></svg>;
    case "templates":
      return <svg {...commonProps}><rect x="4" y="4" width="6" height="7" rx="1" /><rect x="14" y="4" width="6" height="4" rx="1" /><rect x="4" y="15" width="6" height="5" rx="1" /><rect x="14" y="12" width="6" height="8" rx="1" /></svg>;
    case "assets":
      return <svg {...commonProps}><rect x="4" y="4" width="16" height="16" rx="2" /><circle cx="9" cy="9" r="1.5" /><path d="m6.5 17 4-4 2.75 2.75 1.75-2 2.5 3.25" /></svg>;
    case "usage":
      return <svg {...commonProps}><path d="M5 19V9M12 19V5M19 19v-7" /></svg>;
    case "settings":
      return <svg {...commonProps}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.55-2-3.5-2.45 1a7 7 0 0 0-2.05-1.2L14 3h-4l-.4 2.55a7 7 0 0 0-2.05 1.2l-2.45-1-2 3.5 2 1.55A7 7 0 0 0 5 12c0 .4.03.8.1 1.2l-2 1.55 2 3.5 2.45-1a7 7 0 0 0 2.05 1.2L10 21h4l.4-2.55a7 7 0 0 0 2.05-1.2l2.45 1 2-3.5-2-1.55c.07-.4.1-.8.1-1.2Z" /></svg>;
    case "upgrade":
      return <svg {...commonProps}><path d="M12 20V5M6 11l6-6 6 6" /></svg>;
    case "account":
      return <svg {...commonProps}><rect x="3" y="3" width="18" height="18" rx="6" /><circle cx="12" cy="9" r="2.75" /><path d="M6.5 19a5.5 5.5 0 0 1 11 0" /></svg>;
    case "menu":
      return <svg {...commonProps}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
    case "close":
      return <svg {...commonProps}><path d="m6 6 12 12M18 6 6 18" /></svg>;
    case "plus":
      return <svg {...commonProps}><path d="M12 5v14M5 12h14" /></svg>;
    case "arrow":
      return <svg {...commonProps}><path d="M5 12h14M14 7l5 5-5 5" /></svg>;
    case "collapse":
      return <svg {...commonProps}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16m7-11-3 3 3 3" /></svg>;
    case "expand":
      return <svg {...commonProps}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16m4-11 3 3-3 3" /></svg>;
    case "website":
      return <svg {...commonProps}><path d="M13 5h6v6m0-6-9 9" /><path d="M19 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" /></svg>;
    case "chevron":
      return <svg {...commonProps}><path d="m6 9 6 6 6-6" /></svg>;
    case "allCategories":
      return <svg {...commonProps}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>;
    case "apparel":
      return <svg {...commonProps}><path d="m8 5 4-2 4 2 4 2-2 4-2-1v11H8V10l-2 1-2-4 4-2Z" /></svg>;
    case "jewelry":
      return <svg {...commonProps}><path d="m12 3 8 6-8 12L4 9l8-6Z" /><path d="M4 9h16M9 9l3 12 3-12M9 3l3 6 3-6" /></svg>;
    case "watch":
      return <svg {...commonProps}><rect x="6" y="7" width="12" height="10" rx="3" /><path d="m9 7 1-4h4l1 4m-6 10 1 4h4l1-4m-2-7v3l2 1" /></svg>;
    case "footwear":
      return <svg {...commonProps}><path d="M4 15c3 0 5-2 6-6l3 2c1 2 2 3 4 3l3 1v4H4v-4Z" /><path d="M8 18h1m3 0h1" /></svg>;
    case "cosmetics":
      return <svg {...commonProps}><path d="M9 3h6v3H9zM8 6h8l1 2v12H7V8l1-2Z" /><path d="M10 12h4" /></svg>;
    case "bag":
      return <svg {...commonProps}><path d="M5 9h14l1 11H4L5 9Z" /><path d="M9 9V7a3 3 0 0 1 6 0v2" /></svg>;
    case "image":
      return <svg {...commonProps}><path d="M12 4H6a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-5" /><circle cx="8" cy="9" r="1.5" /><path d="m4 18 5-5 4 4 3-3 4 4M18 2l1.15 3.85L23 7l-3.85 1.15L18 12l-1.15-3.85L13 7l3.85-1.15L18 2Z" /></svg>;
    case "video":
      return <svg {...commonProps}><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9ZM3 9l-.5-3a2 2 0 0 1 1.6-2.3L18 1l1 5-16 3ZM8 3l3 4m3-5 3 4" /><path d="m10 12 5 3-5 3v-6Z" /></svg>;
    case "videoLibrary":
      return <svg {...commonProps}><path d="M7 3h11a3 3 0 0 1 3 3v11" /><rect x="3" y="6" width="15" height="15" rx="3" /><path d="M7 6v15M3 11h4m-4 5h4m4-6 4 3.5-4 3.5v-7Z" /></svg>;
    case "models":
      return <svg {...commonProps}><path d="M14 3H7a4 4 0 0 0-4 4v10a4 4 0 0 0 4 4h10a4 4 0 0 0 4-4v-5" /><path d="M7 21v-2a4 4 0 0 1 8 0v2M8 9a3 3 0 0 1 6 0v2a3 3 0 0 1-6 0V9Zm3 1v1M19 2l.95 3.05L23 6l-3.05.95L19 10l-.95-3.05L15 6l3.05-.95L19 2Z" /></svg>;
    case "search":
      return <svg {...commonProps}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4 4" /></svg>;
    case "lock":
      return <svg {...commonProps}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
    case "bell":
      return <svg {...commonProps}><path d="M18 9a6 6 0 0 0-12 0v3.5L4 16v2h16v-2l-2-3.5V9ZM10 21h4M12 3V2" /><path d="M4 7a8 8 0 0 1 1-2m15 2a8 8 0 0 0-1-2" /></svg>;
    case "alert":
      return <svg {...commonProps}><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5m0 3h.01" /></svg>;
    case "edit":
      return <svg {...commonProps}><path d="M4 20h4l11-11-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>;
  }
}
