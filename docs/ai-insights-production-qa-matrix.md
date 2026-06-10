# AI Insights — Production QA Matrix

**Status:** Review framework only — **no fixes implemented**  
**UI:** AI Insights UI is **frozen** — this matrix evaluates response quality, routing, charts, follow-ups, confidence, and domain understanding only.  
**Companion docs:** [`ai-insights-domain-quality-framework.md`](ai-insights-domain-quality-framework.md) · [`ai-insights-domain-test-matrix.md`](ai-insights-domain-test-matrix.md) · [`manual-ai-insights-qa-checklist.md`](manual-ai-insights-qa-checklist.md)

---

## 1. Purpose and scope

Validate end-to-end AI Insights quality before production sign-off:

| Dimension | What we validate |
|-----------|------------------|
| Intent detection | Question → routing intent + metric + dimension |
| Chart selection | Chart family matches analysis pattern |
| Data grounding | Answer cites computed values; no invented columns |
| Executive summary | Lead-with-answer tone; business framing |
| Recommendations | Actionable, hedged, schema-bound |
| Confidence | Band + rationale match sample and routing |
| Follow-up continuity | Parent scope preserved across chain |
| Hallucination resistance | No NPS, conversion, CLV, etc. when absent |

**Execution:** Manual browser QA + optional backend routing pre-check (`compute_visualization_for_question`). Narrative scoring uses the rubric in §3.

---

## 2. Fixture map

| Domain | Wave | Primary fixture | Columns (authoritative) | Fixture status |
|--------|------|-----------------|-------------------------|----------------|
| **Retail** | 1 | `backend/tests/fixtures/retail_analytics_regression.csv` | `order_date`, `region`, `city`, `product_category`, `product`, `revenue`, `profit`, `customers`, `orders`, `quantity`, `growth_rate` | ✅ Ready |
| **Sales** | 1 | `domain_quality_generic.csv` | `report_date`, `region`, `department`, `category`, `revenue`, `cost`, `units`, `satisfaction_score` | ✅ Ready (proxy) |
| **Marketing** | 1 | `domain_quality_generic.csv` | same | ✅ Ready (proxy) |
| **Geography** | 1 | `geographic_performance.csv` | `city`, `state`, `zone`, `revenue`, `profit`, `customers`, `growth_rate` | ✅ Ready (no date) |
| **Banking & Financial Services** | 1 | *Proposed:* `banking_financial_services.csv` | `report_date`, `branch`, `region`, `customer_segment`, `product_type`, `loan_balance`, `deposit_balance`, `interest_income`, `npl_amount`, `delinquency_rate`, `credit_utilization`, `spend_category` | ⚠️ **Gap — Wave 1 blocker** |
| **Finance / FP&A** | 2 | `domain_quality_generic.csv` | revenue, cost, units, department, category, report_date | ✅ Ready (proxy) |
| **Operations** | 2 | `domain_quality_generic.csv` | units as throughput proxy | ✅ Ready (proxy) |
| **Customer Support** | 2 | `domain_quality_generic.csv` | satisfaction_score, department | ✅ Ready (proxy) |
| **HR** | 3 | `domain_quality_generic.csv` | units as headcount proxy | ✅ Ready (proxy) |
| **Healthcare** | 3 | `domain_quality_generic.csv` | units as patient volume; department as ward/clinical | ✅ Ready (proxy) |

**Proxy rule:** When domain vocabulary (territory, campaign, branch, ticket) does not exist as a column, pass if engine maps to the documented synonym (`units`→headcount, `category`→product/campaign, `department`→team/ward) **and** provenance states the mapping. Fail if answer treats proxy as literal without disclosure.

---

## 3. Scoring rubric (0–10 per dimension)

Score each question **after** base answer + chart render. Follow-up chain scored once per chain (average of steps).

| # | Dimension | 10 (Excellent) | 5 (Acceptable) | 0 (Fail) |
|---|-----------|----------------|----------------|----------|
| 1 | **Intent detection** | Intent, metric, dimension match matrix | Intent correct; dimension synonym acceptable | Wrong intent or unsupported without explanation |
| 2 | **Chart selection** | Chart family matches pattern; aligned to answer | Bar family swap (bar↔horizontalBar) ok | Wrong family (e.g. scatter for ranking) or missing chart |
| 3 | **Data grounding** | Top entity/value matches aggregation | Minor rounding; aggregation stated | Wrong winner or invented numbers |
| 4 | **Executive summary quality** | Lead sentence answers question; concise | Answer buried; some filler | Process narration only; no conclusion |
| 5 | **Recommendation quality** | Specific, hedged, data-linked next step | Generic advice | Causation claims or off-schema actions |
| 6 | **Confidence explanation** | Band matches routing; rationale cites sample | Band ok; rationale thin | Band contradicts routing or missing on cautious cohort |
| 7 | **Follow-up continuity** | All steps preserve root metric/dimension | One step drifts then recovers | New unrelated analysis; scope lost |
| 8 | **Hallucination resistance** | Zero invented metrics/dimensions | Soft industry filler only | INVENTED_MARKERS or fake columns |

**Chain pass threshold:** ≥7.0 average across 8 dimensions; no dimension below 4.  
**Domain pass threshold:** ≥90% of questions ≥7.0; 100% ≥5.0; zero hallucination fails.

**Anti-hallucination watchlist (auto-fail if asserted as fact):** conversion rate, NPS, CLV, churn, market penetration, salesperson, quarter (when no quarter column), patient risk score (when absent), budget column (when absent), SLA minutes (when absent).

---

## 4. Question metadata legend

Every question row uses:

| Field | Values |
|-------|--------|
| **Intent** | `ranking`, `compare`, `trend`, `relationship`, `outlier`, `executive`, `summary`, `profitability`, `variance`, `fallback` |
| **Chart** | `bar`, `horizontalBar`, `line`, `area`, `scatter`, `histogram`, `none`, `unsupported` |
| **KPI(s)** | Primary metric(s) + aggregation (sum/mean/count) |
| **Exec summary** | `direct-answer`, `ranking-lead`, `trend-narrative`, `risk-caution`, `opportunity-forward`, `compare-balanced`, `limitation-first` |
| **Confidence** | `high`, `moderate`, `low`, `cautious-small-sample` |
| **Follow-up** | `inherits-root`, `meta-evidence`, `meta-columns`, `meta-calc`, `compare-second`, `risk-lens`, `action-lens` |

---

## 5. Total question count

| Category | Per domain | Domains | Subtotal |
|----------|------------|---------|----------|
| A. Basic | 10 | 10 | **100** |
| B. Intermediate | 10 | 10 | **100** |
| C. Executive | 10 | 10 | **100** |
| D. Follow-up chains (root questions) | 5 | 10 | **50** |
| D. Follow-up steps (F1–F5 × 5 chains) | 25 | 10 | **250** |
| E. Domain-specific | 8–12 | 10 | **~100** |
| **Unique test utterances** | | | **~600** |
| **Scored evaluations** (base + chain steps) | | | **~850** |

---

## 6. Coverage heatmap (automation vs manual)

Legend: **A** = automated pytest (`test_domain_quality_matrix.py` / routing matrix) · **M** = manual browser only · **G** = gap (fixture or pattern missing)

| Domain | Wave | Basic | Intermediate | Executive | Follow-ups | Domain-specific | Routing auto | Narrative QA |
|--------|------|-------|--------------|-----------|------------|-----------------|--------------|--------------|
| Retail | 1 | A/M | A/M | M | A/M | M | **A** | M |
| Sales | 1 | A/M | M | G | A/M | M | Partial | M |
| Marketing | 1 | A/M | A/M | G | A/M | M | Partial | M |
| Geography | 1 | A/M | M | G | G | M | **A** | M |
| Banking & F.S. | 1 | G | G | G | G | G | **G** | G |
| Finance / FP&A | 2 | M | M | G | A/M | M | Partial | M |
| Operations | 2 | A/M | M | G | A/M | M | Partial | M |
| Customer Support | 2 | A/M | M | G | A/M | M | Partial | M |
| HR | 3 | A/M | G | G | A/M | M | Partial | M |
| Healthcare | 3 | A/M | G | G | A/M | M | Partial | M |

---

## 7. Expected chart coverage (by pattern × domain)

