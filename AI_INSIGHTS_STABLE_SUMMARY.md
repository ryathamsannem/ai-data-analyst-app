# AI Insights — Stable Baseline Summary

**Production snapshot** of the AI Insights tab as implemented in the repo (May 2026). Documents **current behavior only** — not a redesign spec.

**Related:** [`AGENTS.md`](AGENTS.md) · [`UI_BASELINE_RULES.md`](UI_BASELINE_RULES.md) · [`PROJECT_ARCHITECTURE_SUMMARY.md`](PROJECT_ARCHITECTURE_SUMMARY.md) · [`CHARTS_STABLE_SUMMARY.md`](CHARTS_STABLE_SUMMARY.md) · [`AI_VISUALIZATION_BEHAVIOR.md`](AI_VISUALIZATION_BEHAVIOR.md) · [`LATEST_STABLE_UI_SNAPSHOT.md`](LATEST_STABLE_UI_SNAPSHOT.md) · [`AI_INSIGHTS_LATEST_STATE.md`](AI_INSIGHTS_LATEST_STATE.md)

**Recovery use:** Pre–Export/PDF enhancement baseline. Export tab polish is **pending**.

---

## 1. Tab entry and layout

| Item | Value |
|------|--------|
| Tab id | `insights` (`MainNavTabId`) |
| Routing | None — `activeTab` in `frontend/app/page.tsx` |
| Root classes | `ai-insights-page` + `aiInsightsOuterShell` |
| Tokens module | **`frontend/lib/ai-insights-ui.ts`** — **wired** (~70 imports in `page.tsx`) |
| Dark layers | `frontend/app/globals.css` under `.dark .ai-insights-page` |

### Desktop grid (current)

```
aiInsightsOuterShell
└─ aiInsightsGrid
   lg:grid-cols-[minmax(0,min(100%,268px))_minmax(0,1fr)]
   ├─ Left: Suggested Questions + Recent (scrollable)
   └─ Right: Ask AI column (full stack)
```

**Not** the older `3fr / 7fr` split documented in earlier drafts.

### Filters (no inline dataset card)

When `columns.length > 0`, **above** the Insights shell (shared with Overview):

- `FilterPanel` with **`appearance="dashboard"`** (`ovCard` / `ovFilterControl` tokens)

**Dataset metadata:** **No** duplicate dataset-ready card on this tab. Loaded status appears in the **app header** (“Dataset loaded” badge). Full file metadata + **Replace file** live on **Overview** only; compact strip on **Data Preview** (`DataPreviewDatasetContext`). See [`UI_BASELINE_RULES.md`](UI_BASELINE_RULES.md) §7.

---

## 2. Right column — render order and gates

| # | Block | Gate |
|---|--------|------|
| 1 | Ask AI header + **Reset conversation** | Always visible; Reset **disabled** when `!hasActiveAiConversation` |
| 2 | Follow-up meta pills (emerald/violet) | `lastConversationMeta?.followUpDetected` |
| 3 | Question textarea + **Ask AI** submit | Always |
| 4 | Alignment repaired warning | `alignedAnalysis?.alignmentRepaired` |
| 5 | Partial viz caution | `insightVisualization?.partialVisualizationWarning` |
| 6 | “Chart selected…” prompt | Pinned snapshot without valid answer |
| 7 | **AiExecutiveInsightsPanel** | `hasValidAIAnswer` + renderable viz + executive cards |
| 8 | **Insight confidence** | `hasValidAIAnswer` + `alignedAnalysis` |
| 9 | **AI Answer** (`AiInsightAnswerBody`) | Answer / loading / trimmed text |
| 10 | **Suggested follow-ups** | `hasValidAIAnswer` + chip list |
| 11 | **How this insight was generated** (`<details>`) | Provenance / routing |
| 12 | **Visualization** card | `insightHasRenderableVisualization` |
| 13 | No-viz placeholder | Valid answer, viz gate failed |
| 14 | **Export this insight (PDF)** | `showInsightExportButton` |
| 15 | Export debug `<details>` | `NEXT_PUBLIC_AI_INSIGHTS_DEBUG === "true"` only |

---

## 3. Visualization rendering system

### Gate stack

Visualization renders only when **`insightHasRenderableVisualization`** is true:

1. `insightSnapshot` exists with chart rows
2. **`insightChartMatchesCurrentQuestion`** — question text, turnId, follow-up analysis, or auto-dashboard title match
3. **`insightChartMatchesQuestionIntent`** — `chartSnapshotMatchesQuestionIntent()` from `frontend/lib/chart-question-intent.ts` (blocks misleading department-average charts for outlier questions)
4. Valid kind; non-placeholder title; source `ai` or `auto_dashboard`

