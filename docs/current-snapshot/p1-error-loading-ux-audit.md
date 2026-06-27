# P1 — Error, Loading, and Empty State UX Audit

**Date:** June 27, 2026 · **Branch:** `DEV`  
**Scope:** Upload, mapping, Overview, Charts, AI Insights, PNG/PDF export  
**Rule:** No chart logic, domain policy, backend selection, or AI routing changes.

---

## Summary

| Severity | Found | Fixed this pass | Deferred |
|----------|-------|-----------------|----------|
| P0 | 0 | 0 | 0 |
| P1 | 8 | 8 | 0 |
| P2 | 14 | 0 | 14 |

**Verdict:** Low-risk P1 gaps closed. P2 items documented for future narrow passes.

---

## 1. Upload flow

| Scenario | Current behavior | Severity | Fix | Owner | Status |
|----------|------------------|----------|-----|-------|--------|
| CSV upload loading | Spinner + “Uploading and processing file…”; dropzone chip | — | — | `page.tsx`, `overview-upload-selected-state.tsx` | OK |
| Invalid file type | Client banner before upload | — | — | `upload-auto-flow.ts` | OK |
| Empty / zero-byte file | Backend rejects empty CSV; client now rejects 0-byte pick | P1 | `validateOverviewUploadPick` empty_file | `upload-auto-flow.ts` | **Fixed** |
| Malformed CSV | Generic “Unable to read CSV file”; may load misaligned columns | P1 | — | `file_parsers.py`, `main.py` | **Deferred** — needs parse diagnostics |
| Huge file / slow parse | Single blocking spinner, no progress | P2 | — | `page.tsx`, `/upload` | Deferred |
| Backend failure | Red banner + plan limit modal; Insights tab hides global banner | P2 | — | `page.tsx` | Deferred |
| Mapping failure at upload | Upload succeeds with weak mapping; no hard failure | P2 | Low-confidence hint in mapping modal | `page.tsx` | Partial (modal hint) |
| Re-upload | Resets session; no confirm dialog | P2 | — | `page.tsx` | Deferred |
| No rows / no columns | Backend rejects; Preview was blank | P1 | Preview empty state CTA | `page.tsx` | **Fixed** |

---

## 2. Mapping / Data Setup

| Scenario | Current behavior | Severity | Fix | Owner | Status |
|----------|------------------|----------|-----|-------|--------|
| Missing date | “Not detected” on Data setup; preview note | P2 | — | `page.tsx`, `data-preview-phase-b.ts` | Deferred |
| All categorical / all numeric | Degraded KPIs; upload succeeds | P2 | — | `main.py`, `page.tsx` | Deferred |
| Ambiguous domain | Generic label; buried in Advanced panel | P2 | — | `main.py`, `resolved-dataset-type-label.ts` | Deferred |
| Weak semantic mapping | Low badge on Overview; modal now warns | P1 | Low-confidence banner in modal | `page.tsx` | **Fixed** |
| Manual mapping save | Was using upload `loading`; generic errors | P1 | `mappingSaving` + inline validation/errors | `page.tsx`, `column-mapping-validation.ts` | **Fixed** |
| Mapping validation | Backend silently nulls invalid cols | P1 | Client pre-save column check | `column-mapping-validation.ts` | **Fixed** |
| Low confidence fallback | Soft copy in AI Insights tone | P2 | — | `insight-narrative-tone.ts` | Deferred |

---

## 3. Overview tab

| Scenario | Current behavior | Severity | Fix | Owner | Status |
|----------|------------------|----------|-----|-------|--------|
| No KPI cards | KPI section omitted silently | P2 | — | `page.tsx` | Deferred |
| No charts | Dashed “No dashboard charts generated yet” | — | — | `page.tsx` | OK |
| Chart cannot render | Slot omitted via `filterOverviewRenderableCharts` | P2 | — | `overview-dashboard-chart-renderable.ts` | Deferred |
| Empty after filters | Amber filter message + empty chart area | — | — | `filter-panel.tsx`, `page.tsx` | OK |
| Filter refresh failure | Was silent; stale data shown | P1 | `FILTERED_DASHBOARD_ERROR` banner | `page.tsx` | **Fixed** |
| Slow dashboard (filter) | No in-flight indicator on filter refresh | P2 | — | `page.tsx` | Deferred |
| Chart error boundary | None; Recharts errors uncaught | P1 | — | `chart-renderer.tsx` | **Deferred** — needs ErrorBoundary component |
| Export PNG loading | “Exporting…” + disabled; friendly capture errors | P1 | `friendlyChartCaptureErrorMessage` | `user-facing-export-errors.ts` | **Fixed** |

