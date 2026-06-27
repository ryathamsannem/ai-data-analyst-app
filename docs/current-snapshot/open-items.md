# Open Items (Prioritized)

**Snapshot:** June 27, 2026 (after Overview Pass 5A.3) · Branch `DEV` · Latest commit `f648151`.

Only **real remaining work** is listed. Completed Overview 5A.x work is in
[`overview-pass-status.md`](./overview-pass-status.md); completed chart-parity-phase work is in
`chart-premium-parity-status.md` / `changelog-premium-chart-phase.md`.

---

## P0 — Do first

### 1. H-Bar / V-Bar visual parity — root-cause investigation
- **Status:** UNRESOLVED (top priority).
- H-Bar still does not visually match the V-Bar premium finish despite 5A.3 radius/thickness/axis changes.
- **Action:** compare *rendered* plot bands and bar geometry (SVG measurements) for a V-Bar vs H-Bar on the
  same data **before** changing any constants. Detail + constants in
  [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md).
- **Do not** keep blindly editing constants.

### 2. Confirm Overview default charts across domains
- **Status:** Validated via backend probe + tests; needs a manual UI confirmation pass.
- Confirm Overview defaults look correct on upload for `retail_gold_10000.csv`, `banking_gold_10000.csv`,
  `banking_financial_services.csv`, `hr_gold_5000.csv` (type label, no default scatter for banking, monthly
  trends, banking risk/utilization by segment/product, HR salary/department).
- **Note:** HR auto-dashboard discovery can still surface weaker "Monthly Age Trend" / "Records by Age Band"
  charts (discovery layer, separate from mapping) — verify acceptability or schedule a narrow HR pass.

---

## P1 — Production Readiness Phase 1

### Error handling / loading states
- Audit upload, mapping, AI ask, export flows for robust error + loading UX (empty/failed/slow states).

### Upload / mapping edge cases
- Validate odd schemas: missing date, all-categorical, single-column, huge cardinality, mixed types,
  ambiguous domain; ensure mapping modal defaults degrade gracefully.

### Export regression pass
- Re-validate PNG/PDF export after 5A.3 (shared `barValueTickFormatter` now affects axis labels in capture).
- Confirm no axis-label or layout regressions in exported charts. Reference: Phase 7 PDF fixtures,
  `docs/pdf-export-final-validation-runbook.md`.

### Platform gaps (production-only)
- Authentication & tenant isolation; durable usage metering; multi-tenant dataset storage (currently
  in-memory `df` per process). Separate initiative from chart/Overview work.

---

## P2 — Nice to have

### Further visual polish (only if needed)
- Histogram premium review (renders as styled V-Bar; no dedicated occupancy pass).
- Any remaining cosmetic chart tuning **only after** P0 parity is root-caused and resolved.

### Future / non-blocking
- Large dataset performance optimization (100k+ rows).
- Browser E2E export regression suite (Playwright).

---

## Technical debt (accepted)

| Item | Notes |
|------|-------|
| Dual renderer pipelines | Overview inline (`page.tsx`) vs shared `ChartRenderer` — managed via shared helpers; full convergence not scheduled. Relevant to P0 parity. |
| Monolithic `page.tsx` | Large file; incremental extraction only when scoped. |
| Pre-existing backend test failures | 6 `pytest` failures (sales showcase diversity/scatter, banking suggested-questions utilization trend, marketing weak-title) — pre-existing, not from 5A.3. See [`validation-results.md`](./validation-results.md). |
| HR `customer` role = `age` | Minor; not a stated requirement. |