### DOM stack (top → bottom)

```
aiInsightsVizCard
├─ Kicker: "Visualization"
├─ insightChartHeadingBlock (title / subtitle)
├─ ChartContextSummary (compactChips)
├─ aiInsightsVizChartStage
│  ├─ AiInsightChartShell (max-w-[960px], --insights-viz-plot-h)
│  │  └─ ChartInsightViewportWrapper (grid center, max-w by kind)
│  │     └─ aiInsightsVizPlotSurface
│  │        └─ renderDatasetChart(height, compact=false, insightMode=true)
│  └─ SmartChartInsightPanel? (gated)
└─ Export button (below card when enabled)
```

### Key components and files

| File | Role |
|------|------|
| `frontend/app/page.tsx` | `renderDatasetChart`, presentation memos, gates, `ChartContextSummary` |
| `frontend/app/components/ai-insight-chart-shell.tsx` | Insight-only frame; plot height CSS var |
| `frontend/app/components/home/chart-insight-viewport-wrapper.tsx` | Horizontal/vertical centering; kind-based max-width |
| `frontend/app/components/home/chart-renderer.tsx` | Recharts; `insightMode` branch |
| `frontend/lib/chart-layout-config.ts` | `getInsightLayoutMetrics`, `insightCartesianOuterMargins`, viewport max classes |
| `frontend/lib/chart-axis-layout.ts` | Category axis plans (`insightMode: true`) |
| `frontend/lib/final-chart-presentation.ts` | `computeFinalChartPresentation` (shared with Charts/PDF) |

### `insightMode` behavior

When `insightMode=true` (Insights + PDF capture):

- Uses **`insightCartesianPlanMain`** (fixed `planViewportPx` from `getInsightLayoutMetrics`, not live DOM width)
- Margins via **`insightCartesianOuterMargins`** — symmetric left/right for centered cartesian plots
- Dense vertical bar/histogram: angled category ticks (-30°), interval thinning, tighter bottom padding
- Histogram: `barCategoryGap: 2`, rounded bar tops, capped `maxBarSize`

### Plot height (`insightShellPlotHeight`)

| Kind | Rule |
|------|------|
| `bar_horizontal` | `resolveChartDisplayHeight` clamped to viewport (`clampChartHeightToViewport`, max ~50% viewport / 520px) |
| `line` / `area` | Fixed floor **336px** (not `viewportH * 0.38`) |
| `bar` / `histogram` | Base **300px** + 6px per category over 5 (capped by `plotHeightMax`) |
| Other | ~36% of `viewportH` |

Shell height follows plot via `--insights-viz-plot-h` — no stacked `min-h-[300px]` dead space on the viewport wrapper.

### Centering

```
AiInsightChartShell (mx-auto max-w-[960px])
  └─ ChartInsightViewportWrapper (place-items-center + max-w 760/850/900px by kind)
       └─ Recharts ResponsiveContainer
```

PDF off-screen mirror: `chartCaptureInsightRef` at `left: -10000px`, `w-[860px]`, same shell + `insightMode: true`.

---

## 4. Chart metadata pills (`ChartContextSummary`)

**Location:** inline `memo` in `page.tsx` (~629–714).  
**Styling:** `aiInsightsVizMetaChip*` tokens in `ai-insights-ui.ts` + scoped rules in `globals.css`.

| Chip | Content |
|------|---------|
| **View** | Presentation kind (Bar, Histogram, Line, …) |
| **Measure** | `insightChartAxisLabels.valueAxis` |
| **Axis** | Scatter: X + Y chips; else `roleLabel` + `detailLabel` from `ChartSemanticHeaderModel` |
| **Mono badge** | `badgeCompact` — type · metric · rows · groups |
| **Lead** (optional) | Highest / Lowest / Top region / trend peak from chart data |

### Dark mode contrast (stable)

- Chip shell: `--insights-layer-inset` background, `--insights-border-soft` border
- Label: `--insights-answer-label` (muted but readable)
- Value + mono badge: `--insights-answer-body`
- **Highest** lead chip: stronger emerald (`dark:text-emerald-50`, richer border/background) — visually above metadata chips
- **No** opacity stacking (`text/40`, `opacity-50`) on informational chips

### Semantic metadata pipeline

