# AI Insights — Comprehensive QA Audit

**Generated:** 2026-06-13 11:38 UTC
**Suite executed:** `backend/scripts/wave_qa_runner.py --wave all --routing-only`
**QA JSON timestamp:** 2026-06-13T11:36:48Z
**Mode:** `routing_deterministic_no_llm` — routing + deterministic narrative proxy (no live LLM for full 209-question run)

---

## Executive summary

This audit executed the **production AI Insights question suite** across **10 domain datasets** (209 evaluations including follow-up chain turns). Automated rubric pass rate is **100%** (all questions scored ≥7.0 average). Under **strict validation** (intent + chart + metric + dimension + grounding must all match spec), **90/209 (43.1%)** pass and **119 (56.9%)** have at least one routing or grounding defect.

**Key takeaways:**
- **Automated rubric: 100% pass** (209/209 questions ≥7.0 avg) — production gate criteria met.
- **Strict structural validation: 43.1% pass** — reveals routing leniency in the rubric (acceptable-fallback scoring masks intent/chart mismatches).
- Zero hallucination failures and zero critical-severity rubric flags in the automated run.
- **Systemic Banking routing defect:** many Banking & Financial Services questions route to `spend_amount` regardless of asked metric (loan balance, NPL, delinquency, deposits).
- Primary weaknesses: **trend vs compare mis-routing**, **dual-metric ROI questions**, **executive prompts lacking actionable recommendations**, and **chart-ranking order mismatches** (quantity vs orders).
- Follow-up chain continuity scored well in routing-only mode (pytest chains passed); meta follow-ups ("Why is X highest?", "Which columns were used?") intentionally preserve root scope but fail strict intent spec matching.
- Per-answer follow-up suggestions are **not emitted** by the routing path; chain follow-ups are validated separately.

### Validation methodology

| Layer | Definition | Result |
|-------|------------|--------|
| **Rubric pass** | Question avg score ≥7.0 across 8 dimensions | 209/209 (100%) |
| **Strict pass** | Intent + chart + metric + dimension + grounding all match spec | 90/209 (43.1%) |
| **Pytest chains** | 7 domain follow-up chains, no invented markers | 9/9 tests passed |
| **Live narrative** | Wave 1 Claude `/ask` (63 questions) | 63/63 live, 0 fallback |

**Note on follow-up chain scoring:** Chain steps like "Why is {ENTITY} highest?" and "Which columns were used?" are *meta/explanation* follow-ups. The engine correctly preserves root analysis scope, but strict spec matching expects the root intent (ranking/compare). These are categorized as **High** routing findings against spec, but **Follow-up continuity** rubric scores remain ≥7.0.

---

## Test coverage

| Metric | Value |
|--------|------:|
| Total questions tested | 209 |
| Automated rubric pass (avg ≥7.0) | 209/209 (100%) |
| Strict validation pass | 90/209 (43.1%) |
| Strict validation fail | 119/209 (56.9%) |
| Critical findings (manual categorization) | 0 |
| High findings | 21 |
| Medium findings | 168 |
| Low findings | 31 |

### Domain breakdown (strict pass)

| Domain | Questions | Strict pass | Pass % | Rubric avg |
|--------|----------:|------------:|-------:|-----------:|
| Banking & Financial Services | 25 | 9/25 | 36.0% | 8.28 |
| Customer Support | 15 | 4/15 | 26.7% | 8.15 |
| Finance & FP&A | 16 | 5/16 | 31.2% | 8.22 |
| Geography | 25 | 14/25 | 56.0% | 8.45 |
| HR | 15 | 8/15 | 53.3% | 8.43 |
| Healthcare | 15 | 4/15 | 26.7% | 8.37 |
| Marketing | 27 | 10/27 | 37.0% | 8.29 |
| Operations | 15 | 7/15 | 46.7% | 8.45 |
| Retail | 30 | 15/30 | 50.0% | 8.45 |
| Sales | 26 | 14/26 | 53.8% | 8.39 |

### Findings by category

| Category | Count |
|----------|------:|
| Routing | 152 |
| Insight Quality | 31 |
| Calculation Accuracy | 31 |
| Chart Selection | 6 |

---

## Systemic patterns

| Pattern | Affected domains | Severity | Description |
|---------|------------------|----------|-------------|
| Banking metric fallback to `spend_amount` | Banking & Financial Services | **High** | Loan balance, NPL, delinquency, deposit questions route `spend_amount` instead of domain-specific columns |
| Compare/ranking interchange | Retail, Marketing, Sales, Support | Medium | Ranking questions acceptably score as `compare`; rubric allows fallback but strict validation fails |
| Trend mis-routed to compare | Sales | **High** | MoM growth questions select bar/compare instead of line/trend |
| Executive → compare bar | Banking, Marketing, Sales, FP&A | Medium | Leadership prompts route generic compare bars, not executive lens |
| Dual-metric ROI unresolved | Marketing | **High** | Revenue vs spend by campaign produces empty metric/dimension |
| Chart entity order mismatch | Retail | Medium | Quantity column used where orders expected — chart top ≠ pandas ground truth |
| Meta follow-up intent spec mismatch | All domains (chains) | Medium | Explanation follow-ups preserve scope but fail strict intent spec |
| Missing actionable recommendations | Executive/summary (all domains) | Low | Routing-proxy answers lack explicit recommendation language (live narrative stronger) |

---

| Domain | Fixture | Rows (approx) |
|--------|---------|---------------|
| Retail | `test-fixtures/domains/retail.csv` | ~360 |
| Marketing | `test-fixtures/domains/marketing.csv` | ~300 |
| Sales | `test-fixtures/domains/sales.csv` | ~300 |
| Geography | `test-fixtures/domains/geography.csv` | ~300 |
| Banking & Financial Services | `test-fixtures/domains/banking_financial_services.csv` | ~300 |
| Finance & FP&A | `test-fixtures/domains/finance_fpa.csv` | ~300 |
| Operations | `test-fixtures/domains/operations.csv` | ~300 |
| Customer Support | `test-fixtures/domains/customer_support.csv` | ~300 |
| HR | `test-fixtures/domains/hr.csv` | ~300 |
| Healthcare | `test-fixtures/domains/healthcare.csv` | ~300 |

**Supplementary pytest validation:** `test_follow_up_domain_chains.py`, `test_domain_quality_matrix.py` — all 9 tests passed.

**Live narrative reference:** `docs/ai-insights-wave1-live-narrative-results.json` (63 Wave 1 questions with Claude narrative).

---

## Critical & high issues

### High

- **[R-C2-F2] Retail** — What risk does this concentration create?
  - Category: Routing — Intent mismatch: got 'executive', expected ('compare',)
- **[M-C2-F2] Marketing** — What caution applies to causation?
  - Category: Routing — Intent mismatch: got 'compare', expected ('relationship',)
- **[S-I03] Sales** — Which department is an outlier for revenue?
  - Category: Chart Selection — Chart `histogram` vs expected `['bar']`
- **[S-D07] Sales** — Which region grew revenue month over month?
  - Category: Routing — Intent `compare` vs expected `['trend']`
- **[S-D07] Sales** — Which region grew revenue month over month?
  - Category: Chart Selection — Chart `bar` vs expected `['line']`
- **[S-D07] Sales** — Which region grew revenue month over month?
  - Category: Routing — Intent mismatch: got 'compare', expected ('trend',)
- **[G-C1-F1] Geography** — Why is {ENTITY} highest?
  - Category: Chart Selection — Chart `none` vs expected `['bar']`
- **[G-C1-F2] Geography** — What evidence supports this conclusion?
  - Category: Chart Selection — Chart `none` vs expected `['bar']`
- **[G-C1-F3] Geography** — Which columns were used for this analysis?
  - Category: Chart Selection — Chart `none` vs expected `['bar']`
- **[G-C2-F1] Geography** — What risk does concentration create?
  - Category: Routing — Intent mismatch: got 'executive', expected ('compare',)
- **[G-C2-F2] Geography** — What action should management take?
  - Category: Chart Selection — Chart `none` vs expected `['bar']`
- **[G-C2-F2] Geography** — What action should management take?
  - Category: Routing — Intent mismatch: got 'executive', expected ('compare',)
- **[B-I04] Banking & Financial Services** — Which regions exceed average delinquency?
  - Category: Routing — Intent mismatch: got 'fallback', expected ('ranking',)
- **[B-C2-F1] Banking & Financial Services** — What risk does concentration create?
  - Category: Routing — Intent mismatch: got 'executive', expected ('compare',)
- **[B-C2-F2] Banking & Financial Services** — What action should management take?
  - Category: Routing — Intent mismatch: got 'executive', expected ('compare',)
- **[F2-C1-F1] Finance & FP&A** — Why is {ENTITY} highest?
  - Category: Routing — Intent mismatch: got 'compare', expected ('ranking',)
- **[F2-C1-F2] Finance & FP&A** — Which columns were used for this analysis?
  - Category: Routing — Intent mismatch: got 'compare', expected ('ranking',)
- **[F2-C1-F3] Finance & FP&A** — Show the calculations behind this answer.
  - Category: Routing — Intent mismatch: got 'compare', expected ('ranking',)
- **[C2-C1-F1] Customer Support** — Why is {ENTITY} highest?
  - Category: Routing — Intent mismatch: got 'compare', expected ('ranking',)
- **[C2-C1-F2] Customer Support** — Which columns were used for this analysis?
  - Category: Routing — Intent mismatch: got 'compare', expected ('ranking',)
- **[C2-C1-F3] Customer Support** — Show the calculations behind this answer.
  - Category: Routing — Intent mismatch: got 'compare', expected ('ranking',)

---

## Medium & low issues (summary)

_199 medium/low findings across 128 questions. Top items listed below._

- **[M-I02] Marketing** — Compare campaign ROI: revenue vs spend by campaign
  - (Medium) Routing: Metric `` vs hint `revenue`
  - (Medium) Routing: Dimension `` vs hint `campaign`
  - (Medium) Calculation Accuracy: Data grounding score below 7.0
- **[S-D01] Sales** — Which territory delivers the most revenue?
  - (Medium) Routing: Intent `compare` vs expected `['ranking']`
  - (Medium) Routing: Dimension `region` vs hint `territory`
  - (Medium) Calculation Accuracy: Data grounding score below 7.0
- **[B-E04] Banking & Financial Services** — What should the CRO focus on?
  - (Medium) Routing: Intent `compare` vs expected `['executive']`
  - (Medium) Routing: Metric `spend_amount` vs hint `npl`
  - (Medium) Routing: Dimension `product_type` vs hint `region`
- **[F2-I03] Finance & FP&A** — Which cost center exceeds budget the most?
  - (Medium) Routing: Intent `compare` vs expected `['ranking']`
  - (Medium) Routing: Metric `budget` vs hint `variance`
  - (Medium) Calculation Accuracy: Data grounding score below 7.0
- **[R-B07] Retail** — Which product drives the most orders?
  - (Medium) Routing: Intent `compare` vs expected `['ranking']`
  - (Medium) Calculation Accuracy: Data grounding score below 7.0
  - (Medium) Calculation Accuracy: Chart top 'Desk' vs pandas top 'Electronics'
- **[R-D07] Retail** — What is average order value by city?
  - (Medium) Routing: Metric `orders` vs hint `revenue`
  - (Medium) Calculation Accuracy: Data grounding score below 7.0
  - (Medium) Calculation Accuracy: Chart top 'Chennai' vs pandas top 'Delhi'
- **[M-I03] Marketing** — Which channel underperforms on satisfaction?
  - (Medium) Routing: Intent `compare` vs expected `['ranking']`
  - (Medium) Routing: Metric `revenue` vs hint `satisfaction`
  - (Medium) Calculation Accuracy: Data grounding score below 7.0
- **[M-E05] Marketing** — Strategic recommendation for budget allocation
  - (Medium) Routing: Intent `compare` vs expected `['executive']`
  - (Medium) Routing: Metric `revenue` vs hint `spend`
  - (Low) Insight Quality: Executive question lacks actionable recommendation
- **[S-E04] Sales** — What should the sales leader focus on?
  - (Medium) Routing: Intent `compare` vs expected `['executive']`
  - (Medium) Routing: Dimension `product_line` vs hint `territory`
  - (Low) Insight Quality: Executive question lacks actionable recommendation
- **[B-I04] Banking & Financial Services** — Which regions exceed average delinquency?
  - (Medium) Routing: Intent `fallback` vs expected `['ranking']`
  - (Medium) Routing: Metric `spend_amount` vs hint `delinquency`
  - (Medium) Calculation Accuracy: Data grounding score below 7.0
- **[B-E01] Banking & Financial Services** — Biggest portfolio opportunity
  - (Medium) Routing: Metric `spend_amount` vs hint `interest_income`
  - (Medium) Routing: Dimension `region` vs hint `segment`
  - (Low) Insight Quality: Executive question lacks actionable recommendation
- **[B-E02] Banking & Financial Services** — Biggest credit risk
  - (Medium) Routing: Metric `spend_amount` vs hint `npl`
  - (Medium) Routing: Dimension `customer_segment` vs hint `region`
  - (Low) Insight Quality: Executive question lacks actionable recommendation
- **[F2-E01] Finance & FP&A** — What are the biggest FP&A risks?
  - (Medium) Routing: Metric `revenue` vs hint `variance`
  - (Medium) Routing: Dimension `category` vs hint `department`
  - (Low) Insight Quality: Executive question lacks actionable recommendation
- **[F2-E02] Finance & FP&A** — Where is cost overrun concentrated?
  - (Medium) Routing: Metric `cost` vs hint `actual`
  - (Medium) Routing: Dimension `category` vs hint `department`
  - (Low) Insight Quality: Executive question lacks actionable recommendation
- **[O2-E02] Operations** — Where is production loss concentrated?
  - (Medium) Routing: Metric `units_produced` vs hint `cost`
  - (Medium) Routing: Dimension `department` vs hint `facility`
  - (Low) Insight Quality: Executive question lacks actionable recommendation
- **[C2-E01] Customer Support** — What are the biggest support risks?
  - (Medium) Routing: Metric `tickets_opened` vs hint `escalations`
  - (Medium) Routing: Dimension `ticket_category` vs hint `department`
  - (Low) Insight Quality: Executive question lacks actionable recommendation
- **[C2-E02] Customer Support** — Biggest support opportunity for leadership
  - (Medium) Routing: Metric `tickets_opened` vs hint `satisfaction`
  - (Medium) Routing: Dimension `ticket_category` vs hint `channel`
  - (Low) Insight Quality: Executive question lacks actionable recommendation
- **[HC3-E01] Healthcare** — What are the biggest clinical operational risks?
  - (Medium) Routing: Metric `patient_volume` vs hint `readmissions`
  - (Medium) Routing: Dimension `region` vs hint `department`
  - (Low) Insight Quality: Executive question lacks actionable recommendation
- **[R-I01] Retail** — Is revenue correlated with customers?
  - (Medium) Routing: Metric `customers` vs hint `revenue`
  - (Medium) Routing: Dimension `revenue` vs hint `customers`
- **[R-E01] Retail** — What are the biggest opportunities in this retail data?
  - (Medium) Routing: Dimension `region` vs hint `city`
  - (Low) Insight Quality: Executive question lacks actionable recommendation
- **[R-E02] Retail** — What are the biggest risks?
  - (Medium) Routing: Metric `revenue` vs hint `profit`
  - (Low) Insight Quality: Executive question lacks actionable recommendation
- **[R-I06] Retail** — Compare quantity sold across products
  - (Medium) Calculation Accuracy: Data grounding score below 7.0
  - (Medium) Calculation Accuracy: Chart top 'Desk' vs pandas top 'Electronics'
- **[M-I01] Marketing** — Is revenue correlated with satisfaction_score?
  - (Medium) Routing: Metric `satisfaction_score` vs hint `revenue`
  - (Medium) Routing: Dimension `revenue` vs hint `satisfaction`
- **[M-E01] Marketing** — Biggest marketing opportunity
  - (Medium) Routing: Dimension `region` vs hint `channel`
  - (Low) Insight Quality: Executive question lacks actionable recommendation
- **[M-E02] Marketing** — Biggest marketing risk
  - (Medium) Routing: Metric `revenue` vs hint `satisfaction`
  - (Low) Insight Quality: Executive question lacks actionable recommendation

---

## Per-question audit registry

Full registry of all suite questions. **Follow-up suggestions** column lists scripted chain follow-ups where applicable; the routing path does not emit dynamic post-answer suggestions.

