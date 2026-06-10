# AI Insights Production QA — Wave 1 Execution Report

**Status:** Evaluation only — no fixes implemented.

**Executed:** 2026-06-10T05:34:51Z  
**Mode:** `routing_deterministic_no_llm` (133 evaluations across 5 domains)  
**Duration:** 2.3s  

> **Methodology:** Representative questions (20 per domain + 2 follow-up chains each) were executed against `compute_visualization_for_question` + `resolve_follow_up_turn` using fixtures under `test-fixtures/domains/`. Eight-dimension scores use the rubric in the production QA matrix. Narrative fields were synthesized from chart titles, executive cards, and confidence rationale because Claude `/ask` narrative calls failed locally (`SSL: CERTIFICATE_VERIFY_FAILED`). **Re-run `python scripts/wave1_qa_execution.py` in staging with a valid API key for full narrative scoring.**

**Fixtures:** `test-fixtures/domains/`
**Matrix:** [`docs/ai-insights-production-qa-matrix.md`](ai-insights-production-qa-matrix.md)

---

## 1. Wave 1 domain scorecard

| Domain | Evaluations | Domain avg | Pass ≥7.0 | Intent | Chart | Ground | Exec | Rec | Conf | Follow-up | Halluc | Verdict |
|--------|------------:|-----------:|----------:|-------:|------:|-------:|-----:|----:|----:|----------:|-------:|---------|
| Retail | 30 | **8.24** | 29/30 (97%) | 8.83 | 9.67 | 7.05 | 8.48 | 6.73 | 8.93 | 6.73 | 9.5 | Pass |
| Marketing | 27 | **8.15** | 26/27 (96%) | 8.22 | 9.41 | 7.2 | 8.48 | 6.78 | 8.85 | 6.78 | 9.5 | Pass |
| Sales | 26 | **7.93** | 22/26 (85%) | 7.92 | 8.23 | 7.15 | 8.42 | 6.69 | 8.62 | 6.92 | 9.5 | Conditional |
| Geography | 25 | **8.07** | 22/25 (88%) | 8.24 | 8.72 | 7.4 | 8.44 | 6.6 | 8.76 | 6.92 | 9.5 | Conditional |
| Banking & Financial Services | 25 | **8.12** | 24/25 (96%) | 7.44 | 9.6 | 7.48 | 8.48 | 6.6 | 8.92 | 6.92 | 9.5 | Pass |

---

## 2. Top failing questions

### Sales — `S-C2-F2` (avg **5.94**, medium)

- **Question:** Show the calculations behind this answer.
- **Pattern:** follow_up
- **Routing:** intent=`` metric=`revenue` dim=`sales_rep` chart=`None` conf=`low`
- **Notes:** Missing intent; Dimension hint department not in sales_rep; Missing visualization; N/A — not recommendation-focused question

### Geography — `G-E06` (avg **5.94**, medium)

- **Question:** Where is revenue overly concentrated?
- **Pattern:** executive
- **Routing:** intent=`` metric=`revenue` dim=`city` chart=`None` conf=`low`
- **Notes:** Missing intent; Missing visualization; Executive question lacks actionable recommendation; Thin confidence rationale

### Banking & Financial Services — `B-I07` (avg **5.94**, medium)

- **Question:** Credit utilization risk concentration
- **Pattern:** executive
- **Routing:** intent=`` metric=`loan_balance` dim=`customer_segment` chart=`None` conf=`low`
- **Notes:** Missing intent; Metric hint credit_utilization not in loan_balance; Missing visualization; Executive question lacks actionable recommendation

### Retail — `R-I09` (avg **6.12**, medium)

- **Question:** Compare East vs West region revenue
- **Pattern:** compare
- **Routing:** intent=`` metric=`revenue` dim=`region` chart=`None` conf=`low`
- **Notes:** Missing intent; Missing visualization; Answer may omit top entity North; N/A — not recommendation-focused question

### Sales — `S-B02` (avg **6.12**, medium)

