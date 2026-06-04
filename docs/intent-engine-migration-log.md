# Intent Engine Migration Log

## Phase 1 — Complete (facades + `analysis.intent`)

- Added `backend/intent_engine/` facades delegating to `main.py` helpers.
- `analysis.intent` attached in `_build_unified_analysis_payload` (additive).
- Debug logs: `[intent_engine] detected_intent=…` (stdout).
- Tests: `backend/tests/intent_engine/test_golden_questions.py`
- Disable via env: `INTENT_ENGINE_DISABLE=1`

**Not changed:** chart pipeline order, frontend executive cards, PDF, UI.

## Correlation routing guard (Jun 2026)

- Added `backend/intent_engine/correlation_routing_guard.py` — `blocks_generic_viz_fallbacks`, `chart_selection_bucket_override`.
- `compute_visualization_for_question` sets `correlation_routing_locked` from `question_patterns.question_requests_correlation_routing` (no hardcoded metric names).
- Locked questions skip generic fallbacks; `_chart_selection_question_bucket` uses `relationship` when the guard applies.
- Tests: `tests/intent_engine/test_correlation_routing_guard.py` (+ existing `test_relationship_routing.py`).

### Run tests

```bash
cd backend
python -m unittest tests.intent_engine.test_golden_questions -v
```

### Verify API

After `/ask`, inspect `response.analysis.intent` for `primaryGoal`, `metric`, `dimension`, `support`, `derivedMetricCandidate`.
