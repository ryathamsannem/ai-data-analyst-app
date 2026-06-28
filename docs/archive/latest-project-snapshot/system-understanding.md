# System Understanding

**Snapshot date:** June 21, 2026  
**Audience:** Engineers onboarding or resuming work on the AI Analytics application.

---

## 1. What the application does

The AI Data Analyst App is a **single-tenant analytics dashboard** that:

1. Accepts a tabular dataset upload (CSV/Parquet/JSON).
2. Builds an **Overview** auto-dashboard (KPIs + mini charts).
3. Lets users **filter** globally and **drill** from chart segments.
4. Answers natural-language questions via **AI Insights** with deterministic chart data + LLM narrative.
5. Explores chart history on the **Charts** tab.
6. Exports **PNG** per chart and **executive PDF** reports.

Chart series values are always computed by **pandas on the backend**. The LLM generates text (answer, summary, follow-ups), not numeric series.

---

## 2. Request and data flow

```
Upload → POST /upload
  → backend stores df in memory, returns profile + auto_dashboard charts
  → frontend renders Overview

Filters → POST /filtered-dashboard
  → recomputes KPIs + auto-dashboard for filtered df

Question → POST /ask
  → intent routing (main.py + intent_engine/)
  → pandas aggregation → chart rows + chart_type
  → LLM narrative
  → frontend normalizes contract, adds to chart session, renders AI Insights

Export PNG → ChartCaptureHost (offscreen) → captureChartPngArtifact()
Export PDF  → same artifact path (pdfChart profile) → jsPDF embed
```

### Global state constraints

- **One active dataset per backend process** (`df` global in `main.py`).
- **Chart session** lives in React context (`chart-session-context.tsx`) on the client.
- **No server-side user accounts** in current codebase.

---

## 3. Frontend tab architecture

All primary UI is orchestrated from `frontend/app/page.tsx` (~14k lines):

| Tab | Primary renderer | Session sync |
|-----|------------------|--------------|
| Overview | Inline Recharts in `OverviewAutoDashboardChartCard` | Pushes mini charts to session via `auto-dashboard-session-sync.ts` |
| Data Preview | Table components | Read-only |
| AI Insights | `ChartRenderer` + alignment gates | Active insight snapshot |
| Charts | `ChartRenderer` (`detailViewLayout`) | Selected timeline snapshot |
| Export | PDF builder UI | Reads chart/insight context |

---

## 4. Chart kind resolution (frontend)

Canonical policy lives in `frontend/lib/final-chart-presentation.ts`:

1. **`computeAutoDashboardChartPresentation()`** — Overview mini charts from API `chart_type`.
2. **`computeFinalChartPresentation()`** — AI Insights / Charts from API type + rows + title/question.
3. **`resolveBarFamilyKind()`** — Decides `bar` vs `bar_horizontal` consistently across surfaces.

Results are frozen in `VisualizationContract` + `ChartPresentationContract` when a chart enters session history.

---

## 5. Backend routing architecture

### 5.1 Histogram (numeric distribution)

**Detection:** `main.py` → `_question_asks_numeric_distribution_histogram(ql)`

Triggers on bucket/range/distribution phrasing for **numeric** columns (e.g. "salary histogram", "display salary buckets").

**Guards:** Compare/ranking questions and categorical share questions do **not** trigger histogram intent.

**Tests:** `backend/tests/test_histogram_intent_routing.py`

**Frontend:** `histogram` kind rendered in Overview inline path and `ChartRenderer`; Overview live plot boost via `OVERVIEW_VBAR_LIVE_PLOT_HEIGHT_BOOST_PX`.

### 5.2 Donut / Pie (share / composition)

**Detection:** `intent_engine/dimension_request.py`

| Function | Role |
|----------|------|
| `question_asks_categorical_share_composition()` | Share/mix/contribution/distribution phrasing; blocks rank/compare unless share-specific |
| `question_requests_categorical_distribution_chart()` | Resolves categorical dimension for pie/donut |

