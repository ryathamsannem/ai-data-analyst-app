# System Understanding — Chart UI Polish Baseline

**Branch:** `chart-ui-polish-baseline`  
**Stable commit:** `4247ef3` (`testing done. only bulk performnace pending`, 2026-06-15)  
**Purpose:** Architecture and flow reference before further chart visual fixes.  
**Scope:** Documentation only — reflects running code, not aspirational design.

**Related baseline docs:** [`PROJECT_ARCHITECTURE_SUMMARY.md`](../../PROJECT_ARCHITECTURE_SUMMARY.md) · [`CHARTS_STABLE_SUMMARY.md`](../../CHARTS_STABLE_SUMMARY.md) · [`AI_INSIGHTS_STABLE_SUMMARY.md`](../../AI_INSIGHTS_STABLE_SUMMARY.md) · [`PDF_EXPORT_STABLE_BASELINE.md`](../../PDF_EXPORT_STABLE_BASELINE.md) · [`AGENTS.md`](../../AGENTS.md)

---

## 1. Current app architecture

### Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4, Recharts 3 |
| Backend | FastAPI, pandas (in-memory `df` per process) |
| AI narrative | Claude (`claude-haiku-4-5`) via `POST /ask` |
| Chart data | Deterministic pandas aggregation (not LLM-generated series) |
| PDF | jsPDF + Canvg (`frontend/app/pdf-report.ts`) |
| Persistence | Client-only: theme, sidebar collapse, report branding (localStorage) |

### Repository layout

```
frontend/
  app/
    layout.tsx                 → fonts, ThemeScript, globals.css
    page.tsx                   → single client SPA: all tabs + business logic
    pdf-report.ts              → PDF export engine
    chart-types.ts             → ChartKind, ChartRow
    components/
      app-shell/               → sidebar, header, workspace
      home/                    → filters, charts, overview, data preview
      ai-insight-chart-shell.tsx, SmartChartInsightPanel.tsx, …
  contexts/chart-session-context.tsx
  lib/                         → tab tokens, chart pipeline, data-preview modules

backend/
  main.py                      → HTTP routes, upload, dashboard, /ask
  analytics_metadata.py        → metric/chart title builders
  services/file_parsers.py     → CSV, Parquet, JSON/JSONL parsing
  intent_engine/               → AI routing, correlation, narratives
```

### Architectural pattern

- **Single-route SPA:** `frontend/app/page.tsx` — no per-tab URLs; `activeTab: MainNavTabId` drives conditional render.
- **Shell:** `AppShell` — collapsible sidebar + sticky header + scrollable main.
- **One React context:** `ChartSessionProvider` — timeline snapshots from AI Insights and Overview auto-dashboard.
- **Two chart pipelines:**
  - **Pipeline A (shared):** Charts tab, AI Insights, PNG/PDF capture — `computeFinalChartPresentation` → `ChartRenderer`.
  - **Pipeline B (Overview only):** Auto-dashboard mini cards — `computeOverviewDashboardChartPresentation` + dedicated plot builder.

---

## 2. Frontend flow

```
User opens app (/)
  → AppShell + Home
  → ChartSessionProvider wraps HomeInner
  → activeTab selects one of: overview | preview | insights | charts | export
  → Shared filter state (Overview + AI Insights) lives in HomeInner local state
  → API calls to backend (default http://localhost:8000 via apiUrl())
  → Chart snapshots pushed to ChartSession on upload (auto-dashboard) and /ask (AI)
  → Recharts rendering via ChartRenderer (shared) or Overview plot builder (mini cards)
```

### Tab IDs

| Tab ID | Label region |
|--------|--------------|
| `overview` | Upload, filters, KPIs, auto-dashboard grid, AI summary |
| `preview` | Paginated table, search, sort, column quality |
| `insights` | Suggested questions, Ask AI, answer, visualization |
| `charts` | Timeline + session preview (no backend fetch on tab switch) |
| `export` | PDF section toggles, branding, download |

### State buckets (HomeInner)

| Bucket | Examples |
|--------|----------|
| Navigation | `activeTab` |
| Dataset | `file`, `columns`, `rows`, `profile`, `preview`, sheets |
| Mapping | `productColumn`, `salesColumn`, `dateColumn`, mapping modal |
| Filters | `dashboardFilters`, `dashDateStart`, `dashDateEnd` |
| AI | `question`, `answer`, `loading`, conversation snapshot |
| Data Preview | search, sort, pagination, row limit |
| Export | `exportOptions`, report branding (localStorage) |

