# File Map — Chart UI Polish Baseline

**Branch:** `chart-ui-polish-baseline`  
**Stable commit:** `4247ef3`  
**Purpose:** Navigate chart-related code safely before visual fixes.

---

## 1. Important frontend files

### Entry & orchestration

| File | Purpose | Touch when |
|------|---------|------------|
| `frontend/app/page.tsx` | **Monolithic SPA** — all tabs, `renderDatasetChart`, Overview plot builder, export refs, gates | Tab flow, chart props, capture refs |
| `frontend/app/layout.tsx` | Root layout, fonts, globals.css | Rarely |
| `frontend/contexts/chart-session-context.tsx` | Timeline snapshots, `pushAIChart`, `replaceAutoDashboardCharts` | Session dedupe, snapshot shape |

### App shell

| File | Purpose |
|------|---------|
| `frontend/app/components/app-shell/app-shell.tsx` | Sidebar + header + main workspace |
| `frontend/app/components/app-shell/app-sidebar.tsx` | Nav tabs |
| `frontend/app/components/app-shell/app-header.tsx` | Dataset loaded badge |
| `frontend/app/components/app-shell/main-nav-tabs.tsx` | Tab IDs |

### Tab UI components

| File | Tab |
|------|-----|
| `frontend/app/components/home/filter-panel.tsx` | Overview + AI Insights filters |
| `frontend/app/components/home/charts-timeline-aside.tsx` | Charts timeline |
| `frontend/app/components/home/charts-tab-intelligence-strip.tsx` | Charts metadata strip |
| `frontend/app/components/home/charts-tab-chart-reason.tsx` | Why this chart |
| `frontend/app/components/home/charts-tab-plot-transition.tsx` | Plot height + enter animation |
| `frontend/app/components/SmartChartInsightPanel.tsx` | AI Read on chart |
| `frontend/app/components/ai-executive-insights-panel.tsx` | Executive cards |
| `frontend/app/components/home/overview/` | Upload states, AI summary, KPI cards |
| `frontend/app/components/home/data-preview-*.tsx` | Data Preview extracted components |

### Types

| File | Purpose |
|------|---------|
| `frontend/app/chart-types.ts` | `ChartKind`, `ChartRow` |
| `frontend/app/pdf-report.ts` | PDF engine (~4k lines) |

---

## 2. Important backend files

| File | Purpose |
|------|---------|
| `backend/main.py` | All HTTP routes, `df` globals, upload, dashboard, `/ask`, viz pipeline |
| `backend/analytics_metadata.py` | Metric/chart title builders |
| `backend/services/file_parsers.py` | CSV, Parquet, JSON parsing |
| `backend/services/auto_dashboard_opportunities.py` | Auto-dashboard discovery engine |
| `backend/intent_engine/` | AI routing modules (33 files) |
| `backend/intent_engine/routing_plan.py` | Routing orchestration |
| `backend/intent_engine/correlation_routing_guard.py` | Correlation → scatter guard |
| `backend/intent_engine/chart_presentation_align.py` | Backend presentation alignment |
| `backend/run_tests.py` | Test runner (preferred over raw unittest discover) |

### Key backend symbols

| Symbol | Role |
|--------|------|
| `build_auto_dashboard()` | Overview chart payload |
| `compute_visualization_for_question()` | AI Insights viz |
| `apply_dashboard_filters_to_df()` | Shared filter logic |
| `_generate_insight_narrative()` | Claude narrative |

---

## 3. Chart-related utility files

### Rendering core

| File | Role |
|------|------|
| `frontend/app/components/home/chart-renderer.tsx` | **Primary Recharts renderer** — all kinds |
| `frontend/app/components/ai-insight-chart-shell.tsx` | Insights chart frame |
| `frontend/app/components/home/chart-insight-viewport-wrapper.tsx` | Centering wrapper |

### Presentation & intelligence

| File | Role |
|------|------|
| `frontend/lib/final-chart-presentation.ts` | Pipeline A kind resolver |
| `frontend/lib/selected-visualization.ts` | Contract freeze |
| `frontend/lib/smart-chart-intelligence.ts` | recommendCore, smart intel |
| `frontend/lib/generate-chart-reason.ts` | Charts tab one-liner |
| `frontend/lib/chart-question-intent.ts` | Intent match gates |
| `frontend/lib/chart-semantic-metadata.ts` | Axis/chip semantics |
| `frontend/lib/relationship-scatter-presentation.ts` | Scatter presentation rules |

### Layout & axes

