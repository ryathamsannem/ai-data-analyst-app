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
        className="flex flex-wrap gap-1 rounded-2xl border border-slate-200/50 bg-slate-100/50 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]"
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
                  ? "bg-white text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.04]"
                  : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
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
