# Auto Dashboard — Status & Technical Reference

**Generated:** June 8, 2026  
**Audience:** New Cursor chat, external architecture review

---

## Overview

The Auto Dashboard is a **deterministic, non-LLM** analytics surface on the Overview tab. It generates KPI cards and 3–8 mini charts from the uploaded dataset (or filtered slice) using pandas aggregation and a diversity-aware selection engine.

---

## Current auto-dashboard generation flow

```
POST /upload  or  POST /filtered-dashboard
  │
  ├─ apply_dashboard_filters_to_df()     # filtered-dashboard only
  │
  ├─ build_auto_dashboard()              # main.py
  │     ├─ infer_auto_dashboard_kind()   # sales | hr | operations | generic
  │     ├─ Domain KPI cards              # calculate_kpis() + domain templates
  │     └─ build_auto_dashboard_charts()
  │           ├─ Seed charts (domain-specific helpers, optional)
  │           └─ build_dashboard_charts_from_opportunities()  # auto_dashboard_opportunities.py
  │
  └─ JSON: { kind, type_label, cards[], charts[] }
        │
        ▼
Frontend parseAutoDashboardPayload() / parseAutoDashboardMiniCharts()
        │
        ├─ filterOverviewRenderableCharts()   # drop charts with no finite values
        ├─ ChartSession.replaceAutoDashboardCharts()
        └─ Overview grid → OverviewDashboardChartSlot → OverviewAutoDashboardChartCard
```

### Filter refresh

- Overview filters trigger `POST /filtered-dashboard`
- Same `build_auto_dashboard()` runs on filtered `df`
- Frontend replaces KPI cards and chart list; grid re-layouts from visible chart count

---

## Chart selection algorithm

**Module:** `backend/services/auto_dashboard_opportunities.py`

### Step 1 — Column inventory (`classify_columns`)

Classifies columns into:
- `dates`, `numerics`, `categories`, `geographic`, `percentages`
- Uses profile `column_types`, cardinality, ID-like detection, geo keywords

### Step 2 — Target count (`target_chart_count`)

| Richness / rows | Charts |
|-----------------|--------|
| richness ≥ 14 or rows ≥ 450 | 8 |
| richness ≥ 9 or rows ≥ 180 | 6 |
| richness ≥ 5 | 4 |
| else | 3 |

### Step 3 — Opportunity discovery (`discover_chart_opportunities`)

Generates scored candidates (no LLM):

| Bucket | Chart types | Logic summary |
|--------|-------------|---------------|
| **A. Trend** | `line`, `area` | Adaptive time bucket on date × numeric (up to 3 metrics, 2 date cols) |
| **B. Ranking** | `horizontalBar` | Top N by metric per breakdown dimension (cardinality 3–20) |
| **C. Composition** | `donut`, `pie` | Part-to-whole; cardinality 2–8; max 8 slices |
| **D. Correlation** | `scatter` | Numeric pairs with \|r\| ≥ 0.28, ≥ 12 rows; max 2 pairs |
| **E. Compare** | `bar`, `horizontalBar` | Dimension × metric; h-bar when > 6 categories |
| **F. Distribution** | `donut`, `pie` | Record counts by low-cardinality category |

Candidates carry internal metadata: `_opportunityType`, `_opportunityScore` (stripped before API response).

### Step 4 — Merge with seeds

Domain seed charts from `main.py` (`_dash_sales_dashboard_charts`, etc.) merged deduped by title.

### Step 5 — Diversity selection (`select_diverse_charts`)

**Phase 1 — Coverage buckets** (executive BI story order):
`trend` → `ranking` → `composition` → `distribution` → `relationship` → `geographic` → `compare`

**Phase 2 — Fill remaining slots** by highest score.

**Scoring factors:**
- Primary/secondary metric match (+14 / +8)
- Unused chart type (+12)
- Unused metric×dimension pair (+8)
- Unfilled coverage bucket (+22)
- Dimension reuse penalty (−24 per reuse; reject at ≥2)
- KPI redundancy penalty (−55) — avoids duplicating "Top X" KPI facts
- Donut cap: max **2** composition/distribution donuts (`MAX_DONUT_CHARTS`)
- Metric usage cap: max **2** charts per metric key

**KPI deduplication:** `extract_kpi_chart_context` + `_chart_redundant_with_kpi` suppresses breakdown charts that repeat KPI card facts.

