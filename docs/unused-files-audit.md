# Unused / Dead File Audit

**Date:** June 6, 2026  
**Branch:** DEV (post-commit/push)  
**Method:** Read-only inspection — imports, references, routes, tests, docs, package scripts. **No files deleted.**

---

## Executive summary

| Category | Count (approx.) |
|----------|-----------------|
| Definitely safe to remove | 9 paths |
| Probably unused — confirm first | 18 paths |
| Keep for now | All application code, active tests, baseline docs cited by `AGENTS.md` |
| Generated / should be gitignored | 7 patterns |

**Application code is largely clean.** The main dead code candidate is one deprecated frontend lib module. Most other candidates are duplicate docs, stale root artifacts, default Next.js assets, or manual dev scripts.

---

## 1. Definitely safe to remove

These have **no runtime imports** and no test dependency. Safe after a quick grep before delete.

| Path | Why unused | References |
|------|------------|------------|
| `frontend/lib/overview-chart-heuristics.ts` | Deprecated wrapper around `final-chart-presentation.ts`; exports `selectOverviewDisplayKind` only. Marked `@deprecated`. | **No TS/TSX imports.** Docs only: `docs/file-map.md`, `docs/root-cause-analysis.md`. Overview uses `computeFinalChartPresentation` directly via `page.tsx`. |
| `tests/fixtures/marketing_campaigns_chart_test.csv` | Orphan fixture at repo root. | **No matches** in `.py`, `.ts`, `.tsx`, or other tests. Backend tests use `backend/tests/fixtures/`. |
| `tests/fixtures/operations_incidents_chart_test.csv` | Same as above. | **No matches.** |
| `tests/fixtures/retail_orders_chart_test.csv` | Same as above. | **No matches.** |
| `frontend/public/next.svg` | Default `create-next-app` asset. | **No imports** in `frontend/app`, `frontend/components`, or CSS. |
| `frontend/public/vercel.svg` | Default asset. | **No imports.** |
| `frontend/public/globe.svg` | Default asset. | **No imports.** |
| `frontend/public/file.svg` | Default asset. | **No imports.** |
| `frontend/public/window.svg` | Default asset. | **No imports.** |

**Note:** `frontend/lib/pdf-export-sections.test.ts` has **no** companion `pdf-export-sections.ts` — that is intentional; the test reads `app/pdf-report.ts` source via `fs`. **Keep the test.**

---

## 2. Probably unused but needs manual confirmation

Confirm intent (recovery, links, local workflow) before removing.

### Duplicate / legacy documentation

| Path | Why flagged | References |
|------|-------------|------------|
| `requirements.txt` (repo root) | Stale full-environment pin list (40 lines, includes `matplotlib`, `fonttools`, etc.). Canonical install path is `backend/requirements.txt` (28 lines, lean FastAPI stack). | `RECOVERY_INSTRUCTIONS.md` → `backend/requirements.txt`. Only `docs/project-snapshot.md` mentions root file with “if present”. |
| `CHARTS_TAB_STABLE_SUMMARY.md` | Explicit **legacy alias** → points to `CHARTS_STABLE_SUMMARY.md`. | Linked from `CHARTS_TAB_BASELINE.md`, `AI_VISUALIZATION_BEHAVIOR.md`. |
| `CHARTS_TAB_BASELINE.md` | Legacy index; body duplicates canonical Charts baseline. File says “retained for older links only.” | Cross-links in architecture docs. |
| `AI_INSIGHTS_LATEST_STATE.md` | UI-focused subset; canonical is `AI_INSIGHTS_STABLE_SUMMARY.md`. | Linked from `AI_INSIGHTS_STABLE_SUMMARY.md`, `LATEST_STABLE_UI_SNAPSHOT.md`. |
| `CURRENT_UI_BASELINE.md` | Overlaps `LATEST_STABLE_UI_SNAPSHOT.md` / `UI_BASELINE_RULES.md`. | `PROJECT_ARCHITECTURE_SUMMARY.md` links it. |
| `UI_UX_STABLE_BASELINE.md` | Overlaps other UI baseline docs. | `RECOVERY_INSTRUCTIONS.md`, backup manifest. |
| `UI_ARCHITECTURE_SNAPSHOT.md` | Overlaps `LATEST_STABLE_UI_SNAPSHOT.md`. | `AGENTS.md` baseline list — **keep unless consolidating docs.** |
| `PROJECT_SNAPSHOT.md` (root) | Shorter handoff; superseded in depth by `docs/project-snapshot.md` + `project-snapshot/*.md`. | Points to `CURRENT_BUG_STATUS.md`. |
| `docs/project-snapshot.md` | Long handoff doc; overlaps `project-snapshot/` folder slices. | Active engineering reference. |
| `project-snapshot/*.md` (6 files) | Dated June 4 handoff; overlap with root/`docs/` baselines. | **Git-tracked**; useful for session handoff, not imported by code. |
| `frontend/README.md` | Stock Next.js boilerplate; not project-specific. | No code references. |
| `DYNAMIC_ANALYTICS_INTENT_ENGINE.md` | Design doc; may lag code (`docs/bug-inventory.md` L11). | Referenced in `project-snapshot/changed-files-summary.md`. |

