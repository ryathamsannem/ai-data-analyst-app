# Domain Test Fixtures — Data Dictionary

Synthetic datasets for AI Insights production QA. Generated with seed `20260609` via `generate_domain_fixtures.py`.

**Location:** `test-fixtures/domains/`  
**Row target:** 250–500 per domain (see `manifest.json` for actual counts)  
**Characteristics:** realistic skew, seasonality, ~2–4% missing cells, ~2% numeric outliers

---

## 1. Retail — `retail.csv`

**Grain:** one row per order-date × region × city × product category × product  
**Rows:** 360 · **Period:** 2024-01 → 2024-12

| Column | Type | Description | Example QA use |
|--------|------|-------------|----------------|
| `order_date` | date (ISO) | Calendar month bucket (1st of month) | Trend, seasonality |
| `region` | category | Sales region (North/South/East/West) | Compare, ranking, geographic |
| `city` | category | Store city | Ranking (e.g. highest revenue city) |
| `product_category` | category | Merchandise category | Category performance |
| `product` | category | SKU / product name | Product ranking |
| `revenue` | numeric | Gross revenue (currency units) | Primary metric — sum |
| `profit` | numeric | Gross profit | Margin, profitability |
| `customers` | numeric | Unique customers (may be missing) | Correlation with revenue |
| `orders` | numeric | Order count | Basket / order analysis |
| `quantity` | numeric | Units sold | Volume analysis |
| `growth_rate` | numeric | Period growth rate (decimal) | Growth ranking, trend |

**Suggested questions:** Which city has highest revenue? Revenue trend over time? Revenue vs customers correlation? Biggest product category opportunity?

---

## 2. Marketing — `marketing.csv`

**Grain:** report_date × campaign × channel × region  
**Rows:** 320 · **Period:** 2024-01 → 2024-10

| Column | Type | Description | Example QA use |
|--------|------|-------------|----------------|
| `report_date` | date | Campaign reporting month | Trend |
| `campaign_name` | category | Named campaign | Campaign ROI |
| `channel` | category | Paid Search, Paid Social, Email, etc. | Channel comparison |
| `region` | category | Geo region | Geographic breakdown |
| `spend` | numeric | Media spend | Cost analysis |
| `impressions` | numeric | Ad impressions | Funnel top |
| `clicks` | numeric | Ad clicks | CTR proxy |
| `conversions` | numeric | Attributed conversions | Conversion analysis |
| `revenue` | numeric | Attributed revenue | ROI numerator |
| `cost` | numeric | Total campaign cost (incl. overhead) | ROI denominator |
| `satisfaction_score` | numeric | Experience score 1–5 (may be missing) | CSAT by channel |

**Suggested questions:** Compare satisfaction by channel? Campaign ROI (revenue vs spend)? Conversion trend? Rank channels by revenue?

---

## 3. Sales — `sales.csv`

**Grain:** report_date × region × territory × product line  
**Rows:** 340 · **Period:** 2024 full year

| Column | Type | Description | Example QA use |
|--------|------|-------------|----------------|
| `report_date` | date | Sales month | Trend, quota pacing |
| `region` | category | Sales region | Territory rollup |
| `territory` | category | Territory code (e.g. N-T1) | Territory performance |
| `sales_rep` | category | Rep identifier (may be missing) | Rep performance |
| `product_line` | category | Product portfolio line | Product mix |
| `department` | category | Inside / Field / Channel Sales | Team comparison |
| `revenue` | numeric | Closed revenue | Primary metric |
| `units` | numeric | Units sold (may be missing) | Volume |
| `cost` | numeric | Cost of sale | Margin proxy |
| `quota` | numeric | Quota target | Attainment denominator |
| `attainment_pct` | numeric | Quota attainment % (may be missing) | Rep/territory ranking |

**Suggested questions:** Which territory has highest revenue? Rank reps by attainment? Revenue trend? Revenue vs units correlation?

---

## 4. Geography — `geography.csv`

**Grain:** report_date × zone × city × market type  
**Rows:** 300 · **Period:** 2024 full year

