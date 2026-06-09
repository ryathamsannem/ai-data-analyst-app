/**
 * Data Preview grid — theme-aware UI tokens (light/dark via globals.css).
 */

export const dpSectionTitle =
  "text-lg font-semibold tracking-tight text-foreground sm:text-xl";

export const dpSectionDesc = "mt-1.5 text-sm leading-relaxed text-[color:var(--text-muted)]";

/** Header intro column (title + description). */
export const dpPreviewHeaderIntro = "min-w-0 w-full flex-1";

/** Compact dataset metadata banner — rows/columns included in strip. */
export const dpDatasetContextStrip =
  "w-full min-w-0 rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] px-3 py-2 shadow-[var(--shadow-sm)] sm:px-4";

/** Visible metadata fields in the dataset context strip. */
export const DATASET_CONTEXT_VISIBLE_FIELDS = [
  "status",
  "file",
  "size",
  "sheet",
  "rows",
  "columns",
] as const;

export const dpControl =
  "rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] px-3 py-2 text-sm font-medium text-foreground shadow-[var(--shadow-sm)] transition duration-200 hover:border-[color:var(--border-strong)] focus:border-[color:var(--accent-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/25";

export const dpSearchInput =
  "min-w-0 w-full rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] py-2 pl-10 pr-3 text-sm text-foreground shadow-[var(--shadow-sm)] placeholder:text-[color:var(--text-subtle)] transition duration-200 focus:border-[color:var(--accent-muted)] focus:outline-none focus:ring-[3px] focus:ring-[color:var(--accent)]/20";

/** Search row: ~68% width on desktop, full width on small screens; aligns with table column */
export const dpSearchWrap =
  "flex min-w-0 w-full items-center gap-2 lg:w-[68%] lg:max-w-[44rem]";

export const dpToolbarRow =
  "flex min-w-0 w-full flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3";

export const dpToolbarMatchMeta =
  "shrink-0 text-xs font-medium tabular-nums text-[color:var(--text-muted)] sm:ml-auto";

/** Compact footer aligned with table shell (styles in globals.css) */
export const dpPaginationBar = "data-preview-pagination mt-3 w-full min-w-0";

export const dpPaginationInner = "data-preview-pagination__inner";

export const dpPaginationMeta = "data-preview-pagination__meta";

export const dpPaginationNav = "data-preview-pagination__nav";

export const dpPaginationPill = "data-preview-pagination__pill";

export const dpPaginationBtn = "data-preview-pagination-btn";

export const dpBtnGhost =
  "shrink-0 rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] px-3.5 py-2.5 text-xs font-semibold text-[color:var(--text-muted)] shadow-[var(--shadow-sm)] transition duration-200 hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-subtle)] hover:text-foreground active:scale-[0.99]";

export const dpSuggestionsPanel =
  "mb-4 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] p-4 shadow-[var(--shadow-sm)] sm:p-5";

export const dpSuggestionChip =
  "data-preview-suggestion-chip max-w-[min(100%,14rem)] shrink rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] px-3 py-2 text-left text-xs font-medium leading-snug text-foreground transition-all duration-200 hover:border-[color:var(--accent-muted)] hover:bg-[color:var(--accent-wash)] hover:shadow-[var(--shadow-sm)] active:scale-[0.99]";

export const dpSuggestionMore =
  "shrink-0 self-center rounded-xl border border-transparent bg-[color:var(--surface-subtle)] px-3 py-2 text-xs font-medium text-[color:var(--text-muted)] transition-all duration-200 hover:border-[color:var(--border-default)] hover:bg-[color:var(--surface-elevated)] hover:text-foreground active:scale-[0.99]";

export const dpInsightsPanel = "data-preview-insights mb-4";

export const dpInsightSeverityInfo =
  "inline-flex shrink-0 items-center rounded-md border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-800 dark:text-sky-200";

export const dpInsightSeverityWarning =
  "inline-flex shrink-0 items-center rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:text-amber-200";

export const dpInsightSeverityAttention =
  "inline-flex shrink-0 items-center rounded-md border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-800 dark:text-rose-200";

export const dpTableShell = "data-preview-shell";

export const dpTableScroll = "data-preview-scroll";

export const dpTable = "data-preview-table";

export const dpThShell =
  "data-preview-th__shell flex h-full min-h-[2.5rem] w-full min-w-0 flex-col justify-start gap-0.5";

export const dpThSortBtn =
  "data-preview-th-sort flex w-full min-w-0 items-start justify-between gap-1 rounded-md px-0.5 py-px text-left transition-[background-color,box-shadow] duration-200 hover:bg-[color:var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/35";

