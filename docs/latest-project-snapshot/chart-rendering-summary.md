# Chart Rendering Summary

**Snapshot date:** June 18, 2026  
**Scope:** End-to-end chart rendering from backend aggregation through live UI and export artifacts.

---

## Pipeline Overview

```
Backend pandas aggregation
        ↓
API chart_type string (bar, horizontalBar, line, …)
        ↓
Frontend kind resolution (final-chart-presentation + normalize-visualization-contract)
        ↓
Frozen VisualizationContract + ChartPresentationContract (session snapshot)
        ↓
Surface-specific renderer + layout helpers
        ↓
Optional: ChartArtifact capture (PNG / PDF)
```

| Surface | Renderer | Layout source | Shell |
|---------|----------|---------------|-------|
| Overview mini | Inline Recharts in `page.tsx` | `overview-dashboard-plot-layout.ts` | Auto-dashboard card grid |
| Charts tab | `ChartRenderer` (`detailViewLayout`) | `shared-chart-layout.ts` | 960px frame, kind viewport |
| AI Insights | `ChartRenderer` (`insightMode`) | Same as Charts | `AiInsightChartShell` |
| Overview PNG | Inline in `page.tsx` (`pngCapture`) | `overview-dashboard-export.ts` | Offscreen capture host |
| Charts PNG | `ChartRenderer` (`pngCaptureMode`) | `chart-png-export-layout.ts` | `ChartCaptureHost` |
| PDF chart | Same as Insights capture tree | `pdfChart` profile | Hidden root + artifact embed |

---

## 1. Backend Chart Generation

**Primary file:** `backend/main.py`

### Data flow

1. User uploads dataset → `POST /upload` → profile, KPIs, `auto_dashboard` charts.
2. Filtered refresh → `POST /filtered-dashboard`.
3. AI question → `POST /ask` → intent routing, pandas groupby/aggregation, chart rows + narrative.

Chart rows are **deterministic** (pandas). The LLM produces narrative text, not series values.

### Key backend functions

| Function | Role |
|----------|------|
| `build_smart_chart()` | Rule-based fallback when primary viz routing misses |
| Auto-dashboard builders | Category/time/radial opportunities from schema |
| `_chart_type_for_api()` | Maps internal kind → API string (`bar`, `horizontalBar`, `line`, …) |
| Histogram / scatter pair resolvers | Distribution and correlation relationship charts |

### API chart type strings

Frontend maps these via `apiChartStringToKind()` in `frontend/lib/smart-chart-intelligence.ts`. API types are **hints** — frontend re-evaluates kind from rows, labels, and question text (especially bar family).

---

## 2. Visualization Contract Normalization

**Files:** `frontend/lib/normalize-visualization-contract.ts`, `frontend/lib/selected-visualization.ts`

### `normalizeVisualizationContract()`

Single normalization path producing:

- `kind` / `effectivePresentationKind`
- `layout` (vertical / horizontal / radial / cartesian2d)
- Axis labels, title, rows

### Kind resolution order (`resolveKindFromPayload`)

1. **`pinnedChartKind`** — explicit override (rare).
2. **Frozen contract** — `contract.chartType` from session snapshot wins when present.
3. **Source-specific:**
   - `auto_dashboard` → `computeAutoDashboardChartPresentation()`
   - otherwise → `computeFinalChartPresentation()`

### `freezeVisualizationContract()`

Called when a chart enters session history. Produces immutable `VisualizationContract` with:

- Pinned `chartType` / `rendererType`
- Labels, series, aggregation, dimension, time bucket
- Semantic mode: `trend` | `category` | `distribution` | `comparison` | `relationship`

Once frozen, downstream surfaces read the contract rather than re-inferring kind from API strings alone.

---

## 3. Presentation Profile System

**File:** `frontend/lib/chart-platform/chart-presentation-profile.ts`

Read-only metadata layer — **does not drive live rendering directly** but describes how each surface should capture and embed charts.

### Profile IDs

| ID | Surface | Aspect policy |
|----|---------|---------------|
| `overviewLive` | Overview card | `compact-card` |
| `overviewPng` | Overview PNG | `presentation-canvas` |
| `chartsLive` | Charts tab | `detail-viewport` |
| `chartsPng` | Charts PNG | `presentation-canvas` |
| `aiInsightsLive` | AI Insights | `detail-viewport` |
| `pdfChart` | PDF embed | `pdf-embed` |

