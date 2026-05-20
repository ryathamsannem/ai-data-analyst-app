# AI Visualization Behavior

**Status:** Stable behavior snapshot (May 2026)  
**Scope:** How chart **types are chosen**, **explained**, and **rendered** — with Charts tab session path as the reference consumer. Describes **current code only** (no reverted experiments).

**Related:** [`CHARTS_TAB_STABLE_SUMMARY.md`](CHARTS_TAB_STABLE_SUMMARY.md) · [`AI_INSIGHTS_STABLE_SUMMARY.md`](AI_INSIGHTS_STABLE_SUMMARY.md) · [`PROJECT_ARCHITECTURE_SUMMARY.md`](PROJECT_ARCHITECTURE_SUMMARY.md)

---

## 1. Two chart pipelines

| Pipeline | Used by | Kind resolver |
|----------|---------|---------------|
| **A — Shared** | Charts tab, AI Insights, PNG/PDF capture | `computeFinalChartPresentation` |
| **B — Overview only** | Auto-dashboard mini cards | `computeOverviewDashboardChartPresentation` |

Do not conflate Overview mini-chart rules with session/insight charts.

---

## 2. Deterministic presentation (`computeFinalChartPresentation`)

**File:** `frontend/lib/final-chart-presentation.ts`

Resolves `ChartKind` from:

- API / contract `chartType` string (`apiChartStringToKind`)
- Row shape (count, temporal labels, scatter `x` values)
- Question / title keywords (rank, share, trend, outlier, distribution)
- Trend mode / frozen contract (`selected-visualization.ts`)

**Output:** `chartType` + `orientation` (`vertical` | `horizontal` | `radial` | `cartesian2d`)

Same rows + API type → same kind across Charts, Insights, and export capture.

---

## 3. Auto chart selection logic (`recommendCore`)

**File:** `frontend/lib/smart-chart-intelligence.ts`  
Used by `computeSmartChartIntel` for **recommendation blurbs** and alignment hints (Charts smart read + reason hints).

Evaluates, in order:

| Condition | Typical kind | Rationale |
|-----------|--------------|-----------|
| Outlier question + API histogram | `histogram` | Bin numeric values to show tail extremes |
| Outlier question (ungrouped) | `bar_horizontal` | Rank individuals; grouped averages hide extremes |
| API type histogram | `histogram` | Distribution / spread |
| Scatter / correlate keywords | `scatter` | Numeric relationship |
| Trend / temporal rows / time columns | `line` | Ordered periods, directional change |
| Share + 2–8 groups | `pie` (≤5) or `donut` (>5) | Part-of-whole |
| Distribution + ≥4 groups | `bar` + `histogramStyle` | Grouped bucket spread |
| Patterns / many groups | `bar_horizontal` | Scan many categories |
| Rank / long labels / many groups | `bar_horizontal` | Readability + ranking |
| Default | `bar` | Side-by-side category comparison |

### When horizontal bar is preferred

- Ranking intent (`rank`, `top N`, `highest`, …)
- Average label length **> 14** or max label **> 22**
- **> 8** categories (or **> 6** non-temporal groups)
- Outlier questions comparing individuals (non-histogram API)
- “Patterns / signals” with **≥ 6** groups

**Rendering rule:** `bar_horizontal` always uses horizontal layout in `ChartRenderer` — never rotated to vertical.

### When donut (or pie) is preferred

- Share / proportion / percent / mix language
- **2–8** groups for share read
- **≤ 5** groups → `pie`; **6–8** → `donut`

Pie and donut are treated as **presentation-equivalent** for strict alignment checks.

### Histogram / outlier handling

| Case | Behavior |
|------|----------|
| API `histogram` | Binned numeric axis; metadata `xAxisRole: bucket` |
| Outlier + histogram API | Reason copy emphasizes tails vs grouped averages |
| Outlier + bar path | Horizontal rank of individual values |
| Distribution keywords | Vertical bar with `histogramStyle` flag OR true histogram API |

**Insights gate (not on Charts tab):** `chartSnapshotMatchesQuestionIntent` / `insightChartMatchesCurrentQuestion` prevent misleading viz (e.g. department bar for salary outlier questions).

---

## 4. Chart reasoning generation

### 4.1 Compact strip — “Why this chart”

**File:** `frontend/lib/generate-chart-reason.ts`  
**UI:** `ChartsTabChartReason`

**Inputs:**

- `chartType` (`sessionRenderedChartKind`)
- `measure` / `category` axis labels
- `question` (`lastAskedQuestion`)
- `metadata`: group count, label lengths, temporal rows, stacked series, routing explanation, `recommendationBlurb`, `detectedIntent`

**Output:** One sentence (max ~148 chars) or `null` if not meaningful.

**Priority:**

1. First sentence of `chartRoutingRecommendation.selectionExplanation`
2. `sessionSmartChartIntel.recommendationBlurb` (when short)
3. Template by kind + question intent

**Templates (examples):**

| Kind | Example intent |
|------|----------------|
| `bar_horizontal` | Long labels / ranking |
| `bar` | Side-by-side comparison; distribution buckets when `histogramStyle` |
| `histogram` | Spread and outliers |
| `donut` | Proportional contribution |
| `line` / `area` | Trend over ordered periods |
| `scatter` | Correlation |
| Stacked bar | Part-to-whole within category |

Animates with `charts-tab-chart-reason-enter` on chart change; respects `prefers-reduced-motion`.

### 4.2 Deep read — `computeSmartChartIntel`

