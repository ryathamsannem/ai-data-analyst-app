# File Map

**Snapshot date:** June 17, 2026  
**Purpose:** Important ownership files and safe edit boundaries after chart/export platform phases.

---

## Chart Platform

| Path | Role |
|------|------|
| `frontend/lib/chart-platform/chart-presentation-contract.ts` | Contract schema: identity, kind, story, semantics, metadata chips |
| `frontend/lib/chart-platform/build-chart-contract.ts` | Contract builder |
| `frontend/lib/chart-platform/chart-contract-metadata.ts` | Metadata/chip conversion helpers |
| `frontend/lib/chart-platform/chart-presentation-profile.ts` | Read-only profile layer and PDF embed policy |
| `frontend/lib/chart-platform/chart-artifact.ts` | Capture request/artifact/diagnostics types |
| `frontend/lib/chart-platform/chart-capture-controller.ts` | Capture request builder and artifact capture controller |
| `frontend/lib/chart-platform/chart-capture-readiness.ts` | Chart-kind-aware readiness checks |
| `frontend/app/components/chart-platform/ChartCaptureHost.tsx` | Offscreen portal host for artifact capture |

Tests:

| Path | Role |
|------|------|
| `frontend/lib/chart-platform/build-chart-contract.test.ts` | Contract builder tests |
| `frontend/lib/chart-platform/chart-presentation-profile.test.ts` | Profile and PDF embed policy tests |
| `frontend/lib/chart-platform/chart-capture-readiness.test.ts` | Readiness behavior tests |

---

## Rendering Surfaces

| Path | Role |
|------|------|
| `frontend/app/page.tsx` | Main app orchestration; Overview inline charts; hidden PDF capture roots; export assembly |
| `frontend/app/components/home/chart-renderer.tsx` | Shared Charts/AI/PDF artifact renderer |
| `frontend/app/components/ai-insight-chart-shell.tsx` | AI/chart shell framing |
| `frontend/app/components/home/chart-insight-viewport-wrapper.tsx` | Kind-specific viewport caps |
| `frontend/app/components/home/chart-metadata-chip-row.tsx` | Contract chip row for app surfaces |

Edit guidance:

- `page.tsx` is high-risk; make narrow changes only.
- Do not refactor Overview inline chart rendering without explicit scope.
- Do not change H-Bar/Donut renderer branches unless explicitly requested.

---

## Layout / Axis / Presentation Helpers

| Path | Role |
|------|------|
| `frontend/lib/chart-png-export-layout.ts` | Existing PNG/capture dimensions; mirrored by profile layer |
| `frontend/lib/chart-layout-config.ts` | Shared viewport and shell layout constants |
| `frontend/lib/shared-chart-layout.ts` | Session/detail plot band metrics |
| `frontend/lib/chart-axis-layout.ts` | Axis width and margin planning |
| `frontend/lib/chart-time-x-axis.ts` | Trend X-axis labels and bottom margin |
| `frontend/lib/overview-dashboard-plot-layout.ts` | Overview mini-card plot sizing/layout |
| `frontend/lib/overview-bar-value-domain.ts` | Overview bar/H-Bar value domain logic |
| `frontend/lib/overview-premium-axis-domain.ts` | Premium line/scatter axis helpers |
| `frontend/lib/radial-export-layout.ts` | Donut/Pie export plot/canvas sizing and radii |

Current gap:

- Axis/domain parity is not centralized yet. Future Phase 3B should add an `AxisPresentationPlan` rather than patching individual surfaces.

---

## PNG Export

| Path | Role |
|------|------|
| `frontend/lib/chart-png-capture.ts` | SVG/canvas capture and PNG composite |
| `frontend/lib/chart-png-export-session.ts` | Compatibility wrapper over artifact capture |
| `frontend/lib/chart-png-export-qa.ts` | PNG QA constants/checks |
| `frontend/lib/overview-dashboard-export.ts` | Overview PNG parity helpers and Overview export constants |

Ownership:

- Capture request/readiness/host: chart platform.
- Actual chart render tree: surface-specific.
- PNG composite chrome: `chart-png-capture.ts`.

---

## PDF Export

| Path | Role |
|------|------|
| `frontend/app/pdf-report.ts` | jsPDF report generation, PDF-native chips, chart artifact embed/fallback |
| `frontend/lib/build-executive-pdf-input.ts` | PDF input assembly from app/chart context |
| `frontend/lib/pdf-enterprise-style.ts` | PDF style constants and chart image sizing helper |
| `frontend/lib/pdf-executive-content.ts` | Executive narrative content plan |
| `frontend/lib/resolve-pdf-export-context.ts` | Resolves active/session/insight chart context |
| `frontend/lib/pdf-export-quota.ts` | PDF quota preflight logic |

Ownership:

- Chart image source: `ChartArtifact` first, legacy `captureEl` fallback.
- PDF chart header chips: contract metadata rendered natively by `pdf-report.ts`.
- PDF chart embed sizing: `pdfChart.presentationProfile.pdfEmbed` plus `computePdfChartEmbedDimensions()`.

---

## Session / Context

| Path | Role |
|------|------|
| `frontend/contexts/chart-session-context.tsx` | Chart history, selected chart, attached presentation contracts |
| `frontend/lib/auto-dashboard-session-sync.ts` | Sync Overview dashboard charts into session snapshots |
| `frontend/lib/final-chart-presentation.ts` | Final chart kind/presentation classification |
| `frontend/lib/canonical-chart-title.ts` | Canonical chart title helpers |

---

## Backend

| Path | Role |
|------|------|
| `backend/main.py` | API routes, global dataset state, visualization/narrative paths |
| `backend/services/auto_dashboard_opportunities.py` | Auto-dashboard chart opportunities and coverage telemetry |
| `backend/intent_engine/` | Intent routing |
| `backend/services/file_parsers.py` | Upload parsing |
| `backend/services/executive_kpi_cards.py` | KPI generation |
| `backend/tests/` | Backend regression tests |

Avoid broad edits to `backend/main.py` unless the task explicitly targets backend architecture.

---

## Snapshot Docs

| Path | Role |
|------|------|
| `docs/latest-project-snapshot/current-status.md` | Current stable status |
| `docs/latest-project-snapshot/architecture-summary.md` | Architecture and ownership summary |
| `docs/latest-project-snapshot/export-platform-status.md` | PNG/PDF export platform status |
| `docs/latest-project-snapshot/open-issues.md` | Current known issues and next priorities |
| `docs/latest-project-snapshot/file-map.md` | This file |

---

## Standard Validation Commands

```bash
cd frontend && npm run test
cd frontend && npm run build
```

Backend targeted validation when backend changes:

```bash
cd backend && python -m pytest -q
```
