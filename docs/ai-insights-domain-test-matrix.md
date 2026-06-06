# AI Insights — Domain Test Matrix

**Purpose:** Reusable test questions and coverage status per domain and analysis pattern.

**Framework:** [`ai-insights-domain-quality-framework.md`](ai-insights-domain-quality-framework.md)

**Automated backend matrix:** `backend/tests/intent_engine/test_domain_quality_matrix.py` (`DOMAIN_QUALITY_MATRIX`)

**Fixtures**

| Key | Path | Rows | Columns (summary) |
|-----|------|------|-------------------|
| `retail` | `backend/tests/fixtures/retail_analytics_regression.csv` | 36 | order_date, city, region, product, revenue, profit, customers, orders, growth_rate |
| `geographic` | `backend/tests/fixtures/geographic_performance.csv` | — | zone, city, state, region, revenue, customers |
| `generic` | `backend/tests/fixtures/domain_quality_generic.csv` | 24 | report_date, region, department, category, revenue, cost, units, satisfaction_score |

---

## Coverage legend

| Status | Meaning |
|--------|---------|
| **Covered** | Deterministic pytest in domain matrix or routing matrix |
| **Partial** | Routing/chart ok; narrative, confidence, or intent label gap documented |
| **Gap** | No automated test; manual QA only |
| **N/A** | Pattern not applicable to domain vocabulary |

---

## 1. Retail

| Pattern | Test question | Fixture | Status | Notes |
|---------|---------------|---------|--------|-------|
| Compare | Compare revenue across cities | retail | Covered | `test_domain_quality_matrix` |
| Ranking | Which city generates the highest revenue? | retail | Covered | horizontalBar allowed |
| Trend | Show revenue trend over time | retail | Covered | line chart |
| Relationship | Is revenue correlated with customers? | retail | Covered | scatter |
| Geographic | Compare region performance | retail | Covered | region dimension |
| Outlier | Which city is an outlier? | retail | Partial | intent may be outlier or ranking |
| Executive risk | What are the biggest risks? | retail | Covered | executiveLens risk |
| Executive opportunity | What are the biggest opportunities? | retail | Partial | may route compare + opportunity lens |
| Summary | Summarize business performance | retail | Partial | summary/compare + bar |
| Follow-up chain | 5-step Mumbai/revenue chain | retail | Covered | `resolve_follow_up_turn` unit test |
| PDF provenance | Compare revenue across cities | retail | Covered | metricColumn + routingPlan |

**Additional retail coverage:** `test_routing_matrix.py` (40+ cases), `test_retail_analytics_regression.py`

---

## 2. Sales

| Pattern | Test question | Fixture | Status | Notes |
|---------|---------------|---------|--------|-------|
| Compare | Compare revenue across regions | generic | Covered | |
| Ranking | Rank departments by revenue | generic | Covered | horizontalBar on 7 depts |
| Trend | Show revenue trend over time | generic | Covered | report_date axis, line chart |
| Trend | How did revenue change over time? | generic | Covered | Phase 5B |
| Ranking | Rank products by revenue | generic | Covered | product→category alias |
| Relationship | — | — | Gap | Add: revenue vs units correlation |
| Geographic | Compare revenue across regions | generic | Partial | region column; not city-level |
| Outlier | — | — | Gap | |
| Executive summary | — | — | Gap | |
| Follow-up chain | 3-step: region revenue → why → columns | generic | Covered | `test_follow_up_domain_chains.py` |

---

## 3. Marketing

| Pattern | Test question | Fixture | Status | Notes |
|---------|---------------|---------|--------|-------|
| Compare | Compare satisfaction_score by category | generic | Covered | |
| Compare (across) | Compare satisfaction_score across categories | generic | Covered | Phase 5A: resolves `category`, intent=compare |
| Ranking | — | — | Gap | e.g. Rank categories by satisfaction_score |
| Trend | Monthly trend of satisfaction score | generic | Covered | Phase 5B |
| Trend | Track satisfaction score over periods | generic | Covered | Phase 5B |
| Relationship | Is revenue correlated with satisfaction_score? | generic | Covered | scatter |
| Geographic | — | — | N/A | |
| Outlier | — | — | Gap | |
| Executive summary | — | — | Gap | |
| Follow-up chain | 3-step: category satisfaction → why → columns | generic | Covered | Phase 5C |

---

## 4. Finance

| Pattern | Test question | Fixture | Status | Notes |
|---------|---------------|---------|--------|-------|
| Compare | Compare cost across departments | generic | Covered | |
| Profitability | Where are we losing money? | generic | Partial | profitability or executive fallback |
| Trend | Trend of cost by report date | generic | Covered | Phase 5B |
| Relationship | — | — | Gap | revenue vs cost margin proxy |
| Ranking | — | — | Gap | |
| Executive risk | — | — | Gap | |
| Follow-up chain | 3-step: department cost → why → columns | generic | Covered | Phase 5C |

| Pattern | Test question | Fixture | Status | Notes |
|---------|---------------|---------|--------|-------|
| Compare | Compare units across departments | generic | Covered | |
| Trend | Show units trend over time | generic | Covered | Phase 5B |
| Trend | How did units change over time? | generic | Covered | Phase 5B |
| Ranking | — | — | Gap | |
| Relationship | — | — | Gap | |
| Outlier | — | — | Gap | |
| Executive summary | — | — | Gap | |
| Follow-up chain | 3-step: department units → why → columns | generic | Covered | Phase 5C |

---

## 6. HR

