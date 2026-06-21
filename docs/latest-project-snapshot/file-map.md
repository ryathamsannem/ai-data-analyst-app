# File Map — Chart System

**Snapshot date:** June 18, 2026  
**Purpose:** Important chart-related files, responsibilities, and dependency relationships for handoff.

---

## Dependency Graph (simplified)

```
backend/main.py
    ↓ API chart_type + rows
smart-chart-intelligence.ts (apiChartStringToKind)
    ↓
final-chart-presentation.ts (kind resolution)
    ↓
normalize-visualization-contract.ts
selected-visualization.ts (freeze contract)
    ↓
chart-session-context.tsx (snapshots)
    ↓
┌─────────────────────┬──────────────────────┐
│ page.tsx (Overview) │ chart-renderer.tsx   │
│ inline Recharts     │ Charts / Insights    │
└─────────────────────┴──────────────────────┘
    ↓                           ↓
chart-presentation-profile.ts   axis-presentation-plan.ts
    ↓
chart-capture-controller.ts → chart-png-capture.ts
    ↓
pdf-report.ts / PNG download
```

---

## Kind Resolution & Contracts

| Path | Responsibility | Depends on |
|------|----------------|------------|
| `frontend/lib/final-chart-presentation.ts` | **Canonical kind policy:** `resolveBarFamilyKind`, `computeFinalChartPresentation`, `computeAutoDashboardChartPresentation`, API kind mapping | `relationship-scatter-presentation`, `smart-chart-intelligence` |
| `frontend/lib/normalize-visualization-contract.ts` | Unified normalization; `resolveSnapshotPresentationKind` | `final-chart-presentation`, `selected-visualization` |
| `frontend/lib/selected-visualization.ts` | `VisualizationContract` type; `freezeVisualizationContract`; contract kind read | `final-chart-presentation`, `semantic-metric-engine` |
| `frontend/lib/smart-chart-intelligence.ts` | API string ↔ `ChartKind` | `chart-types` |
| `frontend/lib/relationship-scatter-presentation.ts` | Scatter vs time-series guards; temporal label detection | `chart-types` |
| `frontend/lib/resolve-bar-family-kind.test.ts` | Kind policy regression tests | vitest |

---

## Chart Platform (Phase 1–3)

| Path | Responsibility | Depends on |
|------|----------------|------------|
| `frontend/lib/chart-platform/chart-presentation-contract.ts` | Platform contract schema (identity, story, chips) | `chart-types` |
| `frontend/lib/chart-platform/build-chart-contract.ts` | Builds `ChartPresentationContract` from snapshot args | contract schema, metadata helpers |
| `frontend/lib/chart-platform/chart-contract-metadata.ts` | Chip building, semantic header fallback | `chart-semantic-metadata` |
| `frontend/lib/chart-platform/chart-presentation-profile.ts` | Read-only profiles per surface; PDF embed policy | `chart-png-export-layout`, `axis-presentation-plan` |
| `frontend/lib/chart-platform/chart-artifact.ts` | Request/artifact/diagnostic types | profile types |
| `frontend/lib/chart-platform/chart-capture-controller.ts` | Request builder; `captureChartPngArtifact`; content-tight PDF composite | capture readiness, png capture |
| `frontend/lib/chart-platform/chart-capture-readiness.ts` | Kind-aware DOM readiness (marks, dimensions, stability) | — |
| `frontend/lib/chart-platform/axis-presentation-plan.ts` | Axis plan resolution; `resolveVerticalBarValueAxisProps`, H-Bar props | `chart-axis-layout`, `overview-bar-value-domain` |
| `frontend/app/components/chart-platform/ChartCaptureHost.tsx` | Offscreen portal for artifact capture | session/page wiring |

---

## Rendering Surfaces

| Path | Responsibility | Depends on |
|------|----------------|------------|
| `frontend/app/page.tsx` | **Monolithic orchestrator:** all tabs, Overview inline charts, hidden PDF roots, export triggers, AI gates | Most chart libs + contexts |
| `frontend/app/components/home/chart-renderer.tsx` | Shared Recharts renderer (Charts, Insights, PNG/PDF capture) | axis layout, axis plan, shared layout, time axis |
| `frontend/app/components/ai-insight-chart-shell.tsx` | AI Insights chart card shell | viewport wrapper |
| `frontend/app/components/home/chart-insight-viewport-wrapper.tsx` | Kind-specific max-width viewport | `chart-layout-config` |
| `frontend/app/components/home/chart-metadata-chip-row.tsx` | Contract chip row (live surfaces) | presentation contract |
| `frontend/app/chart-types.ts` | `ChartKind`, `ChartRow` types | — |

**Edit guidance:** `page.tsx` is high-risk (~14k lines). Narrow changes only. Do not migrate Overview to `ChartRenderer` without explicit scope.

---

## Layout & Axis Helpers