---

## Supported chart types

### Backend API `chartType` values

| API type | Frontend kind | Overview rendering |
|----------|---------------|-------------------|
| `bar` | `bar` or `bar_horizontal` | Vertical or horizontal via `computeOverviewDashboardChartPresentation` |
| `horizontalBar` | `bar_horizontal` | Always horizontal |
| `line` | `line` or `bar_horizontal` | Time series if readable; else h-bar fallback |
| `area` | `area` or `bar_horizontal` | Same as line |
| `pie` | `pie` | `ChartRenderer` radial |
| `donut` | `donut` | `ChartRenderer` radial |
| `scatter` | `scatter` | `ChartRenderer` scatter |
| `histogram` | `histogram` | Vertical bar (rare in auto-dashboard) |

### Overview presentation rules (`computeOverviewDashboardChartPresentation`)

- Separate from Charts tab / AI / PDF pipeline (`computeFinalChartPresentation`)
- Prefers horizontal bars for long labels, many categories, non-time-series line/area
- Vertical bar only when ≤4 categories and short labels

---

## KPI generation flow

**Entry:** `build_auto_dashboard()` in `main.py`

1. `infer_auto_dashboard_kind()` — keyword/heuristic domain detection
2. `calculate_kpis()` — mapped columns + profile stats
3. Domain-specific card builders (sales, HR, operations, generic)
4. `clamp_cards()` — dedupe titles, pad to 3–6 cards with generic fallbacks ("Records in view", etc.)

KPI cards passed into `build_auto_dashboard_charts(..., kpi_cards=)` for chart deduplication.

**Frontend:** `autoDashboardKpiRows` + `OverviewInlineKpiChip` / `OverviewKpiCard` with context lines from `buildAutoDashboardKpiContextLine`.

---

## PNG export flow

```
User clicks PNG on dashboard card
  │
  ├─ resolveOverviewEffectivePresentationKind(displayKind, renderBarAsHorizontal)
  ├─ buildPresentationExportSpec(kind, { categoryCount })
  ├─ setOffscreenExportLayout(spec)
  ├─ ChartPngOffscreenHost (fixed position off-screen)
  │     └─ buildOverviewDashboardPlot(exportW, exportH, pngCapture=true)
  │           # SAME plot builder as on-screen card (orientation parity)
  ├─ runChartPngExport()
  │     ├─ waitForOffscreenChartReady()
  │     ├─ prepareChartForPngCapture()
  │     └─ captureElementToPng() → Canvg + canvas composite
  └─ Download .png
```

**Key files:** `chart-png-export-session.ts`, `chart-png-capture.ts`, `chart-png-export-layout.ts`, `chart-png-offscreen-host.tsx`

**Export sizing by kind:**
- Horizontal bar: 1100px (1300 if >10 categories)
- Line/area: 1200×800 canvas
- Donut: dynamic height from `radial-export-layout.ts`
- Chrome padding: `PRESENTATION_EXPORT_CHROME_PX` (168), `EXPORT_CARD_PAD` (40)

---

## Chart rendering pipeline (Overview)

### Two presentation pipelines (do not merge casually)

| Pipeline | Consumers | Resolver |
|----------|-----------|----------|
| **A — Shared** | Charts tab, AI Insights, PDF | `computeFinalChartPresentation` → `ChartRenderer` |
| **B — Overview only** | Auto-dashboard cards | `computeOverviewDashboardChartPresentation` → `buildOverviewDashboardPlot` |

### Overview card stack

```
OverviewDashboardChartSlot (ResizeObserver width)
  └─ OverviewAutoDashboardChartCard
        ├─ getCanonicalChartTitle() + polishAutoDashboardChartTitle()
        ├─ baseChartRows from labels/values
        ├─ displayKind = computeOverviewDashboardChartPresentation()
        ├─ chartRows with formatExecutiveMetricValue / radial share rules
        └─ buildOverviewDashboardPlot(viewW, plotH, pngCapture)
              ├─ pie/donut/scatter → ChartRenderer
              ├─ horizontal → inline BarChart layout="vertical"
              ├─ line/area → AreaChart/LineChart
              └─ bar/histogram → BarChart
```

### Grid layout

