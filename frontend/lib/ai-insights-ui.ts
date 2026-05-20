/**
 * AI Insights tab — visual tokens (light/dark via globals.css + Tailwind dark:).
 * Do not use on Overview, Charts, or Export tabs except where noted.
 */

export const aiInsightsPage = "ai-insights-page";

export const aiInsightsOuterShell =
  "mb-8 w-full min-w-0 rounded-[1.25rem] border border-[color:var(--border-default)] bg-gradient-to-b from-[var(--surface-subtle)] via-[color:var(--surface-elevated)] to-[var(--surface-accent-wash)] p-4 shadow-[var(--shadow-card)] ring-1 ring-slate-900/[0.02] sm:p-5 dark:from-[color:var(--insights-layer-shell)] dark:via-[color:var(--insights-layer-panel)] dark:to-[#0a1224] dark:ring-white/[0.04]";

export const aiInsightsPanelShell =
  "min-w-0 w-full rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] p-3.5 sm:p-4 shadow-[var(--shadow-sm)] transition-shadow duration-300 hover:shadow-[var(--shadow-md)] dark:border-[color:var(--insights-border-soft)] dark:bg-gradient-to-b dark:from-[color:var(--insights-layer-panel)] dark:to-[color:var(--insights-layer-card)]";

export const aiInsightsPanelShellScroll =
  `${aiInsightsPanelShell} ai-insights-suggested-scroll lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:overscroll-contain`;

/** Right column blocks — full width, left-aligned with Ask AI panel (no centered narrow column). */
export const aiInsightsMainBlock = "w-full min-w-0";

export const aiInsightsGrid =
  "ai-insights-grid grid w-full min-w-0 grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,min(100%,268px))_minmax(0,1fr)] lg:items-start lg:gap-3 xl:gap-4";

export const aiInsightsAskPanel =
  `${aiInsightsPanelShell} ai-insights-ask-panel min-w-0 w-full !p-3 sm:!p-3.5`;

/** Ask AI column — hierarchy, input, and actions (Insights only). */
export const aiInsightsAskHeading =
  "text-base font-semibold tracking-tight text-[var(--foreground)] sm:text-lg";

export const aiInsightsAskHeaderRow =
  "mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2";

export const aiInsightsAskResetBtn =
  "shrink-0 !py-1.5 !px-3 !text-xs sm:!text-sm";

export const aiInsightsAskMetaRow =
  "mb-2 flex flex-wrap items-center gap-1.5";

export const aiInsightsAskAssumptionNote =
  "mb-2 text-[11px] leading-snug text-slate-500 dark:text-[color:var(--insights-text-muted)]";

export const aiInsightsAskQuestionLabel =
  "mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-[color:var(--insights-text-secondary)]";

export const aiInsightsAskInputBlock = "mt-2";

export const aiInsightsAskComposer =
  "ai-insights-ask-composer flex flex-col gap-1";

export const aiInsightsAskTextarea =
  "ai-insights-ask-textarea w-full min-h-[5.75rem] resize-y rounded-xl border border-[color:var(--border-default)]/70 bg-[color:var(--surface-elevated)] px-3 py-2.5 text-sm leading-snug text-[var(--foreground)] shadow-[0_1px_2px_rgba(15,23,42,0.03)] outline-none transition-[border-color,box-shadow,background-color] duration-200 ease-out placeholder:text-[var(--text-muted)] focus:outline-none dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-inset)] dark:text-[color:var(--insights-text-secondary)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:placeholder:text-[color:var(--insights-text-muted)] sm:min-h-[6rem]";

export const aiInsightsAskActionsRow =
  "flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3";

export const aiInsightsAskSubmitBtn =
  "ai-insights-ask-submit shrink-0 px-5 py-2.5 text-sm font-semibold disabled:shadow-none";

/** AI Answer — executive analysis panel (presentation only). */
export const aiInsightsAnswerCard =
  "ai-insights-answer mt-3 w-full min-w-0 rounded-2xl border border-[color:var(--border-default)]/80 bg-[color:var(--surface-elevated)] p-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)] ring-1 ring-slate-900/[0.03] sm:p-5 lg:px-6 dark:border-[color:var(--insights-border-medium)] dark:bg-gradient-to-b dark:from-[color:var(--insights-layer-card)] dark:via-[color:var(--insights-layer-nested)] dark:to-[color:var(--insights-layer-inset)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:ring-white/[0.04]";

