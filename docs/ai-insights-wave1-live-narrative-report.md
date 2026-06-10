# AI Insights Wave 1 — Live Narrative QA Report

**Status:** Evaluation only — no fixes implemented.

**Executed:** 2026-06-10T09:11:30Z
**Mode:** `full_ask_live_narrative`
**Duration:** 397.6s
**API key present:** True
**Preflight:** {"ok": true, "app_env": "development", "sample_excerpt": "PREFLIGHT_OK"}
**Live narratives:** 63 / 63

**Runbook:** [`ai-insights-live-narrative-staging-runbook.md`](ai-insights-live-narrative-staging-runbook.md)
**Fixtures:** `test-fixtures/domains/`

---

## 1. Live narrative scorecard

| Domain | N | Narrative avg | Ground | Exec | Rec | Conf | Follow-up | Halluc | Pass ≥7 | Verdict |
|--------|--:|--------------:|-------:|-----:|---:|----:|----------:|-------:|--------:|---------|
| Retail | 14 | **8.11** | 7.57 | 7.75 | 7.43 | 9.0 | 7.43 | 9.5 | 14/14 | Pass |
| Marketing | 13 | **8.13** | 7.62 | 7.96 | 7.23 | 9.0 | 7.46 | 9.5 | 13/13 | Pass |
| Sales | 12 | **8.07** | 7.67 | 7.83 | 7.25 | 8.83 | 7.33 | 9.5 | 12/12 | Pass |
| Geography | 12 | **8.11** | 7.38 | 8.04 | 7.25 | 9.0 | 7.5 | 9.5 | 12/12 | Pass |
| Banking & Financial Services | 12 | **8.06** | 7.54 | 7.46 | 7.38 | 9.0 | 7.5 | 9.5 | 12/12 | Pass |

---

## 2. Top narrative issues

No narrative issues below 7.0 average.
---

## 3. Hallucination failures

**None detected.**

---

## 4. Chart correct, answer weak

- **R-E02** (Retail): What are the biggest risks?
- **R-E03** (Retail): Summarize business performance
- **R-E10** (Retail): What concentration risk exists in our revenue?
- **R-NEG** (Retail): Compare conversion rate across cities
- **M-E01** (Marketing): Biggest marketing opportunity
- **M-E02** (Marketing): Biggest marketing risk
- **S-E01** (Sales): What is the biggest sales opportunity?
- **S-E02** (Sales): What is the biggest sales risk?
- **S-NEG** (Sales): Compare win rate by sales stage
- **G-I04** (Geography): Compare Mumbai vs Bengaluru revenue
- **G-E06** (Geography): Where is revenue overly concentrated?
- **G-E03** (Geography): Executive summary of regional performance
- **B-I01** (Banking & Financial Services): Loan portfolio concentration by region
- **B-I07** (Banking & Financial Services): Credit utilization risk concentration
- **B-E01** (Banking & Financial Services): Biggest portfolio opportunity
- **B-E02** (Banking & Financial Services): Biggest credit risk
- **B-NEG** (Banking & Financial Services): Compare net interest margin trend by quarter

---

## 5. Per-question detail

### B-B01 — Banking & Financial Services (narrative 8.25, live)
- Question: Which branch has the highest loan balance?
- Excerpt: Key findings:  BR-003 has the highest total loan balance at 41,979,951 across all report dates and customer segments in the dataset. The top five branches (BR-003, BR-021, BR-012, BR-009, and BR-020) collectively hold 195,093,726 in loan balance. However, the aggregated "Others" category—representin

### B-B02 — Banking & Financial Services (narrative 8.25, live)
- Question: Compare deposits across regions
- Excerpt: Key findings:  Central region has the highest average deposit balance at 2,281,395, outpacing West (the lowest) by 470,306, or roughly 26%. The five regions cluster in a relatively narrow band: Central leads, followed by North at 2,085,571, South at 2,073,974, and East at 2,066,794. West trails at 1