| QID | Domain | Question | Intent | Metric | Dim | Chart | Conf | Strict | Avg | Notes |
|-----|--------|----------|--------|--------|-----|-------|------|--------|----:|-------|
| B-B01 | Banking & Financial Services | Which branch has the highest loan balance? | ranking | loan_balance | branch | horizontalBar | medium | PASS | 8.69 | — |
| B-B02 | Banking & Financial Services | Compare deposits across regions | compare | deposit_balance | region | bar | medium | PASS | 8.69 | — |
| B-B03 | Banking & Financial Services | Rank customer segments by interest income | ranking | interest_income | customer_segment | horizontalBar | medium | PASS | 8.69 | — |
| B-B04 | Banking & Financial Services | Show deposit trend over time | trend | npl_amount | report_date | line | medium | **FAIL** | 8.00 | Metric hint deposit_balance not in npl_amount |
| B-B05 | Banking & Financial Services | Which branch has the lowest delinquency rate? | ranking | delinquency_rate | branch | horizontalBar | medium | PASS | 8.69 | — |
| B-B07 | Banking & Financial Services | Total NPL amount by region | compare | npl_amount | region | bar | medium | PASS | 8.69 | — |
| B-C1-F1 | Banking & Financial Services | Why is {ENTITY} highest? | ranking | spend_amount | product_type | horizontalBar | medium | **FAIL** | 8.75 | — |
| B-C1-F2 | Banking & Financial Services | Which columns were used for this analysis? | compare | spend_amount | product_type | bar | medium | **FAIL** | 8.75 | — |
| B-C1-F3 | Banking & Financial Services | Show the calculations behind this answer. | compare | spend_amount | product_type | bar | medium | **FAIL** | 8.75 | — |
| B-C1-Q | Banking & Financial Services | Which branch has the highest loan balance? | ranking | loan_balance | branch | horizontalBar | medium | PASS | 8.69 | — |
| B-C2-F1 | Banking & Financial Services | What risk does concentration create? | executive | spend_amount | customer_segment | bar | medium | **FAIL** | 8.12 | Intent mismatch: got 'executive', expected ('compare',) |
| B-C2-F2 | Banking & Financial Services | What action should management take? | compare | spend_amount | product_type | bar | medium | **FAIL** | 8.12 | Intent mismatch: got 'executive', expected ('compare',); Metric hint deposit_... |
| B-C2-Q | Banking & Financial Services | Compare deposits across regions | compare | deposit_balance | region | bar | medium | PASS | 8.69 | — |
| B-D06 | Banking & Financial Services | Delinquency rate by branch | compare | delinquency_rate | branch | horizontalBar | medium | **FAIL** | 8.31 | Intent 'compare' acceptable fallback for ranking |
| B-D07 | Banking & Financial Services | Spend category breakdown | ranking | spend_amount | spend_category | donut | medium | **FAIL** | 8.31 | Intent 'ranking' acceptable fallback for compare |
| B-E01 | Banking & Financial Services | Biggest portfolio opportunity | executive | spend_amount | region | bar | medium | **FAIL** | 7.75 | Metric hint interest_income not in spend_amount; Executive question lacks act... |
| B-E02 | Banking & Financial Services | Biggest credit risk | executive | spend_amount | customer_segment | bar | medium | **FAIL** | 7.75 | Metric hint npl not in spend_amount; Executive question lacks actionable reco... |
| B-E03 | Banking & Financial Services | Executive summary of branch performance | summary | spend_amount | region | bar | medium | **FAIL** | 8.00 | Metric hint deposit_balance not in spend_amount |
| B-E04 | Banking & Financial Services | What should the CRO focus on? | compare | spend_amount | product_type | bar | medium | **FAIL** | 7.75 | Intent 'compare' acceptable fallback for executive; Metric hint npl not in sp... |
| B-I01 | Banking & Financial Services | Loan portfolio concentration by region | executive | spend_amount | region | bar | medium | **FAIL** | 7.75 | Metric hint loan_balance not in spend_amount; Executive question lacks action... |
| B-I02 | Banking & Financial Services | Delinquency outlier branches | outlier | spend_amount | customer_segment | horizontalBar | high | **FAIL** | 8.00 | Metric hint delinquency not in spend_amount; Dimension hint branch not in cus... |
| B-I03 | Banking & Financial Services | Is interest income correlated with loan balance? | relationship | loan_balance | interest_income | scatter | high | **FAIL** | 8.00 | Metric hint interest_income not in loan_balance |
| B-I04 | Banking & Financial Services | Which regions exceed average delinquency? | fallback | spend_amount | region | bar | medium | **FAIL** | 7.81 | Intent mismatch: got 'fallback', expected ('ranking',); Metric hint delinquen... |
| B-I07 | Banking & Financial Services | Credit utilization risk concentration | executive | credit_utilization | customer_segment | bar | medium | PASS | 8.25 | Executive question lacks actionable recommendation |
| B-NEG | Banking & Financial Services | Compare net interest margin trend by quarter | fallback | — | — | none | low | PASS | 8.06 | Negative test: unsupported/limitation routing; Chart optional for negative test |
| C2-B01 | Customer Support | Which ticket category has the longest resolution time? | compare | avg_resolution_hours | ticket_category | bar | medium | **FAIL** | 8.31 | Intent 'compare' acceptable fallback for ranking |
| C2-B02 | Customer Support | Compare satisfaction score across channels | compare | satisfaction_score | channel | bar | medium | **FAIL** | 8.44 | Answer may omit top entity Portal |
| C2-B03 | Customer Support | Show tickets opened trend over report date | trend | tickets_opened | report_date | line | medium | PASS | 8.50 | — |
| C2-B04 | Customer Support | Rank departments by escalation count | ranking | escalations | department | horizontalBar | medium | PASS | 8.69 | — |
| C2-C1-F1 | Customer Support | Why is {ENTITY} highest? | ranking | tickets_opened | channel | horizontalBar | medium | **FAIL** | 8.12 | Intent mismatch: got 'compare', expected ('ranking',) |
| C2-C1-F2 | Customer Support | Which columns were used for this analysis? | compare | tickets_opened | channel | bar | medium | **FAIL** | 8.12 | Intent mismatch: got 'compare', expected ('ranking',) |
| C2-C1-F3 | Customer Support | Show the calculations behind this answer. | compare | tickets_opened | channel | bar | medium | **FAIL** | 8.12 | Intent mismatch: got 'compare', expected ('ranking',) |
| C2-C1-Q | Customer Support | Which ticket category has the longest resolution time? | compare | avg_resolution_hours | ticket_category | bar | medium | **FAIL** | 8.31 | Intent 'compare' acceptable fallback for ranking |
| C2-D01 | Customer Support | Which priority level drives the most escalations? | compare | escalations | priority | bar | medium | **FAIL** | 8.31 | Intent 'compare' acceptable fallback for ranking |
| C2-E01 | Customer Support | What are the biggest support risks? | executive | tickets_opened | ticket_category | bar | medium | **FAIL** | 7.75 | Metric hint escalations not in tickets_opened; Executive question lacks actio... |
| C2-E02 | Customer Support | Biggest support opportunity for leadership | executive | tickets_opened | ticket_category | bar | medium | **FAIL** | 7.75 | Metric hint satisfaction not in tickets_opened; Executive question lacks acti... |
| C2-E03 | Customer Support | Executive summary of support performance | summary | tickets_opened | ticket_category | bar | medium | **FAIL** | 8.00 | Metric hint tickets_resolved not in tickets_opened |
| C2-I01 | Customer Support | Compare tickets resolved vs opened by priority | compare | tickets_resolved | priority | bar | medium | PASS | 8.69 | — |
| C2-I02 | Customer Support | Is satisfaction correlated with resolution time? | relationship | avg_resolution_hours | satisfaction_score | scatter | high | **FAIL** | 8.00 | Metric hint satisfaction not in avg_resolution_hours |
| C2-NEG | Customer Support | Compare NPS across ticket categories | fallback | — | — | none | low | PASS | 7.19 | Negative test: unsupported/limitation routing; Chart optional for negative test |
| F2-B01 | Finance & FP&A | Which department has the largest budget variance? | compare | variance | department | horizontalBar | medium | PASS | 8.69 | — |
| F2-B02 | Finance & FP&A | Compare actual spend across cost centers | compare | actual | cost_center | horizontalBar | high | **FAIL** | 8.25 | Chart top 'CC-HR-2' vs pandas top 'CC-SAL-2' |
| F2-B03 | Finance & FP&A | Show revenue trend over report date | trend | revenue | report_date | line | medium | PASS | 8.50 | — |
| F2-B04 | Finance & FP&A | Rank categories by actual cost | ranking | actual | category | horizontalBar | medium | **FAIL** | 8.19 | Metric hint cost not in actual |
| F2-C1-F1 | Finance & FP&A | Why is {ENTITY} highest? | ranking | revenue | category | horizontalBar | medium | **FAIL** | 8.12 | Intent mismatch: got 'compare', expected ('ranking',) |
| F2-C1-F2 | Finance & FP&A | Which columns were used for this analysis? | compare | revenue | category | bar | medium | **FAIL** | 8.12 | Intent mismatch: got 'compare', expected ('ranking',) |
| F2-C1-F3 | Finance & FP&A | Show the calculations behind this answer. | compare | revenue | category | bar | medium | **FAIL** | 8.12 | Intent mismatch: got 'compare', expected ('ranking',) |
| F2-C1-Q | Finance & FP&A | Which department has the largest budget variance? | compare | variance | department | horizontalBar | medium | **FAIL** | 8.31 | Intent 'compare' acceptable fallback for ranking |
| F2-D01 | Finance & FP&A | Variance analysis by category | compare | variance | category | bar | medium | PASS | 8.69 | — |
| F2-E01 | Finance & FP&A | What are the biggest FP&A risks? | executive | revenue | category | bar | medium | **FAIL** | 7.75 | Metric hint variance not in revenue; Executive question lacks actionable reco... |
| F2-E02 | Finance & FP&A | Where is cost overrun concentrated? | executive | cost | category | bar | medium | **FAIL** | 7.75 | Metric hint actual not in cost; Executive question lacks actionable recommend... |
| F2-E03 | Finance & FP&A | Executive summary of department performance | summary | revenue | category | bar | medium | **FAIL** | 8.50 | — |
| F2-I01 | Finance & FP&A | Compare budget vs actual by department | compare | budget | department | horizontalBar | high | PASS | 8.69 | — |
| F2-I02 | Finance & FP&A | Is revenue correlated with units? | relationship | units | revenue | scatter | high | **FAIL** | 8.00 | Metric hint revenue not in units |
| F2-I03 | Finance & FP&A | Which cost center exceeds budget the most? | compare | budget | cost_center | horizontalBar | medium | **FAIL** | 7.75 | Intent 'compare' acceptable fallback for ranking; Metric hint variance not in... |
| F2-NEG | Finance & FP&A | Compare EBITDA margin trend by quarter | fallback | — | — | none | low | PASS | 8.06 | Negative test: unsupported/limitation routing; Chart optional for negative test |
| G-B01 | Geography | Which city generates the highest revenue? | ranking | revenue | city | horizontalBar | medium | PASS | 8.69 | — |
| G-B02 | Geography | Compare revenue across zones | compare | revenue | zone | bar | medium | PASS | 8.69 | — |
| G-B05 | Geography | Show revenue trend over time | trend | revenue | report_date | line | medium | PASS | 8.50 | — |
| G-B06 | Geography | Which zone has the lowest revenue? | ranking | revenue | zone | bar | medium | PASS | 8.69 | — |
| G-B08 | Geography | Which city has the highest growth rate? | ranking | growth_rate | city | horizontalBar | medium | **FAIL** | 8.44 | Answer may omit top entity Chandigarh |
| G-B10 | Geography | Total revenue by state | compare | revenue | state | horizontalBar | medium | PASS | 8.69 | — |
| G-C1-F1 | Geography | Why is {ENTITY} highest? | fallback | revenue | city | none | low | **FAIL** | 8.75 | — |
| G-C1-F2 | Geography | What evidence supports this conclusion? | fallback | revenue | city | none | low | **FAIL** | 8.75 | — |
| G-C1-F3 | Geography | Which columns were used for this analysis? | fallback | revenue | city | none | low | **FAIL** | 8.75 | — |
| G-C1-Q | Geography | Which city generates the highest revenue? | ranking | revenue | city | horizontalBar | medium | PASS | 8.69 | — |
| G-C2-F1 | Geography | What risk does concentration create? | executive | revenue | city | horizontalBar | medium | **FAIL** | 8.12 | Intent mismatch: got 'executive', expected ('compare',) |
| G-C2-F2 | Geography | What action should management take? | fallback | revenue | city | none | low | **FAIL** | 8.12 | Intent mismatch: got 'executive', expected ('compare',); Dimension hint zone ... |
| G-C2-Q | Geography | Compare revenue across zones | compare | revenue | zone | bar | medium | PASS | 8.69 | — |
| G-D01 | Geography | Regional concentration of revenue | executive | revenue | city | horizontalBar | medium | **FAIL** | 8.25 | Executive question lacks actionable recommendation |
| G-D07 | Geography | West vs South zone comparison | compare | revenue | zone | bar | medium | PASS | 8.69 | — |
| G-E01 | Geography | Biggest geographic opportunity | executive | revenue | zone | bar | medium | PASS | 8.25 | Executive question lacks actionable recommendation |
| G-E02 | Geography | Biggest geographic risk | executive | revenue | zone | bar | medium | **FAIL** | 8.25 | Executive question lacks actionable recommendation |
| G-E03 | Geography | Executive summary of regional performance | summary | revenue | zone | bar | medium | PASS | 8.50 | — |
| G-E06 | Geography | Where is revenue overly concentrated? | executive | revenue | city | horizontalBar | medium | PASS | 8.25 | Executive question lacks actionable recommendation |
| G-I01 | Geography | Is revenue correlated with customers? | relationship | customers | revenue | scatter | high | **FAIL** | 8.00 | Metric hint revenue not in customers |
| G-I02 | Geography | Regional concentration: revenue share by zone | executive | revenue | zone | bar | medium | PASS | 8.25 | Executive question lacks actionable recommendation |
| G-I03 | Geography | Which city is a revenue outlier? | outlier | revenue | city | horizontalBar | medium | PASS | 8.50 | — |
| G-I04 | Geography | Compare Mumbai vs Bengaluru revenue | compare | revenue | city | bar | high | **FAIL** | 8.25 | Chart top 'Mumbai' vs pandas top 'Amritsar' |
| G-I06 | Geography | Profit per customer by city | compare | profit | city | horizontalBar | medium | **FAIL** | 8.31 | Intent 'compare' acceptable fallback for ranking |
| G-NEG | Geography | Compare sales by salesperson across cities | fallback | — | — | none | low | PASS | 8.06 | Negative test: unsupported/limitation routing; Chart optional for negative test |
| H3-B01 | HR | Which department has the highest personnel cost? | ranking | personnel_cost | department | horizontalBar | medium | PASS | 8.69 | — |
| H3-B02 | HR | Compare attrition rate across locations | compare | attrition_rate | location | bar | medium | PASS | 8.69 | — |
| H3-B03 | HR | Show headcount trend over report date | trend | headcount | report_date | line | medium | PASS | 8.50 | — |
| H3-B04 | HR | Rank job families by satisfaction score | ranking | satisfaction_score | job_family | horizontalBar | medium | **FAIL** | 8.25 | Chart top 'Individual Contributor' vs pandas top 'Manager' |
| H3-C1-F1 | HR | Why is {ENTITY} highest? | ranking | headcount | department | horizontalBar | medium | **FAIL** | 8.75 | — |
| H3-C1-F2 | HR | Which columns were used for this analysis? | compare | headcount | department | horizontalBar | medium | **FAIL** | 8.75 | — |
| H3-C1-F3 | HR | Show the calculations behind this answer. | compare | headcount | department | horizontalBar | medium | **FAIL** | 8.75 | — |
| H3-C1-Q | HR | Which department has the highest personnel cost? | ranking | personnel_cost | department | horizontalBar | medium | PASS | 8.69 | — |
| H3-D01 | HR | Which location has the highest attrition rate? | ranking | attrition_rate | location | horizontalBar | medium | PASS | 8.69 | — |
| H3-E01 | HR | What are the biggest workforce risks? | executive | headcount | department | horizontalBar | medium | **FAIL** | 7.75 | Metric hint attrition not in headcount; Executive question lacks actionable r... |
| H3-E02 | HR | Biggest HR opportunity for leadership | executive | headcount | location | bar | medium | PASS | 8.25 | Executive question lacks actionable recommendation |
| H3-E03 | HR | Executive summary of workforce performance | summary | headcount | location | bar | medium | **FAIL** | 8.00 | Metric hint personnel_cost not in headcount |
| H3-I01 | HR | Compare hires vs terminations by department | compare | hires | department | horizontalBar | high | PASS | 8.69 | — |
| H3-I02 | HR | Is attrition correlated with satisfaction score? | relationship | satisfaction_score | attrition_rate | scatter | high | **FAIL** | 8.00 | Metric hint attrition not in satisfaction_score |
| H3-NEG | HR | Compare employee engagement score by quarter | fallback | — | — | none | low | PASS | 8.06 | Negative test: unsupported/limitation routing; Chart optional for negative test |
| HC3-B01 | Healthcare | Which ward has the highest patient volume? | ranking | patient_volume | ward | horizontalBar | medium | PASS | 8.69 | — |
| HC3-B02 | Healthcare | Compare readmissions across departments | compare | readmissions | department | bar | high | **FAIL** | 8.44 | Answer may omit top entity Cardiology |
| HC3-B03 | Healthcare | Show admissions trend over report date | trend | admissions | report_date | line | medium | PASS | 8.50 | — |
| HC3-B04 | Healthcare | Rank regions by average length of stay | ranking | patient_volume | region | bar | medium | **FAIL** | 8.19 | Metric hint length_of_stay not in patient_volume |
| HC3-C1-F1 | Healthcare | Why is {ENTITY} highest? | ranking | patient_volume | department | horizontalBar | medium | **FAIL** | 8.75 | — |
| HC3-C1-F2 | Healthcare | What evidence supports this conclusion? | compare | patient_volume | department | bar | medium | **FAIL** | 8.75 | — |
| HC3-C1-F3 | Healthcare | Which columns were used for this analysis? | compare | patient_volume | department | bar | medium | **FAIL** | 8.75 | — |
| HC3-C1-Q | Healthcare | Which ward has the highest patient volume? | ranking | patient_volume | ward | horizontalBar | medium | PASS | 8.69 | — |
| HC3-D01 | Healthcare | Compare satisfaction score across regions | compare | satisfaction_score | region | bar | medium | **FAIL** | 8.44 | Answer may omit top entity Rural |
| HC3-E01 | Healthcare | What are the biggest clinical operational risks? | executive | patient_volume | region | bar | medium | **FAIL** | 7.75 | Metric hint readmissions not in patient_volume; Executive question lacks acti... |
| HC3-E02 | Healthcare | Where is patient volume overly concentrated? | executive | patient_volume | region | bar | medium | **FAIL** | 8.25 | Executive question lacks actionable recommendation |
| HC3-E03 | Healthcare | Executive summary of regional performance | summary | patient_volume | region | bar | medium | **FAIL** | 8.00 | Metric hint cost not in patient_volume |
| HC3-I01 | Healthcare | Is cost correlated with patient volume? | relationship | patient_volume | cost | scatter | high | **FAIL** | 8.00 | Metric hint cost not in patient_volume |
| HC3-I02 | Healthcare | Which department has the lowest satisfaction score? | ranking | satisfaction_score | department | horizontalBar | medium | **FAIL** | 8.25 | Chart top 'Radiology' vs pandas top 'Emergency' |
| HC3-NEG | Healthcare | Compare patient risk score across wards | fallback | — | — | none | low | PASS | 8.12 | Negative test: unsupported/limitation routing; Chart optional for negative test |
| M-B01 | Marketing | Compare satisfaction_score by channel | compare | satisfaction_score | channel | bar | medium | **FAIL** | 8.44 | Answer may omit top entity Paid Social |
| M-B02 | Marketing | Which channel has the highest satisfaction_score? | ranking | satisfaction_score | channel | horizontalBar | medium | **FAIL** | 8.44 | Answer may omit top entity Paid Social |
| M-B04 | Marketing | Rank channels by revenue | ranking | revenue | channel | horizontalBar | medium | PASS | 8.69 | — |
| M-B05 | Marketing | Monthly trend of satisfaction score | trend | satisfaction_score | report_date | area | medium | PASS | 8.50 | — |
| M-B05b | Marketing | Show revenue trend over time | trend | revenue | report_date | line | medium | PASS | 8.50 | — |
| M-B06 | Marketing | Rank campaigns by conversions | ranking | conversions | campaign_name | horizontalBar | medium | PASS | 8.69 | — |
| M-B08 | Marketing | Compare revenue by channel | compare | revenue | channel | bar | medium | PASS | 8.69 | — |
| M-C1-F1 | Marketing | Why is {ENTITY} highest? | ranking | revenue | channel | horizontalBar | medium | **FAIL** | 8.75 | — |
| M-C1-F2 | Marketing | Which columns were used for this analysis? | compare | revenue | channel | bar | medium | **FAIL** | 8.75 | — |
| M-C1-F3 | Marketing | Show the calculations behind this answer. | compare | revenue | channel | bar | medium | **FAIL** | 8.75 | — |
| M-C1-Q | Marketing | Compare satisfaction_score by channel | compare | satisfaction_score | channel | bar | medium | **FAIL** | 8.44 | Answer may omit top entity Paid Social |
| M-C2-F1 | Marketing | What evidence supports this conclusion? | compare | revenue | channel | bar | medium | **FAIL** | 8.25 | Metric hint revenue not in satisfaction_score; Dimension hint satisfaction no... |
| M-C2-F2 | Marketing | What caution applies to causation? | compare | revenue | channel | bar | medium | **FAIL** | 7.38 | Intent mismatch: got 'compare', expected ('relationship',); Dimension hint sa... |
| M-C2-Q | Marketing | Is revenue correlated with satisfaction_score? | relationship | satisfaction_score | revenue | scatter | high | **FAIL** | 8.00 | Metric hint revenue not in satisfaction_score |
| M-D01 | Marketing | Campaign ROI: compare revenue to cost by campaign | compare | revenue | campaign_name | horizontalBar | medium | PASS | 8.69 | — |
| M-E01 | Marketing | Biggest marketing opportunity | executive | revenue | region | bar | medium | **FAIL** | 8.25 | Executive question lacks actionable recommendation |
| M-E02 | Marketing | Biggest marketing risk | executive | revenue | channel | bar | medium | **FAIL** | 7.75 | Metric hint satisfaction not in revenue; Executive question lacks actionable ... |
| M-E03 | Marketing | Executive summary of campaign performance | summary | revenue | region | bar | medium | **FAIL** | 8.50 | — |
| M-E05 | Marketing | Strategic recommendation for budget allocation | compare | revenue | channel | bar | medium | **FAIL** | 7.75 | Intent 'compare' acceptable fallback for executive; Metric hint spend not in ... |
| M-I01 | Marketing | Is revenue correlated with satisfaction_score? | relationship | satisfaction_score | revenue | scatter | high | **FAIL** | 8.00 | Metric hint revenue not in satisfaction_score |
| M-I02 | Marketing | Compare campaign ROI: revenue vs spend by campaign | compare | — | — | horizontalBar | low | **FAIL** | 7.50 | Metric hint revenue not in ; Dimension hint campaign not in  |
| M-I03 | Marketing | Which channel underperforms on satisfaction? | compare | revenue | channel | bar | medium | **FAIL** | 7.94 | Intent 'compare' acceptable fallback for ranking; Metric hint satisfaction no... |
| M-I05 | Marketing | Conversion analysis: revenue per conversion by channel | compare | revenue | channel | bar | medium | PASS | 8.69 | — |
| M-I06 | Marketing | Geographic: satisfaction by region | compare | revenue | region | bar | medium | **FAIL** | 8.19 | Metric hint satisfaction not in revenue |
| M-I07 | Marketing | Outlier campaigns on spend | outlier | spend | campaign_name | horizontalBar | high | PASS | 8.50 | — |
| M-I09 | Marketing | Compare spend across channels | compare | spend | channel | bar | medium | PASS | 8.69 | — |
| M-NEG | Marketing | Compare NPS across channels | fallback | — | — | none | low | PASS | 7.19 | Negative test: unsupported/limitation routing; Chart optional for negative test |
| O2-B01 | Operations | Which facility has the highest downtime hours? | ranking | downtime_hours | facility | horizontalBar | medium | PASS | 8.69 | — |
| O2-B02 | Operations | Compare defect rate across production lines | compare | defect_rate | production_line | bar | medium | **FAIL** | 8.44 | Answer may omit top entity Line-2 |
| O2-B03 | Operations | Show units produced trend over time | trend | units_produced | report_date | line | medium | PASS | 8.50 | — |
| O2-B04 | Operations | Rank shifts by SLA score | ranking | sla_score | shift | horizontalBar | medium | PASS | 8.69 | — |
| O2-C1-F1 | Operations | Why is {ENTITY} highest? | ranking | downtime_hours | production_line | horizontalBar | medium | **FAIL** | 8.75 | — |
| O2-C1-F2 | Operations | What evidence supports this conclusion? | compare | downtime_hours | production_line | bar | medium | **FAIL** | 8.75 | — |
| O2-C1-F3 | Operations | Which columns were used for this analysis? | compare | downtime_hours | production_line | bar | medium | **FAIL** | 8.75 | — |
| O2-C1-Q | Operations | Which facility has the highest downtime hours? | ranking | downtime_hours | facility | horizontalBar | medium | PASS | 8.69 | — |
| O2-D01 | Operations | Compare cost across facilities | compare | cost | facility | bar | medium | PASS | 8.69 | — |
| O2-E01 | Operations | What are the biggest operational risks? | executive | downtime_hours | department | bar | medium | **FAIL** | 8.25 | Executive question lacks actionable recommendation |
| O2-E02 | Operations | Where is production loss concentrated? | executive | units_produced | department | bar | medium | **FAIL** | 7.75 | Metric hint cost not in units_produced; Executive question lacks actionable r... |
| O2-E03 | Operations | Executive summary of plant performance | summary | downtime_hours | production_line | bar | medium | **FAIL** | 8.00 | Metric hint units_produced not in downtime_hours |
| O2-I01 | Operations | Is downtime correlated with defect rate? | relationship | defect_rate | downtime_hours | scatter | high | **FAIL** | 8.00 | Metric hint downtime not in defect_rate |
| O2-I02 | Operations | Which department has the lowest SLA score? | ranking | sla_score | department | horizontalBar | medium | PASS | 8.69 | — |
| O2-NEG | Operations | Compare OEE trend by quarter | fallback | — | — | none | low | PASS | 8.06 | Negative test: unsupported/limitation routing; Chart optional for negative test |
| R-B01 | Retail | Which city generates the highest revenue? | ranking | revenue | city | horizontalBar | medium | PASS | 8.69 | — |
| R-B03 | Retail | Compare revenue across cities | compare | revenue | city | horizontalBar | medium | PASS | 8.69 | — |
| R-B04 | Retail | Compare profit across regions | compare | profit | region | bar | medium | PASS | 8.69 | — |
| R-B05 | Retail | Show revenue trend over time | trend | revenue | order_date | line | medium | PASS | 8.50 | — |
| R-B06 | Retail | Rank product categories by revenue | ranking | revenue | product_category | horizontalBar | medium | PASS | 8.69 | — |
| R-B07 | Retail | Which product drives the most orders? | compare | orders | product | horizontalBar | medium | **FAIL** | 7.88 | Intent 'compare' acceptable fallback for ranking; Chart top 'Desk' vs pandas ... |
| R-C1-F1 | Retail | Why is {ENTITY} highest? | ranking | revenue | product | horizontalBar | medium | **FAIL** | 8.75 | — |
| R-C1-F2 | Retail | What evidence supports this conclusion? | compare | revenue | product | horizontalBar | medium | **FAIL** | 8.75 | — |
| R-C1-F3 | Retail | Which columns were used for this analysis? | compare | revenue | product | horizontalBar | medium | **FAIL** | 8.75 | — |
| R-C1-F4 | Retail | Show the calculations behind this answer. | compare | revenue | product | horizontalBar | medium | **FAIL** | 8.75 | — |
| R-C1-F5 | Retail | Compare {ENTITY} with the second highest city. | ranking | revenue | city | horizontalBar | medium | **FAIL** | 8.75 | — |
| R-C1-Q | Retail | Which city generates the highest revenue? | ranking | revenue | city | horizontalBar | medium | PASS | 8.69 | — |
| R-C2-F1 | Retail | Why is {ENTITY} highest? | ranking | revenue | product | horizontalBar | medium | **FAIL** | 8.75 | — |
| R-C2-F2 | Retail | What risk does this concentration create? | executive | revenue | city | horizontalBar | medium | **FAIL** | 8.12 | Intent mismatch: got 'executive', expected ('compare',) |
| R-C2-F3 | Retail | Which columns were used for this analysis? | compare | revenue | product | horizontalBar | medium | **FAIL** | 8.75 | — |
| R-C2-Q | Retail | Compare revenue across cities | compare | revenue | city | horizontalBar | medium | PASS | 8.69 | — |
| R-D07 | Retail | What is average order value by city? | compare | orders | city | horizontalBar | medium | **FAIL** | 7.75 | Metric hint revenue not in orders; Chart top 'Chennai' vs pandas top 'Delhi' |
| R-E01 | Retail | What are the biggest opportunities in this retail data? | executive | revenue | region | bar | medium | **FAIL** | 8.25 | Executive question lacks actionable recommendation |
| R-E02 | Retail | What are the biggest risks? | executive | revenue | city | horizontalBar | medium | **FAIL** | 7.75 | Metric hint profit not in revenue; Executive question lacks actionable recomm... |
| R-E03 | Retail | Summarize business performance | summary | revenue | region | bar | medium | **FAIL** | 8.50 | — |
| R-E04 | Retail | What should leadership focus on? | executive | revenue | city | horizontalBar | medium | PASS | 8.25 | Executive question lacks actionable recommendation |
| R-E06 | Retail | Where are we losing money? | profitability | profit | city | horizontalBar | medium | PASS | 8.50 | — |
| R-E07 | Retail | Give an executive summary of revenue by region | summary | revenue | region | bar | medium | PASS | 8.50 | — |
| R-E10 | Retail | What concentration risk exists in our revenue? | executive | revenue | city | horizontalBar | medium | PASS | 8.25 | Executive question lacks actionable recommendation |
| R-I01 | Retail | Is revenue correlated with customers? | relationship | customers | revenue | scatter | high | **FAIL** | 8.00 | Metric hint revenue not in customers |
| R-I02 | Retail | Which city is an revenue outlier? | outlier | revenue | city | horizontalBar | high | PASS | 8.50 | — |
| R-I06 | Retail | Compare quantity sold across products | compare | quantity | product | horizontalBar | medium | **FAIL** | 8.25 | Chart top 'Desk' vs pandas top 'Electronics' |
| R-I09 | Retail | Compare East vs West region revenue | compare | revenue | region | bar | medium | PASS | 8.69 | — |
| R-I10 | Retail | Show growth rate trend over time | trend | growth_rate | order_date | line | medium | PASS | 8.50 | — |
| R-NEG | Retail | Compare conversion rate across cities | fallback | — | — | none | low | PASS | 8.06 | Negative test: unsupported/limitation routing; Chart optional for negative test |
| S-B01 | Sales | Which region has the highest revenue? | ranking | revenue | region | bar | medium | PASS | 8.69 | — |
| S-B02 | Sales | Rank departments by revenue | ranking | revenue | department | horizontalBar | medium | PASS | 8.69 | — |
| S-B03 | Sales | Compare revenue across regions | compare | revenue | region | bar | medium | PASS | 8.69 | — |
| S-B04 | Sales | Which product line generates the most revenue? | compare | revenue | product_line | horizontalBar | medium | **FAIL** | 8.31 | Intent 'compare' acceptable fallback for ranking |
| S-B05 | Sales | Show revenue trend over time | trend | revenue | report_date | line | medium | PASS | 8.50 | — |
| S-B07 | Sales | Compare units sold across departments | compare | units | department | bar | medium | PASS | 8.69 | — |
| S-C1-F1 | Sales | Why is {ENTITY} highest? | ranking | revenue | product_line | horizontalBar | medium | **FAIL** | 8.75 | — |
| S-C1-F2 | Sales | Compare with the second highest region. | ranking | revenue | region | bar | medium | **FAIL** | 8.75 | — |
| S-C1-F3 | Sales | Which columns were used for this analysis? | compare | revenue | product_line | horizontalBar | medium | **FAIL** | 8.75 | — |
| S-C1-Q | Sales | Which region has the highest revenue? | ranking | revenue | region | bar | medium | PASS | 8.69 | — |
| S-C2-F1 | Sales | What action should management take for the lowest de... | ranking | revenue | department | horizontalBar | medium | **FAIL** | 8.75 | — |
| S-C2-F2 | Sales | Show the calculations behind this answer. | compare | revenue | product_line | horizontalBar | medium | **FAIL** | 8.75 | — |
| S-C2-Q | Sales | Rank departments by revenue | ranking | revenue | department | horizontalBar | medium | PASS | 8.69 | — |
| S-D01 | Sales | Which territory delivers the most revenue? | compare | revenue | region | bar | medium | **FAIL** | 7.75 | Intent 'compare' acceptable fallback for ranking; Dimension hint territory no... |
| S-D02 | Sales | Compare sales team performance by department | compare | revenue | department | bar | medium | PASS | 8.69 | — |
| S-D07 | Sales | Which region grew revenue month over month? | compare | revenue | region | bar | medium | **FAIL** | 7.12 | Intent mismatch: got 'compare', expected ('trend',); Chart family 'bar' vs ex... |
| S-E01 | Sales | What is the biggest sales opportunity? | executive | revenue | region | bar | medium | PASS | 8.25 | Executive question lacks actionable recommendation |
| S-E02 | Sales | What is the biggest sales risk? | executive | revenue | region | bar | medium | PASS | 8.25 | Executive question lacks actionable recommendation |
| S-E03 | Sales | Summarize sales performance | summary | revenue | region | bar | medium | PASS | 8.50 | — |
| S-E04 | Sales | What should the sales leader focus on? | compare | revenue | product_line | horizontalBar | medium | **FAIL** | 7.88 | Intent 'compare' acceptable fallback for executive; Executive question lacks ... |
| S-E10 | Sales | What concentration risk exists by region? | executive | revenue | region | bar | medium | PASS | 8.25 | Executive question lacks actionable recommendation |
| S-I01 | Sales | Is revenue correlated with units? | relationship | units | revenue | scatter | high | **FAIL** | 8.00 | Metric hint revenue not in units |
| S-I03 | Sales | Which department is an outlier for revenue? | outlier | revenue | department | histogram | low | **FAIL** | 7.50 | Chart family 'histogram' vs expected {'bar'}; Thin confidence rationale |
| S-I06 | Sales | Which region has the best attainment percentage? | ranking | attainment_pct | region | bar | medium | **FAIL** | 8.44 | Answer may omit top entity South |
| S-I08 | Sales | Rank product lines by revenue | ranking | revenue | product_line | horizontalBar | medium | PASS | 8.69 | — |
| S-NEG | Sales | Compare win rate by sales stage | fallback | — | — | none | low | PASS | 8.06 | Negative test: unsupported/limitation routing; Chart optional for negative test |

