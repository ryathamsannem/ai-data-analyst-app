# Charts Tab — Stable Baseline

**Production snapshot** of the Charts tab (`activeTab === "charts"`) as implemented in the repo (May 2026). Documents **current behavior only**.

**Related:** [`AGENTS.md`](AGENTS.md) · [`PROJECT_ARCHITECTURE_SUMMARY.md`](PROJECT_ARCHITECTURE_SUMMARY.md) · [`AI_INSIGHTS_STABLE_SUMMARY.md`](AI_INSIGHTS_STABLE_SUMMARY.md)

---

## 1. Purpose

The Charts tab is the **session visualization workspace**: preview charts pushed from Overview auto-dashboard and AI Insights, browse timeline history, download PNG, and supply the **session-scoped** chart for the Export tab PDF.

It does **not** run `/ask` itself — it reads from `ChartSessionProvider`.

---

## 2. Layout and structure

**Location:** `frontend/app/page.tsx` (`activeTab === "charts"`, ~10649+)

```
Section (slate gradient shell, rounded-[1.35rem])
├─ Header: title + description + "Download Chart PNG"
└─ Grid lg:grid-cols-[minmax(10.5rem,23%)_minmax(0,1fr)]
   ├─ ChartsTimelineAside (~23% width)
   └─ Main preview card (flex-1)
      ├─ chartHeadingBlock (title / subtitle)
      ├─ ChartContextSummary (default chip size — not compact)
      ├─ partialVisualizationWarning? (amber note)
      ├─ Plot surface (fixed chartHeightMain, insightMode=false)
      └─ SmartChartInsightPanel (session intel — always when active)
```

### Styling vs AI Insights

| Aspect | Charts tab | AI Insights |
|--------|------------|-------------|
| Shell tokens | Hardcoded slate gradients in `page.tsx` | `ai-insights-ui.ts` + `--insights-layer-*` |
| Chart frame | Plain div + `chartHeightMain` style | `AiInsightChartShell` + viewport wrapper |
| Metadata chips | Standard padding/size | `compactChips` |
| Smart panel gate | `sessionSmartChartIntel?.active` | Also requires `insightChartMatchesCurrentQuestion` |
| Dark mode | Global slate classes | Scoped `.ai-insights-page` layers |

**Stable decision:** Charts tab keeps its established light-first card chrome; do not force Insights token module onto Charts without explicit product request.

---

## 3. Chart card structure

### Preview card chrome

- `rounded-[1.35rem]` border, gradient `from-white via-white to-slate-50/35`
- Ring + hover shadow transition (`group` / `group-hover`)
- Centered heading block (`chartsSessionHeadingRef`, `scroll-mt-28`)
- Plot area: `animate-chart-surface-in`, height = **`chartHeightMain`** (session layout, not insight shell metrics)

### Empty states

| State | Copy |
|-------|------|
| History exists, none selected | “Select a chart” — pick Auto or AI in timeline |
| No history | “Ask something analytical” + example prompts |

---

## 4. Timeline aside

**Component:** `frontend/app/components/home/charts-timeline-aside.tsx`

| Item | Behavior |
|------|----------|
| Sections | Grouped chart history (`chartHistorySections`) |
| Selection | `selectChartPreserveScroll` — preserves aside scroll position |
| Active id | `activeChartId` from session store |
| Ref | `chartHistoryAsideRef` for scroll-into-view on navigation from Overview |

History **resets** when dataset or column mapping changes (described in tab subtitle).

---

## 5. Chart rendering (session path)

### Call site

```tsx
renderDatasetChart(chartHeightMain, false, false)
// height, compact=false, insightMode=false
```

### Pipeline (shared with Insights/PDF semantics)

| Step | Module |
|------|--------|
| Presentation kind | `computeFinalChartPresentation` (`frontend/lib/final-chart-presentation.ts`) |
| Contract / trend | `freezeVisualizationContract`, `isTrendMode` (`frontend/lib/selected-visualization.ts`) |
| Category plan | `sessionCartesianPlanMain` — uses **live** `viewportEffective` (capped 860px) |
| Render | `ChartRenderer` (`frontend/app/components/home/chart-renderer.tsx`) |
| Axes | `chart-axis-layout.ts`, `chart-time-x-axis.ts`, `chart-axis-formatters.ts` |

### `insightMode=false` differences

- Viewport width: `viewportEffective = min(max(viewportW, 320), MAIN_CHART_LAYOUT_CAP_PX)` (860)
- Margins: session cartesian plan (not `insightCartesianOuterMargins`)
- No `AiInsightChartShell` / `ChartInsightViewportWrapper` centering stack
- Plot height: session `chartHeightMain` heuristics (not `insightShellPlotHeight`)

### Supported chart kinds (session)

Same API set as backend: `bar`, `bar_horizontal`, `pie`, `donut`, `line`, `area`, `scatter`, `histogram`.

**Horizontal bar semantics:** `bar_horizontal` stays horizontal — do not force vertical layout.

---

## 6. Chart metadata pills

**Component:** `ChartContextSummary` (shared memo in `page.tsx`)

Charts tab uses **default** chip sizing (not `compactChips`).

| Chip | Session source |
|------|----------------|
| Measure | `chartAxisLabels.valueAxis` |
| Semantic header | `sessionChartSemanticHeader` from `buildChartAxisPresentationBundle` |
| Mono badge | `sessionChartMetadataBadgeCompact` via `buildChartMetadataBadgeCompact` |
| Lead | `chartInsightBadge` from `computeChartInsightBadge` / trend badge |

Dark mode: chips use the same `aiInsightsVizMetaChip*` classes when rendered inside a dark-themed app shell (global `dark` on `<html>`); Charts card itself uses slate Tailwind, not `--insights-layer-*` on the card body.