### B-B04 — Banking & Financial Services (narrative 8.0, live)
- Question: Show deposit trend over time
- Excerpt: Key findings:  Total npl amount across the dataset shows modest volatility over the three periods. The 2023-12-26/2024-01-01 period recorded 6,544,212 in npl amount. This dipped slightly to 6,435,955 in 2024-01-30/2024-02-05, representing a minor decline of approximately 1.7%. The most recent period

### B-C1-F1 — Banking & Financial Services (narrative 8.33, live)
- Question: Why is BR-003 highest?
- Excerpt: Based on the previous loan balance-by-branch result, BR-003 leads with a total loan balance of 41,979,951 — roughly 1.97 million ahead of the second-place BR-021 at 40,010,763.  Key findings  BR-003's 41.98 million represents approximately 9.5% of the measured loan balance portfolio across all 24 br

### B-C1-F2 — Banking & Financial Services (narrative 8.33, live)
- Question: Which columns were used for this analysis?
- Excerpt: For the prior chart, the calculation used three components:  Metric column: loan_balance Breakdown column: branch Aggregation: sum (Total)  The analysis summed all loan_balance values within the dataset and grouped them by branch identifier, then ranked branches by their total loan balance from high

### B-C1-F3 — Banking & Financial Services (narrative 8.33, live)
- Question: Show the calculations behind this answer.
- Excerpt: For the prior chart, the calculation used three components:  Metric column: loan_balance Breakdown column: branch Aggregation: Total (sum)  The analysis summed all loan_balance values in the dataset (360 rows across 11 branch groups) and ranked branches by their total loan balance from highest to lo

### B-C1-Q — Banking & Financial Services (narrative 8.25, live)
- Question: Which branch has the highest loan balance?
- Excerpt: Key findings  BR-003 has the highest total loan balance at 41,979,951 across all its records in the dataset. The top five branches (BR-003, BR-021, BR-012, BR-009, BR-020) collectively hold approximately 190.0 million in loan balance. The remaining 19 branches account for the balance of the measured

### B-E01 — Banking & Financial Services (narrative 7.58, live)
- Question: Biggest portfolio opportunity
- Excerpt: Executive takeaway: North and South regions dominate total spend amount, representing 53% of the portfolio, while West lags by 27% versus the leader—signaling a potential geographic concentration risk and an uplift opportunity in underperforming regions.  Evidence: - North leads at 4,375,219 in tota

### B-E02 — Banking & Financial Services (narrative 7.83, live)
- Question: Biggest credit risk
- Excerpt: Executive takeaway: Mass Affluent segment presents the lowest spend amount concentration at 3.7 million, representing a potential portfolio weakness relative to Retail's 4.2 million leadership.  Evidence: - Retail dominates spend amount at 4,223,900, while Mass Affluent trails at 3,705,831—an 12% ga

### B-I01 — Banking & Financial Services (narrative 7.83, live)
- Question: Loan portfolio concentration by region
- Excerpt: Executive takeaway: Loan portfolio spend amount exhibits moderate geographic concentration, with West underperforming significantly and North anchoring the largest share.  Evidence: - North leads at 4,375,219 in total spend amount (23% of regional total), while West ranks lowest at 3,194,178 (17%), 

### B-I07 — Banking & Financial Services (narrative 7.83, live)
- Question: Credit utilization risk concentration
- Excerpt: Executive takeaway: Mass Affluent customers represent a concentration risk, showing the lowest total credit utilization at 36.6 against a portfolio where Retail leads at 41.3, signaling potential underdeployed credit capacity in a high-value segment.  Evidence: - Retail accounts for 41.3 total credi

### B-NEG — Banking & Financial Services (narrative 7.92, live)
- Question: Compare net interest margin trend by quarter
- Excerpt: This dataset does not include the requested net-interest-margin column or the requested time period column, so the requested comparison cannot be answered directly.  The dataset contains interest_income and loan_balance fields but lacks a pre-calculated net-interest-margin metric. Additionally, repo

