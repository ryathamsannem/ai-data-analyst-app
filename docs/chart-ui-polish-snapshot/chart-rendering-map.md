# Chart Rendering Map — Chart UI Polish Baseline

**Branch:** `chart-ui-polish-baseline`  
**Stable commit:** `4247ef3`  
**Purpose:** Complete map of files and render paths for all chart surfaces and exports.

---

## 1. All files/components involved in rendering charts

### Core renderer

| File | Role |
|------|------|
| `frontend/app/components/home/chart-renderer.tsx` | **Primary Recharts renderer** — all `ChartKind` branches |
| `frontend/app/chart-types.ts` | `ChartKind`, `ChartRow` type definitions |

### Layout & centering shells

| File | Role |
|------|------|
| `frontend/app/components/ai-insight-chart-shell.tsx` | AI Insights frame + `--insights-viz-plot-h` CSS var |
| `frontend/app/components/home/chart-insight-viewport-wrapper.tsx` | Grid centering; kind-based max-width (Insights) or full width (Charts session) |
| `frontend/app/components/home/charts-tab-plot-transition.tsx` | Plot height CSS vars + enter animation on timeline change |

### Presentation & kind resolution

| File | Role |
|------|------|
| `frontend/lib/final-chart-presentation.ts` | **Pipeline A** — `computeFinalChartPresentation` (Charts, Insights, export) |
| `frontend/lib/selected-visualization.ts` | Visualization contract freeze, trend mode |
| `frontend/lib/smart-chart-intelligence.ts` | Recommendation blurbs, anomaly detection |
| `frontend/lib/chart-semantic-metadata.ts` | Axis/chip semantics, grain labels |
| `frontend/lib/relationship-scatter-presentation.ts` | Scatter intent detection |

### Axis, margins, ticks

| File | Role |
|------|------|
| `frontend/lib/chart-axis-layout.ts` | Category plans, H-bar layout, pie margins, vertical value axis |
| `frontend/lib/chart-layout-config.ts` | Viewport max classes, `verticalCartesianOuterMargins`, deprecated insight aliases |
| `frontend/lib/shared-chart-layout.ts` | **Shared detail plot band** (460–560px), `resolveSharedDetailPlotHeight` |
| `frontend/lib/chart-time-x-axis.ts` | Line/area X-axis ticks, bottom margin, interval thinning |
| `frontend/lib/chart-axis-formatters.ts` | Tick formatters (category, scatter X, value) |
| `frontend/lib/chart-axis-theme.ts` | CSS axis color tokens + export resolution |
| `frontend/app/components/chart-value-axis-title.tsx` | Axis title label components |
| `frontend/app/components/chart-category-axis-tick.tsx` | Wrapped Y-axis ticks (H-bar) |

### Radial (donut/pie)

| File | Role |
|------|------|
| `frontend/lib/radial-chart-format.ts` | Share %, tooltip formatting |
| `frontend/lib/radial-export-layout.ts` | Export radii, legend row estimate |
| `frontend/lib/chart-palette.ts` | `PIE_COLORS` |

### Overview-only pipeline

| File | Role |
|------|------|
| `frontend/lib/overview-dashboard-plot-layout.ts` | `computeCartesianCategoryPlanForRender`, overview_half variant |
| `frontend/lib/overview-dashboard-chart-renderable.ts` | Finite-value renderable guard |
| `frontend/lib/overview-dashboard-export.ts` | Effective presentation kind for PNG parity |
| `frontend/lib/canonical-chart-title.ts` | Display title polish |
| `frontend/lib/overview-chart-grid-layout.ts` | Grid solo-row detection |
| `frontend/lib/metric-spread-gap.ts` | Top/Lowest/Gap insight chips |
| `frontend/lib/chart-quality-warnings.ts` | Rate >100% warnings |

### Session & orchestration (page.tsx)

| Symbol | Role |
|--------|------|
| `renderDatasetChart()` | Factory wrapping `ChartRenderer` with mode-specific props |
| `OverviewDashboardChartSlot` | Overview mini card wrapper + ResizeObserver |
| `OverviewAutoDashboardChartCard` | Card chrome, actions, offscreen PNG portal |
| `buildOverviewDashboardPlot()` | Overview Recharts tree (Pipeline B) |
| `computeOverviewDashboardChartPresentation()` | Overview kind resolver |
| `ChartContextSummary` | Metadata chips (View · Measure · Axis) |

