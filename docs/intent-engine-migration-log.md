# Intent Engine Migration Log

## Phase 1 — Complete (facades + `analysis.intent`)

- Added `backend/intent_engine/` facades delegating to `main.py` helpers.
- `analysis.intent` attached in `_build_unified_analysis_payload` (additive).
- Debug logs: `[intent_engine] detected_intent=…` (stdout).
- Tests: `backend/tests/intent_engine/test_golden_questions.py`
- Disable via env: `INTENT_ENGINE_DISABLE=1`

**Not changed:** chart pipeline order, frontend executive cards, PDF, UI.

### Run tests

```bash
cd backend
python -m unittest tests.intent_engine.test_golden_questions -v
```

### Verify API

After `/ask`, inspect `response.analysis.intent` for `primaryGoal`, `metric`, `dimension`, `support`, `derivedMetricCandidate`.
