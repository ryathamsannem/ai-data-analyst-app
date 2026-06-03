# UI Baseline Rules

**Canonical product rules** for Cursor agents and contributors. Complements [`AGENTS.md`](AGENTS.md) with snapshot-specific standards (May 2026).

**Recovery snapshot:** All items below reflect the **current stable UI** before Export/PDF finalization.

**Architecture index:** [`PROJECT_ARCHITECTURE_SUMMARY.md`](PROJECT_ARCHITECTURE_SUMMARY.md) · [`LATEST_STABLE_UI_SNAPSHOT.md`](LATEST_STABLE_UI_SNAPSHOT.md)

---

## 1. Default stance

- **Extend in place** — fix the narrowest owning file; no wholesale redesigns of working regions.
- **Incremental changes only** unless the user explicitly requests a redesign.
- **Preserve** layout hierarchy, responsive breakpoints, chart semantics, and cross-tab consistency.
- If a change is cosmetic and unrequested, **skip it**.

---

## 2. Design language

| Principle | Rule |
|-----------|------|
| Tone | Premium enterprise analytics SaaS — clarity over novelty |
| Surfaces | `rounded-2xl` cards, `rounded-xl` controls, subtle shadows |
| Accent | Indigo/violet accent wash; emerald for success / dataset ready |
| Typography | `text-sm` body; `10–11px` uppercase kickers; `tabular-nums` on metrics |
| Glass | No heavy glassmorphism — restrained `backdrop-blur` only where already used (e.g. Charts sticky header) |
| Motion | `duration-200`–`300`; respect `prefers-reduced-motion` |

---

## 3. Spacing rules

| Context | Standard |
|---------|----------|
| Major cards | `p-4 sm:p-5` or `p-5 sm:p-6` |
| Section stacks | `space-y-3`–`space-y-4`, `gap-3`–`gap-6` on grids |
| Filter grid | `gap-x-3 gap-y-3` |
| Charts plot | **Tight** top rhythm — no large `pt-*` on plot stage; CSS `margin-top: 0.125rem` max |
| Insights viz | Shell follows `--insights-viz-plot-h`; avoid dead `min-h` stacking |
| Flex children | `min-w-0` on truncating columns; `shrink-0` on badges and metadata suffixes |

---

## 4. Dark / light mode

| Rule | Detail |
|------|--------|
| Mechanism | `class="dark"` on `<html>` via `frontend/lib/theme.ts` |
| Tokens | Prefer CSS variables (`--card`, `--surface-elevated`, `--text-muted`) |
| Insights scope | `.ai-insights-page` — `--insights-layer-*`, `--insights-answer-*` |
| Charts plots | Shared `chart-viz-theme` — same axis tokens as Insights |
| Text contrast | No opacity stacking on informational chips or answer body |
| Data labels | Use tab token modules (`ovMuted`, `aiInsights*`) — not raw hex except scoped palette |

---

## 5. Buttons

| Token / class | Use |
|---------------|-----|
| `saas-btn-premium` | Secondary actions (Review mapping, Choose file) |
| `saas-btn-accent` | Primary upload / submit |
| `ovBtnSecondary` | Replace file (Overview) |
| `aiInsightsAskSubmitBtn` | Ask AI submit (hover lift in CSS) |

Do not introduce one-off gradient CTAs on stable surfaces.

---

## 6. Filters (standard)

| Rule | Detail |
|------|--------|
| Component | `FilterPanel` only |
| Tabs | **Overview** and **AI Insights** when data loaded |
| Appearance | `appearance="dashboard"` |
| Height | **52px** unified control row |
| Date range | **Single** grouped control — start · end in one bordered bar |
| Tokens | `ovCard` shell, `ovFilterControl` |

**Not on:** Data Preview, Charts, Export.

---

## 7. Dataset metadata cards

| Tab | Rule |
|-----|------|
| **Overview** | Full `ovCard`: Dataset ready, File/Rows/Columns/Sheet, **Replace file** |
| **Data Preview** | `DataPreviewDatasetContext` — same grid, extension truncation, `· size`, no Replace |
| **AI Insights** | **No** inline dataset card — status in app header only |
| **Charts** | **No** top dataset card |
| **Export** | Report Preview Summary (rows/columns) — no duplicate filename card |

**Replace file** always routes through `openOverviewReplaceUpload()` → Overview upload UI.

---

## 8. Chart rendering rules

| Rule | Detail |
|------|--------|
| Shared path | `ChartRenderer` + `computeFinalChartPresentation` for Charts, Insights, PNG/PDF |
| Overview path | Separate `computeOverviewDashboardChartPresentation` — 360px mini charts |
| Horizontal bars | **Always horizontal** — never force vertical |
| Centering | `ChartInsightViewportWrapper` + symmetric `insightCartesianOuterMargins` (Insights) |
| Kinds | Same semantics across Overview (mini), Insights, Charts, PDF |
| Heights | Charts: `resolveChartsTabPreviewPlotHeight` (cap 42vh / 440px); Insights: kind-specific floors |