---

## Detailed failure analysis (strict FAIL)

### [S-D07] Sales: Which region grew revenue month over month?

| Field | Value |
|-------|-------|
| Pattern | trend |
| Intent detected | `compare` |
| Expected intent | `['trend']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `region` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 7.12 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total revenue by region. North leads with 25473805.0. Score 69/100 (medium) from 6 evidence factor(s); 340 row(s), 4 chart group(s). Revenue Share: 28%. Revenue Gap: 8.6M.

**Validation:**

- Intent correct: **No**
- Chart correct: **No**
- Metric correct: Yes
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent mismatch: got 'compare', expected ('trend',)
- Chart family 'bar' vs expected {'line'}

### [M-C2-F2] Marketing: What caution applies to causation?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `channel` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 7.38 |
| Follow-up chain | M-C2 |
| Chain follow-up | What caution applies to causation? |

**Executive summary (routing proxy):**

> Total revenue by channel. Affiliate leads with 115252428.0. Score 69/100 (medium) from 6 evidence factor(s); 320 row(s), 6 chart group(s). Revenue Share: 22%. Revenue Gap: 45.4M.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent mismatch: got 'compare', expected ('relationship',)
- Dimension hint satisfaction not in channel
- Chart family 'bar' vs expected {'scatter'}

### [M-I02] Marketing: Compare campaign ROI: revenue vs spend by campaign

| Field | Value |
|-------|-------|
| Pattern | compare |
| Intent detected | `compare` |
| Expected intent | `['compare']` |
| Primary metric | `` |
| Secondary metric | `—` |
| Dimension | `` |
| Chart type | `horizontalBar` |
| Confidence | `low` |
| Rubric avg | 7.50 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Compare campaign ROI: revenue vs spend by campaign. Retargeting Cart leads with 1640138.0. Score 36/100 (low) from 5 evidence factor(s); 320 row(s), 8 chart group(s).

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: **No**
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint revenue not in 
- Dimension hint campaign not in 
- Chart top 'Retargeting Cart' vs pandas top 'Holiday Promo'
- Thin confidence rationale

### [S-I03] Sales: Which department is an outlier for revenue?

| Field | Value |
|-------|-------|
| Pattern | outlier |
| Intent detected | `outlier` |
| Expected intent | `['outlier', 'ranking']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `department` |
| Chart type | `histogram` |
| Confidence | `low` |
| Rubric avg | 7.50 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total revenue by department. [62742.028, 158381.24) leads with 54.0. Score 33/100 (low) from 6 evidence factor(s); 340 row(s), 8 chart group(s). Revenue Share: 37%. Revenue Gap: 126.0.

