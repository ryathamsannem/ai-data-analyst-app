# Export System Summary

**Snapshot date:** June 18, 2026  
**Scope:** PNG and PDF chart export architecture, sizing rules, and parity guarantees.

---

## Architecture Overview

Both PNG and PDF chart export share a **unified artifact capture platform**. Live UI renders first; export mounts an offscreen copy (or reuses hidden roots), waits for chart-kind-aware readiness, captures to PNG, and optionally embeds in PDF.

```
User action (Export PNG / Generate PDF)
        ↓
buildChartPngCaptureRequest(profile, contract, kind, spec)
        ↓
ChartCaptureHost (offscreen) or hidden PDF root in page.tsx
        ↓
waitForBasicChartCaptureReady() — marks, dimensions, stability
        ↓
captureElementToPng() — composite header + SVG plot + footer
        ↓
ChartArtifact { dataUrl, presentationProfile, diagnostics }
        ↓
PNG download  OR  pdf-report.ts embedChartImage()
```

---

## PNG Architecture

### Profiles

| Profile ID | Trigger | Renderer |
|------------|---------|----------|
| `overviewPng` | Overview card export button | Inline Recharts in `page.tsx` (`pngCapture=true`) |
| `chartsPng` | Charts tab export | `ChartRenderer` (`pngCaptureMode=true`) |

### Core files

| File | Role |
|------|------|
| `chart-artifact.ts` | Request/artifact types |
| `chart-capture-controller.ts` | Request builder + `captureChartPngArtifact()` |
| `chart-capture-readiness.ts` | Readiness polling and diagnostics |
| `ChartCaptureHost.tsx` | Offscreen React portal |
| `chart-png-capture.ts` | html2canvas/SVG composite |
| `chart-png-export-session.ts` | High-level session export API |
| `chart-png-export-layout.ts` | Dimension tables |
| `overview-dashboard-export.ts` | Overview-specific export constants + parity checks |

### Capture readiness (Phase 2C)

Waits until:

- Host root mounted and request still current
- Root, container, SVG non-zero dimensions
- Chart-kind visible marks present (bar rect, line path, pie sector, scatter point, …)
- Layout stable across animation frames

Failure produces diagnostic timeline (dev console: `[png-export-parity]`, `[png-export-qa]`).

### PNG composite structure

1. **Header** — title, optional warning, metadata chips (from contract)
2. **Plot** — Recharts SVG capture
3. **Footer** — dataset name via `buildPngExportFooterText()`

Fixed **composite canvas** dimensions pad the card frame (except PDF content-tight path — see below).

---

## PDF Architecture

### Profile

| Profile ID | Trigger | Renderer |
|------------|---------|----------|
| `pdfChart` | Executive PDF generation with chart section | Hidden Insights-style tree in `page.tsx` |

### Flow

1. `resolvePdfExportContext()` selects active insight/session chart.
2. `buildChartPngCaptureRequest()` with `pdfChart` profile.
3. `captureChartPngArtifact()` → `ChartArtifact`.
4. `buildExecutivePdfExportInput()` passes artifact + contract chips.
5. `pdf-report.ts`:
   - Renders native metadata chips in chart header panel
   - Embeds artifact via `computePdfChartEmbedDimensions()`
   - Falls back to legacy `captureEl` if artifact missing/invalid

### PDF-native metadata (Phase 3C)

- Chips from `ChartPresentationContract.metadata.chips`
- Max 6 chips; blank filtered
- Does not replace rasterized plot — chart body remains PNG image

### Content-tight composite (scatter + vertical bar)

`pdfChartUsesContentTightComposite(profile, kind)` returns true for:

- `pdfChart` + `scatter`
- `pdfChart` + `bar`

When true, `captureElementToPng()` **omits** fixed `canvasWidthPx` / `canvasHeightPx` — captures content bounds only. Fixes small chart in large dark frame (original scatter issue; extended to V-Bar June 2026).

