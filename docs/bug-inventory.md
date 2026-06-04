# Bug Inventory Report

**Generated:** June 2026  
**Scope:** Full-repo scan (frontend, backend, tests, baseline docs)  
**Companion:** [`project-snapshot.md`](project-snapshot.md) · [`file-map.md`](file-map.md)

Severity scale:

| Rank | Meaning |
|------|---------|
| **Critical** | Data wrong, security/session integrity, or trust-breaking AI/chart behavior in production paths |
| **High** | Frequent user-visible defects, deployment blockers, or high regression risk |
| **Medium** | Correctness edge cases, maintainability debt, or partial feature gaps |
| **Low** | Polish, dev ergonomics, or documented intentional differences |

---

## Summary

| Rank | Count (approx.) |
|------|-----------------|
| Critical | 4 |
| High | 14 |
| Medium | 18 |
| Low | 12 |

---

## Critical

### C1 — Global in-memory dataset (`df`) with no concurrency control

| Field | Detail |
|-------|--------|
| **Location** | `backend/main.py` — module globals `df`, `dataset_profile`, `column_mapping`, … |
| **Symptom** | Last upload wins; parallel `/ask` or `/upload` from multiple users/sessions can read or mutate the same dataframe |
| **Root cause** | Single-process session model; no per-request isolation, locks, or tenant IDs |
| **Risk** | Wrong answers for User B while User A uploads; possible data leakage in shared deployments |

### C2 — AI narrative can diverge from chart when grounding is thin

| Field | Detail |
|-------|--------|
| **Location** | `backend/main.py` — `_generate_insight_narrative`, `/ask` prompt assembly; fallback `_claude_narrative_fallback_answer` |
| **Symptom** | Claude may still paraphrase or invent figures if `exact_result` is empty, stale, or misaligned with `visualization` |
| **Root cause** | LLM layer is not mechanically constrained to structured output; prompts rely on discipline + blocks that may be missing on fallback paths |
| **Mitigation present** | Prompt rules: “authoritative chart-values block”, “Ground every numeric claim”; gates on frontend viz |
| **Residual risk** | Users trust prose over chips; partial viz + valid-looking answer |

### C3 — Chart routing fallback chain can still produce misleading charts

| Field | Detail |
|-------|--------|
| **Location** | `backend/main.py` — `compute_visualization_for_question` → `analyze_data`, `build_smart_chart`, `_deterministic_viz_last_resort` |
| **Symptom** | Non-relationship questions (or regressions in correlation gate) can get category bars that do not match correlation/relationship intent |
| **Root cause** | Multiple fallback stages after primary routing; `analyze_data` is large and keyword-driven |
| **Mitigation (Jun 2026)** | `_try_correlation_routing_pack` runs first; missing columns suppress auto charts |
| **Regression risk** | Any change that skips early correlation gate reopens bar-by-zone bugs (see tests in `test_relationship_routing.py`) |

### C4 — Missing `ANTHROPIC_API_KEY` yields non-analytic fallback copy

| Field | Detail |
|-------|--------|
| **Location** | `backend/main.py` — `client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))`, narrative `except` path |
| **Symptom** | `/ask` may return template fallback text while visualization still renders — feels like an “answer” without real analysis |
| **Root cause** | API key optional at runtime; no hard fail before viz pipeline |
| **Risk** | Demo/production misconfiguration looks like product output |

---

## High

### H1 — Hardcoded backend URL `http://localhost:8000`

| Field | Detail |
|-------|--------|
| **Location** | `frontend/app/page.tsx` — all `fetch()` calls (`/upload`, `/preview`, `/ask`, …) |
| **Root cause** | No `NEXT_PUBLIC_API_BASE` (or similar) used consistently |
| **Impact** | Production/staging deploy requires code change or proxy rewrite |

### H2 — `/preview` does not apply dashboard filters

| Field | Detail |
|-------|--------|
| **Location** | `backend/main.py` — `@app.post("/preview")` uses global `df.head(limit)` only |
| **Documented** | `PROJECT_ARCHITECTURE_SUMMARY.md`, `DATA_PREVIEW_STABLE_SUMMARY.md` |
| **Symptom** | Data Preview search/sort/pagination on **unfiltered** slice while Insights use filtered cohort |
| **Root cause** | Preview endpoint designed as raw row window, not cohort-aware |

### H3 — Monolithic `main.py` (~14k lines) + monolithic `page.tsx` (~14k lines)

