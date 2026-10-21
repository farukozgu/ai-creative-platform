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
    strokeWidth: 1.75,
    ...props,
  };

  switch (name) {
    case "home":
      return <svg {...commonProps}><path d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-9Z" /></svg>;
    case "spark":
      return <svg {...commonProps}><path d="m12 3 1.25 4.1a5.3 5.3 0 0 0 3.65 3.65L21 12l-4.1 1.25a5.3 5.3 0 0 0-3.65 3.65L12 21l-1.25-4.1a5.3 5.3 0 0 0-3.65-3.65L3 12l4.1-1.25a5.3 5.3 0 0 0 3.65-3.65L12 3Z" /></svg>;
    case "projects":
      return <svg {...commonProps}><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 5v14M8 9h12" /></svg>;
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
      return <svg {...commonProps}><circle cx="12" cy="8" r="3" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg>;
    case "menu":
      return <svg {...commonProps}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
    case "close":
      return <svg {...commonProps}><path d="m6 6 12 12M18 6 6 18" /></svg>;
    case "plus":
      return <svg {...commonProps}><path d="M12 5v14M5 12h14" /></svg>;
    case "arrow":
      return <svg {...commonProps}><path d="M5 12h14M14 7l5 5-5 5" /></svg>;
    case "collapse":
      return <svg {...commonProps}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16m7-11-3 3 3 3" /></svg>;
    case "expand":
      return <svg {...commonProps}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16m4-11 3 3-3 3" /></svg>;
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
      return <svg {...commonProps}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="9" r="1.5" /><path d="m5.5 17 4.5-4.5 3.25 3.25 2.25-2.5 3 3.75" /></svg>;
    case "video":
      return <svg {...commonProps}><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></svg>;
    case "videoLibrary":
      return <svg {...commonProps}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 4v16M16 4v16M4 9h4m8 0h4M4 15h4m8 0h4" /><path d="m11 10 3 2-3 2v-4Z" /></svg>;
    case "models":
      return <svg {...commonProps}><circle cx="12" cy="8" r="3" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /><path d="M18.5 5.5 20 7l-1.5 1.5L17 7l1.5-1.5Z" /></svg>;
    case "search":
      return <svg {...commonProps}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4 4" /></svg>;
    case "lock":
      return <svg {...commonProps}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
    case "bell":
      return <svg {...commonProps}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" /><path d="M10 21h4" /></svg>;
    case "alert":
      return <svg {...commonProps}><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5m0 3h.01" /></svg>;
    case "edit":
      return <svg {...commonProps}><path d="M4 20h4l11-11-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>;
  }
}