export const aiInsightsAnswerHeader =
  "flex flex-col gap-0.5 border-b border-[color:var(--border-default)]/50 pb-3 dark:border-[color:var(--insights-border-soft)]";

export const aiInsightsAnswerKicker =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-700/80 dark:text-indigo-300";

export const aiInsightsAnswerTitle =
  "text-base font-semibold tracking-tight text-[var(--foreground)] sm:text-[17px]";

export const aiInsightsAnswerLead =
  "text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-[color:var(--insights-answer-label,#b4c4dc)]";

export const aiInsightsAnswerStack =
  "mt-3.5 space-y-3.5 sm:mt-4 sm:space-y-4";

export const aiInsightsAnswerSummaryPanel =
  "ai-insights-answer-summary-panel rounded-xl border border-[color:var(--border-default)]/60 bg-[color:color-mix(in_srgb,var(--surface-subtle)_55%,var(--surface-elevated))] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-inset)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:px-4 sm:py-3.5";

export const aiInsightsAnswerSummary =
  "ai-insights-answer-summary text-[15px] leading-[1.72] text-slate-800 whitespace-pre-line sm:text-base dark:text-[color:var(--insights-answer-body,#d2dce9)]";

export const aiInsightsAnswerDetailsGroup =
  "ai-insights-answer-details space-y-2 rounded-xl border border-[color:var(--border-default)]/50 bg-[color:color-mix(in_srgb,var(--surface-subtle)_40%,var(--surface-elevated))] p-2 shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)] dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-nested)] dark:shadow-none sm:space-y-2.5 sm:p-2.5";

export const aiInsightsAnswerDetailsLabel =
  "px-2 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-[color:var(--insights-answer-label,#b4c4dc)]";

export const aiInsightsAnswerDetail =
  "ai-insights-answer-detail group overflow-hidden rounded-lg border border-[color:var(--border-default)]/55 bg-[color:var(--surface-elevated)] transition-[border-color,box-shadow] duration-200 open:border-[color:color-mix(in_srgb,var(--accent)_18%,var(--border-default))] open:shadow-[0_1px_3px_rgba(15,23,42,0.05)] dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-card)] dark:open:border-[color:var(--insights-border-medium)] dark:open:bg-[color:var(--insights-layer-inset)]";

export const aiInsightsAnswerDetailFindings =
  `${aiInsightsAnswerDetail} ai-insights-answer-detail--findings`;

export const aiInsightsAnswerDetailSummary =
  "ai-insights-answer-detail-summary flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-[13px] font-semibold tracking-tight select-none sm:px-3.5 sm:py-3";

export const aiInsightsAnswerDetailSummaryLabel =
  "flex min-w-0 items-center gap-2";

export const aiInsightsAnswerDetailSummaryBadge =
  "shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]";

/** Section-specific summary emphasis (Key findings, hypotheses, etc.). */
export const aiInsightsAnswerDetailSummaryFindings =
  `${aiInsightsAnswerDetailSummary} text-indigo-950 dark:text-indigo-100 [&_.ai-insights-answer-detail-badge]:border-indigo-200/70 [&_.ai-insights-answer-detail-badge]:bg-indigo-50/90 [&_.ai-insights-answer-detail-badge]:text-indigo-800 dark:[&_.ai-insights-answer-detail-badge]:border-indigo-400/35 dark:[&_.ai-insights-answer-detail-badge]:bg-indigo-500/18 dark:[&_.ai-insights-answer-detail-badge]:text-indigo-100`;

