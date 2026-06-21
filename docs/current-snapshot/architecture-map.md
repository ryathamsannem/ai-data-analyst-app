# Architecture Map

**Snapshot:** June 20, 2026  

---

## System Layers

```
┌─────────────────────────────────────────────────────────────┐
│  frontend/app/page.tsx (HomeInner)                          │
│  Tabs: Overview | Data Preview | AI Insights | Charts | Export │
└────────────┬───────────────────────────────┬────────────────┘
             │                               │
    Overview inline plots              ChartRenderer (session)
    buildOverviewDashboardPlot         renderDatasetChart()
             │                               │
             └───────────┬───────────────────┘
                         │
              lib/chart-* helpers (domain, margins, layout)
                         │
         ┌───────────────┴───────────────┐
         │  Export capture platform       │
         │  ChartCaptureHost → Artifact   │
         └───────────────┬───────────────┘
                         │
              pdf-report.ts (jsPDF embed)
```

**Backend:** `backend/main.py` — upload, `/ask`, deterministic viz engine, auto-dashboard generation.  
**Session state:** `contexts/chart-session-context.tsx` — chart history, presentation contract, snapshot sync.

---

## page.tsx Responsibilities

**File:** `frontend/app/page.tsx` (~14.6k lines)

| Region | Approx. lines | Ownership |
|--------|---------------|-----------|
| Module helpers | 768–4110 | Axis inference, viz hydration, auto-dashboard parsing, executive insight builders, filter/date helpers |
| `OverviewAutoDashboardChartCard` | 4115–5415 | Mini chart card, `buildOverviewDashboardPlot`, Overview PNG export, `ChartCaptureHost` |
| `OverviewDashboardChartSlot` | 5418+ | ResizeObserver wrapper for grid cards |
| `HomeInner` state | 6318+ | Upload, filters, AI ask flow, chart session, plan quota |
| Capture refs | 6320+, 11702–11745 | PDF session/insight offscreen roots; Charts PNG offscreen root |
| `renderDatasetChart` | 11547–11581 | Thin wrapper → `ChartRenderer` for Charts / Insights / PDF |
| `downloadChartPng` | 7047–7110 | Charts tab PNG export orchestration |
| `downloadReportImpl` | ~11200–11540 | PDF quota, hidden capture, artifact, `buildExecutivePdfExportInput`, `runExecutivePdfExport` |
| Tab: Overview | 11747+ | Landing, KPI grid, auto-dashboard chart grid |
| Tab: Data Preview | 12378+ | Table, column profiles |
| Tab: Charts | 12820+ | Timeline + session preview + PNG offscreen host |
| Tab: AI Insights | 13059+ | Q&A, insight chart, SmartChart panel, export gates |
| Tab: Export | 14124+ | PDF section picker |

**Overview-only rendering:** `buildOverviewDashboardPlot(viewW, plotH, pngCapture)` — inline Recharts for H-Bar, V-Bar, Line, Area, Scatter, Histogram; delegates Donut/Pie to `ChartRenderer`.

---

## ChartRenderer Responsibilities

**File:** `frontend/app/components/home/chart-renderer.tsx`

Single Recharts router for **session surfaces** (Charts, AI Insights, PDF/PNG capture).

| Branch | Chart kinds | Key inputs |
|--------|-------------|------------|
| Grouped / stacked multi-bar | `grouped_bar`, `stacked_bar` | Multi-series viz spec |
| Scatter | `scatter` | `resolveScatterValueAxisProps`, `sessionDetailVerticalOuterMargins` |
| Radial | `pie`, `donut` | `resolveRadialChartRadii`, pie margins |
| Horizontal bar | `bar_horizontal` | `computeHorizontalBarAxisLayout`, `resolveHBarValueAxisProps` |
| Line / Area | `line`, `area` | `resolveTrendValueAxisProps({ surface: "session" })`, `sessionTrendDetailPlotMargins` |
| Vertical bar / histogram | `bar`, `histogram` | Category plan, `verticalCartesianOuterMargins`, histogram styling |

**Props of note:** `detailViewLayout`, `insightMode`, `pngCaptureMode`, `exportAxisPresentationPlan`, `compact`, `overviewMiniRadial`.

**Does not own:** Overview mini-card inline plots (except Donut/Pie delegation from Overview card).

---

## Overview Pipeline