export const dpThSortIcon = "data-preview-th-sort__icon mt-0.5 shrink-0";

export const dpThProfileBtn =
  "w-full min-w-0 rounded-md px-0.5 py-px text-left transition-colors duration-200 hover:bg-[color:var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/35";

export const dpThName = "data-preview-th-name";

export const dpThMeta = "data-preview-th-meta";

export const dpBadgeBase =
  "inline-flex max-w-[5rem] shrink-0 items-center truncate rounded-[5px] border px-0.5 py-0 text-[8.5px] font-medium leading-[1.15] sm:max-w-[5.25rem] sm:px-1 sm:text-[9px]";

export const dpBadgeType = `${dpBadgeBase} border-[color:var(--border-default)] bg-[color:var(--surface-subtle)] text-[color:var(--text-muted)] uppercase tracking-wide`;

export const dpBadgeMissing = `${dpBadgeBase} border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200`;

export const dpBadgeId = `${dpBadgeBase} border-violet-500/25 bg-violet-500/10 text-violet-800 dark:text-violet-200`;

export const dpBadgeUnique = `${dpBadgeBase} border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-200`;

export const dpBadgeClean = `${dpBadgeBase} border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200`;

export const dpCellSticky = "data-preview-cell data-preview-cell--sticky";

export const dpCell = "data-preview-cell";

export const dpCellNull = "data-preview-cell data-preview-cell--null";

export const dpNullPill =
  "inline-flex items-center rounded-md border border-rose-500/25 bg-rose-500/10 px-1.5 py-px text-[11px] font-medium text-rose-800 dark:text-rose-300 tabular-nums sm:text-xs sm:py-0.5";

export const dpEmptyState =
  "text-sm rounded-xl border border-dashed border-[color:var(--border-default)] bg-[color:var(--surface-inset)] px-4 py-3 text-[color:var(--text-muted)]";

export const dpEmptySearch =
  "text-sm mt-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-900 dark:text-amber-100";

export const dpQualitySummary =
  "mb-4 grid w-full min-w-0 gap-2.5 sm:grid-cols-3";

export const dpQualityCard =
  "rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] px-3 py-2.5 shadow-[var(--shadow-sm)]";

/** Quality summary — duplicate check is preview-window only, not full dataset. */
export const dpQualityDuplicateRowsLabel = "Duplicate rows (preview sample)";

export const dpQualityDuplicateRowsLabelFull = "Duplicate rows";

export function resolveDuplicateRowsLabel(
  loadedPreviewRows: number,
  totalDatasetRows: number
): string {
  if (
    loadedPreviewRows > 0 &&
    totalDatasetRows > 0 &&
    loadedPreviewRows < totalDatasetRows
  ) {
    return dpQualityDuplicateRowsLabel;
  }
  return dpQualityDuplicateRowsLabelFull;
}

export const dpQualityLabelGood =
  "inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-200";

export const dpQualityLabelReview =
  "inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:text-amber-200";

export const dpQualityLabelPoor =
  "inline-flex items-center rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-800 dark:text-rose-200";

export const dpSchemaPanel =
  "mb-4 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] shadow-[var(--shadow-sm)]";

export const dpSchemaSearchInput =
  "min-w-0 w-full rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] py-2 pl-10 pr-3 text-sm text-foreground placeholder:text-[color:var(--text-subtle)] focus:border-[color:var(--accent-muted)] focus:outline-none focus:ring-[3px] focus:ring-[color:var(--accent)]/20";

export const dpSchemaTableWrap =
  "max-h-[min(15rem,26vh)] overflow-y-auto [scrollbar-gutter:stable]";

export const dpSchemaTable =
  "w-full min-w-[42rem] border-collapse text-sm";

export const dpSchemaThead =
  "sticky top-0 z-[2] border-b border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] shadow-[0_1px_0_var(--border-default)]";

export const dpSchemaTh =
  "px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-subtle)] whitespace-nowrap";

export const dpSchemaThSortBtn =
  "inline-flex w-full items-center gap-1 rounded-md px-0.5 py-px text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/35";

export const dpSchemaThSortIcon =
  "inline-flex shrink-0 text-[color:var(--text-subtle)]";

export const dpSchemaTr =
  "cursor-pointer border-b border-[color:var(--border-default)] transition-colors hover:bg-[color:var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--accent)]/35 data-[selected=true]:bg-[color:var(--accent-wash)] data-[selected=true]:hover:bg-[color:var(--accent-wash)]";

export const dpSchemaTd =
  "px-3 py-2 align-middle text-[color:var(--text-muted)] tabular-nums whitespace-nowrap";

export const dpSchemaTdName =
  "px-3 py-2 align-middle font-medium text-foreground max-w-[14rem] truncate";