| Field | Detail |
|-------|--------|
| **Root cause** | Historical single-file growth |
| **Impact** | High merge conflict risk; chart routing + prompts + upload intertwined; intent_engine only partially extracted |
| **Weakness** | Hard to reason about ordering of routing branches |

### H4 — `intent_engine.legacy` ↔ `main.py` circular delegation

| Field | Detail |
|-------|--------|
| **Location** | `backend/intent_engine/legacy.py` — `import main as legacy_main` |
| **Root cause** | Phase 1 migration facades call back into monolith |
| **Impact** | Import-order surprises, difficult unit testing, duplicated “source of truth” for intent helpers |

### H5 — Post-routing chart builders can override relationship intent

| Field | Detail |
|-------|--------|
| **Location** | `backend/main.py` — `build_smart_chart`, `_deterministic_viz_last_resort` (lines ~12712–12767) |
| **Condition** | `not chart_data and not suppress_auto_charts` |
| **Risk** | If `suppress_auto_charts` not set on a relationship miss, unrelated bar/scatter totals appear |
| **Related** | `scatterFallback` still builds **bar totals** with warning string (profit-margin path disabled for correlation routing only) |

### H6 — PDF chart capture fragility (Canvg + html2canvas + Tailwind v4)

| Field | Detail |
|-------|--------|
| **Location** | `frontend/app/pdf-report.ts`, `frontend/lib/chart-png-capture.ts` |
| **Root cause** | html2canvas cannot parse `color-mix()` / modern CSS; Canvg path depends on SVG structure; **canvg not a direct `package.json` dependency** (transitive via lockfile) |
| **Symptom** | `PDF_EMPTY_STATES.chartCapture` / `chartEmbedFailed` branches; blank or soft charts in PDF |
| **Status** | Export **not finalized** per `AGENTS.md`, `PDF_EXPORT_STABLE_BASELINE.md` |

### H7 — PDF export validation is narrow

| Field | Detail |
|-------|--------|
| **Location** | `frontend/lib/selected-visualization.ts` — `validateExportMatchesContract` |
| **Checks** | Chart id, chartType, trend dimension heuristics only |
| **Gap** | No verification that exported PNG matches current question, scatter axes, or `relationshipInsights` |

### H8 — CORS restricted to `http://localhost:3000`

| Field | Detail |
|-------|--------|
| **Location** | `backend/main.py` — `CORSMiddleware(allow_origins=["http://localhost:3000"])` |
| **Impact** | Custom dev ports or deployed frontend origins fail unless updated |

### H9 — Frontend/client Pearson recompute for scatter executive cards

| Field | Detail |
|-------|--------|
| **Location** | `frontend/app/page.tsx` — `buildExecutiveVizInsights` scatter branch (recomputes Pearson from plotted rows) |
| **Mitigation** | `insightExecutiveVizInsights` prefers `buildRelationshipExecutiveCards` when `relationshipInsights` present |
| **Risk** | If API omits `relationshipInsights`, UI coefficient can **differ** from backend `exact_result` / LLM anchor |

### H10 — Intent metadata vs log bucket mismatch

| Field | Detail |
|-------|--------|
| **Location** | Viz debug logs `detected_intent=compare` while `analysis.intent.primaryGoal=relationship` |
| **Root cause** | `chart_selection_question_bucket` legacy string not aligned with `resolve_analysis_intent` |
| **Impact** | Debugging confusion; possible wrong frontend branches if code keys off bucket instead of `primaryGoal` |

### H11 — No automated E2E / visual regression tests

| Field | Detail |
|-------|--------|
| **Coverage** | `backend/tests/intent_engine/*` unit tests only |
| **Gap** | No Playwright/Cypress for Insights gates, PDF download, chart render |
| **Risk** | UI regressions in `page.tsx` undetected until manual QA |

### H12 — `/ask` temporarily mutates global `df` (restored in `finally`)

| Field | Detail |
|-------|--------|
| **Location** | `backend/main.py` — `saved_df` / `df = final_df` / `finally: df = saved_df` |
| **Root cause** | Reuses globals instead of passing `DataFrame` through pipeline |
| **Risk** | Concurrent requests during `ask` can see filtered slice or partial state despite restore |

### H13 — Export/PDF product phase incomplete

