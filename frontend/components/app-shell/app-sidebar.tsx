"use client";

import { memo, useCallback } from "react";
import type { MainNavTabId } from "@/app/components/home/main-nav-tabs";
import { APP_NAV_ITEMS } from "./nav-config";

export const AppSidebar = memo(function AppSidebar({
  activeTab,
  collapsed,
  mobileOpen,
  onNavigate,
  onToggleCollapse,
  onCloseMobile,
}: {
  activeTab: MainNavTabId;
  collapsed: boolean;
  mobileOpen: boolean;
  onNavigate: (id: MainNavTabId) => void;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
}) {
  const handleNav = useCallback(
    (id: MainNavTabId) => {
      onNavigate(id);
      onCloseMobile();
    },
    [onNavigate, onCloseMobile],
  );

  return (
    <aside
      className={
        "app-sidebar z-50 flex h-full shrink-0 flex-col border-r border-[color:var(--sidebar-border)] bg-[color:var(--sidebar-bg)] shadow-[var(--shadow-sidebar)] transition-[width,transform] duration-300 ease-out " +
        "fixed inset-y-0 left-0 lg:relative lg:inset-auto " +
        (collapsed ? "w-[var(--sidebar-width-collapsed)]" : "w-[var(--sidebar-width)]") +
        (mobileOpen ? " translate-x-0" : " -translate-x-full lg:translate-x-0")
      }
      aria-label="Main navigation"
    >
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-[color:var(--sidebar-border)] px-3 lg:h-16 lg:px-4">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--accent)] text-[color:var(--accent-fg)] shadow-[0_0_20px_-4px_var(--accent-glow)]"
          aria-hidden
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 14l4-6 4 4 4-6 4 8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight text-[color:var(--foreground)]">
              AI Data Analyst
            </p>
            <p className="truncate text-[11px] text-[color:var(--text-muted)]">
              Analytics workspace
            </p>
          </div>
        ) : null}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        <p
          className={
            "mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-subtle)] " +
            (collapsed ? "sr-only" : "")
          }
        >
          Navigation
        </p>
        {APP_NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              title={collapsed ? item.label : undefined}
              onClick={() => handleNav(item.id)}
              className={
                "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-medium transition-all duration-200 " +
                (isActive
                  ? "bg-[color:var(--sidebar-nav-active-bg)] text-[color:var(--sidebar-nav-active-fg)] shadow-[var(--shadow-sm)]"
                  : "text-[color:var(--sidebar-nav-fg)] hover:bg-[color:var(--sidebar-nav-hover-bg)] hover:text-[color:var(--foreground)]")
              }
            >
              <span
                className={
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 " +
                  (isActive
                    ? "bg-[color:var(--accent)]/15 text-[color:var(--accent)]"
                    : "text-[color:var(--text-muted)] group-hover:text-[color:var(--accent)]")
                }
              >
                {item.icon}
              </span>
              {!collapsed ? (
                <span className="truncate">{item.label}</span>
              ) : (
                <span className="sr-only">{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-[color:var(--sidebar-border)] p-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] px-2 py-2 text-xs font-medium text-[color:var(--text-muted)] transition duration-200 hover:border-[color:var(--border-strong)] hover:text-[color:var(--foreground)] lg:inline-flex"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronIcon collapsed={collapsed} />
          {!collapsed ? <span>Collapse</span> : null}
        </button>
      </div>
    </aside>
  );
});

AppSidebar.displayName = "AppSidebar";

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={collapsed ? "rotate-180" : ""}
      aria-hidden
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
