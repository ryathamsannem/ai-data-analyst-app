# Charts — Stable Summary (Standard Baseline)

**Status:** STANDARD / STABLE baseline (May 2026)  
**Scope:** `activeTab === "charts"` only — reflects **current working code** after redesign, timeline polish, and reverted over-spacing experiments.

**Related:** [`AGENTS.md`](AGENTS.md) · [`UI_BASELINE_RULES.md`](UI_BASELINE_RULES.md) · [`PROJECT_ARCHITECTURE_SUMMARY.md`](PROJECT_ARCHITECTURE_SUMMARY.md) · [`UI_ARCHITECTURE_SNAPSHOT.md`](UI_ARCHITECTURE_SNAPSHOT.md) · [`AI_VISUALIZATION_BEHAVIOR.md`](AI_VISUALIZATION_BEHAVIOR.md) · [`AI_INSIGHTS_STABLE_SUMMARY.md`](AI_INSIGHTS_STABLE_SUMMARY.md)

**Recovery use:** Pre–Export/PDF enhancement baseline. Extend in place; do not broad-redesign.

**Export/PDF:** Charts supplies session PNG/PDF capture via `chartCaptureSessionRef` — Export tab polish is **pending**.

---

## 1. Purpose

The Charts tab is the **session visualization workspace**:

- Preview charts from **Overview** (auto dashboard) and **AI Insights** (question-driven).
- Browse **timeline history**, select a run, download PNG, attach chart to **Export** PDF.
- Does **not** call `/ask` — reads `ChartSessionProvider` snapshots only.

---

## 2. Layout structure

**Entry:** `frontend/app/page.tsx` (~10658+)

```
chartsTabPage (section shell)
├─ chartsTabHeaderRow
│  ├─ Title + description
│  └─ Download Chart PNG (when chartData.length > 0)
└─ Grid lg:grid-cols-[minmax(10.5rem,23%)_minmax(0,1fr)]
   ├─ chartsTabTimelineColumn → ChartsTimelineAside
   └─ Preview column (chartsPreviewRef)
      └─ chartsTabVizPreviewCard (chart-viz-theme + charts-tab-viz-preview)
         ├─ chartsTabPreviewHeaderSticky (sticky band)
         │  ├─ chartHeadingBlock (title / subtitle) OR fallback kicker + “Visualization”
         │  ├─ ChartContextSummary (compactChips)
         │  ├─ ChartsTabIntelligenceStrip
         │  └─ ChartsTabChartReason (“Why this chart”)
         ├─ ChartsTabPlotTransition → plot frame + chart
         └─ chartsTabSmartReadWrap → SmartChartInsightPanel
```

### Header hierarchy (top → bottom inside preview)

| Layer | Component / token | Role |
|-------|-------------------|------|
| 1 | `chartHeadingBlock` / `chartsTabVizHeaderZone` | Chart title, subtitle |
| 2 | `ChartContextSummary` | View · Measure · Axis · mono badge · optional lead chip |
| 3 | `ChartsTabIntelligenceStrip` | Source · View · Measure · Axis + highlight + warning note |
| 4 | `ChartsTabChartReason` | One-sentence chart selection rationale |
| 5 | Plot transition + render | Recharts via `renderDatasetChart` |
| 6 | `SmartChartInsightPanel` | Deeper “AI read” (below plot, bordered section) |

### Main visualization container

| Piece | File / token |
|-------|----------------|
| Preview card | `chartsTabVizPreviewCard` (`ai-insights-ui.ts`) |
| Session frame | `chartsTabVizSessionFrame` |
| Viewport centering | `ChartInsightViewportWrapper` with `sessionMode` → `max-w-full` |
| Plot surface | `chartsTabSessionPlotSurface` (no duplicate `animate-chart-surface-in`) |
| Transition | `ChartsTabPlotTransition` — shimmer + `charts-tab-preview-enter` on `chartId` change |

### Download PNG

- Button: `chartsTabDownloadBtn` in header row (`downloadChartPng`).
- Shown only when `chartData.length > 0`.
- Capture: `chartCaptureSessionRef`, `insightMode=false`.

---

## 3. Token modules and styling

| Module | Path | Role |
|--------|------|------|
| Charts tab tokens | `frontend/lib/charts-tab-ui.ts` | Page, timeline, intel strip, reason strip, plot stage |
| Shared viz theme | `frontend/lib/ai-insights-ui.ts` | `chartVizThemeScope`, `chartsTabVizPreviewCard`, meta chip classes |
| Charts-specific CSS | `frontend/app/globals.css` | Timeline scroll, hover, transitions, sticky header, plot clamp |

### Dark / light mode

