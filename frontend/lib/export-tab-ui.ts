/**
 * Export tab — report builder surfaces (light/dark via globals.css + insights tokens).
 * Do not use on Overview, AI Insights, or Charts except shared buttons from ui-buttons.
 */

export const exportTabPage =
  "export-tab-page mb-6 w-full min-w-0 rounded-[1.35rem] border border-[color:var(--border-default)]/60 bg-[color:var(--surface-elevated)] p-4 shadow-[var(--shadow-sm)] ring-1 ring-slate-900/[0.02] sm:p-5 dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-panel)] dark:shadow-none dark:ring-white/[0.03]";

export const exportTabHeaderRow = "space-y-1";

export const exportTabTitle =
  "text-xl font-semibold tracking-tight text-[var(--foreground)] sm:text-2xl";

export const exportTabDesc =
  "mt-1.5 text-sm leading-relaxed text-[color:var(--text-muted)] sm:text-[15px] dark:text-[color:var(--insights-text-muted)]";

export const exportTabStack = "mt-4 space-y-4 sm:space-y-5";

/** Nested section cards (summary, branding, options). */
export const exportTabSectionCard =
  "rounded-2xl border border-[color:var(--border-default)]/55 bg-[color:color-mix(in_srgb,var(--surface-subtle)_38%,var(--surface-elevated))] p-4 shadow-[var(--shadow-sm)] ring-1 ring-slate-900/[0.015] sm:p-5 dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-card)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] dark:ring-white/[0.03]";

export const exportTabSectionKicker =
  "text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-subtle)] dark:text-[color:var(--insights-text-muted)]";

export const exportTabSectionTitle =
  "text-sm font-semibold tracking-tight text-[var(--foreground)]";

export const exportTabSectionDesc =
  "mt-1 text-xs leading-relaxed text-[color:var(--text-muted)] dark:text-[color:var(--insights-text-muted)]";

/** Report Preview Summary — compact metadata grid. */
export const exportTabSummaryGrid =
  "mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2.5";

export const exportTabSummaryChip =
  "flex min-w-0 flex-col gap-0.5 rounded-xl border border-[color:var(--border-default)]/45 bg-[color:var(--surface-elevated)] px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-inset)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";

export const exportTabSummaryChipLabel =
  "text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--text-subtle)] dark:text-[color:var(--insights-answer-label)]";

export const exportTabSummaryChipValue =
  "text-sm font-medium leading-snug text-[var(--foreground)] tabular-nums dark:text-[color:var(--insights-text-secondary)]";

export const exportTabSummaryChipValueMuted =
  "text-sm font-medium leading-snug text-[color:var(--text-muted)] dark:text-[color:var(--insights-text-muted)]";

export const exportTabSummaryChipSpan =
  "sm:col-span-2";

export const exportTabSummarySectionsWrap =
  "mt-0.5 flex min-w-0 flex-wrap gap-1.5";

export const exportTabSummarySectionPill =
  "inline-flex max-w-full min-w-0 items-center truncate rounded-full border border-[color:var(--border-default)]/55 bg-[color:color-mix(in_srgb,var(--surface-subtle)_42%,var(--surface-elevated))] px-2 py-0.5 text-[11px] font-medium text-[var(--foreground)] dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-nested)] dark:text-[color:var(--insights-text-secondary)]";

export const exportTabExecutivePreview =
  "mt-3 rounded-xl border border-[color:var(--border-default)]/45 bg-[color:var(--surface-elevated)] px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-inset)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";

export const exportTabExecutivePreviewTitle =
  "text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--text-subtle)] dark:text-[color:var(--insights-text-muted)]";

export const exportTabExecutivePreviewScope =
  "mt-0.5 text-[11px] leading-snug text-[color:var(--text-muted)] dark:text-[color:var(--insights-text-muted)]";

export const exportTabExecutivePreviewBody =
  "mt-2 text-sm leading-snug text-[color:var(--text-muted)] dark:text-[color:var(--insights-text-secondary)]";

export const exportTabExecutivePreviewList =
  "mt-2 list-none space-y-1.5 text-xs leading-snug text-[color:var(--text-muted)] dark:text-[color:var(--insights-text-secondary)]";

/** Branding form fields. */
export const exportTabFormGrid =
  "mt-3 space-y-3";

