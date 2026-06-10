# AI Insights Wave 2 — Live Narrative QA Report

**Status:** Evaluation only — no fixes implemented.

**Executed:** 2026-06-10T11:10:38Z
**Mode:** `full_ask_live_narrative`
**Duration:** 5.9s
**API key present:** True
**Preflight:** {"ok": true, "app_env": "development", "sample_excerpt": "PREFLIGHT_OK"}
**Live narratives:** 1 / 1

**Runbook:** [`ai-insights-live-narrative-staging-runbook.md`](ai-insights-live-narrative-staging-runbook.md)
**Fixtures:** `test-fixtures/domains/`

---

## 1. Live narrative scorecard

| Domain | N | Narrative avg | Ground | Exec | Rec | Conf | Follow-up | Halluc | Pass ≥7 | Verdict |
|--------|--:|--------------:|-------:|-----:|---:|----:|----------:|-------:|--------:|---------|
| Customer Support | 1 | **8.25** | 8.5 | 8.5 | 7.0 | 9.0 | 7.0 | 9.5 | 1/1 | Pass |

---

## 2. Top narrative issues

No narrative issues below 7.0 average.
---

## 3. Hallucination failures

**None detected.**

---

## 4. Chart correct, answer weak

None flagged.

---

## 5. Per-question detail

### C2-B01 — Customer Support (narrative 8.25, live)
- Question: Which ticket category has the longest resolution time?
- Excerpt: Key findings:  Billing has the longest average resolution time at 16.8 hours, followed by Account and Feature Request, both at 16.5 hours. Onboarding and Outage have the shortest resolution times, both averaging 14.9 hours. Across the 300 rows analyzed and 6 ticket categories, the spread between fas
