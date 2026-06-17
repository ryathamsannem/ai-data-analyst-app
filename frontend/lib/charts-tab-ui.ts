/**
 * Charts tab — workspace / history explorer tokens (chart-first, not AI Insights clone).
 * Reuses shared viz plot theme via `chartVizThemeScope` from `ai-insights-ui.ts`.
 */

export const chartsTabPage =
  "charts-tab-page mb-10 w-full min-w-0 rounded-[1.35rem] border border-[color:var(--border-default)]/60 bg-[color:var(--surface-elevated)] p-4 shadow-[var(--shadow-sm)] ring-1 ring-slate-900/[0.02] sm:p-5 dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-panel)] dark:shadow-none dark:ring-white/[0.03]";

export const chartsTabHeaderRow =
  "mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between";

export const chartsTabTitle =
  "text-xl font-semibold tracking-tight text-[var(--foreground)] sm:text-2xl";

export const chartsTabDesc =
  "mt-2 text-sm leading-relaxed text-[color:var(--text-muted)] sm:text-[15px]";

export const chartsTabDescEmphasis =
  "font-medium text-[var(--foreground)]";

export const chartsTabDownloadBtn =
  "saas-btn-premium saas-btn-premium--sm shrink-0";

/** Preview card header stack — tighter than full Insights viz card. */
export const chartsTabVizHeaderZone =
  "w-full min-w-0 space-y-1.5 pb-0.5 text-center sm:space-y-2";

export const chartsTabVizKicker =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-subtle)] dark:text-[color:var(--insights-text-muted)]";

/** Plot stage — minimal vertical dead space. */
export const chartsTabVizPlotStage =
  "charts-tab-viz-plot-stage relative w-full min-w-0";

export const chartsTabVizPlotSlot =
  "charts-tab-viz-plot-slot mx-auto w-full min-h-0 min-w-0 max-w-full";

export const chartsTabSmartReadWrap =
  "mt-3 w-full min-w-0 border-t border-[color:var(--border-default)]/60 pt-4 sm:mt-3.5 dark:border-[color:var(--insights-border-soft)]";

/** Charts session plot — transition handled by `charts-tab-preview-enter`; no duplicate surface-in. */
export const chartsTabSessionPlotSurface =
  "ai-insights-viz-plot w-full min-w-0 overflow-visible rounded-[0.9rem] border border-[color:var(--border-default)]/40 bg-[color:var(--surface-elevated)] px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition-[border-color] duration-300 ease-out dark:border-[color:var(--insights-border-soft)] dark:bg-transparent dark:shadow-none";

export const chartsTabEmptyState =
  "space-y-4 rounded-[1.35rem] border border-[color:var(--border-default)]/55 bg-[color:var(--surface-elevated)] p-10 text-center text-[color:var(--text-muted)] shadow-[var(--shadow-sm)] ring-1 ring-slate-900/[0.02] dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-card)] dark:ring-white/[0.03]";

export const chartsTabEmptyTitle =
  "text-base font-semibold tracking-tight text-[var(--foreground)]";

/** Compact “Why this chart?” strip — below metadata / intel, above plot. */
export const chartsTabChartReasonStrip =
  "charts-tab-chart-reason charts-tab-chart-reason-enter mb-1 flex w-full min-w-0 items-start justify-center gap-2 rounded-lg border border-[color:var(--border-default)]/35 bg-[color:color-mix(in_srgb,var(--surface-subtle)_38%,transparent)] px-2.5 py-2 text-center sm:mb-1.5 sm:px-3 dark:border-[color:var(--insights-border-soft)] dark:bg-[color:color-mix(in_srgb,var(--insights-layer-inset)_55%,transparent)]";

export const chartsTabChartReasonIcon =
  "mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:color-mix(in_srgb,var(--accent)_72%,var(--text-subtle))] dark:text-[color:color-mix(in_srgb,var(--accent)_65%,var(--insights-text-muted))]";

export const chartsTabChartReasonLabel =
  "shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--text-subtle)] dark:text-[color:var(--insights-answer-label)]";

export const chartsTabChartReasonText =
  "min-w-0 text-[11px] leading-snug text-[color:var(--text-muted)] dark:text-[color:var(--insights-text-secondary)] sm:text-xs";

