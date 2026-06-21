# Chart-Related File Map

**Snapshot:** June 20, 2026  

Paths relative to `frontend/` unless noted.

---

## Core Renderers

| File | Purpose |
|------|---------|
| `app/page.tsx` | Main app shell; `buildOverviewDashboardPlot()` inline Recharts; `renderDatasetChart()` wrapper; PNG/PDF orchestration; tab UI |
| `app/components/home/chart-renderer.tsx` | Shared Recharts router for Charts, AI Insights, PDF/PNG capture; kind branches (H-Bar, V-Bar, Line, Area, Scatter, Pie/Donut, Histogram) |
| `app/components/home/chart-insight-viewport-wrapper.tsx` | Centers insight plot in card; session vs insight max-width |
| `app/components/ai-insight-chart-shell.tsx` | Insight/Charts chart stage shell + viewport wrapper |
| `app/components/chart-platform/ChartCaptureHost.tsx` | Offscreen export root; `data-chart-capture-*` attributes |
| `app/components/chart-category-axis-tick.tsx` | Category tick component; PNG capture font overrides |
| `app/components/chart-value-axis-title.tsx` | Rotated Y-axis title labels |

---

## Layout & Margins

| File | Purpose |
|------|---------|
| `lib/chart-axis-layout.ts` | `computeVerticalValueAxisLayout`, `computeHorizontalBarAxisLayout`, `balanceVerticalOuterMargins`, `balanceHorizontalOuterMargins`, category axis plan |
| `lib/chart-layout-config.ts` | `verticalCartesianOuterMargins`, `resolveVerticalBarPlotBottomPad`, `radialChartOuterMargins`, re-exports shared detail layout |
| `lib/shared-chart-layout.ts` | `SHARED_CHART_LAYOUT`, `getSharedDetailLayoutMetrics`, `resolveSharedDetailPlotHeight`, `sessionDetailVerticalOuterMargins`, `computeDetailViewCartesianPlan` |
| `lib/overview-dashboard-plot-layout.ts` | Overview mini-card layouts; H-Bar/V-Bar/Line/Area/Scatter live margins; plot height boosts; category plans |
| `lib/chart-time-x-axis.ts` | Trend X-axis angle, interval, bottom margin for line/area |
| `lib/radial-export-layout.ts` | Donut/Pie radii and export margins |
| `lib/overview-mini-radial-polish.ts` | Overview mini radial radii tightening |

---

## Domain & Axis Scale

| File | Purpose |
|------|---------|
| `lib/overview-premium-axis-domain.ts` | Trend/scatter premium domains; `resolveTrendValueAxisProps`; session/overview/session surfaces; `sessionTrendDetailPlotMargins` |
| `lib/overview-bar-value-domain.ts` | Bar value domains; executive rounding; bounded metrics (scores, percent) |
| `lib/chart-platform/axis-presentation-plan.ts` | Export axis plans; `resolveHBarValueAxisProps`, `resolveVerticalBarValueAxisProps` |
| `lib/metric-value-format.ts` | Tick formatters, percent/score detection |

---

## Kind Routing & Contract

| File | Purpose |
|------|---------|
| `lib/resolve-bar-family-kind.ts` | Canonical H-Bar vs V-Bar family resolution |
| `lib/final-chart-presentation.ts` | Presentation rate / bar family policy |
| `lib/selected-visualization.ts` | Resolved visualization for Overview / Charts / Insights / PDF |
| `lib/chart-platform/chart-presentation-contract.ts` | Frozen presentation contract (semantics, data, metadata) |
| `lib/chart-platform/build-chart-contract.ts` | Builds contract from API/chart state |
| `lib/normalize-visualization-contract.ts` | Normalizes API viz payloads |
| `lib/chart-platform/chart-presentation-profile.ts` | Surface profiles; `resolvePdfChartEmbedPolicy`; capture dimensions |
| `app/chart-types.ts` | `ChartKind`, `ChartRow` types |

---

## Export & Capture

