# Open Issues

**Snapshot:** June 16, 2026 — remaining only (no fixed/historical items)

---

## Critical

| ID | Issue | Location |
|----|-------|----------|
| C1 | Global in-memory dataset — last upload wins per process | `backend/main.py` |
| C2 | AI narrative can diverge from chart values | `backend/main.py` narrative paths |
| C3 | Viz routing fallback can mislead if guards bypassed | `compute_visualization_for_question` |
| C4 | Missing API key → template answers while chart still renders | `backend/main.py` |

---

## High

| ID | Issue |
|----|-------|
| H1 | Plan tier client-spoofable (`localStorage`) |
| H2 | `/preview` ignores dashboard filters |
| H3 | Monolithic `page.tsx` + `main.py` — merge/conflict risk |
| H4 | AI quota debited before pipeline completes |
| H5 | In-memory usage tracker not durable across restarts/workers |
| H6 | PDF quota reserve ordering |
| H7 | No real authentication |
| H8 | Viz pipeline unguarded HTTP 500 |
| H9 | Continuation context without explicit topic reset |
| H10 | LLM narrative drift on column-meta follow-ups |

---

## Medium

| ID | Issue |
|----|-------|
| M1 | CSV formula injection not sanitized on preview API |
| M2 | No HTTP timeouts on Claude calls |
| M3 | Broad `except Exception` in hot paths |
| M4 | Inconsistent missing-dataset HTTP status |
| M5 | `full_dataset_analysis` plan flag not server-enforced |
| M6 | No HTTP integration tests for upload/ask/CORS |
| M7 | Filtered-dashboard refresh fails silently in UI |
| M8 | Some API calls omit SaaS headers |
| M9 | PDF heavy work on main thread (no cancel) |
| M10 | Conversation appendix unbounded in PDF |
| M11 | **Bulk performance work pending** (per `4247ef3` checkpoint) |
| M12 | Dual chart pipelines (Overview vs session) — drift risk on future edits |
| M13 | **Export/PDF product polish not finalized** |
| M14 | No automated E2E for showcase dataset grid/themes |

---

## Low

| ID | Issue |
|----|-------|
| L1 | `INTENT_ENGINE_DISABLE` can silently disable routing |
| L2 | No upload TTL / memory cleanup lifecycle |
| L3 | Unpinned `pandas>=2.0.0` in backend requirements |
| L4 | Mock "Switch to Paid" visible in production UI |
| L5 | Placeholder `support@example.com` in PDF footer |
| L6 | Accessibility: Ask textarea label association |
| L7 | Chart session keyed by title slice — collision risk |
| L8 | `parseAutoDashboardMiniCharts` hard-caps at 8 charts |

---

## Open decisions

1. Merge Overview plot builder with shared `ChartRenderer`?
2. Filter-aware Data Preview?
3. Backend-owned title polish vs frontend `canonical-chart-title`?
4. Production auth model?
5. PNG export quality pass scope vs PDF finalization order?

Full inventory: [`bug-inventory.md`](../../bug-inventory.md)