| Field | Detail |
|-------|--------|
| **Documented** | `AGENTS.md` §8, `UI_BASELINE_RULES.md` §13 |
| **Issues** | WYSIWYG parity, lazy-load debt (“static import — known debt”), section polish |
| **Risk** | Regressions in capture refs (`chartCaptureInsightRef`, `chartCaptureSessionRef`) |

### H14 — Dual chart presentation pipelines (Overview vs session)

| Field | Detail |
|-------|--------|
| **Location** | `computeOverviewDashboardChartPresentation` in `page.tsx` vs `computeFinalChartPresentation` in `lib/` |
| **Root cause** | Overview mini charts (360px) intentionally separate |
| **Risk** | Kind/orientation divergence between Overview and Insights for same metric |

---

## Medium

### M1 — Broad `except Exception: pass` in intent and viz paths

| Locations | `backend/main.py` (many), `intent_engine/resolve_analysis_intent.py`, `correlation_analysis.py`, geographic_scope, multi_metric |
| **Risk** | Silent degradation to fallbacks without structured error surfaced to UI |

### M2 — `analyze_data()` still a large catch-all router

| **Location** | `backend/main.py` ~8867+ |
| **Risk** | New question types accidentally hit legacy keyword branches |

### M3 — Hardcoded dimension tokens in compare/routing regexes

| Examples | `_question_requests_two_metric_compare` — `by (region|product|category|…)`; `question_patterns._BY_DIMENSION_RE` |
| **Risk** | Datasets using `zone`, `segment`, `city` only work via inference fallbacks, not explicit compare-by phrases |

### M4 — Hardcoded semantic role keys (not dataset values)

| **Location** | Column mapping roles: `product`, `sales`, `region`, `customer`, `date`, `profit` |
| **Note** | Schema-driven for columns, but role vocabulary is fixed — acceptable if documented |

### M5 — Growth intent regex matches metric name “growth rate”

| **Location** | `_GROWTH_INTENT_RE` in `main.py` |
| **Mitigation** | `_question_requests_correlation_routing` bypass; `resolve_analysis_intent` exempts `relationship` from growth unsupported flip |
| **Residual** | Logs may still assess growth metadata on correlation questions |

### M6 — Frontend confidence `groupPoints` not scatter-aware without API score

| **Location** | `frontend/lib/insight-confidence.ts` — `groupPoints(pts, rows)` treats each scatter point as a “group” |
| **Mitigation** | Backend usually sends `insightConfidenceScore`; client overwrites when present |
| **Risk** | Stale client-only recompute shows LOW score for valid scatter (n points = high group count, low rpg) |

### M7 — Duplicate executive insight logic (backend + frontend)

| Backend | `executive_insight_ranking.py` → `rankedExecutiveInsights` |
| Frontend | `executive-insight-ranking.ts`, `buildExecutiveVizInsights`, `insight-card-titles.ts` / `insight_card_titles.py` |
| **Risk** | Title/card drift between API ranking and client recomputation |

### M8 — Duplicate Pearson / correlation computation (triple path)

| Backend | `correlation_analysis.compute_bivariate_correlations` |
| Frontend | `buildExecutiveVizInsights` scatter branch; `relationship-visualization.ts` |
| **Risk** | Rounding or sample subset (450 row cap) vs full cohort mismatch |

### M9 — `alignment_repaired` and `partial_visualization_warning` paths

| **Location** | Viz pipeline sets flags when metric/dimension repaired or fallback used |
| **Symptom** | User sees caution pills; confidence penalized — correct but indicates fragile alignment |
| **Root cause** | Separate `intent_debug` vs `smart_trace` metric columns |

### M10 — `INTENT_ENGINE_DISABLE` env escape hatch

| **Location** | `intent_engine/attach.py` |
| **Nature** | Temporary operational flag; disables `analysis.intent` attachment |
| **Risk** | Production mis-set env loses structured intent metadata |

### M11 — Data Preview limited to fetched row window

| **Location** | `fetchPreviewRows` → `/preview` cap 10k |
| **Symptom** | “All rows” mode still bounded; search not over full million-row file |
| **Root cause** | Client-side table design |

### M12 — Scatter row cap 450 in relationship builder

| **Location** | `backend/main.py` — `_try_build_relationship_scatter_visualization` `.head(450)` |
| **Risk** | Pearson on chart points vs full cohort if narrative uses full `df` stats — verify `relationshipInsights` uses same slice |

### M13 — `primaryGoal` / support validation edge cases