### Styling tokens

| File | Role |
|------|------|
| `frontend/lib/ai-insights-ui.ts` | Viz card, plot surface, meta chip classes |
| `frontend/lib/charts-tab-ui.ts` | Charts tab page, plot stage, intel strip |
| `frontend/lib/overview-ui.ts` | Overview dash card, grid tokens |
| `frontend/app/globals.css` | Plot height clamps, grid stroke, dark viz layers |

### PNG export rendering

| File | Role |
|------|------|
| `frontend/lib/chart-png-capture.ts` | Canvg render, canvas composite (header/chips/footer) |
| `frontend/lib/chart-png-export-layout.ts` | Canvas dimensions by kind |
| `frontend/lib/chart-png-export-session.ts` | `runChartPngExport`, offscreen wait |
| `frontend/lib/chart-png-offscreen-host.tsx` | React portal at `-12000px` |
| `frontend/lib/chart-png-export-svg-polish.ts` | Pre-capture SVG polish |
| `frontend/lib/chart-png-export-text.ts` | Export text contrast |
| `frontend/lib/chart-png-export-qa.ts` | Dev QA constant validation |

### PDF export rendering

| File | Role |
|------|------|
| `frontend/app/pdf-report.ts` | jsPDF engine, chart SVG→PNG embed, pagination |
| `frontend/lib/pdf-enterprise-style.ts` | Print layout tokens |
| `frontend/lib/build-executive-pdf-input.ts` | Payload assembly from UI state |
| `frontend/lib/metric-value-format.ts` | Axis vs appendix value formatting |

### Backend chart data

| File | Role |
|------|------|
| `backend/main.py` | `build_auto_dashboard`, `compute_visualization_for_question` |
| `backend/services/auto_dashboard_opportunities.py` | Auto-dashboard discovery engine |
| `backend/intent_engine/` | AI question routing, correlation guards |
| `backend/analytics_metadata.py` | Title/metric label builders |

---

## 2. Overview chart rendering path

```
Backend /filtered-dashboard or /upload
  → auto_dashboard[] payload (labels, values, chartType)
  → parseAutoDashboardMiniCharts() [page.tsx]
  → filterOverviewRenderableCharts() [overview-dashboard-chart-renderable.ts]
  → computeOverviewDashboardChartPresentation() [page.tsx — Pipeline B]
  → replaceAutoDashboardCharts() [chart-session-context.tsx]

On screen:
  OverviewDashboardChartSlot
    → useOverviewDashPlotHeight() → 300px (mobile) / 340px (desktop)
    → ResizeObserver → layoutWidthPx
    → OverviewAutoDashboardChartCard
        → buildOverviewDashboardPlot()
            → computeCartesianCategoryPlanForRender(layoutVariant: overview_half)
            → Recharts (inline in page.tsx — NOT ChartRenderer for all kinds)
    → ChartPngOffscreenHost (PNG export only)
```

**Key differences from Pipeline A:**

- Separate kind resolver (`computeOverviewDashboardChartPresentation`).
- Fixed mini-card height, not shared 52vh band.
- `overview_half` axis plan variant — tighter category caps.
- Bar charts may resolve to horizontal presentation via `resolveOverviewEffectivePresentationKind`.

---

## 3. Charts tab rendering path

```
ChartSessionProvider.activeChart
  → computeFinalChartPresentation (frozen on snapshot)
  → sessionRenderedChartKind, sortedChartData, sessionCartesianPlan
  → resolveSharedDetailPlotHeight(pointCount, kind, viewportH)
  → ChartsTabPlotTransition (--charts-tab-plot-h, --insights-viz-plot-h)

DOM:
  chartsTabVizPreviewCard (chart-viz-theme)
    → ChartContextSummary (compactChips)
    → ChartsTabIntelligenceStrip + ChartsTabChartReason
    → chartsTabSessionPlotSurface
        → ChartInsightViewportWrapper sessionMode={true}
            → renderDatasetChart(plotHeight, compact=false, insightMode=false)
                → ChartRenderer
                    pngCaptureMode=false
                    viewportW=sessionChartViewportW (≤860px)
                    sessionCartesianPlanMain=sessionCartesianPlan
```