/** Timeline column in charts grid — bounded height, no stretch dead-zone for wheel events. */
export const chartsTabTimelineColumn =
  "flex min-h-0 min-w-0 w-full max-w-full flex-col self-start lg:h-[min(72vh,540px)] lg:max-h-[min(72vh,540px)]";

/** Timeline aside shell (header + scroll body; overflow on inner region only). */
export const chartsTabTimelineAside =
  "charts-tab-timeline flex h-full min-h-0 w-full min-w-0 max-w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-[color:var(--border-default)]/50 bg-[color:var(--surface-elevated)] shadow-[var(--shadow-sm)] ring-1 ring-slate-900/[0.02] transition-[border-color,box-shadow] duration-300 ease-out dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-card)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] dark:ring-white/[0.03] dark:hover:border-[color:var(--insights-border-medium)]";

export const chartsTabTimelineHeader =
  "shrink-0 border-b border-[color:var(--border-default)]/40 px-4 pb-3 pt-4 sm:px-5 dark:border-[color:var(--insights-border-soft)]";

export const chartsTabTimelineScrollBody =
  "charts-tab-timeline-scroll timeline-scroll-fine min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-auto px-4 pb-4 pt-3 sm:px-5 sm:pb-5";

export const chartsTabTimelineTitle =
  "text-sm font-semibold tracking-tight text-[var(--foreground)]";

export const chartsTabTimelineDesc =
  "mt-1 text-[11px] leading-relaxed text-[color:var(--text-muted)]";

export const chartsTabTimelineSectionLabel =
  "mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-subtle)] dark:text-[color:var(--insights-text-muted)]";

export const chartsTabTimelineCardBase =
  "charts-tab-timeline-card flex h-full min-h-[108px] w-full flex-col rounded-xl border p-3 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

export const chartsTabTimelineCardSelected =
  "charts-tab-timeline-card--selected border-[color:color-mix(in_srgb,var(--accent)_32%,var(--border-default))] bg-[color:color-mix(in_srgb,var(--accent-wash)_55%,var(--surface-elevated))] shadow-[0_4px_18px_-8px_color-mix(in_srgb,var(--accent)_22%,transparent),0_0_0_1px_color-mix(in_srgb,var(--accent)_18%,transparent)] ring-1 ring-[color:color-mix(in_srgb,var(--accent)_22%,transparent)] dark:border-[color:var(--insights-border-medium)] dark:bg-[color:var(--insights-layer-nested)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_24px_-12px_rgba(0,0,0,0.35)] dark:ring-[color:color-mix(in_srgb,var(--accent)_28%,transparent)]";

export const chartsTabTimelineCardIdle =
  "charts-tab-timeline-card--idle border-[color:var(--border-default)]/55 bg-[color:color-mix(in_srgb,var(--surface-subtle)_35%,var(--surface-elevated))] shadow-[0_1px_2px_rgba(15,23,42,0.03)] dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-inset)]";

/** Sticky preview header band when page scrolls (title, chips, intel strip). */
export const chartsTabPreviewHeaderSticky =
  "charts-tab-preview-header-sticky relative z-[2] -mx-0.5 rounded-t-[1.2rem] px-0.5 pb-0 sm:-mx-1 sm:px-1";

/** PNG export capture root — title, chips, reason, plot (excludes smart-read footer). */
export const chartsTabPngExportRoot = "charts-tab-png-export-root";

export const chartsTabTimelineCardTitle =
  "min-w-0 flex-1 line-clamp-2 text-sm font-medium leading-snug text-[var(--foreground)]";

export const chartsTabTimelineCardMeta =
  "mt-2 text-[11px] font-medium tabular-nums text-[color:var(--text-muted)]";

export const chartsTabTimelineCardPrompt =
  "mt-1 line-clamp-2 text-[11px] leading-snug text-[color:var(--text-muted)]";

export const chartsTabTimelineBadgeAi =
  "shrink-0 rounded-full border border-emerald-200/50 bg-emerald-50/80 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-900/85 dark:border-emerald-400/30 dark:bg-emerald-950/40 dark:text-emerald-100";

export const chartsTabTimelineBadgeAuto =
  "shrink-0 rounded-full border border-[color:var(--border-default)]/60 bg-[color:var(--surface-subtle)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)] dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-inset)] dark:text-[color:var(--insights-text-secondary)]";