| File | Role |
|------|------|
| `frontend/lib/shared-chart-layout.ts` | **Shared detail plot band** (460–560px) |
| `frontend/lib/chart-layout-config.ts` | Viewport max classes, outer margins |
| `frontend/lib/chart-axis-layout.ts` | Category plans, H-bar, pie margins |
| `frontend/lib/chart-time-x-axis.ts` | Line/area X-axis |
| `frontend/lib/chart-axis-formatters.ts` | Tick formatters |
| `frontend/lib/chart-axis-theme.ts` | Axis CSS tokens |
| `frontend/lib/chart-tooltip-format.ts` | Tooltip handlers |
| `frontend/lib/chart-palette.ts` | Color arrays |
| `frontend/lib/radial-chart-format.ts` | Donut/pie formatting |
| `frontend/lib/radial-export-layout.ts` | Radial export dimensions |

### Overview pipeline (Pipeline B)

| File | Role |
|------|------|
| `frontend/lib/overview-dashboard-plot-layout.ts` | Overview cartesian plans |
| `frontend/lib/overview-dashboard-chart-renderable.ts` | Renderable filter |
| `frontend/lib/overview-dashboard-export.ts` | PNG parity |
| `frontend/lib/overview-chart-grid-layout.ts` | Grid layout |
| `frontend/lib/canonical-chart-title.ts` | Title polish |
| `frontend/lib/metric-spread-gap.ts` | Top/Lowest/Gap chips |
| `frontend/lib/chart-quality-warnings.ts` | Rate warnings |

### PNG export

| File | Role |
|------|------|
| `frontend/lib/chart-png-capture.ts` | Canvg + canvas composite |
| `frontend/lib/chart-png-export-layout.ts` | Export dimensions |
| `frontend/lib/chart-png-export-session.ts` | `runChartPngExport` |
| `frontend/lib/chart-png-offscreen-host.tsx` | Offscreen portal |
| `frontend/lib/chart-png-export-svg-polish.ts` | SVG pre-polish |
| `frontend/lib/chart-png-export-text.ts` | Text contrast |
| `frontend/lib/chart-png-export-qa.ts` | Dev QA checks |

### PDF export

| File | Role |
|------|------|
| `frontend/lib/build-executive-pdf-input.ts` | Payload builder |
| `frontend/lib/pdf-enterprise-style.ts` | Print tokens |
| `frontend/lib/pdf-date-format.ts` | Date normalization |
| `frontend/lib/metric-value-format.ts` | Value formatting (axis vs appendix) |

### Session sync

| File | Role |
|------|------|
| `frontend/lib/auto-dashboard-session-sync.ts` | Overview → session snapshot builders |
| `frontend/lib/dashboard-chart-prefill-match.ts` | Ask AI prefill from dashboard |

---

## 4. Layout-related CSS files

### Primary stylesheet

| File | Chart-related sections |
|------|------------------------|
| `frontend/app/globals.css` | `--chart-axis-line`, `--overview-dash-grid-*`, `.overview-dash-chart-card`, `.ai-insights-viz-plot`, `.charts-tab-viz-plot-*`, `.pdf-chart-capture`, dark viz layers |

### Token modules (Tailwind class strings)

| File | Scope |
|------|-------|
| `frontend/lib/ai-insights-ui.ts` | Insights viz card, plot surface, meta chips, action buttons |
| `frontend/lib/charts-tab-ui.ts` | Charts page, timeline, intel strip, plot stage |
| `frontend/lib/overview-ui.ts` | Overview cards, filters, dash chart actions |
| `frontend/lib/export-tab-ui.ts` | Export tab layout |
| `frontend/lib/data-preview-ui.ts` | Data Preview (no charts) |
| `frontend/lib/ui-buttons.ts` | Shared `saas-btn-premium` / accent |

### Key CSS variables (globals.css)

| Token | Used by |
|-------|---------|
| `--chart-axis-line` | Recharts grid + axis lines |
| `--chart-axis-tick` | Tick text fill |
| `--overview-dash-grid-stroke` | Cartesian grid stroke |
| `--overview-dash-grid-opacity` | Grid opacity |
| `--insights-viz-plot-h` | Plot height (Insights + Charts) |
| `--insights-answer-label` / `--insights-answer-body` | Dark metadata chips |

---

## 5. Test files (chart-related)