| Chart family | Retail | Sales | Mktg | Geo | Banking | FP&A | Ops | Support | HR | HC |
|--------------|--------|-------|------|-----|---------|------|-----|---------|----|----|
| bar / horizontalBar | ●●● | ●●● | ●●● | ●●● | ●●● | ●●● | ●●● | ●●● | ●● | ●● |
| line / area | ●●● | ●● | ●● | ○ | ●● | ●● | ●● | ○ | ○ | ○ |
| scatter | ●● | ● | ●● | ●● | ● | ● | ● | ○ | ○ | ○ |
| histogram / outlier | ● | ○ | ○ | ○ | ● | ○ | ○ | ● | ○ | ○ |
| none / unsupported | ○ | ○ | ○ | ● trend | ○ | ○ | ○ | ○ | ○ | ○ |

● = required coverage in matrix · ○ = optional or N/A

**Geography note:** Trend questions must return `unsupported` or explicit no-date limitation (no `report_date` / `order_date`).

**Banking note:** All chart expectations pending fixture; proxy testing on generic CSV is **out of scope** for banking sign-off.

---

## 8. Follow-up coverage map

Standard chain template (score each step):

| Step | Question pattern | Expected behavior |
|------|------------------|-------------------|
| **Q** | Domain root ranking/compare | Establishes metric + dimension + top entity |
| **F1** | Why is {ENTITY} highest/lowest? | `inherits-root`; explains driver from chart |
| **F2** | What evidence supports this conclusion? | `meta-evidence`; cites series points / values |
| **F3** | Which columns were used for this analysis? | `meta-columns`; provenance matches payload |
| **F4** | Show the calculations behind this answer. | `meta-calc`; aggregation stated; no invented metrics |
| **F5** | Domain-specific (compare 2nd, risk, or action) | See per-domain chains §9–§18 |

| Domain | Chains in matrix | Automated chain test | Retail parity (5-step) |
|--------|------------------|----------------------|-------------------------|
| Retail | 5 | ✅ `test_domain_quality_matrix` | ✅ Full |
| Sales | 5 | ✅ 3-step generic | Extend to 5 |
| Marketing | 5 | ✅ 3-step | Extend to 5 |
| Geography | 5 | ❌ Gap | Add |
| Banking | 5 | ❌ Blocked on fixture | Add with fixture |
| Finance / FP&A | 5 | ✅ 3-step (cost) | Extend to 5 |
| Operations | 5 | ✅ 3-step (units) | Extend to 5 |
| Customer Support | 5 | ✅ 3-step (lowest sat) | Extend to 5 |
| HR | 5 | ✅ 3-step | Extend to 5 |
| Healthcare | 5 | ✅ 3-step | Extend to 5 |

---

## 9. Priority execution order

### Wave 1 — Highest priority (production gate)

Execute in order; **do not start Wave 2 until Wave 1 domain averages ≥7.0**.

| Order | Domain | Fixture | Blocker | Exit criteria |
|-------|--------|---------|---------|---------------|
| 1 | **Retail** | `retail_analytics_regression.csv` | None | 100% routing auto cases pass; manual narrative ≥7.0 |
| 2 | **Geography** | `geographic_performance.csv` | Follow-up chain gap | Ranking + compare + scatter pass; trend shows limitation |
| 3 | **Sales** | `domain_quality_generic.csv` | Executive gaps | Region/department ranking + trend pass |
| 4 | **Marketing** | `domain_quality_generic.csv` | Executive gaps | Satisfaction + revenue relationship pass |
| 5 | **Banking & F.S.** | *New fixture required* | **Fixture** | Do not sign off until dedicated CSV exists |

### Wave 2

| Order | Domain | Notes |
|-------|--------|-------|
| 6 | Finance / FP&A | Cost variance, margin proxy (revenue−cost) |
| 7 | Operations | Throughput/units; SLA language → limitation |
| 8 | Customer Support | Lowest satisfaction; escalation proxy |

### Wave 3

| Order | Domain | Notes |
|-------|--------|-------|
| 9 | HR | Headcount/units; attrition → limitation unless column added |
| 10 | Healthcare | Patient volume/units; outcomes → satisfaction proxy only |

---

## 10. Production readiness checklist

### 10.1 Infrastructure

- [ ] Backend + frontend deployed to target environment
- [ ] LLM API keys and quotas verified
- [ ] Plan limits (AI questions/day) documented for QA account
- [ ] `NEXT_PUBLIC_AI_INSIGHTS_DEBUG` available for staging postmortems

### 10.2 Deterministic layer (CI)

- [ ] `pytest backend/tests/intent_engine/test_domain_quality_matrix.py` — green
- [ ] `pytest backend/tests/intent_engine/test_routing_matrix.py` — green
- [ ] `pytest backend/tests/intent_engine/test_follow_up_domain_chains.py` — green
- [ ] Frontend unit tests — green (`npm run test`)

### 10.3 Manual QA (this matrix)

- [ ] Wave 1 complete with scores recorded (§3 rubric)
- [ ] Banking fixture created OR Wave 1 sign-off explicitly excludes banking
- [ ] Zero hallucination fails across all executed questions
- [ ] Follow-up chains: ≥4/5 chains pass per domain
- [ ] PDF export spot-check: 1 question per Wave 1 domain

### 10.4 Sign-off

- [ ] Domain owner review for Retail + Geography
- [ ] Known gaps documented in release notes (not silent)
- [ ] Rollback plan if LLM quality regresses post-deploy

---

# Domain matrices

---

## Domain 1 — Retail (Wave 1)

**Fixture:** `retail_analytics_regression.csv` · **Anchor domain** — full automation baseline

### A. Basic questions (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| R-B01 | Which city generates the highest revenue? | ranking | bar | revenue sum by city | ranking-lead | high | inherits-root |
| R-B02 | Which city has the lowest revenue? | ranking | bar | revenue sum by city | ranking-lead | high | inherits-root |
| R-B03 | Compare revenue across cities | compare | bar | revenue sum by city | compare-balanced | high | inherits-root |
| R-B04 | Compare profit across regions | compare | bar | profit sum by region | compare-balanced | high | inherits-root |
| R-B05 | Show revenue trend over time | trend | line | revenue sum by order_date | trend-narrative | high | inherits-root |
| R-B06 | Rank product categories by revenue | ranking | bar | revenue sum by product_category | ranking-lead | high | inherits-root |
| R-B07 | Which product drives the most orders? | ranking | bar | orders sum by product | ranking-lead | high | inherits-root |
| R-B08 | What is total revenue across the dataset? | summary | bar/none | revenue sum | direct-answer | high | meta-calc |
| R-B09 | Compare customer counts across cities | compare | bar | customers sum by city | compare-balanced | moderate | inherits-root |
| R-B10 | Which region has the highest growth rate on average? | ranking | bar | growth_rate mean by region | ranking-lead | moderate | inherits-root |

### B. Intermediate questions (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| R-I01 | Is revenue correlated with customers? | relationship | scatter | revenue × customers | compare-balanced | moderate | meta-evidence |
| R-I02 | Which city is an revenue outlier? | outlier | bar/histogram | revenue by city | risk-caution | moderate | inherits-root |
| R-I03 | Compare revenue and profit by city side by side | compare | bar | revenue, profit by city | compare-balanced | moderate | inherits-root |
| R-I04 | How did revenue change month over month? | trend | line | revenue by order_date | trend-narrative | high | inherits-root |
| R-I05 | Which product category contributes the most profit? | ranking | bar | profit sum by product_category | ranking-lead | high | inherits-root |
| R-I06 | Compare quantity sold across products | compare | bar | quantity sum by product | compare-balanced | high | inherits-root |
| R-I07 | Which city has the highest revenue per customer? | ranking | bar | revenue/customers by city | ranking-lead | moderate | meta-calc |
| R-I08 | Identify cities where profit margin is weakest | ranking | bar | profit/revenue by city | risk-caution | moderate | action-lens |
| R-I09 | Compare East vs West region revenue | compare | bar | revenue sum by region | compare-balanced | high | compare-second |
| R-I10 | Show growth rate trend over time | trend | line | growth_rate mean by order_date | trend-narrative | moderate | inherits-root |

### C. Executive questions (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| R-E01 | What are the biggest opportunities in this retail data? | executive | bar | revenue by city/region | opportunity-forward | moderate | action-lens |
| R-E02 | What are the biggest risks? | executive | bar | profit, growth_rate | risk-caution | moderate | risk-lens |
| R-E03 | Summarize business performance | summary | bar | revenue, profit | direct-answer | moderate | inherits-root |
| R-E04 | What should leadership focus on? | executive | bar | top metrics | opportunity-forward | moderate | action-lens |
| R-E05 | Which markets should we invest in? | executive | bar | revenue growth by city | opportunity-forward | moderate | action-lens |
| R-E06 | Where are we losing money? | profitability | bar | profit by city | risk-caution | moderate | risk-lens |
| R-E07 | Give an executive summary of revenue by region | summary | bar | revenue by region | direct-answer | high | inherits-root |
| R-E08 | What is the key revenue driver? | executive | bar | revenue by dimension | direct-answer | moderate | meta-evidence |
| R-E09 | What strategic action do you recommend? | executive | bar/none | top gap metric | opportunity-forward | moderate | action-lens |
| R-E10 | What concentration risk exists in our revenue? | executive | bar | revenue share by city | risk-caution | moderate | risk-lens |