Each profile includes:

- Capture width/height, canvas dimensions (export profiles)
- `axisPolicyId` — links to `AxisPresentationPlan` diagnostics
- `metadataMode` — contract chips vs PDF-native context
- `pdfEmbed` — max height, min width ratio, aspect bounds (PDF only)

Built via `buildChartPresentationProfile()` using `buildPresentationExportSpec()` from `chart-png-export-layout.ts`.

### Presentation contract (Phase 1 platform)

**Files:** `chart-presentation-contract.ts`, `build-chart-contract.ts`

Parallel to legacy `VisualizationContract`:

- Identity, resolved kind, story type, semantic header
- Metadata chips for UI and PDF-native rendering
- Attached to `ChartSnapshot.presentationContract` in session context

---

## 4. Overview Rendering

**Files:** `frontend/app/page.tsx`, `overview-dashboard-plot-layout.ts`, `overview-dashboard-export.ts`

### Auto-dashboard cards

1. Backend returns mini chart specs (title, `chart_type`, labels, values).
2. `computeAutoDashboardChartPresentation()` resolves display kind.
3. Inline Recharts in `OverviewAutoDashboardChartCard` — **not** `ChartRenderer`.
4. `computeOverviewMiniCategoryPlan()` handles category axis angles, margins; `allowHorizontalBarFallback: false` (no narrow-card H-Bar flip).
5. `resolveOverviewDashLivePlotHeight()` applies kind-specific plot boosts (trend +36, scatter +32, H-Bar +36, **V-Bar +28**).

### Overview kind storage

Session sync stores **`displayKind`** (canonical presentation kind), not layout-only `renderAsHorizontalBar` flips. PNG export uses the same display kind constants (`OVERVIEW_PNG_EXPORT_VBAR_MAX_SIZE = 52`, 16% category gap for ≤6 categories).

### Overview PNG

Separate export tuning in `overview-dashboard-export.ts` — larger axis ticks, export margins, plot height ~728px band. Captured via artifact platform with `overviewPng` profile.

---

## 5. Charts Tab Rendering

**Files:** `ChartRenderer`, `chart-layout-config.ts`, `shared-chart-layout.ts`

### Flow

1. User selects timeline entry from `ChartSessionProvider`.
2. Snapshot provides `chartKind`, `chartData`, `contract`, `presentationContract`.
3. `resolveChartsTabPreviewPlotHeight()` → `resolveSharedDetailPlotHeight()`.
4. `ChartRenderer` with `detailViewLayout=true`, `insightMode=false`.
5. Wrapped in kind-specific viewport (`max-w-[760px]` bar, `[850px]` line/area, `[900px]` H-Bar).

### Session detail plot heights (desktop ~900px viewport)

| Kind | Plot height behavior |
|------|---------------------|
| Line / Area / Scatter | Floor 560px + boost, cap 580px |
| H-Bar | `420 + n×24`, cap 580px |
| V-Bar / Histogram (n ≤ 6) | Floor 520px, cap 580px |
| Donut / Pie | Band − 20px |

---

## 6. AI Insights Rendering

**Files:** same `ChartRenderer` + `ai-insight-chart-shell.tsx`, alignment gates in `page.tsx`

### Differences from Charts tab

- `insightMode=true` — symmetric `insightCartesianOuterMargins`, metadata chips use insight tokens.
- **Alignment gates** before showing viz, AI Read, or export:
  - `insightChartMatchesCurrentQuestion`
  - `chartSnapshotMatchesQuestionIntent`
- Export button gated by `showInsightExportButton`.

### Question match

Outlier / distribution questions must not show unrelated grouped bar charts unless the question explicitly groups by dimension.

---

## 7. PNG Export Rendering

**Files:** `chart-capture-controller.ts`, `ChartCaptureHost.tsx`, `chart-png-capture.ts`, `chart-png-export-session.ts`

### Request flow

```
User clicks Export PNG
  → buildChartPngCaptureRequest() with profile (overviewPng | chartsPng)
  → ChartCaptureHost mounts offscreen render tree
  → waitForBasicChartCaptureReady() (kind-aware marks, stable layout)
  → captureElementToPng() composites header + plot + footer
  → ChartArtifact returned
```

