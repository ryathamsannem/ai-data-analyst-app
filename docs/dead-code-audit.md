# Dead Code Audit — Phase 2 + Phase 3

**Date:** June 6, 2026  
**Branch:** DEV (post Phase 1 cleanup)  
**Method:** Read-only static analysis — imports, references, dynamic imports, test collection, package scripts, route handlers.

**Related:** [`docs/unused-files-audit.md`](unused-files-audit.md) (Phase 1 file-level cleanup)

---

## Phase 3 — completed (June 6, 2026)

| Action | Detail |
|--------|--------|
| **Removed** | `frontend/lib/overview-chart-heuristics.ts` |
| **Pre-delete check** | Zero imports in `frontend/**/*.{ts,tsx}`; only doc mentions remained |
| **Doc references left unchanged** | `docs/file-map.md`, `docs/root-cause-analysis.md`, `docs/unused-files-audit.md` still mention the file (historical); update separately if desired |
| **Tests after removal** | Backend **134 passed**; Frontend **70 passed** |

---

## Executive summary

| Category | Finding |
|----------|---------|
| **Definitely unused (safe to remove)** | ~20 dead symbols/helpers (1 dead lib file **removed in Phase 3**) |
| **Probably unused (confirm first)** | Dev codegen scripts, stale exports, legacy doc-only helpers |
| **Duplicate logic (consolidate later)** | Label/formatting stacks, bar-sort helpers, routing metadata vs bucket |
| **Keep (runtime / tests / docs)** | 55/55 `frontend/lib` modules (non-test), all `intent_engine` modules, PDF pipeline |
| **High-risk monolith (do not touch pre-MVP)** | `page.tsx`, `main.py`, `pdf-report.ts` bulk |

Application behavior is **not** blocked by dead code; dead weight is narrow exports, deprecated wrappers, and monolith-local orphans.

---

## Test results (post-audit, no changes)

| Suite | Command | Result |
|-------|---------|--------|
| Backend | `cd backend && python -m pytest tests/intent_engine/ tests/test_follow_up_context.py -q` | **134 passed** |
| Frontend | `cd frontend && npm run test` | **70 passed** (14 files) |

---

## 1. Definitely unused and safe to remove

Verified: **zero imports** or **definition-only** (never called).

### Frontend — whole file

| Path | Status | Notes |
|------|--------|-------|
| ~~`frontend/lib/overview-chart-heuristics.ts`~~ | **REMOVED (Phase 3)** | Was `@deprecated` wrapper for `selectOverviewDisplayKind` → `computeFinalChartPresentation`. No TS/TSX imports. Deleted June 6, 2026. |

### Frontend — unused exports (file stays)

| File | Symbol | Why unused |
|------|--------|------------|
| `frontend/lib/analytics-metadata.ts` | `buildAxisLabel`, `buildTooltipLabel` | Exported; never imported. `buildAxisLabelFromAggColumn` is used instead (`page.tsx`, `insight-aligned-axis-merge.ts`). |
| `frontend/lib/pdf-enterprise-style.ts` | `pdfDrawAccentRule` | Exported; never imported (only definition in file). |
| `frontend/lib/theme.ts` | `readResolvedThemeFromDom` | Exported; never imported. Theme uses `resolveTheme` / `getSystemTheme` internally. |
| `frontend/lib/chart-question-intent.ts` | `isOutlierAnalysisQuestion`, `questionExplicitlyGroupsByDimension`, `isMisleadingOutlierDepartmentChart` | Only used internally by `chartSnapshotMatchesQuestionIntent`. External code imports **only** `chartSnapshotMatchesQuestionIntent` (`page.tsx:461`). |

### Frontend — `page.tsx` local helpers (never called)

| Function | Line ~ | Notes |
|----------|--------|-------|
| `formatAggForBadge` | 1022 | Definition only; no call sites in `page.tsx`. |
| `applyBarChartSort` | 1559 | **Duplicate** of live copy in `frontend/lib/build-executive-pdf-input.ts:246`. Page version is dead. |
| `buildNumericDistributionBlurb` | 3891 | Definition only; no call sites. |

### Backend — unused symbols

