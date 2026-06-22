# Golden Dataset Validation Report

Generated from pipeline validation against backend `build_auto_dashboard()` and `discover_chart_opportunities()`.

## Summary

| Dataset | Rows | Columns | KPI Cards | Auto Charts | Opportunities | All Capabilities |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| retail_gold_10000.csv | 10,000 | 21 | 5 | 8 | 23 | PASS |
| hr_gold_5000.csv | 5,000 | 18 | 5 | 8 | 26 | PASS |
| banking_gold_10000.csv | 10,000 | 15 | 5 | 8 | 16 | PASS |

**Overall suite status:** PASS

## retail_gold_10000.csv

- **Rows:** 10,000
- **Columns:** 21
- **Executive domain:** `sales` → auto kind `sales`

### Data quality

- Empty columns: none
- Duplicate columns: none
- Numeric skew samples:
  - year: mean=2023.00, std=0.81, min=2022.00, max=2024.00
  - quantity: mean=3.32, std=6.38, min=1.00, max=80.00
  - sales_amount: mean=784.97, std=1904.05, min=11.34, max=52600.71
  - profit: mean=80.10, std=342.78, min=-4644.89, max=13626.08
  - discount_pct: mean=0.10, std=0.10, min=0.00, max=0.45
  - shipping_cost: mean=18.32, std=7.75, min=5.11, max=74.21
  - delivery_days: mean=5.33, std=3.26, min=1.00, max=28.00
  - customer_rating: mean=3.95, std=0.51, min=1.70, max=5.00

### Semantic mapping

- `customer` → `customer_rating`
- `date` → `order_date`
- `product` → `product_category`
- `profit` → `profit`
- `region` → `region`
- `sales` → `sales_amount`

### Capability coverage

- ✅ KPI cards
- ✅ Auto Dashboard charts
- ✅ Trend (line/area)
- ✅ Ranking (bar)
- ✅ Composition (donut/pie)
- ❌ Distribution (category)
- ✅ Histogram (AI Insights)
- ✅ Correlation (scatter)
- ✅ Geographic
- ✅ Compare intent
- ✅ Semantic column mapping

### KPI opportunities

- **Total Sales:** 7,849,721
- **Total Profit:** 801,021
- **Average Revenue per Record:** 785
- **Top Product Category by Sales amount:** Electronics
- **Top Region by Sales amount:** North

### Auto Dashboard charts

- [line] Monthly Sales Amount Trend
- [horizontalBar] Year by Customer Segment
- [donut] Product Category Sales Amount Share
- [scatter] Sales Amount vs Profit
- [bar] Shipping Cost by Marketing Channel
- [horizontalBar] Delivery Days by Sub Category
- [area] Monthly Profit Trend
- [area] Monthly Year Trend

### Opportunity inventory

- **compare** (4): Year by Product Category, Quantity by Customer Segment, Discount Pct by Campaign Name, Delivery Days by Sub Category
- **composition** (6): Region Profit Share, Product Category Sales Amount Share, Customer Segment Profit Share, Campaign Name Sales Amount Share, Marketing Channel Profit Share
- **correlation** (2): Sales Amount vs Profit, Sales Amount vs Quantity
- **geographic** (2): Profit by Region, Shipping Cost by Marketing Channel
- **ranking** (6): Sales Amount by Region, Profit by Product Category, Year by Customer Segment, Quantity by Campaign Name, Discount Pct by Marketing Channel
- **trend** (3): Monthly Sales Amount Trend, Monthly Profit Trend, Monthly Year Trend

### Chart type coverage

- Auto dashboard: `{"line": 1, "horizontalbar": 2, "donut": 1, "scatter": 1, "bar": 1, "area": 2}`
- Discovered: `{"line": 1, "area": 2, "horizontalbar": 7, "donut": 6, "scatter": 2, "bar": 5}`

### Histogram routing (AI Insights)

- ✅ `Show distribution of delivery days` → [histogram] Histogram — delivery days (12 buckets on `delivery_days`)

### Expected AI Summary insights

- North region likely concentrates revenue share
- Electronics drives high revenue with strong margins
- Clearance/Home & Kitchen sub-category shows loss-making lines
- Q4 seasonal peaks in sales with Holiday Mega Sale campaign alignment
- Higher discounts correlate with lower profit margins
- Delivery days skew toward fast fulfillment with long-tail outliers
- Enterprise segment commands premium average order values
- Paid Search and Organic channels dominate acquisition mix

### Example AI questions (54 curated)