### D. Follow-up chains (5)

**Chain R-C1 — City revenue (regression parity)**  
Q: `Which city generates the highest revenue?` → **Mumbai**  
F1: Why is Mumbai highest? · F2: What evidence supports this? · F3: Which columns were used? · F4: Show the calculations. · F5: Compare Mumbai with the second highest city.  
*Expect:* intent `ranking`→continuation; chart unchanged; confidence ≥ moderate.

**Chain R-C2 — Region profit**  
Q: `Compare profit across regions` → top region from chart  
F1: Why is {ENTITY} highest? · F2: Evidence? · F3: Columns? · F4: Calculations? · F5: What risk does concentration create?

**Chain R-C3 — Product category**  
Q: `Rank product categories by revenue`  
F1–F4: standard meta · F5: What action should merchandising take?

**Chain R-C4 — Trend**  
Q: `Show revenue trend over time`  
F1: Why did the latest period change? · F2: Evidence? · F3: Columns? · F4: Calculations? · F5: What should leadership watch next month?

**Chain R-C5 — Relationship**  
Q: `Is revenue correlated with customers?`  
F1: How strong is the relationship? · F2: Evidence? · F3: Columns? · F4: Calculations? · F5: What caution applies to causation?

### E. Domain-specific — Retail (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| R-D01 | Which product category drives the highest revenue? | ranking | bar | revenue by product_category | ranking-lead | high | inherits-root |
| R-D02 | Compare basket size using quantity by city | compare | bar | quantity by city | compare-balanced | high | inherits-root |
| R-D03 | Which city has the most customers? | ranking | bar | customers by city | ranking-lead | high | inherits-root |
| R-D04 | How do orders compare across products? | compare | bar | orders by product | compare-balanced | high | inherits-root |
| R-D05 | Which region shows the strongest growth rate? | ranking | bar | growth_rate by region | ranking-lead | moderate | inherits-root |
| R-D06 | Compare Electronics vs Furniture revenue | compare | bar | revenue by product_category | compare-balanced | high | compare-second |
| R-D07 | What is average order value by city? | ranking | bar | revenue/orders by city | ranking-lead | moderate | meta-calc |
| R-D08 | Which products contribute most to profit? | ranking | bar | profit by product | ranking-lead | high | inherits-root |
| R-D09 | Are high-revenue cities also high-profit? | relationship | scatter | revenue × profit by city | compare-balanced | moderate | meta-evidence |
| R-D10 | Summarize customer and order trends | summary | bar/line | customers, orders | direct-answer | moderate | inherits-root |

---

## Domain 2 — Sales (Wave 1)

**Fixture:** `domain_quality_generic.csv` · Proxy: `region`=territory, `department`=team, `category`=product line

### A. Basic (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| S-B01 | Which region has the highest revenue? | ranking | bar | revenue sum by region | ranking-lead | high | inherits-root |
| S-B02 | Rank departments by revenue | ranking | horizontalBar | revenue by department | ranking-lead | high | inherits-root |
| S-B03 | Compare revenue across regions | compare | bar | revenue by region | compare-balanced | high | inherits-root |
| S-B04 | Which category generates the most revenue? | ranking | bar | revenue by category | ranking-lead | high | inherits-root |
| S-B05 | Show revenue trend over time | trend | line | revenue by report_date | trend-narrative | high | inherits-root |
| S-B06 | Which region has the lowest revenue? | ranking | bar | revenue by region | ranking-lead | high | inherits-root |
| S-B07 | Compare units sold across departments | compare | bar | units by department | compare-balanced | high | inherits-root |
| S-B08 | What is total revenue? | summary | bar/none | revenue sum | direct-answer | high | meta-calc |
| S-B09 | Rank categories by revenue | ranking | bar | revenue by category | ranking-lead | high | inherits-root |
| S-B10 | How did revenue change over time? | trend | line | revenue by report_date | trend-narrative | high | inherits-root |

### B. Intermediate (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| S-I01 | Is revenue correlated with units? | relationship | scatter | revenue × units | compare-balanced | moderate | meta-evidence |
| S-I02 | Compare revenue across categories by region | compare | bar | revenue by region+category | compare-balanced | moderate | inherits-root |
| S-I03 | Which department is an outlier for revenue? | outlier | bar | revenue by department | risk-caution | moderate | inherits-root |
| S-I04 | Compare cost across departments | compare | bar | cost by department | compare-balanced | high | inherits-root |
| S-I05 | Track units trend over periods | trend | line | units by report_date | trend-narrative | high | inherits-root |
| S-I06 | Which region has the best satisfaction score? | ranking | bar | satisfaction_score mean by region | ranking-lead | moderate | inherits-root |
| S-I07 | Compare North vs South revenue | compare | bar | revenue filtered regions | compare-balanced | high | compare-second |
| S-I08 | Rank products by revenue | ranking | bar | revenue by category | ranking-lead | high | inherits-root |
| S-I09 | Where is revenue per unit highest? | ranking | bar | revenue/units by department | ranking-lead | moderate | meta-calc |
| S-I10 | Segment comparison of revenue by department and category | compare | bar | revenue multi-dim | compare-balanced | moderate | inherits-root |

### C. Executive (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| S-E01 | What is the biggest sales opportunity? | executive | bar | revenue gaps | opportunity-forward | moderate | action-lens |
| S-E02 | What is the biggest sales risk? | executive | bar | low revenue regions | risk-caution | moderate | risk-lens |
| S-E03 | Summarize sales performance | summary | bar | revenue, units | direct-answer | moderate | inherits-root |
| S-E04 | What should the sales leader focus on? | executive | bar | top/bottom regions | opportunity-forward | moderate | action-lens |
| S-E05 | Which territory underperforms? | ranking | bar | revenue by region | risk-caution | moderate | action-lens |
| S-E06 | Executive summary of regional revenue | summary | bar | revenue by region | direct-answer | high | inherits-root |
| S-E07 | Key drivers of revenue in this dataset | executive | bar | revenue by dimension | direct-answer | moderate | meta-evidence |
| S-E08 | Where should we deploy more reps? | executive | bar | revenue/units | opportunity-forward | moderate | limitation-first |
| S-E09 | Strategic recommendation for revenue growth | executive | bar/none | trend + top entity | opportunity-forward | moderate | action-lens |
| S-E10 | What concentration risk exists by region? | executive | bar | revenue share | risk-caution | moderate | risk-lens |

### D. Follow-up chains (5)

**S-C1:** Q: `Which region has the highest revenue?` → F1–F5: Why / Evidence / Columns / Calculations / Compare with second highest  
**S-C2:** Q: `Rank departments by revenue` → F5: What action for the lowest department?  
**S-C3:** Q: `Show revenue trend over time` → F5: What does the latest period imply for quota?  
**S-C4:** Q: `Is revenue correlated with units?` → F5: What caution on causation?  
**S-C5:** Q: `Compare revenue across categories` → F5: What risk if top category slows?

### E. Domain-specific — Sales (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| S-D01 | Which territory (region) delivers the most revenue? | ranking | bar | revenue by region | ranking-lead | high | inherits-root |
| S-D02 | Compare sales team (department) performance | compare | bar | revenue by department | compare-balanced | high | inherits-root |
| S-D03 | Rank product lines (category) by revenue | ranking | bar | revenue by category | ranking-lead | high | inherits-root |
| S-D04 | Which rep team has the highest units? | ranking | bar | units by department | ranking-lead | high | inherits-root |
| S-D05 | Pipeline proxy: compare units across regions | compare | bar | units by region | compare-balanced | moderate | limitation-first |
| S-D06 | Win-rate proxy: revenue per unit by category | ranking | bar | revenue/units | ranking-lead | moderate | meta-calc |
| S-D07 | Which region grew revenue month over month? | trend | line | revenue by report_date | trend-narrative | high | inherits-root |
| S-D08 | Cross-sell proxy: revenue vs satisfaction by dept | relationship | scatter | revenue × satisfaction | compare-balanced | moderate | meta-evidence |
| S-D09 | Bottom 3 departments by revenue | ranking | bar | revenue by department | risk-caution | high | action-lens |
| S-D10 | Quota attainment proxy: units trend by department | trend | line | units by report_date | trend-narrative | moderate | inherits-root |