| File | Symbol | Why unused |
|------|--------|------------|
| `backend/intent_engine/legacy.py` | `distinct_date_period_count` | Wrapper never imported; `main._distinct_date_period_count` called directly at `main.py:7604`. |
| `backend/intent_engine/correlation_routing_guard.py` | `blocks_generic_viz_fallbacks`, `must_use_scatter_visualization` | Defined; never called. Live export: `chart_selection_bucket_override` (`main.py:10458`). |
| `backend/intent_engine/dimension_request.py` | `first_unresolved_dimension_phrase` | Defined; never called. |
| `backend/intent_engine/executive_ambiguous_intent.py` | `question_requests_executive_risk`, `executive_ambiguous_prompt_block` | Defined; never called. Live: `chart_selection_bucket_override`, `classify_executive_ambiguous_bucket`, context builders. |
| `backend/main.py` | `_scoped_follow_up_question` | Wrapper around `_is_explanation_follow_up` / `_is_thread_meta_follow_up`; **never called** (`resolve_follow_up_turn` inlines logic). |
| `backend/main.py` | `_tpl_distribution_mix` | Question template; definition only. |
| `backend/main.py` | `_strip_id_metric_stem` | Duplicate of `analytics_metadata._strip_id_metric_stem`; definition only in `main.py`. |
| `backend/main.py` | `_q_token` | Definition only. |

---

## 2. Probably unused but needs manual confirmation

Confirm with product/QA before removal — may be intended for future wiring, debug, or manual scripts.

### Frontend dev scripts (not in `package.json`)

| Path | Role | Risk if removed |
|------|------|-----------------|
| `frontend/scripts/gen-chart-renderer.py` | Regenerates `chart-renderer.tsx` from slice | References missing `app/components/home/_slice.txt` — **script appears stale**. |
| `frontend/scripts/gen-filter-panel.py` | Filter panel codegen | Mentioned in `docs/bug-inventory.md`; no npm script. |
| `frontend/scripts/patch-download-report-ref.py` | One-time `downloadReport` → ref refactor | Likely already applied; verify git history. |
| `frontend/scripts/_chart_renderer_header.txt` | Fragment for gen-chart-renderer | Only used by above script. |

### Backend manual / legacy runners

| Path | Role | Notes |
|------|------|-------|
| `backend/run_tests.py` | `unittest` discover over `tests/intent_engine/` | **Not dead** as dev entry; superseded by `pytest` in CI. Docs still reference it (`docs/known-test-failures.md` — counts outdated). |
| `backend/scripts/validate_five_questions.py` | Manual viz JSON for 5 polish questions | No imports; run directly. |
| `backend/scripts/inspect_three_queries.py` | TestClient smoke for 3 queries | No imports; run directly. |
| `backend/tests/intent_engine/run_validation_report.py` | Phase-1 intent golden batch report | No pytest collection; documented runner. |

### Exported but test-only or internal-only (API surface cleanup candidates)

| File | Symbol | Used by |
|------|--------|---------|
| `frontend/lib/build-executive-pdf-input.ts` | `mergeParsedSectionsForPdfExport` | Internal only |
| | `executiveVizCardsToPdfFacts`, `chartIntelSliceFromSmartChart`, `routingPlanSliceForPdf` | Tests only (`build-executive-pdf-input.test.ts`) |
| `frontend/lib/narrative-number-format.ts` | `formatNarrativeNumbers`, `polishNarrativeEfficiencyTerms`, `augmentDualMetricRoasLead` | Pipeline internals; public entry is `polishInsightNarrativeText` |
| `frontend/app/pdf-report.ts` | `resolvePdfChartTitle` | Exported; used only inside `pdf-report.ts` (could be unexported) |
| `backend/intent_engine/confidence_scoring.py` | `calculate_insight_confidence` | Tests; production uses `compute_insight_confidence_meta` wrapper |

### Possibly stale main.py helpers

| Symbol | Notes |
|--------|-------|
| `infer_semantic_column_mapping` | Thin alias; production path uses `apply_semantic_column_mapping` / `compute_semantic_column_mapping`. |
| `_log_parquet_upload_support` | FastAPI startup hook; verify still needed for ops logging. |
| Nested `typed_count` in `build_auto_dashboard` | Reported as defined-never-invoked; confirm in full `main.py` scan before delete. |

---

## 3. Duplicate logic that can be consolidated later

Do **not** consolidate pre-MVP without tests; listed for Phase 3+ planning.

### Chart routing: old bucket vs `RoutingPlan`

```
Question → main._chart_selection_question_bucket (LIVE decision)
         → compute_visualization_for_question
         → analysis payload
         → routing_consistency.attach_routing_backbone
         → routing_plan.build_routing_plan_from_analysis (metadata / validation)
```

| Layer | Location | Status |
|-------|----------|--------|
| **Decision routing** | `main._chart_selection_question_bucket`, `_detect_intent_tags`, `_question_requests_*` | **Live** |
| **Post-hoc plan** | `intent_engine/routing_plan.py`, `routing_consistency.py` | **Live attach**; does not replace bucket |
| **Frontend mirror** | `frontend/lib/routing-plan.ts` — `parseRoutingPlan`, `followUpLensFromRouting` | **Live**; `executiveLens` is fallback in `page.tsx` (~9431) |

