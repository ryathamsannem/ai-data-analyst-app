# AI Insights Wave 3 — Live Narrative QA Report

**Status:** Evaluation only — no fixes implemented.

**Executed:** 2026-06-10T11:11:38Z
**Mode:** `full_ask_live_narrative`
**Duration:** 65.3s
**API key present:** True
**Preflight:** {"ok": true, "app_env": "development", "sample_excerpt": "PREFLIGHT_OK"}
**Live narratives:** 12 / 12

**Runbook:** [`ai-insights-live-narrative-staging-runbook.md`](ai-insights-live-narrative-staging-runbook.md)
**Fixtures:** `test-fixtures/domains/`

---

## 1. Live narrative scorecard

| Domain | N | Narrative avg | Ground | Exec | Rec | Conf | Follow-up | Halluc | Pass ≥7 | Verdict |
|--------|--:|--------------:|-------:|-----:|---:|----:|----------:|-------:|--------:|---------|
| Healthcare | 12 | **8.06** | 7.38 | 8.04 | 7.12 | 8.83 | 7.5 | 9.5 | 12/12 | Pass |

---

## 2. Top narrative issues

No narrative issues below 7.0 average.
---

## 3. Hallucination failures

**None detected.**

---

## 4. Chart correct, answer weak

- **HC3-I02** (Healthcare): Which department has the lowest satisfaction score?
- **HC3-E01** (Healthcare): What are the biggest clinical operational risks?
- **HC3-E02** (Healthcare): Where is patient volume overly concentrated?

---

## 5. Per-question detail

### HC3-B01 — Healthcare (narrative 8.25, live)
- Question: Which ward has the highest patient volume?
- Excerpt: Key findings:  Ward-B has the highest total patient volume at 74,188 across the dataset, representing approximately 22% of all ward patient volume. Outpatient follows closely at 70,338, followed by Ward-C at 68,208, Ward-A at 64,734, and ICU at 62,871. The spread between the highest (Ward-B) and low

### HC3-B02 — Healthcare (narrative 8.25, live)
- Question: Compare readmissions across departments
- Excerpt: Key findings  Pediatrics records the highest average readmissions at 75 per reporting period, paired with the highest average admissions at 810. Oncology follows with 68 readmissions and 767 admissions. Cardiology averages 74 readmissions across 754 admissions. Emergency department reports 63 readmi

### HC3-B03 — Healthcare (narrative 8.0, live)
- Question: Show admissions trend over report date
- Excerpt: Admissions Trend Over Report Date  Key findings:  Total admissions across all 12 months in 2024 ranged from a low of 5,084 in December to a high of 23,437 in May. The first half of the year (January through June) showed relatively stable admissions, clustering between 19,937 and 23,437. From July on

### HC3-C1-F1 — Healthcare (narrative 8.33, live)
- Question: Why is Ward-B highest?
- Excerpt: Based on the previous patient volume-by-ward result, Ward-B leads with 74,188 total patients—roughly 22% of the combined volume across all five wards.  Key findings  Ward-B's patient volume (74,188) exceeds the second-ranked ward (Outpatient at 70,338) by 3,850 patients. The gap between Ward-B and t

### HC3-C1-F2 — Healthcare (narrative 8.33, live)
- Question: What evidence supports this conclusion?
- Excerpt: For the prior chart, the evidence is:  Key findings  Ward-B's total patient volume is 74,188 across all records in the dataset (340 rows, 5 wards). This represents 22% of the combined volume across all five wards. Ward-B exceeds the second-ranked ward (Outpatient at 70,338) by 3,850 patients. The sp

### HC3-C1-F3 — Healthcare (narrative 8.33, live)
- Question: Which columns were used for this analysis?
- Excerpt: For the prior chart, the calculation used:  Metric column: patient_volume Breakdown column: ward Aggregation: sum (Total)  The analysis summed all patient_volume records grouped by ward across 340 rows spanning 5 wards (Ward-B, Outpatient, Ward-C, Ward-A, and ICU).

### HC3-C1-Q — Healthcare (narrative 8.25, live)
- Question: Which ward has the highest patient volume?
- Excerpt: Key findings  Ward-B has the highest total patient volume across the dataset, with 74,188 patients. This represents approximately 22% of the total volume distributed across the five wards. Outpatient is the second-largest ward at 70,338, followed by Ward-C (68,208), Ward-A (64,734), and ICU (62,871)

### HC3-E01 — Healthcare (narrative 7.83, live)
- Question: What are the biggest clinical operational risks?
- Excerpt: Executive takeaway: Rural region concentration poses the primary operational risk, accounting for 38% of total patient volume across the sample, creating geographic dependency exposure.  Evidence: - Rural region captures 129,282 patient volume (38% of total), significantly outpacing Metro (110,292) 

### HC3-E02 — Healthcare (narrative 7.58, live)
- Question: Where is patient volume overly concentrated?
- Excerpt: Executive takeaway: Rural region exhibits significant patient volume concentration at 38% of the total, creating geographic dependency risk if service capacity or quality performance in that region deteriorates.  Evidence: - Rural accounts for 129,282 of 340,339 total patient volume across all regio

### HC3-I01 — Healthcare (narrative 7.92, live)
- Question: Is cost correlated with patient volume?
- Excerpt: Key findings  Cost and patient volume show a strong positive correlation across the 340 observations in your dataset. The Pearson correlation coefficient is +0.79 and the Spearman correlation coefficient is +0.81, both indicating a strong relationship. This means that as patient volume increases, co

### HC3-I02 — Healthcare (narrative 7.67, live)
- Question: Which department has the lowest satisfaction score?
- Excerpt: Key findings  Emergency department has the lowest average satisfaction score at 4.0, followed by Orthopedics at 4.0 and Cardiology at 4.0. Radiology ranks highest at 4.2. The spread between highest and lowest is narrow—only 0.2 points across all six departments. This analysis covers 340 records dist

### HC3-NEG — Healthcare (narrative 8.0, live)
- Question: Compare patient risk score across wards
- Excerpt: This dataset does not include the requested patient-risk-score column, so the requested comparison cannot be answered directly.  The available columns in this hospital operational dataset are: report_date, department, ward, region, patient_volume, admissions, readmissions, length_of_stay_days, satis
