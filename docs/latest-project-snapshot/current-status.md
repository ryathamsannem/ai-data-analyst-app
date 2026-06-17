# Current Status

**Snapshot date:** June 17, 2026  
**Branch:** `DEV`  
**Latest commit at snapshot time:** `39d1065` — `Introduce unified PNG capture host`

---

## Stable Product Areas

- **Overview:** upload, KPI cards, filters, auto-dashboard cards, drill path, and per-card PNG export are functional.
- **Data Preview:** paginated preview, schema/quality metadata, search/sort, and profile popovers are stable.
- **AI Insights:** Ask AI, chart alignment gates, suggested questions, executive cards, AI Read, and insight PDF export remain active.
- **Charts tab:** timeline, selected chart preview, chart reason strip, SmartChartInsightPanel, and PNG export are functional.
- **Export/PDF:** executive PDF generation is functional and now consumes chart artifacts before falling back to legacy DOM capture.

---

## Chart Platform Status

The chart system now has three parallel platform layers:

1. **Presentation contract** — `ChartPresentationContract`
   - Owns chart identity, resolved kind, story, semantic labels, data metadata, and metadata chips.
   - Attached to chart session snapshots.
   - Consumed by UI metadata rows and PDF-native chips.

2. **Capture artifact platform** — `ChartPngCaptureRequest` + `ChartArtifact`
   - Used by Overview PNG, Charts PNG, and PDF chart image capture.
   - Provides readiness diagnostics and image artifacts.
   - Legacy export/capture paths remain as fallbacks where needed.

3. **Presentation profile** — `ChartPresentationProfile`
   - Read-only profile layer for surfaces: `overviewLive`, `overviewPng`, `chartsLive`, `chartsPng`, `aiInsightsLive`, `pdfChart`.
   - Describes capture/canvas dimensions, metadata mode, axis policy id, aspect policy, and PDF embed policy.
   - Used for diagnostics and PDF artifact embed sizing only; it does not change chart rendering or axes.

---

## Completed Phases

### Phase 2A/2B — Unified PNG Capture Platform

- Added chart artifact/request types.
- Added capture controller.
- Added unified capture host.
- Routed Overview PNG and Charts PNG through the same request/artifact flow.
- Kept existing renderers and chart kinds unchanged.

### Phase 2C — Chart-Kind-Aware PNG Readiness

- Replaced basic SVG-exists readiness with stronger readiness:
  - mounted host
  - current request
  - non-zero root/container/SVG dimensions
  - visible chart-kind marks
  - stable layout across frames
- Added diagnostics: mark count, SVG/root/container dimensions, timeline, failure reason.

### Phase 2D — PDF Consumes ChartArtifact

- Added `pdfChart` artifact profile/source.
- PDF export captures a chart artifact before input assembly.
- `pdf-report.ts` prefers valid artifact images and falls back to legacy capture.
- Blank PDF charts are no longer expected when artifact capture succeeds.

### Phase 3A — ChartPresentationProfile

- Added read-only profile resolver.
- Added dev-only profile diagnostics:
  - Overview PNG vs Charts PNG
  - Charts PNG vs PDF
  - axis policy mismatch
  - metadata mode mismatch
  - artifact dimensions by kind

### Phase 3C — PDF Metadata Chip Parity

- PDF chart section now receives `contract.metadata.chips`.
- PDF renders native chip pills in the chart header panel.
- Existing PDF page structure and chart artifact image remain unchanged.

### Phase 3D — PDF Embed Sizing By Chart Kind

- Added `pdfEmbed` policy to `pdfChart` profiles.
- PDF image placement uses chart-kind-aware embed policies:
  - H-Bar stable/current
  - Donut/Pie smaller
  - Line/Area wider
  - Scatter larger/balanced
  - Bar near current

---

## Validation Status

Latest frontend validation after Phase 3D:

| Command | Result |
|---------|--------|
| `cd frontend && npm run test` | Passed — 67 files / 501 tests |
| `cd frontend && npm run build` | Passed |

Manual validation reported:

- Overview PNG no longer blanks.
- Charts PNG no longer blanks.
- PDF chart images no longer blank.
- PDF H-Bar remains stable.
- PDF chips are visible.
- PDF chart placement is now profile-aware by kind.

---

## Current Working Tree Notes

The working tree contains current phase changes plus regenerated PDF validation artifacts under `docs/pdf-validation-screenshots/*.pdf` from `npm run test`.

Do not revert unrelated generated/user files without explicit approval.