**Overview PNG and Charts PNG are unchanged** — they always use fixed composite canvas from `buildPresentationExportSpec()`.

---

## Current Sizing Rules

### PNG canvas dimensions (`chart-png-export-layout.ts`)

| Kind | Canvas width | Canvas height | Plot height (typical) |
|------|--------------|---------------|------------------------|
| Bar / histogram (default) | 1400px | 900px | max(420, canvas − 132 chrome) − 40 ≈ **728px** |
| Line / area / scatter | 1200px | 800px | ~**668px** |
| H-Bar | 1100px (≤10 cats) / 1300px (>10) | 900px | category-scaled, up to 1040px |
| Donut / pie | radial | radial | `resolveRadialExportPlotHeight(n)` |

Constants:

- `PRESENTATION_EXPORT_CHROME_PX = 132` — title, chips, padding
- `PRESENTATION_EXPORT_WIDTH_PX = 1400`
- `PRESENTATION_EXPORT_COMPACT_WIDTH_PX = 1200` — line/area/scatter

### Overview PNG-specific tuning (`overview-dashboard-export.ts`)

Export-only (live card uses separate live constants):

| Constant | Value |
|----------|-------|
| `OVERVIEW_PNG_EXPORT_VBAR_MAX_SIZE` | 52 |
| `OVERVIEW_PNG_EXPORT_HBAR_MAX_SIZE` | 48 |
| `OVERVIEW_PNG_EXPORT_AXIS_TICK_PX` | 14 |
| `OVERVIEW_PNG_EXPORT_MARGIN_BOTTOM_VBAR` | 22 |
| Bar category gap (≤6 cats) | 16% |

### Live session detail (`shared-chart-layout.ts`)

| Kind | Rule |
|------|------|
| V-Bar / histogram (n ≤ 6) | Plot floor **520px**, cap 580px |
| Line / area / scatter | Floor **560px** + 40px boost, cap 580px |
| H-Bar | 420 + n×24, cap 580px |
| Plot band | clamp(460px, 52vh, 560px); desktop 480–540px |

### Overview live vertical bar (June 2026 parity)

| Constant | Value |
|----------|-------|
| `OVERVIEW_VBAR_LIVE_PLOT_HEIGHT_BOOST_PX` | +28px |
| Live `maxBarSize` | 52 (matches PNG) |
| Live `barCategoryGap` | 16% for ≤6 categories |

### PDF embed policies (`resolvePdfChartEmbedPolicy`)

Applied via `presentationProfile.pdfEmbed` → `computePdfChartEmbedDimensions()`:

| Kind | maxHeightMm | minWidthRatio | Aspect bounds |
|------|-------------|---------------|---------------|
| H-Bar | 158 | 0.74 | default |
| **V-Bar** | **150** | **0.88** | default |
| Line / Area | 158 | 0.90 | 0.36 – 2.1 |
| Scatter | 150 | 0.92 | 0.62 – 1.55 |
| Donut / Pie | 108 | 0.58 | 0.42 – 1.6 |
| Default fallback | 145 | 0.78 | default |

Embed algorithm (`pdf-enterprise-style.ts`):

1. Scale to content width
2. Clamp height to `maxHeightMm`
3. Enforce min/max aspect ratio if set
4. Enforce `minWidthRatio × contentWidth` minimum width

---

## Presentation Profile Layer

Read-only descriptor built alongside capture request:

```typescript
ChartPresentationProfile {
  id: "overviewPng" | "chartsPng" | "pdfChart" | ...
  captureWidth, captureHeight, plotHeight
  canvasWidth, canvasHeight
  pdfEmbed?: { maxHeightMm, minWidthRatio, ... }
  axisPolicyId: string
  metadataMode: "contract-chips" | "pdf-native-context" | ...
  aspectPolicy: "compact-card" | "presentation-canvas" | "detail-viewport" | "pdf-embed"
}
```