- **Question:** Rank departments by revenue
- **Pattern:** ranking
- **Routing:** intent=`` metric=`revenue` dim=`sales_rep` chart=`None` conf=`low`
- **Notes:** Missing intent; Dimension hint department not in sales_rep; Missing visualization; Answer may omit top entity Field Sales

### Sales — `S-I08` (avg **6.12**, medium)

- **Question:** Rank product lines by revenue
- **Pattern:** ranking
- **Routing:** intent=`` metric=`revenue` dim=`sales_rep` chart=`None` conf=`low`
- **Notes:** Missing intent; Dimension hint product_line not in sales_rep; Missing visualization; Answer may omit top entity SMB Starter

### Sales — `S-C2-Q` (avg **6.12**, medium)

- **Question:** Rank departments by revenue
- **Pattern:** ranking
- **Routing:** intent=`` metric=`revenue` dim=`sales_rep` chart=`None` conf=`low`
- **Notes:** Missing intent; Dimension hint department not in sales_rep; Missing visualization; Answer may omit top entity Field Sales

### Geography — `G-I04` (avg **6.12**, medium)

- **Question:** Compare Mumbai vs Bengaluru revenue
- **Pattern:** compare
- **Routing:** intent=`` metric=`revenue` dim=`city` chart=`None` conf=`low`
- **Notes:** Missing intent; Missing visualization; Answer may omit top entity Amritsar; N/A — not recommendation-focused question

### Marketing — `M-I07` (avg **6.19**, medium)

- **Question:** Outlier campaigns on spend
- **Pattern:** outlier
- **Routing:** intent=`` metric=`revenue` dim=`channel` chart=`None` conf=`low`
- **Notes:** Missing intent; Metric hint spend not in revenue; Dimension hint campaign not in channel; Missing visualization

### Geography — `G-C2-F2` (avg **6.44**, medium)

- **Question:** What action should management take?
- **Pattern:** follow_up
- **Routing:** intent=`` metric=`revenue` dim=`city` chart=`None` conf=`low`
- **Notes:** Missing intent; Dimension hint zone not in city; Missing visualization; N/A — not recommendation-focused question

---

## 3. Reproduction steps

1. Start backend from `backend/` with Python env and dependencies installed.
2. Upload fixture: `test-fixtures/domains/<domain>.csv` via Overview upload (or bind in test harness).
3. Open **AI Insights** tab; ask the question verbatim from the matrix.
4. Inspect Intent Engine debug / network `analysis` + `visualization` payloads.
5. For follow-ups, send chain questions in order without **Reset conversation**.

**Automated replay (routing layer, no code changes):**
```bash
cd backend
python scripts/wave1_qa_execution.py --routing-only
python scripts/wave1_report_from_json.py
```

**Full narrative replay (requires Claude API):**
```bash
cd backend
python scripts/wave1_qa_execution.py
```

---

## 4. Actual vs expected behavior (pattern-level)