| Column | Type | Description | Example QA use |
|--------|------|-------------|----------------|
| `report_date` | date | Reporting month | Location trends |
| `zone` | category | North/South/East/West | Regional concentration |
| `state` | category | State / province | State ranking |
| `city` | category | City | City ranking |
| `market_type` | category | Flagship / Standard / Express | Segment comparison |
| `store_count` | numeric | Number of stores in market | Normalization |
| `revenue` | numeric | Location revenue | Primary metric |
| `profit` | numeric | Location profit | Profitability |
| `customers` | numeric | Customer count (may be missing) | Correlation |
| `growth_rate` | numeric | Growth rate (may be missing) | Hotspot detection |

**Suggested questions:** Which city generates highest revenue? Compare zones? Revenue vs customers? Regional concentration risk?

---

## 5. Banking & Financial Services — `banking_financial_services.csv`

**Grain:** report_date × branch × customer segment (× product sampled per row)  
**Rows:** 360 · **Period:** 2024 full year

| Column | Type | Description | Example QA use |
|--------|------|-------------|----------------|
| `report_date` | date | Reporting month | Deposit / NPL trends |
| `branch` | category | Branch code (BR-001…) | Branch performance |
| `region` | category | Banking region | Portfolio concentration |
| `customer_segment` | category | Retail, SME, Corporate, etc. | Segment profitability |
| `product_type` | category | Mortgage, Personal Loan, Credit Card, etc. | Loan portfolio mix |
| `loan_balance` | numeric | Outstanding loan balance | Portfolio analysis |
| `deposit_balance` | numeric | Deposit balance | Deposit trends |
| `interest_income` | numeric | Interest earned | Income ranking |
| `npl_amount` | numeric | Non-performing loan amount | NPA analysis |
| `delinquency_rate` | numeric | Delinquency ratio (may be missing) | Risk concentration |
| `credit_utilization` | numeric | Utilization ratio (may be missing) | Credit risk |
| `spend_category` | category | Ops, Technology, Marketing, etc. | Spend analysis |
| `spend_amount` | numeric | Category spend | Cost breakdown |

**Suggested questions:** Which branch has highest loan balance? NPL by region? Delinquency outliers? Interest income by segment?

---

## 6. Finance / FP&A — `finance_fpa.csv`

**Grain:** report_date × department × cost category  
**Rows:** 330 · **Period:** 2024 full year

| Column | Type | Description | Example QA use |
|--------|------|-------------|----------------|
| `report_date` | date | Financial period (month) | Budget vs actual trend |
| `department` | category | P&L department | Variance by dept |
| `cost_center` | category | Cost center code | FP&A drill-down |
| `category` | category | Personnel, Software, Travel, etc. | Cost category analysis |
| `budget` | numeric | Planned amount | Budget baseline |
| `actual` | numeric | Actual spend | Actuals |
| `variance` | numeric | actual − budget | Variance analysis |
| `revenue` | numeric | Allocated / earned revenue | Margin analysis |
| `cost` | numeric | Cost (mirrors actual) | Cost drivers |
| `units` | numeric | Activity units (may be missing) | Unit economics |

**Suggested questions:** Budget vs actual by department? Cost variance trend? Where are we over budget? Margin by department?

---

## 7. Operations — `operations.csv`

**Grain:** report_date × facility × department × production line  
**Rows:** 310 · **Period:** 2024-01 → 2024-10

| Column | Type | Description | Example QA use |
|--------|------|-------------|----------------|
| `report_date` | date | Production month | Throughput trend |
| `facility` | category | Plant or warehouse | Facility comparison |
| `department` | category | Assembly, Packaging, Quality, etc. | Dept utilization |
| `production_line` | category | Line-1 … Line-4 | Line throughput |
| `shift` | category | Day / Swing / Night | Shift analysis |
| `units_produced` | numeric | Output units | Throughput ranking |
| `downtime_hours` | numeric | Downtime (may be missing) | SLA / reliability |
| `cost` | numeric | Production cost | Efficiency |
| `defect_rate` | numeric | Defect ratio (may be missing) | Quality outliers |
| `sla_score` | numeric | SLA score 1–5 (may be missing) | SLA performance |

**Suggested questions:** Rank facilities by units produced? Downtime outliers? SLA by department? Throughput trend?