**File:** `frontend/lib/smart-chart-intelligence.ts`  
**UI:** `SmartChartInsightPanel` (Charts + Insights)

Provides:

- `recommendedLabel` / `currentLabel`
- `whyThisChart` (longer narrative via `buildChartNarrative` + routing)
- `recommendationBlurb` (from `recommendCore`)
- `anomalyNote` (`detectNumericAnomalies`)
- Alignment flag vs suggested kind

**Charts tab:** No question-alignment gate — shows whenever intel is `active`.

---

## 5. Supported chart styles (rendering)

**Types:** `frontend/app/chart-types.ts` → `ChartKind`

| Kind | Orientation | Charts tab emphasis |
|------|-------------|---------------------|
| `bar` | Vertical | Category comparison, distribution-style bars |
| `bar_horizontal` | Horizontal | Ranking, long labels |
| `donut` | Radial | Share / mix (primary radial in product docs) |
| `pie` | Radial | Small share sets (≤5) |
| `histogram` | Vertical bins | Numeric distribution |
| `line` | Cartesian time/category | Trends |
| `area` | Cartesian | Cumulative / trend emphasis |
| `scatter` | XY | Correlation |

**KPI cards:** Overview tab only (`overview-kpi-card.tsx`) — not Charts timeline chart kinds.

---

## 6. Rendering and layout behavior

### 6.1 `ChartRenderer`

**File:** `frontend/app/components/home/chart-renderer.tsx`

- Recharts primitives per kind
- `insightMode` toggles margin presets and axis plan width source
- Cartesian margins: `verticalCartesianOuterMargins` (bar, histogram, line, area)
- Horizontal bar: dedicated layout (category axis vertical)
- Pie/donut: `radialChartOuterMargins`

### 6.2 Charts tab session layout

| Setting | Value |
|---------|--------|
| `insightMode` | `false` |
| Viewport width plan | Live `viewportEffective` ≤ **860px** |
| Plot height | `resolveChartsTabPreviewPlotHeight` — cap `min(42vh, 440px)` |
| Centering | `ChartInsightViewportWrapper` `sessionMode` |
| Transition | `ChartsTabPlotTransition` on `activeChartId` |

### 6.3 AI Insights layout (contrast)

| Setting | Value |
|---------|--------|
| `insightMode` | `true` |
| Plan width | 760 / 850 / 900px by kind |
| Margins | `insightCartesianOuterMargins` |
| Shell | `AiInsightChartShell` + max-width viewport classes |

### 6.4 Optical centering

Vertical cartesian plots use asymmetric top/bottom margins so plots sit **slightly above** geometric center (readable in both light and dark). Histogram and line/area have kind-specific bottom trim.

---

## 7. Metadata and semantics

**File:** `frontend/lib/chart-semantic-metadata.ts`

- Builds measure/dimension/time grain for chips and PDF
- Histogram → bucket role; scatter → X/Y header mode
- Feeds `generateChartReason` and narrative helpers

**Measure chip on histogram:** Should reflect distributed numeric column, not stale “Average …” from unrelated aggregation when viz is true histogram.

---

## 8. Chart sources and timeline

| `source` | Origin |
|----------|--------|
| `ai` | `/ask` → `pushAIChart` |
| `auto_dashboard` | Overview `replaceAutoDashboardCharts` |

Titles: `getCanonicalChartTitle` for timeline cards and heading parity.

---

## 9. Responsive / zoom interaction with viz

- **80–90% zoom:** Shorter effective viewport → lower `chartHeightMain` cap; tight spacing preserved (no large-screen boost).
- **100–125% zoom:** Plot clamp and axis plans scale with `viewportH` / `viewportW` debounce.
- **Dark/light:** `chart-viz-theme` CSS variables for grid lines, ticks, plot inset — shared Charts + Insights.

---

## 10. Export / capture behavior

| Output | Chart path | Centering |
|--------|------------|-----------|
| Charts PNG | Session capture ref, `insightMode=false` | Matches preview |
| PDF (session) | Same | Centered in PDF content area |
| PDF (insight) | Insight capture ref, `insightMode=true` | 860px insight layout |

Chart image should match on-screen insight styling (centered, consistent margins).

---

## 11. Stable behavior rules (do not regress)

1. **One presentation function** for session + insights + export (`computeFinalChartPresentation`)
2. **Horizontal bar** stays horizontal everywhere
3. **Outlier questions** must not silently show grouped-average bars when intent is individual-level (Insights gates)
4. **Why strip** stays one sentence; smart read stays separate below plot
5. **Charts plot height** uses 42vh/440 cap — avoid reintroducing large-viewport stretch
6. **Reasoning** uses routing explanation when backend provides it

---

## 12. Module index

| Module | Responsibility |
|--------|----------------|
| `final-chart-presentation.ts` | Deterministic kind |
| `smart-chart-intelligence.ts` | recommendCore, smart intel, anomalies |
| `generate-chart-reason.ts` | Charts tab one-liner |
| `chart-layout-config.ts` | Heights, insight plan widths, margins |
| `chart-axis-layout.ts` | Category density, tick truncation |
| `chart-renderer.tsx` | Recharts draw |
| `selected-visualization.ts` | Contract freeze, trend |
| `chart-semantic-metadata.ts` | Axis/chip semantics |
| `ux-narrative.ts` | Semantic narratives for why copy |

---

*Last updated: May 2026 — behavior baseline before Export/PDF enhancements.*
