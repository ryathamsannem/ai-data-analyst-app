# File Map — Chart & Export System

**Snapshot date:** June 21, 2026  
**Purpose:** Important chart-related files, responsibilities, and dependency relationships.

---

## Dependency Graph (simplified)

```
backend/main.py
    ↓ API chart_type + rows
intent_engine/ (histogram, share/composition, executive guards)
    ↓
smart-chart-intelligence.ts (apiChartStringToKind)
    ↓
final-chart-presentation.ts (kind resolution, resolveBarFamilyKind)
    ↓
normalize-visualization-contract.ts
selected-visualization.ts (freeze contract)
    ↓
chart-session-context.tsx (snapshots)
    ↓
┌─────────────────────┬──────────────────────┐
│ page.tsx (Overview) │ chart-renderer.tsx   │
│ inline Recharts     │ Charts / Insights    │
│ + ChartRenderer     │ Overview PNG radial  │
└─────────────────────┴──────────────────────┘
    ↓                           ↓
chart-presentation-profile.ts   radial-export-layout.ts
    ↓                           overview-mini-radial-polish.ts
chart-capture-controller.ts → chart-png-capture.ts
    ↓
pdf-report.ts / PNG download
```

---

## Kind Resolution & Contracts

| Path | Responsibility |
|------|----------------|
| `frontend/lib/final-chart-presentation.ts` | **Canonical kind policy:** `resolveBarFamilyKind`, `computeFinalChartPresentation`, `shareCompositionAllowed` |
| `frontend/lib/normalize-visualization-contract.ts` | Unified normalization; `resolveSnapshotPresentationKind` |
| `frontend/lib/selected-visualization.ts` | `VisualizationContract`; `freezeVisualizationContract` |
| `frontend/lib/smart-chart-intelligence.ts` | API string ↔ `ChartKind` |
| `frontend/lib/relationship-scatter-presentation.ts` | Scatter vs time-series guards |
| `frontend/lib/resolve-bar-family-kind.test.ts` | Kind policy regression |
| `frontend/lib/final-chart-presentation-rate.test.ts` | Share/rate presentation routing |

---

## Chart Platform (Export Artifact System)

| Path | Responsibility |
|------|----------------|
| `frontend/lib/chart-platform/chart-presentation-contract.ts` | Platform contract schema |
| `frontend/lib/chart-platform/build-chart-contract.ts` | Builds contract from snapshot args |
| `frontend/lib/chart-platform/chart-presentation-profile.ts` | Surface profiles; `resolvePdfChartEmbedPolicy` |
| `frontend/lib/chart-platform/chart-artifact.ts` | Request/artifact/diagnostic types |
| `frontend/lib/chart-platform/chart-capture-controller.ts` | `captureChartPngArtifact`; content-tight PDF composite |
| `frontend/lib/chart-platform/chart-capture-readiness.ts` | Kind-aware DOM readiness |
| `frontend/lib/chart-platform/axis-presentation-plan.ts` | Axis plans; V-Bar/H-Bar props |
| `frontend/app/components/chart-platform/ChartCaptureHost.tsx` | Offscreen portal for capture |

---

## Radial / Donut / Pie

| Path | Responsibility |
|------|----------------|
| `frontend/lib/radial-export-layout.ts` | **Export + live radii constants;** `resolveProportionalSessionRadialRadii`, `resolveProportionalExportRadialRadii`, `resolveRadialChartRadii`, canvas height estimates |
| `frontend/lib/radial-export-layout.test.ts` | Occupancy bands, export vs live separation |
| `frontend/lib/overview-mini-radial-polish.ts` | Overview live compact scale (1.24×), margin tighten |
| `frontend/lib/radial-chart-format.ts` | Share validation, tooltip formatting, `radialShareDisplayAllowed` |
| `frontend/lib/chart-quality-warnings.ts` | Rate>100% warning; `resolveRateExceeds100Warning` for share donuts |
| `frontend/app/components/home/chart-renderer.tsx` | Pie/donut rendering; `overviewMiniRadial` path; export legend tokens when `pngCaptureMode` |

---

## Rendering Surfaces

| Path | Responsibility |
|------|----------------|
| `frontend/app/page.tsx` | **Monolithic orchestrator:** Overview inline charts, hidden PDF roots, export triggers, AI gates, rate warnings |
| `frontend/app/components/home/chart-renderer.tsx` | Shared Recharts renderer (Charts, Insights, PNG/PDF capture, Overview radial) |
| `frontend/app/components/ai-insight-chart-shell.tsx` | AI Insights chart card shell |
| `frontend/app/chart-types.ts` | `ChartKind`, `ChartRow` |

**Edit guidance:** Narrow changes in `page.tsx`. Do not migrate Overview cartesian charts to `ChartRenderer` without explicit scope.

