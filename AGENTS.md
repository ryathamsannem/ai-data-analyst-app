# Agent baseline — AI Data Analyst App

Follow these rules in all future changes unless the user explicitly overrides them.

**Stable baseline docs (May 2026):** [`PROJECT_ARCHITECTURE_SUMMARY.md`](PROJECT_ARCHITECTURE_SUMMARY.md) · [`LATEST_STABLE_UI_SNAPSHOT.md`](LATEST_STABLE_UI_SNAPSHOT.md) · [`UI_BASELINE_RULES.md`](UI_BASELINE_RULES.md) · [`CHARTS_STABLE_SUMMARY.md`](CHARTS_STABLE_SUMMARY.md) · [`DATA_PREVIEW_STABLE_SUMMARY.md`](DATA_PREVIEW_STABLE_SUMMARY.md) · [`AI_INSIGHTS_STABLE_SUMMARY.md`](AI_INSIGHTS_STABLE_SUMMARY.md) · [`UI_ARCHITECTURE_SNAPSHOT.md`](UI_ARCHITECTURE_SNAPSHOT.md) · [`AI_VISUALIZATION_BEHAVIOR.md`](AI_VISUALIZATION_BEHAVIOR.md)

Treat these as the **production snapshot** before **Export/PDF** finalization. Future changes should be **incremental** — fix the narrowest layer; do not broad-redesign working regions.

## 1. UI direction

- Keep the current **modern SaaS dashboard** look: spacing, typography, cards, and chrome.
- **Do not redesign** working layouts (Overview, AI Insights, main Charts area, Timeline, filter bar, PDF narrative blocks) unless the user asks for a redesign.
- Preserve **consistent** spacing, chart shells (`AiInsightChartShell`, shared viewport wrappers), and **filter alignment** established in the codebase.
- Treat the current structure as the **product baseline**; extend or fix in place rather than replacing whole regions.
- **Preserve visual hierarchy:** page title → section kickers → card titles → chart titles → metadata chips (secondary) → plot. Do not flatten or reorder established stacks.
- **Preserve responsive behavior:** Insights fixed plan widths (760/850/900px) + viewport height caps; Charts session viewport ≤860px; Overview mini charts at 360px. Do not replace with unmeasured fluid layouts without explicit approval.
- **Preserve chart layout:** `AiInsightChartShell` → `ChartInsightViewportWrapper` → plot; symmetric `insightCartesianOuterMargins` for Insights; centered PDF capture at 860px.

## 2. Charts

- **Do not change chart-type logic** or semantics: same kinds across Overview, AI Insights, Charts, and PDF.
- **Horizontal bar** charts stay horizontal; do not force vertical layouts on them.
- Reuse **shared** layout helpers (`ChartInsightViewportWrapper`, `chart-renderer` / `chart-layout-config`, etc.) for centering and margins.
- Keep charts **centered**, **responsive**, and readable: avoid axis overlap and label crowding (tune margins/padding, not arbitrary one-off hacks per page).
- **AI Insights ↔ chart sync:** keep `insightChartMatchesCurrentQuestion` and `chartSnapshotMatchesQuestionIntent` gates before viz, AI Read, and export. Outlier questions must not show department-average bar charts unless the question explicitly groups by dimension.
- **Histogram metadata:** measure chip shows the distributed numeric column (e.g. Salary), not a stale “Average …” label from aligned analysis unless the chart truly aggregates mean.
- **Metadata chips (dark):** use `--insights-answer-label` / `--insights-answer-body` tokens; chips must read as informational, not disabled (no opacity stacking on chip text).

## 3. Filters

- Keep filters **visually aligned** with the unified SaaS control height and grid behavior.
- **Date range** stays a **single grouped control** (one bordered bar, start/end fields, divider only—no redundant copy unless product asks).

## 4. Performance

- Keep **`React.memo`**, **`useMemo`**, **`useCallback`**, and **`useTransition`** where they already guard expensive trees or navigation.
- Avoid introducing **avoidable rerenders** (stable props, memoized children, no new inline object/array props on hot paths).
- Keep **heavy optional paths lazy-loaded** (e.g. PDF/html2canvas-style imports) unless there is a measured need to change that.

## 5. PDF export

- PDF charts and framing should **match the on-screen** insight styling: **centered** chart images, consistent margins, executive-report tone.
- Reuse the same capture/layout path as the UI where possible; do not regress alignment for convenience.

## 6. Engineering

- Prefer **small, scoped fixes** over broad rewrites.
- **Do not refactor** stable, working UI “for cleanliness” without explicit user approval.
- **Reuse** shared components and layout utilities instead of duplicating filter/chart/PDF structure.

## 7. UX philosophy

- Aim for a **premium analytics SaaS** experience: clarity, responsiveness, consistency, and trustworthy insights over novelty.

## 8. AI Insights & Charts tab (stable behaviors)

- **Export (Insights):** show only when `showInsightExportButton` (valid answer + aligned viz). Debug export details only when `NEXT_PUBLIC_AI_INSIGHTS_DEBUG=true`.
- **Reset conversation:** disabled until `hasActiveAiConversation`; clears AI session charts, not dataset/filters/auto-dashboard history.
- **Suggested Questions:** scrollable left panel; click **prefills** question only (no auto-send).
- **AI Read on this chart:** `SmartChartInsightPanel` — gated on question match in Insights; always on when intel active on Charts tab.
- **Charts tab:** timeline + preview layout, shared `ChartRenderer` with `insightMode=false`; see [`CHARTS_STABLE_SUMMARY.md`](CHARTS_STABLE_SUMMARY.md).
- **Dataset metadata:** full card on Overview only; compact strip on Data Preview; header badge elsewhere — see [`UI_BASELINE_RULES.md`](UI_BASELINE_RULES.md) §7.
- **Export/PDF:** not finalized — next phase; do not regress capture refs or insight gates.

---

**Default stance:** if a change is cosmetic or architectural and not requested, skip it. If something is broken, fix the **narrowest** layer that owns the behavior. Read the baseline docs above before refactoring Insights, Charts, or shared chart presentation.
