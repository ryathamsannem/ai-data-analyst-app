# Cross-Domain 1k Upload & Mapping Confidence Validation

**Date:** 2026-06-28 (updated after healthcare/SaaS follow-up commit `e353dee`)  
**Fixtures:** `test-fixtures/domain_upload_1k/`  
**Generator:** `test-fixtures/domain_upload_1k/generate_domain_1k_fixtures.py`  
**Tests:** `backend/tests/test_cross_domain_upload_1k.py`

## Summary

Nine ~1,000-row domain CSV fixtures were generated and validated for upload parsing, semantic mapping, mapping confidence, executive domain labels, KPI cards, and default Overview charts. All fixtures pass backend validation. HR mapping confidence was **Low** before fixes; it is now **High** for both `hr_workforce_1k.csv` and `hr_gold_5000.csv`.

**Follow-up (June 28, `e353dee`):** Healthcare and SaaS now map **distinct** primary/secondary metrics (no duplicate `claim_amount` / `mrr` on profit role). SaaS receives executive domain `saas` and type label **SaaS / Subscription**. Healthcare type label **Healthcare** with executive domain `healthcare`.

**Remaining open item:** Four fixtures still aggregate **Medium** confidence — calibration pass next (see [`open-items.md`](./open-items.md)).

## HR Low-confidence root cause (fixed)

| Issue | Effect |
|-------|--------|
| `_infer_business_domain()` did not detect HR | No HR-specific domain weight bonuses; weaker product/profit scoring |
| `performance_rating` / `bonus` missing from profit-role keywords | Secondary metric confidence stayed Low |
| `age` scored via cardinality-only customer role | Customer role mapped to `age` with Low confidence, dragging aggregate down |
| Unmapped `region` role still counted as Low | Aggregate confidence used worst role including empty region |
| `department` vs `job_family` tie | Product role confidence Low despite correct selection |

**Fixes applied (backend only, `main.py`):**

- Extended `_infer_business_domain()` for HR, banking, healthcare, SaaS, supply chain, education
- HR/banking/healthcare/SaaS domain weight bonuses for core mapping roles
- Profit-role keywords for workforce/SaaS/healthcare secondary metrics
- Customer-role keywords for `employee_status` / segments; demographic penalty for `age`/`gender`
- Aggregate confidence skips optional roles (`region`, `customer`) when unmapped
- Clear weak cardinality-only guesses for optional roles
- Scoped HR penalty list so manufacturing metrics (`units_produced`, `defect_rate`) are not penalized

## Validation table

| Fixture | Rows/Cols | Exec domain | Map domain | Type label | Confidence | Primary | Secondary | Date | Dimension | Sample charts | Verdict |
|---------|-----------|-------------|------------|------------|------------|---------|-----------|------|-----------|-----------------|---------|
| `retail_ecommerce_1k.csv` | 1000/9 | sales | ecommerce | Sales | **High** | sales_amount | profit | order_date | product_category | Monthly Sales Amount Trend; Sales Amount by Customer Segment; Region Profit Share | PASS |
| `banking_financial_1k.csv` | 1000/9 | banking | banking | Banking / Financial Services | **Medium** | spend_amount | credit_utilization | report_month | product_type | Monthly Spend Amount Trend; Spend Amount by Product Type | PASS |
| `hr_workforce_1k.csv` | 1000/9 | hr | hr | HR / Employee | **High** | salary | performance_rating | hire_date | department | Monthly Salary Trend; Salary by Department | PASS |
| `healthcare_patient_1k.csv` | 1000/9 | healthcare | healthcare | Healthcare | **Medium** | claim_amount | readmission_rate (or wait_time / visit_count) | visit_date | department | Monthly Claim Amount Trend; Claim Amount by Department | PASS |
| `manufacturing_quality_1k.csv` | 1000/9 | operations | manufacturing | Operations | **High** | units_produced | defect_rate | production_date | product_line | Monthly Units Produced Trend; Units Produced by Product Line | PASS |
| `marketing_campaign_1k.csv` | 1000/10 | marketing | marketing | Marketing | **High** | revenue | conversion_rate | campaign_date | campaign_name | Monthly Revenue Trend; Revenue by Region | PASS |
| `saas_subscription_1k.csv` | 1000/9 | saas | saas | SaaS / Subscription | **Medium** | mrr | churn_rate (or active_users / new_signups / expansion_revenue) | month | plan_type | Monthly Mrr Trend; Mrr by Plan Type | PASS |
| `supply_chain_logistics_1k.csv` | 1000/9 | generic | supply_chain | Generic | **Medium** | freight_cost | on_time_rate (or delivery_days / shipment_count) | ship_date | carrier | Monthly Freight Cost Trend; Freight Cost by Carrier | PASS |
| `education_student_1k.csv` | 1000/9 | generic | education | Generic | **High** | enrollment_count | pass_rate | term_date | grade_level | Monthly Enrollment Count Trend; Enrollment Count by School Region | PASS |

### Medium confidence cases (calibration target)

| Fixture | Why Medium (current) | Follow-up status |
|---------|----------------------|------------------|
| Banking | No geographic region column; profit-role gap between utilization vs loan balance is narrow | Open — calibration |
| Healthcare | Aggregate still Medium despite distinct secondary metric | Open — calibration |
| SaaS | Aggregate still Medium despite distinct secondary + exec label | Open — calibration |
| Supply chain | Aggregate Medium; profit role from alternatives | Open — calibration |

~~Healthcare / SaaS duplicate primary-secondary~~ — **Fixed** (`e353dee`).

### Checklist results (all fixtures)

| Check | Result |
|-------|--------|
| Upload succeeds | PASS (all 9) |
| Domain/type label reasonable | PASS |
| Primary metric business-relevant | PASS |
| Date column correct | PASS |
| Main dimension useful | PASS |
| Core role confidence High/Medium | PASS |
| KPI cards meaningful | PASS (HR verified) |
| Overview charts useful (≥3) | PASS |
| No ID-like columns in chart titles | PASS |
| No default scatter (retail/banking/HR/healthcare/marketing) | PASS |
| Charts renderable (`validate_chart_renderable`) | PASS |
| PNG export smoke (3 domains) | **Deferred** — backend renderability proxy only; no frontend/export changes in scope |

## Tests added

`backend/tests/test_cross_domain_upload_1k.py`:

- Fixture existence and ~1k row count
- Upload parse per fixture
- Mapping + aggregate confidence per domain
- HR workforce High confidence assertion
- HR gold aggregate not Low (regression)
- No ID-like chart titles
- No default scatter (5 domains)
- Chart renderability
- HR KPI cards include salary

## Test status (June 28, 2026)

| Suite | Result |
|-------|--------|
| `tests/test_cross_domain_upload_1k.py` | PASS (included in 35) |
| `tests/test_cross_domain_mapping_qa.py` | PASS |
| `tests/test_upload_mapping_edge_cases.py` | PASS |
| `tests/test_overview_hr_gold_dashboard.py` | PASS |
| Combined targeted | **35/35 passed** |
| Full `tests/` | **452 passed, 6 failed** (pre-existing, unchanged) |

## Regenerate fixtures

```bash
python test-fixtures/domain_upload_1k/generate_domain_1k_fixtures.py
```

## Deferred / out of scope

- Executive domain labels for supply chain, education (remain `generic` where no taxonomy exists) — healthcare/SaaS now have exec domains
- **Mapping confidence calibration** for four Medium fixtures — **next P1 task**
- PNG export visual smoke (frontend/export architecture frozen)
- Chart visual polish, H-Bar/V-Bar constants, AI routing