export const exportTabFormRow =
  "flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-4";

export const exportTabFieldLabel =
  "mb-1 block text-[13px] font-medium text-[color:var(--text-muted)] dark:text-[color:var(--insights-text-secondary)]";

export const exportTabTextInput =
  "h-10 w-full rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] px-3 text-sm text-[var(--foreground)] shadow-[var(--shadow-sm)] outline-none transition focus:border-[color:var(--accent-muted)] focus:ring-2 focus:ring-[color:var(--accent)]/25 dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-inset)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:placeholder:text-[color:var(--insights-text-muted)]";

export const exportTabColorField =
  "flex w-full flex-col text-sm lg:w-[8.5rem] lg:flex-none";

export const exportTabColorSwatchWrap =
  "flex h-10 items-center gap-2 rounded-xl border border-[color:var(--border-default)]/55 bg-[color:var(--surface-elevated)] px-2 shadow-[var(--shadow-sm)] dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-inset)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";

export const exportTabColorInput =
  "h-8 w-12 min-w-12 shrink-0 cursor-pointer rounded-lg border border-[color:var(--border-default)]/60 bg-transparent p-0.5 outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/35 dark:border-[color:var(--insights-border-soft)]";

export const exportTabColorHex =
  "min-w-0 flex-1 truncate font-mono text-[11px] tabular-nums text-[color:var(--text-muted)] dark:text-[color:var(--insights-text-muted)]";

/** Include in report — compact option tiles. */
export const exportTabOptionsGrid =
  "mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2";

export const exportTabCheckboxRow =
  "export-tab-checkbox flex min-h-[2.75rem] cursor-pointer items-center gap-2.5 rounded-xl border border-[color:var(--border-default)]/55 bg-[color:var(--surface-elevated)] px-3 py-2 text-sm text-[var(--foreground)] shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow] duration-200 hover:border-[color:color-mix(in_srgb,var(--accent)_22%,var(--border-default))] hover:shadow-[0_2px_8px_-4px_rgba(15,23,42,0.12)] has-[:checked]:border-[color:color-mix(in_srgb,var(--accent)_32%,var(--border-default))] has-[:checked]:bg-[color:color-mix(in_srgb,var(--accent-wash)_38%,var(--surface-elevated))] has-[:checked]:shadow-[0_2px_10px_-6px_color-mix(in_srgb,var(--accent)_28%,transparent)] dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-inset)] dark:shadow-none dark:hover:border-[color:var(--insights-border-medium)] dark:hover:bg-[color:var(--insights-layer-nested)] dark:hover:shadow-none dark:has-[:checked]:border-[color:var(--insights-border-medium)] dark:has-[:checked]:bg-[color:color-mix(in_srgb,var(--accent)_8%,var(--insights-layer-nested))] dark:has-[:checked]:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

export const exportTabCheckboxRowWide = `${exportTabCheckboxRow} sm:col-span-2`;

export const exportTabCheckboxInput =
  "size-4 shrink-0 rounded border-[color:var(--border-default)] text-[color:var(--accent)] focus:ring-[color:var(--accent)]/30 dark:border-[color:var(--insights-border-medium)] dark:bg-[color:var(--insights-layer-card)]";

export const exportTabCheckboxLabel =
  "min-w-0 leading-snug text-[var(--foreground)] dark:text-[color:var(--insights-text-secondary)]";

export const exportTabAdvancedDivider =
  "border-t border-[color:var(--border-default)]/50 pt-4 dark:border-[color:var(--insights-border-soft)]";

export const exportTabAdvancedStack = "mt-2.5 space-y-2";

/** Footer — download CTA aligned with card rhythm. */
export const exportTabFooter =
  "!mt-3 flex flex-col gap-2 border-t border-[color:var(--border-default)]/50 pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2.5 dark:border-[color:var(--insights-border-soft)]";

export const exportTabFooterHint =
  "min-w-0 flex-1 text-xs leading-snug text-[color:var(--text-muted)] dark:text-[color:var(--insights-text-muted)]";

/** Primary CTA — same system as Charts PNG / premium actions; scoped polish in globals.css */
export const exportTabDownloadBtn =
  "export-tab-download-btn saas-btn-premium saas-btn-premium--sm shrink-0";
