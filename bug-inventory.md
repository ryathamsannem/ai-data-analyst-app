# Bug Inventory

**Generated:** June 8, 2026  
**Scope:** Full-repo — frontend, backend, export, deployment  
**Severity:** Critical → Low

---

## Summary

| Severity | Count | Deployment impact |
|----------|-------|-------------------|
| Critical | 4 | Block public multi-user |
| High | 12 | Pilot OK with awareness |
| Medium | 14 | Edge cases / debt |
| Low | 10 | Polish / dev ergonomics |

---

## Critical (open)

### C1 — Global in-memory dataset

| Field | Detail |
|-------|--------|
| **Location** | `backend/main.py` — globals `df`, `dataset_profile`, `column_mapping` |
| **Symptom** | Last upload wins; concurrent users share/overwrite same dataframe |
| **Reproduction** | Two browser sessions → User A uploads → User B uploads → User A asks → gets B's data |
| **Status** | Open — by design for MVP |
| **Fix** | Per-session dataset store (Redis/S3/DB keyed to auth identity) |

### C2 — AI narrative can diverge from chart

| Field | Detail |
|-------|--------|
| **Location** | `backend/main.py` — `_generate_insight_narrative`, fallback paths |
| **Symptom** | Prose may paraphrase or invent figures if grounding block thin |
| **Reproduction** | Ask ambiguous question; compare answer numbers to chart chips |
| **Status** | Open — mitigated by prompts + frontend viz gates |
| **Fix** | Post-generation numeric validation vs `exact_result`; structured failure flag |

### C3 — Chart routing fallback can mislead

| Field | Detail |
|-------|--------|
| **Location** | `backend/main.py` — `compute_visualization_for_question` fallback chain |
| **Symptom** | Wrong chart type for relationship/correlation intents |
| **Reproduction** | Regression questions in `test_relationship_routing.py` if gate bypassed |
| **Status** | Mitigated — correlation pack runs first (Jun 2026) |
| **Fix** | Keep regression tests green; avoid reordering routing without test pack |

### C4 — Missing API key → fake-looking answers

| Field | Detail |
|-------|--------|
| **Location** | `backend/main.py` — Anthropic client, narrative catch |
| **Symptom** | Chart renders; answer is template fallback text |
| **Reproduction** | Unset `ANTHROPIC_API_KEY` → POST `/ask` |
| **Status** | Open |
| **Fix** | `/ready` fails in prod; structured error in `/ask` when narrative disabled |

---

## High (open)

### H1 — Plan tier client-spoofable

| Field | Detail |
|-------|--------|
| **Location** | `backend/services/saas_context.py`, `frontend/lib/saas-session.ts` |
| **Symptom** | Set `localStorage` plan to `paid` → bypass free limits |
| **Status** | Open — mock SaaS only |
| **Fix** | Server-side tier from billing; ignore client header in prod |

### H2 — `/preview` ignores dashboard filters

| Field | Detail |
|-------|--------|
| **Location** | `backend/main.py` — `POST /preview` |
| **Symptom** | Data Preview shows unfiltered rows; Insights uses filtered cohort |
| **Status** | Open — documented intentional |
| **Fix** | Filter-aware preview endpoint or UI label clarifying scope |

### H3 — Monolithic `page.tsx` + `main.py`

| Field | Detail |
|-------|--------|
| **Symptom** | High merge conflict risk; hard to trace routing order |
| **Status** | Open — technical debt |
| **Fix** | Incremental extraction when touching areas; no big-bang refactor |

### H4 — AI quota debited before pipeline completes

| Field | Detail |
|-------|--------|
| **Location** | `backend/main.py` — `record_ai_question()` timing |
| **Symptom** | Failed `/ask` may still consume daily quota |
| **Status** | Open |
| **Fix** | Reserve/commit pattern like PDF refund |

### H5 — In-memory usage tracker not durable

| Field | Detail |
|-------|--------|
| **Location** | `backend/services/usage_tracker.py` |
| **Symptom** | Restart clears counters; not shared across workers |
| **Status** | Open |
| **Fix** | Redis/DB counters per authenticated user |

### H6 — PDF quota reserved before full validation (partially fixed)

| Field | Detail |
|-------|--------|
| **Location** | `frontend/app/page.tsx` — `downloadReport` flow |
| **Symptom** | Early reserve before contract check (historical) |
| **Status** | 🟡 Refund on failure implemented; verify ordering |
| **Fix** | Reserve only after preflight passes |

