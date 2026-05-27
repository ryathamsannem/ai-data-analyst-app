/**
 * Data Preview grid — theme-aware UI tokens (light/dark via globals.css).
 */

export const dpSectionTitle =
  "text-lg font-semibold tracking-tight text-foreground sm:text-xl";

export const dpSectionDesc = "mt-1.5 text-sm leading-relaxed text-[color:var(--text-muted)]";

/** Header intro column (title + description). */
export const dpPreviewHeaderIntro = "min-w-0 w-full flex-1";

/** Full-width dataset metadata card — aligns with Overview dataset-ready strip. */
export const dpDatasetContextStrip = "w-full min-w-0 p-4 sm:p-5";

/** File cell — flexible width; middle truncation only when space is tight. */
export const dpDatasetContextFileCell =
  "min-w-0 sm:col-span-2 lg:col-span-2 xl:col-span-3";

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