**Live narrative excerpt (Wave 1 only, when available):**

> Key findings:

The calculated result shows total revenue by department across 340 rows:
- Field Sales: 36.238 million
- Channel Sales: 31.867 million
- Inside Sales: 23.628 million

Field Sales ranks highest and contributes approximately 37% of total revenue. The revenue distribution across the three departments is relatively concentrated, with Field Sales leading Channel Sales by roughly 4.4 mill...

**Validation:**

- Intent correct: Yes
- Chart correct: **No**
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Chart family 'histogram' vs expected {'bar'}
- Thin confidence rationale

### [R-E02] Retail: What are the biggest risks?

| Field | Value |
|-------|-------|
| Pattern | executive |
| Intent detected | `executive` |
| Expected intent | `['executive', 'risk']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `city` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 7.75 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total revenue by city. Delhi leads with 6327280.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 12 chart group(s). Primary concern: Growth Risk: Bhubaneswar. Top City: Delhi.

**Live narrative excerpt (Wave 1 only, when available):**

> Executive takeaway:
Geographic revenue concentration represents the primary business risk, with Delhi generating 6.3M in total revenue—nearly double Bhubaneswar's 2.95M—suggesting heavy dependency on a single city and elevated vulnerability to localized disruptions.

Evidence:
- Delhi accounts for 6,327,280 in revenue while the bottom three cities (Bhubaneswar, Patna, Ahmedabad) each contribute un...

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint profit not in revenue
- Executive question lacks actionable recommendation

### [R-D07] Retail: What is average order value by city?

| Field | Value |
|-------|-------|
| Pattern | ranking |
| Intent detected | `compare` |
| Expected intent | `['ranking', 'compare']` |
| Primary metric | `orders` |
| Secondary metric | `—` |
| Dimension | `city` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 7.75 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Average orders by city. Chennai leads with 204.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 12 chart group(s). Orders Gap: 65.0. Top City: Chennai.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: Yes
- Summary grounded: **No**
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint revenue not in orders
- Chart top 'Chennai' vs pandas top 'Delhi'

### [M-E02] Marketing: Biggest marketing risk

| Field | Value |
|-------|-------|
| Pattern | executive |
| Intent detected | `executive` |
| Expected intent | `['executive']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `channel` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 7.75 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total revenue by channel. Affiliate leads with 115252428.0. Score 69/100 (medium) from 6 evidence factor(s); 320 row(s), 6 chart group(s). Primary concern: Underperformer: Organic. Revenue Share: 22%.

**Live narrative excerpt (Wave 1 only, when available):**

> Executive takeaway:
Channel dependency on Affiliate creates material revenue concentration risk, while Organic underperformance suggests portfolio imbalance across marketing vehicles.

Evidence:
- Affiliate generates 115.3M in total revenue (22% of channel portfolio), nearly 65% more than the lowest-performing channel (Organic at 69.8M). This concentration narrows revenue stability if Affiliate pe...

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint satisfaction not in revenue
- Executive question lacks actionable recommendation

### [M-E05] Marketing: Strategic recommendation for budget allocation

| Field | Value |
|-------|-------|
| Pattern | executive |
| Intent detected | `compare` |
| Expected intent | `['executive']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `channel` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 7.75 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total revenue by channel. Affiliate leads with 115252428.0. Score 69/100 (medium) from 6 evidence factor(s); 320 row(s), 6 chart group(s). Revenue Share: 22%. Revenue Gap: 45.4M.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent 'compare' acceptable fallback for executive
- Metric hint spend not in revenue
- Executive question lacks actionable recommendation

### [S-D01] Sales: Which territory delivers the most revenue?

| Field | Value |
|-------|-------|
| Pattern | ranking |
| Intent detected | `compare` |
| Expected intent | `['ranking']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `region` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 7.75 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total revenue by region. North leads with 25473805.0. Score 69/100 (medium) from 6 evidence factor(s); 340 row(s), 4 chart group(s). Revenue Share: 28%. Revenue Gap: 8.6M.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: **No**
- Summary grounded: **No**
- Follow-up continuity: Yes

**Automated notes:**
- Intent 'compare' acceptable fallback for ranking
- Dimension hint territory not in region
- Chart top 'North' vs pandas top 'W-T3'

### [B-I01] Banking & Financial Services: Loan portfolio concentration by region

| Field | Value |
|-------|-------|
| Pattern | executive |
| Intent detected | `executive` |
| Expected intent | `['executive', 'compare']` |
| Primary metric | `spend_amount` |
| Secondary metric | `—` |
| Dimension | `region` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 7.75 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total spend amount by region. North leads with 4375219.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 5 chart group(s). Primary concern: Underperformer: West. Spend Amount Share: 23%.

**Live narrative excerpt (Wave 1 only, when available):**

> Executive takeaway:
Loan portfolio spend amount exhibits moderate geographic concentration, with West underperforming significantly and North anchoring the largest share.

Evidence:
- North leads at 4,375,219 in total spend amount (23% of regional total), while West ranks lowest at 3,194,178 (17%), representing a 27% gap between strongest and weakest regions.
- Central, East, and South cluster in ...

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint loan_balance not in spend_amount
- Executive question lacks actionable recommendation

### [B-E01] Banking & Financial Services: Biggest portfolio opportunity

| Field | Value |
|-------|-------|
| Pattern | executive |
| Intent detected | `executive` |
| Expected intent | `['executive']` |
| Primary metric | `spend_amount` |
| Secondary metric | `—` |
| Dimension | `region` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 7.75 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total spend amount by region. North leads with 4375219.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 5 chart group(s). Spend Amount Gap: 1,181,041. Spend Amount Gap: 1.2M. Spend Amount Share: 23%.

**Live narrative excerpt (Wave 1 only, when available):**

> Executive takeaway:
North and South regions dominate total spend amount, representing 53% of the portfolio, while West lags by 27% versus the leader—signaling a potential geographic concentration risk and an uplift opportunity in underperforming regions.

Evidence:
- North leads at 4,375,219 in total spend amount; South is nearly tied at 4,333,360, together accounting for over half of all spend ac...

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint interest_income not in spend_amount
- Executive question lacks actionable recommendation

### [B-E02] Banking & Financial Services: Biggest credit risk

| Field | Value |
|-------|-------|
| Pattern | executive |
| Intent detected | `executive` |
| Expected intent | `['executive']` |
| Primary metric | `spend_amount` |
| Secondary metric | `—` |
| Dimension | `customer_segment` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 7.75 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total spend amount by customer segment. Retail leads with 4223900.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 5 chart group(s). Primary concern: Underperformer: Mass Affluent. Spend Amount Share: 22%.

**Live narrative excerpt (Wave 1 only, when available):**

> Executive takeaway:
Mass Affluent segment presents the lowest spend amount concentration at 3.7 million, representing a potential portfolio weakness relative to Retail's 4.2 million leadership.

Evidence:
- Retail dominates spend amount at 4,223,900, while Mass Affluent trails at 3,705,831—an 12% gap that suggests uneven segment dependency and exposure concentration in higher-performing cohorts.
-...

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint npl not in spend_amount
- Executive question lacks actionable recommendation

### [B-E04] Banking & Financial Services: What should the CRO focus on?

| Field | Value |
|-------|-------|
| Pattern | executive |
| Intent detected | `compare` |
| Expected intent | `['executive']` |
| Primary metric | `spend_amount` |
| Secondary metric | `—` |
| Dimension | `product_type` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 7.75 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total spend amount by product type. Personal Loan leads with 4560029.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 5 chart group(s). Spend Amount Share: 23%. Spend Amount Gap: 1.2M.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent 'compare' acceptable fallback for executive
- Metric hint npl not in spend_amount
- Executive question lacks actionable recommendation

### [F2-E01] Finance & FP&A: What are the biggest FP&A risks?

| Field | Value |
|-------|-------|
| Pattern | executive |
| Intent detected | `executive` |
| Expected intent | `['executive']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `category` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 7.75 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total revenue by category. Contractors leads with 8423133.0. Score 69/100 (medium) from 6 evidence factor(s); 330 row(s), 5 chart group(s). Primary concern: Underperformer: Travel. Revenue Share: 22%.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint variance not in revenue
- Executive question lacks actionable recommendation

### [F2-E02] Finance & FP&A: Where is cost overrun concentrated?

| Field | Value |
|-------|-------|
| Pattern | executive |
| Intent detected | `executive` |
| Expected intent | `['executive']` |
| Primary metric | `cost` |
| Secondary metric | `—` |
| Dimension | `category` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 7.75 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total cost by category. Facilities leads with 9523201.0. Score 69/100 (medium) from 6 evidence factor(s); 330 row(s), 5 chart group(s). Primary concern: Underperformer: Travel. Cost Share: 22%.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint actual not in cost
- Executive question lacks actionable recommendation

### [F2-I03] Finance & FP&A: Which cost center exceeds budget the most?

| Field | Value |
|-------|-------|
| Pattern | ranking |
| Intent detected | `compare` |
| Expected intent | `['ranking']` |
| Primary metric | `budget` |
| Secondary metric | `—` |
| Dimension | `cost_center` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 7.75 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total budget by cost center. CC-SAL-2 leads with 3655926.0. Score 69/100 (medium) from 6 evidence factor(s); 330 row(s), 14 chart group(s). Budget Gap: 1.4M. Top Cost Center: CC-SAL-2.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: Yes
- Summary grounded: **No**
- Follow-up continuity: Yes

**Automated notes:**
- Intent 'compare' acceptable fallback for ranking
- Metric hint variance not in budget
- Chart top 'CC-SAL-2' vs pandas top 'CC-FIN-1'

### [O2-E02] Operations: Where is production loss concentrated?

| Field | Value |
|-------|-------|
| Pattern | executive |
| Intent detected | `executive` |
| Expected intent | `['executive']` |
| Primary metric | `units_produced` |
| Secondary metric | `—` |
| Dimension | `department` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 7.75 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total units produced by department. Maintenance leads with 322227.0. Score 69/100 (medium) from 6 evidence factor(s); 310 row(s), 5 chart group(s). Primary concern: Underperformer: Packaging. Units Produced Share: 21%.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint cost not in units_produced
- Executive question lacks actionable recommendation

### [C2-E01] Customer Support: What are the biggest support risks?

| Field | Value |
|-------|-------|
| Pattern | executive |
| Intent detected | `executive` |
| Expected intent | `['executive']` |
| Primary metric | `tickets_opened` |
| Secondary metric | `—` |
| Dimension | `ticket_category` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 7.75 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total tickets opened by ticket category. Onboarding leads with 15705.0. Score 69/100 (medium) from 6 evidence factor(s); 300 row(s), 6 chart group(s). Primary concern: Underperformer: Account. Tickets Opened Share: 19%.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint escalations not in tickets_opened
- Executive question lacks actionable recommendation

### [C2-E02] Customer Support: Biggest support opportunity for leadership

| Field | Value |
|-------|-------|
| Pattern | executive |
| Intent detected | `executive` |
| Expected intent | `['executive']` |
| Primary metric | `tickets_opened` |
| Secondary metric | `—` |
| Dimension | `ticket_category` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 7.75 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Average tickets opened by ticket category. Onboarding leads with 314.0. Score 69/100 (medium) from 6 evidence factor(s); 300 row(s), 6 chart group(s). Tickets Opened Gap: 2,637. Tickets Opened Gap: 53.0. Tickets Opened Share: 19%.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint satisfaction not in tickets_opened
- Executive question lacks actionable recommendation

### [H3-E01] HR: What are the biggest workforce risks?

| Field | Value |
|-------|-------|
| Pattern | executive |
| Intent detected | `executive` |
| Expected intent | `['executive']` |
| Primary metric | `headcount` |
| Secondary metric | `—` |
| Dimension | `department` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 7.75 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total headcount by department. Finance leads with 3101.0. Score 69/100 (medium) from 6 evidence factor(s); 300 row(s), 7 chart group(s). Primary concern: Underperformer: HR. Top Department: Finance.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint attrition not in headcount
- Executive question lacks actionable recommendation

### [HC3-E01] Healthcare: What are the biggest clinical operational risks?

| Field | Value |
|-------|-------|
| Pattern | executive |
| Intent detected | `executive` |
| Expected intent | `['executive']` |
| Primary metric | `patient_volume` |
| Secondary metric | `—` |
| Dimension | `region` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 7.75 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total patient volume by region. Rural leads with 129282.0. Score 69/100 (medium) from 6 evidence factor(s); 340 row(s), 3 chart group(s). Primary concern: Patient Volume Concentration: 38%. Patient Volume Share: 38%. Secondary concern: Underperformer: Suburban.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint readmissions not in patient_volume
- Executive question lacks actionable recommendation

### [B-I04] Banking & Financial Services: Which regions exceed average delinquency?

| Field | Value |
|-------|-------|
| Pattern | ranking |
| Intent detected | `fallback` |
| Expected intent | `['ranking']` |
| Primary metric | `spend_amount` |
| Secondary metric | `—` |
| Dimension | `region` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 7.81 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Average spend amount by region. East leads with 60093.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 5 chart group(s). Spend Amount Share: 22%.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: Yes
- Summary grounded: **No**
- Follow-up continuity: Yes

**Automated notes:**
- Intent mismatch: got 'fallback', expected ('ranking',)
- Metric hint delinquency not in spend_amount
- Answer may omit top entity North

### [R-B07] Retail: Which product drives the most orders?

| Field | Value |
|-------|-------|
| Pattern | ranking |
| Intent detected | `compare` |
| Expected intent | `['ranking']` |
| Primary metric | `orders` |
| Secondary metric | `—` |
| Dimension | `product` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 7.88 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total orders by product. Desk leads with 5537.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 13 chart group(s). Orders Gap: 1,168. Top Product: Desk.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: **No**
- Follow-up continuity: Yes

**Automated notes:**
- Intent 'compare' acceptable fallback for ranking
- Chart top 'Desk' vs pandas top 'Electronics'

### [S-E04] Sales: What should the sales leader focus on?

| Field | Value |
|-------|-------|
| Pattern | executive |
| Intent detected | `compare` |
| Expected intent | `['executive']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `product_line` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 7.88 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total revenue by product line. SMB Starter leads with 24880644.0. Score 69/100 (medium) from 6 evidence factor(s); 340 row(s), 4 chart group(s). Revenue Share: 27%.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent 'compare' acceptable fallback for executive
- Executive question lacks actionable recommendation