### Dev / one-off scripts (not wired to npm or CI)

| Path | Why flagged | References |
|------|-------------|------------|
| `frontend/scripts/gen-chart-renderer.py` | Codegen helper for `chart-renderer.tsx`; not in `package.json` scripts. | Uses `_chart_renderer_header.txt`; mentioned in `docs/bug-inventory.md`. |
| `frontend/scripts/gen-filter-panel.py` | Same pattern for filter panel extraction. | Docs only. |
| `frontend/scripts/patch-download-report-ref.py` | One-time refactor script for `downloadReport` → ref pattern. | Docs only; likely already applied. |
| `frontend/scripts/_chart_renderer_header.txt` | Header fragment for `gen-chart-renderer.py`. | Only used by that script. |
| `backend/scripts/validate_five_questions.py` | Manual QA: prints JSON for five polish scenarios. | **No imports**; run directly. Uses `backend/tests/fixtures/retail_analytics_regression.csv`. |
| `backend/scripts/inspect_three_queries.py` | Manual QA: inspects viz payloads via `TestClient`. | **No imports**; run directly. |
| `backend/tests/intent_engine/run_validation_report.py` | Batch validation script living under `tests/`. | **No pytest collection** as test module; docs reference it. |
| `backend/run_tests.py` | Legacy `unittest` runner; canonical command is `python -m pytest tests/intent_engine/`. | `docs/known-test-failures.md`, `docs/project-snapshot.md` (counts outdated: says 66 tests). |

### Backup manifests (not full trees in git)

| Path | Why flagged | References |
|------|-------------|------------|
| `project_backups/stable_export_pdf_phase2_backup_2026-05-21/` | Git tracks **manifest only** (`BACKUP_MANIFEST.md`, `BACKUP_SOURCE.txt`). Full `frontend/`/`backend/` copies are **gitignored** if present on disk. | `project_backups/README.md`, `RECOVERY_INSTRUCTIONS.md`. May still be valuable for recovery. |

---

## 3. Keep for now

### Core application (all referenced)

| Area | Status |
|------|--------|
| `frontend/app/page.tsx`, `pdf-report.ts`, all `app/components/**` | Imported and rendered. |
| `frontend/lib/*.ts` (except `overview-chart-heuristics.ts`) | **55/56** lib modules have live imports from `page.tsx`, components, contexts, or other lib files. |
| `frontend/contexts/chart-session-context.tsx` | Used by Charts session + export. |
| `frontend/components/app-shell/**` | Shell, sidebar, nav, theme. |
| `backend/main.py` | FastAPI monolith; all routes active. |
| `backend/intent_engine/*.py` | All modules referenced from `main.py`, each other, or tests. |
| `backend/intent_engine/legacy.py` | **Active** despite name — imported by `resolve_analysis_intent.py`, `validate_support.py`, `resolve_metric_dimension.py`, `resolve_derived_metric.py`, `trend_unsupported.py`, `decline_intent.py`, `executive_lens.py`, `resolve_explicit_metric.py`. |
| `backend/services/file_parsers.py` | Upload pipeline. |
| `backend/analytics_metadata.py` | `main.py:24` — `build_insight_title`, `build_metric_label`. |
| `backend/intent_engine/attach.py` | `main.py`, `__init__.py`, golden tests. |

### Tests (all collected by pytest / vitest)

| Suite | Files | Notes |
|-------|-------|-------|
| Backend intent engine | 38 files under `backend/tests/intent_engine/` | Includes regression, routing matrix, retail CSV, geographic, correlation. |
| Follow-up context | `backend/tests/test_follow_up_context.py` | 5 tests. |
| Frontend vitest | 14 test files / 70 tests | Includes PDF, routing, follow-up, relationship, trend. |
| `frontend/lib/ai-follow-up-semantic-dedupe.test.ts` | Tests `dedupeFollowUpChips` in `ai-follow-up-suggestions.ts` — **not** an orphan test. | |

### Backend fixtures (all used)

