# Charts Tab — Stable Summary (Standard Baseline)

**Status:** STANDARD / STABLE baseline (May 2026)  
**Scope:** `activeTab === "charts"` only — reflects **current working code** after unstable polish experiments were reverted.

**Related:** [`AGENTS.md`](AGENTS.md) · [`UI_ARCHITECTURE_SNAPSHOT.md`](UI_ARCHITECTURE_SNAPSHOT.md) · [`AI_VISUALIZATION_BEHAVIOR.md`](AI_VISUALIZATION_BEHAVIOR.md) · [`AI_INSIGHTS_STABLE_SUMMARY.md`](AI_INSIGHTS_STABLE_SUMMARY.md)

**Recovery use:** Treat this document as the pre–Export/PDF enhancement baseline. Extend in place; do not broad-redesign.

---

## 1. Purpose

The Charts tab is the **session visualization workspace**:

- Preview charts from **Overview** (auto dashboard) and **AI Insights** (question-driven).
- Browse **timeline history**, select a run, download PNG, attach chart to **Export** PDF.
- Does **not** call `/ask` — reads `ChartSessionProvider` snapshots only.

---

## 2. Layout structure

**Entry:** `frontend/app/page.tsx` (~10721+)

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
| Charts-specific CSS | `frontend/app/globals.css` | Timeline scroll, hover, transitions, sticky header, plot slot clamp |

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

**Product emphasis in timeline/preview:** vertical bar, horizontal bar, donut, histogram (+ line/area for trends, scatter for correlation).

**Horizontal bars:** `bar_horizontal` always renders horizontal — never forced vertical.

---

## 10. Timeline behavior

**Component:** `frontend/app/components/home/charts-timeline-aside.tsx`

| Behavior | Implementation |
|----------|----------------|
| Sections | **From AI** (`aiSorted`, newest first) · **Auto dashboard** (`autoSorted`) |
| Selection | `selectChartPreserveScroll` — preserves aside scroll position |
| Active state | `chartsTabTimelineCardSelected` vs `chartsTabTimelineCardIdle` |
| Hover | Idle cards only — lift + glow (`globals.css`); selected card hover unchanged |
| Scroll | Fixed header + `chartsTabTimelineScrollBody` with `overflow-y: auto`, `touch-action: pan-y`, thin scrollbar |
| Column height | `lg:h-[min(72vh,540px)]` — bounded, `self-start`, avoids wheel dead-zone |
| Card height | `min-h-[108px]` per item |
| Title | `line-clamp-2` + full title in `title` attribute |
| AI prompt | `line-clamp-1`, muted “Prompt ·” prefix |
| Badges | **AI** (emerald) · **Auto** (neutral) — unchanged |

History **resets** when dataset or column mapping changes (documented in tab subtitle).

---

## 11. Responsive behavior and zoom

| Mechanism | Charts tab |
|-----------|------------|
| Layout | Single column mobile; timeline + preview at `lg+` |
| Viewport | `viewportH` / `viewportW` from window resize (140ms debounce) |
| Plot cap | `42vh` max, **440px** absolute cap |
| Layout width | `viewportEffective = min(max(viewportW, 320), 860)` for axis plans |
| Zoom QA | Informal baseline at **80%, 90%, 100%, 125%** browser zoom — no dedicated zoom API |

**Stable decision:** Tight plot vertical rhythm; height scales with viewport but does not use large-screen-only boost multipliers.

---

## 12. Smart read panel (below chart)

**Component:** `SmartChartInsightPanel`  
**Intel:** `sessionSmartChartIntel` from `computeSmartChartIntel`

- **No** Insights-only `insightChartMatchesCurrentQuestion` gate on Charts tab.
- Shows when intel `active` and data exists: recommended view, longer why copy, `recommendationBlurb`, signal cards, anomaly note.

Distinct from the compact **Why this chart** strip above the plot.

---

## 13. Integration with other tabs

| From | Action |
|------|--------|
| Overview | Auto charts → timeline; `openDashboardChartInChartsTab` |
| AI Insights | `pushAIChart` after `/ask` |
| Export | Session PDF default; `chartCaptureSessionRef` |

`selectChart` keeps `activeId` and `insightChartId` in sync when browsing from Charts.

---

## 14. Stable UX decisions (do not regress)

1. Two-column **timeline + preview** at `lg+`
2. Shared **`chart-viz-theme`** on preview card (dark plot parity with Insights)
3. **`compactChips`** on Charts metadata row
4. **Why this chart** strip + **intel strip** above plot; smart read below
5. **Timeline scroll** on inner body only; column `min-h-0`
6. **Plot transitions** on selection change; reduced-motion safe
7. **Horizontal bars stay horizontal**
8. **Tight** metadata-to-plot spacing (no oversized top padding / tall viewport boost)
9. PNG + session PDF use **`chartCaptureSessionRef`**, `insightMode=false`

---

## 15. File index

| Path | Role |
|------|------|
| `frontend/app/page.tsx` | Charts JSX, session memos, `renderDatasetChart` |
| `frontend/lib/charts-tab-ui.ts` | Charts tab design tokens |
| `frontend/lib/ai-insights-ui.ts` | Preview card + shared viz / chip tokens |
| `frontend/app/globals.css` | Charts tab CSS (scroll, hover, motion, plot clamp) |
| `frontend/app/components/home/charts-timeline-aside.tsx` | Timeline UI |
| `frontend/app/components/home/charts-tab-intelligence-strip.tsx` | Intel row |
| `frontend/app/components/home/charts-tab-chart-reason.tsx` | Why strip UI |
| `frontend/app/components/home/charts-tab-plot-transition.tsx` | Plot transition |
| `frontend/app/components/home/chart-insight-viewport-wrapper.tsx` | `sessionMode` centering |
| `frontend/app/components/home/chart-renderer.tsx` | Recharts |
| `frontend/lib/generate-chart-reason.ts` | One-sentence chart reason |
| `frontend/lib/smart-chart-intelligence.ts` | Smart read intel |
| `frontend/lib/chart-layout-config.ts` | `resolveChartsTabPreviewPlotHeight` |
| `frontend/lib/final-chart-presentation.ts` | Kind resolution |
| `frontend/contexts/chart-session-context.tsx` | History store |

---

*Last updated: May 2026 — standard baseline before Export/PDF enhancements.*
