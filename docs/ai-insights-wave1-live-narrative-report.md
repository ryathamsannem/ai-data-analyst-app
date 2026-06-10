# AI Insights Wave 1 — Live Narrative QA Report

**Status:** Evaluation only — no fixes implemented.

**Executed:** 2026-06-10T06:13:17Z  
**Mode:** `full_ask_live_narrative` (63 `/ask` evaluations)  
**Duration:** 964.6s  
**API key present:** Yes (loaded from `.env`)  
**Harness:** `backend/scripts/wave1_live_narrative_qa.py`  
**Staging runbook:** [`ai-insights-live-narrative-staging-runbook.md`](ai-insights-live-narrative-staging-runbook.md)  
**Raw results:** [`ai-insights-wave1-live-narrative-results.json`](ai-insights-wave1-live-narrative-results.json)

---

## ⚠️ Critical blocker — live narrative not exercised

**All 63 Claude narrative calls failed** with:

```text
[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: unable to get local issuer certificate
```

Every `/ask` response used the **connection fallback** answer:

> *"Could not reach the AI service. Check your network connection and try again. Your chart and calculated metrics below are still available."*

**Implication:** Scores below for executive summary, recommendations, correlation prose, and limitation-first answers **do not reflect Claude narrative quality**. They measure fallback text + deterministic chart/analysis payloads only.

**Re-run required:** Staging (Render/Linux) or a local environment with working TLS to `api.anthropic.com`. Certifi bundle did not resolve the failure on this Windows/Anaconda host.

---

## 1. Live narrative scorecard (fallback-constrained)

| Domain | N | Narrative avg* | Ground | Exec | Rec | Conf | Follow-up | Halluc | Corr† | Limit‡ | Charts OK | Routing verdict |
|--------|--:|---------------:|-------:|-----:|---:|----:|----------:|-------:|------:|-------:|----------:|-----------------|
| Retail | 14 | 7.40 | 6.79 | **6.0** | 6.57 | 9.0 | 6.57 | 9.5 | **5.0** | **5.0** | 14/14 | Pass |
| Marketing | 13 | 7.42 | 6.77 | **6.0** | 6.69 | 9.0 | 6.54 | 9.5 | **5.0** | **5.0** | 13/13 | Pass |
| Sales | 12 | 7.46 | 6.75 | **6.0** | 6.67 | 8.83 | 7.0 | 9.5 | **5.0** | **5.0** | 12/12 | Pass |
| Geography | 12 | 7.41 | 6.62 | **6.0** | 6.83 | 9.0 | 6.50 | 9.5 | **5.0** | **5.0** | 12/12 | Pass |
| Banking & Financial Services | 12 | 7.35 | 6.79 | **6.0** | 6.33 | 9.0 | 6.50 | 9.5 | 7.0† | **5.0** | 12/12 | Pass |

\*Narrative avg = mean of grounding, exec, rec, conf, follow-up, hallucination only.  
†Correlation explanation score — relationship questions only; all scored 5.0 (no correlation prose in fallback).  
‡Limitation-first score — negative tests only; all scored 5.0 (fallback does not state dataset limitation).

**Verdict (routing + chart layer):** Pass — post–Wave 1 fixes, all representative questions produced aligned charts and metric/dimension metadata.

**Verdict (live narrative):** **Blocked** — cannot sign off until staging re-run succeeds.

---

## 2. Top narrative issues (actionable after staging re-run)

These are the **expected** narrative gaps based on fallback behavior and rubric design; confirm or refute in staging:

| Priority | Issue | Evidence this run | Staging check |
|----------|-------|-------------------|---------------|
| P0 | **No AI narrative when API unreachable** | 63/63 fallback answers | Verify graceful degradation copy is acceptable for production |
| P1 | **Executive summary** | Exec pinned at 6.0 (fallback has no lead answer) | Lead sentence cites top entity + metric |
| P1 | **Negative / unsupported questions** | R/M/S/G/B-NEG: limitation-first 5.0 | Must refuse conversion/NPS/win-rate/quarter/NIM without inventing columns |
| P1 | **Correlation explanation** | R/M/S/G-I01: corr narrative 5.0 | Coefficient/direction + causation hedge |
| P2 | **Data grounding in prose** | Ground 6.5–7.0 (top entity often in chart only) | Answer must name Delhi, Field Sales, Mumbai, etc. |
| P2 | **Executive recommendations** | Rec 6.3–6.8 (N/A on many patterns) | Risk/opportunity/summary questions need hedged actions |
| P2 | **Follow-up continuity** | Sales chain 7.0; others 6.5–6.6 | Meta/calculation follow-ups preserve department/city scope |
| P3 | **Confidence rationale** | Conf 8.8–9.0 (from analysis metadata, not prose) | Rationale should cite sample size + chart groups in answer |

---

## 3. Hallucination / unsupported-claim failures

**None detected** in fallback text (fallback does not assert invented KPIs).

