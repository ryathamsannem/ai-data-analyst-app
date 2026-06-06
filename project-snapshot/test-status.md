# Test Status

**Generated:** June 4, 2026  
**Branch:** `DEV`

---

## Backend tests

### Commands run this session

```bash
cd backend
python -m pytest tests/intent_engine/ tests/test_follow_up_context.py -q --tb=no
```

### Result

```
134 passed in ~28–35s
```

Includes:

- Full `tests/intent_engine/` suite (129+ tests)
- `tests/test_follow_up_context.py` (5 tests) — follow-up context / meta questions

### Alternate command (legacy runner)

```bash
cd backend
python run_tests.py -v
```

**Note:** `docs/known-test-failures.md` still references **66 passed** — outdated. Do not use `python -m unittest discover -s tests` (package shadowing).

### Backend test files added/modified (uncommitted)

| File | Tests |
|------|-------|
| `tests/test_follow_up_context.py` | 5 |
| `tests/intent_engine/test_routing_matrix.py` | matrix |
| `tests/intent_engine/test_routing_consistency.py` | consistency |
| `tests/intent_engine/test_confidence_scoring.py` | +ranking high band |
| `tests/intent_engine/test_executive_ambiguous_routing.py` | risk routing |
| `tests/intent_engine/test_retail_analytics_regression.py` | retail CSV |

---

## Frontend tests

### Command run this session

```bash
cd frontend
npm run test
```

### Result

```
Test Files  14 passed (14)
Tests       70 passed (70)
Duration    ~8s
```

### Notable suites

| File | Tests |
|------|-------|
| `lib/pdf-executive-content.test.ts` | Lens / opportunity wording |
| `lib/ai-conversation-context.test.ts` | Follow-up parent context |
| `lib/build-executive-pdf-input.test.ts` | PDF input + executive flags |
| `lib/pdf-export-sections.test.ts` | No analyst-only section gate |
| `lib/routing-plan.test.ts` | Routing plan parse |
| `lib/ai-follow-up-suggestions.test.ts` | Chip generation |

---

## TypeScript check

### Command

```bash
cd frontend
npx tsc --noEmit
```

### Result

**Failed — 11 errors** (pre-existing / not introduced by snapshot session)

| Area | Errors |
|------|--------|
| `app/components/home/chart-renderer.tsx` | Recharts `LabelContentType` / `RenderableText` null vs props (multiple lines ~814, 934) |
| `app/page.tsx` | `AlignedAnalysisContext` missing `intent`, `dimensionRedirectHandled`, `requestedDimensionMissing` (~8063–8068) |
| `lib/selected-visualization.ts` | `humanizeColumnName` not found (~290, 298) |

Vitest passes despite `tsc` failures — types not enforced in test runner.

---

## Pre-existing failures

| Check | Status |
|-------|--------|
| Backend pytest (canonical) | **0 failures** |
| Frontend vitest | **0 failures** |
| TypeScript `tsc --noEmit` | **11 errors** (see above) |
| E2E / Playwright | Not present in repo |
| PDF binary snapshot tests | Not present |

---

## Manual test scenarios

### Completed (via automated tests / code review)

- [x] Follow-up resolver unit tests (meta evidence, columns, calculations, why-highest)
- [x] Parent analysis context payload shape (frontend unit)
- [x] PDF include flags pass through in executive mode (unit)
- [x] PDF section gate regression (no `analystPdf &&` on optional sections)
- [x] Ranking confidence high band (backend unit)
- [x] Opportunity lens upside rewrite (frontend unit)

### Pending (browser / PDF download)

- [ ] **Follow-up chain (5 steps)** on `retail_analytics_regression.csv`
- [ ] **PDF all checkboxes** — verify 7 sections in downloaded PDF
- [ ] Executive-risk questions route to risk lens (browser)
- [ ] Reset conversation clears thread; new question is fresh
- [ ] PDF chart capture with insight chart visible
- [ ] Compare executive vs analyst PDF side-by-side

---

## Recommended test commands for handoff

```bash
# Backend full intent + follow-up
cd backend && python -m pytest tests/intent_engine/ tests/test_follow_up_context.py -v

# Frontend
cd frontend && npm run test

# TypeScript (expect 11 errors until fixed)
cd frontend && npx tsc --noEmit
```
