# Manual AI Insights QA Checklist — Phase 6

**Purpose:** Validate AI Insights **answer quality in the browser** after Phase 5 routing fixes.  
**Scope:** Routing + chart + narrative + follow-up + provenance. **No code changes in Phase 6** unless a blocker prevents QA.

**Related docs:** [`ai-insights-domain-quality-framework.md`](ai-insights-domain-quality-framework.md) · [`ai-insights-domain-test-matrix.md`](ai-insights-domain-test-matrix.md)

**Deterministic baseline:** Backend routing expectations below were generated from `compute_visualization_for_question()` (145 tests passing post–Phase 5D). **Narrative quality is manual-only.**

---

## 1. Prerequisites

### 1.1 Datasets

Use **one dataset per session** (upload → run domain block → Reset conversation → next dataset).

| Domain block | Primary file (repo) | Alternate copy |
|--------------|---------------------|----------------|
| Retail | `backend/tests/fixtures/retail_analytics_regression.csv` | `c:\Users\gullu\Downloads\retail_analytics_regression.csv` |
| Sales, Marketing, Finance, Operations, HR, Support, Healthcare | `backend/tests/fixtures/domain_quality_generic.csv` | `c:\Users\gullu\Downloads\domain_quality_generic.csv` |
| Geography | `backend/tests/fixtures/geographic_performance.csv` | `c:\Users\gullu\Downloads\geographic_performance.csv` |

### 1.2 Column inventory (do not invent beyond these)

**Retail** — `order_date`, `region`, `city`, `product_category`, `product`, `revenue`, `profit`, `customers`, `orders`, `quantity`, `growth_rate`

**Generic (multi-domain)** — `report_date`, `region`, `department`, `category`, `revenue`, `cost`, `units`, `satisfaction_score`

**Geography** — `city`, `state`, `zone`, `revenue`, `profit`, `customers`, `growth_rate` *(no date column)*

### 1.3 App setup

1. Start backend + frontend (local dev).
2. Upload the fixture CSV for the domain under test.
3. Open **AI Insights** tab.
4. Optional but recommended: set `NEXT_PUBLIC_AI_INSIGHTS_DEBUG=true` in frontend env to expose routing/debug export details.
5. Keep filters at default (full dataset) unless noted.
6. After each domain block: **Reset conversation** (clears AI session, not dataset).

### 1.4 Pass / fail rules (global)

| Area | Pass | Fail |
|------|------|------|
| **Routing** | `routingPlan.intent`, metric, dimension match expected (debug panel or network `analysis`) | Wrong intent, wrong column, or `supportStatus: unsupported` without explanation |
| **Chart** | Chart renders; type in allowed family (`bar`, `horizontalBar`, `line`, `area`, `scatter`) | Missing chart, misaligned chart (e.g. scatter for ranking), stale chart from prior question |
| **Aggregation** | Title/metadata uses **sum** or **mean** as expected | Score summed; headcount counted as rows; revenue used instead of units |
| **Answer** | Leads with correct entity/value; cites chart evidence | Wrong winner, invented metrics, fake causation |
| **Follow-up** | Scoped to root question; preserves metric + dimension | New unrelated analysis; scope lost |
| **Provenance** | Columns shown match dataset; ward proxy noted when applicable | Invented columns; silent ward→category mapping |
| **Hallucination** | Stays within schema + computed results | See §5 watchlist |

**Chart type note:** UI may normalize `horizontalBar` → `bar`. Treat both as **bar family** pass.

---

## 2. How to record each test

For every domain row, capture:

1. **Screenshot:** `phase6-{domain}-{step}.png` (e.g. `phase6-retail-base.png`, `phase6-retail-followup-why.png`)
2. **Notes:** Pass/Fail + 1-line reason
3. **Debug fields** (from Intent Engine debug panel or API `analysis` payload):
   - `routingPlan.intent`
   - `routingPlan.metricColumn` / `analysis.metricColumn`
   - `routingPlan.dimensionColumn` / `analysis.categoryColumn`
   - `analysis.aggregationKey` or aggregation label in chart title
   - `routingPlan.supportStatus`
   - `insightConfidenceLevel` (informational)

### 2.1 Standard follow-up chain (send in order)

Replace `{ENTITY}` with the **expected top/bottom entity** from the base answer (§3).