| **Location** | `validate_support.py`, `resolve_analysis_intent.py` |
| **Example** | Geographic single-period → `unsupported_analysis` for trend; correlation now `relationship` + supported |
| **Risk** | New intents need explicit support rules |

### M14 — Follow-up and conversation state complexity

| **Location** | `page.tsx` conversation snapshot; `main.py` follow-up plan |
| **Risk** | Stale chart pinned (`lastInsightChartId`); gate `insightChartMatchesCurrentQuestion` must stay in sync |

### M15 — No `npm test` / vitest in frontend CI

| **Location** | `ai-follow-up-suggestions.test.ts` exists; `tsconfig` excludes `*.test.ts` |
| **Risk** | Follow-up regressions not run in standard scripts |

### M16 — Filtered dashboard docstring vs preview behavior

| **Location** | `filtered-dashboard` recomputes preview in some paths (comment ~5102); `/preview` endpoint itself unfiltered |
| **Risk** | Documentation/implementation inconsistency for integrators |

### M17 — Profit-margin scatter fallback still exists for non-correlation paths

| **Location** | `_try_build_relationship_scatter_visualization` margin bar fallback |
| **Mitigation** | Skipped when `_question_requests_correlation_routing` |
| **Risk** | Profit+revenue questions without explicit correlation wording may still bar-fallback |

### M18 — Ranked executive cards (“Revenue Share”, “Revenue Gap”) on wrong chart types

| **Mitigation** | Scatter uses `buildRelationshipExecutiveCards` first; ranked API skipped when `chartType === scatter` in backend |
| **Risk** | `buildExecutiveVizInsights` still implements gap/share for bar; mis-ordered memo in `page.tsx` could resurface generic cards |

---

## Low

### L1 — Deprecated aliases in `ai-insights-ui.ts`

| **Nature** | `@deprecated` exports kept for import stability |

### L2 — Codegen scripts in `frontend/scripts/`

| Files | `gen-chart-renderer.py`, `gen-filter-panel.py`, `patch-download-report-ref.py` |
| **Nature** | One-off generators; not part of build — potential stale generated fragments |

### L3 — `project_backups/` directory

| **Nature** | Historical snapshots; not runtime — confusion for agents |

### L4 — Overview vs Data Preview filename presentation

| **Nature** | Intentional truncate vs wrap (documented pending item) |

### L5 — FastAPI `@app.on_event("startup")` deprecation

| **Location** | `backend/main.py` |
| **Nature** | DeprecationWarning in tests; migrate to lifespan handlers |

### L6 — `dev-render-count.ts` dev-only utility

| **Nature** | Inert in production builds |

### L7 — Verbose stdout viz logging (`[viz]`, `[viz_debug]`)

| **Nature** | Noise in production logs; no structured log level |

### L8 — Golden tests use fixture-specific labels (South, East, …)

| **Location** | `backend/tests/intent_engine/*` |
| **Note** | Acceptable in tests only — not production hardcoding |

### L9 — `final-chart-presentation.ts` deprecated `timeColumn` field

| **Nature** | Backward compat for old snapshots |

### L10 — Large `package-lock` / transitive canvg

| **Nature** | Implicit dependency version drift risk |

### L11 — `DYNAMIC_ANALYTICS_INTENT_ENGINE.md` may lag code

| **Nature** | Aspirational migration doc vs implemented Phase 1 |

### L12 — UI copy references “department-average” in warnings

| **Location** | Outlier realignment messages in `main.py` |
| **Nature** | Generic wording may not match `zone` / `product` vocabulary |

---

## Architectural weaknesses (cross-cutting)

| Weakness | Severity | Notes |
|----------|----------|-------|
| Single-route SPA state | High | No URL routing, deep-linking, or tab persistence |
| No auth / RBAC | High | Anyone with API access can upload and query |
| No persistent server-side sessions | High | Refresh loses dataset unless re-upload |
| Split source of truth for intent | Medium | `intent_debug` vs `analysis.intent` vs `smart_trace` |
| Frontend mirrors backend scoring | Medium | Drift risk when API fields missing |
| PDF static import bundle size | Medium | Documented in UI baseline |
| Recharts DOM coupling for capture | High | Breaks if chart markup changes |

---

## Hardcoded logic inventory