| Step | Module |
|------|--------|
| Normalized viz | `frontend/lib/normalized-viz-metadata.ts` |
| Axis bundle | `buildChartAxisPresentationBundle` in `page.tsx` |
| Aligned merge | `frontend/lib/insight-aligned-axis-merge.ts` |
| Header model | `frontend/lib/chart-semantic-metadata.ts` — `buildChartSemanticHeader` |
| Histogram measure | `resolveHistogramMeasureChipLabel()` — column name (e.g. **Salary**), not stale **Average salary** from aligned analysis |

---

## 5. AI response ↔ chart synchronization

### Question change

- `setQuestionAndResetInsightState` — prefills textarea; clears answer/viz thread when text differs from last ask (`clearInsightThread()`)
- Suggested Questions click → prefill only (**does not** auto-send)

### Ask flow (`askAI`)

1. POST `/ask` with filters + `conversation_context`
2. `shouldPreservePinnedInsightChart()` — keeps pinned chart only for same question, follow-up, or aligned metrics (not every new ask)
3. `pushAIChart` → session timeline + `insightChartId`
4. Per-chart answer bundle in `aiAnswerByChartId`

### Intent guard (outlier)

`frontend/lib/chart-question-intent.ts`:

- `isOutlierAnalysisQuestion`, `isMisleadingOutlierDepartmentChart`, `chartSnapshotMatchesQuestionIntent`
- Prevents viz when question asks for outliers but chart is department-average aggregate

### Backend alignment

`backend/main.py`:

- `_try_outlier_visualization` — histogram buckets (≥3 bins) or ranked individuals (`bar_horizontal` if >6 rows)
- Skips department averages unless question explicitly groups by dimension
- `chartRecommendation` on visualization payload (`detectedIntent`, `recommendedChart`, `selectionExplanation`, …)

### Frontend presentation

- `computeFinalChartPresentation` preserves API `histogram`; rank/outlier text can steer `bar_horizontal`
- Client `smart-chart-intelligence.ts` — `computeSmartChartIntel`, `detectNumericAnomalies` (z-score >2.5, lead ratio ≥2.5×)

---

## 6. AI Read on this chart

**Component:** `frontend/app/components/SmartChartInsightPanel.tsx`  
**Title:** “AI read on this chart” (`aiInsightsSmartReadTitle`)

**Gate (Insights only):** `insightChartMatchesCurrentQuestion && insightSmartChartIntel?.active`

**Content:**

- Recommended view label + alignment note vs rendered kind
- “Why this chart” + recommendation blurb
- Up to 3 signal cards from executive viz insights
- Optional `anomalyNote` (amber)

**Charts tab:** same component, **no** question-alignment gate; uses `sessionSmartChartIntel`.

---

## 7. Export button state

| Flag | Meaning |
|------|---------|
| `showInsightExportButton` | `hasValidAIAnswer` + answer + question + `canExportInsight` |
| `canExportInsight` | Snapshot + renderable viz + (AI source needs exportable answer + question alignment) |
| `exportEnabledReason` | Debug string: `no_insight_chart_ask_ai_first`, `missing_ai_visualization`, `missing_ai_narrative`, `question_changed_since_last_ask`, `ready` |

**Action:** `downloadReport({ chartScope: "insight", ... })` → `frontend/app/pdf-report.ts`  
**Capture:** `chartCaptureInsightRef` (860px width, centered chart image in PDF)

---

## 8. Reset conversation

**Handler:** `resetAiConversation` in `page.tsx`

Clears: question, answer, `hasValidAIAnswer`, chips, `alignedAnalysis`, `aiAnswerByChartId`, conversation meta.

**Session:** `clearAiInsightSession()` — removes `source === "ai"` charts from timeline; clears `insightChartId`. **Keeps** file, filters, auto-dashboard charts, non-AI history.

**Button:** `disabled={!hasActiveAiConversation}` — active when any conversation signal exists (draft question, history, stored per-chart answers).

---

## 9. Suggested Questions scrolling

| Piece | Detail |
|-------|--------|
| Container | `aiInsightsSuggestedScrollBody` + `ai-insights-suggested-scroll` |
| Max height | `min(68vh, 520px)` / `lg:min(calc(100vh-13rem), 640px)` |
| Overflow | `overflow-y-auto` + `overscroll-y-auto` at all breakpoints |
| Scrollbar | 5px; thumb hidden until panel hover (`globals.css`) |
| Cards | Single token `aiInsightsSuggestedQ` — equal weight, hover-only lift |
| Hygiene | Max 5 visible suggestions; Recent section (last 3) |

---

## 10. Dark / light mode

