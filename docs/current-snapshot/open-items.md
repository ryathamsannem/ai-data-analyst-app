# Open Items (Prioritized)

**Snapshot:** June 27, 2026 (after Overview Pass **5C.5** — H-Bar/V-Bar parity **frozen**) · Branch `DEV`.

Completed Overview 5A.x → 5C.x work is in [`overview-pass-status.md`](./overview-pass-status.md).
Frozen H-Bar/V-Bar parity record: [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md).

---

## P0 — Do first

### ~~1. H-Bar / V-Bar visual parity~~ — **RESOLVED / FROZEN (Pass 5C.5)**
- Closed after Passes 5B.1 → 5C.5. See [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md).
- **Do not reopen** unless a regression is filed with SVG measurements.

### 1. Confirm Overview default charts across domains (manual UI)
- **Status:** Backend probe + tests pass; needs manual UI confirmation.
- Confirm Overview defaults on upload for `retail_gold_10000.csv`, `banking_gold_10000.csv`, `banking_financial_services.csv`, `hr_gold_5000.csv` (type label, no default scatter for banking, monthly trends, banking risk/utilization by segment/product, HR salary/department).
- **Note:** HR auto-dashboard discovery can still surface weaker "Monthly Age Trend" / "Records by Age Band" charts (discovery layer, separate from mapping).

---

## P1 — Production Readiness Phase 1

### Error handling / loading states
- Audit upload, mapping, AI ask, export flows for robust error + loading UX (empty/failed/slow states).

### Upload / mapping edge cases
- Validate odd schemas: missing date, all-categorical, single-column, huge cardinality, mixed types, ambiguous domain; ensure mapping modal defaults degrade gracefully.

### Export regression pass
- Re-validate PNG/PDF export after 5B/5C domain and axis changes (85% H-Bar cap, count ticks, percent caps).
- Confirm no axis-label or layout regressions in exported charts. Reference: Phase 7 PDF fixtures, `docs/pdf-export-final-validation-runbook.md`.

### Platform gaps (production-only)
- Authentication & tenant isolation; durable usage metering; multi-tenant dataset storage (currently in-memory `df` per process). Separate initiative from chart/Overview work.

---

## P2 — Nice to have

### Further visual polish (only if product requests)
- Histogram premium review (renders as styled V-Bar; no dedicated occupancy pass).
- Any remaining cosmetic chart tuning **only after** explicit product approval — H-Bar/V-Bar parity is frozen.

### Future / non-blocking
- Large dataset performance optimization (100k+ rows).
- Browser E2E export regression suite (Playwright).

---

## Technical debt (accepted)

| Item | Notes |
|------|-------|
| Dual renderer pipelines | Overview inline (`page.tsx`) vs shared `ChartRenderer` — managed via shared domain/visual helpers; full pixel convergence not scheduled. |
| Orientation-natural H-Bar vs V-Bar | H-Bar length vs V-Bar thickness; 85% utilization cap is the agreed mitigation. |
| Monolithic `page.tsx` | Large file; incremental extraction only when scoped. |
| Pre-existing backend test failures | 6 `pytest` failures — pre-existing. See [`validation-results.md`](./validation-results.md). |
| HR `customer` role = `age` | Minor; not a stated requirement. |
