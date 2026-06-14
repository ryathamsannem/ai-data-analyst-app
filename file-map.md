# File Map — Auto Dashboard & Export Focus

**Generated:** June 8, 2026  
**Purpose:** Navigate Auto Dashboard, chart rendering, and PNG export code safely.

---

## Frontend — Auto Dashboard

| File | Purpose |
|------|---------|
| `frontend/app/page.tsx` | Overview tab UI, `parseAutoDashboardMiniCharts`, `OverviewAutoDashboardChartCard`, `buildOverviewDashboardPlot`, grid map, filter refresh, drill-down |
| `frontend/lib/overview-ui.ts` | CSS class tokens: `ovChartGrid`, `ovDashChartCard`, PNG export root classes |
| `frontend/lib/overview-chart-grid-layout.ts` | Solo-row detection, `gridColumn` inline styles |
| `frontend/lib/overview-dashboard-chart-renderable.ts` | `filterOverviewRenderableCharts`, finite-value check |
| `frontend/lib/overview-dashboard-export.ts` | `resolveOverviewEffectivePresentationKind` (bar → bar_horizontal) |
| `frontend/lib/overview-dashboard-plot-layout.ts` | Horizontal/vertical dash layout, category plan for overview |
| `frontend/lib/canonical-chart-title.ts` | `getCanonicalChartTitle`, `polishAutoDashboardChartTitle` |
| `frontend/lib/final-chart-presentation.ts` | Shared presentation kind (Charts/AI/PDF) — **not** used for overview orientation |
| `frontend/app/globals.css` | `.overview-chart-grid`, `.overview-dash-chart-card`, chart plot min-heights |
| `frontend/contexts/chart-session-context.tsx` | `replaceAutoDashboardCharts`, snapshot storage for Charts tab |
| `frontend/lib/semantic-metric-engine.ts` | `fromAutoDashboardChart` semantic context |
| `frontend/lib/metric-value-format.ts` | Executive metric formatting, radial display rules |
| `frontend/lib/metric-spread-gap.ts` | Top/Lowest/Gap insight chips on dashboard cards |
| `frontend/lib/chart-quality-warnings.ts` | Rate >100% warning on dashboard cards |
| `frontend/lib/chart-tooltip-format.ts` | Cartesian tooltip handlers for overview |
| `frontend/lib/use-measured-element-width.ts` | Width measurement helper (if used by overview plots) |
| `frontend/app/components/home/overview/` | Upload selected state, AI summary panel, landing sections |
| `frontend/app/components/home/filter-panel.tsx` | Overview filters → `filtered-dashboard` |
| `frontend/public/dashboard_showcase_dataset.csv` | Manual validation dataset (mirrors backend fixture) |

### Overview components defined in `page.tsx`

| Symbol | Role |
|--------|------|
| `computeOverviewDashboardChartPresentation()` | Overview-only chart kind resolver |
| `OverviewAutoDashboardChartCard` | Card chrome, PNG button, offscreen export portal |
| `OverviewDashboardChartSlot` | ResizeObserver wrapper, renderable guard |
| `OverviewInlineKpiChip` | Compact KPI chips above chart grid |

---

## Backend — Auto Dashboard

| File | Purpose |
|------|---------|
| `backend/main.py` | `build_auto_dashboard()`, `build_auto_dashboard_charts()`, `_dash_series_payload`, `_dash_chart_title_by_dimension`, `POST /upload`, `POST /filtered-dashboard`, domain KPI builders |
| `backend/services/auto_dashboard_opportunities.py` | **Core engine:** inventory, discovery, scoring, `select_diverse_charts` |
| `backend/analytics_metadata.py` | `build_insight_title`, `build_metric_label` |
| `backend/tests/test_auto_dashboard_opportunities.py` | Unit tests for opportunity engine |
| `backend/tests/fixtures/dashboard_showcase_dataset.csv` | 500+ row showcase validation fixture |
| `backend/tests/fixtures/retail_analytics_regression.csv` | Retail regression for chart diversity |

### Key `main.py` symbols

| Symbol | Role |
|--------|------|
| `infer_auto_dashboard_kind()` | Domain: sales, hr, operations, generic |
| `calculate_kpis()` | Base KPI metrics |
| `_dash_series_payload()` | labels/values/chartType payload builder |
| `_finalize_auto_dashboard_charts()` | Legacy dedup helper |
| `apply_dashboard_filters_to_df()` | Shared filter logic for dashboard + `/ask` |

---

## PNG export files

| File | Purpose |
|------|---------|
| `frontend/lib/chart-png-capture.ts` | Canvg SVG render, header/chips/footer canvas composite, `captureElementToPng` |
| `frontend/lib/chart-png-export-layout.ts` | Canvas width/height by chart kind, `buildPresentationExportSpec` |
| `frontend/lib/chart-png-export-session.ts` | `runChartPngExport`, offscreen wait, download trigger |
| `frontend/lib/chart-png-offscreen-host.tsx` | React portal host at `-12000px` |
| `frontend/lib/chart-png-export-text.ts` | Export text fill contrast |
| `frontend/lib/chart-png-export-svg-polish.ts` | SVG pre-capture polish |
| `frontend/lib/radial-export-layout.ts` | Donut/pie export radius, canvas height, legend row estimate |
| `frontend/lib/chart-axis-theme.ts` | Resolved axis colors for export |

---

## Chart rendering files