export const dpSchemaRoleBadge =
  "inline-flex max-w-[9rem] truncate rounded-md border border-[color:var(--border-default)] bg-[color:var(--surface-subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--text-muted)]";

export const dpSchemaRoleBadgeIdentifier =
  "inline-flex max-w-[9rem] truncate rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-800 dark:text-violet-200";

export const dpSchemaRoleBadgeCurrency =
  "inline-flex shrink-0 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:text-emerald-200";

export const dpSchemaRoleBadgeMetric =
  "inline-flex shrink-0 rounded-md border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 dark:text-sky-200";

export const dpSchemaRoleChipsWrap =
  "flex max-w-[12rem] flex-wrap gap-1.5";

export const dpSchemaHealthBadge =
  "inline-flex shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold capitalize";

export const dpSchemaHealthExcellent =
  `${dpSchemaHealthBadge} border-teal-500/25 bg-teal-500/10 text-teal-800 dark:text-teal-200`;

export const dpSchemaHealthWarning =
  `${dpSchemaHealthBadge} border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-200`;

export const dpSchemaHealthReview =
  `${dpSchemaHealthBadge} border-orange-500/25 bg-orange-500/10 text-orange-900 dark:text-orange-200`;

export const dpDatasetInsightsSummaryCard =
  "mb-4 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] p-4 shadow-[var(--shadow-sm)]";

export const dpDatasetSummaryKpiGrid =
  "mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5";

export const dpDatasetSummaryKpiChip =
  "rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] px-3 py-2 text-center";

export const dpDatasetSummaryKpiValue =
  "text-base font-semibold tabular-nums text-foreground";

export const dpDatasetSummaryKpiLabel =
  "mt-0.5 text-[10px] font-medium text-[color:var(--text-muted)]";

export const dpColumnDetailsBusinessBadge =
  "inline-flex shrink-0 items-center rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-800 dark:text-indigo-200";

export const dpColumnDetailsRecommendations =
  "rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] px-3 py-2.5";

export const dpColumnDetailsRecChipGood =
  "inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:text-emerald-200";

export const dpColumnDetailsRecChipAvoid =
  "inline-flex items-center gap-1 rounded-md border border-rose-500/20 bg-rose-500/8 px-2 py-0.5 text-[10px] font-medium text-rose-800 dark:text-rose-300";

export const dpColumnDetailsRecChipsWrap =
  "mt-1 flex flex-wrap gap-1.5";

export const dpColumnDetailsStatLabel =
  "text-[11px] font-medium text-[color:var(--text-subtle)]";

export const dpColumnDetailsRoleChipsWrap =
  "flex flex-wrap gap-1";

export const dpSchemaAction =
  "inline-flex items-center gap-0.5 text-xs font-semibold text-[color:var(--accent-muted)]";

export const dpTableToolbarRow =
  "mb-4 flex min-w-0 w-full flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3";

export const dpTableToolbarControls =
  "flex shrink-0 flex-wrap items-center gap-2.5 sm:ml-auto";

export const dpTypeBadge =
  "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

export const dpTypeBadgeText =
  `${dpTypeBadge} border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-200`;

export const dpTypeBadgeNumber =
  `${dpTypeBadge} border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-200`;

export const dpTypeBadgeDate =
  `${dpTypeBadge} border-violet-500/25 bg-violet-500/10 text-violet-800 dark:text-violet-200`;

export const dpTypeBadgeCategory =
  `${dpTypeBadge} border-indigo-500/25 bg-indigo-500/10 text-indigo-800 dark:text-indigo-200`;

export const dpTypeBadgeBoolean =
  `${dpTypeBadge} border-teal-500/25 bg-teal-500/10 text-teal-800 dark:text-teal-200`;

export const dpTypeBadgeCurrency =
  `${dpTypeBadge} border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200`;

export const dpTypeBadgeRate =
  `${dpTypeBadge} border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-200`;

export const dpColumnDetails =
  "mb-4 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] p-4 shadow-[var(--shadow-sm)]";

export const dpColumnDetailsRoleBadge =
  "inline-flex shrink-0 items-center rounded-md border border-[color:var(--border-default)] bg-[color:var(--surface-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--text-muted)]";

export const dpColumnDetailsRoleBadgeIdentifier =
  "inline-flex shrink-0 items-center rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-800 dark:text-violet-200";

export const dpColumnDetailsIdentifierPanel =
  "mt-3 rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-3 dark:bg-violet-500/10";

export const dpColumnDetailsStatGroup = "space-y-2";

export const dpColumnDetailsStatGroupTitle =
  "text-[11px] font-semibold text-[color:var(--text-muted)]";