---

## Layout & Axis Helpers

| Path | Responsibility |
|------|----------------|
| `frontend/lib/shared-chart-layout.ts` | Session detail plot band; `resolveSharedDetailPlotHeight` |
| `frontend/lib/chart-layout-config.ts` | Viewport classes; radial outer margins |
| `frontend/lib/chart-axis-layout.ts` | Margins, H-Bar layout, pie pad |
| `frontend/lib/chart-time-x-axis.ts` | Trend X-axis ticks |
| `frontend/lib/overview-dashboard-plot-layout.ts` | Overview category plan, live plot boosts (+28/+36px) |
| `frontend/lib/overview-bar-value-domain.ts` | Bar/H-Bar/V-Bar value domain |
| `frontend/lib/overview-premium-axis-domain.ts` | Line/area/scatter axis domains |

---

## PNG Export

| Path | Responsibility |
|------|----------------|
| `frontend/lib/chart-png-export-layout.ts` | Canvas dimensions; `buildPresentationExportSpec`; radial canvas height |
| `frontend/lib/chart-png-capture.ts` | SVG→PNG composite; **`renderLegendChromeToPng`**; radial footer; `RADIAL_EXPORT_PLOT_WIDTH_UTIL` |
| `frontend/lib/chart-png-export-session.ts` | Session PNG; `resolveChartsPngExportKind` |
| `frontend/lib/chart-png-export-qa.ts` | Export constant validation (non-radial footer 15px floor) |
| `frontend/lib/overview-dashboard-export.ts` | Overview PNG constants, parity validators |

---

## PDF Export

| Path | Responsibility |
|------|----------------|
| `frontend/app/pdf-report.ts` | jsPDF report; artifact embed; legacy fallback |
| `frontend/lib/build-executive-pdf-input.ts` | PDF input assembly |
| `frontend/lib/pdf-enterprise-style.ts` | Theme, `computePdfChartEmbedDimensions` |
| `frontend/lib/phase7-pdf-generate.test.ts` | PDF regression (writes validation PDFs) |

---

## Backend Routing

| Path | Responsibility |
|------|----------------|
| `backend/main.py` | `/ask` viz pipeline; histogram intent; pie/donut upgrade; global `df` |
| `backend/intent_engine/dimension_request.py` | `question_asks_categorical_share_composition`, dimension phrase extraction |
| `backend/intent_engine/executive_ambiguous_intent.py` | Executive routing; share guards; `pick_executive_breakdown_column` |
| `backend/intent_engine/routing_consistency.py` | Routing consistency helpers |
| `backend/services/auto_dashboard_opportunities.py` | Auto-dashboard opportunities; share titles |
| `backend/tests/test_histogram_intent_routing.py` | Histogram routing regression |
| `backend/tests/intent_engine/test_donut_pie_share_routing.py` | Share/composition donut routing regression |

---

## AI Insights

| Path | Responsibility |
|------|----------------|
| `frontend/lib/ai-follow-up-suggestions.ts` | Follow-up chip generation |
| `frontend/lib/suggested-follow-up-continuation.ts` | Drill-down vs new analysis classifier |
| `frontend/lib/normalized-viz-metadata.ts` | Confidence, grain, metric normalization |
| `frontend/lib/pdf-executive-content.ts` | PDF narrative blocks including confidence |

---

## Test Files (chart-focused)

| Path | Covers |
|------|--------|
| `radial-export-layout.test.ts` | Live vs export occupancy; legend token floors |
| `overview-mini-radial-polish.test.ts` | Overview live radial scale |
| `radial-chart-format.test.ts` | Share percent validation |
| `chart-quality-warnings.test.ts` | Rate warning + share suppression |
| `resolve-bar-family-kind.test.ts` | Bar family policy |
| `shared-chart-layout.test.ts` | Detail plot heights |
| `overview-dashboard-plot-layout.test.ts` | Overview layout boosts |
| `chart-presentation-profile.test.ts` | Profiles + PDF embed |
| `chart-capture-controller.test.ts` | Content-tight composite |
| `axis-presentation-plan.test.ts` | Axis plans + V-Bar props |
| `phase7-pdf-generate.test.ts` | End-to-end PDF generation |

---

## Snapshot Documentation (this folder)

| File | Purpose |
|------|---------|
| `current-status.md` | Baseline status, test counts, completed work |
| `system-understanding.md` | Architecture and routing flows |
| `chart-rendering-summary.md` | Rendering pipeline + radial constants |
| `open-issues.md` | Known issues and debt |
| `file-map.md` | This file |
| `export-platform-status.md` | Prior export platform notes (may predate this snapshot) |
| `architecture-summary.md` | Prior architecture notes |

**When updating:** Prefer editing the five files listed in the user request; cross-link older files if they diverge.