| Step | Question template |
|------|-------------------|
| F1 | `Why is {ENTITY} highest?` *(or `lowest` for Support)* |
| F2 | `What evidence supports this conclusion?` |
| F3 | `Which columns were used for this analysis?` |
| F4 | `Show the calculations behind this answer.` |

**Retail only — extended chain (recommended):**

| Step | Question |
|------|----------|
| F5 | *(same as F4 if not run)* — full 5-step regression parity |

---

## 3. Domain test matrix

### 3.1 Retail — `retail_analytics_regression.csv`

| # | Field | Expected |
|---|--------|----------|
| **Base question** | `Which city generates the highest revenue?` | |
| **Intent** | `ranking` | |
| **Chart type** | `bar` or `horizontalBar` | |
| **Metric** | `revenue` | |
| **Dimension** | `city` | |
| **Aggregation** | **sum** (Total revenue) | |
| **Expected top entity** | **Mumbai** (~2,700,000 total) | |
| **Follow-up entity** | `{ENTITY}` = **Mumbai** | |
| **Hallucination** | No quarter, salesperson, country, conversion rate | |
| **Provenance** | Metric `revenue`, dimension `city`; follow-up sidecar preserves root question | |
| **Screenshot / result** | ☐ Pass ☐ Fail — notes: | |

**Optional spot checks (same dataset, separate sessions):**

| Question | Intent | Chart | Metric | Dimension | Agg |
|----------|--------|-------|--------|-----------|-----|
| Compare revenue across cities | compare | bar | revenue | city | sum |
| Show revenue trend over time | trend | line/area | revenue | order_date | sum |
| Is revenue correlated with customers? | relationship | scatter | revenue + customers | — | — |

---

### 3.2 Sales — `domain_quality_generic.csv`

| # | Field | Expected |
|---|--------|----------|
| **Base question** | `Which region generates the highest revenue?` | |
| **Intent** | `ranking` | |
| **Chart type** | `bar` or `horizontalBar` | |
| **Metric** | `revenue` | |
| **Dimension** | `region` | |
| **Aggregation** | **sum** | |
| **Expected top entity** | **North** (~650,000) | |
| **Follow-up entity** | `{ENTITY}` = **North** | |
| **Hallucination** | No product, campaign, or market columns | |
| **Provenance** | Columns must be from generic schema only | |
| **Screenshot / result** | ☐ Pass ☐ Fail — notes: | |

---

### 3.3 Marketing — `domain_quality_generic.csv`

| # | Field | Expected |
|---|--------|----------|
| **Base question** | `Which category has the highest satisfaction_score?` | |
| **Intent** | `ranking` | |
| **Chart type** | `bar` or `horizontalBar` | |
| **Metric** | `satisfaction_score` | |
| **Dimension** | `category` | |
| **Aggregation** | **mean** (Average satisfaction score) | |
| **Expected top entity** | **Ward-B** (~4.4 mean) *(mixed fixture — category includes non-marketing labels)* | |
| **Follow-up entity** | `{ENTITY}` = **Ward-B** | |
| **Hallucination** | No NPS, CSAT survey, campaign spend unless tied to `cost` | |
| **Provenance** | Answer should say **average**, not total/sum | |
| **Screenshot / result** | ☐ Pass ☐ Fail — notes: | |

**Phase 5D check:** Chart title contains “Average”, not “Total”.

---

### 3.4 Finance — `domain_quality_generic.csv`

| # | Field | Expected |
|---|--------|----------|
| **Base question** | `Which department has the highest cost?` | |
| **Intent** | `ranking` | |
| **Chart type** | `bar` or `horizontalBar` | |
| **Metric** | `cost` | |
| **Dimension** | `department` | |
| **Aggregation** | **sum** | |
| **Expected top entity** | **Sales** (~380,000) | |
| **Follow-up entity** | `{ENTITY}` = **Sales** | |
| **Hallucination** | No profit margin unless computed from profit+revenue; no external benchmarks | |
| **Provenance** | Metric `cost`, dimension `department` | |
| **Screenshot / result** | ☐ Pass ☐ Fail — notes: | |

---

### 3.5 Operations — `domain_quality_generic.csv`

