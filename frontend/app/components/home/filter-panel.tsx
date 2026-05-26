"use client";

import { memo, useCallback, useMemo } from "react";
import {
  type DashboardDimensionOptions,
  type DashboardFilterEntry,
} from "@/app/dashboard-filter-types";
import { useDevRenderCount } from "@/lib/dev-render-count";
import {
  ovCard,
  ovFilterClearBtn,
  ovDashboardControlH,
  ovFilterControl,
  ovFilterLabel,
  ovInteractiveFiltersShell,
  ovMuted,
  ovSectionDesc,
  ovSectionTitle,
} from "@/lib/overview-ui";

function FilterPanelInner({
  dashboardFilters,
  dimensionOptions,
  filterBreadcrumb,
  dashboardEmpty,
  dateStart,
  dateEnd,
  onPickDimension,
  onRemoveFilter,
  onClearAll,
  onDateStart,
  onDateEnd,
  appearance = "legacy",
  overviewFilterCompact = false,
}: {
  dashboardFilters: DashboardFilterEntry[];
  dimensionOptions: DashboardDimensionOptions;
  filterBreadcrumb: string;
  dashboardEmpty: boolean;
  dateStart: string;
  dateEnd: string;
  onPickDimension: (column: string, label: string, value: string | null) => void;
  onRemoveFilter: (column: string) => void;
  onClearAll: () => void;
  onDateStart: (v: string) => void;
  onDateEnd: (v: string) => void;
  appearance?: "legacy" | "dashboard";
  /** Overview tab only — 46px compact filter row (globals.css). */
  overviewFilterCompact?: boolean;
}) {
  useDevRenderCount("FilterPanel");
  const isDashboard = appearance === "dashboard";
  const useOverviewCompact = isDashboard && overviewFilterCompact;
  const useDashboardFilters = isDashboard && !overviewFilterCompact;
  const fieldGap = useOverviewCompact || useDashboardFilters ? "gap-1" : "gap-1.5";
  /** Legacy appearance only; dashboard height is set in globals.css (50px). */
  const controlH = "h-[52px]";
  const controlBase = isDashboard
    ? `${ovFilterControl} ${ovDashboardControlH} cursor-pointer`
    :
        "w-full min-w-0 rounded-xl border border-slate-200/80 bg-white px-3 text-sm font-medium text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition " +
          "focus:border-indigo-300/90 focus:ring-2 focus:ring-indigo-200/55 [color-scheme:light]";
  const selectChevron =
    "appearance-none bg-[length:0.75rem] bg-[position:right_0.75rem_center] bg-no-repeat pr-10 " +
    "bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%228%22%20viewBox%3D%220%200%2012%208%22%3E%3Cpath%20d%3D%22M1%202l5%204%205-4%22%20stroke%3D%22%2394a3b8%22%20fill%3D%22none%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')]";
  /** Native date picker only (no duplicate custom calendar icon). */
  const dateInputInner = isDashboard
    ? "w-full min-w-0 border-0 bg-transparent p-0 text-sm font-medium text-foreground outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-80"
    :
        "w-full min-w-0 border-0 bg-transparent p-0 text-sm font-medium text-slate-900 outline-none " +
          "[color-scheme:light] cursor-pointer " +
          "[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100";

  const labelCls = isDashboard
    ? `block min-h-[18px] ${ovFilterLabel}`
    : "block min-h-[18px] text-[11px] font-semibold uppercase tracking-wide text-slate-500";

  const breadcrumbSegments = useMemo(
    () =>
      filterBreadcrumb
        .split(/\s*(?:›|\u203a|->)\s*/)
        .map((s) => s.trim())
        .filter(Boolean),
    [filterBreadcrumb]
  );

  const clearDateRange = useCallback(() => {
    onDateStart("");
    onDateEnd("");
  }, [onDateStart, onDateEnd]);

  const renderSelect = (key: "department" | "location" | "designation") => {
    const cfg = dimensionOptions[key];
    if (
      !cfg ||
      cfg.column === undefined ||
      !cfg.values ||
      cfg.values.length === 0
    ) {
      return null;
    }
    const current =
      dashboardFilters.find((f) => f.column === cfg.column)?.value ?? "";
    return (
      <div className={`flex min-w-0 flex-col ${fieldGap}`}>
        <span className={labelCls}>{cfg.label}</span>
        <select
          value={current}
          onChange={(e) =>
            onPickDimension(
              cfg.column,
              cfg.label,
              e.target.value.trim() ? e.target.value : null
            )
          }
          className={`${controlBase} ${selectChevron}`}
        >
          <option value="">All</option>
          {cfg.values.map((v) => (
            <option key={v} value={v}>
              {v.length > 42 ? `${v.slice(0, 40)}…` : v}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const hasDateDim = Boolean(dimensionOptions.date?.column);
  const dateCfg = dimensionOptions.date;
  const hasAnyDim =
    Boolean(dimensionOptions.department) ||
    Boolean(dimensionOptions.location) ||
    Boolean(dimensionOptions.designation) ||
    hasDateDim;

  if (!hasAnyDim) return null;

  const dateActive = Boolean(dateStart || dateEnd);

  const deptNode = renderSelect("department");
  const locNode = renderSelect("location");
  const desNode = renderSelect("designation");

  const lgGridCols =
    hasDateDim && dateCfg?.column !== undefined
      ? "lg:grid-cols-6"
      : "lg:grid-cols-4";

  const filterShellClass = useOverviewCompact
    ? ovInteractiveFiltersShell
    : useDashboardFilters
      ? "dashboard-interactive-filters"
      : "";

  const shellCls = isDashboard
    ? `${filterShellClass} space-y-3 p-4 sm:p-5 ${ovCard}`
    : "space-y-4 rounded-2xl border border-slate-200/55 bg-white/95 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.045)] backdrop-blur-[2px] sm:p-5";

  const dateBarCls = isDashboard
    ? `overview-filter-date-bar flex w-full min-w-0 items-center overflow-hidden border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] shadow-[var(--shadow-sm)] transition focus-within:border-[color:var(--accent-muted)] focus-within:ring-2 focus-within:ring-[color:var(--accent)]/25`
    :
        `${controlH} flex w-full min-w-0 items-center overflow-hidden rounded-xl border border-slate-200/80 bg-white px-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition ` +
        "focus-within:border-indigo-300/90 focus-within:ring-2 focus-within:ring-indigo-200/55";

  const clearBtnCls = isDashboard
    ? ovFilterClearBtn
    : `saas-btn-premium ${controlH} w-full inline-flex items-center justify-center px-4 text-sm font-semibold`;

  const filterChipCls = isDashboard
    ? "inline-flex items-center gap-1.5 rounded-full border border-[color:var(--accent-muted)] bg-[color:var(--accent-wash)] px-3 py-1 text-xs font-medium text-foreground transition duration-150 hover:border-[color:var(--accent)] hover:bg-[color:var(--accent-wash)]"
    : "inline-flex items-center gap-1.5 rounded-full border border-indigo-200/70 bg-indigo-50/90 px-3 py-1 text-xs font-medium text-indigo-900 shadow-[0_1px_2px_rgba(67,56,202,0.06)] transition duration-150 hover:border-indigo-300/80 hover:bg-indigo-100/90";

  return (
    <div className={shellCls}>
      <div className="flex flex-col gap-1">
        <h3
          className={
            isDashboard
              ? `${ovSectionTitle} text-base`
              : "text-sm font-semibold tracking-tight text-slate-900"
          }
        >
          Interactive filters
        </h3>
        <p
          className={
            isDashboard
              ? `${ovSectionDesc} text-xs`
              : "text-xs leading-relaxed text-slate-500"
          }
        >
          Slice KPIs and charts; filters apply to AI analysis for this session.
        </p>
      </div>

      {/* One SaaS filter bar: same row on xl; wrap on smaller screens; date full width when stacked */}
      <div
        className={`grid grid-cols-1 items-end gap-x-3 sm:grid-cols-2 ${lgGridCols} lg:gap-x-3 xl:gap-x-4 ${
          useOverviewCompact || useDashboardFilters ? "gap-y-2.5" : "gap-y-3"
        }`}
      >
        {deptNode ? (
          <div className="min-w-0 lg:col-span-1">{deptNode}</div>
        ) : null}
        {locNode ? (
          <div className="min-w-0 lg:col-span-1">{locNode}</div>
        ) : null}
        {desNode ? (
          <div className="min-w-0 lg:col-span-1">{desNode}</div>
        ) : null}

        {hasDateDim && dateCfg?.column !== undefined ? (
          <div className={`min-w-0 sm:col-span-2 lg:col-span-3 flex flex-col ${fieldGap}`}>
            <span className={labelCls}>Date range</span>
            <div className="flex flex-wrap items-stretch gap-2">
              <div className={`${dateBarCls} min-w-0 flex-1 basis-[min(100%,11rem)]`}>
                <label
                  className={`flex h-full min-h-0 min-w-0 flex-1 cursor-pointer items-center border-r ${
                    useOverviewCompact ? "px-1.5" : isDashboard ? "px-2" : "px-2 py-2"
                  } ${
                    isDashboard
                      ? "border-[color:var(--border-default)]"
                      : "border-slate-200/80"
                  }`}
                >
                  <input
                    type="date"
                    value={dateStart}
                    onChange={(e) => onDateStart(e.target.value)}
                    className={dateInputInner}
                    aria-label="From date"
                  />
                </label>
                <label
                  className={`flex h-full min-h-0 min-w-0 flex-1 cursor-pointer items-center ${
                    useOverviewCompact ? "px-1.5" : "px-2"
                  } ${isDashboard ? "" : "py-2"}`}
                >
                  <input
                    type="date"
                    value={dateEnd}
                    onChange={(e) => onDateEnd(e.target.value)}
                    className={dateInputInner}
                    aria-label="To date"
                  />
                </label>
              </div>
              {isDashboard ? (
                <button type="button" onClick={onClearAll} className={clearBtnCls}>
                  Clear filters
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {!isDashboard || !hasDateDim ? (
          <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2 lg:col-span-1 lg:justify-self-stretch">
            <span className={`${labelCls} max-lg:invisible lg:select-none`} aria-hidden>
              &nbsp;
            </span>
            <button type="button" onClick={onClearAll} className={clearBtnCls}>
              Clear filters
            </button>
          </div>
        ) : null}
      </div>

      {(dashboardFilters.length > 0 || dateActive) && (
        <div className={useOverviewCompact || useDashboardFilters ? "space-y-1" : "space-y-1.5"}>
          <p
            className={`text-[11px] font-semibold uppercase tracking-wide ${
              isDashboard ? ovFilterLabel : "text-slate-500"
            }`}
          >
            Filters active
          </p>
          <div className="flex flex-wrap gap-2">
            {dashboardFilters.map((f) => (
              <button
                key={f.column}
                type="button"
                onClick={() => onRemoveFilter(f.column)}
                className={filterChipCls}
              >
                <span>
                  {f.label}: {f.value}
                </span>
                <span aria-hidden className="text-indigo-500">
                  ×
                </span>
              </button>
            ))}
            {dateActive && hasDateDim ? (
              <button
                type="button"
                onClick={clearDateRange}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/60 bg-slate-50/90 px-3 py-1 text-xs font-medium text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.045)] transition duration-150 hover:border-slate-300/70 hover:bg-slate-100/90"
              >
                Date: {dateStart || "…"} — {dateEnd || "…"}
                <span aria-hidden className="text-slate-500">
                  ×
                </span>
              </button>
            ) : null}
          </div>
        </div>
      )}

      {filterBreadcrumb.trim() ? (
        <div
          className={`flex flex-wrap items-center gap-2 border-t border-slate-200/50 dark:border-[color:var(--border-default)] ${
            useOverviewCompact || useDashboardFilters ? "pt-2.5" : "pt-3"
          }`}
        >
          <span className="shrink-0 rounded-full border border-slate-200/70 bg-slate-50/90 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:border-[color:var(--border-default)] dark:bg-[color:var(--surface-elevated)] dark:text-[color:var(--text-muted)]">
            Drill path
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {breadcrumbSegments.map((seg, i) => (
                <span key={`${i}-${seg.slice(0, 24)}`} className="flex items-center gap-1.5">
                  {i > 0 ? (
                    <span
                      className="text-slate-300 dark:text-[color:var(--text-subtle)]"
                      aria-hidden
                    >
                      /
                    </span>
                  ) : null}
                  <span className="max-w-[min(100%,18rem)] truncate rounded-full border border-slate-200/60 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700 shadow-[0_1px_1px_rgba(15,23,42,0.04)] dark:border-[color:var(--border-default)] dark:bg-[color:var(--surface-elevated)] dark:text-foreground dark:shadow-none">
                    {seg}
                  </span>
                </span>
              ))}
          </div>
        </div>
      ) : null}

      {dashboardEmpty ? (
        <p className="rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/28 dark:bg-amber-950/35 dark:text-amber-100/95">
          No records match current filters.
        </p>
      ) : null}
    </div>
  );
}

export const FilterPanel = memo(FilterPanelInner);
FilterPanel.displayName = "FilterPanel";
