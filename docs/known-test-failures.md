# Known Test Failures & Runner Notes

**Updated:** June 2026

## Canonical full backend test command

From `backend/`:

```bash
python run_tests.py -v
```

Equivalent:

```bash
python -m unittest discover -s tests/intent_engine -v
```

**Last verified run:** 66 tests, **66 passed**, 0 failed (June 2026, after geographic viz + correlation guard fixes).

---

## Do not use: `python -m unittest discover -s tests`

### Symptom

Running discovery from `tests/` (parent of `tests/intent_engine/`) loads test modules as `intent_engine.test_*`, which **shadows** the real package `backend/intent_engine/`. Imports then fail or resolve incorrectly.

### Typical errors

| Error | Cause |
|-------|--------|
| `ModuleNotFoundError: No module named 'intent_engine.confidence_scoring'` | Test package named `intent_engine` masks backend package |
| `ModuleNotFoundError: No module named 'intent_engine.correlation_analysis'` | Same |
| `AssertionError: 'compare' != 'relationship'` in `test_correlated_with_bucket_is_relationship_not_compare` | `chart_selection_bucket_override` import failed silently; bucket fell back to legacy `compare` |

### Example failure (import shadowing)

```
ERROR: intent_engine.test_confidence_scoring (unittest.loader._FailedTest...)
ModuleNotFoundError: No module named 'intent_engine.confidence_scoring'
```

### Example failure (guard import swallowed)

```
FAIL: test_correlated_with_bucket_is_relationship_not_compare
AssertionError: 'compare' != 'relationship'
```

### Affected command

```bash
cd backend
python -m unittest discover -s tests -v   # WRONG — do not use for CI
```

### Not a product bug

This is a **test discovery layout issue**, not an application runtime defect. The app imports `intent_engine` from `backend/intent_engine/` correctly when the backend directory is on `sys.path`.

### Workaround

Use `python run_tests.py` or `discover -s tests/intent_engine` only.

---

## Resolved: `test_geographic_scope` label failures (fixed June 2026)

Previously failed with labels like `•1` / mojibake instead of `South`/`Mumbai` because geographic questions hit `build_smart_chart` scatter via `resolve_relationship_numeric_pair` even when correlation routing was false, and `_describe_aggregate_intent` returned `None` (no default metric when geographic `group_col` was set).

**Fix:** Default metric when `group_col` is set; restrict relationship pair resolution to correlation/relationship intent; clear scatter when `question_geographic_scope_level` is set.

**Tests:** `test_geographic_scope.TestGeographicScope` — all methods now pass in the full suite.

---

## No remaining known failing tests

When using the canonical commands above, the full `tests/intent_engine` suite should be green. If a failure appears after changes to `main.py` or `intent_engine/`, run:

```bash
cd backend
python -m unittest tests.intent_engine.test_relationship_routing tests.intent_engine.test_geographic_scope tests.intent_engine.test_correlation_routing_guard -v
```
