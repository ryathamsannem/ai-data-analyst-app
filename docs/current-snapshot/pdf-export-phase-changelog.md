# Changelog — PDF Export Quality (PDF-1 + PDF-2 + Alignment)

**Phase window:** June 28–29, 2026  
**Final HEAD:** `b66d5d1` — fix(frontend): clean pdf insight section labels  
**Audit doc:** [`pdf-quality-audit.md`](./pdf-quality-audit.md)

---

## Scope

Frontend PDF/export path and AI Insight presentation alignment. Backend touched only in suggested-questions phase (`3ee3e48`, predates PDF export passes). No H-Bar/V-Bar, axis/domain/bar sizing, Overview defaults, suggested questions, or follow-up chip logic changes in PDF commits.

---

## Delivered — PDF-1 (`c764f5d`)

| ID | Item | Key files |
|----|------|-----------|
| PDF-P0-01 | Narrative/chart alignment (initial) | `pdf-narrative-alignment.ts`, `build-executive-pdf-input.ts` |
| PDF-P1-01/03 | Slim AI Insights preset; data preview as appendix after Visualization | `page.tsx`, `build-executive-pdf-input.ts`, `pdf-report.ts` |
| PDF-P1-02 | `applyPdfExportPreset` — insight vs full export flags | `build-executive-pdf-input.ts` |
| PDF-P1-04 | PDF-only embed sizing constants | `pdf-enterprise-style.ts`, `pdf-report.ts` |
| Metadata | **Category: Category** chip → real dimension | `pdf-report.ts` |
| Follow-up export | Export button + PDF context for follow-up answers | `page.tsx`, `resolve-pdf-export-context.ts`, `insight-result-history.ts` |
| Viz layout | Analysis-context + chart page-break cohesion | `pdf-report.ts`, `pdf-viz-layout.test.ts` |

---

## Delivered — PDF-2

| Commit | Item | Key files |
|--------|------|-----------|
| `6e30b8f` | PDF-2A — domain labels (Overview parity), footer/branding | `pdf-report.ts`, `branding-config.ts` |
| `fe6344f` | PDF-2B — preview ID/date formatting; data quality wording | `pdf-date-format.ts`, `pdf-report.ts` |
| `5d27fc1` | PDF-2C-1 — KPI dashboard dedupe / skip sparse page | `pdf-kpi-layout.ts`, `pdf-report.ts` |
| `cf643d9` | PDF-2C-2 — technical appendix title, tone, page-break | `pdf-technical-appendix-layout.ts`, `pdf-report.ts` |

---

## Delivered — Mandatory alignment (`042db37`, `cdb1f6d`)

| Item | Key files |
|------|-----------|
| Generic chart-contract narrative guard | `insight-chart-narrative-alignment.ts` |
| Shared live/PDF `insightPresentation` model | `live-insight-narrative-alignment.ts`, `page.tsx`, `build-executive-pdf-input.ts` |
| PDF bypass fix (`buildInsightSectionsForPdf` no longer re-parses raw answer) | `build-executive-pdf-input.ts` |
| Structured PDF sections + compact Chart view | `pdf-report.ts` |
| Per-section sanitization; reasoning-block filter | `insight-chart-narrative-alignment.ts` |

---

## Delivered — Label cleanup (`b66d5d1`)

| Item | Key files |
|------|-----------|
| Strip redundant in-body section labels when PDF headings exist | `pdf-insight-section-text.ts`, `pdf-report.ts` |

---

## Validation

| Artifact | Purpose |
|----------|---------|
| `docs/pdf-validation-screenshots/pdf1-banking-live-insight-preset.pdf` | Slim root insight export |
| `docs/pdf-validation-screenshots/pdf1-banking-live-followup-insight-preset.pdf` | Slim follow-up export |
| `docs/pdf-validation-screenshots/pdf-mandatory-fix-{banking,hospitality}-*` | Mandatory alignment live validation |
| `docs/pdf-mandatory-fix-generic-alignment-validation.py` | Banking + hospitality alignment script |
| `docs/pdf1-banking-live-export.py` | Live banking PDF-1 validation |

**Tests (recorded):** Backend suggested-question phase **492 passed** · follow-up targeted **37 passed** · PDF/export/alignment targeted suites **PASS** · `npm run build` **PASS**.

---

## Deferred / closed

All PDF-2 audit backlog items **complete**. No known PDF-2 items remain.

Remaining work: **final release-readiness validation** only (optional browser spot-check), unless new PDF evidence proves regression.

---

## Related commits (same arc)

| Commit | Scope |
|--------|--------|
| `3ee3e48` | Suggested Questions backend (15 domains) |
| `c460bcc` | Follow-up chip quality (FU-P1) |

Chart premium parity changelog: [`changelog-premium-chart-phase.md`](./changelog-premium-chart-phase.md).