**Cannot validate** whether live Claude would hallucinate on:

- `R-NEG` — Compare conversion rate across cities  
- `M-NEG` — Compare NPS across channels  
- `S-NEG` — Compare win rate by sales stage  
- `G-NEG` — Compare sales by salesperson across cities  
- `B-NEG` — Compare net interest margin trend by quarter  

**Staging must confirm** limitation-first refusal on all five.

---

## 4. Chart correct, answer weak

**All 63 cases** — chart routing ≥8 and chart present, but executive summary scored 6.0 because fallback is not an analytical answer.

Representative examples (routing confirmed good):

| QID | Domain | Chart | Routed metric × dimension |
|-----|--------|-------|---------------------------|
| S-B02 | Sales | horizontalBar | revenue × department |
| G-I04 | Geography | bar | revenue × city (Mumbai, Bengaluru) |
| G-E06 | Geography | horizontalBar | revenue × city |
| B-I07 | Banking | bar | credit_utilization × customer_segment |
| M-I07 | Marketing | horizontalBar | spend × campaign_name |
| S-C2-F2 | Sales | horizontalBar | department preserved on “Show calculations” |

**Staging narrative check:** Re-score exec + grounding once Claude responds; expect large lift if prose cites chart values.

---

## 5. Answer good, confidence explanation weak

**Not observable** this run (no substantive answers).

From analysis metadata alone, confidence bands were **medium–high** with evidence lines present. Staging should verify the **answer body** repeats or aligns with `insightConfidenceRationale`, not only the analysis payload.

Watch in staging:

- Executive questions with moderate confidence but thin rationale in prose  
- Small-sample cohorts (value compares with 2 cities) — cautious band + explanation  

---

## 6. Follow-up chain results (routing layer)

| Chain | Root | Follow-ups | Chart on follow-ups | Notes |
|-------|------|------------|---------------------|-------|
| R-C1 | City revenue ranking | Why / Evidence / Columns | Yes | Scope preserved |
| M-C1 | Satisfaction by channel | Why / Columns / Calculations | Yes | |
| S-C2 | Rank departments | Action lowest / Calculations | Yes | F2 re-scopes to root correctly |
| G-C1 | City revenue ranking | Why / Evidence / Columns | Yes | |
| B-C1 | Loan balance by branch | Why / Columns / Calculations | Yes | |

Narrative continuity **not scored** (fallback). Routing continuity: **pass**.

---

## 7. Correlation questions (routing only)

| QID | Chart | Scatter | Metric pair |
|-----|-------|---------|-------------|
| R-I01 | scatter | Yes | revenue × customers |
| M-I01 | scatter | Yes | revenue × satisfaction_score |
| S-I01 | scatter | Yes | revenue × units |
| G-I01 | scatter | Yes | revenue × customers |

Correlation **narrative** (coefficient, direction, causation caution): **not tested**.

---

## 8. Recommended fix order (narrative — do not implement yet)

1. **Environment / ops** — Fix TLS to Anthropic on QA hosts; add staging smoke test for one `/ask` before matrix runs.  
2. **Negative-test narrative guardrails** — Ensure LLM refuses missing metrics (conversion, NPS, win rate, salesperson, quarter/NIM) with limitation-first copy.  
3. **Executive lead sentence** — Prompt/rubric: first sentence = direct answer with top entity/value.  
4. **Grounding enforcement** — Answer must cite chart top label or authoritative numeric block.  
5. **Correlation template** — Relationship answers: strength, direction, n, causation hedge.  
6. **Follow-up meta prompts** — Calculations / columns / evidence follow-ups: reuse prior metric+dimension in prose.  
7. **Confidence in prose** — Surface band + rationale in answer, not only analysis JSON.  
8. **Recommendation hedging** — Executive risk/opportunity: one hedged action linked to computed gap/concentration.

---

## 9. How to re-run (staging)

```bash
cd backend
# Ensure ANTHROPIC_API_KEY and working TLS
python scripts/wave1_live_narrative_qa.py
```

Outputs:

- `docs/ai-insights-wave1-live-narrative-results.json`  
- `docs/ai-insights-wave1-live-narrative-report.md` (this file, regenerated)

---

## 10. Production readiness — narrative gate

| Gate | Status |
|------|--------|
| Wave 1 routing fixes | ✅ Pass (prior routing-only run + charts this run) |
| Full `/ask` pipeline | ✅ Executed |
| Live Claude narrative | ❌ **Blocked (SSL)** |
| Hallucination on negatives | ⏳ Pending staging |
| Executive / correlation prose | ⏳ Pending staging |
| Safe to deploy routing fixes | ✅ Yes |
| Safe to sign off narrative UX | ❌ No — staging re-run required |

---

*Evaluation only. No product fixes implemented. Prior routing report: [`ai-insights-wave1-execution-report.md`](ai-insights-wave1-execution-report.md).*
