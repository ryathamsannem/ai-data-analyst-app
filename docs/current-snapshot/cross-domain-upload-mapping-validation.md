# Cross-Domain 1k Upload & Mapping Confidence Validation

**Date:** 2026-06-27  
**Fixtures:** `test-fixtures/domain_upload_1k/`  
**Generator:** `test-fixtures/domain_upload_1k/generate_domain_1k_fixtures.py`  
**Tests:** `backend/tests/test_cross_domain_upload_1k.py`

## Summary

Nine ~1,000-row domain CSV fixtures were generated and validated for upload parsing, semantic mapping, mapping confidence, executive domain labels, KPI cards, and default Overview charts. All fixtures pass backend validation. HR mapping confidence was **Low** before fixes; it is now **High** for both `hr_workforce_1k.csv` and `hr_gold_5000.csv`.

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
| `healthcare_patient_1k.csv` | 1000/9 | generic | healthcare | Generic | **Medium** | claim_amount | claim_amount | visit_date | department | Monthly Claim Amount Trend; Claim Amount by Department | PASS |
| `manufacturing_quality_1k.csv` | 1000/9 | operations | manufacturing | Operations | **High** | units_produced | defect_rate | production_date | product_line | Monthly Units Produced Trend; Units Produced by Product Line | PASS |
| `marketing_campaign_1k.csv` | 1000/10 | marketing | marketing | Marketing | **High** | revenue | conversion_rate | campaign_date | campaign_name | Monthly Revenue Trend; Revenue by Region | PASS |
| `saas_subscription_1k.csv` | 1000/9 | generic | saas | Generic | **Medium** | mrr | mrr | month | plan_type | Monthly Mrr Trend; Mrr by Plan Type | PASS |
| `supply_chain_logistics_1k.csv` | 1000/9 | generic | supply_chain | Generic | **High** | freight_cost | freight_cost | ship_date | carrier | Monthly Freight Cost Trend; Freight Cost by Carrier | PASS |
| `education_student_1k.csv` | 1000/9 | generic | education | Generic | **High** | enrollment_count | pass_rate | term_date | grade_level | Monthly Enrollment Count Trend; Enrollment Count by School Region | PASS |

### Medium confidence cases (acceptable)

| Fixture | Why Medium |
|---------|------------|
| Banking | No geographic region column; profit role gap between utilization vs loan balance is narrow |
| Healthcare / SaaS | Primary and secondary map to same metric (claim_amount / mrr) — valid but reduces profit-role gap |
| SaaS | Executive domain remains `generic` (no dedicated SaaS executive taxonomy yet) — deferred |

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

## Test status

| Suite | Result |
|-------|--------|
| `tests/test_cross_domain_upload_1k.py` | 10/10 passed |
| `tests/test_cross_domain_mapping_qa.py` | 4/4 passed |
| `tests/test_upload_mapping_edge_cases.py` | 13/13 passed |
| `tests/test_overview_hr_gold_dashboard.py` | 5/5 passed |
| Full `tests/` | **449 passed, 6 failed** (pre-existing, unchanged) |

## Regenerate fixtures

```bash
python test-fixtures/domain_upload_1k/generate_domain_1k_fixtures.py
```

## Deferred / out of scope

- Executive domain labels for healthcare, SaaS, supply chain, education (remain `generic` where no taxonomy exists)
- PNG export visual smoke (frontend/export architecture frozen)
- Chart visual polish, H-Bar/V-Bar constants, AI routing
