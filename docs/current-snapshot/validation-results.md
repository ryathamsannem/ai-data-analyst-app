# Validation Results

**Snapshot:** June 27, 2026 (after Overview Pass 5A.3) · Branch `DEV` · Latest commit `f648151`.

---

## Frontend — vitest

```bash
cd frontend && npx vitest run
```

- **Result:** PASS — **668 tests in 83 files passed (0 failed).**
- Includes 5A.3 suites: `horizontal-bar-visual.test.ts`, `overview-premium-axis-domain.test.ts`,
  `overview-dash-chart-insights.test.ts`, `resolved-dataset-type-label.test.ts`,
  `overview-dashboard-context-chips.test.ts`, `overview-dashboard-chart-renderable.test.ts`.

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

- **Result:** PASS — **37 passed (0 failed).**

## Backend — full suite

```bash
cd backend && python -m pytest tests/
```

- **Result:** **6 failed, 421 passed.**
- **All 6 failures are PRE-EXISTING** (not introduced by Overview Pass 5A.3). Proven by reverting the
  5A.3 `main.py` scorer edits and re-running: the same 6 tests fail identically on the baseline. They
  exercise the `sales` showcase discovery / banking suggested-questions / marketing weak-title — none of
  which the 5A.3 keyword-scorer edits execute against.

| Pre-existing failing test | Area |
|---------------------------|------|
| `tests/intent_engine/test_banking_utilization_routing.py::...::test_suggested_questions_include_utilization_trend` | Suggested questions (banking) |
| `tests/test_auto_dashboard_chart_quality.py::...::test_no_weak_chart_titles` | marketing.csv "Category Distribution · Channel" weak title |
| `tests/test_auto_dashboard_opportunities.py::...::test_before_after_chart_count_improvement` | Sales showcase chart count (4 < 6) |
| `tests/test_auto_dashboard_opportunities.py::...::test_showcase_dimension_diversity_and_donut_cap` | Sales showcase dimension diversity (2 < 3) |
| `tests/test_auto_dashboard_opportunities.py::...::test_showcase_produces_diverse_charts` | Sales showcase chart count (4 < 6) |
| `tests/test_auto_dashboard_showcase_regression.py::...::test_scatter_payload_has_numeric_x_axis` | Sales showcase scatter expected |

> These are tracked as accepted technical debt in [`open-items.md`](./open-items.md), not as 5A.3 regressions.

---

## Manual files tested (mapping/domain probe)

Loaded each fixture, ran `compute_semantic_column_mapping` + `build_auto_dashboard`, and inspected the
resolved domain, type label, role mapping, and chart titles.

| Fixture | Domain | Type label | Primary metric | Secondary | Date | Main dimension | Verdict |
|---------|--------|-----------|----------------|-----------|------|----------------|---------|
| `retail_gold_10000.csv` | sales | Sales | `sales_amount` | `profit` | `order_date` | `product_category` | PASS — no banking labels |
| `banking_gold_10000.csv` | banking | Banking / Financial Services | `spend_amount` | `utilization_pct` | `month` | `product_type` | PASS — no lifecycle age, no scatter |
| `banking_financial_services.csv` | banking | Banking / Financial Services | `spend_amount` | `credit_utilization` | `report_date` | `product_type` | PASS — monthly trends, no scatter |
| `hr_gold_5000.csv` | hr | HR / Employee | `salary` | `performance_rating` | `hire_date` | `department` | PASS — salary/department (no training_hours/age_band) |

**Visual checks pending manual UI confirmation:** H-Bar/V-Bar premium parity (currently NOT matching — see
[`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md)); percent/`pp` formatting on
rate V-Bars (unit-tested, confirm visually).

---

## How to continue in a new Cursor chat

**Next recommended task:**

> **Investigate H-Bar vs V-Bar visual parity by comparing rendered geometry and shared constants before
> making more changes.**

Concretely:
1. Render a V-Bar and an H-Bar from the **same dataset** on the same surface.
2. Measure the SVG: plot band width/height, per-category band size, actual bar thickness, gap between bars,
   and value-axis domain/ticks.
3. Identify **which** geometry differs (layout type, band calc, gaps, value-axis compression, card padding,
   or inline-vs-shared-renderer differences).
4. Only then adjust constants/gaps/layout. **Do not** make further blind constant edits.

Start from: [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md) (constants + file
map) and [`overview-pass-status.md`](./overview-pass-status.md) (what 5A.3 already changed).
