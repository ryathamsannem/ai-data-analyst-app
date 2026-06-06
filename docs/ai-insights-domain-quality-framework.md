# AI Insights — Domain Quality Framework (Phase 4)

**Purpose:** Improve AI Insight quality **across business domains** using a reusable validation framework — not one-off prompt patches per question.

**Scope (Phase 4):** Document patterns, gaps, and deterministic checks. No large routing refactors, no UI changes, no `page.tsx` / `main.py` rewrites.

**Companion:** [`ai-insights-domain-test-matrix.md`](ai-insights-domain-test-matrix.md) · Backend matrix: `backend/tests/intent_engine/test_domain_quality_matrix.py`

---

## 1. Philosophy

| Principle | Meaning |
|-----------|---------|
| **Pattern over question** | Fix *compare-by-dimension*, *trend-over-date*, *correlation*, etc. once; all domains benefit. |
| **Document gaps first** | Record where routing, chart, or narrative fails before tuning. |
| **Deterministic layers first** | RoutingPlan, chart type, column binding, confidence meta, follow-up sidecar — test without LLM. |
| **Narrative second** | Answer quality and hallucination guards need LLM or integration tests; mark as manual / future phase. |
| **Retail is the anchor** | Full fixture + regression suite; other domains reuse generic vocabulary until domain CSVs exist. |

---

## 2. Domains

| # | Domain | Primary fixture | Notes |
|---|--------|-----------------|-------|
| 1 | Retail | `retail_analytics_regression.csv` | Strongest coverage; city/region/product vocabulary |
| 2 | Sales | `domain_quality_generic.csv` | Revenue + region/department |
| 3 | Marketing | `domain_quality_generic.csv` | satisfaction_score + category column |
| 4 | Finance | `domain_quality_generic.csv` | cost, revenue; profitability phrasing |
| 5 | Operations | `domain_quality_generic.csv` | units + department |
| 6 | HR | `domain_quality_generic.csv` | units headcount proxy |
| 7 | Customer Support | `domain_quality_generic.csv` | satisfaction_score by department |
| 8 | Healthcare (generic) | `domain_quality_generic.csv` | Ward/Clinical vocabulary in category column |
| 9 | Geography | `geographic_performance.csv` | zone, city, state, region |

---

## 3. Question patterns (reusable per domain)

Each domain should expose the same **analysis patterns** with domain-appropriate column names:

| Pattern | Example phrasing | Expected routing intent | Expected chart |
|---------|------------------|-------------------------|----------------|
| **Compare / ranking** | Compare X across Y; Which Y is highest? | `compare` / `ranking` | `bar` or `horizontalBar` |
| **Trend** | Show X trend over time | `trend` | `line` (or `area`) |
| **Relationship** | Is X correlated with Y? | `relationship` | `scatter` |
| **Geographic / grouping** | Compare region performance; by zone | `compare` / `ranking` | `bar` |
| **Outlier / risk / opportunity** | Which city is an outlier? Biggest risks? | `outlier` / `executive` + lens | `bar`, `histogram`, or executive bar |
| **Executive summary** | Summarize business performance | `summary` / `executive` / `compare` | `bar` (grouped overview) |
| **Follow-up meta** | Why is X highest? Evidence? Columns? Calculations? | continuation sidecar | inherits parent chart context |

**Follow-up chain (standard):**

1. Root ranking/compare question (establishes metric + dimension)
2. Why is [top entity] highest?
3. What evidence supports this conclusion?
4. Which columns were used for this analysis?
5. Show the calculations behind this answer.

---

## 4. Validation dimensions

### 4.1 Intent routing correctness

**What to check**

- `routingPlan.intent` matches question pattern (compare, ranking, trend, relationship, executive, summary, profitability, outlier).
- `routingPlan.metricColumn` and `routingPlan.dimensionColumn` exist in dataset profile.
- `routingPlan.supportStatus` is `supported` when columns resolve cleanly.

**Automated today**

- `test_routing_matrix.py` — 40+ retail cases
- `test_domain_quality_matrix.py` — cross-domain matrix
- `test_retail_analytics_regression.py` — retail end-to-end routing

**Known gaps**

- Generic fixture: phrasing *“across categories”* may map to `department` while `routingPlan.intent` is `fallback` (viz still renders). Prefer *“by category”* when `category` column exists.
- Executive opportunity questions sometimes route as `compare` with `executiveLens` opportunity — acceptable fallback.
- HR / healthcare domain words (headcount, ward) do not exist as columns; engine maps to `units` / `department`.

---

### 4.2 Chart type correctness

| Pattern | Allowed chart types | Disallowed |
|---------|---------------------|------------|
| Compare / ranking | `bar`, `horizontalBar` | pie unless true composition |
| Trend | `line`, `area` | bar as primary (unless ambiguous trend) |
| Relationship | `scatter` | grouped bar for correlation |
| Composition | pie / stacked bar | only when question asks share/part-to-whole |
| Outlier | `histogram`, `bar` | scatter for single-metric outlier |

**Automated today:** Matrix asserts chart type from `routingPlan.chartType` or visualization payload.

**Known gaps**

- Ranking with many categories prefers `horizontalBar` on generic fixture (7 departments) — still valid bar family.
- Frontend may normalize `horizontalBar` → `bar` in some paths; tests accept both.

---

### 4.3 Answer quality (narrative)

**Checklist (manual or future LLM-eval)**