---

## Domain 3 — Marketing (Wave 1)

**Fixture:** `domain_quality_generic.csv` · Proxy: `category`=campaign, `satisfaction_score`=experience/NPS proxy (not literal NPS)

### A. Basic (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| M-B01 | Compare satisfaction_score by category | compare | bar | satisfaction mean by category | compare-balanced | high | inherits-root |
| M-B02 | Which category has the highest satisfaction_score? | ranking | bar | satisfaction by category | ranking-lead | high | inherits-root |
| M-B03 | Compare satisfaction_score across categories | compare | bar | satisfaction by category | compare-balanced | high | inherits-root |
| M-B04 | Rank categories by revenue | ranking | bar | revenue by category | ranking-lead | high | inherits-root |
| M-B05 | Monthly trend of satisfaction score | trend | line | satisfaction by report_date | trend-narrative | high | inherits-root |
| M-B06 | Track satisfaction score over periods | trend | line | satisfaction by report_date | trend-narrative | high | inherits-root |
| M-B07 | Which department has the best satisfaction? | ranking | bar | satisfaction by department | ranking-lead | high | inherits-root |
| M-B08 | Compare revenue by category | compare | bar | revenue by category | compare-balanced | high | inherits-root |
| M-B09 | Show revenue trend over time | trend | line | revenue by report_date | trend-narrative | high | inherits-root |
| M-B10 | Which category has the lowest satisfaction? | ranking | bar | satisfaction by category | ranking-lead | high | inherits-root |

### B. Intermediate (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| M-I01 | Is revenue correlated with satisfaction_score? | relationship | scatter | revenue × satisfaction | compare-balanced | moderate | meta-evidence |
| M-I02 | Compare campaign (category) ROI proxy: revenue vs cost | compare | bar | revenue, cost by category | compare-balanced | moderate | meta-calc |
| M-I03 | Which campaign underperforms on satisfaction? | ranking | bar | satisfaction by category | risk-caution | high | inherits-root |
| M-I04 | Funnel proxy: units vs satisfaction by department | relationship | scatter | units × satisfaction | compare-balanced | moderate | limitation-first |
| M-I05 | Conversion analysis proxy: revenue per unit by category | ranking | bar | revenue/units | ranking-lead | moderate | limitation-first |
| M-I06 | Geographic campaign view: satisfaction by region | compare | bar | satisfaction by region | compare-balanced | high | inherits-root |
| M-I07 | Outlier campaigns on cost | outlier | bar | cost by category | risk-caution | moderate | inherits-root |
| M-I08 | Variance of satisfaction across departments | compare | bar | satisfaction by department | compare-balanced | high | inherits-root |
| M-I09 | Cohort-style: compare Q1 vs Q2 satisfaction trend | trend | line | satisfaction by report_date | trend-narrative | moderate | inherits-root |
| M-I10 | Driver analysis: what drives revenue by category? | executive | bar | revenue by category | direct-answer | moderate | meta-evidence |

### C. Executive (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| M-E01 | Biggest marketing opportunity | executive | bar | revenue/satisfaction gaps | opportunity-forward | moderate | action-lens |
| M-E02 | Biggest marketing risk | executive | bar | low satisfaction | risk-caution | moderate | risk-lens |
| M-E03 | Executive summary of campaign performance | summary | bar | category metrics | direct-answer | moderate | inherits-root |
| M-E04 | What should marketing leadership focus on? | executive | bar | top gaps | opportunity-forward | moderate | action-lens |
| M-E05 | Strategic recommendation for budget allocation | executive | bar/none | cost, revenue | opportunity-forward | moderate | action-lens |
| M-E06 | Which campaigns deserve more spend? | executive | bar | revenue ROI proxy | opportunity-forward | moderate | limitation-first |
| M-E07 | Brand health summary via satisfaction | summary | bar | satisfaction trend | direct-answer | moderate | inherits-root |
| M-E08 | Key marketing drivers | executive | bar | satisfaction, revenue | direct-answer | moderate | meta-evidence |
| M-E09 | Where is customer experience weakest? | ranking | bar | satisfaction by dept | risk-caution | high | action-lens |
| M-E10 | Concentration risk in campaign revenue | executive | bar | revenue share | risk-caution | moderate | risk-lens |

### D. Follow-up chains (5)

**M-C1:** Q: `Compare satisfaction_score by category` → standard F1–F4 + F5: Compare top 2 campaigns  
**M-C2:** Q: `Is revenue correlated with satisfaction_score?` → F5: Causation caution  
**M-C3:** Q: `Rank categories by revenue` → F5: Marketing action for lowest ROI  
**M-C4:** Q: `Monthly trend of satisfaction score` → F5: Leadership focus next quarter  
**M-C5:** Q: `Which category has the lowest satisfaction?` → F5: Recovery plan recommendation

### E. Domain-specific — Marketing (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| M-D01 | Campaign ROI: compare revenue to cost by category | compare | bar | revenue, cost | compare-balanced | moderate | meta-calc |
| M-D02 | Conversion proxy: revenue per unit by campaign | ranking | bar | revenue/units | ranking-lead | moderate | limitation-first |
| M-D03 | Which campaign delivers highest satisfaction? | ranking | bar | satisfaction | ranking-lead | high | inherits-root |
| M-D04 | Spend efficiency: cost per unit by category | ranking | bar | cost/units | ranking-lead | moderate | meta-calc |
| M-D05 | Channel proxy: satisfaction by region | compare | bar | satisfaction by region | compare-balanced | high | inherits-root |
| M-D06 | Acquisition proxy: units by category | ranking | bar | units | ranking-lead | high | inherits-root |
| M-D07 | Engagement trend: satisfaction over time | trend | line | satisfaction | trend-narrative | high | inherits-root |
| M-D08 | Campaign cost outlier detection | outlier | bar | cost | risk-caution | moderate | inherits-root |
| M-D09 | Revenue lift by marketing department | compare | bar | revenue by department | compare-balanced | high | inherits-root |
| M-D10 | Executive campaign ranking by revenue and satisfaction | executive | bar | composite read | direct-answer | moderate | action-lens |

---

## Domain 4 — Geography (Wave 1)

**Fixture:** `geographic_performance.csv` · **No date column** — trend questions must show limitation

### A. Basic (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| G-B01 | Which city generates the highest revenue? | ranking | bar | revenue by city | ranking-lead | high | inherits-root |
| G-B02 | Compare revenue across zones | compare | bar | revenue by zone | compare-balanced | high | inherits-root |
| G-B03 | Which state has the most customers? | ranking | bar | customers by state | ranking-lead | high | inherits-root |
| G-B04 | Compare profit across cities | compare | bar | profit by city | compare-balanced | high | inherits-root |
| G-B05 | Rank cities by revenue | ranking | bar | revenue by city | ranking-lead | high | inherits-root |
| G-B06 | Which zone has the lowest revenue? | ranking | bar | revenue by zone | ranking-lead | high | inherits-root |
| G-B07 | Compare customer counts across zones | compare | bar | customers by zone | compare-balanced | high | inherits-root |
| G-B08 | Which city has the highest growth rate? | ranking | bar | growth_rate by city | ranking-lead | moderate | inherits-root |
| G-B09 | Compare region performance by zone | compare | bar | revenue by zone | compare-balanced | high | inherits-root |
| G-B10 | Total revenue by state | compare | bar | revenue by state | compare-balanced | high | inherits-root |

### B. Intermediate (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| G-I01 | Is revenue correlated with customers? | relationship | scatter | revenue × customers | compare-balanced | moderate | meta-evidence |
| G-I02 | Regional concentration: revenue share by zone | executive | bar | revenue by zone | risk-caution | moderate | risk-lens |
| G-I03 | Which city is a revenue outlier? | outlier | bar | revenue by city | risk-caution | moderate | inherits-root |
| G-I04 | Compare Mumbai vs Bengaluru revenue | compare | bar | city filter | compare-balanced | high | compare-second |
| G-I05 | Location trends over time | trend | unsupported | — | limitation-first | low | inherits-root |
| G-I06 | Profit per customer by city | ranking | bar | profit/customers | ranking-lead | moderate | meta-calc |
| G-I07 | Geographic breakdown of customers | compare | bar | customers by state | compare-balanced | high | inherits-root |
| G-I08 | Zone-level growth rate comparison | compare | bar | growth_rate by zone | compare-balanced | moderate | inherits-root |
| G-I09 | Driver analysis: revenue by state and zone | compare | bar | revenue multi-level | compare-balanced | moderate | inherits-root |
| G-I10 | Identify underperforming cities on profit | ranking | bar | profit by city | risk-caution | high | action-lens |