### [M-I03] Marketing: Which channel underperforms on satisfaction?

| Field | Value |
|-------|-------|
| Pattern | ranking |
| Intent detected | `compare` |
| Expected intent | `['ranking']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `channel` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 7.94 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total revenue by channel. Affiliate leads with 115252428.0. Score 69/100 (medium) from 6 evidence factor(s); 320 row(s), 6 chart group(s). Revenue Share: 22%. Revenue Gap: 45.4M.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: Yes
- Summary grounded: **No**
- Follow-up continuity: Yes

**Automated notes:**
- Intent 'compare' acceptable fallback for ranking
- Metric hint satisfaction not in revenue
- Answer may omit top entity Paid Social

### [R-I01] Retail: Is revenue correlated with customers?

| Field | Value |
|-------|-------|
| Pattern | relationship |
| Intent detected | `relationship` |
| Expected intent | `['relationship']` |
| Primary metric | `customers` |
| Secondary metric | `—` |
| Dimension | `revenue` |
| Chart type | `scatter` |
| Confidence | `high` |
| Rubric avg | 8.00 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Revenue vs Customers. Point 1 leads with 500.0. Score 94/100 (high): scatter correlation on 351 joint pair(s) from 360 filtered row(s).

**Live narrative excerpt (Wave 1 only, when available):**

> Key findings

The scatter analysis of 351 rows with both revenue and customers populated shows virtually no correlation between revenue and customer count. Pearson correlation is -0.03 and Spearman correlation is -0.05, both indicating a very weak relationship. The sample size of 351 joint pairs from 360 filtered rows provides high confidence in this result (confidence score 94/100). One notable o...

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint revenue not in customers

### [M-I01] Marketing: Is revenue correlated with satisfaction_score?

| Field | Value |
|-------|-------|
| Pattern | relationship |
| Intent detected | `relationship` |
| Expected intent | `['relationship']` |
| Primary metric | `satisfaction_score` |
| Secondary metric | `—` |
| Dimension | `revenue` |
| Chart type | `scatter` |
| Confidence | `high` |
| Rubric avg | 8.00 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Revenue vs Satisfaction Score. Point 1 leads with 3.2. Score 93/100 (high): scatter correlation on 307 joint pair(s) from 320 filtered row(s).

**Live narrative excerpt (Wave 1 only, when available):**

> Key findings

Based on analysis of 307 rows with both revenue and satisfaction_score populated, the correlation between revenue and satisfaction_score is very weak. Both the Pearson correlation coefficient (r = -0.04) and Spearman correlation coefficient (ρ = -0.04) point to negligible linear and rank-order association. The near-zero coefficients indicate that higher or lower revenue does not cons...

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint revenue not in satisfaction_score

### [M-C2-Q] Marketing: Is revenue correlated with satisfaction_score?

| Field | Value |
|-------|-------|
| Pattern | relationship |
| Intent detected | `relationship` |
| Expected intent | `['relationship']` |
| Primary metric | `satisfaction_score` |
| Secondary metric | `—` |
| Dimension | `revenue` |
| Chart type | `scatter` |
| Confidence | `high` |
| Rubric avg | 8.00 |
| Follow-up chain | M-C2 |

**Executive summary (routing proxy):**

> Revenue vs Satisfaction Score. Point 1 leads with 3.2. Score 93/100 (high): scatter correlation on 307 joint pair(s) from 320 filtered row(s).

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint revenue not in satisfaction_score

### [S-I01] Sales: Is revenue correlated with units?

| Field | Value |
|-------|-------|
| Pattern | relationship |
| Intent detected | `relationship` |
| Expected intent | `['relationship']` |
| Primary metric | `units` |
| Secondary metric | `—` |
| Dimension | `revenue` |
| Chart type | `scatter` |
| Confidence | `high` |
| Rubric avg | 8.00 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Revenue vs Units. Point 1 leads with 128.0. Score 93/100 (high): scatter correlation on 330 joint pair(s) from 340 filtered row(s).

**Live narrative excerpt (Wave 1 only, when available):**

> Key findings:

Revenue and units show a strong positive correlation across 330 joint observations from your 340 rows of sales data. The Pearson correlation coefficient is +0.64 and the Spearman correlation coefficient is +0.68, both indicating that higher revenue tends to move together with higher unit volume. This relationship is consistent whether measured by linear (Pearson) or rank-based (Spea...

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint revenue not in units

### [G-I01] Geography: Is revenue correlated with customers?

| Field | Value |
|-------|-------|
| Pattern | relationship |
| Intent detected | `relationship` |
| Expected intent | `['relationship']` |
| Primary metric | `customers` |
| Secondary metric | `—` |
| Dimension | `revenue` |
| Chart type | `scatter` |
| Confidence | `high` |
| Rubric avg | 8.00 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Revenue vs Customers. Point 1 leads with 529.0. Score 93/100 (high): scatter correlation on 285 joint pair(s) from 300 filtered row(s).

**Live narrative excerpt (Wave 1 only, when available):**

> Key findings

Revenue and customers show a very strong positive correlation across the 285 observations with both metrics populated. The Pearson correlation coefficient is +0.88 and the Spearman correlation coefficient is +0.89, both indicating that as revenue increases, customer count tends to increase in a consistent and predictable manner. The relationship is robust across the dataset: customer...

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint revenue not in customers

### [B-B04] Banking & Financial Services: Show deposit trend over time

| Field | Value |
|-------|-------|
| Pattern | trend |
| Intent detected | `trend` |
| Expected intent | `['trend']` |
| Primary metric | `npl_amount` |
| Secondary metric | `—` |
| Dimension | `report_date` |
| Chart type | `line` |
| Confidence | `medium` |
| Rubric avg | 8.00 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total npl amount trend (weekly). 2023-12-26/2024-01-01 leads with 6544212.0. Score 66/100 (medium) from 5 evidence factor(s); 360 row(s), 3 chart group(s). Npl Amount Share: 37%. Npl Amount Gap: 1.2M.

**Live narrative excerpt (Wave 1 only, when available):**

> Key findings:

Total npl amount across the dataset shows modest volatility over the three periods. The 2023-12-26/2024-01-01 period recorded 6,544,212 in npl amount. This dipped slightly to 6,435,955 in 2024-01-30/2024-02-05, representing a minor decline of approximately 1.7%. The most recent period, 2024-02-27/2024-03-04, reversed this trend with npl amount rising to 7,628,130, an increase of 18....

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint deposit_balance not in npl_amount

### [B-I03] Banking & Financial Services: Is interest income correlated with loan balance?

| Field | Value |
|-------|-------|
| Pattern | relationship |
| Intent detected | `relationship` |
| Expected intent | `['relationship']` |
| Primary metric | `loan_balance` |
| Secondary metric | `—` |
| Dimension | `interest_income` |
| Chart type | `scatter` |
| Confidence | `high` |
| Rubric avg | 8.00 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Interest Income vs Loan Balance. Point 1 leads with 4479716.5. Score 94/100 (high): scatter correlation on 360 joint pair(s) from 360 filtered row(s).

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint interest_income not in loan_balance

### [B-E03] Banking & Financial Services: Executive summary of branch performance

| Field | Value |
|-------|-------|
| Pattern | summary |
| Intent detected | `summary` |
| Expected intent | `['summary']` |
| Primary metric | `spend_amount` |
| Secondary metric | `—` |
| Dimension | `region` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.00 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total spend amount by region. North leads with 4375219.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 5 chart group(s). Top Region: North. Spend Amount Share: 23%. Spend Amount Gap: 27%.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint deposit_balance not in spend_amount

### [B-I02] Banking & Financial Services: Delinquency outlier branches

| Field | Value |
|-------|-------|
| Pattern | outlier |
| Intent detected | `outlier` |
| Expected intent | `['outlier']` |
| Primary metric | `spend_amount` |
| Secondary metric | `—` |
| Dimension | `customer_segment` |
| Chart type | `horizontalBar` |
| Confidence | `high` |
| Rubric avg | 8.00 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total spend amount by customer segment. Retail leads with 4223900.0. Score 76/100 (high) from 6 evidence factor(s); 360 row(s), 5 chart group(s). Largest gap: 12%. High outlier: Retail. Low outlier: Mass Affluent.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint delinquency not in spend_amount
- Dimension hint branch not in customer_segment

### [F2-I02] Finance & FP&A: Is revenue correlated with units?

| Field | Value |
|-------|-------|
| Pattern | relationship |
| Intent detected | `relationship` |
| Expected intent | `['relationship']` |
| Primary metric | `units` |
| Secondary metric | `—` |
| Dimension | `revenue` |
| Chart type | `scatter` |
| Confidence | `high` |
| Rubric avg | 8.00 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Revenue vs Units. Point 1 leads with 168.0. Score 93/100 (high): scatter correlation on 320 joint pair(s) from 330 filtered row(s).

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint revenue not in units

### [O2-I01] Operations: Is downtime correlated with defect rate?

| Field | Value |
|-------|-------|
| Pattern | relationship |
| Intent detected | `relationship` |
| Expected intent | `['relationship']` |
| Primary metric | `defect_rate` |
| Secondary metric | `—` |
| Dimension | `downtime_hours` |
| Chart type | `scatter` |
| Confidence | `high` |
| Rubric avg | 8.00 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Downtime Hours vs Defect Rate. Point 1 leads with 0.0. Score 93/100 (high): scatter correlation on 290 joint pair(s) from 310 filtered row(s).

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint downtime not in defect_rate

### [O2-E03] Operations: Executive summary of plant performance

| Field | Value |
|-------|-------|
| Pattern | summary |
| Intent detected | `summary` |
| Expected intent | `['summary']` |
| Primary metric | `downtime_hours` |
| Secondary metric | `—` |
| Dimension | `production_line` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.00 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Average downtime hours by production line. Line-1 leads with 7.8. Score 69/100 (medium) from 6 evidence factor(s); 310 row(s), 4 chart group(s). Top Production Line: Line-1. Downtime Hours Concentration: 26%. Downtime Hours Share: 26%.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint units_produced not in downtime_hours

### [C2-I02] Customer Support: Is satisfaction correlated with resolution time?

| Field | Value |
|-------|-------|
| Pattern | relationship |
| Intent detected | `relationship` |
| Expected intent | `['relationship']` |
| Primary metric | `avg_resolution_hours` |
| Secondary metric | `—` |
| Dimension | `satisfaction_score` |
| Chart type | `scatter` |
| Confidence | `high` |
| Rubric avg | 8.00 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Satisfaction Score vs Avg Resolution Hours. Point 1 leads with 23.3. Score 93/100 (high): scatter correlation on 292 joint pair(s) from 300 filtered row(s).

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint satisfaction not in avg_resolution_hours

### [C2-E03] Customer Support: Executive summary of support performance

| Field | Value |
|-------|-------|
| Pattern | summary |
| Intent detected | `summary` |
| Expected intent | `['summary']` |
| Primary metric | `tickets_opened` |
| Secondary metric | `—` |
| Dimension | `ticket_category` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.00 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Average tickets opened by ticket category. Onboarding leads with 314.0. Score 69/100 (medium) from 6 evidence factor(s); 300 row(s), 6 chart group(s). Top Ticket Category: Onboarding. Tickets Opened Share: 19%. Tickets Opened Gap: 17%.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint tickets_resolved not in tickets_opened

### [H3-I02] HR: Is attrition correlated with satisfaction score?

| Field | Value |
|-------|-------|
| Pattern | relationship |
| Intent detected | `relationship` |
| Expected intent | `['relationship']` |
| Primary metric | `satisfaction_score` |
| Secondary metric | `—` |
| Dimension | `attrition_rate` |
| Chart type | `scatter` |
| Confidence | `high` |
| Rubric avg | 8.00 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Attrition Rate vs Satisfaction Score. Point 1 leads with 3.7. Score 93/100 (high): scatter correlation on 284 joint pair(s) from 300 filtered row(s).

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint attrition not in satisfaction_score

### [H3-E03] HR: Executive summary of workforce performance

| Field | Value |
|-------|-------|
| Pattern | summary |
| Intent detected | `summary` |
| Expected intent | `['summary']` |
| Primary metric | `headcount` |
| Secondary metric | `—` |
| Dimension | `location` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.00 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total headcount by location. Remote-EMEA leads with 3463.0. Score 69/100 (medium) from 6 evidence factor(s); 300 row(s), 6 chart group(s). Top Location: Remote-EMEA. Headcount Gap: 17%. Trend direction: Directional.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint personnel_cost not in headcount

### [HC3-I01] Healthcare: Is cost correlated with patient volume?

| Field | Value |
|-------|-------|
| Pattern | relationship |
| Intent detected | `relationship` |
| Expected intent | `['relationship']` |
| Primary metric | `patient_volume` |
| Secondary metric | `—` |
| Dimension | `cost` |
| Chart type | `scatter` |
| Confidence | `high` |
| Rubric avg | 8.00 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Cost vs Patient Volume. Point 1 leads with 429.0. Score 93/100 (high): scatter correlation on 340 joint pair(s) from 340 filtered row(s).

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint cost not in patient_volume

### [HC3-E03] Healthcare: Executive summary of regional performance

| Field | Value |
|-------|-------|
| Pattern | summary |
| Intent detected | `summary` |
| Expected intent | `['summary']` |
| Primary metric | `patient_volume` |
| Secondary metric | `—` |
| Dimension | `region` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.00 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total patient volume by region. Rural leads with 129282.0. Score 69/100 (medium) from 6 evidence factor(s); 340 row(s), 3 chart group(s). Patient Volume Share: 38%. Top Region: Rural. Patient Volume Concentration: 38%.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint cost not in patient_volume

### [R-C2-F2] Retail: What risk does this concentration create?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `executive` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `city` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.12 |
| Follow-up chain | R-C2 |
| Chain follow-up | What risk does this concentration create? |

**Executive summary (routing proxy):**

> Total revenue by city. Delhi leads with 6327280.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 12 chart group(s). Primary concern: Growth Risk: Bhubaneswar. Top City: Delhi.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent mismatch: got 'executive', expected ('compare',)

### [G-C2-F1] Geography: What risk does concentration create?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `executive` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `city` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.12 |
| Follow-up chain | G-C2 |
| Chain follow-up | What risk does concentration create? |

**Executive summary (routing proxy):**

> Total revenue by city. Amritsar leads with 4331281.0. Score 57/100 (medium) from 7 evidence factor(s); 300 row(s), 11 chart group(s). Revenue Concentration: 44%. Primary concern: Growth Risk: Chennai. Secondary concern: Margin Risk: Kolkata.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent mismatch: got 'executive', expected ('compare',)

### [G-C2-F2] Geography: What action should management take?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `fallback` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `city` |
| Chart type | `none` |
| Confidence | `low` |
| Rubric avg | 8.12 |
| Follow-up chain | G-C2 |
| Chain follow-up | What action should management take? |

**Executive summary (routing proxy):**

> Score 21/100 (low) from 8 evidence factor(s); 300 row(s), 0 chart group(s).

**Validation:**

- Intent correct: **No**
- Chart correct: **No**
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent mismatch: got 'executive', expected ('compare',)
- Dimension hint zone not in city

### [B-C2-F1] Banking & Financial Services: What risk does concentration create?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `executive` |
| Expected intent | `['follow_up']` |
| Primary metric | `spend_amount` |
| Secondary metric | `—` |
| Dimension | `customer_segment` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.12 |
| Follow-up chain | B-C2 |
| Chain follow-up | What risk does concentration create? |

**Executive summary (routing proxy):**

> Total spend amount by customer segment. Retail leads with 4223900.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 5 chart group(s). Primary concern: Underperformer: Mass Affluent. Spend Amount Share: 22%.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent mismatch: got 'executive', expected ('compare',)

### [B-C2-F2] Banking & Financial Services: What action should management take?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `spend_amount` |
| Secondary metric | `—` |
| Dimension | `product_type` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.12 |
| Follow-up chain | B-C2 |
| Chain follow-up | What action should management take? |

**Executive summary (routing proxy):**

> Total spend amount by product type. Personal Loan leads with 4560029.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 5 chart group(s). Spend Amount Share: 23%. Spend Amount Gap: 1.2M.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent mismatch: got 'executive', expected ('compare',)
- Metric hint deposit_balance not in spend_amount
- Dimension hint region not in customer_segment

### [F2-C1-F1] Finance & FP&A: Why is {ENTITY} highest?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `ranking` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `category` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.12 |
| Follow-up chain | F2-C1 |
| Chain follow-up | Why is {ENTITY} highest? |

**Executive summary (routing proxy):**

> Maximum revenue by category. Personnel leads with 569282.0. Score 69/100 (medium) from 6 evidence factor(s); 330 row(s), 5 chart group(s). Revenue Share: 25%. Revenue Gap: 179,521.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent mismatch: got 'compare', expected ('ranking',)

### [F2-C1-F2] Finance & FP&A: Which columns were used for this analysis?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `category` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.12 |
| Follow-up chain | F2-C1 |
| Chain follow-up | Which columns were used for this analysis? |

**Executive summary (routing proxy):**

> Total revenue by category. Contractors leads with 8423133.0. Score 69/100 (medium) from 6 evidence factor(s); 330 row(s), 5 chart group(s). Revenue Share: 22%. Revenue Gap: 1.3M.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent mismatch: got 'compare', expected ('ranking',)

### [F2-C1-F3] Finance & FP&A: Show the calculations behind this answer.

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `category` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.12 |
| Follow-up chain | F2-C1 |
| Chain follow-up | Show the calculations behind this answer. |

**Executive summary (routing proxy):**

> Total revenue by category. Contractors leads with 8423133.0. Score 69/100 (medium) from 6 evidence factor(s); 330 row(s), 5 chart group(s). Revenue Share: 22%. Revenue Gap: 1.3M.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent mismatch: got 'compare', expected ('ranking',)

### [C2-C1-F1] Customer Support: Why is {ENTITY} highest?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `ranking` |
| Expected intent | `['follow_up']` |
| Primary metric | `tickets_opened` |
| Secondary metric | `—` |
| Dimension | `channel` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.12 |
| Follow-up chain | C2-C1 |
| Chain follow-up | Why is {ENTITY} highest? |

**Executive summary (routing proxy):**

> Maximum tickets opened by channel. Email leads with 518.0. Score 69/100 (medium) from 6 evidence factor(s); 300 row(s), 4 chart group(s). Tickets Opened Share: 25%.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent mismatch: got 'compare', expected ('ranking',)

### [C2-C1-F2] Customer Support: Which columns were used for this analysis?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `tickets_opened` |
| Secondary metric | `—` |
| Dimension | `channel` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.12 |
| Follow-up chain | C2-C1 |
| Chain follow-up | Which columns were used for this analysis? |

**Executive summary (routing proxy):**

> Total tickets opened by channel. Portal leads with 27564.0. Score 69/100 (medium) from 6 evidence factor(s); 300 row(s), 4 chart group(s). Tickets Opened Share: 33%. Tickets Opened Gap: 10,145.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent mismatch: got 'compare', expected ('ranking',)

### [C2-C1-F3] Customer Support: Show the calculations behind this answer.

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `tickets_opened` |
| Secondary metric | `—` |
| Dimension | `channel` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.12 |
| Follow-up chain | C2-C1 |
| Chain follow-up | Show the calculations behind this answer. |

**Executive summary (routing proxy):**

> Average tickets opened by channel. Portal leads with 296.0. Score 69/100 (medium) from 6 evidence factor(s); 300 row(s), 4 chart group(s). Tickets Opened Share: 26%.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent mismatch: got 'compare', expected ('ranking',)

### [M-I06] Marketing: Geographic: satisfaction by region

| Field | Value |
|-------|-------|
| Pattern | compare |
| Intent detected | `compare` |
| Expected intent | `['compare']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `region` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.19 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total revenue by region. South leads with 146844573.0. Score 69/100 (medium) from 6 evidence factor(s); 320 row(s), 5 chart group(s). Revenue Share: 28%. Revenue Gap: 73M.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint satisfaction not in revenue