- Page shell: `charts-tab-page` — `--surface-elevated` / `--insights-layer-panel` in dark.
- Preview card: `chart-viz-theme` + `charts-tab-viz-preview` — shared Recharts axis tokens with AI Insights.
- Timeline + intel + reason: `dark:` variants on `--insights-border-*`, `--insights-layer-*`, `--insights-text-*`.
- Sticky header: frosted `backdrop-filter` with theme-mixed background.

**Stable decision:** Charts preview uses the **shared viz theme** for plot readability in dark mode; tab chrome uses `charts-tab-ui.ts` + global CSS, not a separate slate-only path.

---

## 4. Spacing system (compact baseline)

| Region | Spacing |
|--------|---------|
| Page section | `p-4 sm:p-5`, `mb-10` |
| Header row | `mb-6`, `gap-4`, `md:flex-row md:items-end` |
| Grid | `gap-5 lg:gap-6`, `items-start`, `min-h-0` |
| Preview card | `p-3.5 sm:p-4 md:pb-4` |
| Intel strip | `mb-2.5 sm:mb-3`, `px-3 py-2` |
| Why this chart | `mb-2 sm:mb-2.5`, `px-2.5 py-2` |
| Plot stage | **Minimal** top gap — `margin-top: 0.125rem` in CSS only (no large `pt-*` on stage) |
| Plot slot height | `clamp(196px, var(--charts-tab-plot-h), min(42vh, 440px))` |
| Smart read | `mt-3`, `pt-4` top border separator |

**Do not regress:** Avoid reintroducing large plot top padding or large-viewport height boosts that stretch the preview column.

---

## 5. Typography hierarchy

| Element | Style |
|---------|--------|
| Tab title | `chartsTabTitle` — `text-xl sm:text-2xl font-semibold` |
| Tab description | `chartsTabDesc` — `text-sm sm:text-[15px]` muted |
| Timeline title | `chartsTabTimelineTitle` — `text-sm font-semibold` |
| Section labels | `chartsTabTimelineSectionLabel` — `10px` uppercase tracking |
| Card title | `chartsTabTimelineCardTitle` — `text-sm`, **line-clamp-2** |
| Viz title | `aiInsightsVizTitle` (shared) |
| Metadata chips | `aiInsightsVizMetaChip*` with `compactChips` |
| Intel strip | `10–11px` uppercase labels + medium values |
| Why this chart | `10px` label + `11px/sm:text-xs` body |

---

## 6. Metadata pill system

**Component:** `ChartContextSummary` (`page.tsx` memo)

Charts tab uses **`compactChips`** (tighter than default Insights header).

| Chip | Source |
|------|--------|
| View | `presentationKindUiLabel(sessionRenderedChartKind)` |
| Measure | `chartAxisLabels.valueAxis` |
| Axis | `sessionChartSemanticHeader` (role + detail, or X/Y for scatter) |
| Mono badge | `sessionChartMetadataBadgeCompact` |
| Lead (optional) | `chartInsightBadge` |

Semantic header built via `buildChartAxisPresentationBundle` / `chart-semantic-metadata.ts`.

---

## 7. “Why this chart” intelligence row

| Item | Detail |
|------|--------|
| Component | `ChartsTabChartReason` |
| Generator | `generateChartReason()` — `frontend/lib/generate-chart-reason.ts` |
| Wiring | `sessionChartReason` memo in `page.tsx` |
| Placement | Inside sticky header, **below** intel strip, **above** plot |
| Motion | `charts-tab-chart-reason-enter`; disabled under `prefers-reduced-motion` |
| Visibility | Returns `null` when no meaningful one-sentence copy |

**Priority for copy:**

1. First sentence of backend `selectionExplanation` (routing)
2. Aligned `sessionSmartChartIntel.recommendationBlurb`
3. Kind-specific template (bar, horizontal, donut, histogram, line, area, scatter, stacked)

---

## 8. Chart intelligence strip

**Component:** `ChartsTabIntelligenceStrip`

| Field | Session source |
|-------|----------------|
| Source | `ai` → “AI”; `auto_dashboard` → “Auto Dashboard” |
| View | Presentation kind label |
| Measure | Value axis label |
| Axis | Semantic header detail (or scatter X · Y) |
| Highlight | `chartInsightBadge` |
| Note | `visualization.partialVisualizationWarning` (trimmed) |

---

## 9. Chart rendering area

### Call site

```tsx
renderDatasetChart(chartHeightMain, false, false)
// height, compact=false, insightMode=false
```

### Height

`chartHeightMain` = `resolveChartsTabPreviewPlotHeight(chartData.length, presentationChartKind, viewportH)`  
(`frontend/lib/chart-layout-config.ts`)