### Performance patterns

`React.memo`, `useMemo`, `useCallback`, `useDeferredValue` (preview search), `useTransition` (tab switch). Heavy PDF imports lazy-loaded.

---

## 3. Backend flow

### Session model

In-memory globals in `backend/main.py`: `df`, `uploaded_file_bytes`, `dataset_profile`, `column_mapping`, `selected_sheet_name`. **One active dataset per server process.**

### HTTP endpoints (primary)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/` | Health check |
| `POST` | `/upload` | Parse file, profile, semantic mapping, dashboard payload |
| `POST` | `/select-sheet` | Excel sheet switch |
| `POST` | `/preview` | Row preview slice (**not filter-aware**) |
| `POST` | `/update-column-mapping` | User column role overrides |
| `POST` | `/filtered-dashboard` | KPIs + auto-dashboard on filtered slice |
| `POST` | `/ask` | AI Insights — pandas viz + Claude narrative |

### Upload → dashboard

```
POST /upload (multipart)
  → parse (file_parsers.py) → clean_dataframe → build_profile
  → semantic column mapping → build_auto_dashboard()
  → Response: columns, preview, profile, kpis, auto_dashboard, suggested_questions
  → Frontend: set state, replaceAutoDashboardCharts(), fetchPreviewRows()
```

### Filters

- `apply_dashboard_filters_to_df()` — AND-combined equality + date range.
- Used on `/filtered-dashboard` and `/ask`.
- **`/preview` does not apply dashboard filters.**

---

## 4. Overview tab flow

### States

| State | UI |
|-------|-----|
| Empty | Upload card — dropzone, format chips |
| File selected, not uploaded | `OverviewUploadSelectedState` |
| Dataset ready | Dataset summary card + Replace file; upload hidden unless replacing |

### Post-upload content (top → bottom)

1. **Interactive filters** — `FilterPanel` with `overviewFilterCompact={true}` (~43px row).
2. **KPI grid** — `OverviewKpiCard`.
3. **Auto-dashboard chart grid** — `OverviewDashboardChartSlot` per chart (Pipeline B).
4. **AI summary** — `OverviewAiSummaryPanel`.

### Chart data path

```
/upload or /filtered-dashboard
  → auto_dashboard charts in response
  → parseAutoDashboardMiniCharts() in page.tsx
  → filterOverviewRenderableCharts()
  → replaceAutoDashboardCharts() → ChartSession (for Charts tab timeline)
  → OverviewDashboardChartSlot renders mini card
      → buildOverviewDashboardPlot() (Overview-only)
      → ResizeObserver for live width
      → plot height: 300px mobile / 340px desktop (useOverviewDashPlotHeight)
```

### User actions from Overview charts

- **Drill-down** — filter by category click (when enabled).
- **View in Charts tab** — `selectChart(snapshotId)`.
- **Ask AI about chart** — prefills Insights question.
- **Download PNG** — offscreen portal via `ChartPngOffscreenHost` + `runChartPngExport`.

### Backend involvement

`/upload`, `/filtered-dashboard`, `/select-sheet`, `/update-column-mapping`.

---

## 5. Charts tab flow

### Purpose

Session visualization workspace — preview charts from Overview and AI Insights. **Does not call `/ask`.**

### Layout

```
chartsTabPage
├─ Header + Download Chart PNG (when chartData.length > 0)
└─ Grid: timeline (~23%) | preview (1fr)
   ├─ ChartsTimelineAside (AI vs Auto sections)
   └─ Preview card
      ├─ Sticky header: title, ChartContextSummary, intel strip, Why this chart
      ├─ ChartsTabPlotTransition → plot + ChartRenderer
      └─ SmartChartInsightPanel
```

### Data path

```
ChartSessionProvider.charts[]
  → user selects timeline card → activeId
  → computeFinalChartPresentation (frozen contract on snapshot)
  → sortedChartData, sessionRenderedChartKind, sessionCartesianPlan
  → renderDatasetChart(height, compact=false, insightMode=false)
  → ChartInsightViewportWrapper sessionMode=true
  → ChartRenderer
```

### Key settings

