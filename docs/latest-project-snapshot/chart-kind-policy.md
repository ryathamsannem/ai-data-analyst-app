# Chart Kind Policy

**Snapshot date:** June 18, 2026  
**Canonical source:** `frontend/lib/final-chart-presentation.ts`  
**Tests:** `frontend/lib/resolve-bar-family-kind.test.ts`

This document describes how the frontend resolves which `ChartKind` is rendered across Overview, Charts, AI Insights, PNG, and PDF. Backend API `chart_type` strings are **hints**; row statistics, labels, and question/title text can override them.

---

## Type Reference

```typescript
type ChartKind =
  | "bar"              // vertical bar
  | "bar_horizontal"   // horizontal bar
  | "line"
  | "area"
  | "scatter"
  | "histogram"
  | "pie"
  | "donut";
```

API mapping: `chartKindToApiChartType()` / `apiChartStringToKind()`.

---

## Resolution Hierarchy

When a chart is normalized for rendering:

```
1. pinnedChartKind (explicit override)
2. contract.chartType (frozen VisualizationContract)
3. Source branch:
     auto_dashboard → computeAutoDashboardChartPresentation()
     else           → computeFinalChartPresentation()
```

`normalizeVisualizationContract()` and `resolveSnapshotPresentationKind()` implement this in `normalize-visualization-contract.ts`.

---

## `resolveBarFamilyKind()` — Vertical vs Horizontal Bar

**Purpose:** Single canonical policy for bar-family orientation. Used directly and via `barFamilyKindFromRows()`.

### Inputs

| Input | Description |
|-------|-------------|
| `rows` | `{ name, value }[]` category chart rows |
| `title` | Chart title |
| `question` | Optional user question (AI Insights) |

### Rules (evaluated in order)

Returns **`bar_horizontal`** when **any** of:

1. **Ranking intent** — `rankIntentFromText(title, question)` is true.
2. **Category count** — `n > 6`.
3. **Long labels** — NOT (`maxLen ≤ 14` AND `avgLen ≤ 10`).

Otherwise returns **`bar`** (vertical bar).

### Ranking intent (`rankIntentFromText`)

True when title/question matches patterns such as:

- `outlier`, `anomaly`, `ranked by`, `value distribution`
- `top/best/highest/lowest performing`
- `performing city/regions`
- `generates the highest/lowest/most/least`
- `rank`, `ranking`, `top N`, `bottom N`, `sorted`

**Not ranking:** plain "compare" phrasing alone (e.g. "Compare revenue across regions") does **not** trigger rank intent.

### Examples (from tests)

| Dataset | Title | Result |
|---------|-------|--------|
| 4 regions, short labels | "Revenue by region" | `bar` |
| 7 cities | "Orders by city" | `bar_horizontal` |
| 4 regions | "Top 3 regions by revenue" | `bar_horizontal` |
| 2 rows, long label (>14 chars) | "Revenue by region" | `bar_horizontal` |
| API `horizontalBar` + 4 short regions | "Compare revenue across regions" | `bar` (re-evaluated) |

### API `horizontalBar` is not pinned

Removed behavior: treating API `horizontalBar` as a hard pin. Frontend always re-runs `resolveBarFamilyKind()` unless a **frozen contract** or explicit pin says otherwise.

---

## Vertical Bar Rules

**Kind:** `bar`

### When selected

- Bar-family chart where `resolveBarFamilyKind()` returns `bar`.
- Typically: **≤6 categories**, **short labels**, **no rank intent**.

### Presentation constants (live parity, June 2026)

| Constant | Value | File |
|----------|-------|------|
| `compactCategoryGap` | `"16%"` for n ≤ 6 | `SHARED_CHART_LAYOUT.verticalBar` |
| `livePlotFloorPx` | 520 | `shared-chart-layout.ts` |
| Overview live `maxBarSize` | 52 | `OVERVIEW_PNG_EXPORT_VBAR_MAX_SIZE` |
| Overview live plot boost | +28px | `OVERVIEW_VBAR_LIVE_PLOT_HEIGHT_BOOST_PX` |