- CSS: `.overview-chart-grid` — 1 col default; 2 cols at container ≥1000px
- `filterOverviewRenderableCharts()` — only charts with finite data enter grid
- `isOverviewChartGridSoloRow()` — last chart full-width when odd total (5, 7, 9)
- `overviewChartGridSoloRowStyle()` — `gridColumn: 1 / -1` or `span 1`

---

## Recent fixes implemented (Jun 2026)

| Issue | Fix |
|-------|-----|
| Empty grid cell \| chart | Filter non-renderable charts; don't render grid cells for null plot bodies |
| Odd last chart half-width gap | Solo-row CSS + inline `gridColumn: 1 / -1` |
| H-bar exports as vertical bar | Shared `buildOverviewDashboardPlot` for live + PNG |
| PNG excessive whitespace | Reduced `EXPORT_CARD_PAD`, `PRESENTATION_EXPORT_CHROME_PX`, tighter plot margins in capture mode |
| Donut PNG clipping | `RADIAL_EXPORT_RADIUS_SCALE` 0.82, dynamic canvas, legend in composite |
| Donut % like 783,389% | `radial-chart-format.ts` — share only when values form a whole |
| Bad titles ("Total Top region by revenue") | `polishAutoDashboardChartTitle()` in canonical title path |
| Opportunity diversity | `auto_dashboard_opportunities.py` — coverage buckets, donut cap, KPI dedup |

---

## Remaining known issues

| Issue | Severity | Notes |
|-------|----------|-------|
| Manual visual QA not automated | Medium | Showcase dataset needs periodic browser check (grid, PNG, themes) |
| Backend raw titles still verbose | Low | Frontend polishes display; API `title` field unchanged |
| Scatter on dashboard | Low | Limited discovery (|r| ≥ 0.28); may not appear on all datasets |
| Filtered-dashboard silent failure | Medium | `M7` in bug inventory — UI may not surface API errors |
| Chart cap 8 in parser | Low | `parseAutoDashboardMiniCharts` slices to 8 regardless of backend count |
| No server-side chart persistence | Low | Dashboard state lost on full page reload until re-fetch |
| `page.tsx` monolith | Medium | Hard to review; high merge conflict risk |

---

## Technical debt

1. **Dual presentation pipelines** — Overview vs Charts/AI/PDF logic can drift; changes need paired updates
2. **Plot builder inside `page.tsx`** — `buildOverviewDashboardPlot` should extract to `lib/overview-dashboard-plot.tsx`
3. **Seed + discovery overlap** — Domain seed charts in `main.py` partially duplicate opportunity engine
4. **Internal `_opportunity*` fields** — Stripped at selection but leak risk if `_commit_pick` changes
5. **No integration test** — Auto dashboard only tested via unit tests + manual upload
6. **Chart snapshot IDs** — Dashboard charts pushed to ChartSession; mapping by title key can collide

---

## Open questions

1. Should backend emit polished titles (single source of truth) vs frontend `polishAutoDashboardChartTitle`?
2. Should `parseAutoDashboardMiniCharts` cap match `target_chart_count` dynamically?
3. Should non-renderable charts be filtered on backend (empty after filter) instead of frontend?
4. When to unify Overview plot builder with `ChartRenderer` for cartesian charts?
5. Should auto-dashboard respect user column mapping overrides for dimension priority?
6. Is 2-donut cap right for all domains, or should it be configurable per `kind`?
7. Should filtered-dashboard errors block chart grid or show stale charts?

---

## Tests

| File | Coverage |
|------|----------|
| `backend/tests/test_auto_dashboard_opportunities.py` | Showcase fixture, chart count, diversity, donut cap, KPI dedup |
| `frontend/lib/overview-chart-grid-layout.test.ts` | Solo row logic for 5/7/9 |
| `frontend/lib/overview-dashboard-chart-renderable.test.ts` | Renderable filter |
| `frontend/lib/canonical-chart-title.test.ts` | Title polish rules |
| `frontend/lib/overview-dashboard-export.test.ts` | Effective presentation kind |
| `frontend/lib/overview-dashboard-plot-layout.test.ts` | Horizontal bar detection |
| `frontend/lib/radial-chart-format.test.ts` | Share % sanity |
| `frontend/lib/radial-export-layout.test.ts` | Donut export sizing |
| `frontend/lib/chart-png-export-layout.test.ts` | Export dimensions |

**Fixture:** `backend/tests/fixtures/dashboard_showcase_dataset.csv`