### Canvas sizing (`chart-png-export-layout.ts`)

| Kind | Canvas width | Plot height (typical) |
|------|--------------|------------------------|
| Default bar / histogram | 1400px | ~728px |
| Line / area / scatter | 1200px | ~668px |
| H-Bar | 1100–1300px | category-scaled |
| Donut / pie | radial layout | radial layout |

### Content-tight composite

**PDF only** (not Overview/Charts PNG): `pdfChartUsesContentTightComposite()` skips fixed canvas padding for `scatter` and `bar` so the artifact fills the frame without excess dark whitespace.

### Charts PNG kind

`resolveChartsPngExportKind()` prefers session `chartKind` for bar family — avoids Overview layout kind leaking into Charts PNG.

---

## 8. PDF Rendering

**Files:** `pdf-report.ts`, `build-executive-pdf-input.ts`, `pdf-enterprise-style.ts`

### Chart image source priority

1. Valid `ChartArtifact.dataUrl` from `pdfChart` capture.
2. Legacy DOM `captureEl` fallback (intentional safety net).

### PDF chart section

- Native header with contract metadata chips (max 6).
- Image placed via `computePdfChartEmbedDimensions()` using `presentationProfile.pdfEmbed`.
- Rounded frame pad from `PDF_SPACING.chartFramePad`.

### PDF embed policies (current)

| Kind | maxHeightMm | minWidthRatio |
|------|-------------|---------------|
| H-Bar | 158 | 0.74 |
| V-Bar | 150 | 0.88 |
| Line / Area | 158 | 0.90 |
| Scatter | 150 | 0.92 |
| Donut / Pie | 108 | 0.58 |

---

## 9. How Chart Kinds Are Resolved

See [`chart-kind-policy.md`](./chart-kind-policy.md) for complete rules.

**Entry points:**

| Function | Used when |
|----------|-----------|
| `resolveBarFamilyKind()` | Bar vs H-Bar decision |
| `computeFinalChartPresentation()` | AI / general frontend resolution |
| `computeAutoDashboardChartPresentation()` | Overview auto-dashboard (+ radial/time guards) |
| `normalizeVisualizationContract()` | Unified normalization |
| `resolveSnapshotPresentationKind()` | Session snapshot kind for renderers |
| `resolvePresentationKindFromContract()` | Read frozen contract kind |

**Pinning:** Once `freezeVisualizationContract()` runs, `contract.chartType` is authoritative unless an explicit `pinnedChartKind` is passed at normalize time.

---

## 10. Shared Renderer: ChartRenderer

**File:** `frontend/app/components/home/chart-renderer.tsx`

Single Recharts implementation for Charts, Insights, and PNG/PDF artifact capture (not Overview mini cards).

### Branching by kind

- `bar_horizontal` — horizontal layout, wrapped Y ticks
- `bar` / `histogram` — vertical BarChart; V-Bar uses `SHARED_CHART_LAYOUT.verticalBar.compactCategoryGap` (16% for n ≤ 6)
- `line` / `area` — premium trend axes via session helpers
- `scatter` — relationship axes, point styling
- `pie` / `donut` — radial margins and radii

### Axis presentation plan integration

`resolveVerticalBarValueAxisProps()` and H-Bar equivalents apply shared value-axis domains from `axis-presentation-plan.ts` when an export axis plan is present.

---

## Alignment Gates (AI Insights only)

| Gate | Purpose |
|------|---------|
| `insightChartMatchesCurrentQuestion` | Chart belongs to current Q&A turn |
| `chartSnapshotMatchesQuestionIntent` | Viz matches question semantics |
| `showInsightExportButton` | Export only when answer + aligned viz |

Charts tab: SmartChartInsightPanel always available when intel is active (no question gate).

---

## What Not to Change Without Explicit Approval

- H-Bar / Donut / Pie renderer branches
- Shell max-width classes (960 / 850 / 900 / 760)
- Chart kind semantics and `resolveBarFamilyKind()` policy
- Overview inline renderer → broad migration to ChartRenderer
- AI Insights alignment gate behavior
- PDF page structure / executive narrative layout
