# Chart Rendering Summary

**Snapshot:** June 20, 2026 — post Chart Premium Parity phase  

---

## Architecture Overview

Two rendering pipelines coexist by design:

| Pipeline | Owner | Surfaces |
|----------|-------|----------|
| **Overview inline** | `buildOverviewDashboardPlot()` in `page.tsx` | Overview live, Overview PNG |
| **Shared session renderer** | `ChartRenderer` in `chart-renderer.tsx` | Charts live/PNG, AI Insights, PDF capture |

Shared logic lives in `lib/chart-axis-layout.ts`, `lib/shared-chart-layout.ts`, `lib/overview-dashboard-plot-layout.ts`, `lib/overview-premium-axis-domain.ts`, and `lib/chart-layout-config.ts`.

---

## Global Helper Reference

| Helper category | Primary files | Role |
|---------------|---------------|------|
| **Domain (Y/X scale)** | `overview-premium-axis-domain.ts`, `overview-bar-value-domain.ts` | Rounded ticks, pad ratios, scatter occupancy |
| **Margins (Recharts)** | `chart-axis-layout.ts`, `chart-layout-config.ts`, `overview-dashboard-plot-layout.ts`, `shared-chart-layout.ts` | Axis width estimation, outer margins, H-Bar parity model |
| **Plot height** | `shared-chart-layout.ts`, `overview-dashboard-plot-layout.ts`, `chart-png-export-layout.ts` | Live boosts, session floors, capture heights |
| **Category axis** | `chart-axis-layout.ts`, `chart-time-x-axis.ts`, `overview-dashboard-plot-layout.ts` | Angled ticks, bottom margin, horizontal-bar fallback |
| **Export / capture** | `chart-capture-controller.ts`, `chart-png-capture.ts`, `chart-png-export-layout.ts`, `chart-presentation-profile.ts` | Profiles, readiness, PNG artifact, PDF embed policy |
| **Presentation contract** | `chart-presentation-contract.ts`, `build-chart-contract.ts`, `axis-presentation-plan.ts` | Metadata chips, axis plans for export |

---

## Per-Chart Surface Matrix

Legend: **Inline** = `buildOverviewDashboardPlot`; **CR** = `ChartRenderer`; **Capture** = offscreen host + `captureChartPngArtifact`.

---

### H-Bar (`bar_horizontal`)

| Surface | Path | Domain | Margins | Plot height |
|---------|------|--------|---------|-------------|
| **Overview Live** | Inline `BarChart layout="vertical"` | `resolveOverviewBarValueDomain` | `computeOverviewHorizontalDashLayout` + `balanceHorizontalOuterMargins`; `computeOverviewHBarLiveMargins` | `resolveOverviewDashLivePlotHeight` (+36px boost) |
| **Overview PNG** | Inline, `pngCapture=true` | Same domain | Export margins via `computeOverviewHorizontalDashLayout({ pngCapture })` | Base capture height from profile |
| **Charts Live** | CR H-Bar branch | `resolveHBarValueAxisProps` / axis plan | `computeHorizontalBarAxisLayout`; `balanceHorizontalOuterMargins`; `margin.left` ~14 | `resolveSharedDetailPlotHeight` |
| **Charts PNG** | CR + `detailViewLayout` + `pngCaptureMode` | Same | Same + `exportAxisPresentationPlan` | Profile `"chartsPng"` spec |
| **AI Insights** | CR via `renderDatasetChart(insightMode=true)` | Same | Same (insight detail layout) | `insightShellPlotHeight` |
| **PDF** | Hidden CR, `detailViewLayout`, `pngCaptureMode`, 860px | Same | Same | Profile `"pdfChart"`; embed `maxHeightMm: 158` |

**Shared helpers:** `computeHorizontalBarAxisLayout`, `wrapCategoryLabelLines`, `resolveHBarValueAxisProps`, `overviewBarValueDomain`.

---

### V-Bar (`bar`)

