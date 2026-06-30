# Architecture Summary

**Snapshot date:** June 17, 2026  
**Scope:** Current chart and export architecture after Phase 2A-2D and Phase 3A/3C/3D.

---

## Stack

| Layer | Technology / owner |
|-------|--------------------|
| Frontend | Next.js 16 App Router, React 19, Tailwind v4 |
| Charts | Recharts 3 |
| Backend | FastAPI, pandas, in-memory dataset per process |
| AI narrative | Claude via backend `/ask` |
| PNG capture | Canvg/canvas composite via unified capture platform |
| PDF | jsPDF report engine; chart images now prefer `ChartArtifact` |

---

## Current Frontend Shape

`frontend/app/page.tsx` remains the main orchestration file for:

- upload and dataset state
- Overview dashboard
- Data Preview
- AI Insights
- Charts tab
- Export/PDF assembly
- hidden/offscreen capture roots

The file is still high-risk for broad refactors. New chart platform code is intentionally placed in `frontend/lib/chart-platform/` to reduce future coupling.

---

## Chart Platform Layers

### 1. ChartPresentationContract

Owner files:

- `frontend/lib/chart-platform/chart-presentation-contract.ts`
- `frontend/lib/chart-platform/build-chart-contract.ts`
- `frontend/lib/chart-platform/chart-contract-metadata.ts`

Role:

- resolved chart identity and kind
- story type
- row/data metadata
- semantic axes/labels
- metadata chips
- compatibility flags showing render/export are still surface-owned

Consumers:

- Chart session snapshots
- metadata chip rows in UI
- PNG header extraction
- PDF-native chart header chips

### 2. ChartPresentationProfile

Owner files:

- `frontend/lib/chart-platform/chart-presentation-profile.ts`
- `frontend/lib/chart-platform/chart-presentation-profile.test.ts`

Profiles:

- `overviewLive`
- `overviewPng`
- `chartsLive`
- `chartsPng`
- `aiInsightsLive`
- `pdfChart`

Role:

- read-only surface/capture profile
- capture/canvas dimensions copied from existing specs
- aspect policy
- metadata mode
- axis policy id
- PDF embed policy by chart kind
- dev-only diagnostics for visual parity mismatches

Important: profiles do not own rendering, axis domains, or chart kind selection yet.

### 3. ChartArtifact Capture Platform

Owner files:

- `frontend/lib/chart-platform/chart-artifact.ts`
- `frontend/lib/chart-platform/chart-capture-controller.ts`
- `frontend/lib/chart-platform/chart-capture-readiness.ts`
- `frontend/app/components/chart-platform/ChartCaptureHost.tsx`

Role:

- unified request model for chart image capture
- offscreen host for PNG/PDF artifact capture
- chart-kind-aware readiness
- artifact object with image data URL, dimensions, diagnostics, and profile

Surfaces:

- Overview PNG
- Charts PNG
- PDF chart image

---

## Chart Rendering Ownership Map

| Surface | Renderer | Current owner | Notes |
|---------|----------|---------------|-------|
| Overview live cards | Inline Recharts in `page.tsx` | Overview pipeline | Separate compact pipeline; still surface-owned |
| Overview PNG | Existing Overview export render tree inside `ChartCaptureHost` | Overview pipeline + artifact platform | Uses unified capture request/host/readiness |
| Charts tab live | `ChartRenderer` | Session/detail pipeline | Uses detail layout and session state |
| Charts PNG | `ChartRenderer` inside `ChartCaptureHost` | Artifact platform + ChartRenderer | Same request/artifact flow as Overview PNG |
| AI Insights live | `ChartRenderer` with insight mode | Insight/detail pipeline | Gated by question/chart alignment |
| PDF chart | Captured artifact from hidden chart root | Artifact platform + PDF report embed | Prefers `ChartArtifact`, falls back to legacy DOM capture |

Stable renderer paths:

- H-Bar renderer branch remains stable.
- Donut/Pie renderer branch remains stable.
- Chart kind selection remains unchanged.
- Overview mini-card pipeline remains separate.

---

## Export Ownership Map

| Export | Capture owner | Render owner | Embed/composite owner |
|--------|---------------|--------------|-----------------------|
| Overview PNG | `chart-capture-controller.ts` | Overview offscreen JSX | `chart-png-capture.ts` composite |
| Charts PNG | `chart-capture-controller.ts` | `ChartRenderer` offscreen JSX | `chart-png-capture.ts` composite |
| PDF chart image | `chart-capture-controller.ts` | hidden PDF chart root | `pdf-report.ts` report frame |
| PDF report | `pdf-report.ts` | jsPDF native report sections | `pdf-report.ts` |

Legacy fallback:

- `chart-png-export-session.ts` remains as compatibility wrapper.
- PDF still keeps legacy `captureEl` and `captureChartPlotToPng()` fallback.

---

## Remaining Architecture Gaps

- Axis/domain policies are not centralized.
- Overview inline renderer and `ChartRenderer` still own separate axis behavior.
- `ChartPresentationProfile.axisPolicyId` currently diagnoses but does not enforce parity.
- PDF chart framing is profile-aware for image size, but full PDF layout is still report-owned.
- `page.tsx` remains a large monolith and is the highest frontend conflict risk.