| Domain | Pattern | Avg score | Common actual behavior | Expected |
|--------|---------|----------:|------------------------|----------|
| Marketing | outlier | 6.19 | See failing questions | Per QA matrix |
| Banking & Financial Services | executive | 7.39 | See failing questions | Per QA matrix |
| Sales | outlier | 7.5 | See failing questions | Per QA matrix |
| Sales | ranking | 7.53 | Dimension drift to sales_rep on dept ranking | department dimension |
| Geography | executive | 7.64 | See failing questions | Per QA matrix |
| Retail | negative | 7.75 | May still route compare on proxy metric | unsupported/limitation-first |
| Marketing | negative | 7.75 | See failing questions | Per QA matrix |
| Sales | negative | 7.75 | See failing questions | Per QA matrix |
| Geography | negative | 7.75 | See failing questions | Per QA matrix |
| Banking & Financial Services | negative | 7.75 | See failing questions | Per QA matrix |
| Sales | trend | 7.81 | See failing questions | Per QA matrix |
| Geography | follow_up | 7.86 | See failing questions | Per QA matrix |
| Marketing | executive | 7.92 | See failing questions | Per QA matrix |
| Marketing | follow_up | 7.98 | See failing questions | Per QA matrix |
| Sales | follow_up | 7.99 | See failing questions | Per QA matrix |
| Retail | relationship | 8.0 | See failing questions | Per QA matrix |
| Marketing | relationship | 8.0 | See failing questions | Per QA matrix |
| Sales | relationship | 8.0 | See failing questions | Per QA matrix |
| Geography | relationship | 8.0 | Scatter OK | scatter on revenue × customers |
| Banking & Financial Services | trend | 8.0 | See failing questions | Per QA matrix |
| Banking & Financial Services | relationship | 8.0 | See failing questions | Per QA matrix |
| Banking & Financial Services | summary | 8.0 | See failing questions | Per QA matrix |
| Banking & Financial Services | outlier | 8.0 | See failing questions | Per QA matrix |
| Geography | compare | 8.05 | See failing questions | Per QA matrix |
| Retail | executive | 8.12 | See failing questions | Per QA matrix |
| Retail | ranking | 8.15 | See failing questions | Per QA matrix |
| Sales | executive | 8.16 | See failing questions | Per QA matrix |
| Retail | compare | 8.18 | See failing questions | Per QA matrix |
| Banking & Financial Services | follow_up | 8.2 | See failing questions | Per QA matrix |
| Retail | follow_up | 8.3 | See failing questions | Per QA matrix |
| Marketing | compare | 8.42 | campaign_name vs channel resolution varies | channel/category per question |
| Marketing | ranking | 8.44 | See failing questions | Per QA matrix |
| Banking & Financial Services | ranking | 8.48 | See failing questions | Per QA matrix |
| Retail | trend | 8.5 | See failing questions | Per QA matrix |
| Retail | outlier | 8.5 | See failing questions | Per QA matrix |
| Retail | summary | 8.5 | See failing questions | Per QA matrix |
| Retail | profitability | 8.5 | See failing questions | Per QA matrix |
| Marketing | trend | 8.5 | See failing questions | Per QA matrix |
| Marketing | summary | 8.5 | See failing questions | Per QA matrix |
| Sales | summary | 8.5 | See failing questions | Per QA matrix |
| Geography | trend | 8.5 | See failing questions | Per QA matrix |
| Geography | outlier | 8.5 | See failing questions | Per QA matrix |
| Geography | summary | 8.5 | See failing questions | Per QA matrix |
| Geography | ranking | 8.56 | See failing questions | Per QA matrix |
| Banking & Financial Services | compare | 8.59 | Donut for spend composition | bar compare acceptable |
| Sales | compare | 8.69 | See failing questions | Per QA matrix |

---

## 5. Severity classification

| Severity | Count | Description |
|----------|------:|-------------|
| Critical | 0 | Hallucination fail or avg <5 |
| High | 0 | Domain-blocking routing/grounding |
| Medium | 10 | Partial pass 5–7 |
| Low | 123 | ≥7 with minor notes |

---

## 6. Root cause hypothesis (no fixes applied)

1. **Dimension binding on new fixtures** — Sales/marketing/banking questions with department/territory/campaign vocabulary sometimes resolve to `sales_rep`, `product_line`, or `customer_segment` instead of the column named in the question.
2. **Executive / risk phrasing** — Opportunity/risk questions often route to `compare` or `executive` with bar charts (acceptable fallback) but narrative/recommendation scores depend on LLM prose not exercised in routing-only mode.
3. **Negative / unsupported tests** — Missing metrics (conversion rate, NPS, win rate, salesperson, quarter/NIM) may still produce charts instead of clean limitation-first responses.
4. **Follow-up scope** — Meta follow-ups (`Why`, `columns used`) preserve root via `resolve_follow_up_turn`; action/risk combo questions may re-route to a new executive compare.
5. **Composition charts** — Banking spend breakdown routes to `donut` (distribution intent); matrix expects bar family — acceptable for composition but scored lower on chart dimension.
6. **LLM narrative gap** — Full `/ask` run blocked in this environment (Anthropic SSL); executive summary and recommendation dimensions need staging re-run with live API.

---

## 7. Recommended fix order (when fixes are approved)

