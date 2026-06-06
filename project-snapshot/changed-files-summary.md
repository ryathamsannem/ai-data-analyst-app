# Changed Files Summary

**Generated:** June 4, 2026  
**Branch:** `DEV`  
**Scope:** Modified and new files in current working tree (uncommitted unless noted).

Legend: **M** = modified, **N** = new (untracked)

---

## Backend

| Path | Status | Purpose | What changed | Category |
|------|--------|---------|--------------|----------|
| `backend/main.py` | M | FastAPI monolith: `/ask`, viz pipeline, conversation | `ParentAnalysisContextPayload`, `continuation_intent`, `rootQuestion`, expanded `resolve_follow_up_turn`, conv_out scope preservation | Backend, routing |
| `backend/intent_engine/confidence_scoring.py` | M | Insight confidence bands | Unambiguous ranking/compare bypasses 60-cap; sample penalty skip for clear rankings | Backend, routing |
| `backend/intent_engine/executive_ambiguous_intent.py` | M | Executive / risk phrase routing | Expanded risk phrases; executive risk context builder | Backend, routing |
| `backend/intent_engine/executive_lens.py` | M | Executive lens card labels | Primary/Secondary/Watch prioritization on risk cards | Backend, routing |
| `backend/intent_engine/routing_plan.py` | N | RoutingPlan dataclass / builder | Structured routing backbone for analysis payload | Backend, routing |
| `backend/intent_engine/routing_consistency.py` | N | Routing consistency helpers | Cross-check intent vs chart selection | Backend, routing |
| `backend/tests/intent_engine/test_confidence_scoring.py` | M | Confidence unit tests | High-band tests for ranking; sparse guardrails | Test |
| `backend/tests/intent_engine/test_executive_ambiguous_routing.py` | M | Executive routing tests | Risk-before-compare cases | Test |
| `backend/tests/intent_engine/test_executive_lens.py` | M | Executive lens tests | Prioritization labels | Test |
| `backend/tests/intent_engine/test_retail_analytics_regression.py` | M | Retail CSV regression | Confidence / routing assertions | Test |
| `backend/tests/intent_engine/test_routing_matrix.py` | N | Routing matrix golden cases | Broad intent × question coverage | Test |
| `backend/tests/intent_engine/test_routing_consistency.py` | N | Routing consistency tests | Plan vs chart alignment | Test |
| `backend/tests/test_follow_up_context.py` | N | Follow-up context tests | `resolve_follow_up_turn` meta/scoped follow-ups | Test |

---

## Frontend — app shell

| Path | Status | Purpose | What changed | Category |
|------|--------|---------|--------------|----------|
| `frontend/app/page.tsx` | M | Main SPA (~14k lines) | Follow-up payload wiring, chip handler, PDF export prep, conversation snapshot `rootQuestion` | UI, routing, PDF export |
| `frontend/app/pdf-report.ts` | M | jsPDF export renderer | Executive mode renders Data Quality / Conversation / Appendix when flagged; empty states | PDF export |

---

## Frontend — lib modules

| Path | Status | Purpose | What changed | Category |
|------|--------|---------|--------------|----------|
| `frontend/lib/ai-conversation-context.ts` | N | Follow-up parent context | `buildParentAnalysisContext`, `continuation_intent` helpers, meta chip list | Routing |
| `frontend/lib/ai-conversation-context.test.ts` | N | Unit tests for above | Parent context + chip append tests | Test |
| `frontend/lib/build-executive-pdf-input.ts` | N | PDF input assembler | Single source for Export tab + Insights export; include flag resolution | PDF export |
| `frontend/lib/build-executive-pdf-input.test.ts` | N | PDF input tests | Shape, executive advanced flags, preview | Test |
| `frontend/lib/pdf-executive-content.ts` | N | PDF lens content planner | Lens section mapping, opportunity/risk action copy, leader/lagger inference | PDF export |
| `frontend/lib/pdf-executive-content.test.ts` | N | PDF content tests | Lens mapping, opportunity upside rewrite | Test |
| `frontend/lib/pdf-export-sections.test.ts` | N | PDF section gate regression | Asserts no `analystPdf &&` gate on optional sections | Test |
| `frontend/lib/pdf-enterprise-style.ts` | M | PDF tokens / empty states | Added `conversationThread` empty state | PDF export |
| `frontend/lib/routing-plan.ts` | N | Frontend RoutingPlan mirror | Parse plan from analysis; follow-up lens helper | Routing |
| `frontend/lib/routing-plan.test.ts` | N | Routing plan tests | Lens from routing | Test |
| `frontend/lib/ai-follow-up-suggestions.ts` | M | Follow-up chip builders | Dimension/metric phrasing; executive lens chips | UI, routing |
| `frontend/lib/executive-insight-ranking.ts` | M | Executive insight cards | Optional `kind` on cards for PDF lens | PDF export, routing |

---

## Files not in git status but referenced in session

These may exist from earlier work or docs only — verify before relying:

- `docs/project-snapshot.md` (older handoff in `docs/`)
- `docs/file-map.md`
- `DYNAMIC_ANALYTICS_INTENT_ENGINE.md`

---

## Change category totals (working tree)

| Category | Count (approx.) |
|----------|-----------------|
| Backend logic | 6 |
| Frontend UI (`page.tsx`, pdf-report) | 2 |
| PDF export lib | 5 |
| Routing / follow-up lib | 3 |
| Tests | 10 |