| File | Focus |
|------|-------|
| `frontend/lib/shared-chart-layout.test.ts` | Plot band, detail height |
| `frontend/lib/chart-layout-config.test.ts` | Margins, viewport classes |
| `frontend/lib/chart-axis-layout.test.ts` | Axis plans |
| `frontend/lib/chart-time-x-axis.test.ts` | Trend axis |
| `frontend/lib/final-chart-presentation-rate.test.ts` | Kind resolution |
| `frontend/lib/chart-png-export-layout.test.ts` | PNG dimensions |
| `frontend/lib/chart-png-export-session.test.ts` | Export session |
| `frontend/lib/chart-png-capture.test.ts` | Capture helpers |
| `frontend/lib/radial-export-layout.test.ts` | Donut export |
| `frontend/lib/overview-dashboard-plot-layout.test.ts` | Overview H-bar |
| `frontend/lib/phase7-pdf-generate.test.ts` | PDF generation |
| `backend/tests/test_auto_dashboard_opportunities.py` | Auto dashboard |
| `backend/tests/intent_engine/test_relationship_routing.py` | Correlation routing |

**Run:**

```bash
cd frontend && npm run test
cd backend && python run_tests.py -v
```

---

## 6. Baseline documentation (read before changing charts)

| Doc | Purpose |
|-----|---------|
| [`AGENTS.md`](../../AGENTS.md) | Agent rules — incremental fixes only |
| [`PROJECT_ARCHITECTURE_SUMMARY.md`](../../PROJECT_ARCHITECTURE_SUMMARY.md) | Full architecture |
| [`CHARTS_STABLE_SUMMARY.md`](../../CHARTS_STABLE_SUMMARY.md) | Charts tab baseline |
| [`AI_INSIGHTS_STABLE_SUMMARY.md`](../../AI_INSIGHTS_STABLE_SUMMARY.md) | Insights baseline |
| [`AI_VISUALIZATION_BEHAVIOR.md`](../../AI_VISUALIZATION_BEHAVIOR.md) | Kind selection rules |
| [`PDF_EXPORT_STABLE_BASELINE.md`](../../PDF_EXPORT_STABLE_BASELINE.md) | PDF baseline |
| [`UI_BASELINE_RULES.md`](../../UI_BASELINE_RULES.md) | UI hierarchy rules |

---

## 7. Files to avoid unless necessary

### High regression risk — do not touch for chart visual polish alone

| File | Why avoid |
|------|-----------|
| `backend/main.py` (routing order) | Reordering viz branches breaks AI routing tests |
| `frontend/lib/final-chart-presentation.ts` | Changes affect Charts + Insights + PDF parity |
| `frontend/contexts/chart-session-context.tsx` | Timeline integrity, dedupe keys |
| `frontend/lib/selected-visualization.ts` | Contract freeze semantics |
| `frontend/app/pdf-report.ts` | Pagination thresholds, footerY, page breaks |
| `frontend/lib/metric-value-format.ts` | Axis vs appendix formatting split |
| `frontend/lib/chart-question-intent.ts` | Insights alignment gates |
| `backend/intent_engine/correlation_routing_guard.py` | Scatter routing regressions |

### Broad redesign traps — fix narrowest layer instead

| File | Why avoid |
|------|-----------|
| `frontend/app/page.tsx` (whole-file refactor) | 14k+ lines; high merge conflict risk |
| `frontend/app/components/home/filter-panel.tsx` | Cross-tab 52px alignment |
| `frontend/app/components/app-shell/*` | Shell chrome unrelated to chart plot |
| `frontend/lib/overview-ui.ts` (unrelated tokens) | Overview card chrome vs plot internals |
| Data Preview modules | Out of chart polish scope |

### Safe primary targets for chart visual polish (when implementing)

| File | Likely scope |
|------|--------------|
| `frontend/app/components/home/chart-renderer.tsx` | Line/area/scatter Recharts branches |
| `frontend/lib/chart-time-x-axis.ts` | Trend axis bottom margin, tick density |
| `frontend/lib/shared-chart-layout.ts` | Detail plot band per kind |
| `frontend/lib/chart-layout-config.ts` | Line/area margin presets |
| `frontend/app/globals.css` | Plot height clamps (scoped selectors) |
| `frontend/lib/overview-dashboard-plot-layout.ts` | Overview axis/footer alignment only |

### Do not merge without explicit approval

| Change | Risk |
|--------|------|
| Merge Overview Pipeline B into `ChartRenderer` | Breaks mini-card layout |
| Force vertical layout on H-Bar | Violates baseline rule |
| Remove Insights alignment gates | Wrong charts in export |
| Replace shared vh band with unmeasured fluid layout | Responsive regression |
| Change chart type logic in backend for visual fixes | Frontend-only polish should not need this |

---

*Snapshot generated: 2026-06-16 — branch `chart-ui-polish-baseline` @ `4247ef3`.*