| Pattern | Test question | Fixture | Status | Notes |
|---------|---------------|---------|--------|-------|
| Compare | Compare units across departments | generic | Covered | units as headcount proxy |
| Ranking | Rank departments by units | generic | Covered | |
| Trend | — | — | Gap | |
| Relationship | — | — | Gap | |
| Executive summary | — | — | Gap | |
| Vocabulary gap | "headcount" / "FTE" | — | Covered | Maps to `units` metric (Phase 5A) |
| Follow-up chain | 3-step: rank units → why → columns | generic | Covered | Phase 5C |

---

## 7. Customer Support

| Pattern | Test question | Fixture | Status | Notes |
|---------|---------------|---------|--------|-------|
| Compare | Compare satisfaction_score across departments | generic | Covered | |
| Ranking | Which department has the lowest satisfaction_score? | generic | Covered | |
| Trend | — | — | Gap | satisfaction trend over time |
| Relationship | — | — | Gap | |
| Outlier | — | — | Gap | low satisfaction outlier |
| Follow-up chain | 3-step: lowest satisfaction → why → columns | generic | Covered | Phase 5C; Finance min entity |

---

## 8. Healthcare (generic)

| Pattern | Test question | Fixture | Status | Notes |
|---------|---------------|---------|--------|-------|
| Compare | Compare units across departments | generic | Covered | Clinical dept in data |
| Ranking | Rank departments by units | generic | Covered | |
| Trend | — | — | Gap | |
| Relationship | — | — | Gap | |
| Vocabulary gap | "ward", "patient volume" | — | Covered | ward→category, patient volume→units (Phase 5A) |
| Follow-up chain | 3-step: patient volume/wards → why → columns | generic | Covered | Phase 5C |

---

## 9. Geography

| Pattern | Test question | Fixture | Status | Notes |
|---------|---------------|---------|--------|-------|
| Compare | Compare revenue across zones | geographic | Covered | zone dimension |
| Ranking | Which city generates the highest revenue? | geographic | Covered | |
| Relationship | Is revenue correlated with customers? | geographic | Covered | scatter |
| Geographic | Compare region performance by zone | geographic | Covered | zone/state/city |
| Trend | Show revenue trend over time | geographic | Covered | unsupported — no date column (Phase 5B) |
| Follow-up chain | — | — | Gap | |

**Related tests:** `test_geographic_scope.py`

---

## Follow-up meta questions (all domains)

Apply after a successful **ranking** or **compare** root question. Retail uses a 5-step chain; generic domains use a lightweight 3-step chain (Phase 5C).

| Step | Question | Validates |
|------|----------|-----------|
| 1 | Root: domain ranking/compare question | metric + dimension binding |
| 2 | Why is [entity] highest/lowest? | continuation + root scope |
| 3 | Which columns were used for this analysis? | column provenance in sidecar |

Extended retail chain (5-step):

| Step | Question | Validates |
|------|----------|-----------|
| 3 | What evidence supports this conclusion? | evidence meta; no hallucination markers |
| 5 | Show the calculations behind this answer. | calculation meta; no invented metrics |

**Automated tests:** `test_follow_up_domain_chains.py` (generic domains) · `test_domain_quality_matrix.py` (retail)

**Anti-hallucination markers** (must not appear in follow-up context block): `market penetration`, `conversion rate`, `customer lifetime value`, `net promoter`, `churn`, `patient risk`

---

## Validation dimension coverage matrix

| Dimension | Retail | Sales | Marketing | Finance | Ops | HR | Support | Healthcare | Geography |
|-----------|--------|-------|-----------|---------|-----|----|---------|------------|-----------|
| Intent routing | Covered | Partial | Partial | Partial | Partial | Partial | Partial | Partial | Covered |
| Chart type | Covered | Partial | Covered | Partial | Partial | Partial | Partial | Partial | Covered |
| Answer quality | Manual | Gap | Gap | Gap | Gap | Gap | Gap | Gap | Manual |
| Hallucination guard | Partial | Gap | Gap | Gap | Gap | Gap | Gap | Gap | Gap |
| Confidence | Partial | Gap | Gap | Gap | Gap | Gap | Gap | Gap | Gap |
| Follow-up chain | Covered | Covered | Covered | Covered | Covered | Covered | Covered | Covered | Gap |
| PDF readiness | Partial | Gap | Gap | Gap | Gap | Gap | Gap | Gap | Gap |

---

## Documented routing gaps (fix by pattern, not per question)

1. ~~**Category vocabulary**~~ — Fixed Phase 5A: *"across categories"* resolves to `category` when column exists.
2. **Horizontal bar on wide compares** — 7+ department groups emit `horizontalBar`; acceptable bar-family outcome.
3. **Executive opportunity** — may appear as `compare` with `executiveLens=opportunity` rather than strict `executive` intent.
4. **Domain synonyms** — headcount → units, ward → category/department; document in matrix rather than adding columns prematurely.
5. ~~**Trend on generic fixture**~~ — Fixed Phase 5B: `report_date` routes to line/area trend when 2+ periods exist; unsupported metadata when no/single period.

---

## How to extend

1. Add a row to `DOMAIN_QUALITY_MATRIX` in `test_domain_quality_matrix.py`.
2. Mirror the row in this doc with Status **Covered** or **Partial** + Notes.
3. Run: `python -m pytest backend/tests/intent_engine/test_domain_quality_matrix.py -v`
4. For narrative gaps, add manual QA row only — do not block CI on LLM wording.

---

*Last updated: Phase 4 — domain test matrix baseline.*