export const aiInsightsAnswerDetailSummaryHypotheses =
  `${aiInsightsAnswerDetailSummary} text-violet-950/95 dark:text-violet-100 [&_.ai-insights-answer-detail-badge]:border-violet-200/70 [&_.ai-insights-answer-detail-badge]:bg-violet-50/90 [&_.ai-insights-answer-detail-badge]:text-violet-800 dark:[&_.ai-insights-answer-detail-badge]:border-violet-400/32 dark:[&_.ai-insights-answer-detail-badge]:bg-violet-500/16 dark:[&_.ai-insights-answer-detail-badge]:text-violet-100`;

export const aiInsightsAnswerDetailSummaryRecommendations =
  `${aiInsightsAnswerDetailSummary} text-emerald-950/95 dark:text-emerald-100 [&_.ai-insights-answer-detail-badge]:border-emerald-200/70 [&_.ai-insights-answer-detail-badge]:bg-emerald-50/90 [&_.ai-insights-answer-detail-badge]:text-emerald-800 dark:[&_.ai-insights-answer-detail-badge]:border-emerald-400/32 dark:[&_.ai-insights-answer-detail-badge]:bg-emerald-500/16 dark:[&_.ai-insights-answer-detail-badge]:text-emerald-100`;

export const aiInsightsAnswerDetailSummaryMethodology =
  `${aiInsightsAnswerDetailSummary} text-slate-700 dark:text-[color:var(--insights-answer-emphasis,#eef2f8)] [&_.ai-insights-answer-detail-badge]:border-[color:var(--border-default)] [&_.ai-insights-answer-detail-badge]:bg-[color:var(--surface-subtle)] [&_.ai-insights-answer-detail-badge]:text-[var(--text-muted)] dark:[&_.ai-insights-answer-detail-badge]:border-[color:var(--insights-border-soft)] dark:[&_.ai-insights-answer-detail-badge]:bg-[color:var(--insights-layer-card)] dark:[&_.ai-insights-answer-detail-badge]:text-[color:var(--insights-answer-label,#b4c4dc)]`;

export const aiInsightsAnswerDetailSummaryMore =
  `${aiInsightsAnswerDetailSummary} text-slate-600 dark:text-[color:var(--insights-answer-emphasis,#eef2f8)] [&_.ai-insights-answer-detail-badge]:border-[color:var(--border-default)] [&_.ai-insights-answer-detail-badge]:bg-[color:var(--surface-subtle)] [&_.ai-insights-answer-detail-badge]:text-[var(--text-muted)] dark:[&_.ai-insights-answer-detail-badge]:border-[color:var(--insights-border-soft)] dark:[&_.ai-insights-answer-detail-badge]:bg-[color:var(--insights-layer-card)] dark:[&_.ai-insights-answer-detail-badge]:text-[color:var(--insights-answer-label,#b4c4dc)]`;

export const aiInsightsAnswerDetailBody =
  "border-t border-[color:var(--border-default)]/40 px-3 pb-3.5 pt-2.5 sm:px-3.5 sm:pb-4 dark:border-[color:var(--insights-border-soft)]";

export const aiInsightsAnswerBodyWrap = "space-y-2.5";

export const aiInsightsAnswerBodyPara =
  "ai-insights-answer-body-para text-[14px] leading-[1.68] text-slate-600 dark:text-[color:var(--insights-answer-body,#d2dce9)]";

export const aiInsightsAnswerBodyEmphasis =
  "ai-insights-answer-body-emphasis font-semibold text-slate-900 dark:text-[color:var(--insights-answer-emphasis,#eef2f8)]";

export const aiInsightsAnswerBodyMetric =
  "ai-insights-answer-body-metric font-semibold tabular-nums text-slate-900 dark:text-[color:var(--insights-answer-metric,#f8fafc)]";

export const aiInsightsAnswerBodyListItem =
  "ai-insights-answer-body-para relative pl-3.5 text-[14px] leading-[1.68] text-slate-600 before:absolute before:left-0 before:top-[0.55em] before:h-1 before:w-1 before:rounded-full before:bg-slate-400 before:content-[''] dark:text-[color:var(--insights-answer-body,#d2dce9)] dark:before:bg-[color:var(--insights-answer-label,#b4c4dc)]";

export const aiInsightsAnswerFindingsList =
  "my-0 list-none space-y-2 border-l-2 border-indigo-300/55 pl-3 dark:border-indigo-400/45";

