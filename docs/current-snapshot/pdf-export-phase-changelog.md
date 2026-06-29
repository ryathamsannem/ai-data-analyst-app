# Changelog — PDF Export Quality (Phase PDF-1)

**Phase window:** June 28–29, 2026  
**Commit:** `c764f5d` — fix(frontend): improve pdf insight export quality  
**Audit doc:** [`pdf-quality-audit.md`](./pdf-quality-audit.md)

---

## Scope

Frontend PDF/export path only. No backend changes. No H-Bar/V-Bar, axis/domain/bar sizing, Overview defaults, suggested questions, or follow-up chip logic changes in this commit.

---

## Delivered

| ID | Item | Key files |
|----|------|-----------|
| PDF-P0-01 | Narrative/chart alignment | `pdf-narrative-alignment.ts`, `build-executive-pdf-input.ts` |
| PDF-P1-01/03 | Slim AI Insights preset; data preview as appendix after Visualization | `page.tsx`, `build-executive-pdf-input.ts`, `pdf-report.ts` |
| PDF-P1-02 | `applyPdfExportPreset` — insight vs full export flags | `build-executive-pdf-input.ts` |
| PDF-P1-04 | PDF-only embed sizing constants | `pdf-enterprise-style.ts`, `pdf-report.ts` |
| Metadata | **Category: Category** chip → real dimension | `pdf-report.ts` (`normalizePdfChartMetadataChips`) |
| Follow-up export | Export button + PDF context for follow-up answers | `page.tsx`, `resolve-pdf-export-context.ts`, `insight-result-history.ts` |
| Viz layout | Analysis-context + chart page-break cohesion | `pdf-report.ts`, `pdf-viz-layout.test.ts` |

---

## Validation

| Artifact | Purpose |
|----------|---------|
| `docs/pdf-validation-screenshots/pdf1-banking-live-insight-preset.pdf` | Slim root insight export |
| `docs/pdf-validation-screenshots/pdf1-banking-live-followup-insight-preset.pdf` | Slim follow-up export |
| `docs/pdf-validation-screenshots/pdf1-real-estate-full-export-followup.pdf` | Full export viz layout |
| `docs/pdf1-banking-live-export.py` | Live banking validation |
| `docs/pdf1-banking-followup-live-export.py` | Live follow-up validation |
| `docs/pdf1-real-estate-full-export.py` | Full export layout validation |

**Tests (recorded):** PDF/export targeted suite PASS · follow-up export tests PASS · viz layout tests PASS · `npm run build` PASS.

---

## Deferred (PDF-2)

- PDF-P2-01 — Sparse KPI dashboard page
- PDF-P2-02 — Technical appendix prominence
- PDF-P2-03 — Full-file data quality vs preview slice
- PDF-P2-04 — Branding/footer placeholder copy
- PDF-P2-06 — Preview table date-like ID formatting
- PDF-P2-07 — Domain label polish (e.g. real estate “General business”)

**Next:** audit-first, small scoped fixes only.

---

## Related commits (same arc, separate)

| Commit | Scope |
|--------|--------|
| `3ee3e48` | Suggested Questions backend (15 domains) |
| `c460bcc` | Follow-up chip quality (FU-P1) |

Chart premium parity changelog: [`changelog-premium-chart-phase.md`](./changelog-premium-chart-phase.md).