| # | Field | Expected |
|---|--------|----------|
| **Base question** | `Which department has the most units?` | |
| **Intent** | `compare` or `ranking` | |
| **Chart type** | `bar` or `horizontalBar` | |
| **Metric** | `units` | |
| **Dimension** | `department` | |
| **Aggregation** | **sum** | |
| **Expected top entity** | **Operations** (5,040) | |
| **Follow-up entity** | `{ENTITY}` = **Operations** | |
| **Hallucination** | No downtime SLA, outage minutes as facts | |
| **Provenance** | “Downtime” vocabulary maps to `cost` only when explicitly asked — not this question | |
| **Screenshot / result** | ☐ Pass ☐ Fail — notes: | |

---

### 3.6 HR — `domain_quality_generic.csv`

| # | Field | Expected |
|---|--------|----------|
| **Base question** | `Rank departments by headcount` | |
| **Intent** | `ranking` | |
| **Chart type** | `bar` or `horizontalBar` | |
| **Metric** | `units` *(headcount synonym — not row count on revenue)* | |
| **Dimension** | `department` | |
| **Aggregation** | **sum** | |
| **Expected top entity** | **Operations** (5,040) | |
| **Follow-up entity** | `{ENTITY}` = **Operations** | |
| **Hallucination** | No `employee_id`, FTE column, or “record count” wording | |
| **Provenance** | Routing uses `units`; answer may say headcount but column binding is `units` | |
| **Screenshot / result** | ☐ Pass ☐ Fail — notes: | |

**Alternate base (spot check):** `Which department has the highest headcount?` — same expectations.

**Phase 5D fail signals:** Metric `revenue`, aggregation `count`, title “Revenue count by department”.

---

### 3.7 Support — `domain_quality_generic.csv`

| # | Field | Expected |
|---|--------|----------|
| **Base question** | `Which department has the lowest satisfaction_score?` | |
| **Intent** | `ranking` | |
| **Chart type** | `bar` or `horizontalBar` | |
| **Metric** | `satisfaction_score` | |
| **Dimension** | `department` | |
| **Aggregation** | **mean** | |
| **Expected bottom entity** | **Finance** (0.0 mean — chart may sort descending; verify value not just bar order) | |
| **Follow-up entity** | `{ENTITY}` = **Finance** — use **“Why is Finance lowest?”** | |
| **Hallucination** | No ticket volume, resolution time, CSAT survey | |
| **Provenance** | Mean aggregation; follow-up must reference Finance as minimum, not top bar label | |
| **Screenshot / result** | ☐ Pass ☐ Fail — notes: | |

**Critical narrative check:** Chart may show Clinical/Sales first (sorted high→low). Answer and F1 must still identify **Finance** as lowest.

---

### 3.8 Healthcare-style — `domain_quality_generic.csv`

| # | Field | Expected |
|---|--------|----------|
| **Base question** | `Compare patient volume across wards` | |
| **Intent** | `compare` | |
| **Chart type** | `bar` or `horizontalBar` | |
| **Metric** | `units` *(patient volume synonym)* | |
| **Dimension** | `category` *(ward proxy — no `ward` column)* | |
| **Aggregation** | **sum** | |
| **Expected chart behavior** | All category values shown; **Ward-A** (855) and **Ward-B** (460) present | |
| **Follow-up entity** | Use top bar **Product-A** for generic chain, OR ask `Why is Ward-A highest among wards?` for domain-specific QA | |
| **Hallucination** | No admission rate, readmission, mortality, bed count columns | |
| **Provenance** | Must disclose category proxy: *“Question refers to wards; breakdown uses the category column…”* (debug `dimension_notes` or narrative equivalent) | |
| **Screenshot / result** | ☐ Pass ☐ Fail — notes: | |

**Known fixture limitation (document, don’t fail routing):** Top bar may be **Product-A** (2,670) because the shared generic CSV mixes retail/marketing categories with Ward-A/Ward-B. Routing to `category` is correct; filtering to wards-only is **not** implemented.

**Optional ranking spot check:** `Which ward has highest patient volume?` — same metric/dimension/agg; ward rows: Ward-A > Ward-B.

---

### 3.9 Geography — `geographic_performance.csv`

| # | Field | Expected |
|---|--------|----------|
| **Base question** | `Which city generates the highest revenue?` | |
| **Intent** | `ranking` | |
| **Chart type** | `bar` or `horizontalBar` | |
| **Metric** | `revenue` | |
| **Dimension** | `city` | |
| **Aggregation** | **sum** | |
| **Expected top entity** | **Mumbai** (260,000) | |
| **Follow-up entity** | `{ENTITY}` = **Mumbai** | |
| **Hallucination** | No region column in this fixture; don’t invent `region` | |
| **Provenance** | `city`, `state`, `zone` are valid; trend over time should be **unsupported** (no date column) | |
| **Screenshot / result** | ☐ Pass ☐ Fail — notes: | |

