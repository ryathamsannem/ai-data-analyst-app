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
  "overview-kpi-pill inline-flex items-center rounded-full border border-[color:var(--border-default)] bg-gradient-to-b from-[color:var(--surface-elevated)] to-[color:var(--surface-subtle)] px-2.5 py-0.5 text-[10px] font-medium text-[color:var(--text-muted)] shadow-[var(--shadow-sm)] transition-all duration-200 hover:border-[color:var(--border-strong)] hover:shadow-[var(--shadow-md)]";

export const ovChipText = "overview-kpi-pill__text";

/** Compact dataset context row (non-Overview tabs). */
export const ovDatasetContextRow =
  "mb-4 flex min-w-0 flex-wrap items-center gap-2";

export const ovDatasetContextChip =
  "inline-flex max-w-[min(100%,18rem)] min-w-0 items-center truncate rounded-full border border-[color:var(--border-default)] bg-[color:color-mix(in_srgb,var(--surface-subtle)_55%,var(--surface-elevated))] px-2.5 py-0.5 text-[11px] font-medium text-foreground shadow-[var(--shadow-sm)] dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-inset)] dark:text-[color:var(--insights-text-secondary)]";

export const ovDatasetContextMeta =
  "text-xs tabular-nums text-[color:var(--text-muted)] dark:text-[color:var(--insights-text-muted)]";

export const ovDatasetContextSheetSelect =
  "h-8 min-w-[8.5rem] max-w-[14rem] cursor-pointer rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] px-2.5 text-xs font-medium text-foreground shadow-[var(--shadow-sm)] outline-none transition focus:border-[color:var(--accent-muted)] focus:ring-2 focus:ring-[color:var(--accent)]/25 dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-inset)]";

export const ovChipAccent =
  "inline-flex items-center rounded-full border border-[color:var(--accent-muted)] bg-[color:var(--accent-wash)] px-2.5 py-0.5 text-[10px] font-semibold text-[color:var(--accent)]";

export const ovBtnSecondary = "saas-btn-premium";

export const ovBtnSecondarySm = "saas-btn-premium saas-btn-premium--sm";

/** Overview Interactive filters shell — pairs with globals `.overview-interactive-filters`. */
export const ovInteractiveFiltersShell = "overview-interactive-filters";

/** Dashboard filter controls (height in globals.css). */
export const ovDashboardControlH = "overview-filter-control";

/** Filter date field + premium calendar popup (Overview + AI Insights). */
export const ovFilterDateField = "filter-date-field";

export const ovFilterDateFieldValue = "filter-date-field__value";

export const ovFilterDateFieldValuePlaceholder =
  "filter-date-field__value filter-date-field__value--placeholder";

export const ovFilterDatePickerPopup = "filter-date-picker-popup";

export const ovFilterDatePickerHeader = "filter-date-picker-popup__header";

export const ovFilterDatePickerMonth = "filter-date-picker-popup__month";

export const ovFilterDatePickerNavBtn = "filter-date-picker-popup__nav";

export const ovFilterDatePickerWeekdays = "filter-date-picker-popup__weekdays";

export const ovFilterDatePickerWeekday = "filter-date-picker-popup__weekday";

export const ovFilterDatePickerGrid = "filter-date-picker-popup__grid";

export const ovFilterDatePickerDay = "filter-date-picker-popup__day";

export const ovFilterDatePickerDayMuted = "filter-date-picker-popup__day filter-date-picker-popup__day--muted";

export const ovFilterDatePickerDaySelected =
  "filter-date-picker-popup__day filter-date-picker-popup__day--selected";

/** Clear filters — height/typography in globals.css per shell class. */
export const ovDashboardFilterBtn =
  "overview-filter-clear-btn saas-btn-premium inline-flex shrink-0 items-center justify-center leading-none";

/** Dataset ready / data setup secondary actions — aligned with compact filter density. */
export const ovOverviewSecondaryBtn =
  "saas-btn-premium inline-flex h-[44px] min-h-[44px] shrink-0 items-center justify-center !py-0 px-3.5 text-[0.8125rem] font-medium leading-none box-border";