export const aiInsightsAnswerFindingItem =
  "ai-insights-answer-finding-item relative text-[14px] leading-[1.62] text-slate-700 before:absolute before:-left-3 before:top-[0.62em] before:h-1.5 before:w-1.5 before:-translate-x-1/2 before:rounded-full before:bg-indigo-500 before:content-[''] dark:text-[color:var(--insights-answer-body,#d2dce9)] dark:before:bg-indigo-400";

export const aiInsightsConfidenceShell =
  "ai-insights-confidence mt-4 w-full min-w-0 rounded-xl border px-4 py-3.5 transition-shadow duration-300 sm:px-5 sm:py-4";

export const aiInsightsConfidenceNormal =
  "ai-insights-confidence--normal border-[color:var(--border-default)]/60 bg-[color:color-mix(in_srgb,var(--surface-subtle)_80%,var(--surface-elevated))] dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-nested)]";

export const aiInsightsConfidenceCaution =
  "ai-insights-confidence--caution border-amber-300/60 bg-amber-50/45 dark:border-amber-400/35";

export const aiInsightsConfidenceDisclaimer =
  "ai-insights-confidence__disclaimer mt-2.5 text-[13px] leading-[1.55] text-amber-950/90";

export const aiInsightsExecutiveShell =
  "ai-insights-executive mt-3.5 w-full min-w-0 rounded-2xl border border-[color:var(--border-default)]/60 bg-[color:var(--surface-subtle)] p-4 shadow-[var(--shadow-sm)] sm:p-5 dark:border-[color:var(--insights-border-medium)] dark:bg-[color:var(--insights-layer-card)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

export const aiInsightsExecutiveTitle =
  "ai-insights-executive__title text-[11px] font-bold uppercase tracking-[0.1em] text-slate-600 dark:text-[#c8d4e8]";

export const aiInsightsExecutiveDesc =
  "mt-1 text-[13px] leading-snug text-slate-600/90 dark:text-[#a8b8d0]";

export const aiInsightsExecutiveBrief =
  "ai-insights-executive__brief mb-3.5 rounded-xl border border-[color:var(--border-default)]/50 bg-[color:var(--surface-elevated)] px-4 py-3 text-[14px] leading-[1.6] text-[var(--text-muted)] dark:border-[color:var(--insights-border-medium)] dark:bg-[color:var(--insights-layer-inset)] dark:text-[color:var(--insights-text-secondary)]";

export const aiInsightsExecutiveGrid =
  "grid grid-cols-2 items-stretch gap-3 sm:gap-3.5 lg:grid-cols-4";

export const aiInsightsExecutiveBriefLabel =
  "font-semibold text-[var(--foreground)]";

/** Suggested Questions column (AI Insights left panel). */
export const aiInsightsSuggestedHeading =
  "text-lg font-semibold tracking-tight text-[var(--foreground)]";

export const aiInsightsSuggestedDesc =
  "mt-1 text-sm leading-relaxed text-[var(--text-muted)] dark:text-[color:var(--insights-text-muted)]";

export const aiInsightsSuggestedList =
  "mt-3 flex flex-col gap-2.5";

/** Unified suggested-question card — same idle surface for every item; hover only on hover. */
export const aiInsightsSuggestedQ =
  "ai-insights-suggested-q w-full rounded-xl border border-[color:var(--border-default)]/55 bg-[color:var(--surface-elevated)] px-3.5 py-3 text-left text-[13px] font-medium leading-[1.45] tracking-tight text-[var(--foreground)] shadow-[0_1px_2px_rgba(15,23,42,0.035)] transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:border-[color:color-mix(in_srgb,var(--accent)_26%,var(--border-default))] hover:bg-[color:color-mix(in_srgb,var(--accent-wash)_42%,var(--surface-elevated))] hover:shadow-[0_4px_14px_-8px_color-mix(in_srgb,var(--accent)_30%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-subtle)] active:scale-[0.99] sm:px-4 sm:py-3.5 sm:text-sm dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-inset)] dark:text-[color:var(--insights-text-secondary)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] dark:hover:border-[color:var(--insights-border-medium)] dark:hover:bg-[color:var(--insights-layer-nested)] dark:hover:shadow-[0_6px_16px_-10px_rgba(0,0,0,0.32)] dark:focus-visible:ring-offset-[color:var(--insights-layer-panel)]";