---

## 8. Customer Support — `customer_support.csv`

**Grain:** report_date × department × ticket category  
**Rows:** 300 · **Period:** 2024-01 → 2024-10

| Column | Type | Description | Example QA use |
|--------|------|-------------|----------------|
| `report_date` | date | Support month | Ticket volume trend |
| `department` | category | Tier-1, Billing, Technical, etc. | Team comparison |
| `ticket_category` | category | Account, Bug, Outage, etc. | Category breakdown |
| `priority` | category | Low → Critical | Escalation proxy |
| `channel` | category | Email, Chat, Phone, Portal | Channel analysis |
| `tickets_opened` | numeric | New tickets | Volume |
| `tickets_resolved` | numeric | Closed tickets (may be missing) | Resolution rate |
| `avg_resolution_hours` | numeric | Mean resolution time | Resolution time |
| `satisfaction_score` | numeric | CSAT 1–5 (may be missing) | Satisfaction ranking |
| `escalations` | numeric | Escalation count | Escalation analysis |

**Suggested questions:** Which department has lowest satisfaction? Ticket volume trend? Resolution time outliers? Escalations by priority?

---

## 9. HR — `hr.csv`

**Grain:** report_date × department × location  
**Rows:** 300 · **Period:** 2024 full year

| Column | Type | Description | Example QA use |
|--------|------|-------------|----------------|
| `report_date` | date | HR reporting month | Hiring / attrition trends |
| `department` | category | Engineering, Sales, etc. | Workforce distribution |
| `location` | category | HQ, Remote-US, London, etc. | Geo workforce |
| `job_family` | category | IC, Manager, Director, VP | Level mix |
| `headcount` | numeric | Active employees | Headcount ranking |
| `hires` | numeric | New hires (may be missing) | Hiring trends |
| `terminations` | numeric | Exits (may be missing) | Attrition drivers |
| `attrition_rate` | numeric | terminations / headcount (may be missing) | Attrition analysis |
| `satisfaction_score` | numeric | Employee satisfaction (may be missing) | Engagement |
| `personnel_cost` | numeric | Personnel spend | Cost per employee |

**Suggested questions:** Rank departments by headcount? Attrition trend? Hiring vs terminations? Workforce by location?

---

## 10. Healthcare — `healthcare.csv`

**Grain:** report_date × clinical department × ward  
**Rows:** 340 · **Period:** 2024 full year

| Column | Type | Description | Example QA use |
|--------|------|-------------|----------------|
| `report_date` | date | Clinical month | Patient volume trend |
| `department` | category | Emergency, Cardiology, etc. | Clinical comparison |
| `ward` | category | Ward-A, ICU, Outpatient, etc. | Ward utilization |
| `region` | category | Metro / Suburban / Rural | Regional volume |
| `patient_volume` | numeric | Patient encounters | Volume ranking |
| `admissions` | numeric | Admissions (may be missing) | Admission trend |
| `readmissions` | numeric | Readmission count (may be missing) | Outcome quality |
| `length_of_stay_days` | numeric | Average LOS (may be missing) | Resource utilization |
| `satisfaction_score` | numeric | Patient satisfaction (may be missing) | Outcome proxy |
| `cost` | numeric | Care delivery cost | Cost per patient |

**Suggested questions:** Which ward has highest patient volume? Readmission outliers? Satisfaction by department? Volume trend?

---

## Regeneration

```bash
python test-fixtures/domains/generate_domain_fixtures.py
```

Updates all CSVs and `manifest.json`. Seed is fixed for reproducibility.

---

## QA pattern coverage

| Pattern | Retail | Mktg | Sales | Geo | Banking | FP&A | Ops | Support | HR | HC |
|---------|--------|------|-------|-----|---------|------|-----|---------|----|----|
| Trend | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| Compare / ranking | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| Correlation | ● | ● | ● | ● | ● | ● | ○ | ○ | ○ | ○ |
| Executive summary | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| Follow-up chains | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| Missing values | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| Outliers | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |

---

*Generated for AI Insights Production QA Matrix — `docs/ai-insights-production-qa-matrix.md`*
