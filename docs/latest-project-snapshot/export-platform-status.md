# Export Platform Status

**Snapshot date:** June 17, 2026

---

## Summary

PNG and PDF chart export now share the same artifact capture platform.

The major export reliability problem, blank chart captures, has been addressed for both PNG and PDF by moving capture through `ChartPngCaptureRequest`, `ChartCaptureHost`, `captureChartPngArtifact()`, and chart-kind-aware readiness.

Visual parity is improved but not complete. Axis/domain parity remains the primary open issue.

---

## PNG Export Platform

### Current Status

Overview PNG and Charts PNG now use:

- shared capture request model
- shared offscreen host
- shared readiness checks
- shared artifact output model

Core files:

- `frontend/lib/chart-platform/chart-artifact.ts`
- `frontend/lib/chart-platform/chart-capture-controller.ts`
- `frontend/lib/chart-platform/chart-capture-readiness.ts`
- `frontend/app/components/chart-platform/ChartCaptureHost.tsx`
- `frontend/lib/chart-png-capture.ts`
- `frontend/lib/chart-png-export-session.ts`
- `frontend/lib/chart-png-export-layout.ts`

### Readiness Checks

Capture waits for:

- host root mounted
- request still current
- root dimensions non-zero
- responsive container dimensions non-zero when present
- primary chart SVG dimensions non-zero
- chart-kind visible marks
- stable layout across frames

Kind-specific marks:

- H-Bar / Bar / Histogram: visible bar rect/path
- Line: visible curve path or dot fallback
- Area: visible area/curve path or dot fallback
- Donut/Pie: visible sector path
- Scatter: visible point/symbol

### Known PNG Gaps

- Overview PNG and Charts PNG can still differ visually due to axis/domain policy ownership.
- Overview is still inline Recharts; Charts PNG uses `ChartRenderer`.
- `ChartPresentationProfile` diagnostics identify mismatches but do not yet enforce parity.

---

## PDF Export Platform

### Current Status

PDF chart export now prefers a `ChartArtifact`:

1. `page.tsx` mounts the existing hidden PDF chart root.
2. A `pdfChart` capture request is created.
3. `captureChartPngArtifact()` captures and validates the chart.
4. `buildExecutivePdfExportInput()` receives `chartArtifact`.
5. `pdf-report.ts` embeds valid artifact data URL.
6. Legacy `captureEl` capture remains as fallback.

Core files:

- `frontend/app/page.tsx`
- `frontend/app/pdf-report.ts`
- `frontend/lib/build-executive-pdf-input.ts`
- `frontend/lib/pdf-enterprise-style.ts`
- chart platform files listed above

### PDF Metadata/Header Chips

PDF chart headers now consume `ChartPresentationContract.metadata.chips`.

Behavior:

- PDF-native chips are drawn in the existing chart header panel.
- Blank chips are filtered.
- Chips are capped to six.
- Missing chips are safe; PDF falls back to the previous header behavior.

### PDF Embed Sizing

PDF uses `chartArtifact.presentationProfile.pdfEmbed` when available.

Current `pdfChart` embed policy:

| Kind | Behavior |
|------|----------|
| H-Bar | Current/stable placement |
| Bar | Near-current placement |
| Donut/Pie | Smaller max height and lower width ratio |
| Line/Area | Wider placement with more breathing room |
| Scatter | Larger, more balanced placement |

PDF frame design is unchanged.

---

## Phase 2A-2D Completed Work

| Phase | Result |
|-------|--------|
| 2A | Added artifact/request/readiness/controller model |
| 2B | Added shared PNG capture host and unified Overview/Charts PNG request flow |
| 2C | Added chart-kind-aware readiness and diagnostics |
| 2D | PDF consumes `ChartArtifact` before legacy fallback |

---

## Phase 3A-3D Completed Work

| Phase | Result |
|-------|--------|
| 3A | Added read-only `ChartPresentationProfile` and diagnostics |
| 3C | Added PDF-native metadata chip parity |
| 3D | Added PDF chart-kind-aware embed sizing |

Note: Phase 3B axis/domain parity has not been implemented yet.

---

## Export Ownership Map

| Layer | Owner | Current scope |
|-------|-------|---------------|
| Export request | `chart-capture-controller.ts` | Creates capture request and profile |
| Capture host | `ChartCaptureHost.tsx` | Offscreen root for artifact capture |
| Readiness | `chart-capture-readiness.ts` | Chart-kind-aware DOM readiness |
| PNG composite | `chart-png-capture.ts` | Header/plot/legend/footer PNG composition |
| PDF input | `build-executive-pdf-input.ts` | Carries artifact/chips to report |
| PDF embed | `pdf-report.ts` | PDF-native header, frame, image placement, fallback |
| PDF sizing helper | `pdf-enterprise-style.ts` | Computes final report image dimensions |

---

## Validation

Latest commands:

```bash
cd frontend && npm run test
cd frontend && npm run build
```

Latest result:

- Tests passed: 67 files / 501 tests
- Production build passed

Running the full test suite regenerates PDF validation artifacts in `docs/pdf-validation-screenshots/`.