- [ ] Concise executive summary (lead with answer, not process)
- [ ] Names driver or evidence from chart/data
- [ ] Does not overclaim causation from correlation
- [ ] Uses only columns present in dataset profile
- [ ] States aggregation (sum, average, count) when relevant

**Automated today:** None at narrative level in Phase 4.

**Existing hooks:** `AiExecutiveInsightsPanel`, provenance `<details>`, alignment repair warnings.

---

### 4.4 Hallucination guard

**Rules**

- No invented metrics (e.g. conversion rate, NPS, CLV when absent)
- No invented dimensions (markets, segments not in CSV)
- No external business assumptions (industry benchmarks, seasonality) unless in data
- Insufficient data → explicit limitation statement

**Automated today**

- `test_domain_quality_matrix.py` — follow-up `ai_context_block` must not contain `INVENTED_MARKERS`
- Column binding tests in routing matrix (metric/dimension must match profile)

**Manual QA**

- Live API 5-step retail chain (city/revenue/Mumbai)
- PDF appendix columns match `metricColumn` / `categoryColumn`

---

### 4.5 Confidence scoring

**Rules**

| Level | When |
|-------|------|
| **High** | Metric, dimension, and routing intent all explicit and supported |
| **Moderate** | Partial support (e.g. executive ambiguous, derived metric candidate) |
| **Low** | Missing column, ambiguous intent, fallback routing, insufficient rows |

**Automated today**

- `test_confidence_scoring.py` — unit tests for `compute_insight_confidence_meta`
- `test_domain_quality_matrix.py` — retail ranking reaches high or moderate

**Known gaps**

- Correlation confidence should be lower than clear ranking (covered in confidence unit tests, not yet in domain matrix).

---

### 4.6 Follow-up chain reliability

**Rules**

- Follow-up preserves parent metric, dimension, and root question
- Second-level follow-up still references root context
- Reset conversation clears AI session context (not dataset/filters)

**Automated today**

- `test_follow_up_context.py` — meta parsing and chain fields
- `test_domain_quality_matrix.py` — `resolve_follow_up_turn` retail 5-step chain

**Known gaps**

- Full HTTP integration test for follow-up was reverted (stability); unit-level routing only.

---

### 4.7 PDF readiness

**Rules**

- Answer exportable when `showInsightExportButton` gates pass
- Provenance block lists correct columns and aggregation
- Technical appendix matches analysis payload fields

**Automated today**

- `test_domain_quality_matrix.py` — `metricColumn`, `categoryColumn` / `routingPlan` on analysis payload
- `frontend/tests/pdf-export-sections.test.ts` — section structure (frontend)

**Manual QA**

- Capture chart at 860px, executive tone, appendix column names

---

## 5. Quality checklist (per release / domain)

Use this checklist when adding a domain or closing a quality gap:

```
Domain: _______________  Fixture: _______________  Date: ___________

Routing
  [ ] Compare/ranking → correct metric + dimension
  [ ] Trend → date column + line chart
  [ ] Relationship → scatter + two numeric columns
  [ ] Geographic → region/zone/city column when asked
  [ ] Executive/risk/opportunity → executive intent or documented fallback
  [ ] Summary → bar overview or documented fallback

Charts
  [ ] No pie for non-composition questions
  [ ] Horizontal bar allowed for ranking
  [ ] Chart title reflects aggregation

Answer (sample 3 questions)
  [ ] Executive lead sentence
  [ ] Evidence cited from data
  [ ] No invented columns
  [ ] Insufficient-data path tested

Confidence
  [ ] High only when routing fully supported
  [ ] Low on ambiguous / missing columns

Follow-ups
  [ ] 5-step meta chain preserves revenue/city (or domain equivalent)
  [ ] Reset clears conversation

PDF
  [ ] Export button visible when aligned
  [ ] Appendix columns match routingPlan
```

---

## 6. Improvement workflow (post–Phase 4)

1. **Pick a pattern** (e.g. trend-over-date on generic fixture), not a single user question.
2. **Add matrix row** in `test_domain_quality_matrix.py` + doc row in test matrix.
3. **Run pytest** — if fail, classify: bug vs documented gap.
4. **Fix narrow layer** — intent resolver, chart selector, or confidence only.
5. **Re-run retail regression** — ensure anchor domain unchanged.
6. **Manual narrative spot-check** — 2–3 questions per domain.
7. **Update gap table** in test matrix doc.

---

## 7. Current test map

| Layer | File | Coverage |
|-------|------|----------|
| Retail routing | `test_routing_matrix.py` | Extensive |
| Cross-domain routing | `test_domain_quality_matrix.py` | 9 domains, ~28 patterns |
| Retail regression | `test_retail_analytics_regression.py` | End-to-end |
| Confidence | `test_confidence_scoring.py` | Unit |
| Follow-up meta | `test_follow_up_context.py` | Unit |
| Executive lens | `test_executive_lens.py`, `test_executive_ambiguous_routing.py` | Partial |
| PDF sections | `pdf-export-sections.test.ts` | Frontend structure |

---

## 8. Out of scope (Phase 4)

- Per-question prompt tuning in LLM system prompts
- New domain-specific CSV fixtures (beyond small generic + geographic)
- UI changes to Insights layout or export chrome
- Broad refactors of `main.py` or `page.tsx`
- Live LLM narrative regression in CI

---

*Last updated: Phase 4 — domain quality framework baseline.*