### H7 — No real authentication

| Field | Detail |
|-------|--------|
| **Location** | All routes open |
| **Status** | Open |
| **Fix** | Auth middleware + identity on all mutating routes |

### H8 — Viz pipeline unguarded HTTP 500

| Field | Detail |
|-------|--------|
| **Location** | `compute_visualization_for_question()` in `/ask` |
| **Symptom** | Unhandled exception → 500 instead of degraded response |
| **Status** | Open |
| **Fix** | Bounded try/except; structured error payload |

### H9 — Continuation context without explicit reset

| Field | Detail |
|-------|--------|
| **Location** | `frontend/lib/ai-conversation-context.ts` |
| **Symptom** | New topic without Reset inherits prior thread context |
| **Status** | Open — by design until Reset |
| **Fix** | UX: topic-change detection or clearer Reset affordance |

### H10 — LLM narrative drift on column-meta follow-ups

| Field | Detail |
|-------|--------|
| **Symptom** | Follow-up about columns may drift from chart |
| **Status** | Needs manual E2E QA |
| **Fix** | Expand `test_follow_up_context.py` + browser QA checklist |

### H11 — TypeScript strict errors in large files

| Field | Detail |
|-------|--------|
| **Location** | `page.tsx`, `chart-renderer.tsx`, `selected-visualization.ts` |
| **Symptom** | `tsc --noEmit` may report errors; Vitest still passes |
| **Status** | Open — low urgency |
| **Fix** | Incremental type fixes |

### H12 — Test discovery pitfall

| Field | Detail |
|-------|--------|
| **Symptom** | `unittest discover -s tests` shadows `intent_engine` package |
| **Status** | Documented |
| **Fix** | Always use `python run_tests.py -v` |

---

## Medium (selected)

| ID | Issue | Status |
|----|-------|--------|
| M1 | CSV formula injection not sanitized on preview API | Open |
| M2 | No HTTP timeouts on Claude calls | Open |
| M3 | Broad `except Exception` in `main.py` hot paths | Open |
| M4 | Inconsistent missing-dataset HTTP status across endpoints | Open |
| M5 | `full_dataset_analysis` plan flag not enforced server-side | Open |
| M6 | No HTTP integration tests for upload/ask/CORS | Open |
| M7 | Filtered-dashboard refresh fails silently | Open |
| M8 | Some API calls omit SaaS headers | Open |
| M9 | PDF heavy work on main thread (no cancel) | Open |
| M10 | Conversation appendix unbounded in PDF | Open |

---

## Low (selected)

| ID | Issue | Status |
|----|-------|--------|
| L1 | `INTENT_ENGINE_DISABLE` can silently disable routing | Open |
| L2 | No upload TTL / memory cleanup lifecycle | Open |
| L3 | Unpinned `pandas>=2.0.0` in requirements | Open |
| L4 | Mock "Switch to Paid" visible in production UI | Open |
| L5 | Placeholder `support@example.com` in PDF footer config | Open |
| L6 | Accessibility: Ask textarea label association | Open |

---

## Recently resolved (Jun 2026)

| Issue | Fix location |
|-------|--------------|
| PNG chart flicker on export | Offscreen `ChartPngOffscreenHost` — visible chart unchanged |
| PNG line chart disconnected points | `pngCaptureMode`, animation disabled, stable SVG wait |
| Rate gap shown as `%` not `pp` | `formatMetricSpreadGap`, `metric-executive-percent.test.ts` |
| Revenue gap missing `$` | `formatMetricSpreadGap` currency path |
| Horizontal bar double-counted margins | `chart-axis-layout.ts` |
| Rate warning too dominant | `chart-quality-warnings.ts`, muted CSS + PNG header |
| PNG export card framing | `chart-png-capture.ts` composite |
| PDF advanced sections gated on analyst mode only | `pdf-report.ts` |
| Ranking confidence stuck at Medium | `confidence_scoring.py` |
| Follow-up context payload missing | `ai-conversation-context.ts`, `main.py` |

---

## Recommended fix priority (next sprint)

1. **C1 + H7 + H1 + H5** — if moving beyond pilot (auth + session storage + server limits)
2. **H10 + manual QA** — follow-up chains on retail regression CSV
3. **H4 + H6** — quota reserve/commit consistency
4. **M6** — FastAPI `TestClient` smoke tests
5. **H3** — extract only modules you are actively changing