| Kind | Heuristic (capped by `min(viewportH * 0.42, 440)`) |
|------|-----------------------------------------------------|
| `bar_horizontal` | `248 + 26px per point above 3`, min 240 |
| `pie` / `donut` / `scatter` | min 260, base ~292 |
| `line` / `area` | min 272, base ~300 |
| `bar` / `histogram` | `252 + up to 28px` for extra categories |

### Pipeline

| Step | Module |
|------|--------|
| Presentation kind | `computeFinalChartPresentation` |
| Contract / trend | `freezeVisualizationContract`, `isTrendMode` |
| Category plan | `sessionCartesianPlan` — `viewportEffective` ≤ 860px |
| Margins | `verticalCartesianOuterMargins`, `resolveVerticalBarPlotBottomPad`, `radialChartOuterMargins` |
| Render | `ChartRenderer` |

### Supported chart kinds (session)

`bar`, `bar_horizontal`, `line`, `area`, `pie`, `donut`, `scatter`, `histogram`

**Horizontal bars:** `bar_horizontal` always renders horizontal — never forced vertical.

---

## 10. Timeline behavior

**Component:** `frontend/app/components/home/charts-timeline-aside.tsx`

| Behavior | Implementation |
|----------|----------------|
| Sections | **From AI** (`aiSorted`, newest first) · **Auto dashboard** (`autoSorted`) |
| Selection | `selectChartPreserveScroll` — preserves aside scroll position |
| Active state | `chartsTabTimelineCardSelected` vs `chartsTabTimelineCardIdle` |
| Hover | Idle cards only — lift + glow (`globals.css`) |
| Scroll | Fixed header + `chartsTabTimelineScrollBody` — inner body only |
| Column height | `lg:h-[min(72vh,540px)]` |
| Card height | `min-h-[108px]` per item |

History **resets** when dataset or column mapping changes.

---

## 11. Responsive behavior and zoom

| Mechanism | Charts tab |
|-----------|------------|
| Layout | Single column mobile; timeline + preview at `lg+` |
| Viewport | `viewportH` / `viewportW` (140ms debounce) |
| Plot cap | `42vh` max, **440px** absolute cap |
| Layout width | `viewportEffective` ≤ 860px for axis plans |

---

## 12. Smart read panel (below chart)

**Component:** `SmartChartInsightPanel` — **no** Insights question gate on Charts tab.

Distinct from compact **Why this chart** strip above the plot.

---

## 13. Integration with other tabs

| From | Action |
|------|--------|
| Overview | Auto charts → timeline |
| AI Insights | `pushAIChart` after `/ask` |
| Export | Session PDF — **Export UI pending polish** |

**No** top dataset metadata card on Charts tab.

---

## 14. Reusable patterns

| Pattern | Detail |
|---------|--------|
| Viz shell | `chart-viz-theme` + `chartsTabVizPreviewCard` shared with Insights |
| Centering | `ChartInsightViewportWrapper` `sessionMode` |
| Metadata | `ChartContextSummary` + `aiInsightsVizMetaChip*` |
| Presentation | `computeFinalChartPresentation` (Pipeline A) |
| Session store | `ChartSessionProvider` |

---

## 15. Critical files

| Path | Role |
|------|------|
| `frontend/app/page.tsx` | Charts JSX, memos, `renderDatasetChart` |
| `frontend/lib/charts-tab-ui.ts` | Tab tokens |
| `frontend/lib/ai-insights-ui.ts` | Shared viz / chips |
| `frontend/app/globals.css` | Charts CSS |
| `frontend/app/components/home/charts-timeline-aside.tsx` | Timeline |
| `frontend/app/components/home/charts-tab-*.tsx` | Intel, reason, plot transition |
| `frontend/app/components/home/chart-renderer.tsx` | Recharts |
| `frontend/lib/generate-chart-reason.ts` | Why copy |
| `frontend/lib/chart-layout-config.ts` | Plot height |
| `frontend/lib/final-chart-presentation.ts` | Kind resolution |
| `frontend/contexts/chart-session-context.tsx` | History |

---

## 16. Stable UX decisions (do not regress)

1. Two-column **timeline + preview** at `lg+`
2. Shared **`chart-viz-theme`** on preview card
3. **`compactChips`** on metadata row
4. **Why this chart** + **intel strip** above plot; smart read below
5. **Timeline scroll** on inner body only
6. **Horizontal bars stay horizontal**
7. **Tight** metadata-to-plot spacing
8. PNG + session PDF: `chartCaptureSessionRef`, `insightMode=false`

---

*Last updated: May 2026 — stable baseline before Export/PDF enhancements.*