| File | Used by |
|------|---------|
| `backend/tests/fixtures/retail_analytics_regression.csv` | Retail regression, scripts, many intent tests. |
| `backend/tests/fixtures/retail_region_product.csv` | Relationship / golden tests. |
| `backend/tests/fixtures/geographic_performance.csv` | Geographic / correlation tests. |
| `backend/tests/fixtures/geographic_one_period.csv` | Single-period geographic cases. |

### Baseline docs (cited by `AGENTS.md` — do not remove without updating rules)

`AGENTS.md`, `PROJECT_ARCHITECTURE_SUMMARY.md`, `LATEST_STABLE_UI_SNAPSHOT.md`, `UI_BASELINE_RULES.md`, `CHARTS_STABLE_SUMMARY.md`, `DATA_PREVIEW_STABLE_SUMMARY.md`, `AI_INSIGHTS_STABLE_SUMMARY.md`, `UI_ARCHITECTURE_SNAPSHOT.md`, `AI_VISUALIZATION_BEHAVIOR.md`, `PDF_EXPORT_STABLE_BASELINE.md`, `docs/file-map.md`, `docs/bug-inventory.md`, `docs/intent-engine-migration-log.md`, `RECOVERY_INSTRUCTIONS.md`, `project_backups/README.md`.

### PDF export stack (active)

`frontend/app/pdf-report.ts`, `frontend/lib/build-executive-pdf-input.ts`, `pdf-executive-content.ts`, `pdf-enterprise-style.ts`, `pdf-date-format.ts` — all imported by export path in `page.tsx` / `pdf-report.ts`.

---

## 4. Generated / cache / build files that should be gitignored

Already in `.gitignore`:

| Pattern | Purpose |
|---------|---------|
| `node_modules/` | npm deps |
| `.next/` | Next.js build/dev cache |
| `__pycache__/`, `*.pyc` | Python bytecode |
| `.pytest_cache/` | pytest cache |
| `.venv/` | Python virtualenv |
| `.env` | Secrets |
| `.cursor/` | Cursor IDE |
| `dist/`, `build/` | Build output |
| `project_backups/stable_export_pdf_phase2_backup_*/frontend/` (etc.) | Copied backup trees |

**Present on disk but NOT fully covered by `.gitignore`:**

| Path / pattern | Status | Recommendation |
|----------------|--------|----------------|
| `pytest-cache-files-*/` (repo root) | Untracked generated dir (`pytest-cache-files-14ch4pa9/`) | Add `pytest-cache-files-*/` to `.gitignore` |
| `backend/pytest-cache-files-*/` | Untracked generated dir | Same |
| `frontend/.next/` | Gitignored; may exist locally after `npm run dev` | Do not commit |
| `**/__pycache__/` | Gitignored; may exist after test runs | Do not commit |
| `*.log` | Gitignored | Do not commit |

**No `.bak`, `.backup`, or `*copy*` files found** in the repository.

---

## Special attention checklist

| Area | Finding |
|------|---------|
| Old backup files | None (`*.bak` / `*.backup`). `project_backups/` holds May 2026 PDF phase manifest only in git. |
| Duplicate markdown snapshots | Multiple overlapping UI/PDF/handoff docs (see §2). No exact filename duplicates across root / `docs/` / `project-snapshot/`. |
| Unused test files | **None** — all backend/frontend test files are collected and run. |
| Old PDF experiment files | **None** — single PDF pipeline: `pdf-report.ts` + executive lib modules. |
| Unused frontend lib | **One:** `overview-chart-heuristics.ts`. |
| Unused backend helpers | **None** in `intent_engine/` or `services/`. Scripts under `backend/scripts/` are manual tools. |
| `.next`, `node_modules`, `project_backups` trees | Correctly gitignored (except backup manifests). |

---

## Suggested cleanup order (when approved — not done in this audit)

1. Delete `frontend/lib/overview-chart-heuristics.ts` + update `docs/file-map.md` / `docs/root-cause-analysis.md`.
2. Delete root `tests/fixtures/*.csv` (3 files) or move to `backend/tests/fixtures/` if still needed for manual QA.
3. Remove default `frontend/public/*.svg` if branding does not use them.
4. Delete untracked `pytest-cache-files-*/` dirs; add gitignore pattern.
5. Consolidate docs (legacy aliases → single canonical file) in a **docs-only** PR.
6. Archive or delete one-off `frontend/scripts/patch-download-report-ref.py` after confirming patch is applied.

---

## Verification commands used

```bash
# Backend
cd backend && python -m pytest tests/intent_engine/ tests/test_follow_up_context.py -q

# Frontend
cd frontend && npm run test

# Tracked files
git ls-files
```

**Audit complete — no files were modified except this report.**
