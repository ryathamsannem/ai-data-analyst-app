# Current Project Status

**Generated:** June 4, 2026  
**Branch:** `DEV`  
**Purpose:** Handoff snapshot for a fresh Cursor / ChatGPT session. No application logic in this folder — documentation only.

---

## Overall app status

The AI Data Analyst App is a **working MVP-stage** analytics SaaS: upload CSV/Excel, explore Overview/Data Preview, ask questions in **AI Insights**, view charts in **Charts**, and export an executive PDF from **Export**.

Core flows are stable enough for iterative QA. Recent work focused on **intent routing**, **confidence scoring**, **PDF export completeness**, **follow-up conversation context**, and **executive lens PDF copy** — mostly uncommitted on `DEV`.

**Baseline docs (do not contradict without verifying code):**  
[`AGENTS.md`](../AGENTS.md) · [`PROJECT_ARCHITECTURE_SUMMARY.md`](../PROJECT_ARCHITECTURE_SUMMARY.md) · [`docs/project-snapshot.md`](../docs/project-snapshot.md) · [`PDF_EXPORT_STABLE_BASELINE.md`](../PDF_EXPORT_STABLE_BASELINE.md)

---

## What is working

| Area | Status |
|------|--------|
| Upload, mapping, filters, Overview KPIs | Stable |
| AI Insights ask → chart + narrative | Stable; intent engine + `/ask` |
| Charts tab timeline + ChartRenderer | Stable |
| Executive PDF export (KPI, insight, chart) | Working |
| Intent engine tests (`backend/tests/intent_engine/`) | Green (134 tests with follow-up suite) |
| Frontend unit tests (Vitest) | Green (70 tests) |
| RoutingPlan on analysis payload | Wired FE/BE |
| Follow-up context payload (`continuation_intent`, `parent_analysis_context`) | Implemented (needs manual E2E QA) |
| PDF advanced sections in executive mode when checkboxes selected | Fixed in code (needs PDF smoke test) |
| Simple ranking confidence → High band | Fixed in `confidence_scoring.py` |
| Opportunity lens PDF wording (lagger-focused) | Fixed in `pdf-executive-content.ts` |
| Executive-risk intent routing + lens prioritization | Implemented |

---

## What is still pending

| Item | Notes |
|------|--------|
| **Manual follow-up chain QA** | 5-step sequence on `retail_analytics_regression.csv` — not fully verified in browser this session |
| **PDF smoke test (all checkboxes)** | Confirm all 7 sections visible in downloaded PDF |
| **Export/PDF finalization** | Per AGENTS.md — pagination, page utilization, chart-intel compression not finalized |
| **Git commit / push** | Large uncommitted diff on `DEV` |
| **TypeScript strict check** | 11 pre-existing `tsc` errors (see `test-status.md`) |
| **Update `docs/known-test-failures.md`** | Counts outdated (claims 66 tests; suite now larger) |
| **MVP sign-off checklist** | No formal checklist completed |

---

## Current branch

```
DEV
```

Latest commits (already on branch):

```
e20d044 ai insight enhancment
627a76b ai insight enhancment
a4f4639 ai insight enhancment
```

Working tree has **additional uncommitted changes** (see `changed-files-summary.md`).

---

## Latest completed fixes (uncommitted unless noted)

1. **Follow-up context** — `parent_analysis_context`, `continuation_intent`, expanded thread-meta patterns, root question preservation (`frontend/lib/ai-conversation-context.ts`, `backend/main.py`).
2. **PDF selected sections in executive mode** — Data Quality, Conversation Thread, Technical Appendix no longer gated on `analyst` mode only (`frontend/app/pdf-report.ts`).
3. **Ranking confidence** — Unambiguous ranking/compare can reach High band (`backend/intent_engine/confidence_scoring.py`).
4. **Opportunity lens narrative** — Upside Potential reframed on lagger, not leader (`frontend/lib/pdf-executive-content.ts`).
5. **PDF executive content** — Semantic lens mapping, action-oriented recommendations, leader/lagger fixes (`frontend/lib/pdf-executive-content.ts`).
6. **Data Preview in PDF** — Export checkbox honored in executive mode (`frontend/app/pdf-report.ts`, `frontend/app/page.tsx`).
7. **Executive-risk routing** — Risk phrases route before compare/ranking (`backend/intent_engine/executive_ambiguous_intent.py`, `executive_lens.py`).
8. **RoutingPlan backbone** — New `routing_plan.py` / `routing-plan.ts` + matrix tests.

---

## Known risks

| Risk | Severity | Detail |
|------|----------|--------|
| **Monolithic `page.tsx` / `main.py`** | Medium | ~14k lines each; regressions easy without tests |
| **In-memory backend session** | Medium | Single `df` per process; not multi-tenant |
| **Continuation treats all post-reset asks as follow-ups** | Low–Med | By design until Reset; new topic without reset inherits context |
| **TypeScript errors** | Low | Vitest passes; `tsc --noEmit` fails on 11 known issues |
| **Uncommitted work** | High | Snapshot reflects working tree, not last commit |
| **PDF layout polish** | Low | Sections render; page fill and narrative density not tuned |
| **LLM narrative drift** | Medium | Column meta follow-ups rely on prompt guards; E2E validation needed |
| **Test discovery pitfall** | Low | Do not run `unittest discover -s tests` (shadows `intent_engine` package) |

---

## Related snapshot files

- [`changed-files-summary.md`](changed-files-summary.md)
- [`pdf-export-status.md`](pdf-export-status.md)
- [`ai-insights-routing-status.md`](ai-insights-routing-status.md)
- [`test-status.md`](test-status.md)
- [`next-steps.md`](next-steps.md)