| File | Purpose |
|------|---------|
| `frontend/app/components/home/chart-renderer.tsx` | Shared Recharts renderer (pie, donut, scatter, bar, line, area, h-bar) |
| `frontend/app/chart-types.ts` | `ChartKind`, `ChartRow` types |
| `frontend/lib/chart-axis-layout.ts` | Margins, category axis plans, horizontal bar layout |
| `frontend/lib/chart-axis-formatters.ts` | Axis tick formatters |
| `frontend/lib/chart-time-x-axis.ts` | Trend x-axis ticks, chronological sort |
| `frontend/lib/chart-layout-config.ts` | Viewport wrappers, layout mode |
| `frontend/lib/trend-visualization.ts` | Trend bucket labels |
| `frontend/lib/radial-chart-format.ts` | Donut share %, tooltip formatting |
| `frontend/lib/selected-visualization.ts` | Visualization contract freeze, display titles |
| `frontend/lib/insight-aligned-axis-merge.ts` | AI Insights axis alignment |
| `frontend/app/components/chart-category-axis-tick.tsx` | Wrapped category Y-axis ticks (h-bar) |

---

## Utility files (cross-cutting)

| File | Purpose |
|------|---------|
| `frontend/lib/api-base.ts` | `apiUrl()`, `NEXT_PUBLIC_API_BASE_URL` |
| `frontend/lib/saas-session.ts` | `X-Session-Id`, `X-Plan-Tier` headers |
| `frontend/lib/plan-limits.ts` | Client tier limits |
| `frontend/lib/usage-api.ts` | `/usage` fetch, PDF quota reserve/refund |
| `frontend/lib/usage-display.ts` | Usage dashboard row builder |
| `frontend/lib/analytics-metadata.ts` | `polishMetricDisplay`, metric labels |
| `frontend/lib/upload-auto-flow.ts` | Auto-upload after file pick |
| `frontend/lib/smart-chart-intelligence.ts` | Chart metadata for AI/Charts tab |
| `frontend/lib/normalized-viz-metadata.ts` | Normalized viz metadata |

---

## PDF export (shared chart capture)

| File | Purpose |
|------|---------|
| `frontend/app/pdf-report.ts` | jsPDF engine, chart capture, pagination |
| `frontend/lib/build-executive-pdf-input.ts` | PDF input contract from session/insights |
| `frontend/lib/pdf-executive-content.ts` | Executive narrative blocks |
| `frontend/lib/pdf-export-quota.ts` | Quota helpers |
| `frontend/lib/pdf-export-sections.ts` | Section toggles |
| `frontend/lib/pdf-enterprise-style.ts` | Print styling |

---

## AI Insights (reference — out of Auto Dashboard scope)

| File | Purpose |
|------|---------|
| `backend/intent_engine/` | Routing, correlation, confidence, narratives |
| `frontend/lib/ai-conversation-context.ts` | Thread context for `/ask` |
| `frontend/lib/ai-follow-up-suggestions.ts` | Suggested follow-ups |
| `frontend/app/components/SmartChartInsightPanel.tsx` | Insight panel UI |
| `frontend/app/components/ai-executive-insights-panel.tsx` | Executive cards UI |

---

## Tests

### Frontend (Vitest)

| File | Focus |
|------|-------|
| `frontend/lib/overview-chart-grid-layout.test.ts` | Grid solo row 5/7/9 |
| `frontend/lib/overview-dashboard-chart-renderable.test.ts` | Renderable filter |
| `frontend/lib/overview-dashboard-export.test.ts` | Effective presentation kind |
| `frontend/lib/overview-dashboard-plot-layout.test.ts` | H-bar detection |
| `frontend/lib/canonical-chart-title.test.ts` | Title polish |
| `frontend/lib/radial-chart-format.test.ts` | Share % sanity |
| `frontend/lib/radial-export-layout.test.ts` | Donut export layout |
| `frontend/lib/chart-png-export-layout.test.ts` | Export dimensions |
| `frontend/lib/chart-png-export-session.test.ts` | Export session spec |
| `frontend/lib/chart-png-capture.test.ts` | Capture helpers |
| `frontend/lib/chart-png-offscreen-host.test.ts` | Offscreen root style |
| `frontend/lib/chart-png-export-svg-polish.test.ts` | SVG polish |
| `frontend/lib/chart-png-export-text.test.ts` | Text contrast |
| `frontend/lib/chart-axis-layout.test.ts` | Axis layout |
| `frontend/lib/chart-axis-theme.test.ts` | Theme + export text |
| `frontend/lib/final-chart-presentation-rate.test.ts` | Rate chart presentation |
| `frontend/lib/metric-spread-gap.test.ts` | Gap chip formatting |
| `frontend/lib/metric-executive-percent.test.ts` | Executive % formatting |
| `frontend/lib/chart-quality-warnings.test.ts` | Rate warnings |
| `frontend/lib/chart-tooltip-format.test.ts` | Tooltip handlers |
| `frontend/lib/chart-time-x-axis.test.ts` | Trend axis |
| `frontend/lib/phase7-pdf-generate.test.ts` | PDF generation |

### Backend (pytest / unittest)

| File | Focus |
|------|-------|
| `backend/tests/test_auto_dashboard_opportunities.py` | Auto dashboard engine |
| `backend/tests/test_usage_limits.py` | Plan limits |
| `backend/tests/test_health_endpoints.py` | Health/ready |
| `backend/tests/test_cors_config.py` | CORS |
| `backend/tests/intent_engine/*` | AI routing, correlation, narratives |

**Run:**
```bash
cd frontend && npm run test
cd backend && python run_tests.py -v
```

---

## Docs & validation artifacts

| Path | Purpose |
|------|---------|
| `docs/pdf-validation-screenshots/phase7-*.pdf` | PDF export validation outputs |
| `docs/pdf-validation-screenshots/phase7-manifest.json` | PDF test manifest |
| `docs/chart-polish/` | Chart polish before/after screenshots |
| `docs/deployment-guide.md` | Deploy instructions |
| `bug-inventory.md` | Full bug severity list |
| `deployment-readiness.md` | Pilot vs prod readiness |