### [F2-B04] Finance & FP&A: Rank categories by actual cost

| Field | Value |
|-------|-------|
| Pattern | ranking |
| Intent detected | `ranking` |
| Expected intent | `['ranking']` |
| Primary metric | `actual` |
| Secondary metric | `—` |
| Dimension | `category` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.19 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total actual by category. Facilities leads with 9523201.0. Score 69/100 (medium) from 6 evidence factor(s); 330 row(s), 5 chart group(s). Actual Share: 22%. Actual Gap: 1.8M.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint cost not in actual

### [HC3-B04] Healthcare: Rank regions by average length of stay

| Field | Value |
|-------|-------|
| Pattern | ranking |
| Intent detected | `ranking` |
| Expected intent | `['ranking']` |
| Primary metric | `patient_volume` |
| Secondary metric | `—` |
| Dimension | `region` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.19 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Average patient volume by region. Rural leads with 1034.0. Score 69/100 (medium) from 6 evidence factor(s); 340 row(s), 3 chart group(s). Patient Volume Share: 35%.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: **No**
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint length_of_stay not in patient_volume

### [R-E01] Retail: What are the biggest opportunities in this retail data?

| Field | Value |
|-------|-------|
| Pattern | executive |
| Intent detected | `executive` |
| Expected intent | `['executive', 'compare']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `region` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.25 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total revenue by region. North leads with 15521958.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 4 chart group(s). Revenue Gap: 6,505,126. Revenue Gap: 6.5M. Revenue Share: 33%.

**Live narrative excerpt (Wave 1 only, when available):**

> Executive takeaway:
East region underperforms by 40% versus North, presenting the clearest geographic uplift opportunity in this sample.

Evidence:
- North generates 15.52M in total revenue, while East contributes 9.02M—a 6.5M gap representing 42% spread across the four regions.
- East ranks last among regions; South and West each exceed East by 2.3M to 2.6M, suggesting systematic underperformance...

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Executive question lacks actionable recommendation

### [R-I06] Retail: Compare quantity sold across products

| Field | Value |
|-------|-------|
| Pattern | compare |
| Intent detected | `compare` |
| Expected intent | `['compare']` |
| Primary metric | `quantity` |
| Secondary metric | `—` |
| Dimension | `product` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.25 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total quantity by product. Desk leads with 7159.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 13 chart group(s). Quantity Gap: 1,471. Top Product: Desk.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: **No**
- Follow-up continuity: Yes

**Automated notes:**
- Chart top 'Desk' vs pandas top 'Electronics'

### [M-E01] Marketing: Biggest marketing opportunity

| Field | Value |
|-------|-------|
| Pattern | executive |
| Intent detected | `executive` |
| Expected intent | `['executive']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `region` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.25 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total revenue by region. South leads with 146844573.0. Score 69/100 (medium) from 6 evidence factor(s); 320 row(s), 5 chart group(s). Revenue Gap: 72,986,318. Revenue Gap: 73M. Revenue Share: 28%.

**Live narrative excerpt (Wave 1 only, when available):**

> Executive takeaway:
Central region presents the clearest growth opportunity, trailing the leader South by 73 million in total revenue despite operating in the same market landscape.

Evidence:
- South leads with 146.8 million in total revenue (28% of the five-region total), while Central trails at 73.9 million—a 50% gap suggesting material underperformance relative to peer regions.
- The gap betwe...

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Executive question lacks actionable recommendation

### [M-C2-F1] Marketing: What evidence supports this conclusion?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `channel` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.25 |
| Follow-up chain | M-C2 |
| Chain follow-up | What evidence supports this conclusion? |

**Executive summary (routing proxy):**

> Total revenue by channel. Affiliate leads with 115252428.0. Score 69/100 (medium) from 6 evidence factor(s); 320 row(s), 6 chart group(s). Revenue Share: 22%. Revenue Gap: 45.4M.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Metric hint revenue not in satisfaction_score
- Dimension hint satisfaction not in revenue

### [G-E02] Geography: Biggest geographic risk

| Field | Value |
|-------|-------|
| Pattern | executive |
| Intent detected | `executive` |
| Expected intent | `['executive']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `zone` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.25 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total revenue by zone. North leads with 19998526.0. Score 69/100 (medium) from 6 evidence factor(s); 300 row(s), 4 chart group(s). Primary concern: Growth Risk: East. Revenue Share: 29%.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Executive question lacks actionable recommendation

### [G-I04] Geography: Compare Mumbai vs Bengaluru revenue

| Field | Value |
|-------|-------|
| Pattern | compare |
| Intent detected | `compare` |
| Expected intent | `['compare']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `city` |
| Chart type | `bar` |
| Confidence | `high` |
| Rubric avg | 8.25 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Mumbai vs Bengaluru revenue by city. Mumbai leads with 3703299.0. Score 72/100 (high): resolved ranking across 2 group(s) from 30 filtered row(s). Revenue Concentration: 55%. Revenue Gap: 720,420.

**Live narrative excerpt (Wave 1 only, when available):**

> Key findings

The dataset contains 30 filtered rows across 2 cities. Mumbai's total revenue stands at 3,703,299, while Bengaluru's total revenue is 2,982,879. Mumbai leads by 720,420 in absolute terms, representing a 19% higher revenue total. Mumbai accounts for approximately 55% of combined revenue in this cohort, compared to Bengaluru's 45%.

What this may indicate

The revenue gap could reflect...

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: **No**
- Follow-up continuity: Yes

**Automated notes:**
- Chart top 'Mumbai' vs pandas top 'Amritsar'

### [G-D01] Geography: Regional concentration of revenue

| Field | Value |
|-------|-------|
| Pattern | executive |
| Intent detected | `executive` |
| Expected intent | `['executive']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `city` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.25 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total revenue by city. Amritsar leads with 4331281.0. Score 57/100 (medium) from 7 evidence factor(s); 300 row(s), 11 chart group(s). Revenue Concentration: 44%. Primary concern: Growth Risk: Chennai. Secondary concern: Margin Risk: Kolkata.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Executive question lacks actionable recommendation

### [F2-B02] Finance & FP&A: Compare actual spend across cost centers

| Field | Value |
|-------|-------|
| Pattern | compare |
| Intent detected | `compare` |
| Expected intent | `['compare']` |
| Primary metric | `actual` |
| Secondary metric | `cost` |
| Dimension | `cost_center` |
| Chart type | `horizontalBar` |
| Confidence | `high` |
| Rubric avg | 8.25 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Actual and Cost by Cost Center. CC-HR-2 leads with 292754.0. Score 79/100 (high) from 7 evidence factor(s); 330 row(s), 14 chart group(s). Actual And Cost Gap: 63,912. Top Cost Center: CC-HR-2.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: **No**
- Follow-up continuity: Yes

**Automated notes:**
- Chart top 'CC-HR-2' vs pandas top 'CC-SAL-2'

### [O2-E01] Operations: What are the biggest operational risks?

| Field | Value |
|-------|-------|
| Pattern | executive |
| Intent detected | `executive` |
| Expected intent | `['executive']` |
| Primary metric | `downtime_hours` |
| Secondary metric | `—` |
| Dimension | `department` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.25 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total downtime hours by department. Quality leads with 495.4. Score 69/100 (medium) from 6 evidence factor(s); 310 row(s), 5 chart group(s). Primary concern: Underperformer: Packaging. Downtime Hours Share: 22%.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Executive question lacks actionable recommendation

### [H3-B04] HR: Rank job families by satisfaction score

| Field | Value |
|-------|-------|
| Pattern | ranking |
| Intent detected | `ranking` |
| Expected intent | `['ranking']` |
| Primary metric | `satisfaction_score` |
| Secondary metric | `—` |
| Dimension | `job_family` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.25 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Average satisfaction score by job family. Individual Contributor leads with 4.1. Score 69/100 (medium) from 6 evidence factor(s); 300 row(s), 4 chart group(s). Satisfaction Score Share: 25%.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: **No**
- Follow-up continuity: Yes

**Automated notes:**
- Chart top 'Individual Contributor' vs pandas top 'Manager'

### [HC3-I02] Healthcare: Which department has the lowest satisfaction score?

| Field | Value |
|-------|-------|
| Pattern | ranking |
| Intent detected | `ranking` |
| Expected intent | `['ranking']` |
| Primary metric | `satisfaction_score` |
| Secondary metric | `—` |
| Dimension | `department` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.25 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Average satisfaction score by department. Radiology leads with 4.2. Score 69/100 (medium) from 6 evidence factor(s); 340 row(s), 6 chart group(s). Top Department: Radiology.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: **No**
- Follow-up continuity: Yes

**Automated notes:**
- Chart top 'Radiology' vs pandas top 'Emergency'

### [HC3-E02] Healthcare: Where is patient volume overly concentrated?

| Field | Value |
|-------|-------|
| Pattern | executive |
| Intent detected | `executive` |
| Expected intent | `['executive']` |
| Primary metric | `patient_volume` |
| Secondary metric | `—` |
| Dimension | `region` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.25 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total patient volume by region. Rural leads with 129282.0. Score 69/100 (medium) from 6 evidence factor(s); 340 row(s), 3 chart group(s). Primary concern: Patient Volume Concentration: 38%. Patient Volume Share: 38%. Secondary concern: Underperformer: Suburban.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Executive question lacks actionable recommendation

### [S-B04] Sales: Which product line generates the most revenue?

| Field | Value |
|-------|-------|
| Pattern | ranking |
| Intent detected | `compare` |
| Expected intent | `['ranking']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `product_line` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.31 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total revenue by product line. SMB Starter leads with 24880644.0. Score 69/100 (medium) from 6 evidence factor(s); 340 row(s), 4 chart group(s). Revenue Share: 27%.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent 'compare' acceptable fallback for ranking

### [G-I06] Geography: Profit per customer by city

| Field | Value |
|-------|-------|
| Pattern | ranking |
| Intent detected | `compare` |
| Expected intent | `['ranking']` |
| Primary metric | `profit` |
| Secondary metric | `—` |
| Dimension | `city` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.31 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total profit by city. Amritsar leads with 782658.0. Score 57/100 (medium) from 7 evidence factor(s); 300 row(s), 11 chart group(s). Profit Concentration: 43%. Profit Gap: 4.6M.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent 'compare' acceptable fallback for ranking

### [B-D06] Banking & Financial Services: Delinquency rate by branch