- What is total revenue by region?
- Which product category has the highest profit margin?
- Show revenue trend over time
- Compare sales across customer segments
- Which marketing channel drives the most sales?
- What is the average delivery time by region?
- Show profit vs sales amount correlation
- Which categories are loss-making?
- What is the discount impact on profit?
- Show seasonal revenue patterns
- Top 10 cities by revenue
- How does customer rating vary by product category?
- Compare Q4 vs Q1 sales performance
- Which campaign generated the most revenue?
- Show distribution of delivery days
- What share of revenue comes from Electronics?
- Compare Enterprise vs Consumer segment profitability
- Which sub-category has the highest average order value?
- Show shipping cost trends by month
- Identify outliers in sales amount
- What is average profit by marketing channel?
- Compare shipping cost across regions
- Which age group spends the most?
- Show quantity distribution by product category
- What is profit margin by sub-category?
- How many orders per campaign?
- Compare Paid Search vs Email channel ROI
- Which state has fastest delivery?
- Show customer rating histogram
- What is revenue share by quarter?
- Compare discount levels across segments
- Which products have negative profit?
- Show monthly order volume trend
- What is average order value by region?
- Compare Electronics vs Clothing revenue
- Which city has highest customer ratings?
- Show profit concentration by top categories
- What is delivery time vs customer rating relationship?
- Compare campaign performance by quarter
- Which sub-category drives most volume?
- Show revenue per employee equivalent by segment
- What are top 5 loss-making product lines?
- Compare West vs East region profitability
- Show discount_pct vs profit scatter
- Which marketing channel has best ratings?
- What is seasonal pattern in shipping costs?
- Compare Enterprise order sizes vs Consumer
- Show geographic revenue heatmap by state
- Which campaigns correlate with high discounts?
- What is profit trend by product category?
- Compare delivery days across customer segments
- Show sales_amount distribution histogram
- Which region has highest discount rates?
- What is average quantity per order by category?

## hr_gold_5000.csv

- **Rows:** 5,000
- **Columns:** 18
- **Executive domain:** `hr` → auto kind `hr`

### Data quality

- Empty columns: none
- Duplicate columns: none
- Numeric skew samples:
  - age: mean=37.71, std=8.64, min=22.00, max=62.00
  - salary: mean=90237.10, std=41197.06, min=31797.76, max=286328.83
  - bonus: mean=7191.08, std=5045.96, min=332.81, max=40192.31
  - performance_rating: mean=3.59, std=0.64, min=1.30, max=5.00
  - engagement_score: mean=3.64, std=0.64, min=1.20, max=5.00
  - training_hours: mean=27.95, std=11.88, min=4.00, max=78.00
  - manager_flag: mean=0.29, std=0.45, min=0.00, max=1.00
  - attrition_flag: mean=0.12, std=0.33, min=0.00, max=1.00

### Semantic mapping

- `customer` → `age`
- `date` → `exit_date`
- `product` → `age_band`
- `profit` → `age`
- `region` → `location`
- `sales` → `training_hours`

### Capability coverage

- ✅ KPI cards
- ✅ Auto Dashboard charts
- ✅ Trend (line/area)
- ✅ Ranking (bar)
- ✅ Composition (donut/pie)
- ✅ Distribution (category)
- ✅ Histogram (AI Insights)
- ✅ Correlation (scatter)
- ✅ Geographic
- ✅ Compare intent
- ✅ Semantic column mapping

### KPI opportunities

- **Total Employees:** 5,000
- **Average Salary:** 90,237
- **Average Bonus:** 7,191
- **Department Count:** 7
- **Top Department:** Engineering

### Auto Dashboard charts

- [line] Monthly Training Hours Trend
- [horizontalBar] Age by Age Band
- [donut] Job Family Training Hours Share
- [horizontalBar] Records by Department
- [scatter] Salary vs Manager Flag
- [bar] Manager Flag by Location
- [bar] Bonus by Gender
- [area] Monthly Age Trend

### Opportunity inventory

- **compare** (5): Age by Department, Salary by Age Band, Bonus by Gender, Performance Rating by Job Family, Engagement Score by Job Level
- **composition** (6): Department Age Share, Age Band Training Hours Share, Gender Age Share, Job Family Training Hours Share, Job Level Age Share
- **correlation** (2): Salary vs Bonus, Salary vs Manager Flag
- **distribution** (3): Records by Gender, Records by Age Band, Records by Department
- **geographic** (1): Manager Flag by Location
- **ranking** (6): Training Hours by Department, Age by Age Band, Salary by Gender, Bonus by Job Family, Performance Rating by Job Level
- **trend** (3): Monthly Training Hours Trend, Monthly Age Trend, Monthly Salary Trend

### Chart type coverage

- Auto dashboard: `{"line": 1, "horizontalbar": 2, "donut": 1, "scatter": 1, "bar": 2, "area": 1}`
- Discovered: `{"line": 1, "area": 2, "horizontalbar": 12, "donut": 6, "scatter": 2, "bar": 3}`

### Histogram routing (AI Insights)