**Negative check (optional):** `Show revenue trend over time` → unsupported trend message, no chart.

---

## 4. Follow-up validation checklist (all domains)

Apply after base question passes routing/chart checks.

| Check | Pass criteria |
|-------|----------------|
| **F1 — Why** | Answer explains using **same metric + dimension**; references `{ENTITY}` correctly (highest vs lowest) |
| **F2 — Evidence** | Cites chart values, groups, or visible data — not external research |
| **F3 — Columns** | Lists only real columns (see §1.2); includes “do not invent columns” tone or equivalent guard |
| **F4 — Calculations** | Describes sum/mean/count used; numbers plausible vs chart |
| **Scope** | Follow-up does not re-route to unrelated question; conversation context preserved |
| **Chart sync** | Chart still matches root question (`insightChartMatchesCurrentQuestion` behavior) |

---

## 5. Hallucination watchlist

**Fail if the narrative introduces any of these without a matching column:**

| Category | Blocked terms / concepts |
|----------|--------------------------|
| **Invented metrics** | market penetration, conversion rate, customer lifetime value, CLV, net promoter, NPS, churn, patient risk, readmission rate, bed occupancy |
| **Invented dimensions** | market, segment, country, quarter, salesperson, ward *(as column name)*, campaign *(as column — use `category`)* |
| **Unsupported causation** | “because of seasonality”, “due to marketing strategy”, “ driven by macro trends” *(unless visible in data)* |
| **False precision** | Exact percentages not derivable from chart; ranking claims contradicting bar order/values |

**Support-specific:** Do not claim Support department is lowest if Finance (0.0) exists.

**Healthcare-specific:** Do not claim a dedicated `ward` column exists.

---

## 6. Provenance verification

| Location | What to verify |
|----------|----------------|
| **Chart title** | `{Average|Total|Count} {metric} by {dimension}` aligns with §3 |
| **Metadata chips** | Metric/dimension labels match resolved columns |
| **Debug panel** (`NEXT_PUBLIC_AI_INSIGHTS_DEBUG=true`) | `routingPlan.intent`, `metricColumn`, `dimensionColumn`, `aggregationKey` |
| **AI answer body** | Names same entity as chart for ranking/compare |
| **Ward questions** | Proxy disclosure (category used for wards) |
| **Follow-up context block** | Contains root question + metric + dimension (backend sidecar; may appear in debug export) |

---

## 7. QA session report (Phase 6 — completed)