1. **P0 — Dimension resolver** for new domain columns (`territory`, `campaign_name`, `branch`, `spend_amount`, `product_line`) on ranking/compare questions.
2. **P0 — Unsupported metric guard** for negative tests (conversion, NPS, win rate, salesperson, quarter/NIM).
3. **P1 — Follow-up executive combos** — Keep deposit/loan root scope when follow-up asks risk + action in one utterance.
4. **P1 — Banking QA matrix rows** in `test_domain_quality_matrix.py` using `banking_financial_services.csv`.
5. **P2 — Chart family policy** — Document donut/pie acceptance for composition vs strict bar expectation.
6. **P2 — Staging narrative QA** — Re-score Wave 1 with live Claude after routing fixes.

---

## 8. Production readiness verdict — Wave 1

**Conditional readiness** — routing layer acceptable on anchor domains; complete staging narrative QA before sign-off.

Conditional domains: Sales, Geography.

| Gate | Status |
|------|--------|
| Retail routing on new fixture | See scorecard |
| Geography + trend (dated fixture) | See scorecard |
| Banking dedicated fixture exercised | Yes |
| Zero hallucination fails | See severity table |
| Live LLM narrative QA | **Pending** (API unavailable in local run) |

---

---

## 9. Wave 1 targeted fixes (2026-06-08)

**Status:** Resolver/routing fixes applied; re-scored in `routing_deterministic_no_llm` mode.

### Before → after domain averages

| Domain | Before | After | Δ |
|--------|-------:|------:|--:|
| Retail | 8.24 | **8.36** | +0.12 |
| Marketing | 8.15 | **8.24** | +0.09 |
| Sales | 7.93 | **8.32** | +0.39 |
| Geography | 8.07 | **8.37** | +0.30 |
| Banking | 8.12 | **8.21** | +0.09 |

**Medium-severity cases:** 10 → **0**. Hallucination failures remain **0**.

### Previously failing cases (after)

| QID | Before | After | Routing (after) |
|-----|-------:|------:|-----------------|
| S-B02 | 6.12 | **8.69** | ranking · department · horizontalBar |
| S-C2-Q | 6.12 | **8.69** | ranking · department · horizontalBar |
| S-C2-F2 | 5.94 | **8.25** | ranking · department · horizontalBar |
| G-I04 | 6.12 | **8.25** | compare · city · bar (Mumbai/Bengaluru) |
| G-E06 | 5.94 | **8.25** | executive · city · horizontalBar |
| B-I07 | 5.94 | **8.25** | executive · credit_utilization · bar |
| M-I07 | 6.19 | **8.50** | outlier · spend · campaign_name · horizontalBar |

### Root causes addressed

1. **Sales dimension drift** — `find_column_for_token("revenue")` matched `sales_rep` via `"sales"` substring when resolving `by revenue` as a dimension; rank-dimension phrase now prioritized; metric phrases filtered from dimension extraction.
2. **Follow-up calculations** — Meta follow-up already re-scopes to root question; fixing parent dimension routing restores chart on `Show calculations`.
3. **City value compare** — `vs` between entity values was misclassified as multi-metric comparison; added dimension-value compare detection + cohort filter.
4. **Concentration chart** — `_prefer_lower_cardinality_dimension` swapped city→state; concentration questions now preserve geographic dimension; concentration intent classified as executive risk.
5. **Credit utilization** — Executive ambiguous routing overwrote explicit utilization metric with loan_balance/revenue; explicit metric preserved; utilization token resolver added.
6. **Spend outlier** — Executive standout routing overwrote spend with revenue and channel over campaign; explicit metric + campaign dimension resolution fixed.

### Tests

- `backend/tests/intent_engine/test_wave1_routing_fixes.py` (6 cases, domain fixtures)
- Full `tests/intent_engine/`: **151 passed**

### Updated verdict

**Safe to deploy routing fixes** — Wave 1 routing-only averages ≥ 8.2 across all five domains; zero medium/high routing failures. **Staging narrative QA with live LLM still recommended** before full production sign-off.

*Latest results: `docs/ai-insights-wave1-results.json`*