/** @deprecated Use aiInsightsSuggestedQ — kept for import stability. */
export const aiInsightsSuggestedQPrimary = aiInsightsSuggestedQ;

/** @deprecated Use aiInsightsSuggestedQ — kept for import stability. */
export const aiInsightsSuggestedQSecondary = aiInsightsSuggestedQ;

export const aiInsightsSuggestedRecentSection =
  "mt-5 border-t border-[color:var(--border-default)]/45 pt-5 dark:border-[color:var(--insights-border-soft)]";

export const aiInsightsSuggestedRecentTitle =
  "text-sm font-semibold text-[var(--foreground)]";

export const aiInsightsSuggestedRecentDesc =
  "mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)] dark:text-[color:var(--insights-text-muted)]";

export const aiInsightsSuggestedRecentList = "mt-2.5 flex flex-col gap-2.5";

export const aiInsightsSuggestedRecentItem =
  "ai-insights-suggested-recent w-full rounded-xl border border-[color:var(--border-default)]/55 bg-[color:var(--surface-elevated)] px-3 py-2.5 text-left text-xs leading-snug text-[var(--text-muted)] shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow,color] duration-200 hover:border-[color:color-mix(in_srgb,var(--accent)_20%,var(--border-default))] hover:bg-[color:color-mix(in_srgb,var(--accent-wash)_35%,var(--surface-elevated))] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/30 focus-visible:ring-offset-1 dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-inset)] dark:text-[color:var(--insights-text-muted)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] dark:hover:border-[color:var(--insights-border-medium)] dark:hover:bg-[color:var(--insights-layer-nested)] dark:hover:text-[color:var(--insights-text-secondary)]";

/** Suggested follow-ups (after AI answer). */
export const aiInsightsFollowupSection =
  "ai-insights-followup mt-3 w-full min-w-0 rounded-xl border border-[color:var(--border-default)]/45 bg-[color:color-mix(in_srgb,var(--surface-subtle)_65%,var(--surface-elevated))] p-3.5 sm:p-4 dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-card)]";

export const aiInsightsFollowupTitle =
  "mb-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)] dark:text-[color:var(--insights-text-muted)]";

export const aiInsightsFollowupList =
  "flex flex-wrap items-stretch gap-2 sm:gap-2.5";

export const aiInsightsFollowupChip =
  "ai-insights-followup-chip inline-flex max-w-full min-h-[2rem] items-center rounded-full border border-[color:var(--border-default)]/55 bg-[color:var(--surface-elevated)] px-3 py-1.5 text-left text-[12px] font-medium leading-snug text-[var(--foreground)]/88 shadow-[0_1px_1px_rgba(15,23,42,0.03)] transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-out hover:-translate-y-px hover:border-[color:color-mix(in_srgb,var(--accent)_28%,var(--border-default))] hover:bg-[color:color-mix(in_srgb,var(--accent-wash)_48%,var(--surface-elevated))] hover:text-[var(--foreground)] hover:shadow-[0_4px_12px_-6px_color-mix(in_srgb,var(--accent)_22%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/32 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-elevated)] active:translate-y-0 disabled:pointer-events-none disabled:opacity-45 sm:max-w-[min(100%,20rem)] sm:px-3.5 sm:py-2 sm:text-[13px] dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-inset)] dark:text-[color:var(--insights-text-secondary)] dark:hover:border-indigo-400/32 dark:hover:bg-indigo-500/10 dark:hover:text-[var(--foreground)] dark:focus-visible:ring-offset-[color:var(--insights-layer-card)]";

export const aiInsightsProvenanceShell =
  "ai-insights-provenance mt-3 w-full min-w-0 overflow-hidden rounded-xl border border-[color:var(--border-default)]/60 bg-[color:color-mix(in_srgb,var(--surface-subtle)_75%,var(--surface-elevated))] dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-card)]";