| Category | Examples | Risk |
|----------|----------|------|
| API origin | `localhost:8000`, CORS `localhost:3000` | Deploy |
| Compare-by dimensions | Regex lists: region, product, category, … | Misses zone-only phrasing |
| Semantic roles | product, sales, region, customer, date | Non-standard schemas |
| Growth phrases | `growth rate` in `_GROWTH_INTENT_RE` | Correlation mitigated |
| Claude model id | `claude-haiku-4-5-20251001` | Version pin |
| Insight plan widths | 760 / 850 / 900 px | Design constants (OK) |
| PDF A4 layout | `pdf-enterprise-style.ts` | OK |
| Correlation synonyms | `customer count` → customers (schema-driven list) | Maintain alias table |
| Test fixtures | South/North/East/West | Tests only |

**Not found:** Production Python/TS with hardcoded customer city names or zone labels in routing logic (geographic examples appear in tests and **prompt examples** in `geographic_scope.py`).

---

## Duplicate code hotspots

| Domain | Locations | Recommendation |
|--------|-----------|----------------|
| Confidence scoring | `confidence_scoring.py`, `insight-confidence.ts` | Keep API authoritative |
| Executive card titles | `insight_card_titles.py`, `insight-card-titles.ts` | Single generator or codegen |
| Pearson / correlation | `correlation_analysis.py`, `buildExecutiveVizInsights`, `relationship-visualization.ts` | API-only coefficients for UI |
| Intent detection | `main.py` helpers + `question_patterns.py` | Continue extraction to intent_engine |
| Metric column resolve | `column_resolve.py`, `_best_numeric_column_for_question` in main | Consolidate |
| Chart kind resolution | `final-chart-presentation.ts`, `smart-chart-intelligence.ts` | Document precedence |

---

## Dead / stale code candidates