**Off-screen PNG mirror:**

```
chartCaptureSessionRef (left: -10000px, w 860px)
  → same renderDatasetChart(..., insightMode=false)
  → runChartPngExport → Canvg composite
```

---

## 4. AI Insights rendering path

```
POST /ask response
  → pushAIChart → insightSnapshot
  → Gates: insightChartMatchesCurrentQuestion + chartSnapshotMatchesQuestionIntent
  → computeFinalChartPresentation → insightRenderedChartKind
  → insightCartesianPlanMain (planViewportPx from getSharedDetailLayoutMetrics)
  → resolveSharedDetailPlotHeight → insightShellPlotHeight

DOM:
  aiInsightsVizCard
    → AiInsightChartShell (max-w 960px)
        → ChartInsightViewportWrapper (max-w 760/850/900 by kind)
            → aiInsightsVizPlotSurface
                → renderDatasetChart(insightShellPlotHeight, false, insightMode=true)
                    → ChartRenderer
                        insightMode=true → detailLayout=true
                        viewportW=planViewportPx (fixed, not live DOM)
                        insightCartesianPlanMain
```

**Off-screen PDF mirror:**

```
chartCaptureInsightRef (left: -10000px, w 860px)
  → renderDatasetChart(..., insightMode=true)
  → PDF capture via pdf-report.ts
```

---

## 5. PNG export rendering path

### Charts tab / session

```
downloadChartPng()
  → chartCaptureSessionRef DOM
  → ChartRenderer (insightMode=false, pngCaptureMode may activate in export root)
  → prepareChartForPngCapture + applyPngExportSvgPolish
  → Canvg renders SVG at buildPresentationExportSpec dimensions
  → Canvas 2D draws: card border, kicker, title, chips, plot, footer
  → download trigger
```

### Overview mini card

```
Overview PNG button
  → ChartPngOffscreenHost portal
  → buildOverviewDashboardPlot (Pipeline B)
  → runChartPngExport + validateOverviewDashboardExportParity
```

### Kind-specific PNG layout (`chart-png-export-layout.ts`)

| Kind | Notes |
|------|-------|
| `bar_horizontal` | Taller canvas; category-count scaling |
| `donut` / `pie` | Radial radii from `radial-export-layout.ts`; legend row height |
| `line` / `area` | Standard cartesian export width |
| `scatter` | Square-ish plot band |
| `bar` / `histogram` | Category-count height adjustment |

---

## 6. PDF export rendering path

```
runExecutivePdfExport(ExecutivePdfExportInput)
  → buildPdfExportTheme() — always light/print
  → Section loop (cover, KPIs, insight, viz, preview, appendix)
  → Visualization section:
      captureEl = chartCaptureInsightRef OR chartCaptureSessionRef
      renderChartSvgToPng (Canvg) OR html2canvas fallback
      computePdfChartEmbedDimensions — proportional scale, aspect clamp
      embed PNG centered in content area
  → pdfDrawEnterpriseRunningChrome on every page
```

**Insight PDF:** Uses insight capture ref + `insightMode=true` layout (760/850/900 plan widths).  
**Export tab session chart:** Uses session capture ref + `insightMode=false`.

---

## 7. Chart kind rendering paths in ChartRenderer

All kinds flow through `ChartRenderer` except Overview mini cards (partial inline Recharts in `buildOverviewDashboardPlot`).

### Decision tree (order matters)

```
ChartRenderer entry
  ├─ stacked multi-metric bar? → BarChart (stacked branch)
  ├─ rKind === "scatter"       → ScatterChart (numeric X/Y, no category plan)
  ├─ rKind === "pie"|"donut"   → PieChart (radial margins, legend)
  ├─ rKind === "bar_horizontal"→ BarChart layout="vertical" (category on Y)
  ├─ rKind === "line"|"area"   → LineChart / AreaChart (trend X-axis path)
  └─ default bar/histogram     → BarChart vertical (category plan, angled ticks)
```

### H-Bar (`bar_horizontal`)