export const aiInsightsProvenanceToggle =
  "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[color:color-mix(in_srgb,var(--surface-subtle)_80%,transparent)] sm:px-5 sm:py-3.5 dark:hover:bg-white/[0.03]";

export const aiInsightsProvenanceToggleTitle =
  "text-[14px] font-semibold tracking-tight text-[var(--foreground)] dark:text-[color:var(--insights-text-secondary)]";

export const aiInsightsProvenanceBody =
  "border-t border-[color:var(--border-default)]/40 px-4 py-4 sm:px-5 sm:py-5 dark:border-[color:var(--insights-border-soft)] dark:bg-[color:var(--insights-layer-inset)]/90";

export const aiInsightsProvenanceDivider =
  "mb-4 border-b border-[color:var(--border-default)]/40 pb-4 last:mb-0 last:border-b-0 last:pb-0 dark:border-[color:var(--insights-border-soft)]";

export const aiInsightsProvenanceSectionLabel =
  "mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)] dark:text-[color:var(--insights-text-muted)]";

export const aiInsightsProvenanceSectionBody =
  "text-[14px] leading-[1.65] text-[var(--text-muted)] whitespace-pre-line dark:text-[color:var(--insights-text-secondary)]";

export const aiInsightsProvenanceSectionBodyEmphasis =
  "text-[14px] leading-[1.65] font-medium text-[var(--foreground)]/90 whitespace-pre-line dark:text-[color:var(--insights-text-secondary)]";

export const aiInsightsProvenanceMetaLabel =
  "text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-subtle)] dark:text-[color:var(--insights-text-muted)]";

export const aiInsightsProvenanceMetaValue =
  "font-semibold text-[var(--foreground)] dark:text-[color:var(--insights-text-secondary)]";

/** Visualization card — AI Insights tab only. */
export const aiInsightsVizCard =
  "ai-insights-viz group/chart mt-3 w-full min-w-0 overflow-hidden rounded-[1.35rem] border border-[color:var(--border-default)]/75 bg-gradient-to-b from-[color:var(--surface-elevated)] via-[color:var(--surface-elevated)] to-[color:color-mix(in_srgb,var(--accent-wash)_55%,var(--surface-elevated))] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_20px_48px_-28px_rgba(15,23,42,0.1)] ring-1 ring-slate-900/[0.025] transition-[box-shadow,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[color:color-mix(in_srgb,var(--accent)_18%,var(--border-default))] hover:shadow-[0_24px_56px_-26px_rgba(15,23,42,0.14)] sm:p-5 lg:px-6 lg:pb-6 dark:border-[color:var(--insights-border-medium)] dark:from-[#1a2744] dark:via-[#1e2f4f] dark:to-[#1a2540] dark:ring-white/[0.06] dark:shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_20px_48px_-28px_rgba(0,0,0,0.4)] dark:hover:border-[color:var(--insights-border-medium)] dark:hover:shadow-[0_24px_56px_-26px_rgba(0,0,0,0.45)]";

export const aiInsightsVizKicker =
  "text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-subtle)] dark:text-[color:var(--insights-text-muted)]";

export const aiInsightsVizHeaderZone =
  "w-full min-w-0 space-y-2.5 sm:space-y-3";

export const aiInsightsVizChipsWrap =
  "w-full min-w-0 px-0.5 sm:px-1";

export const aiInsightsVizChartStage =
  "relative mt-3 w-full min-w-0 sm:mt-4 lg:mt-5";

export const aiInsightsVizPlotSurface =
  "ai-insights-viz-plot animate-chart-surface-in motion-reduce:animate-none w-full min-w-0 overflow-visible rounded-[0.9rem] border border-[color:var(--border-default)]/40 bg-gradient-to-b from-slate-50/50 via-[color:var(--surface-elevated)]/20 to-transparent px-2 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-[box-shadow,border-color,background] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/chart:border-[color:color-mix(in_srgb,var(--accent)_14%,var(--border-default))] group-hover/chart:from-slate-50/65 dark:border-[color:var(--insights-border-medium)] dark:from-[#243552]/90 dark:via-[#1e2f4d]/75 dark:to-[#1a2744]/65 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] dark:group-hover/chart:from-[#2a3d5c]/95 dark:group-hover/chart:via-[#243552]/85";