export function formatOverviewFilenameMiddle(name: string, maxLen = 52): string {
  if (!name || name.length <= maxLen) return name;
  const match = name.match(/^(.+?)(\.[^./\\]+)?$/);
  const base = match?.[1] ?? name;
  const ext = match?.[2] ?? "";
  const ellipsis = "...";
  const room = maxLen - ext.length - ellipsis.length;
  if (room < 6) {
    return `${name.slice(0, Math.max(1, maxLen - ellipsis.length))}${ellipsis}`;
  }
  const headLen = Math.ceil(room * 0.58);
  const tailLen = Math.floor(room * 0.42);
  return `${base.slice(0, headLen)}${ellipsis}${base.slice(-tailLen)}${ext}`;
}

export const ovBtnPrimaryAccent = "saas-btn-accent";

export const ovBtnPrimaryAccentSm = "saas-btn-accent saas-btn-premium--sm";

/** Overview upload — accepted extensions and validation. */
export const OVERVIEW_UPLOAD_ACCEPT =
  ".csv,.xlsx,.xls,.parquet,.json,.jsonl";

export const OVERVIEW_UPLOAD_EXT_PATTERN =
  /\.(csv|xlsx|xls|parquet|json|jsonl)$/i;

export const OVERVIEW_UPLOAD_FORMAT_HINT =
  "Supports CSV, Excel, JSON, and Parquet datasets.";

/** Empty-state upload dropzone copy (Overview first load). */
export const OVERVIEW_UPLOAD_LANDING_TITLE = "Upload your dataset";

export const OVERVIEW_UPLOAD_LANDING_SUBTITLE =
  "Drag & drop a dataset or click anywhere to upload";

export const OVERVIEW_UPLOAD_LANDING_HELPER = OVERVIEW_UPLOAD_FORMAT_HINT;

/** Selected-file kicker in Overview upload dropzone (muted label). */
export const ovUploadSelectedKicker =
  "text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)] opacity-55 dark:opacity-50";

export const OVERVIEW_UPLOAD_INVALID_MSG =
  "Please choose a supported dataset file (.csv, .xlsx, .xls, .parquet, .json, .jsonl).";

/** Overview upload drop zone (idle / active toggled in JSX). */
export const ovUploadDropzone = "overview-upload-dropzone";

export const ovUploadDropzoneIdle =
  "border-[color:var(--border-default)] bg-[color:var(--surface-inset)]";

export const ovUploadDropzoneActive =
  "border-[color:var(--accent)] bg-[color:var(--accent-wash)]";

/** Dataset card empty state — subtle inset + capability chips. */
export const ovDatasetEmptyInset =
  "mt-3 rounded-xl border border-dashed border-[color:var(--border-default)] bg-[color:color-mix(in_srgb,var(--surface-inset)_92%,transparent)] px-3 py-3 dark:border-[color:var(--insights-border-soft)] dark:bg-[color:color-mix(in_srgb,var(--insights-layer-inset)_65%,transparent)]";

export const ovCapabilityChip =
  "inline-flex items-center rounded-full border border-[color:var(--border-default)] bg-[color:color-mix(in_srgb,var(--surface-elevated)_75%,var(--surface-subtle))] px-2.5 py-0.5 text-[10px] font-medium text-[color:var(--text-muted)] dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-inset)] dark:text-[color:var(--insights-text-secondary)]";

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

export const ovFilterClearBtn = `${ovDashboardFilterBtn} min-w-[7.5rem]`;

/** Centered section shell — max 1600px; pairs with `.overview-chart-grid` in globals.css */
export const ovChartsWrap = "overview-charts-wrap";

/** 1 col below 768px; 2 cols only when container ≥1000px (see globals.css @container). */
export const ovChartGrid = "overview-chart-grid";

export const ovChartCell = "overview-chart-grid__cell";

/** Last odd chart in a 2-col grid — spans row; inner card stays one-column width (see globals.css). */
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

export const chartRateQualityWarningClass = "chart-rate-quality-warning";

export const ovDashInsightChip = "overview-dash-insight-chip";

/** PNG capture root — title, insight chips, plot (excludes action buttons). */
export const overviewPngExportRoot =
  "overview-png-export-root charts-tab-png-export-root";

/** Marker for chart-png-capture header extraction (no layout styles). */
export const overviewPngExportHeader = "overview-png-export-header";

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