| Surface | Path | Domain | Margins | Plot height |
|---------|------|--------|---------|-------------|
| **Overview Live** | Inline vertical `BarChart` | `overviewBarValueDomain` | `computeOverviewVBarLiveOuterMargins` — outer left 10px; `YAxis.width` owns ticks | +36px boost |
| **Overview PNG** | Inline, `pngCapture=true` | Same | PNG vertical dash layout | Capture spec |
| **Charts Live** | CR default vertical bar | `resolveVerticalBarValueAxisProps` or default ticks | `verticalCartesianOuterMargins` + `sessionDetailVerticalOuterMargins` when detail | Session floor 520px for ≤6 categories |
| **Charts PNG** | CR offscreen + `detailViewLayout` | Same | Same | `"chartsPng"` profile |
| **AI Insights** | CR insight path | Same | Same | Insight shell height |
| **PDF** | Hidden CR capture | Same | Content-tight composite | embed `maxHeightMm: 158`, `minWidthRatio: 0.88` |

**Shared helpers:** `computeOverviewVBarLiveVerticalDashLayout`, `resolveVerticalBarPlotBottomPad`, `SHARED_CHART_LAYOUT.verticalBar`.

---

### Line (`line`)

| Surface | Path | Domain | Margins | Plot height |
|---------|------|--------|---------|-------------|
| **Overview Live** | Inline `LineChart` | `resolveTrendValueAxisProps({ surface: "overview" })` — 5% pad | `computeOverviewContinuousLiveOuterMargins`; `computeOverviewTrendLivePlotMargins` | +36px boost |
| **Overview PNG** | Inline, `pngCapture=true` | Same overview surface | PNG continuous dash layout | Capture spec (no live boost) |
| **Charts Live** | CR line branch | `resolveTrendValueAxisProps({ surface: "session" })` — 5% pad | `sessionTrendDetailPlotMargins` → `sessionDetailVerticalOuterMargins` | Session continuous floor 560px |
| **Charts PNG** | CR + `detailViewLayout` + `pngCaptureMode` | Same session surface | Same | `"chartsPng"` |
| **AI Insights** | CR `insightMode=true` | Same session surface | Same | Insight plot height |
| **PDF** | Hidden CR capture | Same | Same | embed `maxHeightMm: 158`, `minWidthRatio: 0.9` |

**Shared helpers:** `computeOverviewContinuousVerticalDashLayout`, `sessionLineAreaDetailXAxisHeightPx`, `formatOverviewLineYAxisTick`, `chart-time-x-axis` trend formatters.

---

### Area (`area`)

| Surface | Path | Domain | Margins | Plot height |
|---------|------|--------|---------|-------------|
| **Overview Live** | Inline `AreaChart` | `surface: "overview"`, 5% pad | Same continuous live margins as line | +36px boost; `fillOpacity: 0.26` |
| **Overview PNG** | Inline capture | Same domain | PNG margins | `fillOpacity: 0.18` |
| **Charts Live** | CR area branch | `surface: "session"`, area 5%/8% pad | `sessionTrendDetailPlotMargins` | Session floor |
| **Charts PNG** | CR offscreen | Same | Same | Profile capture |
| **AI Insights** | CR insight | Same | Same | Insight shell |
| **PDF** | Hidden CR | Same | Same | Same embed as line |

---

### Scatter (`scatter`)

| Surface | Path | Domain | Margins | Plot height |
|---------|------|--------|---------|-------------|
| **Overview Live** | Inline `ScatterChart` (primary); CR fallback | `resolveScatterValueAxisProps` / `resolveOverviewScatterPremiumAxes` — 74% occupancy target | `computeOverviewScatterLivePlotMargins` | +36px boost |
| **Overview PNG** | Inline, `computeOverviewScatterDashMargins` | Same resolver | Balanced PNG margins | Capture spec |
| **Charts Live** | CR scatter branch | `resolveScatterValueAxisProps` | `sessionDetailVerticalOuterMargins`; premium point styling constants | Session floor |
| **Charts PNG** | CR offscreen | Same | Same | Profile |
| **AI Insights** | CR insight scatter | Same | Same | Insight shell |
| **PDF** | Hidden CR; content-tight composite | Same | Same | embed `maxHeightMm: 150`, `minWidthRatio: 0.92` |