| Layer | Source |
|-------|--------|
| Global theme | `frontend/lib/theme.ts` + `ThemeScript` + `:root` / `.dark` in `globals.css` |
| Insights shell | `--insights-layer-shell` … `--insights-layer-inset` |
| Answer text | `--insights-answer-body`, `--insights-answer-emphasis`, `--insights-answer-label` |
| Chart axes | `--chart-axis-tick`, `--chart-axis-line` (scoped override on `.ai-insights-page`) |
| Viz frame | `.dark .ai-insights-viz-chart-frame` — subtle inset, no heavy plot overlay on tooltip hover |

Light mode: explicit slate/white surfaces; inset highlights on answer summary panel.

---

## 11. Responsive behavior and zoom

| Mechanism | Behavior |
|-----------|----------|
| Breakpoints | Tailwind `sm:`, `lg:`, `xl:` on grids and padding |
| Viewport state | `window.innerHeight/innerWidth` resize (140ms debounce) → `viewportH`, `viewportW` |
| Height cap | `clampChartHeightToViewport`: max `min(viewportH * 0.5, 520)` |
| Insight layout width | **Fixed** plan widths (760 / 850 / 900px) — not container `ResizeObserver` |
| Browser zoom | **Not explicitly modeled** — relies on resize events; informal QA at **90% / 100%** zoom |

Stable UX decision: insight charts prioritize **readable fixed layout** over fluid width measurement to avoid reflow jitter at zoom changes.

---

## 12. Enterprise UI conventions (Insights)

- Gradient outer shell, `rounded-[1.25rem]`, restrained shadows (dark: `shadow-none` on cards)
- Kickers: `text-[10px]` uppercase, wide tracking
- Premium buttons: `btnPrimary` / `btnSecondary` + `aiInsightsAskSubmitBtn` hover lift in `globals.css`
- Executive KPI grid: left accent bar, equal min-heights
- AI Answer: inset summary panel + accordion “Supporting detail”
- Provenance: collapsible `<details>` with section labels

---

## 13. Session store integration

**Provider:** `frontend/contexts/chart-session-context.tsx`

- `selectChart(id)` sets **both** `activeId` and `insightChartId`
- `pushAIChart` dedupes by semantic intent; freezes `VisualizationContract`
- `clearAiInsightSession` strips AI entries only

---

## 14. Known limitations (current)

| Limitation | Notes |
|------------|--------|
| Monolithic `page.tsx` | ~12k lines; primary integration hub |
| No URL routing per tab | In-memory `activeTab` only |
| Browser zoom | No `visualViewport` API; resize-based viewport only |
| PDF bundle | `pdf-report.ts` statically imported; capture fallback uses white background |
| Answer parsing | Sections without `##` headers may remain in summary only |
| Smart intel vs rendered kind | Client `recommendCore` blurbs may differ from final `computeFinalChartPresentation` |
| Stacked multi-series | Smart panel may use stacked-specific copy paths |
| Debug export details | Hidden unless `NEXT_PUBLIC_AI_INSIGHTS_DEBUG=true` |

---

## 15. Stable UX decisions (do not regress)

1. **Question–chart alignment** before showing viz, AI Read, or export
2. **Outlier questions** → histogram or ranked individuals, not department averages (unless explicit “by X”)
3. **Histogram measure chip** shows distributed column name, not misleading “Average …”
4. **Metadata chips** readable in dark mode without looking disabled
5. **Chart centering** via symmetric margins + viewport wrapper (not left-heavy gutters)
6. **Reset** disabled until a conversation exists
7. **Suggested Questions** scroll independently; click prefills only
8. **Export** hidden until narrative + aligned viz are ready
9. **Incremental fixes only** — see [`AGENTS.md`](AGENTS.md)

---

## 16. File index (Insights-specific)

| Path | Role |
|------|------|
| `frontend/app/page.tsx` | Tab UI, ask/export/reset, gates, `ChartContextSummary` |
| `frontend/lib/ai-insights-ui.ts` | Tailwind token strings |
| `frontend/app/globals.css` | Dark insights layers, chips, scroll, viz plot |
| `frontend/lib/chart-semantic-metadata.ts` | Headers, histogram measure label |
| `frontend/lib/insight-aligned-axis-merge.ts` | Aligned axis labels |
| `frontend/lib/chart-question-intent.ts` | Outlier intent guards |
| `frontend/lib/smart-chart-intelligence.ts` | AI Read intel |
| `frontend/lib/normalized-viz-metadata.ts` | Title/semantic normalization |
| `frontend/contexts/chart-session-context.tsx` | Timeline + insight pin |
| `backend/main.py` | `/ask`, outlier/histogram routing |

---

*Last updated: May 2026 — stable baseline before Export/PDF enhancements.*
