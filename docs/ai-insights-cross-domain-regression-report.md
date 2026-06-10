# AI Insights — Cross-Domain Regression Report

**Executed:** 2026-06-10T11:10:11Z
**Mode:** `routing_deterministic_no_llm`
**Duration:** 5.2s
**Domains:** 10/10

## Overall verdict: **PASS**

Gates: domain avg ≥7.5 · ≥90% questions ≥7.0 · zero hallucination fails · zero critical · negative tests limitation-first

---

## Domain scorecard (Waves 1–3)

| Wave | Domain | Evals | Avg | Pass ≥7 | Halluc fails | Critical | Gates | Verdict |
|-----:|--------|------:|----:|--------:|-------------:|---------:|-------|---------|
| 1 | Retail | 30 | **8.45** | 30/30 (100.0%) | 0 | 0 | ✓avg ✓pct ✓hall ✓crit ✓neg | Pass |
| 1 | Marketing | 27 | **8.29** | 27/27 (100.0%) | 0 | 0 | ✓avg ✓pct ✓hall ✓crit ✓neg | Pass |
| 1 | Sales | 26 | **8.39** | 26/26 (100.0%) | 0 | 0 | ✓avg ✓pct ✓hall ✓crit ✓neg | Pass |
| 1 | Geography | 25 | **8.45** | 25/25 (100.0%) | 0 | 0 | ✓avg ✓pct ✓hall ✓crit ✓neg | Pass |
| 1 | Banking & Financial Services | 25 | **8.28** | 25/25 (100.0%) | 0 | 0 | ✓avg ✓pct ✓hall ✓crit ✓neg | Pass |
| 2 | Finance & FP&A | 16 | **8.22** | 16/16 (100.0%) | 0 | 0 | ✓avg ✓pct ✓hall ✓crit ✓neg | Pass |
| 2 | Operations | 15 | **8.45** | 15/15 (100.0%) | 0 | 0 | ✓avg ✓pct ✓hall ✓crit ✓neg | Pass |
| 2 | Customer Support | 15 | **8.15** | 15/15 (100.0%) | 0 | 0 | ✓avg ✓pct ✓hall ✓crit ✓neg | Pass |
| 3 | HR | 15 | **8.43** | 15/15 (100.0%) | 0 | 0 | ✓avg ✓pct ✓hall ✓crit ✓neg | Pass |
| 3 | Healthcare | 15 | **8.37** | 15/15 (100.0%) | 0 | 0 | ✓avg ✓pct ✓hall ✓crit ✓neg | Pass |

---

## Wave rollup

- **Wave 1:** avg **8.37** — PASS
- **Wave 2:** avg **8.27** — PASS
- **Wave 3:** avg **8.4** — PASS

---

## Top failures

_No failing questions._

---

## Reproduction

```bash
cd backend
python scripts/cross_domain_regression.py
# or routing-only without report regeneration:
python scripts/wave_qa_runner.py --wave all --routing-only
python scripts/cross_domain_regression.py --report-only
```

**Live narrative (staging):** run `wave1_live_narrative_qa.py` per wave on Render/Linux.

---

*Generated from `docs/ai-insights-production-qa-results.json`*