**Not dead** — intentional dual layer until full registry migration (`docs/intent-engine-migration-log.md`).

### PDF pipeline (executive path — no dead replacement)

```
page.tsx → build-executive-pdf-input.ts → runExecutivePdfExport (pdf-report.ts)
              ├─ pdf-executive-content.ts
              ├─ pdf-enterprise-style.ts
              ├─ pdf-date-format.ts
              └─ metric-value-format.ts
```

No parallel legacy PDF module found. Old experiment files were removed in Phase 1 or never committed.

### Column / metric formatting (three layers — not duplicates)

| Module | Purpose | Consumers |
|--------|---------|-----------|
| `frontend/lib/analytics-metadata.ts` | Labels, KPI titles, axis copy | Widespread `page.tsx` + lib |
| `frontend/lib/metric-value-format.ts` | Numeric chart/PDF display | `chart-axis-formatters.ts`, `pdf-report.ts` |
| `frontend/lib/narrative-number-format.ts` | AI prose polish | `page.tsx`, `ai-insight-answer-body.tsx` |

**Duplicate risk (backend):**

| Concern | Locations |
|---------|-----------|
| Pretty labels | `main._pretty_label_text`, `analytics_metadata`, `intent_engine/insight_card_titles`, `legacy.pretty_label_text` |
| ID stem strip | `main._strip_id_metric_stem` (dead), `analytics_metadata._strip_id_metric_stem` (live) |
| Categorical columns | `column_resolve.categorical_columns`, `geographic_scope._categorical_cols` |

**Duplicate risk (frontend):**

| Concern | Locations |
|---------|-----------|
| Executive summary number format | `page.tsx:formatNumberForExecutiveSummary` (~3275), `build-executive-pdf-input.ts:formatNumberForExecutiveSummary` (~355) — same logic, separate copies |
| Bar sort for export | Dead `page.tsx:applyBarChartSort`; live `build-executive-pdf-input.ts:applyBarChartSort` |

### AI insight helpers

| Helper | Status |
|--------|--------|
| `frontend/lib/routing-plan.ts` | **Active** — not replaced dead module |
| `frontend/lib/analysis-intent-debug.ts` | **Active** — debug panel + unsupported-* parsers |
| `frontend/lib/ai-conversation-context.ts` | **Active** — follow-up payload |
| `overview-chart-heuristics.ts` | **Removed** — use `final-chart-presentation.ts` |

---

## 4. Keep because used by runtime / tests / docs

### `frontend/lib/*` (55 of 56 modules live)

All non-test modules imported (55 modules after Phase 3 removal).

**Dynamic import:** `chart-png-capture.ts` → `page.tsx` `await import("@/lib/chart-png-capture")` (~5157, ~6922).

**Lib-chain only (no direct app import):** `relationship-scatter-presentation.ts` — imported by `selected-visualization.ts`, `final-chart-presentation.ts`.

**Test-only file pattern:** `pdf-export-sections.test.ts` reads `pdf-report.ts` source via `fs` (no `pdf-export-sections.ts` module).

### `frontend/app/page.tsx`

~100 top-level helper functions; vast majority are called within the file or wired to React hooks/components. Only **3 confirmed dead locals** (§1). File is **~13.5k lines** — treat as single runtime unit.

### `frontend/app/pdf-report.ts`

~4.5k lines; ~40 module-local helpers feed `runExecutivePdfExport`. Exported API used by:

- `page.tsx` — `runExecutivePdfExport`, branding, types
- `build-executive-pdf-input.ts` — types
- `build-executive-pdf-input.test.ts` — `pickPdfVizExecutiveFacts`
- `trend-visualization.ts` — `PdfRankedSignal` type

No orphaned PDF helper module outside this file.

### `backend/intent_engine/*` (27 modules)

**All modules participate** in `/ask` pipeline or tests. `legacy.py` is an active cycle-breaking shim (7 importers).

| Module | Production entry |
|--------|------------------|
| `attach.py` | `enrich_analysis_with_intent` |
| `resolve_analysis_intent.py` | Intent hub |
| `routing_plan.py` + `routing_consistency.py` | Post-analysis attach |
| `confidence_scoring.py`, `correlation_analysis.py`, `executive_lens.py`, etc. | Lazy imports from `main.py` |

### Scripts & runners (keep as tooling)

| Path | Classification |
|------|----------------|
| `backend/run_tests.py` | Keep — documented alternate runner |
| `backend/scripts/*.py` | Keep — manual QA |
| `backend/tests/intent_engine/run_validation_report.py` | Keep — validation harness |
| `frontend/scripts/*` | Keep until codegen workflow confirmed obsolete |

