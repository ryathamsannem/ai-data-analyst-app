# Current Status

**Snapshot date:** June 29, 2026  
**Phase:** Post–PDF-2 + mandatory AI Insight/PDF alignment — **complete**  
**Branch:** `DEV` · HEAD `b66d5d1` · working tree **clean**

---

## What is working

- **Overview tab** — upload, KPI cards, filters, auto-dashboard grid, drill path, per-card PNG export (unchanged).
- **15-domain Overview validation** — 14 High confidence, 1 justified Medium (banking); frozen scatter policy.
- **H-Bar / V-Bar visual parity** — **frozen** (Pass 5C.5). Do not reopen without measured regression.
- **Suggested Questions (upload)** — Phase 1 backend quality across 15 domains (`3ee3e48`).
- **AI follow-up chips** — FU-P1 generic/duplicate/profit-centric fixes (`c460bcc`).
- **PDF export (PDF-1 + PDF-2)** — narrative/chart alignment, slim AI Insights preset, appendix sample data, embed sizing, metadata chips, follow-up export context, viz cohesion, domain labels, branding, preview ID/date formatting, data-quality wording, KPI dedupe, technical appendix polish (`c764f5d` → `cf643d9`). See [`pdf-quality-audit.md`](./pdf-quality-audit.md) · [`pdf-export-phase-changelog.md`](./pdf-export-phase-changelog.md).
- **Mandatory AI Insight/PDF alignment** — shared normalized `insightPresentation` model for live UI + PDF; generic chart-contract guard; structured PDF sections (Executive takeaway, Evidence, Why this matters, Supporting detail); compact Chart view (`042db37`, `cdb1f6d`).
- **PDF structured-section label cleanup** — redundant in-body labels stripped when section headings already present (`b66d5d1`).
- **AI Insights** — structured reasoning, follow-ups, recommended actions; root/follow-up/full export use correct context; narrative matches active chart dimension (Product Type, Room Type, Grid Region, and related category charts).
- **Tests/build (recorded)** — backend Phase 1 **492/492**; follow-up targeted **37**; PDF/export/alignment targeted suites **PASS**; latest `npm run build` **PASS**.

---

## What is still unresolved (non-blocking)

- **Final release-readiness validation** — optional browser spot-check across 3–5 domains; cross-domain AI Insights narrative QA beyond deterministic probes.
- **Platform production gaps** — auth, durable storage, metering, optional E2E suite.

**No PDF-2 backlog remains.** No open backend test failures from this arc.

---

## Snapshot doc index

| File | Purpose |
|------|---------|
| [`latest-working-snapshot.md`](./latest-working-snapshot.md) | **Final** git state + validation record |
| [`final-release-readiness-summary.md`](./final-release-readiness-summary.md) | Release baseline + post–PDF-2 addendum |
| [`pdf-quality-audit.md`](./pdf-quality-audit.md) | PDF architecture audit + PDF-1/PDF-2 + alignment record |
| [`pdf-export-phase-changelog.md`](./pdf-export-phase-changelog.md) | PDF-1 + PDF-2 + alignment changelog |
| [`suggested-questions-15-domain-quality.md`](./suggested-questions-15-domain-quality.md) | Suggested questions audit + Phase 1 |
| [`open-items.md`](./open-items.md) | Prioritized future work |
| [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md) | Frozen H-Bar/V-Bar record |