export const aiInsightsVizHeadingWrap =
  "text-center px-3 sm:px-4";

export const aiInsightsVizTitle =
  "text-[1.35rem] font-semibold leading-[1.2] tracking-[-0.02em] text-[var(--foreground)] sm:text-[1.65rem] lg:text-[1.75rem]";

export const aiInsightsVizSubtitle =
  "mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)] sm:text-[15px] lg:max-w-3xl";

export const aiInsightsSmartPanelDivider =
  "mt-6 border-t border-[color:var(--border-default)]/60 bg-gradient-to-b from-transparent to-[color:color-mix(in_srgb,var(--accent-wash)_30%,transparent)] pt-6 sm:mt-7 sm:pt-7 lg:mt-8 lg:pt-8 dark:border-[color:var(--insights-border-soft)] dark:to-[color:var(--insights-wash-accent)]";

export const aiInsightsMutedLabel =
  "ai-insights-muted-label text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)] dark:text-[color:var(--insights-text-muted)]";

export const aiInsightsBodyText =
  "ai-insights-body-text text-[14px] leading-[1.6] text-[var(--text-muted)] dark:text-[color:var(--insights-text-secondary)]";

export const aiInsightsStrongText =
  "font-semibold text-slate-900 dark:text-[var(--foreground)]";

export const aiInsightsSubtleText =
  "text-xs text-slate-500 dark:text-[color:var(--insights-text-muted)]";

export const aiInsightsSidePanel = "ai-insights-side-panel";

export const aiInsightsSection = "ai-insights-section";

export const aiInsightsSectionAnswer =
  "ai-insights-section ai-insights-section--answer";

export const aiInsightsSectionViz =
  "ai-insights-section ai-insights-section--viz";

export const aiInsightsSectionConfidence =
  "ai-insights-section ai-insights-section--confidence";

export const aiInsightsSectionConfidenceCaution =
  "ai-insights-section ai-insights-section--confidence ai-insights-section--confidence-caution";

export const aiInsightsSectionFollowup =
  "ai-insights-section ai-insights-section--followup";

export const aiInsightsSectionExecutive = "ai-insights-executive";

export const aiInsightsExecutiveCard =
  "ai-insights-executive__card relative flex h-full min-h-[5.5rem] flex-col overflow-hidden rounded-xl border border-[color:var(--border-default)]/50 bg-[color:var(--surface-elevated)] px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-[color:var(--insights-border-medium)] dark:bg-[color:color-mix(in_srgb,var(--insights-layer-inset)_90%,#243552)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]";

export const aiInsightsExecutiveCardBody =
  "ai-insights-executive__body flex min-h-[4.5rem] min-w-0 flex-1 flex-col justify-between pl-2";

export const aiInsightsExecutiveCardHeader =
  "flex min-h-[1.125rem] items-center gap-1.5";

export const aiInsightsExecutiveCardLabel =
  "ai-insights-executive__label text-[10px] font-semibold uppercase tracking-[0.1em] leading-tight text-[var(--text-subtle)] dark:text-[#b4c4dc]";

export const aiInsightsExecutiveCardValue =
  "mt-1.5 min-h-[1.375rem] text-[15px] font-bold leading-snug text-[var(--foreground)] break-words dark:text-[color:var(--insights-text-secondary)]";

export const aiInsightsExecutiveCardHint =
  "ai-insights-executive__hint mt-1 min-h-[1.25rem] text-[11px] leading-snug text-[var(--text-muted)] dark:text-[#9eb0cc]";

export const aiInsightsExecutiveCardHintSpacer =
  "mt-1 block min-h-[1.25rem]";

export const aiInsightsSectionTitle = "ai-insights-section__title";

export const aiInsightsSectionKicker = "ai-insights-section__kicker";

export const aiInsightsSectionDesc = "ai-insights-section__desc";

export const aiInsightsBtnExport = "ai-insights-btn-export";

export const aiInsightsChartPlot = "ai-insights-chart-plot";