**Shared helpers:** `resolveOverviewScatterPremiumAxisScale`, `formatOverviewScatterAxisTick`, `OVERVIEW_SCATTER_POINT_RADIUS_PX` (3.5).

---

### Donut / Pie (`donut`, `pie`)

| Surface | Path | Domain | Margins | Plot height |
|---------|------|--------|---------|-------------|
| **Overview Live** | CR with `overviewMiniRadial` + `compact` | Slice values from rows | `scaleOverviewMiniRadialRadii`, `tightenOverviewMiniRadialMargins`, `radialChartOuterMargins` | Mini card band |
| **Overview PNG** | CR in offscreen host (`buildOverviewDashboardPlot` delegates) | Same | `radialChartExportOuterMargins` when capturing | Capture spec |
| **Charts Live** | CR radial branch (`PieChart` / `Pie` / `Cell`) | Percent / value from rows | `computePieChartMargins` | Detail plot height |
| **Charts PNG** | CR offscreen | Same | Export radial margins | Profile |
| **AI Insights** | CR insight radial | Same | Same | Insight shell |
| **PDF** | Hidden CR | Same | Same | embed `maxHeightMm: 108`, radial aspect clamps |

**Note:** Radial charts do not use cartesian margin model; parity work focused on cartesian kinds.

---

### Histogram (`histogram`)

| Status | **Implemented** as styled vertical bar — not a separate Recharts type |

| Surface | Path | Styling | Notes |
|---------|------|---------|-------|
| **Overview Live** | Inline vertical `BarChart`, `displayKind === "histogram"` | `barCategoryGap: 2`, flat top radius `[3,3,0,0]` | Shares V-Bar layout helpers |
| **Overview PNG** | Inline capture | Same | `"overviewPng"` profile |
| **Charts Live** | CR, `isHistogram = rKind === "histogram"` | Wider `maxBarSize`, `barCategoryGap: 2` | `histogramStyle` flag in smart chart intel |
| **Charts PNG** | CR offscreen | Same | Default PDF embed policy |
| **AI Insights** | CR | Same | — |
| **PDF** | Hidden CR | Same | — |

**Pending:** Dedicated histogram premium review (see [`open-items.md`](./open-items.md)).

---

## Presentation Profiles (export surfaces)

| Profile ID | Surface | Capture width | Axis policy prefix |
|------------|---------|---------------|-------------------|
| `overviewLive` | Overview card | null (in-card) | `overview-inline:*` |
| `overviewPng` | Overview PNG | From `buildPresentationExportSpec` | `overview-inline:*` |
| `chartsLive` | Charts tab | null | `chart-renderer:*` |
| `chartsPng` | Charts PNG | 860px | `chart-renderer:*` |
| `aiInsightsLive` | AI Insights | null | `chart-renderer:*` |
| `pdfChart` | PDF embed | 860px | `chart-renderer:*` |

Built by `buildChartPresentationProfile()` in `chart-presentation-profile.ts`.

---

## Export Helper Chain

```
User action (PNG button / PDF download)
  → createChartPngCaptureRequest({ profile, contract, kind })
  → ChartCaptureHost mounts offscreen DOM
  → buildOverviewDashboardPlot(pngCapture) OR ChartRenderer(pngCaptureMode)
  → waitForBasicChartCaptureReady()
  → captureElementToPng() → ChartArtifact
  → downloadChartArtifact() OR buildExecutivePdfExportInput() → runExecutivePdfExport()
```

Key files: `chart-capture-controller.ts`, `chart-capture-readiness.ts`, `chart-png-capture.ts`, `build-executive-pdf-input.ts`, `pdf-report.ts`.