- ✅ `Show salary distribution` → [histogram] Histogram — salary (12 buckets on `salary`)

### Expected AI Summary insights

- Sales and Support departments show elevated attrition rates
- Engineering commands premium salaries with lower attrition
- Performance rating correlates with engagement scores and bonus levels
- HQ locations (New York, London) pay above remote averages
- Promotion flags concentrate among high performers (4.0+ ratings)
- Salary distribution is right-skewed with executive outliers
- Hiring spans 2015–2024 with department concentration in Engineering
- Training hours vary meaningfully by department and role level

### Example AI questions (55 curated)

- What is the attrition rate by department?
- Show salary distribution across the workforce
- Which department has the highest average salary?
- Compare engagement score vs performance rating
- What is the headcount by location?
- Show hiring trends over time
- Which job levels have the highest attrition?
- Compare bonus amounts by department
- What is average training hours by department?
- Show attrition patterns by age band
- Which departments have the most managers?
- Compare salary by gender
- What is promotion rate by job level?
- Show performance rating distribution
- Which location has highest engagement scores?
- Compare attrition in Sales vs Engineering
- Show salary vs performance scatter
- What is average tenure by department?
- Which job family has lowest engagement?
- Show workforce composition by department
- What is attrition rate by job level?
- Compare training hours across departments
- Which gender has higher average bonus?
- Show engagement score distribution
- What is salary range by job family?
- Compare manager vs IC compensation
- Which departments promote most frequently?
- Show hiring volume by year
- What is bonus vs performance correlation?
- Compare attrition by location
- Which age band has highest salaries?
- Show performance rating by department
- What is average tenure for attrited employees?
- Compare engagement in remote vs HQ locations
- Which job level has most training hours?
- Show attrition_flag rate by gender
- What is salary trend over hire cohorts?
- Compare Sales vs Support attrition rates
- Which department has lowest engagement?
- Show promotion rate by performance band
- What is headcount by job family?
- Compare bonus distribution across levels
- Which location hires the most?
- Show salary histogram by department
- What is training investment by job level?
- Compare VP vs IC1 salary gaps
- Which departments are over-indexed on managers?
- Show attrition trend by hire year
- What is engagement vs training hours relationship?
- Compare performance ratings by gender
- Which job family pays highest bonuses?
- Show workforce age distribution
- What is attrition risk in first 2 years?
- Compare Engineering headcount vs Sales
- Which locations have promotion hotspots?

## banking_gold_10000.csv

- **Rows:** 10,000
- **Columns:** 15
- **Executive domain:** `banking` → auto kind `finance`

### Data quality

- Empty columns: none
- Duplicate columns: none
- Numeric skew samples:
  - loan_balance: mean=2630510.58, std=7034815.18, min=8928.28, max=75384086.63
  - deposit_balance: mean=559183.93, std=937592.97, min=9581.76, max=10253373.01
  - credit_score: mean=692.62, std=58.39, min=520.00, max=820.00
  - utilization_pct: mean=0.50, std=0.22, min=0.06, max=0.98
  - spend_amount: mean=35797.40, std=61416.48, min=1132.41, max=1396303.40
  - transaction_count: mean=27.67, std=11.86, min=3.00, max=68.00
  - delinquency_flag: mean=0.09, std=0.28, min=0.00, max=1.00
  - account_age_months: mean=109.59, std=50.72, min=6.00, max=215.00

### Semantic mapping

- `customer` → `customer_id`
- `date` → `month`
- `product` → `product_type`
- `profit` → `account_age_months`
- `region` → `region`
- `sales` → `spend_amount`

### Capability coverage

- ✅ KPI cards
- ✅ Auto Dashboard charts
- ✅ Trend (line/area)
- ✅ Ranking (bar)
- ✅ Composition (donut/pie)
- ❌ Distribution (category)
- ✅ Histogram (AI Insights)
- ✅ Correlation (scatter)
- ✅ Geographic
- ✅ Compare intent
- ✅ Semantic column mapping

### KPI opportunities

- **Total Loan Balance:** 26,305,105,819
- **Total Spend Amount:** 357,973,985
- **Average Spend Amount:** 35,797
- **Top Customer Segment by Loan balance:** Corporate
- **Top Region by Spend amount:** North

### Auto Dashboard charts

- [line] Monthly Spend Amount Trend
- [horizontalBar] Account Age Months by Product Type
- [donut] Product Type Spend Amount Share
- [scatter] Spend Amount vs Deposit Balance
- [horizontalBar] Credit Score by City
- [area] Monthly Account Age Months Trend
- [area] Monthly Loan Balance Trend
- [scatter] Spend Amount vs Loan Balance

### Opportunity inventory

