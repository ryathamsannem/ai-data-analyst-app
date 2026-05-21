/**
 * Overview tab surface tokens — theme-aware (light/dark via globals.css variables).
 */

export const ovSection = "space-y-1";

export const ovSectionTitle =
  "text-lg font-semibold tracking-tight text-foreground";

export const ovSectionDesc = "text-sm leading-relaxed text-[color:var(--text-muted)]";

export const ovCard =
  "rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card)] shadow-[var(--shadow-sm)]";

export const ovCardElevated =
  "rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--surface-elevated-card)] shadow-[var(--shadow-sm)]";

export const ovCardInteractive =
  `${ovCard} transition-all duration-200 hover:-translate-y-0.5 hover:border-[color:var(--border-strong)] hover:shadow-[var(--shadow-md)]`;

export const ovLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]";

export const ovMuted = "text-[color:var(--text-muted)]";

export const ovText = "text-foreground";

export const ovInset =
  "rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-inset)]";

export const ovChip =
  "inline-flex items-center rounded-full border border-[color:var(--border-default)] bg-gradient-to-b from-[color:var(--surface-elevated)] to-[color:var(--surface-subtle)] px-2.5 py-0.5 text-[10px] font-medium text-[color:var(--text-muted)] shadow-[var(--shadow-sm)] transition-all duration-200 hover:border-[color:var(--border-strong)] hover:shadow-[var(--shadow-md)]";

export const ovChipAccent =
  "inline-flex items-center rounded-full border border-[color:var(--accent-muted)] bg-[color:var(--accent-wash)] px-2.5 py-0.5 text-[10px] font-semibold text-[color:var(--accent)]";

export const ovBtnSecondary = "saas-btn-premium";

export const ovBtnSecondarySm = "saas-btn-premium saas-btn-premium--sm";

export const ovBtnPrimaryAccent = "saas-btn-accent";

export const ovBtnPrimaryAccentSm = "saas-btn-accent saas-btn-premium--sm";

/** Upload zone — selected file metadata (theme-aware). */
export const ovUploadSelectedWrap =
  "text-sm text-[color:var(--text-muted)] sm:text-right";

export const ovUploadSelectedName = "font-medium text-foreground";

export const ovUploadSelectedSize = "text-[color:var(--text-muted)]";

export const ovBtnGhostSm =
  "inline-flex items-center justify-center rounded-[0.85rem] border border-transparent bg-[color:var(--surface-subtle)] px-3 py-1.5 text-sm font-medium text-[color:var(--text-muted)] transition-all duration-200 hover:border-[color:var(--border-default)] hover:bg-[color:var(--surface-elevated)] hover:text-foreground active:scale-[0.99]";

export const ovDataLabel = "overview-data-label";

export const ovDataValue = "overview-data-value";

export const ovDataValueMono = "overview-data-value-mono";

export const ovDataHint = "text-xs font-normal text-[color:var(--text-subtle)]";

export const ovFilterClearBtn =
  "saas-btn-premium h-[52px] w-full text-sm font-semibold";

/** Centered section shell — max 1600px; pairs with `.overview-chart-grid` in globals.css */
export const ovChartsWrap = "overview-charts-wrap";

/** 1 col below 768px; max 2 cols desktop (never 3). Plot height via `--overview-chart-plot-min-h`. */
export const ovChartGrid = "overview-chart-grid";

export const ovChartCell = "overview-chart-grid__cell";

/** Optional manual override; desktop solo-row widening is automatic in globals.css */
export const ovChartCellSoloRow =
  "overview-chart-grid__cell overview-chart-grid__cell--solo-row";

export const ovChartInner = "overview-chart-grid__inner";

export const ovChartInnerSolo = "overview-chart-grid__inner overview-chart-grid__inner--solo";

export const ovDashChartCard = "overview-dash-chart-card";

export const ovDashChartHead = "overview-dash-chart-card__head";

export const ovDashChartActions = "overview-dash-chart-card__actions";

export const ovDashChartAction = "overview-dash-chart-action";

export const ovDashChartActionCharts =
  "overview-dash-chart-action overview-dash-chart-action--charts";

export const ovDashChartActionAskAi =
  "overview-dash-chart-action overview-dash-chart-action--ask-ai";

export const ovDashChartActionPng =
  "overview-dash-chart-action overview-dash-chart-action--png";

export const ovDashChartFooter = "overview-dash-chart-card__footer";

export const ovDashChartTitle = "overview-dash-chart-card__title";

export const ovDashChartPlot = "overview-chart-plot";

export const ovDashChartPlotInner = "overview-chart-plot-inner";

export const ovDashInsightChips = "overview-dash-insight-chips";

export const ovDashInsightChip = "overview-dash-insight-chip";

export const ovBtnChip =
  "saas-btn-premium saas-btn-premium--sm !px-2 !py-1 text-[11px]";

export const ovModalOverlay =
  "fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm";

export const ovModalPanel =
  "max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card)] shadow-[var(--shadow-card)]";

export const ovModalInput =
  "w-full rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] p-2.5 text-sm text-foreground shadow-[var(--shadow-sm)] outline-none transition focus:border-[color:var(--accent-muted)] focus:ring-2 focus:ring-[color:var(--accent)]/25";

export const ovFilterControl =
  "w-full min-w-0 rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] px-3 text-sm font-medium text-foreground shadow-[var(--shadow-sm)] outline-none transition focus:border-[color:var(--accent-muted)] focus:ring-2 focus:ring-[color:var(--accent)]/25";

export const ovFilterLabel = ovLabel;

export const ovKpiGradientTop =
  "pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[color:var(--accent)] via-[color:var(--accent)]/50 to-transparent";
