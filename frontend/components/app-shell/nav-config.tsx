import type { ReactNode } from "react";
import type { MainNavTabId } from "@/app/components/home/main-nav-tabs";

export type NavItemConfig = {
  id: MainNavTabId;
  label: string;
  shortLabel: string;
  icon: ReactNode;
};

function icon(path: ReactNode) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {path}
    </svg>
  );
}

export const APP_NAV_ITEMS: NavItemConfig[] = [
  {
    id: "overview",
    label: "Overview",
    shortLabel: "Overview",
    icon: icon(
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>,
    ),
  },
  {
    id: "preview",
    label: "Data Preview",
    shortLabel: "Preview",
    icon: icon(
      <>
        <path d="M4 6h16M4 12h16M4 18h10" />
      </>,
    ),
  },
  {
    id: "insights",
    label: "AI Insights",
    shortLabel: "Insights",
    icon: icon(
      <>
        <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z" />
        <path d="M5 19h14" />
      </>,
    ),
  },
  {
    id: "charts",
    label: "Charts",
    shortLabel: "Charts",
    icon: icon(
      <>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 17V11" />
        <path d="M12 17V7" />
        <path d="M16 17v-4" />
      </>,
    ),
  },
  {
    id: "export",
    label: "Export",
    shortLabel: "Export",
    icon: icon(
      <>
        <path d="M12 3v12" />
        <path d="M8 11l4 4 4-4" />
        <path d="M5 21h14" />
      </>,
    ),
  },
];
