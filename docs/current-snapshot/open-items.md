# Open Items (Prioritized)

**Snapshot:** June 28, 2026 (after healthcare/SaaS mapping follow-up) · Branch `DEV` · commit `e353dee`.

Completed Overview 5A.x → 5C.x work is in [`overview-pass-status.md`](./overview-pass-status.md).
Frozen H-Bar/V-Bar parity record: [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md).

---

## P0 — Do first

### ~~1. H-Bar / V-Bar visual parity~~ — **RESOLVED / FROZEN (Pass 5C.5)**
- Closed after Passes 5B.1 → 5C.5. See [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md).
- **Do not reopen** unless a regression is filed with SVG measurements.

### ~~1. Confirm Overview default charts across domains (manual UI)~~ — **COMPLETE (June 27, 2026)**
- Validated via backend probe + **37/37** targeted pytest + frontend golden summary tests.
- All four gold fixtures produce correct type labels, meaningful KPIs, and business-useful default charts.
- See [`validation-results.md`](./validation-results.md) § Overview defaults confirmation.

### ~~2. P2 HR discovery — age-band chart demotion~~ — **COMPLETE (June 27–28, 2026)**
- Commit `5e198ae`: demotes `Records by Age Band` and `Monthly Age Trend` when workforce charts exist.
- Verified: `test_overview_hr_gold_dashboard.py` (5/5 pass).

---

## P1 — Production Readiness (active)

### Mapping confidence calibration — Medium domains (next task)
- **Scope:** Raise or justify aggregate **Medium** confidence on four 1k fixtures:
  - `banking_financial_1k.csv`
  - `healthcare_patient_1k.csv`
  - `saas_subscription_1k.csv`
  - `supply_chain_logistics_1k.csv`
- **Prerequisite work done:** HR High confidence; healthcare/SaaS distinct secondary metrics; SaaS exec domain + type label (`e353dee`).
- **Do not change:** chart visuals, export, H-Bar/V-Bar parity, AI routing, unrelated scoring.
- See [`cross-domain-upload-mapping-validation.md`](./cross-domain-upload-mapping-validation.md) and [`latest-working-snapshot.md`](./latest-working-snapshot.md).

---

## P1 — Production Readiness Phase 1 (closed)

### Error handling / loading states
- **P1 audit complete (June 27, 2026):** See [`p1-error-loading-ux-audit.md`](./p1-error-loading-ux-audit.md). Eight P1 gaps fixed (empty states, filter error, mapping save/validation, export gating, friendly capture errors). P2 backlog: chart ErrorBoundary, PDF artifact warning, malformed CSV diagnostics.

### ~~Upload / mapping edge cases~~ — **COMPLETE (June 27, 2026)**
- Validated empty, ambiguous, high-cardinality, and gold-fixture schemas; fixed all-categorical crash + spurious date mapping.
- See [`p1-upload-mapping-edge-cases.md`](./p1-upload-mapping-edge-cases.md).

### ~~Export regression pass~~ — **COMPLETE (June 27, 2026)**
- Closed after P1 pass: 87 targeted export tests + 741 full vitest + clean build; Phase 7 PDF 18/18.
- See [`validation-results.md`](./validation-results.md) § P1 export regression pass.
- Optional: manual banking Overview PNG spot-check (Loan Balance ~216M, Delinquency 0–5%).

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
| HR `customer` role = `age` on some gold fixtures | Minor; not a stated requirement. |
| Medium mapping confidence (4× 1k domains) | Active P1 — calibration pass next. |