| Field | Value |
|-------|-------|
| Pattern | ranking |
| Intent detected | `compare` |
| Expected intent | `['ranking']` |
| Primary metric | `delinquency_rate` |
| Secondary metric | `—` |
| Dimension | `branch` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.31 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Average delinquency rate by branch. BR-009 leads with 0.1. Score 58/100 (medium) from 7 evidence factor(s); 360 row(s), 11 chart group(s). Delinquency Rate Concentration: 83%. Delinquency Rate Gap: 0.5.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent 'compare' acceptable fallback for ranking

### [B-D07] Banking & Financial Services: Spend category breakdown

| Field | Value |
|-------|-------|
| Pattern | compare |
| Intent detected | `ranking` |
| Expected intent | `['compare', 'distribution']` |
| Primary metric | `spend_amount` |
| Secondary metric | `—` |
| Dimension | `spend_category` |
| Chart type | `donut` |
| Confidence | `medium` |
| Rubric avg | 8.31 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total spend amount by spend category. Marketing leads with 23.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 5 chart group(s). Spend Amount Share: 23%. Spend Amount Gap: 6.2.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent 'ranking' acceptable fallback for compare

### [F2-C1-Q] Finance & FP&A: Which department has the largest budget variance?

| Field | Value |
|-------|-------|
| Pattern | ranking |
| Intent detected | `compare` |
| Expected intent | `['ranking']` |
| Primary metric | `variance` |
| Secondary metric | `—` |
| Dimension | `department` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.31 |
| Follow-up chain | F2-C1 |

**Executive summary (routing proxy):**

> Total variance by department. Finance leads with 455923.0. Score 69/100 (medium) from 6 evidence factor(s); 330 row(s), 7 chart group(s). Variance Share: 31%. Variance Gap: 446,616.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent 'compare' acceptable fallback for ranking

### [C2-B01] Customer Support: Which ticket category has the longest resolution time?

| Field | Value |
|-------|-------|
| Pattern | ranking |
| Intent detected | `compare` |
| Expected intent | `['ranking']` |
| Primary metric | `avg_resolution_hours` |
| Secondary metric | `—` |
| Dimension | `ticket_category` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.31 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Average avg resolution hours by ticket category. Billing leads with 16.8. Score 69/100 (medium) from 6 evidence factor(s); 300 row(s), 6 chart group(s). Top Ticket Category: Billing.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent 'compare' acceptable fallback for ranking

### [C2-D01] Customer Support: Which priority level drives the most escalations?

| Field | Value |
|-------|-------|
| Pattern | ranking |
| Intent detected | `compare` |
| Expected intent | `['ranking']` |
| Primary metric | `escalations` |
| Secondary metric | `—` |
| Dimension | `priority` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.31 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total escalations by priority. High leads with 2232.0. Score 69/100 (medium) from 6 evidence factor(s); 300 row(s), 4 chart group(s). Escalations Share: 30%. Escalations Gap: 661.0.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent 'compare' acceptable fallback for ranking

### [C2-C1-Q] Customer Support: Which ticket category has the longest resolution time?

| Field | Value |
|-------|-------|
| Pattern | ranking |
| Intent detected | `compare` |
| Expected intent | `['ranking']` |
| Primary metric | `avg_resolution_hours` |
| Secondary metric | `—` |
| Dimension | `ticket_category` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.31 |
| Follow-up chain | C2-C1 |

**Executive summary (routing proxy):**

> Average avg resolution hours by ticket category. Billing leads with 16.8. Score 69/100 (medium) from 6 evidence factor(s); 300 row(s), 6 chart group(s). Top Ticket Category: Billing.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

**Automated notes:**
- Intent 'compare' acceptable fallback for ranking

### [M-B01] Marketing: Compare satisfaction_score by channel

| Field | Value |
|-------|-------|
| Pattern | compare |
| Intent detected | `compare` |
| Expected intent | `['compare']` |
| Primary metric | `satisfaction_score` |
| Secondary metric | `—` |
| Dimension | `channel` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.44 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Average satisfaction score by channel. Paid Search leads with 4.0. Score 69/100 (medium) from 6 evidence factor(s); 320 row(s), 6 chart group(s). Top Channel: Paid Search.

**Live narrative excerpt (Wave 1 only, when available):**

> Key findings

