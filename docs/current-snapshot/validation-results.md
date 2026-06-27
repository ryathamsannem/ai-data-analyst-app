# Validation Results

**Snapshot:** June 27, 2026 (after Overview Pass **5C.5** — H-Bar/V-Bar parity frozen) · Branch `DEV`.

---

## Frontend — vitest

```bash
cd frontend && npm run test
# equivalent: cd frontend && npx vitest run
```

- **Result:** PASS — **722 tests in 83 files passed (0 failed).**
- Key 5B/5C suites: `overview-bar-value-domain.test.ts` (48), `horizontal-bar-visual.test.ts` (11),
  `cartesian-chart-decisions.test.ts` (15), `overview-dashboard-export.test.ts` (15),
  `overview-premium-axis-domain.test.ts` (26), `overview-dash-chart-insights.test.ts` (23),
  `overview-dashboard-plot-layout.test.ts` (11).

## Frontend — build

```bash
cd frontend && npm run build
```

- **Result:** PASS — Next.js 16.2.4 (Turbopack); compiled successfully; TypeScript clean; static pages
  generated.

---

## Backend — targeted tests

```bash
cd backend && python -m pytest \
  tests/test_cross_domain_mapping_qa.py \
  tests/test_overview_banking_gold_dashboard.py \
  tests/test_overview_banking_financial_services.py \
  tests/test_overview_retail_gold_dashboard.py \
  tests/test_executive_kpi_domains.py
```

- **Result:** PASS — **37 passed (0 failed)** (unchanged from 5A.3 snapshot).

## Backend — full suite

```bash
cd backend && python -m pytest tests/
```

- **Result:** **6 failed, 421 passed.**
- **All 6 failures are PRE-EXISTING** (not introduced by Overview Pass 5A–5C).

| Pre-existing failing test | Area |
|---------------------------|------|
| `tests/intent_engine/test_banking_utilization_routing.py::...::test_suggested_questions_include_utilization_trend` | Suggested questions (banking) |
| `tests/test_auto_dashboard_chart_quality.py::...::test_no_weak_chart_titles` | marketing.csv weak title |
| `tests/test_auto_dashboard_opportunities.py::...::test_before_after_chart_count_improvement` | Sales showcase chart count |
| `tests/test_auto_dashboard_opportunities.py::...::test_showcase_dimension_diversity_and_donut_cap` | Sales showcase dimension diversity |
| `tests/test_auto_dashboard_opportunities.py::...::test_showcase_produces_diverse_charts` | Sales showcase chart count |
| `tests/test_auto_dashboard_showcase_regression.py::...::test_scatter_payload_has_numeric_x_axis` | Sales showcase scatter |

---

## H-Bar/V-Bar parity validation (Pass 5B → 5C.5)

| Check | Method | Verdict |
|-------|--------|---------|
| Zero baseline (currency/count H/V-Bar) | Unit tests `overview-bar-value-domain.test.ts` | PASS |
| Low-rate percent cap (delinquency ~5%) | Unit tests 5C.2 | PASS |
| H-Bar band fill / category sizing | Unit tests `horizontal-bar-visual.test.ts` | PASS |
| Overview H-Bar 85% utilization cap | Unit tests + Loan Balance fixture ($183.9M → ~$216M domain) | PASS |
| Percent chip 1.0% not 100% | Unit tests `metric-executive-percent.test.ts` / domain tests | PASS |
| Export/live domain parity | `cartesian-chart-decisions.test.ts`, `overview-dashboard-export.test.ts`, `axis-presentation-plan.test.ts` | PASS |
| Count-axis clean integer ticks | `overview-premium-axis-domain.test.ts`, `cartesian-chart-decisions.test.ts` | PASS |
| Cross-surface renderer wiring | Static trace: `page.tsx` → `resolveCartesianBarValueAxisProps` | PASS |
| Manual H-Bar/V-Bar premium match | Screenshots after 5C.5; residual stretch mitigated; orientation difference accepted | **FROZEN** |

---

## Manual files tested (mapping/domain probe)

| Fixture | Verdict |
|---------|---------|
| `retail_gold_10000.csv` | PASS |
| `banking_gold_10000.csv` | PASS |
| `banking_financial_services.csv` | PASS |
| `hr_gold_5000.csv` | PASS |

**Visual checks pending manual UI confirmation:** Overview defaults across all four fixtures on live upload (P0 in [`open-items.md`](./open-items.md)).

---

## How to continue in a new Cursor chat

**Next recommended task (P1):**

> **Production Readiness Phase 1 — export regression pass** after 5B/5C domain changes.

Re-validate PNG/PDF export for banking Overview cards (Loan Balance H-Bar ~216M top tick, delinquency V-Bar 0–5%, profit V-Bar zero baseline). See [`open-items.md`](./open-items.md) P1.

**Do not** reopen H-Bar/V-Bar parity unless a regression is reported with measured SVG evidence. Baseline: [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md).