| Item | Evidence | Action |
|------|----------|--------|
| `frontend/scripts/gen-*.py` | Not in build pipeline | Archive or document as dev-only |
| `project_backups/` | Manifest dated May 2026 | Do not treat as source of truth |
| Deprecated exports `ai-insights-ui.ts` | `@deprecated` | Remove when imports cleaned |
| `INTENT_ENGINE_DISABLE` | Operational only | Document in README |
| Duplicate test file paths | `\` vs `/` on Windows | Cosmetic |

**Not classified as dead:** `analyze_data`, `build_smart_chart`, `legacy.py` — still on fallback paths.

---

## Temporary fixes & operational flags

| Fix | Location | Purpose |
|-----|----------|---------|
| `saved_df` / `finally` restore | `/ask`, `/filtered-dashboard` | Avoid leaving filtered df in global |
| Early correlation routing pack | `compute_visualization_for_question` | Prevent bar misroute (Jun 2026) |
| `suppress_auto_charts` + empty chart | Unsupported multi-metric / decline | Stop misleading charts |
| `alignment_repaired` flag | Viz rebuild paths | Warn when chart metric swapped |
| `scatterFallback` warning copy | `build_smart_chart` aftermath | Explain bar substitute |
| `INTENT_ENGINE_DISABLE=1` | `attach.py` | Disable intent JSON |
| `_claude_narrative_fallback_answer` | API errors | User-visible error template |
| Client trusts `insightConfidenceScore` when set | `insight-confidence.ts` | Avoid broken client model |

---

## AI hallucination risks

| ID | Scenario | Mitigation | Gap |
|----|----------|------------|-----|
| AI-1 | Numbers in prose ≠ chart | `exact_result`, authoritative chart-values in prompt | Fallback answer path |
| AI-2 | Combined revenue+profit totals | Prompt + relationship rules | Model may ignore |
| AI-3 | Point N / row labels in text | Prompt forbids | Not structurally validated |
| AI-4 | Qualitative correlation when `qualitativeOnly` | `format_correlation_exact_result_lines` | LLM may overstate strength |
| AI-5 | Forecast as fact when guardrails fail | Scenario estimate copy | User may skip disclaimers |
| AI-6 | Overview AI summary (upload) | Separate from `/ask` grounding | May not match later Insights |
| AI-7 | Smart Chart Insight Panel (heuristic) | Not LLM — rule-based blurbs | Can disagree with backend intent |
| AI-8 | Follow-up chips | Generated client-side | Not validated against cohort |

---

## Incorrect chart routing risks

| ID | Trigger | Failure mode | Guard |
|----|---------|--------------|-------|
| CR-1 | “correlated with” question | Bar by zone / count | Early `_try_correlation_routing_pack` + tests |
| CR-2 | Missing numeric column | Used to fall through to `analyze_data` | `build_unsupported_relationship_missing_columns` |
| CR-3 | Outlier question | Department average bar | `chartSnapshotMatchesQuestionIntent`, realignment |
| CR-4 | Dual-metric compare by dimension | Grouped bar (correct) vs scatter (wrong) | `_question_requests_two_metric_compare` |
| CR-5 | Growth / trend on single period | Line/bar snapshot | `unsupported_growth`, trend unsupported |
| CR-6 | `build_smart_chart` after empty chart | Wrong chart type | `suppress_auto_charts` |
| CR-7 | `_deterministic_viz_last_resort` | Generic bar | `fallback_used` + partial warning |
| CR-8 | Profit margin fallback | Bar by dimension | Disabled for correlation routing |
| CR-9 | Overview auto-dashboard | Different kinds vs Insights | Separate pipeline B |
| CR-10 | Intent engine bucket `compare` for scatter | Wrong analytics labels | Use `analysis.intent.primaryGoal` |

**Regression tests to run after routing changes:**

```bash
cd backend
python -m unittest tests.intent_engine.test_relationship_routing tests.intent_engine.test_correlation_analysis -v
```

---

## PDF export risks

| ID | Risk | Cause | Mitigation |
|----|------|-------|------------|
| PDF-1 | Blank chart image | Capture ref null, DOM not mounted | Empty states in `pdf-report.ts` |
| PDF-2 | html2canvas CSS parse failure | Tailwind v4 `color-mix` | Canvg primary path in `chart-png-capture.ts` |
| PDF-3 | Canvg/SVG drift | Recharts version upgrade | Manual export QA |
| PDF-4 | Aspect ratio / blur | Scale constants | `PDF_CHART_CAPTURE_SCALE` |
| PDF-5 | Dark UI vs light PDF | Intentional print theme | `buildPdfExportTheme` |
| PDF-6 | Export misaligned insight | Wrong chart id | `validateExportMatchesContract` (partial) |
| PDF-7 | Large bundle / main thread block | Static pdf import | Code-split pending |
| PDF-8 | Data Preview table pagination | Native PDF table limits | Section toggles |
| PDF-9 | Missing relationship coefficients in PDF narrative | Export builds from answer + cards | Ensure export payload includes `relationshipInsights` |
| PDF-10 | Session vs insight capture width mismatch | Two refs | Test both export entry points |

---

## Open bugs (tracked / observed)

| ID | Severity | Status | Description |
|----|----------|--------|-------------|
| OB-1 | High | Open | Export/PDF not production-finalized |
| OB-2 | High | Open | API base URL hardcoded to localhost |
| OB-3 | Medium | Open | Preview endpoint ignores dashboard filters |
| OB-4 | Critical | Open | No multi-tenant / concurrent session safety on `df` |
| OB-5 | Medium | Open | Intent log bucket ≠ `primaryGoal` for scatter |
| OB-6 | Medium | Open | Frontend confidence group model diverges without API score |
| OB-7 | Low | Open | FastAPI startup event deprecation warnings |
| OB-8 | High | Mitigated Jun 2026 | Correlation → bar misrouting — `correlation_routing_locked` guard; retest if touching `compute_visualization_for_question` |
| OB-9 | High | Mitigated Jun 2026 | Growth rate column triggers growth unsupported — correlation exempt |
| OB-10 | Medium | Open | canvg not declared as direct frontend dependency |

**Fixed recently (do not reopen without regression):**

- “Is customer count correlated with revenue?” → zone count bar (→ scatter customers × revenue)
- Generic Revenue Share/Gap on relationship scatter when `relationshipInsights` wired
- Confidence 0/100 with valid correlation routing

---

## Suggested fix priority (from inventory)

1. **C1 / H12** — Session isolation design (per-request DataFrame or worker pinning)  
2. **H1 / H8** — Environment-based API URL + CORS  
3. **H6 / H13 / PDF-*** — PDF capture regression suite + finalize export phase  
4. **C3 / CR-*** — Lock correlation-first routing with expanded golden tests  
5. **H2** — Filter-aware preview or UI disclaimer  
6. **M6** — Align frontend `groupPoints` with backend for scatter when API score absent  
7. **H3 / H4** — Continue intent_engine extraction without drive-by refactors  

---

*This inventory is based on static analysis and baseline docs as of June 2026. Re-run routing tests and manual PDF export after any changes to `main.py` or `pdf-report.ts`.*