### C. Executive (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| G-E01 | Biggest geographic opportunity | executive | bar | revenue gaps by zone | opportunity-forward | moderate | action-lens |
| G-E02 | Biggest geographic risk | executive | bar | concentration by city | risk-caution | moderate | risk-lens |
| G-E03 | Executive summary of regional performance | summary | bar | revenue, profit | direct-answer | high | inherits-root |
| G-E04 | What should leadership focus on geographically? | executive | bar | top/bottom cities | opportunity-forward | moderate | action-lens |
| G-E05 | Strategic expansion recommendation | executive | bar | growth_rate, revenue | opportunity-forward | moderate | action-lens |
| G-E06 | Where is revenue overly concentrated? | executive | bar | share by city | risk-caution | moderate | risk-lens |
| G-E07 | Key geographic drivers | executive | bar | revenue by zone | direct-answer | moderate | meta-evidence |
| G-E08 | Summarize zone performance | summary | bar | zone KPIs | direct-answer | high | inherits-root |
| G-E09 | Market entry priority ranking | executive | bar | growth + revenue | opportunity-forward | moderate | limitation-first |
| G-E10 | Risk of single-city dependence | executive | bar | top city share | risk-caution | moderate | risk-lens |

### D. Follow-up chains (5) — **Gap: add automation**

**G-C1:** Q: `Which city generates the highest revenue?` → F1–F5 standard + compare second city  
**G-C2:** Q: `Compare revenue across zones` → F5: concentration risk  
**G-C3:** Q: `Is revenue correlated with customers?` → F5: causation caution  
**G-C4:** Q: `Which zone has the lowest revenue?` → F5: management action  
**G-C5:** Q: `Show revenue trend over time` → expect **limitation** → F1: why no trend? · F3: columns?

### E. Domain-specific — Geography (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| G-D01 | Regional concentration of revenue | executive | bar | revenue by zone | risk-caution | moderate | risk-lens |
| G-D02 | City-level revenue ranking | ranking | bar | revenue by city | ranking-lead | high | inherits-root |
| G-D03 | State performance comparison | compare | bar | revenue by state | compare-balanced | high | inherits-root |
| G-D04 | Customer density by city | ranking | bar | customers by city | ranking-lead | high | inherits-root |
| G-D05 | Growth rate hotspots | ranking | bar | growth_rate by city | ranking-lead | moderate | inherits-root |
| G-D06 | Profitability by zone | compare | bar | profit by zone | compare-balanced | high | inherits-root |
| G-D07 | West vs South zone comparison | compare | bar | filtered zones | compare-balanced | high | compare-second |
| G-D08 | Revenue per customer by zone | ranking | bar | revenue/customers | ranking-lead | moderate | meta-calc |
| G-D09 | Location trend request (negative test) | trend | unsupported | — | limitation-first | low | meta-columns |
| G-D10 | Multi-level: city within top zone | compare | bar | revenue city+zone | compare-balanced | moderate | inherits-root |

---

## Domain 5 — Banking & Financial Services (Wave 1)

**Fixture:** ⚠️ **`banking_financial_services.csv` required** — matrix below defines expected behavior once fixture exists. **Do not sign off using generic CSV.**

### A. Basic (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| B-B01 | Which branch has the highest loan balance? | ranking | bar | loan_balance sum by branch | ranking-lead | high | inherits-root |
| B-B02 | Compare deposits across regions | compare | bar | deposit_balance by region | compare-balanced | high | inherits-root |
| B-B03 | Rank customer segments by interest income | ranking | bar | interest_income by segment | ranking-lead | high | inherits-root |
| B-B04 | Show deposit trend over time | trend | line | deposit_balance by report_date | trend-narrative | high | inherits-root |
| B-B05 | Which branch has the lowest delinquency rate? | ranking | bar | delinquency_rate mean by branch | ranking-lead | moderate | inherits-root |
| B-B06 | Compare loan portfolio by product type | compare | bar | loan_balance by product_type | compare-balanced | high | inherits-root |
| B-B07 | Total NPL amount by region | compare | bar | npl_amount by region | risk-caution | high | inherits-root |
| B-B08 | Rank branches by deposit balance | ranking | bar | deposit_balance by branch | ranking-lead | high | inherits-root |
| B-B09 | Credit utilization by customer segment | compare | bar | credit_utilization by segment | compare-balanced | moderate | inherits-root |
| B-B10 | Spend category analysis: total spend by category | compare | bar | spend by spend_category | compare-balanced | high | inherits-root |

### B. Intermediate (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| B-I01 | Loan portfolio concentration by region | executive | bar | loan_balance share | risk-caution | moderate | risk-lens |
| B-I02 | Delinquency outlier branches | outlier | bar | delinquency_rate | risk-caution | moderate | inherits-root |
| B-I03 | Is interest income correlated with loan balance? | relationship | scatter | interest × loan | compare-balanced | moderate | meta-evidence |
| B-I04 | NPA / delinquency style: regions above avg delinquency | ranking | bar | delinquency_rate | risk-caution | moderate | action-lens |
| B-I05 | Deposit vs loan gap by branch | compare | bar | deposits, loans | compare-balanced | moderate | meta-calc |
| B-I06 | Segment profitability: interest income vs cost proxy | compare | bar | interest by segment | compare-balanced | moderate | inherits-root |
| B-I07 | Credit utilization risk concentration | executive | bar | utilization by segment | risk-caution | moderate | risk-lens |
| B-I08 | Branch performance variance month over month | trend | line | deposits by date | trend-narrative | moderate | inherits-root |
| B-I09 | Spend category drivers | compare | bar | spend_category | compare-balanced | high | inherits-root |
| B-I10 | Portfolio mix by product type | compare | bar | loan_balance mix | compare-balanced | high | inherits-root |

### C. Executive (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| B-E01 | Biggest portfolio opportunity | executive | bar | growth segments | opportunity-forward | moderate | action-lens |
| B-E02 | Biggest credit risk | executive | bar | NPL, delinquency | risk-caution | moderate | risk-lens |
| B-E03 | Executive summary of branch performance | summary | bar | deposits, loans | direct-answer | moderate | inherits-root |
| B-E04 | What should the CRO focus on? | executive | bar | risk metrics | risk-caution | moderate | action-lens |
| B-E05 | Strategic recommendation for deposit growth | executive | bar | deposit trends | opportunity-forward | moderate | action-lens |
| B-E06 | Customer segment profitability summary | summary | bar | interest by segment | direct-answer | moderate | inherits-root |
| B-E07 | Risk concentration analysis | executive | bar | regional NPL | risk-caution | moderate | risk-lens |
| B-E08 | Key business drivers of net interest | executive | bar | interest income drivers | direct-answer | moderate | meta-evidence |
| B-E09 | Where to reduce delinquency first? | executive | bar | delinquency by branch | action-lens | moderate | action-lens |
| B-E10 | Leadership focus for next quarter | executive | bar/none | top risks + ops | opportunity-forward | moderate | action-lens |

### D. Follow-up chains (5) — blocked on fixture

**B-C1:** Q: `Which branch has the highest loan balance?` → F1–F5 standard banking meta  
**B-C2:** Q: `Compare deposits across regions` → F5: concentration risk  
**B-C3:** Q: `Rank customer segments by interest income` → F5: strategic action  
**B-C4:** Q: `Which regions exceed average delinquency?` → F5: remediation plan  
**B-C5:** Q: `Credit utilization by segment` → F5: risk mitigation

### E. Domain-specific — Banking (12)

| ID | Question | Focus |
|----|----------|-------|
| B-D01 | Loan portfolio analysis by product type | Intent: compare · Chart: bar · KPI: loan_balance |
| B-D02 | Branch performance ranking on deposits | ranking · bar · deposit_balance |
| B-D03 | Deposit trends over time | trend · line · deposit_balance |
| B-D04 | Customer segment profitability | ranking · bar · interest_income |
| B-D05 | NPA concentration by region | executive · bar · npl_amount · risk-caution |
| B-D06 | Delinquency rate by branch | ranking · bar · delinquency_rate |
| B-D07 | Spend category breakdown | compare · bar · spend_category |
| B-D08 | Credit utilization analysis | compare · bar · credit_utilization |
| B-D09 | Risk concentration: top 3 branches by NPL | executive · bar · risk-lens |
| B-D10 | Loan vs deposit ratio by branch | ranking · bar · meta-calc |
| B-D11 | Segment-level delinquency outliers | outlier · bar · delinquency_rate |
| B-D12 | Interest income trend | trend · line · interest_income |