| File | Purpose |
|------|---------|
| `lib/chart-platform/chart-capture-controller.ts` | `createChartPngCaptureRequest`, `captureChartPngArtifact`, `pdfChartUsesContentTightComposite` |
| `lib/chart-platform/chart-capture-readiness.ts` | SVG stability waits before capture |
| `lib/chart-platform/chart-artifact.ts` | `ChartArtifact` type, request IDs |
| `lib/chart-png-capture.ts` | DOM → PNG; SVG polish hooks; capture root attributes |
| `lib/chart-png-export-layout.ts` | `buildPresentationExportSpec`, capture width/height per kind |
| `lib/chart-png-export-session.ts` | Session export helpers; offscreen host coordination |
| `lib/chart-png-export-qa.ts` | Export QA utilities |
| `lib/chart-png-export-svg-polish.ts` | Post-clone SVG tweaks for export |
| `lib/chart-png-offscreen-host.tsx` | Body portal for export-only chrome |
| `lib/overview-dashboard-export.ts` | Overview PNG parity detection; bar orientation inference |

---

## PDF

| File | Purpose |
|------|---------|
| `app/pdf-report.ts` | `runExecutivePdfExport`; chart embed; jsPDF layout; legacy capture fallback |
| `lib/build-executive-pdf-input.ts` | Assembles PDF input from live state + artifacts |
| `lib/pdf-executive-content.ts` | Executive narrative blocks for PDF |
| `lib/pdf-enterprise-style.ts` | Print palette, rules, footer, card frames |
| `lib/pdf-export-quota.ts` | Reserve/refund export quota |
| `lib/pdf-export-sections.ts` | Section visibility for PDF |
| `lib/resolve-pdf-export-context.ts` | PDF export context resolution |

---

## Intelligence & Metadata

| File | Purpose |
|------|---------|
| `lib/smart-chart-intelligence.ts` | Chart recommendation, histogram style flag |
| `lib/chart-metadata-chips.ts` | Footer metadata chip specs |
| `lib/chart-semantic-metadata.ts` | Semantic header lines for charts |
| `lib/generate-chart-reason.ts` | Charts tab “why this chart” copy |
| `lib/chart-quality-warnings.ts` | Rate/quality warning strings |
| `lib/canonical-chart-title.ts` | Title normalization |

---

## Session & Sync

| File | Purpose |
|------|---------|
| `contexts/chart-session-context.tsx` | Chart history, active snapshot, presentation contract |
| `lib/auto-dashboard-session-sync.ts` | Auto-dashboard → session chart sync |
| `lib/dashboard-chart-prefill-match.ts` | Overview → Charts prefill |

---

## UI Tokens

| File | Purpose |
|------|---------|
| `lib/overview-ui.ts` | Overview dash card/plot class tokens |
| `lib/charts-tab-ui.ts` | Charts tab layout classes |
| `lib/ai-insights-ui.ts` | AI Insights viz classes |
| `lib/chart-axis-theme.ts` | Axis color tokens |
| `lib/chart-palette.ts` | Series colors (`PIE_COLORS`, etc.) |

---

## Tests (chart-focused)

| File | Covers |
|------|--------|
| `lib/overview-premium-axis-domain.test.ts` | Domain resolvers, session margins |
| `lib/overview-dashboard-plot-layout.test.ts` | Overview layout helpers |
| `lib/shared-chart-layout.test.ts` | Detail plot height, session outer margins |
| `lib/chart-layout-config.test.ts` | Session V-Bar margin model |
| `lib/line-area-export-parity.test.ts` | Live vs export domain parity |
| `lib/chart-platform/chart-presentation-profile.test.ts` | Presentation profiles |
| `lib/chart-platform/axis-presentation-plan.test.ts` | Export axis plans |
| `lib/chart-platform/chart-capture-readiness.test.ts` | Capture readiness |
| `lib/overview-dashboard-export.test.ts` | Overview PNG parity |
| `lib/chart-png-export-qa.test.ts` | Export QA |
| `lib/build-executive-pdf-input.test.ts` | PDF input assembly |
| `lib/phase7-pdf-generate.test.ts` | End-to-end PDF generation fixtures |

---

## Backend (chart data origin)

| File | Purpose |
|------|---------|
| `backend/main.py` | `/ask`, upload, viz response |
| `backend/services/` | Auto-dashboard, KPI cards, parsers |
| `backend/intent_engine/` | Question intent routing |

---

## Baseline Docs (root)

| File | Purpose |
|------|---------|
| `AGENTS.md` | Agent/UI/chart change rules |
| `PROJECT_ARCHITECTURE_SUMMARY.md` | High-level architecture |
| `CHARTS_STABLE_SUMMARY.md` | Charts tab stable behaviors |
| `AI_INSIGHTS_STABLE_SUMMARY.md` | AI Insights stable behaviors |
| `AI_VISUALIZATION_BEHAVIOR.md` | Viz routing behavior |
