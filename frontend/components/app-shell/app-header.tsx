"use client";

import { memo } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

export const AppHeader = memo(function AppHeader({
  pageTitle,
  datasetLoaded,
  onMenuClick,
}: {
  pageTitle: string;
  datasetLoaded: boolean;
  onMenuClick: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-[color:var(--header-border)] bg-[color:var(--header-bg)]">
      <div className="app-page-gutter flex h-14 items-center gap-3 sm:h-16 sm:gap-4">
        <button
          type="button"
          onClick={onMenuClick}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] text-[color:var(--text-muted)] transition duration-200 hover:text-[color:var(--foreground)] lg:hidden"
          aria-label="Open navigation menu"
        >
          <MenuIcon />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            {pageTitle}
          </h1>
        </div>

        <div className="hidden max-w-[12rem] flex-1 sm:block md:max-w-xs lg:max-w-sm">
          <label className="sr-only" htmlFor="app-shell-search">
            Search
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-subtle)]">
              <SearchIcon />
            </span>
            <input
              id="app-shell-search"
              type="search"
              disabled
              placeholder="Search…"
              className="w-full rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] py-2 pl-9 pr-3 text-sm text-[color:var(--text-muted)] placeholder:text-[color:var(--text-subtle)] opacity-80"
              aria-disabled
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <DatasetStatus loaded={datasetLoaded} />
          <ThemeToggle />
          <button
            type="button"
            disabled
            className="hidden h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] text-xs font-semibold text-[color:var(--text-muted)] sm:inline-flex"
            aria-label="Profile (coming soon)"
            title="Profile (coming soon)"
          >
            <span aria-hidden>AA</span>
          </button>
        </div>
      </div>
    </header>
  );
});

AppHeader.displayName = "AppHeader";

const DatasetStatus = memo(function DatasetStatus({
  loaded,
}: {
  loaded: boolean;
}) {
  if (loaded) {
    return (
      <span className="hidden items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 sm:inline-flex">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]" />
        Dataset loaded
      </span>
    );
  }
  return (
    <span className="hidden items-center gap-2 rounded-full border border-[color:var(--border-default)] bg-[color:var(--surface-subtle)] px-2.5 py-1 text-xs font-medium text-[color:var(--text-muted)] sm:inline-flex">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--text-subtle)]" />
      No dataset
    </span>
  );
});

DatasetStatus.displayName = "DatasetStatus";

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" strokeLinecap="round" />
    </svg>
  );
}