### G-B01 — Geography (narrative 8.25, live)
- Question: Which city generates the highest revenue?
- Excerpt: Key findings:  Amritsar generates the highest total revenue at 4,331,281, followed by Chandigarh at 4,097,302 and Coimbatore at 3,997,433. The top 10 named cities account for approximately 38.8 million in revenue, while the remaining cities grouped as Others contribute 30,109,182, representing a sig

### G-B02 — Geography (narrative 8.25, live)
- Question: Compare revenue across zones
- Excerpt: Key findings:  North zone leads revenue performance at 19,998,526, followed by South at 17,345,157 and West at 17,322,680. East trails significantly at 14,496,781. North's revenue exceeds East by approximately 5.5 million (38% spread), representing the largest performance gap among zones. North acco

### G-B05 — Geography (narrative 8.0, live)
- Question: Show revenue trend over time
- Excerpt: Key findings  Total revenue across the dataset spans 12.6 million (2024-01) to 15.1 million (2024-03), with a sharp contraction in 2024-06 to 3.6 million. The period 2024-03 leads the trend at 15,050,700, representing peak revenue performance. The latest month (2024-06) dropped 68% versus the prior 

### G-C1-F1 — Geography (narrative 8.33, live)
- Question: Why is Amritsar highest?
- Excerpt: Based on the previous revenue-by-city result, Amritsar generates 4,331,281 in total revenue—the highest among all cities shown. Here's why it leads:  Key findings:  Amritsar leads because it combines two factors present in the dataset: it operates 186 stores (the highest store count among the top pe

### G-C1-F2 — Geography (narrative 8.33, live)
- Question: What evidence supports this conclusion?
- Excerpt: For the prior chart, the evidence is:  Key findings:  Amritsar's revenue lead of 4,331,281 rests on two observable facts from the dataset:  1. Store count: Amritsar operates 186 stores—the highest among all named cities. Chandigarh (second place, 4,097,302 revenue) operates only 161 stores. That 25-

### G-C1-F3 — Geography (narrative 8.33, live)
- Question: Which columns were used for this analysis?
- Excerpt: For the prior chart, the calculation used:  Metric column: revenue Breakdown column: city Aggregation: sum (total revenue per city)

### G-C1-Q — Geography (narrative 8.25, live)
- Question: Which city generates the highest revenue?
- Excerpt: Key findings:  Amritsar generates the highest total revenue at 4,331,281, followed by Chandigarh at 4,097,302 and Coimbatore at 3,997,433. The top 10 cities account for approximately 70% of measured revenue, while the remaining cities grouped as "Others" contribute 30,109,182, representing roughly 3

### G-E03 — Geography (narrative 7.83, live)
- Question: Executive summary of regional performance
- Excerpt: Executive takeaway: North zone significantly outperforms other regions, generating nearly 20 million in revenue and representing approximately 29% of total zone revenue, while East lags with 14.5 million.  Evidence: - North leads with 19,998,526 in total revenue, ahead of South (17,345,157) and West

### G-E06 — Geography (narrative 7.83, live)
- Question: Where is revenue overly concentrated?
- Excerpt: Executive takeaway: Revenue concentration among top cities is moderate, but growth stagnation in Chennai and margin pressure in Kolkata present the primary business risks.  Evidence: - Amritsar and Chandigarh lead with 4.33M and 4.10M in total revenue respectively, while the remaining nine named cit

### G-I01 — Geography (narrative 7.92, live)
- Question: Is revenue correlated with customers?
- Excerpt: Key findings  Revenue and customers show a very strong positive correlation across the 285 observations with both metrics populated. The Pearson correlation coefficient is +0.88 and the Spearman correlation coefficient is +0.89, both indicating that as revenue increases, customer count tends to incr

