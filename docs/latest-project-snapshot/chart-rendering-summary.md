# Chart Rendering Summary

**Snapshot date:** June 21, 2026  
**Scope:** End-to-end chart rendering from backend aggregation through live UI and export artifacts.

---

## Pipeline Overview

```
Backend pandas aggregation
        ↓
API chart_type string (bar, horizontalBar, histogram, line, …)
        ↓
Frontend kind resolution (final-chart-presentation + normalize-visualization-contract)
        ↓
Frozen VisualizationContract + ChartPresentationContract (session snapshot)
        ↓
Surface-specific renderer + layout helpers
        ↓
Optional: ChartArtifact capture (PNG / PDF)
```

| Surface | Renderer | Layout source | Export profile |
|---------|----------|---------------|----------------|
| Overview mini (live) | Inline Recharts in `page.tsx` | `overview-dashboard-plot-layout.ts` | — |
| Overview PNG | Inline + `ChartRenderer` for pie/donut | `overview-dashboard-export.ts` | `overviewPng` |
| Charts tab (live) | `ChartRenderer` (`detailViewLayout`) | `shared-chart-layout.ts` | — |
| Charts PNG | `ChartRenderer` (`pngCaptureMode`) | `chart-png-export-layout.ts` | `chartsPng` |
| AI Insights (live) | `ChartRenderer` (`insightMode`) | Same as Charts | — |
| PDF chart | Same capture tree as Insights | `pdfChart` profile | `pdfChart` |

---

## 1. Backend Chart Generation

**Primary file:** `backend/main.py`

Chart rows are **deterministic** (pandas). Key routing:

- Histogram: `_question_asks_numeric_distribution_histogram()`
- Share/composition pie/donut: `question_asks_categorical_share_composition()` + dimension inference in `main.py`
- Executive ambiguous intent: `executive_ambiguous_intent.py` (guards for share questions)

**Tests:** `test_histogram_intent_routing.py`, `test_donut_pie_share_routing.py`

---

## 2. Kind Resolution (frontend)

**Files:** `final-chart-presentation.ts`, `normalize-visualization-contract.ts`, `selected-visualization.ts`

- **`resolveBarFamilyKind()`** — canonical H-Bar vs V-Bar across all surfaces.
- **`computeAutoDashboardChartPresentation()`** — Overview display kind.
- **`shareCompositionAllowed()`** — radial eligibility from title/question phrasing.

Session snapshots store **`displayKind`** (canonical presentation kind).

---

## 3. Radial Sizing Architecture

**Primary files:** `radial-export-layout.ts`, `overview-mini-radial-polish.ts`, `chart-renderer.tsx`, `chart-png-capture.ts`

### 3.1 Live session detail (Charts / AI Insights)

Function: `resolveProportionalSessionRadialRadii()` when `compact=false`, `pngCaptureMode=false`.

| Constant | Value |
|----------|-------|
| `SESSION_RADIAL_PLOT_BAND_DIAMETER_RATIO` | 0.70 (~65–75% occupancy) |
| `SESSION_RADIAL_OUTER_RADIUS_USABLE_RATIO` | 0.40 |
| `SESSION_DETAIL_RADIAL_CY` | `"48%"` |
| `SESSION_RADIAL_LEGEND_FONT_PX` | 12 |
| `SESSION_RADIAL_LEGEND_ICON_PX` | 9 |

Legend renders **inside** Recharts `<Legend>`.

### 3.2 Overview live compact (pie/donut only)

Path: `ChartRenderer` with `overviewMiniRadial=true`, `compact=true`, `pngCaptureMode=false`.

| Constant | Value |
|----------|-------|
| `RADIAL_COMPACT_OUTER_PX` | 84 |
| `RADIAL_COMPACT_INNER_DONUT_PX` | 52 |
| `OVERVIEW_MINI_RADIAL_SIZE_SCALE` | 1.24 |
| `OVERVIEW_MINI_RADIAL_LEGEND_PADDING_TOP_PX` | 2 |

After base radii: `scaleOverviewMiniRadialRadii()` + `tightenOverviewMiniRadialMargins()` + `cy → 48%`.

Plot band height: 300px mobile / 340px desktop (`useOverviewDashPlotHeight()`).

### 3.3 Export (Overview PNG, Charts PNG, PDF artifact)

Function: `resolveProportionalExportRadialRadii()` when `pngCaptureMode=true` (both compact and session detail).

| Constant | Value |
|----------|-------|
| `RADIAL_EXPORT_PLOT_BAND_DIAMETER_RATIO` | **0.63** (~62–65% occupancy) |
| `RADIAL_EXPORT_OUTER_RADIUS_USABLE_RATIO` | **0.36** |
| `RADIAL_EXPORT_PLOT_WIDTH_UTIL` | **0.86** (composite plot scale; non-radial 0.97) |
| `RADIAL_EXPORT_MIN_SVG_PAD_PX` | 20 |
| `resolveRadialExportPlotHeight()` base | 400px (+12–24px for >4 / >6 categories) |

**Composite legend** (external to SVG):

