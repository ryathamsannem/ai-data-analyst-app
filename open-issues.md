# Open Issues

**Generated:** June 8, 2026  
**Scope:** Unresolved only — no completed/fixed items.  
**Full inventory:** [`bug-inventory.md`](bug-inventory.md)

---

## Critical

### C1 — Global in-memory dataset
- **Location:** `backend/main.py` — globals `df`, `dataset_profile`, `column_mapping`
- **Impact:** Last upload wins; concurrent users share/overwrite the same dataframe
- **Fix direction:** Per-session dataset store (Redis/S3/DB keyed to auth identity)

### C2 — AI narrative can diverge from chart
- **Location:** `backend/main.py` — `_generate_insight_narrative`, fallback paths
- **Impact:** Prose may paraphrase or invent figures if grounding block is thin
- **Fix direction:** Post-generation numeric validation vs `exact_result`; structured failure flag

### C3 — Chart routing fallback can mislead
- **Location:** `backend/main.py` — `compute_visualization_for_question` fallback chain
- **Impact:** Wrong chart type for relationship/correlation intents if guards bypassed
- **Fix direction:** Keep regression tests green; avoid reordering routing without test pack

### C4 — Missing API key → template-looking answers
- **Location:** `backend/main.py` — Anthropic client, narrative catch
- **Impact:** Chart renders; answer is fallback text when `ANTHROPIC_API_KEY` unset
- **Fix direction:** `/ready` fails in prod; structured error in `/ask` when narrative disabled

---

## High

### H1 — Plan tier client-spoofable
- **Location:** `backend/services/saas_context.py`, `frontend/lib/saas-session.ts`
- **Impact:** `localStorage` plan set to `paid` bypasses free limits
- **Fix direction:** Server-side tier from billing; ignore client header in production

### H2 — `/preview` ignores dashboard filters
- **Location:** `backend/main.py` — `POST /preview`
- **Impact:** Data Preview shows unfiltered rows while Insights/Overview use filtered cohort
- **Fix direction:** Filter-aware preview endpoint or explicit UI labeling

### H3 — Monolithic `page.tsx` + `main.py`
- **Impact:** High merge conflict risk; hard to trace routing order
- **Fix direction:** Incremental extraction when touching areas

### H4 — AI quota debited before pipeline completes
- **Location:** `backend/main.py` — `record_ai_question()` timing
- **Impact:** Failed `/ask` may still consume daily quota
- **Fix direction:** Reserve/commit pattern like PDF refund

### H5 — In-memory usage tracker not durable
- **Location:** `backend/services/usage_tracker.py`
- **Impact:** Restart clears counters; not shared across workers
- **Fix direction:** Redis/DB counters per authenticated user

### H6 — PDF quota reserve ordering
- **Location:** `frontend/app/page.tsx` — `downloadReport` flow
- **Impact:** Quota may reserve before full preflight validation (refund on failure exists)
- **Fix direction:** Reserve only after preflight passes

### H7 — No real authentication
- **Impact:** All routes open
- **Fix direction:** Auth middleware + identity on mutating routes

### H8 — Viz pipeline unguarded HTTP 500
- **Location:** `compute_visualization_for_question()` in `/ask`
- **Impact:** Unhandled exception → 500 instead of degraded response
- **Fix direction:** Bounded try/except; structured error payload

### H9 — Continuation context without explicit reset
- **Location:** `frontend/lib/ai-conversation-context.ts`
- **Impact:** New topic without Reset inherits prior thread context
- **Fix direction:** Topic-change detection or clearer Reset affordance

### H10 — LLM narrative drift on column-meta follow-ups
- **Impact:** Follow-up about columns may drift from chart
- **Fix direction:** Expand `test_follow_up_context.py` + browser QA checklist

### H11 — TypeScript strict errors in large files
- **Location:** `page.tsx`, `chart-renderer.tsx`, `selected-visualization.ts`
- **Impact:** `tsc --noEmit` may report errors; Vitest still passes
- **Fix direction:** Incremental type fixes

### H12 — Test discovery pitfall
- **Impact:** `unittest discover -s tests` shadows `intent_engine` package
- **Fix direction:** Always use `python run_tests.py -v`

---

## Medium

| ID | Issue |
|----|-------|
| M1 | CSV formula injection not sanitized on preview API |
| M2 | No HTTP timeouts on Claude calls |
| M3 | Broad `except Exception` in `main.py` hot paths |
| M4 | Inconsistent missing-dataset HTTP status across endpoints |
| M5 | `full_dataset_analysis` plan flag not enforced server-side |
| M6 | No HTTP integration tests for upload/ask/CORS |
| M7 | Filtered-dashboard refresh fails silently in UI |
| M8 | Some API calls omit SaaS headers |
| M9 | PDF heavy work on main thread (no cancel) |
| M10 | Conversation appendix unbounded in PDF |

---

## Low

| ID | Issue |
|----|-------|
| L1 | `INTENT_ENGINE_DISABLE` can silently disable routing |
| L2 | No upload TTL / memory cleanup lifecycle |
| L3 | Unpinned `pandas>=2.0.0` in requirements |
| L4 | Mock "Switch to Paid" visible in production UI |
| L5 | Placeholder `support@example.com` in PDF footer config |
| L6 | Accessibility: Ask textarea label association |

---

## Auto Dashboard — open items

| Issue | Severity | Notes |
|-------|----------|-------|
| No automated browser/E2E validation for showcase dataset | Medium | Grid, PNG, themes require manual QA |
| Backend emits raw verbose titles; polish is frontend-only | Low | API `title` ≠ displayed `canonicalTitle` |
| `parseAutoDashboardMiniCharts` hard-caps at 8 charts | Low | May truncate when backend returns more |
| Dual presentation pipelines (Overview vs shared) | Medium | Drift risk when changing chart behavior |
| `buildOverviewDashboardPlot` embedded in `page.tsx` | Medium | Extraction debt |
| Filtered-dashboard error surfacing | Medium | Overlaps M7 |
| Scatter discovery threshold (\|r\| ≥ 0.28) may exclude valid relationships | Low | Tuning question |
| Chart session keyed by title slice — collision risk | Low | Duplicate titles |

---

## Open questions (unresolved decisions)

1. Should backend own title polish instead of `polishAutoDashboardChartTitle` on frontend?
2. Should non-renderable charts be filtered server-side after filter application?
3. When (if ever) to merge Overview plot builder with shared `ChartRenderer`?
4. Should Data Preview become filter-aware?
5. Production auth model: OAuth vs API keys vs reverse-proxy auth?

---

## Deployment blockers (public multi-user)

1. C1 — session-isolated dataset storage
2. H7 — authentication
3. H1 + H5 — server-side plan tier and durable usage
4. Rate limiting on `/upload` and `/ask`
5. Structured logging and monitoring (see `deployment-readiness.md`)