### G-I04 — Geography (narrative 7.67, live)
- Question: Compare Mumbai vs Bengaluru revenue
- Excerpt: Key findings  The dataset contains 30 filtered rows across 2 cities. Mumbai's total revenue stands at 3,703,299, while Bengaluru's total revenue is 2,982,879. Mumbai leads by 720,420 in absolute terms, representing a 19% higher revenue total. Mumbai accounts for approximately 55% of combined revenue

### G-NEG — Geography (narrative 8.33, live)
- Question: Compare sales by salesperson across cities
- Excerpt: This dataset does not include the requested sales-rep field column, so the requested comparison cannot be answered directly.  Available-data context (fallback only): The dataset tracks revenue by city rather than by individual contributors, so a city-level revenue view is shown instead.  Key finding

### M-B01 — Marketing (narrative 8.25, live)
- Question: Compare satisfaction_score by channel
- Excerpt: Key findings  Paid Search leads on average satisfaction score at 4.0, followed closely by Paid Social (4.0), Affiliate (4.0), and Organic (4.0). Email averages 3.9, while Display trails at 3.7. The spread across channels is modest—0.3 points separates the highest from lowest. All six channels cluste

### M-B04 — Marketing (narrative 8.25, live)
- Question: Rank channels by revenue
- Excerpt: Key findings:  Affiliate generates the highest total revenue at 115,252,428, representing approximately 22% of combined channel revenue across the dataset. Paid Social ranks second with 104,317,867, followed by Display at 89,312,517. Paid Search and Email are nearly tied in the mid-range at 75,839,1

### M-B05 — Marketing (narrative 8.0, live)
- Question: Monthly trend of satisfaction score
- Excerpt: Key findings:  Average satisfaction score across the dataset is 3.92 (calculated from 307 non-null records). Monthly trends show relative stability with a notable dip in June. March and April both reached 4.0, the highest point in the seven-month span. June dropped to 3.8, the lowest month observed.

### M-B06 — Marketing (narrative 8.25, live)
- Question: Rank campaigns by conversions
- Excerpt: Key findings  Retargeting Cart ranks highest with an average of 7,733 conversions per report period, followed by Referral Boost at 7,099. The gap between the top performer (Retargeting Cart) and the lowest-ranked campaign (Spring Launch at 4,938) spans 2,795 conversions, or a 36% spread. The middle 

### M-C1-F1 — Marketing (narrative 8.33, live)
- Question: Why is Paid Social highest?
- Excerpt: Based on the previous satisfaction score-by-channel result, Paid Social is not actually highest — it ties with three other channels.  Key findings:  Paid Search leads at an average satisfaction score of 4.0, but Paid Social, Affiliate, and Organic all match that same 4.0 level when rounded to one de

### M-C1-F2 — Marketing (narrative 8.25, live)
- Question: Which columns were used for this analysis?
- Excerpt: For the prior chart, the calculation used the following columns:  Metric column: satisfaction_score (aggregated as Average/Mean) Breakdown column: channel Aggregation: Mean  The dataset contains 320 rows across 6 channel categories (Paid Search, Paid Social, Affiliate, Organic, Email, and Display). 

### M-C1-F3 — Marketing (narrative 8.25, live)
- Question: Show the calculations behind this answer.
- Excerpt: For the prior chart, the calculation used the metric column satisfaction_score aggregated as average (mean) across the breakdown column channel. The dataset contained 320 rows distributed across 6 channel categories (Paid Search, Paid Social, Affiliate, Organic, Email, Display), with 13 null values 

### M-C1-Q — Marketing (narrative 8.25, live)
- Question: Compare satisfaction_score by channel
- Excerpt: Key findings:  Paid Search ranks highest on average satisfaction score at 4.0, followed closely by Paid Social at 4.0 and Affiliate at 4.0. Organic scores 4.0, Email scores 3.9, and Display scores 3.7 — the lowest among the six channels. The spread between the top performer (Paid Search) and the low