- **compare** (2): Loan Balance by Product Type, Deposit Balance by Customer Segment
- **composition** (3): Region Account Age Months Share, Product Type Spend Amount Share, Customer Segment Account Age Months Share
- **correlation** (2): Spend Amount vs Loan Balance, Spend Amount vs Deposit Balance
- **geographic** (2): Account Age Months by Region, Credit Score by City
- **ranking** (4): Spend Amount by Region, Account Age Months by Product Type, Loan Balance by Customer Segment, Deposit Balance by City
- **trend** (3): Monthly Spend Amount Trend, Monthly Account Age Months Trend, Monthly Loan Balance Trend

### Chart type coverage

- Auto dashboard: `{"line": 1, "horizontalbar": 2, "donut": 1, "scatter": 2, "area": 2}`
- Discovered: `{"line": 1, "area": 2, "horizontalbar": 5, "donut": 3, "scatter": 2, "bar": 3}`

### Histogram routing (AI Insights)

- ✅ `Show utilization rate distribution` → [histogram] Histogram — utilization pct (12 buckets on `utilization_pct`)

### Expected AI Summary insights

- Corporate and SME segments dominate loan balance concentration
- Credit scores below 620 strongly associate with delinquency flags
- Utilization rates cluster mid-range with high-utilization risk pockets
- Spend trends show gradual growth with seasonal oscillation
- Regional differences in spend and delinquency patterns
- Premium segment shows higher transaction counts and income
- Product mix skews toward Personal Loan and Credit Card
- Deposit balances complement loan portfolio for segment analysis

### Example AI questions (55 curated)

- What is total loan balance by customer segment?
- Show credit score vs delinquency relationship
- Which product type has highest deposit balance?
- Compare spend trends over time
- What is utilization rate distribution?
- Which region has highest delinquency rate?
- Show segment contribution to loan portfolio
- Compare monthly income by segment
- What is average transaction count by product?
- Show spend amount trends by month
- Which segment has highest credit scores?
- Compare loan vs deposit balance by region
- What share of customers are delinquent?
- Show utilization vs credit score correlation
- Which city has highest spend amounts?
- Compare Corporate vs Retail segment behavior
- Show account age distribution
- What is delinquency rate by credit score band?
- Which product has highest utilization?
- Show regional spend concentration
- What is loan balance by region?
- Compare deposit balance across segments
- Which product has highest delinquency?
- Show credit score distribution
- What is spend vs income correlation?
- Compare transaction counts by segment
- Which region has highest loan balances?
- Show monthly delinquency rate trend
- What is utilization by product type?
- Compare Premium vs Mass Affluent spend
- Which city has lowest credit scores?
- Show loan balance histogram
- What is deposit to loan ratio by segment?
- Compare Corporate vs SME utilization
- Which month has peak spending?
- Show delinquency rate by credit band
- What is average account age by product?
- Compare North vs South spend patterns
- Which segment over-utilizes credit?
- Show transaction_count distribution
- What is income vs loan balance scatter?
- Compare product mix by region
- Which customers are high-risk delinquent?
- Show spend_amount seasonal patterns
- What is credit score by customer segment?
- Compare loan balance share by product
- Which region has best credit quality?
- Show utilization_pct histogram
- What is monthly spend trend by segment?
- Compare deposit balance vs spend
- Which product drives most transactions?
- Show delinquency concentration by region
- What is spend per transaction by segment?
- Compare account age across products
- Which cities have highest loan exposure?

## Application capability matrix

These datasets are designed to exercise:

| Capability | Retail | HR | Banking |
| --- | --- | --- | --- |
| KPI cards | ✅ | ✅ | ✅ |
| Auto Dashboard charts | ✅ | ✅ | ✅ |
| Trend (line/area) | ✅ | ✅ | ✅ |
| Ranking (bar) | ✅ | ✅ | ✅ |
| Composition (donut/pie) | ✅ | ✅ | ✅ |
| Distribution (category) | ❌ | ✅ | ❌ |
| Histogram (AI Insights) | ✅ | ✅ | ✅ |
| Correlation (scatter) | ✅ | ✅ | ✅ |
| Geographic | ✅ | ✅ | ✅ |
| Compare intent | ✅ | ✅ | ✅ |
| Semantic column mapping | ✅ | ✅ | ✅ |

## Export & regression usage

- **Overview Dashboard:** KPI cards + auto charts from semantic mapping
- **AI Summary:** ranked insight bullets from KPI + chart breakdowns
- **Charts tab:** timeline + session charts from uploaded dataset
- **AI Insights:** trend, compare, correlation, geographic, histogram routing
- **PNG/PDF export:** chart capture at insight viewport widths

Re-run validation: `python test-fixtures/golden-datasets/validate_golden_datasets.py`
Regenerate data: `python test-fixtures/golden-datasets/generate_golden_datasets.py`