**Executive-risk protection:** `executive_ambiguous_intent.py` skips executive routing when share/composition is detected; preserves explicit dimensions in `pick_executive_breakdown_column()`.

**Main pipeline:** `main.py` applies pie/donut upgrade before compare-bar routing; histogram skip guard for distribution questions.

**Tests:** `backend/tests/intent_engine/test_donut_pie_share_routing.py`

**Frontend share display:** `radial-chart-format.ts` → `radialShareDisplayAllowed()` validates ~100% composition before percent display.

### 5.3 Auto-dashboard titles

Composition charts use `{dimension} {metric} Share` via `_executive_share_by_dim_title()` in `auto_dashboard_opportunities.py` (fixes weak "Revenue Share by Department" patterns).

---

## 6. Export platform architecture

### 6.1 Artifact pipeline

```
User export action
  → createChartPngCaptureRequest({ profile, kind, contract })
  → ChartCaptureHost mounts offscreen tree
  → waitForBasicChartCaptureReady()
  → captureElementToPng() OR captureChartPngArtifact()
  → ChartArtifact { dataUrl, widthPx, heightPx, diagnostics }
```

Profiles: `overviewPng`, `chartsPng`, `pdfChart` (see `chart-presentation-profile.ts`).

### 6.2 Radial export (donut/pie only)

Radial charts use a **two-layer** export model:

1. **Plot SVG** — ring only; Recharts legend stripped from SVG clone (`stripRadialLegendFromSvgClone`).
2. **Composite canvas** — header + scaled plot + **external legend** (`renderLegendChromeToPng`) + footer.

Sizing split:

| Mode | Radii function | Occupancy target |
|------|----------------|------------------|
| Live session detail | `resolveProportionalSessionRadialRadii` | ~65–75% plot band |
| Live Overview compact | Fixed 84/52px + `scaleOverviewMiniRadialRadii` (1.24×) | ~70% on 300px cards |
| PNG/PDF export | `resolveProportionalExportRadialRadii` | ~62–65% plot band |

Composite plot scaling for radial: `RADIAL_EXPORT_PLOT_WIDTH_UTIL = 0.86` (non-radial uses 0.97).

### 6.3 PDF chart embed

1. Prefer valid `ChartArtifact` from `pdfChart` capture.
2. Fallback: legacy DOM `captureChartPlotToPng()` in `pdf-report.ts`.
3. Embed dimensions from `resolvePdfChartEmbedPolicy()` + `computePdfChartEmbedDimensions()`.

Content-tight composite (skip fixed canvas padding): `scatter`, `bar`, `histogram` for `pdfChart` profile only — **not** radial.

---

## 7. AI Insights behavior

### Answer alignment

Before showing visualization, AI Read, or export:

- `insightChartMatchesCurrentQuestion`
- `chartSnapshotMatchesQuestionIntent`

Prevents outlier/distribution questions from showing unrelated grouped bar charts.

### Follow-ups and confidence

- Follow-up chips: `ai-follow-up-suggestions.ts`, dedupe via `ai-follow-up-semantic-dedupe.ts`
- Continuation vs new analysis: `suggested-follow-up-continuation.ts`
- Confidence: normalized in `normalized-viz-metadata.ts`; displayed in Insights UI and PDF executive content

### Rate quality warnings

`resolveRateExceeds100Warning()` in `chart-quality-warnings.ts` suppresses the rate>100% warning for valid share/composition pie/donut charts where absolute values normalize to ~100% shares.

---

## 8. Key constants reference (radial)

See [`chart-rendering-summary.md`](./chart-rendering-summary.md) § Radial sizing for full table.

---

## 9. What is explicitly out of scope in this codebase

- Multi-user authentication
- Durable server-side datasets
- Vector PDF charts (plots are PNG embeds)
- Automated deployment pipeline (not present in repo)