### M-E01 — Marketing (narrative 7.83, live)
- Question: Biggest marketing opportunity
- Excerpt: Executive takeaway: Central region presents the clearest growth opportunity, trailing the leader South by 73 million in total revenue despite operating in the same market landscape.  Evidence: - South leads with 146.8 million in total revenue (28% of the five-region total), while Central trails at 7

### M-E02 — Marketing (narrative 7.83, live)
- Question: Biggest marketing risk
- Excerpt: Executive takeaway: Channel dependency on Affiliate creates material revenue concentration risk, while Organic underperformance suggests portfolio imbalance across marketing vehicles.  Evidence: - Affiliate generates 115.3M in total revenue (22% of channel portfolio), nearly 65% more than the lowest

### M-I01 — Marketing (narrative 7.92, live)
- Question: Is revenue correlated with satisfaction_score?
- Excerpt: Key findings  Based on analysis of 307 rows with both revenue and satisfaction_score populated, the correlation between revenue and satisfaction_score is very weak. Both the Pearson correlation coefficient (r = -0.04) and Spearman correlation coefficient (ρ = -0.04) point to negligible linear and ra

### M-I07 — Marketing (narrative 8.0, live)
- Question: Outlier campaigns on spend
- Excerpt: Executive takeaway: Retargeting Cart stands out as the highest-spend campaign at 1.64M, creating an 18% gap versus the lowest-spend outlier Mobile App Install at 1.35M, suggesting uneven resource allocation across the campaign portfolio.  Evidence: - Retargeting Cart commands 1,640,138 in total spen

### M-NEG — Marketing (narrative 8.25, live)
- Question: Compare NPS across channels
- Excerpt: This dataset does not include the requested satisfaction index column, so the requested comparison cannot be answered directly.  The dataset contains a satisfaction_score column (mean 3.93, range 2.91–4.8 across 307 non-null rows), but this is distinct from the metric you asked for. No the requested

