# Validation Results

**Snapshot:** June 27, 2026 (after Overview Pass **5C.5** + **P1 export regression pass**) · Branch `DEV`.

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

## P1 — Export regression pass (after 5B/5C domain + H-Bar visual freeze)

**Date:** June 27, 2026 · **Scope:** PNG/PDF export parity after zero-baseline policy, 85% Overview H-Bar cap, V-Bar low-rate cap, H-Bar visual weight, percent chip fix.

### Targeted export/chart tests

```bash
cd frontend && npm run test -- \
  lib/overview-dashboard-export.test.ts \
  lib/chart-platform/axis-presentation-plan.test.ts \
  lib/build-executive-pdf-input.test.ts \
  lib/phase7-pdf-generate.test.ts \
  lib/chart-png-export-qa.test.ts \
  lib/chart-png-export-svg-polish.test.ts \
  lib/chart-png-capture.test.ts
```

- **Result:** PASS — **87/87 tests** (7 files).

### Full suite + build (re-run same day)

- **Vitest:** PASS — **722/722** (83 files).
- **Build:** PASS — Next.js 16.2.4 (Turbopack); TypeScript clean.

### Validation matrix

| # | Target | Method | Verdict |
|---|--------|--------|---------|
| 1 | Overview PNG — H-Bar Loan Balance ($0 start, ~216M top) | `overview-bar-value-domain.test.ts`, `overview-dashboard-export.test.ts`; live/PNG both use `buildOverviewDashboardPlot(..., pngCapture=true)` → `pipeline: "overview"` + `overviewHorizontalBarHeadroom: true` | **PASS** |
| 2 | Overview PNG — V-Bar Delinquency (0–~5%, not 9.1%) | `overview-bar-value-domain.test.ts` 5C.2 delinquency fixture | **PASS** |
| 3 | Overview PNG — V-Bar Profit/magnitude ($0 start) | `axis-presentation-plan.test.ts` export plan profit domain | **PASS** |
| 4 | Charts tab / AI Insights PNG — zero baseline, no tight business bars | `axis-presentation-plan.test.ts` session H/V-Bar zero-baseline test; `resolveHBarValueAxisProps` satisfaction score tight domain preserved | **PASS** |
| 5 | PDF export — Phase 7 matrix | `phase7-pdf-generate.test.ts` 18/18 PDFs; `build-executive-pdf-input.test.ts` 21/21 | **PASS** |
| 6 | Regression guards | Score/rating tight domain, percent chip 1.0% (not 100%), pp gap chips, count/currency ticks, capture readiness | **PASS** (unit tests) |

### Export path notes (no code change required)

| Surface | Domain source | 85% H-Bar cap |
|---------|---------------|---------------|
| Overview live + Overview PNG | Inline `buildOverviewDashboardPlot` → `resolveCartesianBarValueAxisProps({ pipeline: "overview" })` | **Yes** (Overview-only policy) |
| Charts/AI PNG + PDF session charts | `ChartRenderer` + axis plan / session `resolveHBarValueAxisProps` | **No** — zero baseline + ×1.06 pad only (by design) |
| Axis presentation plan (`overviewPng` profile) | Diagnostic/contract parity; Overview PNG **render** does not consume plan domain | N/A for pixels |

No export regression found. Session/PDF H-Bar bars correctly start at zero without the Overview 85% stretch policy.

### Manual UI (optional spot-check)

Automated coverage is sufficient to close P1 export regression. Optional browser confirmation on `banking_gold_10000.csv`: Overview PNG download for Loan Balance + Delinquency cards vs live cards.

---

## Overview defaults confirmation — gold fixtures (June 27, 2026)

**Method:** Backend `build_auto_dashboard()` probe per fixture + targeted pytest (37/37) + frontend golden AI-summary tests. No production code changes. Browser UI not re-run (servers not required; backend probe matches live API payload).

### Result table

