# AI Insights — Status

Snapshot: June 27, 2026 · Branch `DEV`.

Summary of completed AI Insights improvements. These are **stable** and were **not** changed by Overview
Pass 5A.x (per the 5A constraint: no AI Insights routing changes).

---

## Completed improvements

### Structured reasoning blocks
- AI answers render as structured `reasoningBlocks` (typed segments) rather than a single text blob.
- Source: `frontend/lib/reasoning-blocks.ts` (+ `reasoning-blocks.test.ts`).

### "Why this matters" cards
- Each insight surfaces a "why this matters" explanation card alongside the answer/chart, framing the
  business significance of the result.
- Rendered in the AI Insights panel in `frontend/app/page.tsx`.

### Narrative QA validation
- Generated narratives pass tone/quality gates (no repetitive KPI restatement, executive tone) before
  display/export.
- Source: `frontend/lib/overview-ai-summary.ts`, narrative-tone / narrative-polish helpers
  (`insight-narrative-tone.test.ts`, `narrative-polish.test.ts`); latest commit `f648151`
  ("AI Summary repetitive kpi fix").

### "Why" follow-up reasoning
- Follow-up question chips are generated with reasoning continuity from the last question/answer, with
  semantic de-duplication to avoid repeats.
- Source: `frontend/lib/ai-follow-up-suggestions.ts`, `ai-follow-up-semantic-dedupe.test.ts`,
  `suggested-follow-up-continuation.test.ts`, `ai-conversation-context.ts`.

### Recommended next actions
- Insights produce recommended next actions tied to the result.
- Source: `frontend/lib/recommended-actions.ts` (+ `recommended-actions.test.ts`).

### Recent insights result restore
- Prior insight results can be restored from session history (re-open a previous answer + chart snapshot).
- Source: `frontend/lib/insight-result-history.ts` (+ `insight-result-history.test.ts`).

### Alignment gates (preserved)
- `insightChartMatchesCurrentQuestion` and `chartSnapshotMatchesQuestionIntent` still gate visualization,
  AI Read, and export. Outlier questions do not show department-average bar charts unless the question
  groups by a dimension.
- Source: `frontend/lib/insight-chart-alignment.ts`.

---

## Known current status

- AI Insights is **functionally stable**; no open P0 in this area.
- Export (Insights) shows only when `showInsightExportButton` (valid answer + aligned viz); debug details
  gated behind `NEXT_PUBLIC_AI_INSIGHTS_DEBUG=true`.
- Reset conversation disabled until `hasActiveAiConversation`; clears AI session charts only.
- Suggested Questions: scrollable left panel; click **prefills** the question (no auto-send).
- Bar value-axis formatting from Overview Pass 5A.3 (`formatOverviewBarValueAxisTick`) now also applies to
  the shared `ChartRenderer` used by AI Insights charts (currency `K`/`M`, percent points) — visual-only.
- No regressions: all AI-Insights-related vitest suites pass (part of 668/668).