| Aspect | Path |
|--------|------|
| Layout engine | `computeHorizontalBarAxisLayout` |
| Recharts | `BarChart layout="vertical"` — categories on Y |
| Ticks | `WrappedCategoryYAxisTick` for long labels |
| Margins | H-bar specific left/right balance |
| Height | Category-scaled: `basePx 420 + slotPx 24 × n`, cap 580 |
| Plan viewport | **900px** max inner width |
| Grid | Full cartesian grid |
| PNG/PDF | Dedicated export height scaling; stays horizontal |

### Donut / Pie (`donut`, `pie`)

| Aspect | Path |
|--------|------|
| Layout engine | `resolveRadialChartRadii`, `computePieChartMargins` |
| Recharts | `PieChart` + `Pie` (innerRadius for donut) |
| Margins | `radialChartOuterMargins` (on-screen) / `radialChartExportOuterMargins` (PNG) |
| Height | Shared vh band minus ~20px |
| Plan viewport | **760px** (bar-family default) |
| Legend | Bottom legend with truncated labels |
| Tooltip | `formatRadialTooltipValue` (share %) |

### Line / Area (`line`, `area`)

| Aspect | Path |
|--------|------|
| Layout engine | `chart-time-x-axis.ts` — temporal tick strings, angled X (-30°) |
| Recharts | `LineChart` or `AreaChart`, `type="monotone"` |
| Margins | `verticalCartesianOuterMargins` with line/area bottom trim |
| Bottom margin | `computeLineAreaChartBottomMargin` × 0.86 (detail) or 0.94 |
| Height | Fixed **vh band** (460–560px) — not category-scaled |
| Plan viewport | **850px** max inner width |
| Grid | Horizontal only (`vertical={false}`) |
| Markers | Dots hidden when >45 points |
| X interval | `computeLineAreaXAxisInterval` — density-aware |

### Scatter (`scatter`)

| Aspect | Path |
|--------|------|
| Layout engine | Minimal — numeric axes, no category plan |
| Recharts | `ScatterChart` + `Scatter` |
| Margins | Fixed bottom ~42–56px for X axis title |
| Height | Shared vh band (same as line/area) |
| Plan viewport | **760px** |
| Axes | X=`x` numeric, Y=`value` numeric |
| Tooltip | Custom `x · y` formatter |

### Vertical bar / histogram (`bar`, `histogram`)

| Aspect | Path |
|--------|------|
| Layout engine | `computeCartesianCategoryPlanForRender` |
| Recharts | `BarChart` vertical |
| Margins | `verticalCartesianOuterMargins` — kind-specific top/bottom trim |
| Height | vh band + up to 48px extra for many categories |
| Plan viewport | **760px** |
| Dense categories | Angled ticks (-30°), interval thinning, `maxBarSize` cap |
| Histogram | `barCategoryGap: 2`, rounded bar tops |

---

## 8. `insightMode` vs session mode comparison

| Setting | Charts tab | AI Insights | PDF insight capture |
|---------|------------|-------------|---------------------|
| `insightMode` | `false` | `true` | `true` |
| `detailViewLayout` | `false` | `true` (via insightMode) | `true` |
| Viewport width source | Live DOM ≤860px | Fixed plan 760/850/900 | Fixed 860px container |
| Cartesian plan | `sessionCartesianPlan` | `insightCartesianPlanMain` | Same as Insights |
| Margin preset | Standard | `insightUi: true` trim | Same as Insights |
| Viewport wrapper | `sessionMode=true` | Kind max-width classes | Insight layout |

---

## 9. Shared height system (Charts + Insights)

**Source:** `frontend/lib/shared-chart-layout.ts`

```
SHARED_DETAIL_PLOT_BAND:
  clamp(460px, 52vh, 560px)
  desktop floor 480, ceiling 540

CSS (globals.css):
  .ai-insights-viz-plot height: var(--insights-viz-plot-h, clamp(460px, 52vh, 560px))

Exception — H-Bar:
  resolveSharedDetailPlotHeight adds per-category slots above band floor
```

Charts tab sets `--charts-tab-plot-h` and `--insights-viz-plot-h` via `ChartsTabPlotTransition`.

---

*Snapshot generated: 2026-06-16 — branch `chart-ui-polish-baseline` @ `4247ef3`.*