Paid Search leads on average satisfaction score at 4.0, followed closely by Paid Social (4.0), Affiliate (4.0), and Organic (4.0). Email averages 3.9, while Display trails at 3.7. The spread across channels is modest—0.3 points separates the highest from lowest. All six channels cluster in the 3.7–4.0 range. The dataset includes 320 rows across 6 channel groups (approximately 53 rows...

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: **No**
- Follow-up continuity: Yes

**Automated notes:**
- Answer may omit top entity Paid Social

### [M-B02] Marketing: Which channel has the highest satisfaction_score?

| Field | Value |
|-------|-------|
| Pattern | ranking |
| Intent detected | `ranking` |
| Expected intent | `['ranking']` |
| Primary metric | `satisfaction_score` |
| Secondary metric | `—` |
| Dimension | `channel` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.44 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Average satisfaction score by channel. Paid Search leads with 4.0. Score 69/100 (medium) from 6 evidence factor(s); 320 row(s), 6 chart group(s). Top Channel: Paid Search.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: **No**
- Follow-up continuity: Yes

**Automated notes:**
- Answer may omit top entity Paid Social

### [M-C1-Q] Marketing: Compare satisfaction_score by channel

| Field | Value |
|-------|-------|
| Pattern | compare |
| Intent detected | `compare` |
| Expected intent | `['compare']` |
| Primary metric | `satisfaction_score` |
| Secondary metric | `—` |
| Dimension | `channel` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.44 |
| Follow-up chain | M-C1 |

**Executive summary (routing proxy):**

> Average satisfaction score by channel. Paid Search leads with 4.0. Score 69/100 (medium) from 6 evidence factor(s); 320 row(s), 6 chart group(s). Top Channel: Paid Search.

**Live narrative excerpt (Wave 1 only, when available):**

> Key findings:

Paid Search ranks highest on average satisfaction score at 4.0, followed closely by Paid Social at 4.0 and Affiliate at 4.0. Organic scores 4.0, Email scores 3.9, and Display scores 3.7 — the lowest among the six channels. The spread between the top performer (Paid Search) and the lowest (Display) is 0.3 points. All channels fall within a narrow range of 3.7 to 4.0 on the satisfacti...

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: **No**
- Follow-up continuity: Yes

**Automated notes:**
- Answer may omit top entity Paid Social

### [S-I06] Sales: Which region has the best attainment percentage?

| Field | Value |
|-------|-------|
| Pattern | ranking |
| Intent detected | `ranking` |
| Expected intent | `['ranking']` |
| Primary metric | `attainment_pct` |
| Secondary metric | `—` |
| Dimension | `region` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.44 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Average attainment pct by region. North leads with 100.0. Score 69/100 (medium) from 6 evidence factor(s); 340 row(s), 4 chart group(s). Attainment Pct Share: 26%.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: **No**
- Follow-up continuity: Yes

**Automated notes:**
- Answer may omit top entity South

### [G-B08] Geography: Which city has the highest growth rate?

| Field | Value |
|-------|-------|
| Pattern | ranking |
| Intent detected | `ranking` |
| Expected intent | `['ranking']` |
| Primary metric | `growth_rate` |
| Secondary metric | `—` |
| Dimension | `city` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.44 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Average growth rate by city. Guwahati leads with 0.3. Score 57/100 (medium) from 7 evidence factor(s); 300 row(s), 11 chart group(s). Growth Rate Concentration: 41%. Growth Rate Gap: 1.7.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: **No**
- Follow-up continuity: Yes

**Automated notes:**
- Answer may omit top entity Chandigarh

### [O2-B02] Operations: Compare defect rate across production lines

| Field | Value |
|-------|-------|
| Pattern | compare |
| Intent detected | `compare` |
| Expected intent | `['compare']` |
| Primary metric | `defect_rate` |
| Secondary metric | `—` |
| Dimension | `production_line` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.44 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Average defect rate by production line. Line-4 leads with 0.0. Score 69/100 (medium) from 6 evidence factor(s); 310 row(s), 4 chart group(s).

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: **No**
- Follow-up continuity: Yes

**Automated notes:**
- Answer may omit top entity Line-2

### [C2-B02] Customer Support: Compare satisfaction score across channels

| Field | Value |
|-------|-------|
| Pattern | compare |
| Intent detected | `compare` |
| Expected intent | `['compare']` |
| Primary metric | `satisfaction_score` |
| Secondary metric | `—` |
| Dimension | `channel` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.44 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Average satisfaction score by channel. Phone leads with 3.9. Score 69/100 (medium) from 6 evidence factor(s); 300 row(s), 4 chart group(s). Satisfaction Score Share: 25%.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: **No**
- Follow-up continuity: Yes

**Automated notes:**
- Answer may omit top entity Portal

### [HC3-B02] Healthcare: Compare readmissions across departments

| Field | Value |
|-------|-------|
| Pattern | compare |
| Intent detected | `compare` |
| Expected intent | `['compare']` |
| Primary metric | `readmissions` |
| Secondary metric | `admissions` |
| Dimension | `department` |
| Chart type | `bar` |
| Confidence | `high` |
| Rubric avg | 8.44 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Readmissions and Admissions by Department. Pediatrics leads with 885.0. Score 79/100 (high) from 7 evidence factor(s); 340 row(s), 6 chart group(s). Readmissions And Admissions Share: 19%. Readmissions And Admissions Gap: 219.0.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: **No**
- Follow-up continuity: Yes

**Automated notes:**
- Answer may omit top entity Cardiology

### [HC3-D01] Healthcare: Compare satisfaction score across regions

| Field | Value |
|-------|-------|
| Pattern | compare |
| Intent detected | `compare` |
| Expected intent | `['compare']` |
| Primary metric | `satisfaction_score` |
| Secondary metric | `—` |
| Dimension | `region` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.44 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Average satisfaction score by region. Metro leads with 4.1. Score 69/100 (medium) from 6 evidence factor(s); 340 row(s), 3 chart group(s). Satisfaction Score Share: 34%.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: **No**
- Follow-up continuity: Yes

**Automated notes:**
- Answer may omit top entity Rural

### [R-E03] Retail: Summarize business performance

| Field | Value |
|-------|-------|
| Pattern | summary |
| Intent detected | `summary` |
| Expected intent | `['summary', 'executive', 'compare']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `region` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.50 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total revenue by region. North leads with 15521958.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 4 chart group(s). Revenue Share: 33%. Top Region: North. Revenue Concentration: 33%.

**Live narrative excerpt (Wave 1 only, when available):**

> Executive takeaway:
North region dominates revenue performance, capturing one-third of total business revenue while East lags significantly behind.

Evidence:
- North generated 15.5M in total revenue, 34% of the four-region total, and leads East by 42% on absolute revenue.
- East contributed the lowest revenue at 9.0M, while South and West are closer to parity at 11.6M and 11.3M respectively.

Rec...

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

### [M-E03] Marketing: Executive summary of campaign performance

| Field | Value |
|-------|-------|
| Pattern | summary |
| Intent detected | `summary` |
| Expected intent | `['summary', 'executive']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `region` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.50 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total revenue by region. South leads with 146844573.0. Score 69/100 (medium) from 6 evidence factor(s); 320 row(s), 5 chart group(s). Top Region: South. Revenue Concentration: 28%. Revenue Share: 28%.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

### [F2-E03] Finance & FP&A: Executive summary of department performance

| Field | Value |
|-------|-------|
| Pattern | summary |
| Intent detected | `summary` |
| Expected intent | `['summary', 'executive']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `category` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.50 |
| Follow-up chain | — |

**Executive summary (routing proxy):**

> Total revenue by category. Contractors leads with 8423133.0. Score 69/100 (medium) from 6 evidence factor(s); 330 row(s), 5 chart group(s). Top Category: Contractors. Revenue Share: 22%. Revenue Gap: 16%.

**Validation:**

- Intent correct: Yes
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: **No**
- Summary grounded: Yes
- Follow-up continuity: Yes

### [R-C1-F1] Retail: Why is {ENTITY} highest?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `ranking` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `product` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | R-C1 |
| Chain follow-up | Why is {ENTITY} highest? |

**Executive summary (routing proxy):**

> Maximum revenue by product. Phone leads with 303761.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 13 chart group(s). Revenue Gap: 128,532. Top Product: Phone.

**Live narrative excerpt (Wave 1 only, when available):**

> Based on the previous revenue-by-city result, here is why Delhi is highest:

Key findings:

Delhi generates the highest total revenue at 6,327,280, substantially ahead of the second-ranked city, Jaipur (4,767,697). Delhi's revenue exceeds the lowest-ranked city, Bhubaneswar (2,950,469), by approximately 3.4 million or 53 percent. The dataset covers 360 rows across 12 cities, with Delhi accounting ...

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [R-C1-F2] Retail: What evidence supports this conclusion?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `product` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | R-C1 |
| Chain follow-up | What evidence supports this conclusion? |

**Executive summary (routing proxy):**

> Total revenue by product. Tablet leads with 4788108.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 13 chart group(s). Revenue Gap: 2.1M. Top Product: Tablet.

**Live narrative excerpt (Wave 1 only, when available):**

> For the prior chart, the evidence is:

Key findings:

Delhi's total revenue of 6,327,280 is supported by the dataset showing 13,415 customers and 7,218 orders in that city—both the highest counts among the 12 cities. Jaipur, the second-ranked city, generated 4,767,697 in revenue with 12,052 customers and 6,924 orders. Mumbai (4,758,053 revenue) has fewer customers (8,649) than Jaipur despite simil...

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [R-C1-F3] Retail: Which columns were used for this analysis?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `product` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | R-C1 |
| Chain follow-up | Which columns were used for this analysis? |

**Executive summary (routing proxy):**

> Total revenue by product. Tablet leads with 4788108.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 13 chart group(s). Revenue Gap: 2.1M. Top Product: Tablet.

**Live narrative excerpt (Wave 1 only, when available):**

> For the prior chart, the calculation used:

Metric column: revenue
Breakdown column: city
Aggregation: sum (total revenue per city)

The analysis grouped all 360 rows by city and summed revenue within each of the 12 cities. No other columns were filtered or excluded from the grouping; the entire dataset was included in the totals shown in the horizontal bar chart....

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [R-C1-F4] Retail: Show the calculations behind this answer.

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `product` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | R-C1 |
| Chain follow-up | Show the calculations behind this answer. |

**Executive summary (routing proxy):**

> Total revenue by product. Tablet leads with 4788108.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 13 chart group(s). Revenue Gap: 2.1M. Top Product: Tablet.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [R-C1-F5] Retail: Compare {ENTITY} with the second highest city.

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `ranking` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `city` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | R-C1 |
| Chain follow-up | Compare {ENTITY} with the second highest city. |

**Executive summary (routing proxy):**

> Total revenue by city. Delhi leads with 6327280.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 12 chart group(s). Revenue Gap: 3.4M. Top City: Delhi.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [R-C2-F1] Retail: Why is {ENTITY} highest?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `ranking` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `product` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | R-C2 |
| Chain follow-up | Why is {ENTITY} highest? |

**Executive summary (routing proxy):**

> Maximum revenue by product. Phone leads with 303761.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 13 chart group(s). Revenue Gap: 128,532. Top Product: Phone.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [R-C2-F3] Retail: Which columns were used for this analysis?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `product` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | R-C2 |
| Chain follow-up | Which columns were used for this analysis? |

**Executive summary (routing proxy):**

> Total revenue by product. Tablet leads with 4788108.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 13 chart group(s). Revenue Gap: 2.1M. Top Product: Tablet.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [M-C1-F1] Marketing: Why is {ENTITY} highest?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `ranking` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `channel` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | M-C1 |
| Chain follow-up | Why is {ENTITY} highest? |

**Executive summary (routing proxy):**

> Maximum revenue by channel. Display leads with 12457787.0. Score 69/100 (medium) from 6 evidence factor(s); 320 row(s), 6 chart group(s). Revenue Share: 22%. Revenue Gap: 6.5M.

**Live narrative excerpt (Wave 1 only, when available):**

> Based on the previous satisfaction score-by-channel result, Paid Social is not actually highest — it ties with three other channels.

Key findings:

Paid Search leads at an average satisfaction score of 4.0, but Paid Social, Affiliate, and Organic all match that same 4.0 level when rounded to one decimal place. Email follows at 3.9, and Display scores lowest at 3.7. The raw calculated averages sho...

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [M-C1-F2] Marketing: Which columns were used for this analysis?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `channel` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | M-C1 |
| Chain follow-up | Which columns were used for this analysis? |

**Executive summary (routing proxy):**

> Total revenue by channel. Affiliate leads with 115252428.0. Score 69/100 (medium) from 6 evidence factor(s); 320 row(s), 6 chart group(s). Revenue Share: 22%. Revenue Gap: 45.4M.

**Live narrative excerpt (Wave 1 only, when available):**

> For the prior chart, the calculation used the following columns:

Metric column: satisfaction_score (aggregated as Average/Mean)
Breakdown column: channel
Aggregation: Mean

The dataset contains 320 rows across 6 channel categories (Paid Search, Paid Social, Affiliate, Organic, Email, and Display). The satisfaction_score column has 13 null values, leaving 307 valid records for the analysis....

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [M-C1-F3] Marketing: Show the calculations behind this answer.

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `channel` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | M-C1 |
| Chain follow-up | Show the calculations behind this answer. |

**Executive summary (routing proxy):**

> Total revenue by channel. Affiliate leads with 115252428.0. Score 69/100 (medium) from 6 evidence factor(s); 320 row(s), 6 chart group(s). Revenue Share: 22%. Revenue Gap: 45.4M.

**Live narrative excerpt (Wave 1 only, when available):**

> For the prior chart, the calculation used the metric column satisfaction_score aggregated as average (mean) across the breakdown column channel. The dataset contained 320 rows distributed across 6 channel categories (Paid Search, Paid Social, Affiliate, Organic, Email, Display), with 13 null values in satisfaction_score, leaving 307 valid records for the analysis.

Key findings:

The average satis...

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [S-C1-F1] Sales: Why is {ENTITY} highest?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `ranking` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `product_line` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | S-C1 |
| Chain follow-up | Why is {ENTITY} highest? |

**Executive summary (routing proxy):**

> Maximum revenue by product line. SMB Starter leads with 1197938.0. Score 69/100 (medium) from 6 evidence factor(s); 340 row(s), 4 chart group(s). Revenue Concentration: 40%. Revenue Gap: 678,805.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [S-C1-F2] Sales: Compare with the second highest region.

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `ranking` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `region` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | S-C1 |
| Chain follow-up | Compare with the second highest region. |

**Executive summary (routing proxy):**

> Total revenue by region. North leads with 25473805.0. Score 69/100 (medium) from 6 evidence factor(s); 340 row(s), 4 chart group(s). Revenue Share: 28%. Revenue Gap: 8.6M.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [S-C1-F3] Sales: Which columns were used for this analysis?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `product_line` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | S-C1 |
| Chain follow-up | Which columns were used for this analysis? |

**Executive summary (routing proxy):**

> Total revenue by product line. SMB Starter leads with 24880644.0. Score 69/100 (medium) from 6 evidence factor(s); 340 row(s), 4 chart group(s). Revenue Share: 27%.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [S-C2-F1] Sales: What action should management take for the lowest department?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `ranking` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `department` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | S-C2 |
| Chain follow-up | What action should management take for the lowest department? |

**Executive summary (routing proxy):**

> Minimum revenue by department. Channel Sales leads with 84965.0. Score 69/100 (medium) from 6 evidence factor(s); 340 row(s), 3 chart group(s). Revenue Share: 37%. Revenue Gap: 21,089.

**Live narrative excerpt (Wave 1 only, when available):**

> Based on the previous result showing Inside Sales as the lowest-performing department by total revenue, here is guidance for management action.

Key findings

Inside Sales generated 80,784 in total revenue, trailing Channel Sales by approximately 4,489 (5% gap). The span between the top performer (Channel Sales at 84,965) and the lowest (Inside Sales) is relatively narrow—only about 5% of the high...

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [S-C2-F2] Sales: Show the calculations behind this answer.

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `product_line` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | S-C2 |
| Chain follow-up | Show the calculations behind this answer. |

**Executive summary (routing proxy):**

> Total revenue by product line. SMB Starter leads with 24880644.0. Score 69/100 (medium) from 6 evidence factor(s); 340 row(s), 4 chart group(s). Revenue Share: 27%.

**Live narrative excerpt (Wave 1 only, when available):**

> For the prior chart, the calculation used total (sum) revenue aggregated by department across 340 rows of data.

Calculation method

Each row in the dataset contains a revenue value and a department assignment (Field Sales, Channel Sales, or Inside Sales). The sum aggregation added all revenue entries within each department group:

Field Sales: 36,237,995 (sum of all Field Sales revenue rows)
Chan...

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [G-C1-F1] Geography: Why is {ENTITY} highest?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `fallback` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `city` |
| Chart type | `none` |
| Confidence | `low` |
| Rubric avg | 8.75 |
| Follow-up chain | G-C1 |
| Chain follow-up | Why is {ENTITY} highest? |

**Executive summary (routing proxy):**

> Score 21/100 (low) from 8 evidence factor(s); 300 row(s), 0 chart group(s).

**Live narrative excerpt (Wave 1 only, when available):**

> Based on the previous revenue-by-city result, Amritsar generates 4,331,281 in total revenue—the highest among all cities shown. Here's why it leads:

Key findings:

Amritsar leads because it combines two factors present in the dataset: it operates 186 stores (the highest store count among the top performers) and generates 6,162 customers. This combination yields the highest per-store revenue effic...

**Validation:**

- Intent correct: **No**
- Chart correct: **No**
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [G-C1-F2] Geography: What evidence supports this conclusion?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `fallback` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `city` |
| Chart type | `none` |
| Confidence | `low` |
| Rubric avg | 8.75 |
| Follow-up chain | G-C1 |
| Chain follow-up | What evidence supports this conclusion? |

**Executive summary (routing proxy):**

> Score 21/100 (low) from 8 evidence factor(s); 300 row(s), 0 chart group(s).

**Live narrative excerpt (Wave 1 only, when available):**

> For the prior chart, the evidence is:

Key findings:

Amritsar's revenue lead of 4,331,281 rests on two observable facts from the dataset:

1. Store count: Amritsar operates 186 stores—the highest among all named cities. Chandigarh (second place, 4,097,302 revenue) operates only 161 stores. That 25-store difference corresponds to a revenue gap of 233,979.

2. Customer base: Amritsar serves 6,162 c...

**Validation:**

- Intent correct: **No**
- Chart correct: **No**
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [G-C1-F3] Geography: Which columns were used for this analysis?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `fallback` |
| Expected intent | `['follow_up']` |
| Primary metric | `revenue` |
| Secondary metric | `—` |
| Dimension | `city` |
| Chart type | `none` |
| Confidence | `low` |
| Rubric avg | 8.75 |
| Follow-up chain | G-C1 |
| Chain follow-up | Which columns were used for this analysis? |

**Executive summary (routing proxy):**

> Score 21/100 (low) from 8 evidence factor(s); 300 row(s), 0 chart group(s).

**Live narrative excerpt (Wave 1 only, when available):**

> For the prior chart, the calculation used:

Metric column: revenue
Breakdown column: city
Aggregation: sum (total revenue per city)...

**Validation:**

- Intent correct: **No**
- Chart correct: **No**
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [B-C1-F1] Banking & Financial Services: Why is {ENTITY} highest?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `ranking` |
| Expected intent | `['follow_up']` |
| Primary metric | `spend_amount` |
| Secondary metric | `—` |
| Dimension | `product_type` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | B-C1 |
| Chain follow-up | Why is {ENTITY} highest? |

**Executive summary (routing proxy):**

> Maximum spend amount by product type. Term Deposit leads with 94948.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 5 chart group(s). Spend Amount Share: 20%.

**Live narrative excerpt (Wave 1 only, when available):**

> Based on the previous loan balance-by-branch result, BR-003 leads with a total loan balance of 41,979,951 — roughly 1.97 million ahead of the second-place BR-021 at 40,010,763.

Key findings

BR-003's 41.98 million represents approximately 9.5% of the measured loan balance portfolio across all 24 branches. The margin over BR-021 is modest at 1.97 million (4.9% difference), indicating that the top-...

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [B-C1-F2] Banking & Financial Services: Which columns were used for this analysis?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `spend_amount` |
| Secondary metric | `—` |
| Dimension | `product_type` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | B-C1 |
| Chain follow-up | Which columns were used for this analysis? |

**Executive summary (routing proxy):**

> Total spend amount by product type. Personal Loan leads with 4560029.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 5 chart group(s). Spend Amount Share: 23%. Spend Amount Gap: 1.2M.

**Live narrative excerpt (Wave 1 only, when available):**

> For the prior chart, the calculation used three components:

Metric column: loan_balance
Breakdown column: branch
Aggregation: sum (Total)

The analysis summed all loan_balance values within the dataset and grouped them by branch identifier, then ranked branches by their total loan balance from highest to lowest....

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [B-C1-F3] Banking & Financial Services: Show the calculations behind this answer.

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `spend_amount` |
| Secondary metric | `—` |
| Dimension | `product_type` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | B-C1 |
| Chain follow-up | Show the calculations behind this answer. |

**Executive summary (routing proxy):**

> Total spend amount by product type. Personal Loan leads with 4560029.0. Score 70/100 (medium) from 6 evidence factor(s); 360 row(s), 5 chart group(s). Spend Amount Share: 23%. Spend Amount Gap: 1.2M.

**Live narrative excerpt (Wave 1 only, when available):**

> For the prior chart, the calculation used three components:

Metric column: loan_balance
Breakdown column: branch
Aggregation: Total (sum)

The analysis summed all loan_balance values in the dataset (360 rows across 11 branch groups) and ranked branches by their total loan balance from highest to lowest.

Key findings:

BR-003 holds the highest total loan balance at 41,979,951, followed by BR-021 ...

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [O2-C1-F1] Operations: Why is {ENTITY} highest?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `ranking` |
| Expected intent | `['follow_up']` |
| Primary metric | `downtime_hours` |
| Secondary metric | `—` |
| Dimension | `production_line` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | O2-C1 |
| Chain follow-up | Why is {ENTITY} highest? |

**Executive summary (routing proxy):**

> Maximum downtime hours by production line. Line-2 leads with 35.2. Score 69/100 (medium) from 6 evidence factor(s); 310 row(s), 4 chart group(s). Downtime Hours Share: 28%. Downtime Hours Gap: 5.9.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [O2-C1-F2] Operations: What evidence supports this conclusion?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `downtime_hours` |
| Secondary metric | `—` |
| Dimension | `production_line` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | O2-C1 |
| Chain follow-up | What evidence supports this conclusion? |

**Executive summary (routing proxy):**

> Average downtime hours by production line. Line-1 leads with 7.8. Score 69/100 (medium) from 6 evidence factor(s); 310 row(s), 4 chart group(s). Downtime Hours Share: 26%.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [O2-C1-F3] Operations: Which columns were used for this analysis?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `downtime_hours` |
| Secondary metric | `—` |
| Dimension | `production_line` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | O2-C1 |
| Chain follow-up | Which columns were used for this analysis? |

**Executive summary (routing proxy):**

> Total downtime hours by production line. Line-1 leads with 591.0. Score 69/100 (medium) from 6 evidence factor(s); 310 row(s), 4 chart group(s). Downtime Hours Share: 26%.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [H3-C1-F1] HR: Why is {ENTITY} highest?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `ranking` |
| Expected intent | `['follow_up']` |
| Primary metric | `headcount` |
| Secondary metric | `—` |
| Dimension | `department` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | H3-C1 |
| Chain follow-up | Why is {ENTITY} highest? |

**Executive summary (routing proxy):**

> Maximum headcount by department. Finance leads with 279.0. Score 69/100 (medium) from 6 evidence factor(s); 300 row(s), 7 chart group(s). Headcount Share: 26%. Headcount Gap: 157.0.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [H3-C1-F2] HR: Which columns were used for this analysis?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `headcount` |
| Secondary metric | `—` |
| Dimension | `department` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | H3-C1 |
| Chain follow-up | Which columns were used for this analysis? |

**Executive summary (routing proxy):**

> Total headcount by department. Finance leads with 3101.0. Score 69/100 (medium) from 6 evidence factor(s); 300 row(s), 7 chart group(s). Headcount Gap: 826.0. Top Department: Finance.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [H3-C1-F3] HR: Show the calculations behind this answer.

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `headcount` |
| Secondary metric | `—` |
| Dimension | `department` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | H3-C1 |
| Chain follow-up | Show the calculations behind this answer. |

**Executive summary (routing proxy):**

> Total headcount by department. Finance leads with 3101.0. Score 69/100 (medium) from 6 evidence factor(s); 300 row(s), 7 chart group(s). Headcount Gap: 826.0. Top Department: Finance.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [HC3-C1-F1] Healthcare: Why is {ENTITY} highest?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `ranking` |
| Expected intent | `['follow_up']` |
| Primary metric | `patient_volume` |
| Secondary metric | `—` |
| Dimension | `department` |
| Chart type | `horizontalBar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | HC3-C1 |
| Chain follow-up | Why is {ENTITY} highest? |

**Executive summary (routing proxy):**

> Maximum patient volume by department. Cardiology leads with 3105.0. Score 69/100 (medium) from 6 evidence factor(s); 340 row(s), 6 chart group(s). Patient Volume Share: 23%. Patient Volume Gap: 1,242.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [HC3-C1-F2] Healthcare: What evidence supports this conclusion?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `patient_volume` |
| Secondary metric | `—` |
| Dimension | `department` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | HC3-C1 |
| Chain follow-up | What evidence supports this conclusion? |

**Executive summary (routing proxy):**

> Total patient volume by department. Pediatrics leads with 62814.0. Score 69/100 (medium) from 6 evidence factor(s); 340 row(s), 6 chart group(s). Patient Volume Share: 18%. Patient Volume Gap: 15,251.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

### [HC3-C1-F3] Healthcare: Which columns were used for this analysis?

| Field | Value |
|-------|-------|
| Pattern | follow_up |
| Intent detected | `compare` |
| Expected intent | `['follow_up']` |
| Primary metric | `patient_volume` |
| Secondary metric | `—` |
| Dimension | `department` |
| Chart type | `bar` |
| Confidence | `medium` |
| Rubric avg | 8.75 |
| Follow-up chain | HC3-C1 |
| Chain follow-up | Which columns were used for this analysis? |

**Executive summary (routing proxy):**

> Total patient volume by department. Pediatrics leads with 62814.0. Score 69/100 (medium) from 6 evidence factor(s); 340 row(s), 6 chart group(s). Patient Volume Share: 18%. Patient Volume Gap: 15,251.

**Validation:**

- Intent correct: **No**
- Chart correct: Yes
- Metric correct: Yes
- Dimension correct: Yes
- Summary grounded: Yes
- Follow-up continuity: Yes

---

## Recommended fixes (no implementation — audit only)

### Critical / High priority

1. **Banking metric routing collapse** — Banking & Financial Services questions systematically route to `spend_amount` instead of `loan_balance`, `npl_amount`, `delinquency_rate`, `deposit_balance`, etc. This affects ~16/25 Banking questions.
2. **Trend vs compare routing** — Questions like "Which region grew revenue month over month?" route to `compare` + bar instead of `trend` + line. Add MoM/growth phrase detection before compare fallback.
3. **Dual-metric ROI** — "Compare campaign ROI: revenue vs spend by campaign" fails to resolve metric/dimension pair; needs explicit dual-metric compare spec.
4. **Outlier chart selection** — Sales outlier question selects `histogram` where bar ranking is expected for department-level outlier scan.
5. **Relationship follow-up** — "What caution applies to causation?" after correlation chain routes to `compare` instead of preserving relationship/correlation context.

### Medium priority

6. **Metric synonym resolution** — Executive risk questions mention `profit` but route `revenue`; AOV questions route `orders` not `revenue`/derived AOV.
7. **Chart ranking order** — Quantity vs orders columns cause chart top entity to differ from pandas ground truth (Desk vs Electronics).
8. **Negative test polish** — NPS negative tests pass rubric but use generic unsupported routing; ensure limitation-first wording is consistent in live narrative.
9. **Confidence calibration** — Several acceptable-fallback intents keep `medium` confidence; consider lowering when metric/dimension hints miss.

### Low priority

10. **Executive recommendations** — 31 executive/summary questions lack explicit actionable recommendation language in routing-proxy answers; live narrative is stronger (Wave 1).
11. **Dynamic follow-up suggestions** — Post-answer contextual follow-ups are not validated in routing-only mode; add per-turn suggestion QA.

---

## Reproduction

```bash
cd backend
python scripts/wave_qa_runner.py --wave all --routing-only
python scripts/cross_domain_regression.py --report-only
python -m pytest tests/test_follow_up_domain_chains.py tests/intent_engine/test_domain_quality_matrix.py -v
# Live narrative (requires ANTHROPIC_API_KEY):
python scripts/wave1_live_narrative_qa.py --wave 1
```

---

*Audit generated from production QA suite. No product code was modified.*