| Constant | Value |
|----------|-------|
| `RADIAL_EXPORT_LEGEND_FONT_PX` | 24 |
| `RADIAL_EXPORT_LEGEND_ICON_PX` | 17 |
| `RADIAL_EXPORT_LEGEND_ITEM_GAP_PX` | 10 |
| `RADIAL_EXPORT_LEGEND_SWATCH_GAP_PX` | 10 |
| `RADIAL_EXPORT_LEGEND_ROW_EXTRA_PX` | 14 |
| `RADIAL_EXPORT_LEGEND_PLOT_GAP_PX` | 10 |

**Composite footer** (radial exports only):

| Constant | Value |
|----------|-------|
| `RADIAL_EXPORT_FOOTER_FONT_PX` | 22 |
| `RADIAL_EXPORT_FOOTER_RESERVE_PX` | 46 |

Non-radial footer remains `EXPORT_FOOTER_FONT_PX = 15` in `chart-png-capture.ts`.

### 3.4 Radial export flow

```
ChartRenderer (pngCaptureMode, legend in SVG during capture)
  → renderPlotSvgToPng() strips .recharts-legend-wrapper from SVG clone
  → extractRechartsLegendEntries() reads DOM legend text/colors
  → renderLegendChromeToPng() draws legend at RADIAL_EXPORT_* token sizes
  → compositeExportPng(radialExport=true)
       plot scaled with RADIAL_EXPORT_PLOT_WIDTH_UTIL
       legend + footer at fixed px sizes
```

Canvas height budget: `resolveRadialExportCanvasHeight()` includes legend estimate + footer reserve.

### 3.5 Share display and warnings

- **Tooltip/share formatting:** `radial-chart-format.ts` (`radialShareDisplayAllowed`, `formatRadialTooltipValue`)
- **Rate warning suppression:** `resolveRateExceeds100Warning()` suppresses misleading rate>100% note on valid composition donuts

---

## 4. Cartesian Chart Parity (summary)

### H-Bar

- Kind: `resolveBarFamilyKind()` — no Overview layout flip to H-Bar via fallback.
- Overview live: `OVERVIEW_HBAR_PLOT_HEIGHT_BOOST_PX = 36`, horizontal plot band helpers in `overview-dashboard-plot-layout.ts`.

### V-Bar / Histogram

- Shared value axis: `resolveVerticalBarValueAxisProps()` + `overview-bar-value-domain.ts`
- Overview live: `OVERVIEW_VBAR_LIVE_PLOT_HEIGHT_BOOST_PX = 36`, `maxBarSize` 52 (export constants in `overview-dashboard-export.ts`)

### Line / Area

- Domain parity: `overview-premium-axis-domain.ts`
- Overview live boost: `OVERVIEW_TREND_PLOT_HEIGHT_BOOST_PX = 36`

### Scatter

- Presentation guards: `relationship-scatter-presentation.ts`
- Overview: `OVERVIEW_SCATTER_PLOT_HEIGHT_BOOST_PX = 36`, point radius 3.5px
- PDF: content-tight composite via `pdfChartUsesContentTightComposite()`

---

## 5. PNG Export

**Files:** `chart-capture-controller.ts`, `chart-png-capture.ts`, `chart-png-export-layout.ts`

### Canvas sizing (`chart-png-export-layout.ts`)

| Kind | Canvas width (typical) |
|------|------------------------|
| Bar / histogram / default | 1400px |
| Line / area / scatter | 1200px |
| H-Bar | 1100–1300px |
| Donut / pie | `resolveRadialExportCanvasHeight(categoryCount)` |

Charts PNG kind: `resolveChartsPngExportKind()` uses session `chartKind` for bar family.

---

## 6. PDF Rendering

**Files:** `pdf-report.ts`, `build-executive-pdf-input.ts`, `chart-presentation-profile.ts`

### Chart image priority

1. Valid `ChartArtifact` from `pdfChart` capture (same radial pipeline as PNG).
2. Legacy DOM fallback (`captureChartPlotToPng`).

### PDF embed policies (`resolvePdfChartEmbedPolicy`)

| Kind | maxHeightMm | minWidthRatio |
|------|-------------|---------------|
| H-Bar | 158 | 0.74 |
| V-Bar / histogram | 158 | 0.88 |
| Line / Area | 158 | 0.90 |
| Scatter | 150 | 0.92 |
| Donut / Pie | 108 | 0.58 |

---

## 7. AI Insights Gates

Before viz, AI Read, or export:

- `insightChartMatchesCurrentQuestion`
- `chartSnapshotMatchesQuestionIntent`
- Export button: `showInsightExportButton`

---

## Completed vs Remaining (chart rendering)

| Completed | Remaining |
|-----------|-----------|
| H-Bar / V-Bar / histogram / line / area / scatter parity passes | Overview inline vs ChartRenderer dual pipeline |
| Histogram + donut routing | H-Bar tick fine-tuning if drift reported |
| Radial export proportional balance + legend readability | Browser E2E export tests |
| Rate-warning suppression for share donuts | Vector PDF charts |
| ChartArtifact platform across PNG/PDF | Full AxisPresentationPlan enforcement on all surfaces |