### Layout note

Overview mini cards **do not** flip to H-Bar on narrow cards (`allowHorizontalBarFallback: false`). Layout-only horizontal rendering must not override stored `displayKind`.

### Value axis

Shared domain via `resolveOverviewBarValueDomain()` + `resolveVerticalBarValueAxisProps()` — same helper chain for vertical bar and histogram (axis parity commit `3161616`).

---

## Horizontal Bar Rules

**Kind:** `bar_horizontal`

### When selected

- `resolveBarFamilyKind()` returns horizontal (see above).
- Auto-dashboard: non-readable time series that would be line/area but labels fail `overviewRowsLookReadableTimeSeries()` → falls back to H-Bar.
- Explicit contract pin with `chartType: "bar_horizontal"`.

### Presentation

- Category-scaled height: `420 + n×24px`, cap 580px.
- Y-axis wrapped ticks via `computeHorizontalBarAxisLayout`.
- **Do not** force vertical layout on H-Bar charts.

### Overview layout helper (legacy)

`computeOverviewMiniCategoryPlan()` can still compute `renderAsHorizontalBar` for margin planning, but with `allowHorizontalBarFallback: false` it should not flip canonical kind for compact comparisons.

`resolveInsightRenderedChartKind()` can still map `bar` → `bar_horizontal` when `categoryPlan.renderAsHorizontalBar` is true (Insights path only — verify before changing).

---

## Histogram Rules

**Kind:** `histogram`

### When selected

- API type is `histogram` and `barFamilyKindFromRows()` receives `apiBarLike: "histogram"` — histogram kind is **preserved** (not passed through bar-family resolver).

### Presentation

- Tight `barCategoryGap: 2`.
- Value axis shares vertical bar domain helpers.
- Metadata chip should show distributed numeric column (e.g. Salary), not stale "Average …" unless chart truly aggregates mean.

---

## Scatter Rules

**Kind:** `scatter`

### When selected

1. `isRelationshipScatterPresentation()` — API scatter, pinned scatter, or rows with finite `x` values.
2. API `scatter` with ≥2 rows.

### Guards

- Synthetic point labels (`•1`, `Point N`) must **not** trigger temporal/line routing.
- Geographic scope questions may suppress scatter pair routing on backend.

### Presentation

- Relationship axes (not time-series X).
- Session plot floor 560px (same band as line/area).
- PDF: content-tight composite (no fixed 1400×900 padding).

---

## Line Rules

**Kind:** `line`

### When selected

- API `line` → pinned as line in `computeFinalChartPresentation()`.
- Temporal row labels in `barFamilyKindFromRows()` → `line` (via `rowsLookTemporal()`).
- Frozen contract with time series mode.
- Bar kind + temporal labels during contract freeze → upgraded to `line`.

### Auto-dashboard guard

Line API only kept when `overviewRowsLookReadableTimeSeries(rows)` (2–28 points, ≥75% temporal labels). Otherwise → H-Bar.

### Presentation

- Premium Y-axis padding (~5%), non-zero-based domains where appropriate.
- Session plot floor 560px, viewport max-w 850px.

---

## Area Rules

**Kind:** `area`

### When selected

- API `area` → pinned as area (same path as line in `computeFinalChartPresentation()`).
- Same auto-dashboard temporal readability guard as line.

### Presentation

Same session continuous chart allocation as line (580px cap, 850px viewport).

---

## Donut / Pie Rules

**Kinds:** `pie`, `donut`

### When selected (composition detection)

Inside `barFamilyKindFromRows()` when values look like shares:

- 2–7 categories, all non-negative
- Sum ≈ 100 (percent) or ≈ 1.0 (fraction)
- `shareCompositionAllowed(title, question)` — share/composition/mix/breakdown language
- NOT rank intent, NOT percent-metric title pattern

Radial choice: n ≤ 4 → `pie`; n ≤ 7 → often `donut`.

### Auto-dashboard radial

When API sends `pie`/`donut` and `autoDashboardRadialPresentationAllowed()`:

- 2 categories → `pie`
- 3–6 → `donut`
- Otherwise re-run `computeFinalChartPresentation()`

### When **not** selected

- Rank/min/max/top/bottom questions → bar family instead.
- Percent-metric titles (rate, score, NPS, etc.) → bar family instead.
- Pie/donut API type without composition language → bar family re-evaluation.

---

## Contract Pinning Behavior

**File:** `frontend/lib/selected-visualization.ts` — `freezeVisualizationContract()`

### What gets frozen

At snapshot creation (AI answer or auto-dashboard sync):

| Field | Role |
|-------|------|
| `chartType` / `rendererType` | Resolved kind at freeze time |
| `mode` | Semantic routing mode (trend, comparison, relationship, …) |
| `labels` / `series` | Data payload |
| `metricKey`, `categoryKey`, `dimension` | Semantic columns |
| `isTimeSeries`, `timeBucketLabel` | Trend context |
| `semanticContext` | Metric engine context for chips/narrative |

### Resolution after freeze

`resolvePresentationKindFromContract()` returns `contract.chartType` when present.

`normalizeVisualizationContract()` with `pinnedChartKind` or embedded contract **skips** re-inference.

### Pin override at normalize time

`pinnedChartKind` in `NormalizeVisualizationContractArgs` wins over everything except explicit contract field when both present — check call sites; typical path is contract wins via `resolveKindFromPayload` order:

1. `args.pinnedChartKind`
2. `resolvePresentationKindFromContract({ contract })`
3. compute functions

---

## Snapshot Pinning Behavior

**File:** `frontend/contexts/chart-session-context.tsx` — `ChartSnapshot`

### Stored fields

| Field | Purpose |
|-------|---------|
| `chartKind` | Resolved kind for timeline + renderers |
| `contract` | Frozen `VisualizationContract` |
| `presentationContract` | Platform metadata + chips |
| `finalPresentation` | Orientation, metric, dimension, grain |
| `overviewEffectiveChartKind` | Legacy Overview PNG layout kind — **not** used for bar-family Charts PNG after parity fix |

### Auto-dashboard sync

When Overview charts push to session:

1. `computeAutoDashboardChartPresentation()` resolves kind.
2. `freezeVisualizationContract()` pins contract.
3. `buildChartPresentationContract()` attaches platform contract.
4. **`displayKind`** persisted — not layout-flipped H-Bar from narrow cards.

### AI Insights snapshots

Created on `/ask` response; include `question`, `questionTurnId`, provenance. Kind frozen at answer time; alignment gates compare current question to snapshot metadata before render.

---

## Backend vs Frontend Kind

| Layer | Behavior |
|-------|----------|
| Backend | Emits `chart_type` via `_chart_type_for_api()`; may suggest `horizontalBar` for comparisons |
| Frontend | Re-evaluates via `computeFinalChartPresentation()` / `resolveBarFamilyKind()` |
| Session | Frozen contract is source of truth for re-render |

Backend change (June 2026): removed `"compare"` from H-Bar-only triggers in `build_smart_chart()` so backend hints align better with frontend vertical bar policy.

---

## Related Helpers

| Function | Role |
|----------|------|
| `chartKindToProvenanceLabel()` | Human label for AI provenance strip |
| `alignInsightProvenanceToPresentation()` | Rewrites provenance when kind differs from API reason text |
| `resolveChartsPngExportKind()` | Charts PNG kind from session, not Overview layout artifact |
| `resolveOverviewEffectivePresentationKind()` | Layout render kind (may differ from displayKind when horizontal fallback enabled — fallback now disabled for kind storage) |

---

## Change Policy

Per project baseline — **do not change** without explicit scope:

- `resolveBarFamilyKind()` thresholds (6 categories, label length 14/10)
- Rank intent regex set
- Share/composition radial rules
- Histogram preservation path
- Scatter relationship guards
- Contract freeze semantics

Presentation constants (bar width, gap, plot height) may be tuned for parity without changing kind routing.
