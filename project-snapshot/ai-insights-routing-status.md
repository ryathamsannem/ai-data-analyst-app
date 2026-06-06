# AI Insights Routing & Follow-Up Status

**Generated:** June 4, 2026

---

## RoutingPlan implementation

### Backend

| Component | Path | Notes |
|-----------|------|-------|
| Routing plan builder | `backend/intent_engine/routing_plan.py` | Structured plan attached to analysis |
| Consistency checks | `backend/intent_engine/routing_consistency.py` | Intent vs chart alignment |
| Pipeline integration | `backend/main.py` | `compute_visualization_for_question` → unified analysis payload |
| Executive ambiguous routing | `backend/intent_engine/executive_ambiguous_intent.py` | Risk/strategy phrases before generic ranking |
| Executive lens | `backend/intent_engine/executive_lens.py` | Risk/opportunity/strategy cards + prioritization |
| Confidence | `backend/intent_engine/confidence_scoring.py` | Component model; ranking high-band fix |

Analysis payload includes `routingPlan` (camelCase in JSON) with: `intent`, `executiveLens`, metric/dimension columns, chart type, unsupported reason, etc.

### Frontend

| Component | Path | Notes |
|-----------|------|-------|
| Parser | `frontend/lib/routing-plan.ts` | `parseRoutingPlan()`, `followUpLensFromRouting()` |
| Consumption | `frontend/app/page.tsx` | Follow-up chips, aligned analysis, debug panel |
| Tests | `frontend/lib/routing-plan.test.ts` | Lens preference from plan |

### Test matrix

| Suite | Path | Status (June 4, 2026) |
|-------|------|------------------------|
| Routing matrix | `backend/tests/intent_engine/test_routing_matrix.py` | Present (untracked) |
| Routing consistency | `backend/tests/intent_engine/test_routing_consistency.py` | Present (untracked) |
| Retail regression | `backend/tests/intent_engine/test_retail_analytics_regression.py` | Modified |
| Golden questions | `backend/tests/intent_engine/test_golden_questions.py` | In full suite |
| Executive ambiguous | `backend/tests/intent_engine/test_executive_ambiguous_routing.py` | Modified |

Run: `cd backend && python -m pytest tests/intent_engine/ -q`

---

## Follow-up question behavior

### Intended flow

1. User asks base question (e.g. *Which city contributes most revenue?*).
2. Backend returns `conversation_context` + `conversation_meta.followUpDetected`.
3. Client stores `conversationSnapshot` (enriched with `lastAiAnswer`, labels, mapping).
4. Follow-up chip or manual submit sends:
   - `conversation_context` (prior turn snapshot)
   - `parent_analysis_context` (metric, dimension, chain, answer, routing)
   - `continuation_intent: true` when prior analysis exists
5. Backend `resolve_follow_up_turn()`:
   - Scoped meta/explanation → `effective_question` = **root question** (same pandas scope)
   - Narrow refinements → concatenated prior + chip text
   - Builds `ai_context_block` for Claude prompt

### Meta follow-up chips (appended to suggestions)

From `frontend/lib/ai-conversation-context.ts`:

- *What evidence supports this conclusion?*
- *Which columns were used for this analysis?*
- *Show the calculations behind this answer.*

Chip click: `askAI(chip, { fromFollowUpChip: true })`.

### Thread preservation rules

- Context cleared only on **Reset conversation** (`resetAiConversation` in `page.tsx`).
- Insight chart thread **not** cleared when `continuationIntent` is true.
- `rootQuestion` preserved across scoped follow-ups in backend `conv_out`.

---

## Known issues / fix status

| Issue | Status | Fix location |
|-------|--------|--------------|
| Meta follow-ups treated as new questions | **Fixed in code** | `_THREAD_META_FOLLOW_UP` expanded in `main.py` |
| "Why is Mumbai highest?" concatenated wrong intent | **Fixed** | `_is_explanation_follow_up` entity patterns |
| Second-level follow-up loses context | **Fixed in code** | `continuation_intent` + `parent_analysis_context` |
| Chip click clears chart lineage | **Fixed** | `askAI` guards on `continuationIntent` |
| Q4 invents columns (market penetration, etc.) | **Mitigated** | Prompt guard in `resolve_follow_up_turn`; **E2E not verified** |
| Manual 5-step retail regression | **Pending QA** | User acceptance scenario |

---

## Files involved — routing

| File | Role |
|------|------|
| `backend/main.py` | `/ask`, `resolve_follow_up_turn`, `QuestionRequest` |
| `backend/intent_engine/*.py` | Intent detection, routing plan, confidence |
| `frontend/app/page.tsx` | Ask flow, snapshot, chips, aligned analysis |
| `frontend/lib/ai-follow-up-suggestions.ts` | Chip text generation |
| `frontend/lib/semantic-metric-engine.ts` | Context for chips |
| `frontend/lib/ai-conversation-context.ts` | Parent context payload |
| `backend/tests/test_follow_up_context.py` | Unit tests for follow-up resolver |

---

## Confidence scoring (routing-adjacent)

Recent fix: simple ranking (36 rows, 4 groups, resolved metric) → **High** instead of Moderate cap at 60.

File: `backend/intent_engine/confidence_scoring.py`  
Tests: `backend/tests/intent_engine/test_confidence_scoring.py`

---

## Debug / observability

- Intent debug panel: `frontend/app/components/intent-engine-debug-panel.tsx` (when enabled)
- Console: `logAnalysisIntentToConsole` in ask handler
- Provenance UI: "How this insight was generated" accordion in AI Insights