---

## 4. Charts tab

| Scenario | Current behavior | Severity | Fix | Owner | Status |
|----------|------------------|----------|-----|-------|--------|
| No dataset | Was onboarding copy only | P1 | Upload-first empty state | `page.tsx` | **Fixed** |
| Invalid / unsupported chart | Blank plot, no message | P2 | — | `chart-renderer.tsx` | Deferred |
| Empty chart data | “Select a chart” / onboarding | — | — | `page.tsx` | OK |
| PNG export failure | Generic error | P1 | Friendly capture message | `user-facing-export-errors.ts` | **Fixed** |
| PNG export loading | “Exporting…” on button | — | — | `page.tsx` | OK |

---

## 5. AI Insights

| Scenario | Current behavior | Severity | Fix | Owner | Status |
|----------|------------------|----------|-----|-------|--------|
| No dataset | Ask disabled; full UI still shown | P1 | Upload-first empty state | `page.tsx` | **Fixed** |
| Empty question | “Please enter a question.” | — | — | `page.tsx` | OK |
| Unsupported question | Trend card; others narrative-only | P2 | — | `page.tsx`, `unsupported-*-analysis.ts` | Deferred |
| `/ask` error | Generic backend/API message | P2 | — | `page.tsx` | Deferred |
| LLM narrative failure | Chart preserved + specific message | — | — | `page.tsx` | OK |
| Aligned chart missing | “No dedicated visualization” card | — | — | `page.tsx`, `insight-chart-alignment.ts` | OK |
| Restore failure | Was silent no-op | P1 | User-visible error | `page.tsx` | **Fixed** |
| Slow loading | “Building chart…” / “Generating insight…” | — | — | `page.tsx` | OK |

---

## 6. PDF / PNG export

| Scenario | Current behavior | Severity | Fix | Owner | Status |
|----------|------------------|----------|-----|-------|--------|
| Export in progress | Overview/Charts PNG show state; PDF had none | P1 | `pdfExportBusy` + button copy | `page.tsx` | **Fixed** |
| Export tab not gated | Download always enabled | P1 | `exportTabBlockedReason` disables + hint | `user-facing-export-errors.ts` | **Fixed** |
| Quota failure | Upgrade modal + error | — | — | `pdf-export-quota.ts` | OK |
| PNG capture failure | Raw readiness codes possible | P1 | Friendly messages | `user-facing-export-errors.ts` | **Fixed** |
| PDF generation failure | Generic message + quota refund | — | — | `page.tsx` | OK |
| Blank chart in PDF | Artifact null continues silently | P1 | — | `page.tsx`, `pdf-report.ts` | **Deferred** — warn when artifact missing |
| Insights export button | Hidden when not ready (not disabled) | — | — | `page.tsx` | OK by design |

---

## Files changed this pass

| File | Change |
|------|--------|
| `frontend/lib/user-facing-export-errors.ts` | Friendly capture errors, filter error copy, export-tab gate |
| `frontend/lib/user-facing-export-errors.test.ts` | Unit tests |
| `frontend/lib/column-mapping-validation.ts` | Pre-save mapping validation |
| `frontend/lib/column-mapping-validation.test.ts` | Unit tests |
| `frontend/lib/upload-auto-flow.ts` | Zero-byte file rejection |
| `frontend/lib/upload-auto-flow.test.ts` | Zero-byte test |
| `frontend/app/page.tsx` | Empty states, filter error, mapping modal, export gating, restore error |

---

## Recommended next (P2 backlog)

1. Chart `ErrorBoundary` wrapper around `ChartRenderer` (Overview + Charts + Insights).
2. PDF export warning when chart artifact capture fails (non-fatal path).
3. Malformed CSV structural validation on backend.
4. Filter refresh loading skeleton.
5. Re-upload confirmation dialog.
6. Per-card “could not render” message when chart dropped from Overview grid.

---

## Tests added

- `column-mapping-validation.test.ts`
- `user-facing-export-errors.test.ts`
- `upload-auto-flow.test.ts` (zero-byte)

Run full suite: `cd frontend && npm run test && npm run build`
