/**
 * Data Preview grid — theme-aware UI tokens (light/dark via globals.css).
 */

export const dpSectionTitle =
  "text-lg font-semibold tracking-tight text-foreground sm:text-xl";

export const dpSectionDesc = "mt-1.5 text-sm leading-relaxed text-[color:var(--text-muted)]";

/** Header main column — slightly wider than `max-w-3xl` for dataset card balance vs Rows control. */
export const dpPreviewHeaderMain =
  "min-w-0 w-full flex-1 lg:max-w-[min(54rem,calc(100%-11.5rem))]";

/** Spacing hook for Data Preview dataset strip (shell uses `ovCard`). */
export const dpDatasetContextStrip = "mt-3 w-full min-w-0 p-4 sm:p-5";

/** File cell in dataset grid — room for stem truncation + preserved extension. */
export const dpDatasetContextFileCell = "min-w-0 max-w-full sm:max-w-[14rem] md:max-w-[18rem] lg:max-w-[22rem]";

export const dpControl =
  "rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] px-3 py-2 text-sm font-medium text-foreground shadow-[var(--shadow-sm)] transition duration-200 hover:border-[color:var(--border-strong)] focus:border-[color:var(--accent-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/25";

export const dpSearchInput =
  "min-w-0 w-full rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] py-2 pl-10 pr-3 text-sm text-foreground shadow-[var(--shadow-sm)] placeholder:text-[color:var(--text-subtle)] transition duration-200 focus:border-[color:var(--accent-muted)] focus:outline-none focus:ring-[3px] focus:ring-[color:var(--accent)]/20";

/** Search row: wider on desktop, full width on small screens */
export const dpSearchWrap =
  "flex min-w-0 w-full flex-1 items-center gap-2 max-w-full sm:max-w-md md:max-w-lg lg:max-w-2xl xl:max-w-3xl";

export const dpToolbarRow =
  "flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3";

export const dpBtnGhost =
  "shrink-0 rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] px-3.5 py-2.5 text-xs font-semibold text-[color:var(--text-muted)] shadow-[var(--shadow-sm)] transition duration-200 hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-subtle)] hover:text-foreground active:scale-[0.99]";

export const dpSuggestionsPanel =
  "mb-4 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] p-4 shadow-[var(--shadow-sm)] sm:p-5";

export const dpSuggestionChip =
  "data-preview-suggestion-chip max-w-[min(100%,14rem)] shrink rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] px-3 py-2 text-left text-xs font-medium leading-snug text-foreground transition-all duration-200 hover:border-[color:var(--accent-muted)] hover:bg-[color:var(--accent-wash)] hover:shadow-[var(--shadow-sm)] active:scale-[0.99]";

export const dpSuggestionMore =
  "shrink-0 self-center rounded-xl border border-transparent bg-[color:var(--surface-subtle)] px-3 py-2 text-xs font-medium text-[color:var(--text-muted)] transition-all duration-200 hover:border-[color:var(--border-default)] hover:bg-[color:var(--surface-elevated)] hover:text-foreground active:scale-[0.99]";

export const dpInsightsPanel = "data-preview-insights mb-4";

export const dpTableShell = "data-preview-shell";

export const dpTableScroll = "data-preview-scroll";

export const dpTable = "data-preview-table";

export const dpThBtn =
  "flex h-full min-h-[2.5rem] w-full min-w-0 flex-col justify-start gap-1 rounded-lg px-0.5 py-px text-left transition-colors duration-200 hover:bg-[color:var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40";

export const dpThName =
  "line-clamp-2 min-h-0 text-[11px] font-semibold leading-tight tracking-tight text-foreground sm:text-[12px] sm:leading-snug";

export const dpThMeta = "data-preview-th-meta";

export const dpBadgeBase =
  "inline-flex max-w-[5.25rem] shrink-0 items-center truncate rounded-md border px-1 py-px text-[9px] font-medium leading-none sm:max-w-[5.5rem] sm:px-1.5 sm:text-[10px]";

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
