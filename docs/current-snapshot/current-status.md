# Current Status

**Snapshot date:** June 28, 2026  
**Phase:** **Final release snapshot** — backend/frontend fully green; cleanup audit complete  
**Branch:** `DEV` · commit `61d0145` · staged doc archive + snapshot refresh pending commit

---

## What is working

- **Overview tab** — upload, KPI cards, filters, auto-dashboard grid, drill path, per-card PNG export.
- **Banking default charts** — no default scatter; lifecycle demoted; segment/product breakdowns, delinquency, utilization, loan/deposit/spend trends preferred (Passes 5A / 5A.1).
- **Banking / Financial Services labeling** — consistent "Banking / Financial Services" dataset type; monthly snapshot cadence; no "Sales / commercial" leak (Pass 5A.2).
- **Cross-domain mapping** — retail, banking (gold + financial services), HR resolve correct domain, type label, primary/secondary metric, date column, and main dimension (Pass 5A.3).
- **15-domain Overview validation** — 15 ~1k fixtures; 14 High confidence, 1 justified Medium (banking); 0 default scatter on business-rich domains; deterministic AI summary 15/15 PASS. See [`final-overview-15-domain-validation.md`](./final-overview-15-domain-validation.md).
- **H-Bar / V-Bar visual parity — RESOLVED / FROZEN (P0).** Passes 5B.1 → 5C.5 complete. See [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md).
- **Export regression (P1)** — PNG/PDF export validated: targeted export tests + Phase 7 PDF matrix; no regressions.
- **AI Insights** — structured reasoning blocks, narrative QA, follow-ups, recommended actions (see [`ai-insights-status.md`](./ai-insights-status.md)).
- **P1 error/loading/empty UX audit** — complete; see [`p1-error-loading-ux-audit.md`](./p1-error-loading-ux-audit.md).
- **Upload / mapping edge cases** — complete; see [`p1-upload-mapping-edge-cases.md`](./p1-upload-mapping-edge-cases.md).
- **Backend showcase / banking fixes** — showcase diversity/scatter regression + banking utilization suggested question (commit `61d0145`).
- **Cleanup audit** — complete; superseded docs archived. See [`cleanup-audit-before-final-snapshot.md`](./cleanup-audit-before-final-snapshot.md).
- **Tests/build (final snapshot)** — backend **478/478** pytest pass; frontend **743/743** vitest pass; `npm run build` clean.

---

## What is still unresolved (non-blocking)

- **Optional browser spot-check** — live upload confirmation across 3–5 domains (not required for this snapshot).
- **AI Insights answer-quality validation** — cross-domain narrative quality beyond deterministic backend probes.
- **Platform production gaps** — auth/tenant isolation, durable dataset storage, usage metering, optional E2E browser suite.

No open backend test failures. No accepted backend failure debt.

---

## Overview Pass 5B / 5C — status (frozen)

| Pass | Summary | Status |
|------|---------|--------|
| **5B.1** | H-Bar percent/rate zero baseline + percent chip fix | ✅ Frozen |
| **5B.2** | Universal zero-baseline for normal positive business bars | ✅ Frozen |
| **5B.3** | Export/shared/legacy domain parity validation | ✅ Frozen |
| **5C.1** | H-Bar visual weight / band-fill parity | ✅ Frozen |
| **5C.2** | Low-rate V-Bar axis upper-bound polish | ✅ Frozen |
| **5C.3** | H-Bar 7-category rhythm, count-axis clean ticks | ✅ Frozen |
| **5C.4** | H-Bar ×1.10 headroom verification | ✅ Superseded by 5C.5 |
| **5C.5** | Overview H-Bar **85% utilization cap** | ✅ Frozen |

Detail: [`overview-pass-status.md`](./overview-pass-status.md).

---

## Snapshot Doc Index

| File | Purpose |
|------|---------|
| [`final-release-readiness-summary.md`](./final-release-readiness-summary.md) | **Final snapshot** — test matrix, milestones, readiness |
| [`latest-working-snapshot.md`](./latest-working-snapshot.md) | Git state + validation commands |
| [`current-status.md`](./current-status.md) | This file |
| [`validation-results.md`](./validation-results.md) | Latest test/build results |
| [`open-items.md`](./open-items.md) | Remaining future work |
| [`final-overview-15-domain-validation.md`](./final-overview-15-domain-validation.md) | 15-domain backend validation |
| [`cross-domain-upload-mapping-validation.md`](./cross-domain-upload-mapping-validation.md) | 1k upload + mapping record |
| [`cleanup-audit-before-final-snapshot.md`](./cleanup-audit-before-final-snapshot.md) | Pre-snapshot cleanup audit |
| [`overview-pass-status.md`](./overview-pass-status.md) | Overview Passes 5A → 5C.5 detail |
| [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md) | Frozen H-Bar/V-Bar parity record |