| Setting | Value |
|---------|--------|
| `insightMode` | `false` |
| Viewport width | Live measured ≤ **860px** (`sessionChartViewportW`) |
| Plot height | `resolveSharedDetailPlotHeight()` — shared with Insights formula |
| CSS plot band | `clamp(460px, 52vh, 560px)` via `--insights-viz-plot-h` |
| Centering | `ChartInsightViewportWrapper` with `sessionMode` → `max-w-full` |

### PNG download

`downloadChartPng` → off-screen `chartCaptureSessionRef` → `runChartPngExport` with `insightMode=false`.

---

## 6. AI Insights flow

### Layout

Two-column grid: suggested questions (left) + Ask AI stack (right). Filters above shell when dataset loaded (`FilterPanel appearance="dashboard"`).

### Ask flow

```
User submits question
  → POST /ask { question, filters, mapping, conversation context }
  → Backend: apply_dashboard_filters_to_df
  → compute_visualization_for_question (pandas + intent_engine routing)
  → Claude narrative (_generate_insight_narrative)
  → Response: answer, visualization, exact_result, routing metadata
  → pushAIChart → ChartSession
  → Render: answer body + gates + visualization card
```

### Visualization gate stack

Renders only when **`insightHasRenderableVisualization`**:

1. `insightSnapshot` with chart rows
2. **`insightChartMatchesCurrentQuestion`** — question/turn/title alignment
3. **`chartSnapshotMatchesQuestionIntent`** — blocks misleading charts (e.g. department bar for outlier questions)
4. Valid kind; non-placeholder title; source `ai` or `auto_dashboard`

### Visualization DOM stack

```
aiInsightsVizCard
├─ Kicker, title, ChartContextSummary (compactChips)
├─ AiInsightChartShell (max-w 960px, --insights-viz-plot-h)
│  └─ ChartInsightViewportWrapper (760/850/900px max by kind)
│     └─ aiInsightsVizPlotSurface
│        └─ renderDatasetChart(height, compact=false, insightMode=true)
├─ SmartChartInsightPanel (gated on question match)
└─ Export this insight (PDF) when showInsightExportButton
```

### Plot height

`resolveSharedDetailPlotHeight()` with kind-specific rules:

- **H-Bar:** category-scaled (base 420 + 24/category, cap 580)
- **Line/Area/Scatter:** shared vh band (460–560px desktop band)
- **Bar/Histogram:** band + category extras

---

## 7. Export flow

### A) Charts tab PNG

```
downloadChartPng()
  → mount/update chartCaptureSessionRef (off-screen, 860px)
  → renderDatasetChart(..., insightMode=false)
  → runChartPngExport()
      → buildPresentationExportSpec(kind)
      → waitForStableChartSvg
      → Canvg SVG → PNG + canvas header/chips/footer composite
  → browser download
```

### B) Overview PNG (per mini card)

```
Overview card PNG button
  → ChartPngOffscreenHost portal (-12000px)
  → Overview plot builder (Pipeline B)
  → runChartPngExport with parity validation
```

### C) Export tab PDF

```
downloadReport()
  → build ExecutivePdfExportInput from toggles + session state
  → validateExportMatchesContract (chart/insight alignment)
  → lazy import runExecutivePdfExport()
  → chart capture: chartCaptureSessionRef or chartCaptureInsightRef
      → SVG + Canvg primary; html2canvas fallback
  → jsPDF A4 assembly (cover, KPIs, insight, viz, preview table, appendix)
  → browser download
```

### D) AI Insights PDF

Same `runExecutivePdfExport()` with insight-focused payload. Gated by `showInsightExportButton` and alignment checks. Capture uses `chartCaptureInsightRef` at 860px with `insightMode=true`.

### Print theme

PDF always uses **print-safe light palette** — independent of app dark mode.

---

## 8. Cross-tab chart parity rules

1. **One presentation resolver** for session + insights + export: `computeFinalChartPresentation`.
2. **Overview stays separate** — do not merge Pipeline B without explicit approval.
3. **Horizontal bar stays horizontal** everywhere.
4. **Insights gates** prevent wrong chart type for outlier/relationship questions.
5. **Chart session** dedupes by semantic intent; freezes visualization contract on push.

---

*Snapshot generated: 2026-06-16 — branch `chart-ui-polish-baseline` @ `4247ef3`.*