| Path | Responsibility |
|------|----------------|
| `frontend/lib/shared-chart-layout.ts` | Session detail plot band; `resolveSharedDetailPlotHeight`; V-Bar constants |
| `frontend/lib/chart-layout-config.ts` | Viewport classes; `resolveDetailPlotHeight`; Charts tab height |
| `frontend/lib/chart-axis-layout.ts` | Margin planning, H-Bar axis layout, vertical value axis width |
| `frontend/lib/chart-time-x-axis.ts` | Trend X-axis ticks, angles, bottom margin |
| `frontend/lib/overview-dashboard-plot-layout.ts` | Overview mini category plan, live plot boosts, H-Bar live margins |
| `frontend/lib/overview-bar-value-domain.ts` | Bar/H-Bar/V-Bar value domain rounding |
| `frontend/lib/overview-premium-axis-domain.ts` | Premium line/scatter/trend axis scales (Overview + session) |
| `frontend/lib/radial-export-layout.ts` | Donut/Pie export canvas and radii |
| `frontend/lib/radial-chart-format.ts` | Radial tooltip/value formatting |

---

## PNG Export

| Path | Responsibility |
|------|----------------|
| `frontend/lib/chart-png-export-layout.ts` | Canvas width/height/plot height by kind; `buildPresentationExportSpec` |
| `frontend/lib/chart-png-capture.ts` | SVG→PNG composite (header, plot, footer) |
| `frontend/lib/chart-png-export-session.ts` | Session PNG wrapper; `resolveChartsPngExportKind` |
| `frontend/lib/chart-png-export-qa.ts` | Export constant validation |
| `frontend/lib/chart-png-export-svg-polish.ts` | SVG post-processing for capture |
| `frontend/lib/overview-dashboard-export.ts` | Overview PNG constants and parity validators |
| `frontend/lib/chart-png-offscreen-host.ts` | Offscreen host utilities |

---

## PDF Export

| Path | Responsibility |
|------|----------------|
| `frontend/app/pdf-report.ts` | jsPDF report; chart embed; native chips; legacy fallback |
| `frontend/lib/build-executive-pdf-input.ts` | Assembles PDF input from app/chart context |
| `frontend/lib/pdf-enterprise-style.ts` | Theme, spacing, `computePdfChartEmbedDimensions` |
| `frontend/lib/pdf-executive-content.ts` | Executive narrative content plan |
| `frontend/lib/resolve-pdf-export-context.ts` | Active chart / insight context for export |
| `frontend/lib/pdf-export-quota.ts` | PDF quota preflight |
| `frontend/lib/phase7-pdf-generate.test.ts` | PDF generation regression (generates validation PDFs) |

---

## Session & Sync

| Path | Responsibility |
|------|----------------|
| `frontend/contexts/chart-session-context.tsx` | Chart history, selection, contracts on snapshots |
| `frontend/lib/auto-dashboard-session-sync.ts` | Push Overview mini charts into session |
| `frontend/lib/canonical-chart-title.ts` | Title normalization and trend titles |
| `frontend/lib/chart-semantic-metadata.ts` | Metric chips, grain labels, semantic headers |

---

## Backend

| Path | Responsibility |
|------|----------------|
| `backend/main.py` | All routes; `build_smart_chart`; `/ask` viz; `_chart_type_for_api`; global `df` |
| `backend/analytics_metadata.py` | Metric/chart title builders |
| `backend/services/auto_dashboard_opportunities.py` | Auto-dashboard chart opportunities |
| `backend/intent_engine/` | Intent routing (correlation, geographic, etc.) |
| `backend/services/file_parsers.py` | Upload parsing |
| `backend/tests/` | Backend regression tests |

---

## Test Files (chart-focused)

| Path | Covers |
|------|--------|
| `resolve-bar-family-kind.test.ts` | Kind policy |
| `shared-chart-layout.test.ts` | Detail plot heights |
| `overview-dashboard-plot-layout.test.ts` | Overview layout boosts |
| `chart-presentation-profile.test.ts` | Profiles + PDF embed |
| `chart-capture-controller.test.ts` | Content-tight composite |
| `axis-presentation-plan.test.ts` | Axis plans + V-Bar props |
| `overview-bar-value-domain.test.ts` | Value domains |
| `overview-premium-axis-domain.test.ts` | Trend/scatter domains |
| `chart-png-export-layout.test.ts` | Export dimensions |
| `normalize-visualization-contract.test.ts` | Contract normalization |
| `chart-png-export-qa.test.ts` | Export QA constants |

---

## Root Baseline Docs (outside this folder)

| Path | Role |
|------|------|
| `PROJECT_ARCHITECTURE_SUMMARY.md` | Full-stack architecture |
| `AGENTS.md` | Agent/coding baseline rules |
| `CHARTS_STABLE_SUMMARY.md` | Charts tab stable behaviors |
| `AI_INSIGHTS_STABLE_SUMMARY.md` | Insights stable behaviors |
| `PDF_EXPORT_STABLE_BASELINE.md` | PDF export baseline |
| `AI_VISUALIZATION_BEHAVIOR.md` | AI viz behavior spec |

---

## Standard Validation

```bash
cd frontend && npm run test
cd frontend && npm run build
cd backend && python -m pytest -q   # when backend changes
```