---

## 7. Semantic chart selection

### Deterministic presentation

`computeFinalChartPresentation` resolves kind from:

- API `chartType` string
- Row count and label shape (temporal → line/area; scatter points; etc.)
- Title / question hints (rank, outlier, share, trend)

**Overview mini charts** use a **separate** path (`computeOverviewDashboardChartPresentation` in `page.tsx`) — do not conflate.

### Chart sources in timeline

| `source` | Origin |
|----------|--------|
| `ai` | `/ask` → `pushAIChart` |
| `auto_dashboard` | Overview sync via `replaceAutoDashboardCharts` / dashboard keys |
| (session) | Filtered dashboard refresh may replace auto entries |

### Linking Overview ↔ session

- `dashboardChartKey` + `getCanonicalChartTitle` keep Overview cards and session snapshots aligned
- `openDashboardChartInChartsTab` — selects chart + scrolls preview into view

---

## 8. AI Read on this chart (session)

**Component:** `SmartChartInsightPanel`  
**Intel:** `sessionSmartChartIntel` from `computeSmartChartIntel` (`frontend/lib/smart-chart-intelligence.ts`)

**No question-alignment gate** on Charts tab — panel shows whenever intel is `active` and chart data exists.

Shows: recommended view, why-this-chart copy, signal cards (from `executiveVizInsights`), anomaly note when detected.

---

## 9. Export and capture

### Download Chart PNG

- Button: `downloadChartPng` — disabled when `chartData.length === 0`
- Uses active session snapshot + `chartCaptureSessionRef`

### Export tab PDF (session scope)

- `downloadReport({ chartScope: "session", ... })` (default)
- Capture ref: `chartCaptureSessionRef`
- Validation: `validateExportMatchesContract` before export

### Off-screen capture DOM

| Ref | Width | `insightMode` |
|-----|-------|----------------|
| `chartCaptureSessionRef` | Session layout | `false` |
| `chartCaptureInsightRef` | 860px | `true` (Insights only) |

**PDF chart image:** centered in content area (`pdf-report.ts`); max height ~118mm.

---

## 10. Responsive behavior and zoom

| Mechanism | Charts tab behavior |
|-----------|---------------------|
| Grid | Single column mobile; timeline + preview at `lg+` |
| `viewportH` / `viewportW` | Window resize debounce (140ms) drives `chartHeightMain` cap |
| `clampChartHeightToViewport` | Max `min(viewportH * 0.5, 520)` |
| Layout width | **Live** viewport capped at 860px for axis plans |
| Zoom | Informal QA at 90% / 100% / 125%; no dedicated zoom API |

**Stable decision:** Session charts measure against viewport for axis density; Insights charts use fixed plan widths for stability.

---

## 11. Chart spacing and padding standards

| Element | Typical values |
|---------|----------------|
| Section shell | `p-4 sm:p-5`, `mb-10` |
| Preview card | `p-3.5 sm:p-4 md:p-5` |
| Plot wrapper | `rounded-xl`, light inset gradient, `px-1 pb-0.5 pt-0.5` |
| Heading | `text-[1.35rem]` / `sm:text-2xl`, centered |
| Grid gap | `gap-5 lg:gap-6` |

Recharts margins: from `sessionCartesianPlanMain` + kind-specific adjustments in `chart-renderer.tsx` (not `insightCartesianOuterMargins`).

---

## 12. Integration with other tabs

| From | Action |
|------|--------|
| Overview | Open in Charts (`openDashboardChartInChartsTab`), PNG from card |
| AI Insights | `pushAIChart` adds to timeline; Insights pin uses `insightChartId` |
| Export | Uses active session chart unless `chartScope: "insight"` |

`selectChart` must set **both** `activeId` and `insightChartId` so Insights pin stays in sync when browsing timeline from Charts.

---

## 13. Known limitations

| Limitation | Notes |
|------------|--------|
| Styling divergence | Charts card not fully on `ai-insights-ui.ts` tokens |
| No `/ask` on tab | Must use AI Insights or Overview to create AI charts |
| History loss on mapping change | By design when dataset/mapping changes |
| PDF capture | Fallback `html2canvas` uses white background |
| Large `page.tsx` | Charts block embedded in monolith |

---

## 14. Stable UX decisions (do not regress)

1. Timeline + preview **two-column** layout at `lg+`
2. **Shared** `ChartRenderer` and `computeFinalChartPresentation` with Insights/PDF
3. **Horizontal bars stay horizontal**
4. `ChartContextSummary` + metadata line parity with Insights (minus compact chips)
5. **SmartChartInsightPanel** visible on session charts without Insights-only gates
6. PNG + session PDF use **`chartCaptureSessionRef`**
7. Preserve scroll when selecting timeline items
8. **Incremental** Charts tab polish only — see [`AGENTS.md`](AGENTS.md)

---

## 15. File index (Charts-specific)

| Path | Role |
|------|------|
| `frontend/app/page.tsx` | Charts tab JSX, `renderDatasetChart`, session memos |
| `frontend/app/components/home/charts-timeline-aside.tsx` | Timeline UI |
| `frontend/app/components/home/chart-renderer.tsx` | Recharts (session + insight modes) |
| `frontend/lib/final-chart-presentation.ts` | Kind resolution |
| `frontend/lib/chart-layout-config.ts` | Insight metrics (PDF/Insights); session uses viewport cap |
| `frontend/lib/chart-axis-layout.ts` | Category/value axis plans |
| `frontend/contexts/chart-session-context.tsx` | History, active chart, push/select |
| `frontend/app/pdf-report.ts` | PDF layout and chart capture |
| `frontend/lib/smart-chart-intelligence.ts` | Session smart intel |

---

*Last updated: May 2026 — production baseline before Charts tab enhancements.*
