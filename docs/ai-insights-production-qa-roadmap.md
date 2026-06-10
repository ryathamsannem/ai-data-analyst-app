# AI Insights — Production QA Roadmap

**Status:** Waves 1 complete · Waves 2–3 + cross-domain regression ready to execute  
**Companion:** [`ai-insights-production-qa-matrix.md`](ai-insights-production-qa-matrix.md) · [`deployment-checklist.md`](deployment-checklist.md)

---

## Overview

| Phase | Domains | Fixture files | Harness | Live narrative |
|-------|---------|---------------|---------|----------------|
| **Wave 1** | Retail, Marketing, Sales, Geography, Banking | `retail.csv`, `marketing.csv`, `sales.csv`, `geography.csv`, `banking_financial_services.csv` | `wave1_qa_execution.py` | ✅ Staging complete |
| **Wave 2** | Finance / FP&A, Operations, Customer Support | `finance_fpa.csv`, `operations.csv`, `customer_support.csv` | `wave_qa_runner.py --wave 2` | Pending staging |
| **Wave 3** | HR, Healthcare | `hr.csv`, `healthcare.csv` | `wave_qa_runner.py --wave 3` | Pending staging |
| **Cross-domain** | All 10 domains | `test-fixtures/domains/*.csv` | `cross_domain_regression.py` | After waves 2–3 |
| **PDF export** | Retail, Generic, Geographic | Phase 7 matrix | `phase7-pdf-generate.test.ts` | See PDF runbook |
| **Deployment** | — | — | Checklist §10 | Go/no-go |

---

## Acceptance gates (all waves)

| Gate | Threshold |
|------|-----------|
| Domain average | ≥ **7.5** across 8 scoring dimensions |
| Question pass rate | ≥ **90%** of questions ≥ 7.0 |
| Hallucination failures | **0** (`hallucination_resistance` ≤ 3) |
| Critical severity | **0** |
| Negative tests | Limitation-first routing or hallucination ≥ **8** |
| Live narrative (staging) | Domain narrative avg ≥ **7.8**; hallucination **0** |

---

## Wave 2 — Finance / FP&A, Operations, Customer Support

### Fixtures

| Domain | File | Key columns |
|--------|------|-------------|
| Finance & FP&A | `finance_fpa.csv` | `budget`, `actual`, `variance`, `revenue`, `cost`, `department`, `cost_center`, `category` |
| Operations | `operations.csv` | `facility`, `production_line`, `shift`, `units_produced`, `downtime_hours`, `defect_rate`, `sla_score` |
| Customer Support | `customer_support.csv` | `ticket_category`, `channel`, `priority`, `avg_resolution_hours`, `satisfaction_score`, `escalations` |

### Question matrix

Defined in `backend/scripts/qa_wave_specs.py` — ~11 questions + 1 follow-up chain per domain:

- Basic: ranking, compare, trend
- Intermediate: relationship, multi-metric compare
- Executive: risk, opportunity, summary
- Negative: unsupported metric (EBITDA margin, OEE, NPS)

### Commands

```bash
cd backend

# Routing-only (local, no API key)
python scripts/wave_qa_runner.py --wave 2 --routing-only
python scripts/production_qa_report.py \
  --in ../docs/ai-insights-wave2-results.json \
  --out ../docs/ai-insights-wave2-execution-report.md \
  --title "AI Insights Production QA — Wave 2"

# Full narrative (requires ANTHROPIC_API_KEY)
python scripts/wave_qa_runner.py --wave 2
```

### Staging live narrative

Run on Render/Linux (SSL preflight fails on Windows):

```bash
cd backend
python scripts/wave1_live_narrative_qa.py --domains "Finance & FP&A,Operations,Customer Support"
```

---

## Wave 3 — HR, Healthcare

### Fixtures

| Domain | File | Key columns |
|--------|------|-------------|
| HR | `hr.csv` | `headcount`, `hires`, `terminations`, `attrition_rate`, `personnel_cost`, `job_family`, `location` |
| Healthcare | `healthcare.csv` | `patient_volume`, `admissions`, `readmissions`, `length_of_stay_days`, `ward`, `region` |

### Commands

```bash
cd backend
python scripts/wave_qa_runner.py --wave 3 --routing-only
python scripts/production_qa_report.py \
  --in ../docs/ai-insights-wave3-results.json \
  --out ../docs/ai-insights-wave3-execution-report.md \
  --title "AI Insights Production QA — Wave 3"
```

---

## Cross-domain regression (final)

Runs all 10 domains in one routing-only pass and emits pass/fail scorecard.

```bash
cd backend
python scripts/cross_domain_regression.py
```

**Outputs:**

- `docs/ai-insights-production-qa-results.json`
- `docs/ai-insights-cross-domain-regression-report.md`

Exit code **0** = all gates pass; **1** = at least one domain failed.

---

## PDF export final validation

See [`pdf-export-final-validation-runbook.md`](pdf-export-final-validation-runbook.md).

Phase 7 already passed (18/18 automated + 3/3 manual). Re-run before production deploy if chart/PDF code changed since 2026-06-06.

```bash
cd frontend
npx vitest run --config vitest.phase7.config.ts
```

---

## Production deployment checklist integration

Before production sign-off, complete in order:

1. [ ] Wave 2 routing QA — `wave_qa_runner.py --wave 2 --routing-only`
2. [ ] Wave 2 live narrative on staging
3. [ ] Wave 3 routing QA — `wave_qa_runner.py --wave 3 --routing-only`
4. [ ] Wave 3 live narrative on staging
5. [ ] Cross-domain regression — `cross_domain_regression.py` → **PASS**
6. [ ] PDF export re-validation (if chart/export code changed)
7. [ ] Deployment checklist §10 production QA gates
8. [ ] Staging smoke test (upload → ask → follow-up → PDF)

---

## File map

| Artifact | Purpose |
|----------|---------|
| `backend/scripts/qa_wave_specs.py` | Wave 2/3 question matrices |
| `backend/scripts/wave_qa_runner.py` | Unified runner (`--wave 1\|2\|3\|all`) |
| `backend/scripts/cross_domain_regression.py` | 10-domain gate + report |
| `backend/scripts/production_qa_report.py` | Markdown report from JSON |
| `backend/scripts/wave1_qa_execution.py` | Wave 1 harness (unchanged) |
| `backend/scripts/wave1_live_narrative_qa.py` | Staging live narrative |
| `test-fixtures/domains/` | All 10 domain CSV fixtures |