### R-B01 — Retail (narrative 8.25, live)
- Question: Which city generates the highest revenue?
- Excerpt: Key findings  Delhi generates the highest total revenue at 6,327,280, followed by Jaipur at 4,767,697 and Mumbai at 4,758,053. The top three cities account for a substantial concentration of revenue. The gap between the highest-ranking city (Delhi) and the lowest in the ranking (Bhubaneswar at 2,950

### R-B03 — Retail (narrative 8.25, live)
- Question: Compare revenue across cities
- Excerpt: Key findings  Delhi leads all cities on total revenue at 6,327,280, followed by Jaipur (4,767,697) and Mumbai (4,758,053). The top three cities account for roughly 40% of measured revenue across the dataset. The bottom five cities—Pune, Hyderabad, Kolkata, Ahmedabad, Patna, and Bhubaneswar—each reco

### R-B05 — Retail (narrative 8.0, live)
- Question: Show revenue trend over time
- Excerpt: Key findings:  Revenue totals across the three periods show a rise-and-fall pattern. The period 2024-01-30/2024-02-05 generated the highest total revenue at 21,227,496, representing approximately 45% of the combined revenue across all three periods. The opening period 2023-12-26/2024-01-01 delivered

### R-C1-F1 — Retail (narrative 8.33, live)
- Question: Why is Delhi highest?
- Excerpt: Based on the previous revenue-by-city result, here is why Delhi is highest:  Key findings:  Delhi generates the highest total revenue at 6,327,280, substantially ahead of the second-ranked city, Jaipur (4,767,697). Delhi's revenue exceeds the lowest-ranked city, Bhubaneswar (2,950,469), by approxima

### R-C1-F2 — Retail (narrative 8.33, live)
- Question: What evidence supports this conclusion?
- Excerpt: For the prior chart, the evidence is:  Key findings:  Delhi's total revenue of 6,327,280 is supported by the dataset showing 13,415 customers and 7,218 orders in that city—both the highest counts among the 12 cities. Jaipur, the second-ranked city, generated 4,767,697 in revenue with 12,052 customer

### R-C1-F3 — Retail (narrative 8.33, live)
- Question: Which columns were used for this analysis?
- Excerpt: For the prior chart, the calculation used:  Metric column: revenue Breakdown column: city Aggregation: sum (total revenue per city)  The analysis grouped all 360 rows by city and summed revenue within each of the 12 cities. No other columns were filtered or excluded from the grouping; the entire dat

### R-C1-Q — Retail (narrative 8.25, live)
- Question: Which city generates the highest revenue?
- Excerpt: Key findings:  Delhi generates the highest total revenue at 6,327,280, followed by Jaipur (4,767,697) and Mumbai (4,758,053). Delhi's revenue exceeds the lowest-ranked city, Bhubaneswar (2,950,469), by approximately 3.4 million or 53%. The top three cities account for a significant concentration of 

### R-E01 — Retail (narrative 8.25, live)
- Question: What are the biggest opportunities in this retail data?
- Excerpt: Executive takeaway: East region underperforms by 40% versus North, presenting the clearest geographic uplift opportunity in this sample.  Evidence: - North generates 15.52M in total revenue, while East contributes 9.02M—a 6.5M gap representing 42% spread across the four regions. - East ranks last am

### R-E02 — Retail (narrative 7.83, live)
- Question: What are the biggest risks?
- Excerpt: Executive takeaway: Geographic revenue concentration represents the primary business risk, with Delhi generating 6.3M in total revenue—nearly double Bhubaneswar's 2.95M—suggesting heavy dependency on a single city and elevated vulnerability to localized disruptions.  Evidence: - Delhi accounts for 6

### R-E03 — Retail (narrative 7.83, live)
- Question: Summarize business performance
- Excerpt: Executive takeaway: North region dominates revenue performance, capturing one-third of total business revenue while East lags significantly behind.  Evidence: - North generated 15.5M in total revenue, 34% of the four-region total, and leads East by 42% on absolute revenue. - East contributed the low

### R-E10 — Retail (narrative 7.83, live)
- Question: What concentration risk exists in our revenue?
- Excerpt: Executive takeaway: Revenue concentration in Delhi creates geographic dependency risk, with the top city generating 26% of total revenue while the bottom four cities each contribute under 3%, leaving the portfolio vulnerable to localized disruption.  Evidence: - Delhi dominates at 6,327,280 in reven

### R-I01 — Retail (narrative 7.92, live)
- Question: Is revenue correlated with customers?
- Excerpt: Key findings  The scatter analysis of 351 rows with both revenue and customers populated shows virtually no correlation between revenue and customer count. Pearson correlation is -0.03 and Spearman correlation is -0.05, both indicating a very weak relationship. The sample size of 351 joint pairs fro

### R-I09 — Retail (narrative 8.25, live)
- Question: Compare East vs West region revenue
- Excerpt: Key findings  East region generated 9.02 million in total revenue, placing it fourth among the four regions. West region produced 11.28 million, South generated 11.58 million, and North led all regions with 15.52 million in total revenue. The gap between East and West is 2.26 million (20% lower for 

### R-NEG — Retail (narrative 7.92, live)
- Question: Compare conversion rate across cities
- Excerpt: This dataset does not include a conversion-rate column, so the requested comparison cannot be answered directly.  The data contains order volume, customer counts, revenue, and profit by city, but no metric that measures the proportion of visitors, prospects, or attempts that resulted in transactions

### S-B02 — Sales (narrative 8.25, live)
- Question: Rank departments by revenue
- Excerpt: Key findings  Field Sales generated 36,237,995 in total revenue, commanding the largest share across the three departments. Channel Sales contributed 31,865,921, placing it second. Inside Sales produced 23,628,431, trailing both peers.  Field Sales leads Inside Sales by approximately 12.6 million in

### S-B03 — Sales (narrative 8.25, live)
- Question: Compare revenue across regions
- Excerpt: Key findings:  North is the top-performing region with total revenue of 25,473,805, representing approximately 28% of combined regional revenue. West and South follow closely, each generating roughly 27% of total revenue (24,839,648 and 24,518,731 respectively). East lags significantly behind at 16,

### S-B05 — Sales (narrative 8.0, live)
- Question: Show revenue trend over time
- Excerpt: Revenue Trend Over Time  Key findings:  Total revenue across the dataset spans eight months from January through August 2024, with monthly totals ranging from 8.66M to 13.22M. July 2024 ranks highest at 13,215,085, while August 2024 shows the lowest total at 8,663,032. The most recent period (August

### S-C2-F1 — Sales (narrative 8.33, live)
- Question: What action should management take for the lowest department?
- Excerpt: Based on the previous result showing Inside Sales as the lowest-performing department by total revenue, here is guidance for management action.  Key findings  Inside Sales generated 80,784 in total revenue, trailing Channel Sales by approximately 4,489 (5% gap). The span between the top performer (C

### S-C2-F2 — Sales (narrative 8.33, live)
- Question: Show the calculations behind this answer.
- Excerpt: For the prior chart, the calculation used total (sum) revenue aggregated by department across 340 rows of data.  Calculation method  Each row in the dataset contains a revenue value and a department assignment (Field Sales, Channel Sales, or Inside Sales). The sum aggregation added all revenue entri

### S-C2-Q — Sales (narrative 8.25, live)
- Question: Rank departments by revenue
- Excerpt: Key findings  Total revenue across the three departments is approximately 91.7 million. Field Sales generates 36.2 million, representing about 40% of total revenue and leading the other two departments. Channel Sales contributes 31.9 million (35% of total), while Inside Sales accounts for 23.6 milli

### S-D02 — Sales (narrative 8.25, live)
- Question: Compare sales team performance by department
- Excerpt: Key findings  Total revenue across all departments is approximately 91.7 million. Field Sales generated 36.2 million, Channel Sales generated 31.9 million, and Inside Sales generated 23.6 million. Field Sales accounts for roughly 40% of total departmental revenue, while Channel Sales represents 35% 

### S-E01 — Sales (narrative 7.83, live)
- Question: What is the biggest sales opportunity?
- Excerpt: Executive takeaway: East represents the largest sales opportunity, trailing the North region by 8.6 million in total revenue and showing a 34% performance gap that may indicate capacity for growth.  Evidence: - North leads with 25.5M in total revenue, while East generated 16.9M — a gap of 8.6M acros

### S-E02 — Sales (narrative 7.83, live)
- Question: What is the biggest sales risk?
- Excerpt: Executive takeaway: East region presents the primary sales risk, contributing only 16.9 million in revenue—37% below North's total—signaling material geographic dependency and potential underperformance that warrants immediate attention.  Evidence: - East generated 16.9 million in total revenue vers

### S-I01 — Sales (narrative 7.92, live)
- Question: Is revenue correlated with units?
- Excerpt: Key findings:  Revenue and units show a strong positive correlation across 330 joint observations from your 340 rows of sales data. The Pearson correlation coefficient is +0.64 and the Spearman correlation coefficient is +0.68, both indicating that higher revenue tends to move together with higher u

### S-I03 — Sales (narrative 7.67, live)
- Question: Which department is an outlier for revenue?
- Excerpt: Key findings:  The calculated result shows total revenue by department across 340 rows: - Field Sales: 36.238 million - Channel Sales: 31.867 million - Inside Sales: 23.628 million  Field Sales ranks highest and contributes approximately 37% of total revenue. The revenue distribution across the thre

### S-NEG — Sales (narrative 7.92, live)
- Question: Compare win rate by sales stage
- Excerpt: This dataset does not include the requested win-rate column, so the requested comparison cannot be answered directly.  The data contains sales activity records with dimensions like region, territory, sales representative, and product line, along with metrics such as revenue, units, cost, quota, and 