```
Upload CSV → backend auto_dashboard → parseAutoDashboardMiniCharts()
  → OverviewDashboardChartSlot → OverviewAutoDashboardChartCard
  → buildOverviewDashboardPlot(pngCapture=false)
  → per-card PNG: createChartPngCaptureRequest(profile: "overviewPng")
  → ChartCaptureHost → buildOverviewDashboardPlot(pngCapture=true)
  → captureChartPngArtifact()
```

**Key files:** `page.tsx`, `overview-dashboard-plot-layout.ts`, `overview-premium-axis-domain.ts`, `overview-bar-value-domain.ts`, `overview-dashboard-export.ts`.

---

## Charts Tab Pipeline

```
User selects timeline chart → chart session state updates
  → renderDatasetChart(height, detailViewLayout=true)
  → ChartRenderer (session domain + sessionDetailVerticalOuterMargins)
  → PNG: downloadChartPng()
  → ChartCaptureHost + ChartRenderer(pngCaptureMode, detailViewLayout)
  → captureChartPngArtifact(profile: "chartsPng")
```

**Key files:** `page.tsx`, `chart-renderer.tsx`, `shared-chart-layout.ts`, `chart-layout-config.ts`, `charts-tab-ui.ts`, `chart-session-context.tsx`.

---

## AI Insights Pipeline

```
POST /ask → visualization + aligned analysis
  → insightChartMatchesCurrentQuestion gate
  → renderDatasetChart(height, insightMode=true)
  → ChartRenderer (detailLayout via insightMode)
  → SmartChartInsightPanel (AI Read)
  → Export: PDF uses hidden insight capture root
```

**Key files:** `page.tsx`, `chart-renderer.tsx`, `smart-chart-intelligence.ts`, `ai-insights-ui.ts`, `executive-insights-brief.ts`, `build-executive-pdf-input.ts`.

**Gates:** `showInsightExportButton`, `chartSnapshotMatchesQuestionIntent`, `insightChartMatchesCurrentQuestion`.

---

## Export Pipeline (PNG)

```
createChartPngCaptureRequest()
  → buildChartPresentationProfile()
  → buildPresentationExportSpec()  [chart-png-export-layout.ts]
  → ChartCaptureHost mounts offscreen root
  → waitForBasicChartCaptureReady()  [chart-capture-readiness.ts]
  → captureElementToPng()  [chart-png-capture.ts]
  → ChartArtifact { pngBlob, parity metadata }
  → downloadChartArtifact()
```

**Profiles:** `overviewPng`, `chartsPng`  
**Key files:** `chart-capture-controller.ts`, `chart-png-export-session.ts`, `chart-artifact.ts`, `ChartCaptureHost.tsx`.

---

## PDF Pipeline

```
downloadReportImpl()
  → reservePdfExport() (quota)
  → setPdfCaptureMounted(true) — mounts hidden 860px capture DOM
  → captureChartPngArtifact(profile: "pdfChart") for session + insight charts
  → buildExecutivePdfExportInput() — ranks signals, merges narrative sections
  → runExecutivePdfExport()  [pdf-report.ts]
  → resolvePdfChartImageCandidate() — prefers ChartArtifact PNG
  → resolvePdfChartEmbedPolicy(kind) — kind-aware sizing
  → jsPDF pages + executive styling  [pdf-enterprise-style.ts]
```

**Fallback:** Legacy `captureChartPlotToPng()` DOM/SVG path if artifact missing.

**Key files:** `pdf-report.ts`, `build-executive-pdf-input.ts`, `pdf-executive-content.ts`, `resolve-pdf-export-context.ts`, `chart-presentation-profile.ts`.

---

## Cross-Cutting Concerns

| Concern | Owner file(s) |
|---------|---------------|
| Chart kind resolution | `resolve-bar-family-kind.ts`, `final-chart-presentation.ts`, `selected-visualization.ts` |
| Presentation contract | `chart-presentation-contract.ts`, `build-chart-contract.ts`, `normalize-visualization-contract.ts` |
| Metadata chips | `chart-metadata-chips.ts`, `chart-semantic-metadata.ts` |
| Metric formatting | `metric-value-format.ts` |
| Filter bar | `filter-panel.tsx`, dashboard filter state in `page.tsx` |
| UI shells | `ai-insight-chart-shell.tsx`, `chart-insight-viewport-wrapper.tsx` |

---

## Dual Pipeline Note

Overview and session surfaces intentionally use separate DOM paths. Parity is maintained through **shared helpers** (domain resolvers, margin models, presentation contract) rather than a single renderer component. Future work may converge further; current baseline treats both paths as stable.
