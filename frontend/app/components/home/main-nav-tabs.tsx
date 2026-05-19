"use client";

import { memo } from "react";
import { useDevRenderCount } from "@/lib/dev-render-count";

export type MainNavTabId = "overview" | "preview" | "insights" | "charts" | "export";

export const MAIN_NAV_TABS: readonly { id: MainNavTabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "preview", label: "Data Preview" },
  { id: "insights", label: "AI Insights" },
  { id: "charts", label: "Charts" },
  { id: "export", label: "Export" },
];

export const MAIN_NAV_PAGE_TITLES: Record<MainNavTabId, string> = {
  overview: "Overview",
  preview: "Data Preview",
  insights: "AI Insights",
  charts: "Charts",
  export: "Export",
};

export const MainNavTabs = memo(function MainNavTabs({
  activeTab,
  onTabClick,
}: {
  activeTab: MainNavTabId;
  onTabClick: (id: MainNavTabId) => void;
}) {
  useDevRenderCount("MainNavTabs");
  return (
    <div className="mt-8">
      <nav
        className="flex flex-wrap gap-1 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--nav-track)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        aria-label="Primary"
      >
        {MAIN_NAV_TABS.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabClick(t.id)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-[color:var(--nav-active-bg)] text-[color:var(--nav-active-fg)] shadow-[var(--shadow-sm)] ring-1 ring-[color:var(--shell-card-ring)]"
                  : "text-[color:var(--nav-inactive-fg)] hover:bg-[color:var(--nav-hover-bg)] hover:text-[color:var(--foreground)]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
});

MainNavTabs.displayName = "MainNavTabs";