---

## 5. High-risk monolith code — do not touch before MVP

| File | Lines (approx.) | Why high-risk |
|------|-----------------|---------------|
| `frontend/app/page.tsx` | ~13,580 | Single SPA: upload, filters, Overview, Insights, Charts, Export, `/ask`, chart session, PDF prep. Most helpers are coupled; dead-code removal only via narrow symbol delete + test. |
| `backend/main.py` | ~15,550 | FastAPI monolith: upload, `/ask`, viz pipeline, follow-up, KPI, auto-dashboard, semantic mapping. ~305 top-level functions. |
| `frontend/app/pdf-report.ts` | ~4,515 | jsPDF + Canvg capture; executive layout. Helpers are tightly coupled to `runExecutivePdfExport`. |
| `frontend/app/components/home/chart-renderer.tsx` | Large | Shared Recharts renderer for Overview/Insights/Charts/PDF capture. |
| `backend/intent_engine/legacy.py` | Small but critical | Breaking import cycle; many live re-exports to `main._*`. |

**Safe pre-MVP dead-code strategy:** delete **confirmed orphan files/symbols** (§1) only; defer monolith extractions and routing migration.

---

## Area-by-area audit notes

### 1. `frontend/lib/*`

See §1–§4. Summary: **1 dead file**, several **dead exports**, **no dead PDF lib files**.

### 2. `frontend/app/page.tsx` helpers

| Status | Count |
|--------|-------|
| Live helpers | ~97+ |
| Dead locals | 3 (`formatAggForBadge`, `applyBarChartSort`, `buildNumericDistributionBlurb`) |
| Parsers wired to `/ask` | `parseAlignedAnalysis`, `parseConversationSnapshot`, `hydrateVisualizationFromApi`, etc. — **all live** |

### 3. `frontend/app/pdf-report.ts` helpers

All non-export helpers are called from `sanitizeExecutivePdfExportInput` or `runExecutivePdfExport`. No orphan helper blocks identified beyond **export surface** cleanup candidates (§2).

### 4. `backend/main.py` helpers

| Group | ~Count | Dead in group |
|-------|--------|---------------|
| Follow-up / conversation | 13 | `_scoped_follow_up_question` |
| Visualization / chart | 53+ | `_tpl_distribution_mix` |
| Column / metric resolve | 74+ | `_strip_id_metric_stem`, `_q_token` |
| Intent / routing | 29+ | None confirmed |
| FastAPI routes | 6 | Not dead (framework entry) |

**PDF:** No PDF export logic in `main.py` (frontend-only).

### 5. `backend/intent_engine/*`

See §1 backend symbols and §4. **No orphan modules.**

### 6–7. Scripts

See §2. `frontend/scripts/gen-chart-renderer.py` may be **broken** (missing `_slice.txt` input).

### 8. `run_tests.py` / `run_validation_report.py`

**Keep** — documented dev/validation entry points, not imported by app.

---

## Special focus checklist

| Focus item | Verdict |
|------------|---------|
| `overview-chart-heuristics.ts` | **Removed in Phase 3** (June 6, 2026) |
| Old chart routing vs `RoutingPlan` | **Both live** — bucket decides; plan validates/attaches |
| Old PDF helpers vs executive pipeline | **No separate old PDF libs** — single pipeline |
| Old AI insight helpers | **None orphaned** except deprecated overview wrapper |
| Unused exported functions | Listed §1–§2 |
| Duplicate column/metric formatting | Listed §3 |
| Stale validation scripts | **Keep**; `run_tests.py` docs outdated |

---

## Suggested Phase 3+ order (remaining)

1. ~~Delete `overview-chart-heuristics.ts`~~ **Done (Phase 3, June 6, 2026).**
2. Remove dead `page.tsx` locals (`formatAggForBadge`, `applyBarChartSort`, `buildNumericDistributionBlurb`).
3. Remove dead backend symbols (§1) after grep confirmation.
4. Unexport dead frontend exports (`buildAxisLabel`, `pdfDrawAccentRule`, etc.) — zero behavior change.
5. Archive or fix `frontend/scripts/gen-chart-renderer.py` (missing input file).
6. Defer monolith splits and routing migration until post-MVP.

---

## Verification commands

```bash
# Backend
cd backend && python -m pytest tests/intent_engine/ tests/test_follow_up_context.py -q

# Frontend
cd frontend && npm run test

# Optional dead-export grep (example)
rg "overview-chart-heuristics|selectOverviewDisplayKind" frontend --glob "*.{ts,tsx}"
rg "_scoped_follow_up_question|_tpl_distribution_mix" backend/main.py
```

**Audit complete — no code or behavior changed except this report.**