---

## Domain 6 — Finance / FP&A (Wave 2)

**Fixture:** `domain_quality_generic.csv` · Proxy: budget vs actual → **limitation** unless budget column added; use cost/revenue variance language

### A. Basic (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| F-B01 | Compare cost across departments | compare | bar | cost by department | compare-balanced | high | inherits-root |
| F-B02 | Show revenue trend over time | trend | line | revenue by report_date | trend-narrative | high | inherits-root |
| F-B03 | Rank departments by cost | ranking | bar | cost by department | ranking-lead | high | inherits-root |
| F-B04 | Compare revenue across departments | compare | bar | revenue by department | compare-balanced | high | inherits-root |
| F-B05 | Trend of cost by report date | trend | line | cost by report_date | trend-narrative | high | inherits-root |
| F-B06 | Which department has the highest cost? | ranking | bar | cost by department | ranking-lead | high | inherits-root |
| F-B07 | Total revenue vs total cost | summary | bar/none | revenue, cost sum | direct-answer | high | meta-calc |
| F-B08 | Compare units across departments | compare | bar | units by department | compare-balanced | high | inherits-root |
| F-B09 | Revenue by category | compare | bar | revenue by category | compare-balanced | high | inherits-root |
| F-B10 | Cost by region | compare | bar | cost by region | compare-balanced | high | inherits-root |

### B. Intermediate (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| F-I01 | Budget vs actual (negative test) | variance | unsupported/limitation | no budget column | limitation-first | low | meta-columns |
| F-I02 | Cost variance by department over time | trend | line | cost by report_date | trend-narrative | moderate | inherits-root |
| F-I03 | Margin analysis: revenue minus cost by department | ranking | bar | margin proxy | ranking-lead | moderate | meta-calc |
| F-I04 | Where are we losing money? | profitability | bar | revenue−cost | risk-caution | moderate | action-lens |
| F-I05 | Revenue vs cost relationship | relationship | scatter | revenue × cost | compare-balanced | moderate | meta-evidence |
| F-I06 | Outlier departments on cost | outlier | bar | cost | risk-caution | moderate | inherits-root |
| F-I07 | FP&A driver analysis by category | compare | bar | revenue, cost | compare-balanced | moderate | inherits-root |
| F-I08 | Period-over-period revenue variance | trend | line | revenue by date | trend-narrative | high | inherits-root |
| F-I09 | Cost per unit by department | ranking | bar | cost/units | ranking-lead | moderate | meta-calc |
| F-I10 | Segment P&L proxy by region | compare | bar | revenue, cost by region | compare-balanced | moderate | inherits-root |

### C. Executive (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| F-E01 | Biggest cost opportunity | executive | bar | cost gaps | opportunity-forward | moderate | action-lens |
| F-E02 | Biggest financial risk | executive | bar | negative margin depts | risk-caution | moderate | risk-lens |
| F-E03 | Executive financial summary | summary | bar | revenue, cost | direct-answer | moderate | inherits-root |
| F-E04 | What should CFO focus on? | executive | bar | variance drivers | opportunity-forward | moderate | action-lens |
| F-E05 | Strategic cost reduction recommendation | executive | bar/none | top cost depts | opportunity-forward | moderate | action-lens |
| F-E06 | Margin improvement priorities | executive | bar | margin proxy | opportunity-forward | moderate | action-lens |
| F-E07 | Key P&L drivers | executive | bar | revenue, cost dims | direct-answer | moderate | meta-evidence |
| F-E08 | Summarize budget performance | summary | limitation-first | no budget | limitation-first | low | meta-columns |
| F-E09 | Risk of cost overrun by department | executive | bar | cost trend | risk-caution | moderate | risk-lens |
| F-E10 | Leadership focus for profitability | executive | bar | margin by dept | opportunity-forward | moderate | action-lens |

### D. Follow-up chains (5)

**F-C1:** Q: `Compare cost across departments` → F5: Which dept to investigate first?  
**F-C2:** Q: `Trend of cost by report date` → F5: Forecast caution  
**F-C3:** Q: `Margin analysis by department` → F5: Action for worst margin  
**F-C4:** Q: `Budget vs actual` → expect limitation → F3: columns used?  
**F-C5:** Q: `Where are we losing money?` → F5: Recovery recommendation

### E. Domain-specific — Finance / FP&A (10)

| ID | Question | Focus |
|----|----------|-------|
| F-D01 | Budget vs actual variance | limitation unless budget column |
| F-D02 | Cost variance by department | trend/compare · cost |
| F-D03 | Margin analysis by category | ranking · margin proxy |
| F-D04 | P&L summary by region | summary · revenue, cost |
| F-D05 | Cost driver deep dive | executive · cost by dept |
| F-D06 | Revenue forecast proxy trend | trend · revenue |
| F-D07 | OpEx concentration | executive · cost share |
| F-D08 | Unit economics: cost per unit | ranking · cost/units |
| F-D09 | Category profitability | ranking · revenue−cost |
| F-D10 | Period close executive summary | summary · multi-KPI |

---

## Domain 7 — Operations (Wave 2)

**Fixture:** `domain_quality_generic.csv` · Proxy: `units`=throughput, `satisfaction_score`=SLA proxy (not literal SLA minutes)

### A. Basic (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| O-B01 | Compare units across departments | compare | bar | units by department | compare-balanced | high | inherits-root |
| O-B02 | Show units trend over time | trend | line | units by report_date | trend-narrative | high | inherits-root |
| O-B03 | Rank departments by units | ranking | bar | units by department | ranking-lead | high | inherits-root |
| O-B04 | Which department has the highest throughput? | ranking | bar | units | ranking-lead | high | inherits-root |
| O-B05 | Compare cost across departments | compare | bar | cost | compare-balanced | high | inherits-root |
| O-B06 | Units by region | compare | bar | units by region | compare-balanced | high | inherits-root |
| O-B07 | How did units change over time? | trend | line | units | trend-narrative | high | inherits-root |
| O-B08 | Lowest throughput department | ranking | bar | units | ranking-lead | high | inherits-root |
| O-B09 | Total units processed | summary | bar/none | units sum | direct-answer | high | meta-calc |
| O-B10 | Compare units by category | compare | bar | units by category | compare-balanced | high | inherits-root |

### B. Intermediate (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| O-I01 | Utilization proxy: units per cost by dept | ranking | bar | units/cost | ranking-lead | moderate | meta-calc |
| O-I02 | SLA performance proxy via satisfaction by dept | ranking | bar | satisfaction | ranking-lead | moderate | limitation-first |
| O-I03 | Throughput outlier departments | outlier | bar | units | risk-caution | moderate | inherits-root |
| O-I04 | Bottleneck analysis: lowest units trend | trend | line | units | trend-narrative | moderate | action-lens |
| O-I05 | Capacity vs demand proxy: units vs revenue | relationship | scatter | units × revenue | compare-balanced | moderate | meta-evidence |
| O-I06 | Operational variance across regions | compare | bar | units by region | compare-balanced | high | inherits-root |
| O-I07 | Cost efficiency by department | ranking | bar | cost/units | ranking-lead | moderate | meta-calc |
| O-I08 | Cohort-style dept comparison over periods | trend | line | units by date+dept | trend-narrative | moderate | inherits-root |
| O-I09 | Driver analysis: what drives units? | executive | bar | units by dim | direct-answer | moderate | meta-evidence |
| O-I10 | SLA trend (negative if no SLA column) | trend | limitation | — | limitation-first | low | meta-columns |

### C. Executive (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| O-E01 | Biggest operational opportunity | executive | bar | throughput gaps | opportunity-forward | moderate | action-lens |
| O-E02 | Biggest operational risk | executive | bar | low units/depts | risk-caution | moderate | risk-lens |
| O-E03 | Executive ops summary | summary | bar | units, cost | direct-answer | moderate | inherits-root |
| O-E04 | What should ops leadership focus on? | executive | bar | bottlenecks | opportunity-forward | moderate | action-lens |
| O-E05 | Strategic throughput recommendation | executive | bar/none | units trend | opportunity-forward | moderate | action-lens |
| O-E06 | Utilization improvement priorities | executive | bar | units/cost | opportunity-forward | moderate | action-lens |
| O-E07 | Key operational drivers | executive | bar | units by dept | direct-answer | moderate | meta-evidence |
| O-E08 | SLA risk summary | executive | limitation-first | satisfaction proxy | limitation-first | moderate | risk-lens |
| O-E09 | Cost overrun risk in operations | executive | bar | cost trend | risk-caution | moderate | risk-lens |
| O-E10 | Leadership focus for next month | executive | bar | units + satisfaction | opportunity-forward | moderate | action-lens |