See [`AI_VISUALIZATION_BEHAVIOR.md`](AI_VISUALIZATION_BEHAVIOR.md).

---

## 9. Charts tab rules

| Rule | Detail |
|------|--------|
| Layout | Timeline ~23% + preview `1fr` at `lg+` |
| Stack order | Title → chips → intel strip → Why this chart → plot → smart read |
| Timeline | Scroll on inner body only; preserve scroll on select |
| Metadata | `ChartContextSummary` with `compactChips` |
| Smart read | No Insights question gate on Charts tab |
| Regressions | No large plot top padding; no large-viewport-only height boost |

Full detail: [`CHARTS_STABLE_SUMMARY.md`](CHARTS_STABLE_SUMMARY.md).

---

## 10. AI Insights rules

| Rule | Detail |
|------|--------|
| Grid | `268px` suggestions + `1fr` Ask column at `lg+` |
| Gates | `insightChartMatchesCurrentQuestion` + `chartSnapshotMatchesQuestionIntent` before viz / export / AI Read |
| Export button | `showInsightExportButton` only when answer + aligned viz ready |
| Reset | Disabled until `hasActiveAiConversation` |
| Suggested Q | Click **prefills** only — no auto-send |
| Histogram chip | Column name (e.g. Salary), not misleading “Average …” |

Full detail: [`AI_INSIGHTS_STABLE_SUMMARY.md`](AI_INSIGHTS_STABLE_SUMMARY.md).

---

## 11. Data Preview rules

| Rule | Detail |
|------|--------|
| Filename | Stem truncates; extension `shrink-0` always visible |
| File size | Separate flex item: `· 3.9 KB` — never touches extension |
| Card width | Do not resize card shell — tune `dpDatasetContextFileCell` only |
| Search | `useDeferredValue` on query |

Full detail: [`DATA_PREVIEW_STABLE_SUMMARY.md`](DATA_PREVIEW_STABLE_SUMMARY.md).

---

## 12. Performance

- Keep `React.memo`, `useMemo`, `useCallback`, `useTransition` on hot paths.
- Avoid new inline object/array props on memoized children.
- Keep PDF/html2canvas path lazy unless measured need to change (today: static import — known debt).

---

## 13. Export / PDF — pending phase

| Status | Rule |
|--------|------|
| **Not finalized** | Export tab and `pdf-report.ts` are functional but **not** production-frozen |
| Allowed now | Bug fixes that do not reshape stable tabs |
| Next phase | WYSIWYG capture parity, dark PDF charts, Export UI polish, code-split |
| Until then | Do not regress Insights/Charts capture refs or validation gates |

---

## 14. Reusable shared components (do not fork)

| Component | Path |
|-----------|------|
| `FilterPanel` | `frontend/app/components/home/filter-panel.tsx` |
| `ChartRenderer` | `frontend/app/components/home/chart-renderer.tsx` |
| `ChartInsightViewportWrapper` | `frontend/app/components/home/chart-insight-viewport-wrapper.tsx` |
| `AiInsightChartShell` | `frontend/app/components/ai-insight-chart-shell.tsx` |
| `ChartContextSummary` | `page.tsx` (~672) |
| `DataPreviewDatasetContext` | `frontend/app/components/home/data-preview-dataset-context.tsx` |
| `ChartsTimelineAside` | `frontend/app/components/home/charts-timeline-aside.tsx` |
| `SmartChartInsightPanel` | `frontend/app/components/SmartChartInsightPanel.tsx` |

---

## 15. Token modules (single source per tab)

| Tab / area | Module |
|------------|--------|
| Global + components | `frontend/app/globals.css` |
| Overview | `frontend/lib/overview-ui.ts` |
| AI Insights | `frontend/lib/ai-insights-ui.ts` |
| Charts | `frontend/lib/charts-tab-ui.ts` |
| Data Preview | `frontend/lib/data-preview-ui.ts` |
| Buttons | `frontend/lib/ui-buttons.ts` |
| Theme | `frontend/lib/theme.ts` |

---

## 16. What must NOT change without explicit request

1. Chart kind logic and horizontal bar semantics  
2. Insight question–chart alignment gates  
3. Charts tab timeline + preview layout  
4. Dataset metadata deduplication per tab  
5. Filter 52px dashboard appearance  
6. Data Preview filename truncation + size separation  
7. Overview full dataset card + Replace file UX  

---

*Last updated: May 2026 — UI baseline before Export/PDF phase.*