**Profiles describe capture; they do not re-render charts.** Dev diagnostics compare profile pairs (Overview PNG vs Charts PNG, Charts PNG vs PDF) for axis policy and dimension mismatches.

---

## Parity Guarantees (current)

### What is guaranteed

| Guarantee | Mechanism |
|-----------|-----------|
| **Same chart kind** across surfaces for a session snapshot | `resolveBarFamilyKind` + frozen `VisualizationContract` + `displayKind` storage |
| **Same data rows** in export as session | Snapshot `chartData` / contract labels+series |
| **Non-blank PNG/PDF charts** when readiness passes | Artifact platform + kind marks |
| **V-Bar / histogram value-axis domain** on supported surfaces | `AxisPresentationPlan` + `resolveVerticalBarValueAxisProps` |
| **PDF chips match contract** | Native chip render from `presentationContract` |
| **PDF image sizing by kind** | `pdfEmbed` policy per kind |

### What is NOT fully guaranteed

| Gap | Reason |
|-----|--------|
| Pixel-identical Overview live vs Overview PNG | Separate renderer + export-only constants |
| Overview PNG vs Charts PNG pixel parity | Inline vs `ChartRenderer` pipelines |
| Identical axis tick fonts/spacing everywhere | Surface-specific tuning remains |
| H-Bar domain/ticks identical all surfaces | Partial axis plan coverage |
| Vector PDF charts | Raster PNG embed only |

### Six-surface validation matrix (manual)

For each chart scenario, verify:

1. Overview live  
2. Overview PNG  
3. Charts live  
4. Charts PNG  
5. AI Insights live  
6. PDF chart section  

**Reference scenarios:**

- 4-region revenue → vertical bar all six
- 7+ categories → H-Bar all six
- Time series → line/area
- Correlation question → scatter
- Composition share → donut/pie
- Distribution → histogram

---

## Export Ownership Map

| Layer | Owner file | Scope |
|-------|------------|-------|
| Request creation | `chart-capture-controller.ts` | Profile + spec + content-tight flag |
| Offscreen host | `ChartCaptureHost.tsx` | Portal mount |
| Readiness | `chart-capture-readiness.ts` | Poll until plottable |
| PNG bytes | `chart-png-capture.ts` | Composite PNG |
| Session API | `chart-png-export-session.ts` | Charts PNG kind resolution |
| PDF input | `build-executive-pdf-input.ts` | Artifact in PDF payload |
| PDF layout | `pdf-report.ts` | Pages, chips, embed, fallback |
| PDF sizing | `pdf-enterprise-style.ts` | mm dimensions |

---

## Phase History (export platform)

| Phase | Deliverable |
|-------|-------------|
| 2A | Artifact/request/readiness/controller model |
| 2B | Unified capture host; Overview + Charts PNG on same path |
| 2C | Kind-aware readiness + diagnostics |
| 2D | PDF consumes `ChartArtifact` first |
| 3A | `ChartPresentationProfile` + dev diagnostics |
| 3C | PDF-native metadata chips |
| 3D | PDF kind-aware embed sizing |
| Post-3D | V-Bar/histogram axis domain parity; bar-family kind unification; V-Bar presentation + PDF content-tight |

Phase 3B (full axis enforcement across all surfaces) remains **partial**.

---

## Validation

```bash
cd frontend && npm run test   # includes phase7-pdf-generate.test.ts
cd frontend && npm run build
```

`phase7-pdf-generate.test.ts` regenerates PDF fixtures under `docs/pdf-validation-screenshots/` — expect untracked PDFs after test run.

---

## Safe Change Boundaries

- Do not remove legacy PDF fallback without extended validation period.
- Do not change PNG canvas dimension tables without updating profile tests + QA constants.
- Content-tight composite is **PDF-only** for `scatter` and `bar` — do not apply to Overview/Charts PNG without explicit approval.
- Preserve `resolveChartsPngExportKind` bar-family behavior (session kind, not Overview layout artifact).