### D. Follow-up chains (5)

**O-C1–C5:** Root on units ranking, units trend, utilization, SLA proxy, bottleneck — each with standard F1–F4 + ops action F5.

### E. Domain-specific — Operations (10)

| ID | Question | Focus |
|----|----------|-------|
| O-D01 | Throughput by department | ranking · units |
| O-D02 | SLA performance via satisfaction | ranking · limitation-first |
| O-D03 | Utilization by department | ranking · units/cost |
| O-D04 | Bottleneck identification | outlier · units |
| O-D05 | Operational cost efficiency | compare · cost, units |
| O-D06 | Production trend | trend · units |
| O-D07 | Regional throughput comparison | compare · units by region |
| O-D08 | Capacity constraint proxy | executive · units gaps |
| O-D09 | Downtime proxy via low units periods | trend · limitation |
| O-D10 | Ops executive dashboard summary | summary · multi-KPI |

---

## Domain 8 — Customer Support (Wave 2)

**Fixture:** `domain_quality_generic.csv` · Proxy: `satisfaction_score`=CSAT; `units`=ticket volume; no resolution time column

### A. Basic (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| C-B01 | Compare satisfaction_score across departments | compare | bar | satisfaction by dept | compare-balanced | high | inherits-root |
| C-B02 | Which department has the lowest satisfaction_score? | ranking | bar | satisfaction | ranking-lead | high | inherits-root |
| C-B03 | Rank departments by satisfaction | ranking | bar | satisfaction | ranking-lead | high | inherits-root |
| C-B04 | Ticket volume proxy: units by department | compare | bar | units | compare-balanced | high | inherits-root |
| C-B05 | Highest ticket volume department | ranking | bar | units | ranking-lead | high | inherits-root |
| C-B06 | Satisfaction by category | compare | bar | satisfaction by category | compare-balanced | high | inherits-root |
| C-B07 | Compare units across departments | compare | bar | units | compare-balanced | high | inherits-root |
| C-B08 | Total ticket volume (units) | summary | bar/none | units sum | direct-answer | high | meta-calc |
| C-B09 | Lowest satisfaction category | ranking | bar | satisfaction | ranking-lead | high | inherits-root |
| C-B10 | Support load by region | compare | bar | units by region | compare-balanced | high | inherits-root |

### B. Intermediate (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| C-I01 | Resolution time analysis (negative test) | trend | limitation | no SLA/time column | limitation-first | low | meta-columns |
| C-I02 | Escalation proxy: low satisfaction + high units | executive | bar | composite | risk-caution | moderate | action-lens |
| C-I03 | Outlier teams on satisfaction | outlier | bar | satisfaction | risk-caution | moderate | inherits-root |
| C-I04 | Ticket volume trend | trend | line | units by report_date | trend-narrative | high | inherits-root |
| C-I05 | CSAT trend over time | trend | line | satisfaction by date | trend-narrative | high | inherits-root |
| C-I06 | Volume vs satisfaction tradeoff | relationship | scatter | units × satisfaction | compare-balanced | moderate | meta-evidence |
| C-I07 | Driver analysis: what drives low CSAT? | executive | bar | satisfaction drivers | risk-caution | moderate | meta-evidence |
| C-I08 | Regional support comparison | compare | bar | satisfaction by region | compare-balanced | high | inherits-root |
| C-I09 | Category-level ticket spikes | outlier | bar | units by category | risk-caution | moderate | inherits-root |
| C-I10 | Cohort-style: dept satisfaction over periods | trend | line | satisfaction | trend-narrative | moderate | inherits-root |

### C. Executive (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| C-E01 | Biggest support opportunity | executive | bar | CSAT gaps | opportunity-forward | moderate | action-lens |
| C-E02 | Biggest support risk | executive | bar | low CSAT + high volume | risk-caution | moderate | risk-lens |
| C-E03 | Executive support summary | summary | bar | satisfaction, units | direct-answer | moderate | inherits-root |
| C-E04 | What should support leadership focus on? | executive | bar | worst dept | opportunity-forward | moderate | action-lens |
| C-E05 | Strategic recommendation to improve CSAT | executive | bar/none | satisfaction | opportunity-forward | moderate | action-lens |
| C-E06 | Escalation risk summary | executive | bar | low sat depts | risk-caution | moderate | risk-lens |
| C-E07 | Key drivers of customer satisfaction | executive | bar | satisfaction dims | direct-answer | moderate | meta-evidence |
| C-E08 | Ticket volume executive summary | summary | bar | units | direct-answer | high | inherits-root |
| C-E09 | Where to add staffing? | executive | bar | units by dept | opportunity-forward | moderate | limitation-first |
| C-E10 | Leadership focus for service quality | executive | bar | satisfaction trend | opportunity-forward | moderate | action-lens |

### D. Follow-up chains (5)

**C-C1:** Q: `Which department has the lowest satisfaction_score?` → F5: remediation action  
**C-C2:** Q: `Ticket volume by department` → F5: staffing recommendation  
**C-C3:** Q: `CSAT trend` → F5: leadership focus  
**C-C4:** Q: `Resolution time` → limitation chain  
**C-C5:** Q: `Escalation risk teams` → F5: priority playbook

### E. Domain-specific — Customer Support (10)

| ID | Question | Focus |
|----|----------|-------|
| C-D01 | Ticket volume by department | ranking · units |
| C-D02 | Resolution time (limitation test) | limitation |
| C-D03 | CSAT by team | ranking · satisfaction |
| C-D04 | Escalation proxy analysis | executive · low sat + high units |
| C-D05 | Support load trend | trend · units |
| C-D06 | First contact resolution proxy | limitation |
| C-D07 | Category-level CSAT | compare · satisfaction |
| C-D08 | Backlog proxy via units spike | outlier · units |
| C-D09 | Regional service comparison | compare · satisfaction |
| C-D10 | Support executive dashboard | summary · sat + volume |

---

## Domain 9 — HR (Wave 3)

**Fixture:** `domain_quality_generic.csv` · Proxy: `units`=headcount/FTE; attrition/hiring → **limitation** unless columns added

### A. Basic (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| H-B01 | Compare units across departments | compare | bar | units (headcount) | compare-balanced | high | inherits-root |
| H-B02 | Rank departments by units | ranking | bar | units | ranking-lead | high | inherits-root |
| H-B03 | Which department has the largest workforce? | ranking | bar | units | ranking-lead | high | inherits-root |
| H-B04 | Workforce by region | compare | bar | units by region | compare-balanced | high | inherits-root |
| H-B05 | Headcount trend over time | trend | line | units by report_date | trend-narrative | high | inherits-root |
| H-B06 | Smallest department by headcount | ranking | bar | units | ranking-lead | high | inherits-root |
| H-B07 | Total headcount | summary | bar/none | units sum | direct-answer | high | meta-calc |
| H-B08 | Compare satisfaction by department | compare | bar | satisfaction | compare-balanced | high | inherits-root |
| H-B09 | Units by category | compare | bar | units by category | compare-balanced | high | inherits-root |
| H-B10 | Hiring trend (limitation test) | trend | limitation | no hiring column | limitation-first | low | meta-columns |

### B. Intermediate (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| H-I01 | Attrition analysis (limitation) | executive | limitation | no attrition column | limitation-first | low | meta-columns |
| H-I02 | Workforce distribution variance | compare | bar | units share | compare-balanced | moderate | inherits-root |
| H-I03 | Outlier departments on headcount | outlier | bar | units | risk-caution | moderate | inherits-root |
| H-I04 | Headcount vs satisfaction | relationship | scatter | units × satisfaction | compare-balanced | moderate | meta-evidence |
| H-I05 | Cost per employee proxy | ranking | bar | cost/units | ranking-lead | moderate | meta-calc |
| H-I06 | Regional workforce comparison | compare | bar | units by region | compare-balanced | high | inherits-root |
| H-I07 | Cohort-style headcount by period | trend | line | units | trend-narrative | moderate | inherits-root |
| H-I08 | Driver analysis: staffing drivers | executive | bar | units by dept | direct-answer | moderate | meta-evidence |
| H-I09 | Span of control proxy | ranking | limitation | no manager column | limitation-first | low | meta-columns |
| H-I10 | Diversity proxy (limitation) | compare | limitation | no diversity cols | limitation-first | low | meta-columns |