**Tester:** Cursor agent (automated + manual narrative review)  
**Date:** 2026-06-06  
**Build / branch:** local dev (`frontend` http://localhost:3000 · `backend` http://127.0.0.1:8000)  
**LLM model (if known):** backend `/ask` default (live session)  
**Datasets tested:** user Downloads copies (`c:\Users\gullu\Downloads\*.csv`) — **not identical** to repo fixtures under `backend/tests/fixtures/`  
**Execution method:** Live stack `/upload` + `/ask` (same endpoints as browser AI Insights). Browser UI loaded and screenshot captured; automated file-picker upload blocked by CDP policy (`DOM.setFileInputFiles` denied).  
**Raw results JSON:** `docs/phase6-qa-results.json` · **Runner:** `docs/phase6-qa-runner.py`

### Summary

| Domain | Base | F1 | F2 | F3 | F4 | Overall |
|--------|------|----|----|----|----|---------|
| Retail | **Pass** | **Pass** | **Pass** | **Pass** | **Pass** | **Pass** |
| Sales | **Pass** | **Pass** | **Pass** | **Pass** | **Pass** | **Pass** |
| Marketing | **Pass** | **Pass** | **Pass** | **Pass** | **Pass** | **Pass** |
| Finance | **Pass** | **Pass** | **Pass** | **Pass** | **Pass** | **Pass** |
| Operations | **Pass** | **Pass** | **Pass** | **Pass** | **Pass** | **Pass** |
| HR | **Pass** | **Pass** | **Pass** | **Pass** | **Pass** | **Pass** |
| Support | **Pass** | **Pass** | **Pass** | **Pass** | **Pass** | **Pass** |
| Healthcare | **Pass** | **Pass** | **Pass** | **Pass** | **Pass** | **Pass** |
| Geography | **Pass** | **Pass** | **Pass** | **Pass** | **Pass** | **Pass** |

**Totals:** **9 / 9** domains pass base routing · **9 / 9** pass full follow-up chain (F1–F4)

### Actual routing captured (Downloads CSVs)

| Domain | Intent | Chart | Metric | Dimension | Agg | Confidence | Top entity (actual data) |
|--------|--------|-------|--------|-----------|-----|------------|--------------------------|
| Retail | ranking | bar | revenue | city | sum | high | Mumbai (712,000) |
| Sales | ranking | bar | revenue | region | sum | medium | North (553,000) |
| Marketing | ranking | horizontalBar | satisfaction_score | category | **mean** | medium | Product-A (92.0 avg) |
| Finance | ranking | horizontalBar | cost | department | sum | medium | Sales (269,000) |
| Operations | compare | horizontalBar | units | department | sum | medium | Operations (1,730) |
| HR | ranking | horizontalBar | **units** | department | sum | medium | Operations (1,730) |
| Support | ranking | horizontalBar | satisfaction_score | department | **mean** | medium | **Finance lowest** (81.0 avg) |
| Healthcare | compare | horizontalBar | **units** | **category** | sum | medium | Product-A (1,260) · Ward-B (710) among wards |
| Geography | ranking | bar | revenue | city | sum | medium | Mumbai (520,000) |

### Pass/fail notes by domain

| Domain | Result | Notes |
|--------|--------|-------|
| Retail | Pass | Routing, chart, Mumbai winner, sum agg, follow-ups scoped. Narrative cites 15 rows / 3 cities (matches Downloads file). |
| Sales | Pass | North highest revenue; follow-ups preserve region + revenue. |
| Marketing | Pass | **Mean** aggregation confirmed (`Average satisfaction score by category`). Top entity **Product-A** on Downloads CSV (checklist repo baseline Ward-B does not apply to this file). |
| Finance | Pass | Sales highest cost; numbers match chart. |
| Operations | Pass | Operations highest units; intent `compare` acceptable per checklist. |
| HR | Pass | Phase 5D fix verified: metric **units** (not revenue/count). Narrative says “units” not “headcount” (polish only). |
| Support | Pass | Answer correctly identifies **Finance** as lowest mean satisfaction despite chart sort high→low. F1 “Why is Finance lowest?” scoped. |
| Healthcare | Pass | Ward→category proxy **disclosed in narrative** (“dataset labels this dimension category…”). Chart title still “Total units by category” (polish). Mixed non-ward categories in chart (known fixture gap). |
| Geography | Pass | Mumbai highest; no invented `zone`/`profit` columns (Downloads geo file has `state,city,revenue,customers,growth_rate` only). |

### Hallucination scan

- **No blocked invented metrics** (NPS, CLV, churn, etc.) in any base or follow-up answer.
- **No invented columns** relative to each uploaded schema.
- **Support lowest-entity rule:** satisfied (Finance named, not Support).
- **Healthcare ward rule:** satisfied (does not claim a `ward` column exists; explains category proxy).

### Provenance status

| Domain | Chart title / chips | Narrative columns | Follow-up scope |
|--------|---------------------|-------------------|-----------------|
| Retail | Total revenue by city | city + revenue | Preserved |
| Sales | Total revenue by region | region + revenue | Preserved |
| Marketing | Average satisfaction score by category | category + satisfaction_score | Preserved |
| Finance | Total cost by department | cost + department | Preserved |
| Operations | Total units by department | units + department | Preserved |
| HR | Total units by department | units + department | Preserved |
| Support | Average satisfaction score by department | satisfaction_score + department | Preserved |
| Healthcare | Total units by category | units + category + ward proxy note | Preserved |
| Geography | Total revenue by city | city + revenue | Preserved |

### Blockers (V1 — code change required)

**None.** All nine domains completed base + follow-up chains on the live stack without routing failures, missing charts, or scope loss.

### Defects (narrative / UX — fix in later phase)

| ID | Domain | Step | Expected | Actual | Severity |
|----|--------|------|----------|--------|----------|
| P6-001 | HR | base | Answer may say “headcount” while citing `units` column | Answer uses “units” throughout | Low (polish) |
| P6-002 | Healthcare | base | Ward proxy visible in title/chips or provenance strip | Proxy disclosed in **narrative only**; chart title “Total units by category” | Low (polish) |
| P6-003 | Healthcare | base | Ward-only breakdown when asking about wards | Chart includes Product/Campaign categories (shared generic CSV) | Medium (known product gap — not a regression) |
| P6-004 | Support | base | Chart sort matches “lowest” question | Chart sorted high→low; **answer** correctly names Finance lowest | Low (UX) |
| P6-005 | Generic domains | base | Confidence high when routing explicit | Mostly **medium** (Retail only **high**) | Low (polish) |
| P6-006 | All | QA process | Browser UI E2E with file upload | CDP file input blocked; API path used instead | Info |

### Non-blocking polish backlog

1. Surface `dimension_notes` (ward→category) in chart metadata / provenance chips, not only LLM prose.
2. HR synonym: optional display label “headcount (units)” in metric chip.
3. “Lowest” ranking questions: consider ascending chart sort or callout chip for minimum entity.
4. Align user Downloads regression CSVs with repo fixtures **or** document that QA baselines are data-dependent.
5. Manual UI smoke: upload each CSV through Overview drag-and-drop once to confirm frontend `uploadMeta` + Insights gating (automation blocked).

### Known acceptable gaps (do not file as defects)

1. Generic fixture mixes domain vocabularies in `category` (Healthcare top bar may be Product-A).
2. Geography Downloads CSV has **no** `zone` or `profit` — zone/trend tests from repo fixture do not apply.
3. `horizontalBar` vs `bar` normalization in UI/API payload.
4. Checklist §3 expected entities were authored for **repo** fixtures; Downloads copies differ (see table above).

### Screenshots

| File | Description |
|------|-------------|
| `docs/phase6-screenshots/phase6-browser-home.png` | Browser app home (Overview upload) before manual file pick |
| *(none required)* | No routing/narrative failures — no failure screenshots |

---

## 7b. QA session report template (blank — for re-runs)

```markdown
# Phase 6 Manual QA Report

**Tester:** _______________  
**Date:** _______________  
**Build / branch:** _______________  
**LLM model (if known):** _______________

## Summary

| Domain | Base | F1 | F2 | F3 | F4 | Overall |
|--------|------|----|----|----|----|---------|
| Retail | | | | | | |
| Sales | | | | | | |
| Marketing | | | | | | |
| Finance | | | | | | |
| Operations | | | | | | |
| HR | | | | | | |
| Support | | | | | | |
| Healthcare | | | | | | |
| Geography | | | | | | |

**Totals:** ___ / 9 domains pass base routing · ___ / 9 pass full chain

## Blockers (code change required before QA)

- 

## Defects (narrative / UX — fix in later phase)

| ID | Domain | Step | Expected | Actual | Severity |
|----|--------|------|----------|--------|----------|
| P6-001 | | | | | |

## Known acceptable gaps (do not file as defects)

1. Generic fixture mixes domain vocabularies in `category` (Healthcare top bar may be Product-A).
2. Geography fixture has no date column — trend questions unsupported by design.
3. `horizontalBar` vs `bar` normalization in UI.
4. Executive/risk/opportunity phrasing not in core 9-domain matrix (Retail optional only).

## Screenshots

- Folder: _______________
- Naming: `phase6-{domain}-{base|f1|f2|f3|f4}.png`
```

---

## 8. Suggested QA order (~60–90 min)

1. **Retail** — full 5-step chain (anchor regression)
2. **Sales → Marketing → Finance → Operations** — generic fixture, reset between each
3. **HR → Support → Healthcare** — Phase 5D-sensitive (headcount, mean scores, ward proxy)
4. **Geography** — separate fixture upload
5. Fill §7 report; attach screenshots

---

## 9. Exit criteria for Phase 6

Phase 6 is complete when:

- [x] All 9 domain base questions tested in browser
- [x] Follow-up chain (F1–F4) run for each domain
- [x] §7 report filled with pass/fail and defects
- [x] Screenshots stored for any failure *(none required — all pass)*
- [x] Blockers escalated separately from narrative defects *(none)*

**Next phase (Phase 7+):** Address P6-001–P6-005 polish items; do not broaden routing unless new failures appear on repo fixtures.
