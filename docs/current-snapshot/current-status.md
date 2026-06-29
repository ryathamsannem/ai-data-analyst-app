# Current Status

**Snapshot date:** June 29, 2026  
**Phase:** Post–PDF-1 — suggested questions, follow-up chips, and PDF export quality **committed**  
**Branch:** `DEV` · HEAD `c764f5d` · working tree **clean**

---

## What is working

- **Overview tab** — upload, KPI cards, filters, auto-dashboard grid, drill path, per-card PNG export (unchanged).
- **15-domain Overview validation** — 14 High confidence, 1 justified Medium (banking); frozen scatter policy.
- **H-Bar / V-Bar visual parity** — **frozen** (Pass 5C.5). Do not reopen without measured regression.
- **Suggested Questions (upload)** — Phase 1 backend quality across 15 domains (`3ee3e48`).
- **AI follow-up chips** — FU-P1 generic/duplicate/profit-centric fixes (`c460bcc`).
- **PDF export (PDF-1)** — narrative/chart alignment, slim AI Insights preset, appendix sample data, embed sizing, metadata chips, follow-up export context, viz page-break cohesion (`c764f5d`). See [`pdf-quality-audit.md`](./pdf-quality-audit.md).
- **AI Insights** — structured reasoning, follow-ups, recommended actions; follow-up PDF export uses selected answer context.
- **Tests/build (recorded)** — backend Phase 1 **492/492**; follow-up targeted **37**; PDF/export targeted **PASS**; `npm run build` **PASS**.

---

## What is still unresolved (non-blocking)

- **PDF-2** — sparse KPI page, technical appendix tone, full-file data quality, branding copy, preview date formatting, domain label polish. Audit-first; not started.
- **Optional browser spot-check** — live upload across 3–5 domains.
- **AI Insights narrative QA** — cross-domain LLM quality beyond deterministic probes.
- **Platform production gaps** — auth, durable storage, metering, optional E2E suite.

No open backend test failures. PDF-1 did not touch backend.

---

## Snapshot doc index

| File | Purpose |
|------|---------|
| [`latest-working-snapshot.md`](./latest-working-snapshot.md) | **Post–PDF-1** git state + validation record |
| [`final-release-readiness-summary.md`](./final-release-readiness-summary.md) | Prior final release baseline (June 28) |
| [`pdf-quality-audit.md`](./pdf-quality-audit.md) | PDF architecture audit + PDF-1 validation |
| [`pdf-export-phase-changelog.md`](./pdf-export-phase-changelog.md) | PDF-1 changelog |
| [`suggested-questions-15-domain-quality.md`](./suggested-questions-15-domain-quality.md) | Suggested questions audit + Phase 1 |
| [`open-items.md`](./open-items.md) | Prioritized future work |
| [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md) | Frozen H-Bar/V-Bar record |