### C. Executive (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| H-E01 | Biggest workforce opportunity | executive | bar | understaffed depts | opportunity-forward | moderate | action-lens |
| H-E02 | Biggest HR risk | executive | bar | concentration | risk-caution | moderate | risk-lens |
| H-E03 | Executive workforce summary | summary | bar | units, satisfaction | direct-answer | moderate | inherits-root |
| H-E04 | What should CHRO focus on? | executive | bar | gaps | opportunity-forward | moderate | action-lens |
| H-E05 | Strategic hiring recommendation | executive | limitation-first | no hiring data | limitation-first | low | action-lens |
| H-E06 | Attrition risk summary | executive | limitation-first | no attrition | limitation-first | low | risk-lens |
| H-E07 | Key workforce drivers | executive | bar | units by dim | direct-answer | moderate | meta-evidence |
| H-E08 | Workforce distribution summary | summary | bar | units share | direct-answer | high | inherits-root |
| H-E09 | Cost of workforce by department | executive | bar | cost, units | risk-caution | moderate | action-lens |
| H-E10 | Leadership people priorities | executive | bar/none | sat + units | opportunity-forward | moderate | action-lens |

### D. Follow-up chains (5)

**H-C1–C5:** Headcount ranking, trend, attrition limitation, satisfaction cross-cut, workforce action.

### E. Domain-specific — HR (10)

| ID | Question | Focus |
|----|----------|-------|
| H-D01 | Headcount by department | ranking · units |
| H-D02 | Attrition trend | limitation |
| H-D03 | Hiring trends | limitation |
| H-D04 | Workforce distribution | compare · units share |
| H-D05 | Employee satisfaction by team | compare · satisfaction |
| H-D06 | Cost per FTE | ranking · cost/units |
| H-D07 | Regional staffing levels | compare · units |
| H-D08 | Overstaffed department detection | outlier · units |
| H-D09 | Headcount growth over periods | trend · units |
| H-D10 | HR executive summary | summary · units + sat |

---

## Domain 10 — Healthcare (Wave 3)

**Fixture:** `domain_quality_generic.csv` · Proxy: `units`=patient volume; `department`=ward/clinical; outcomes → satisfaction only

### A. Basic (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| HC-B01 | Compare units across departments | compare | bar | units (patients) | compare-balanced | high | inherits-root |
| HC-B02 | Rank departments by patient volume | ranking | bar | units | ranking-lead | high | inherits-root |
| HC-B03 | Which ward has the highest patient volume? | ranking | bar | units by dept | ranking-lead | high | inherits-root |
| HC-B04 | Patient volume by region | compare | bar | units by region | compare-balanced | high | inherits-root |
| HC-B05 | Patient volume trend | trend | line | units by report_date | trend-narrative | high | inherits-root |
| HC-B06 | Compare satisfaction across departments | compare | bar | satisfaction | compare-balanced | high | inherits-root |
| HC-B07 | Lowest outcome proxy: satisfaction | ranking | bar | satisfaction | ranking-lead | high | inherits-root |
| HC-B08 | Total patient volume | summary | bar/none | units sum | direct-answer | high | meta-calc |
| HC-B09 | Revenue by clinical department | compare | bar | revenue | compare-balanced | high | inherits-root |
| HC-B10 | Cost by department | compare | bar | cost | compare-balanced | high | inherits-root |

### B. Intermediate (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| HC-I01 | Treatment outcomes (limitation) | executive | limitation | no outcomes column | limitation-first | low | meta-columns |
| HC-I02 | Resource utilization by ward | ranking | bar | units, cost | ranking-lead | moderate | inherits-root |
| HC-I03 | Patient volume outlier wards | outlier | bar | units | risk-caution | moderate | inherits-root |
| HC-I04 | Volume vs satisfaction | relationship | scatter | units × satisfaction | compare-balanced | moderate | meta-evidence |
| HC-I05 | Clinical driver analysis | executive | bar | units by dept | direct-answer | moderate | meta-evidence |
| HC-I06 | Regional patient load | compare | bar | units by region | compare-balanced | high | inherits-root |
| HC-I07 | Cost per patient proxy | ranking | bar | cost/units | ranking-lead | moderate | meta-calc |
| HC-I08 | Cohort-style volume by period | trend | line | units | trend-narrative | moderate | inherits-root |
| HC-I09 | Readmission proxy (limitation) | trend | limitation | no readmission col | limitation-first | low | meta-columns |
| HC-I10 | Capacity strain: high units low sat | executive | bar | composite | risk-caution | moderate | action-lens |

### C. Executive (10)

| ID | Question | Intent | Chart | KPI(s) | Exec summary | Confidence | Follow-up |
|----|----------|--------|-------|--------|--------------|------------|-----------|
| HC-E01 | Biggest clinical opportunity | executive | bar | volume gaps | opportunity-forward | moderate | action-lens |
| HC-E02 | Biggest patient safety risk proxy | executive | bar | low satisfaction | risk-caution | moderate | risk-lens |
| HC-E03 | Executive clinical summary | summary | bar | units, satisfaction | direct-answer | moderate | inherits-root |
| HC-E04 | What should medical leadership focus on? | executive | bar | strain wards | opportunity-forward | moderate | action-lens |
| HC-E05 | Strategic resource allocation | executive | bar | units, cost | opportunity-forward | moderate | action-lens |
| HC-E06 | Outcome improvement priorities | executive | limitation-first | satisfaction proxy | limitation-first | moderate | action-lens |
| HC-E07 | Key drivers of patient volume | executive | bar | units by dept | direct-answer | moderate | meta-evidence |
| HC-E08 | Utilization executive summary | summary | bar | units, cost | direct-answer | moderate | inherits-root |
| HC-E09 | Capacity risk in top volume ward | executive | bar | units share | risk-caution | moderate | risk-lens |
| HC-E10 | Leadership focus for quality | executive | bar | satisfaction | opportunity-forward | moderate | action-lens |

### D. Follow-up chains (5)

**HC-C1–C5:** Patient volume ranking, ward comparison, outcome limitation, utilization, capacity action.

### E. Domain-specific — Healthcare (10)

| ID | Question | Focus |
|----|----------|-------|
| HC-D01 | Patient volume by ward | ranking · units |
| HC-D02 | Treatment outcomes | limitation · satisfaction proxy |
| HC-D03 | Resource utilization | ranking · units/cost |
| HC-D04 | Clinical department comparison | compare · units |
| HC-D05 | Patient satisfaction by ward | ranking · satisfaction |
| HC-D06 | Volume trend by clinical unit | trend · units |
| HC-D07 | Cost per patient | ranking · cost/units |
| HC-D08 | Capacity overload detection | outlier · units |
| HC-D09 | Regional patient load | compare · region |
| HC-D10 | Healthcare executive dashboard | summary · multi-KPI |

---

## 11. Score recording template

Copy per session:

```
Domain: __________  Wave: __  Fixture: __________  Tester: __  Date: __
Environment: __________  Model/plan: __________

| ID | Intent✓ | Chart✓ | Ground✓ | Exec✓ | Rec✓ | Conf✓ | F/U✓ | Hall✓ | Avg |
|----|---------|--------|---------|-------|------|-------|------|-------|-----|
|    | /10     | /10    | /10     | /10   | /10  | /10   | /10  | /10   |     |

Chain ID: __  Steps pass: __/5  Chain avg: __

Domain average: __   Pass (≥7.0, no hallucination fail): ☐ Yes ☐ No
Blockers: _______________________________________________
```

---

## 12. Known production blockers (document only)

| Blocker | Domains affected | Resolution path |
|---------|------------------|-----------------|
| No banking fixture | Banking Wave 1 | Add `banking_financial_services.csv` + matrix rows in pytest |
| Geography follow-up gap | Geography | Add `test_follow_up_domain_chains` geographic block |
| Executive intent gaps | Sales, Marketing, Ops, HR, HC | Pattern fix in routing — **out of scope for this doc** |
| Budget / SLA / attrition / outcomes columns absent | FP&A, Support, HR, HC | Explicit limitation pass required; do not fail if limitation stated clearly |
| Narrative not CI-tested | All | Manual rubric §3 is source of truth for production |

---

*Generated: Production QA Matrix v1 — review framework only. No code changes.*