| Fixture | Type label | KPIs | Default charts | Scatter | Cross-domain leak | Verdict |
|---------|------------|------|----------------|---------|-------------------|---------|
| `retail_gold_10000.csv` | **Sales** | Total Sales, Total Profit, Avg Sales/Record, Top Category, Top Region | Monthly Sales Trend (→ 2024-12), Sales by Customer Segment (H-Bar), Region Profit Share (donut), Monthly Quantity Trend | 0 | None | **PASS** |
| `banking_gold_10000.csv` | **Banking / Financial Services** | Total Loan Balance, Total Spend, Avg Spend, Top Segment, Top Region | Monthly Spend Trend, Delinquency Flag by Product Type (H-Bar), Product Spend Share, Monthly Loan Balance Trend, Monthly Utilization Trend, Deposit Balance by City | 0 | None | **PASS** |
| `banking_financial_services.csv` | **Banking / Financial Services** | Total Loan Balance, Total Spend, Avg Credit Utilization (55.2%), Avg Delinquency Rate (3.65%) | Monthly Spend Trend, Credit Utilization by Product Type (H-Bar), Loan Balance by Product Type (V-Bar), Monthly Credit Utilization Trend, Delinquency Rate by Customer Segment (V-Bar) | 0 | No Sales/commercial | **PASS** |
| `hr_gold_5000.csv` | **HR / Employee** | Total Employees, Avg Salary, Avg Bonus, Dept Count, Top Dept | Monthly Salary Trend, Salary by Job Level (H-Bar), Performance Rating by Department (H-Bar), Monthly Performance Rating Trend | 0 | None | **PASS** (see P2 notes) |

### Checklist notes

| Check | Result |
|-------|--------|
| Retail — no banking labels in titles | PASS (`test_cross_domain_mapping_qa`) |
| Retail — useful sales/profit/region/segment/time views | PASS |
| Banking gold — no default scatter | PASS |
| Banking gold — no account age / lifecycle promoted | PASS |
| Banking gold — risk/utilization on segment or product type | PASS (Delinquency Flag by Product Type) |
| Banking FS — monthly cadence (not weekly) | PASS (`timeBucket: M`, monthly trend titles) |
| Banking FS — rate axes (delinquency ~3–4%, cap ~5%) | PASS (domain policy frozen in 5C.2; chart present) |
| HR — salary/department/workforce prioritized | PASS (mapping: salary + department + hire_date) |
| HR — weak age charts | **P2** — `Records by Age Band`, `Monthly Age Trend` still in grid; discovery/scoring layer; not a blocker |
| H-Bar/V-Bar visual / PNG export | PASS by reference (P0 frozen + P1 export pass); no new regression |

### Issues found

| Issue | Severity | Layer | Action |
|-------|----------|-------|--------|
| HR surfaces age-band count + monthly age trend in default grid | **P2** | Backend auto-dashboard discovery/scoring | Future narrow HR discovery pass; demote age/lifecycle when salary/dept/performance charts exist |
| Banking gold uses `Delinquency Flag` (binary) vs rate on gold 10k | **Info** | Discovery metric selection | Acceptable — still risk-on-product-type; rate chart appears on `banking_financial_services.csv` |
| `customer` mapping → `customer_id` on banking gold | **Info** | Backend semantic mapping | Non-blocking; segment charts discovered independently |

### Backend tests run

```bash
cd backend && python -m pytest \
  tests/test_cross_domain_mapping_qa.py \
  tests/test_overview_banking_gold_dashboard.py \
  tests/test_overview_banking_financial_services.py \
  tests/test_overview_retail_gold_dashboard.py \
  tests/test_executive_kpi_domains.py
```

**Result:** **37/37 PASS**

### Recommendation

**Overview default confirmation can be closed.** No code changes required. Optional non-blocking: live-browser upload spot-check for visual confirmation of H-Bar/V-Bar domains on banking FS `Loan Balance by Product Type` and `Delinquency Rate by Customer Segment`.

---

## How to continue in a new Cursor chat

**Next recommended task (P1):**

> Error/loading UX audit · upload/mapping edge cases · optional live-browser Overview spot-check (non-blocking).

**Do not** reopen H-Bar/V-Bar parity unless a regression is reported with measured SVG evidence. Baseline: [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md).
