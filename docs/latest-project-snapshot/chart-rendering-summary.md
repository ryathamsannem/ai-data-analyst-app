# Chart Rendering Summary

**Current behavior only** — June 16, 2026 (post plot-v4 + cleanup)

---

## Pipeline overview

| Surface | Renderer | Layout source | Shell |
|---------|----------|---------------|-------|
| Overview mini | Inline in `page.tsx` | `overview-dashboard-plot-layout.ts` | Overview card grid |
| Charts tab | `ChartRenderer` (`detailLayout`) | `shared-chart-layout.ts` | 960px frame, kind viewport |
| AI Insights | `ChartRenderer` (`insightMode`) | Same as Charts | `AiInsightChartShell` |
| PDF/PNG capture | Same renderer + export specs | `chart-png-export-layout.ts` | Centered capture width |

---

## Session detail dimensions (desktop, comfortable viewport)

Measured target at ~900px inner height:

| Kind | Frame max | Inner plot host | ResponsiveContainer height |
|------|-----------|-----------------|----------------------------|
| **Line / Area** | 960px | 850px (`max-w-[850px]`) | **580px** (floor 560) |
| **Scatter** | 960px | 760px | **580px** |
| **H-Bar** | 960px | 900px | **540px** (category-scaled, cap 580) |
| **Donut / Pie** | 960px | 760px | **~520px** (band − 20) |
| **Bar / Histogram** | 960px | 760px | vh band + category extra |

Shell widths are **unchanged** from stable baseline — no narrow viewport experiments.

---

## Kind-specific behavior

### Horizontal bar (reference premium)

- Category-scaled height: `420 + n×24px`, capped at 580
- `computeHorizontalBarAxisLayout` + wrapped Y ticks
- Unchanged by plot-v4 polish

### Line / Area (Charts + AI Insights detail)

- **Y-axis:** `resolveSessionPremiumTrendAxisScale` — 5% pad, rounded ticks (e.g. 600K–850K, not 0-based)
- **Margins:** `sessionTrendDetailPlotMargins` — top 2px, bottom ≤30px, X-band 44px
- **Line styling:** 3px stroke, r=5 markers, grid opacity 0.32
- **Plot height:** `SESSION_DETAIL_CONTINUOUS_PLOT_FLOOR_PX` (560) + boost, cap 580

### Scatter (Charts + AI Insights detail)

- **Axes:** `resolveSessionScatterPremiumAxes` — rounded X/Y domains (~65–75% occupancy)
- **Points:** r=3, subtle stroke (Overview scatter constants)
- **Margins:** premium scatter margins, top 2 / bottom 20 in detail mode
- **Plot height:** same 580px continuous allocation as line

### Donut / Pie

- `radialChartOuterMargins` + `resolveRadialChartRadii`
- Share tooltips via `formatRadialTooltipValue`
- No plot-v4 changes

### Overview mini cards

- Base plot: 300px mobile / 340px desktop
- Continuous kinds: `OVERVIEW_TREND_PLOT_HEIGHT_BOOST_PX` (+36), scatter +32, H-Bar +36
- Premium Y-axis for line via `resolveOverviewPremiumAxisScale` (12% pad)
- Line live: 3px stroke, r=5 markers (`OVERVIEW_LINE_LIVE_*`)

---

## Important constants

### `shared-chart-layout.ts`

```text
SHARED_CHART_LAYOUT.chartFrame.maxWidthPx     = 960
SESSION_DETAIL_CONTINUOUS_PLOT_BOOST_PX       = 40
SESSION_DETAIL_CONTINUOUS_PLOT_FLOOR_PX       = 560
SHARED_DETAIL_PLOT_BAND                       = clamp(460px, 52vh, 560px) desktop 480–540
```

### `chart-layout-config.ts` — viewport classes

```text
H-Bar:  max-w-[900px]
Line:   max-w-[850px]
Other:  max-w-[760px]
```

### `overview-premium-axis-domain.ts` — session detail

```text
SESSION_DETAIL_TREND_PREMIUM_PAD_RATIO        = 0.05
SESSION_DETAIL_TREND_MARGIN_TOP_PX            = 2
SESSION_DETAIL_TREND_MARGIN_BOTTOM_CAP_PX     = 30
sessionLineAreaDetailXAxisHeightPx()          = 44
OVERVIEW_LINE_LIVE_STROKE_WIDTH_PX            = 3
OVERVIEW_LINE_LIVE_MARKER_R_PX                = 5
```

---

## Alignment gates (AI Insights only)

- `insightChartMatchesCurrentQuestion` — question/turn/title match
- `chartSnapshotMatchesQuestionIntent` — blocks misleading viz (e.g. outlier → department bar)
- `showInsightExportButton` — export only when answer + viz aligned

Charts tab: SmartChartInsightPanel always on when intel active (no question gate).

---

## What not to change without explicit approval

- H-Bar / Donut renderer branches
- Shell max-width classes (`960` / `850` / `900` / `760`)
- Chart kind semantics across tabs
- Overview mini-card pipeline (separate from session detail)
