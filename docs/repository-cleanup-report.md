# Repository Cleanup Audit Report

**Date:** June 16, 2026  
**Branch:** DEV  
**Scope:** Full repository (read-only audit)  
**Method:** File inventory, import/reference grep (`rg`), route/build script review, cross-check with prior audits (`docs/unused-files-audit.md`, `docs/dead-code-audit.md`). **No files were deleted, moved, or modified except this report.**

---

## Executive summary

| Category | Items flagged | High-confidence delete candidates | Review-first |
|----------|---------------|-----------------------------------|--------------|
| Unused application source | 1 component + 8 CSS token exports | 1 file | 1 partial file |
| Old snapshot / handoff docs | ~35 markdown paths | 0 (links/AGENTS.md) | ~15 legacy aliases |
| Temporary / QA screenshots | ~202 PNG + 21 PDF under `docs/` | ~200 PNG (archive externally) | PDF validation matrix |
| Chart UI experiment artifacts | 42 files in `chart-ui-polish-snapshot/` + ~80 overview/chart PNG folders | ~37 PNG experiment captures | 5 baseline MD files |
| Dead test files | 0 fully dead | 0 | 8 misnamed / harness tests |
| Duplicate utilities | 6 clusters | 1 root `requirements.txt` | CSV + doc duplicates |
| Legacy export implementations | 3 deprecated wrapper layers | 0 (still imported) | Deprecated aliases only |
| Empty folders | 4 | 1 (`frontend/lib/__mocks__`) | 3 venv placeholders |

**Application runtime code is largely clean.** The dominant cleanup opportunity is **documentation and screenshot volume** (~320 files under `docs/`), not orphaned Python/TypeScript modules. Backend has **zero fully unused runtime modules**; frontend has **one unused component**.

---

## Methodology

1. Enumerated source trees: `frontend/lib/`, `frontend/app/components/`, `frontend/contexts/`, `backend/` (excluding `.venv`, `node_modules`, `.next`).
2. For each non-test `.ts`/`.tsx`, searched basename references across `frontend/` (import graph + dynamic import strings).
3. Cross-referenced npm scripts (`frontend/package.json`), Vitest configs, pytest paths, and `render.yaml`.
4. Catalogued `docs/` subfolders, `project_backups/`, root baseline markdown, and empty directories.
5. Compared findings to June 6, 2026 audits; verified several prior candidates are **already removed** (`overview-chart-heuristics.ts`, default `public/*.svg`, root `tests/fixtures/*.csv`).

**Limitations:** Basename grep can miss string-built dynamic imports (checked manually for PNG export session). Monolithic `page.tsx` means “single importer” is normal, not dead. Binary screenshots have **zero code references** by design.

---

## 1. Files that appear unused (no imports / references)

### 1.1 Application source — high confidence

| File path | Why it appears unused | Last known references | Confidence | Safe to delete? |
|-----------|----------------------|------------------------|------------|-----------------|
| `frontend/app/components/home/charts-tab-intelligence-strip.tsx` | `ChartsTabIntelligenceStrip` is never imported. Charts tab uses `charts-tab-chart-reason.tsx` and inlined preview in `page.tsx` instead. | Self-only; defines component using `chartsTabIntel*` tokens from `charts-tab-ui.ts` | **High** | **Yes** (or wire into Charts tab if product wants intel strip) |
| `frontend/lib/charts-tab-ui.ts` (lines 51–74 only) | Exports `chartsTabIntelStrip`, `chartsTabIntelRow`, `chartsTabIntelItem`, `chartsTabIntelLabel`, `chartsTabIntelValue`, `chartsTabIntelDivider`, `chartsTabIntelHighlight`, `chartsTabIntelNote` — only consumer is unused `charts-tab-intelligence-strip.tsx`. Other `chartsTabChartReason*` exports remain live. | `charts-tab-intelligence-strip.tsx` only | **High** | **Yes** (remove exports with component; keep file) |

### 1.2 Application source — all other files **in use**

Automated scan of **141** non-test `.ts`/`.tsx` files under `frontend/lib/`, `frontend/app/components/`, and `frontend/contexts/` found **no other zero-reference files**. All `frontend/lib/*.ts` modules (except partial dead exports above) are imported from `page.tsx`, components, contexts, or other lib files.

Representative “single-importer but live” files (not cleanup candidates):

| File path | Why flagged by naive scan | Last known references | Confidence | Safe to delete? |
|-----------|---------------------------|------------------------|------------|-----------------|
| `frontend/app/components/intent-engine-debug-panel.tsx` | Dev-only UI | `page.tsx` (gated on debug env) | **Low** (intentional) | **No** |
| `frontend/lib/analysis-intent-debug.ts` | Debug types/helpers | `page.tsx`, `intent-engine-debug-panel.tsx`, unsupported-analysis modules | **Low** | **No** |
| `frontend/lib/dev-render-count.ts` | Dev profiling hook | `chart-renderer.tsx`, `page.tsx`, nav/filter components | **Low** | **No** |

### 1.3 Already removed since prior audit (informational)

| File path | Status | Last known references |
|-----------|--------|------------------------|
| `frontend/lib/overview-chart-heuristics.ts` | **Removed** (June 6, 2026 per `docs/dead-code-audit.md`) | Docs still mention in `docs/file-map.md`, `docs/root-cause-analysis.md` — **stale doc links only** |
| `frontend/public/next.svg`, `vercel.svg`, `globe.svg`, `file.svg`, `window.svg` | **Removed** | None |
| `tests/fixtures/marketing_campaigns_chart_test.csv` (repo root) | **Not present** on disk | `docs/unused-files-audit.md` only |

### 1.4 Dev / one-off scripts (not in import graph)

| File path | Why it appears unused | Last known references | Confidence | Safe to delete? |
|-----------|----------------------|------------------------|------------|-----------------|
| `frontend/scripts/gen-chart-renderer.py` | Codegen helper; not in `package.json` | `docs/bug-inventory.md`; uses `_chart_renderer_header.txt` | **Medium** | **Review First** |
| `frontend/scripts/gen-filter-panel.py` | Same pattern for filter panel | Docs only | **Medium** | **Review First** |
| `frontend/scripts/patch-download-report-ref.py` | One-time refactor script | Docs only; likely already applied | **High** | **Review First** |
| `frontend/scripts/_chart_renderer_header.txt` | Fragment for gen script | `gen-chart-renderer.py` only | **Medium** | **Review First** (with scripts) |
| `backend/scripts/*.py` (21 files) | Manual QA/benchmark CLIs; not imported by `main.py` | Run directly; documented in cold-start/large-dataset docs | **Medium** | **Review First** — keep if QA still run |
| `backend/run_tests.py` | Legacy unittest runner | `docs/known-test-failures.md`, `docs/project-snapshot.md` | **Medium** | **Review First** |
| `backend/tests/intent_engine/run_validation_report.py` | Batch validation script under tests | Docs; not pytest-collected | **Medium** | **Review First** |
| `docs/phase6-qa-runner.py` | Phase 6 automation | `docs/known-test-failures.md` | **Medium** | **Review First** |
| `docs/phase7-pdf-analyze.py` | PDF analysis helper | `docs/pdf-validation-report.md` | **Medium** | **Review First** |
| `docs/p7-005-*.py`, `docs/p7-b64-*.txt`, `docs/p7-upload-generic.js`, `docs/p7-upload-generic.json` | Phase 7 one-off upload/export scripts and payloads | **0** code references | **High** | **Review First** (may be rerun for PDF QA) |

### 1.5 Root stale artifacts

| File path | Why it appears unused | Last known references | Confidence | Safe to delete? |
|-----------|----------------------|------------------------|------------|-----------------|
| `requirements.txt` (repo root) | Stale full-environment pin (40 lines, includes `matplotlib`, `fonttools`). Canonical deploy path is `backend/requirements.txt` (28 lines). | `docs/project-snapshot.md` (“if present”); `RECOVERY_INSTRUCTIONS.md` → backend path | **High** | **Yes** (after doc update) |
| `package-lock.json` (repo root) | Empty npm stub: `"packages": {}` | None; real lockfile is `frontend/package-lock.json` | **High** | **Yes** |
| `frontend/README.md` | Stock Next.js boilerplate | None in code | **High** | **Yes** |

---

## 2. Old snapshot files

### 2.1 Root baseline / handoff markdown (canonical vs legacy)

**Keep — cited by `AGENTS.md` and active agent rules:**

| File path | Purpose | References | Safe to delete? |
|-----------|---------|------------|-----------------|
| `AGENTS.md` | Agent baseline index | 32+ cross-doc refs | **No** |
| `PROJECT_ARCHITECTURE_SUMMARY.md` | Architecture summary | 24+ refs | **No** |
| `LATEST_STABLE_UI_SNAPSHOT.md` | UI snapshot | 22+ refs | **No** |
| `UI_BASELINE_RULES.md` | UI rules | 20+ refs | **No** |
| `CHARTS_STABLE_SUMMARY.md` | Charts tab baseline | 20+ refs | **No** |
| `DATA_PREVIEW_STABLE_SUMMARY.md` | Data Preview baseline | 14+ refs | **No** |
| `AI_INSIGHTS_STABLE_SUMMARY.md` | AI Insights baseline | 20+ refs | **No** |
| `UI_ARCHITECTURE_SNAPSHOT.md` | UI architecture | 16+ refs | **No** |
| `AI_VISUALIZATION_BEHAVIOR.md` | Viz behavior rules | 16+ refs | **No** |
| `PDF_EXPORT_STABLE_BASELINE.md` | PDF export baseline | 16+ refs | **No** |
| `RECOVERY_INSTRUCTIONS.md` | Backup recovery | 8+ refs | **No** |

**Legacy aliases / overlaps — review before delete:**

| File path | Why it appears redundant | Last known references | Confidence | Safe to delete? |
|-----------|-------------------------|------------------------|------------|-----------------|
| `CHARTS_TAB_STABLE_SUMMARY.md` | Explicit legacy alias → `CHARTS_STABLE_SUMMARY.md` | `CHARTS_TAB_BASELINE.md`, `AI_VISUALIZATION_BEHAVIOR.md` | **High** | **Review First** (add redirect stub or update links) |
| `CHARTS_TAB_BASELINE.md` | Legacy index; duplicates canonical Charts docs | Cross-links in architecture docs | **High** | **Review First** |
| `AI_INSIGHTS_LATEST_STATE.md` | UI subset; canonical is `AI_INSIGHTS_STABLE_SUMMARY.md` | Linked from stable summaries | **High** | **Review First** |
| `CURRENT_UI_BASELINE.md` | Overlaps `LATEST_STABLE_UI_SNAPSHOT.md` | `PROJECT_ARCHITECTURE_SUMMARY.md` | **Medium** | **Review First** |
| `UI_UX_STABLE_BASELINE.md` | Overlaps other UI baselines | `RECOVERY_INSTRUCTIONS.md`, backup manifest | **Medium** | **Review First** |
| `PROJECT_SNAPSHOT.md` (root) | Shorter handoff vs `docs/project-snapshot.md` | Points to `CURRENT_BUG_STATUS.md` | **Medium** | **Review First** |
| `architecture-summary.md` (root) | Overlaps `PROJECT_ARCHITECTURE_SUMMARY.md` | 1 doc ref | **Medium** | **Review First** |
| `recent-work-summary.md` | Session handoff | **0** refs found | **High** | **Review First** |
| `CURRENT_BUG_STATUS.md` | Bug snapshot | 3 refs | **Medium** | **Review First** |
| `auto-dashboard-status.md` | Status snapshot | `project-snapshot.md` only | **Medium** | **Review First** |
| `deployment-readiness.md` | Deployment notes | 4 refs | **Medium** | **Review First** |
| `DYNAMIC_ANALYTICS_INTENT_ENGINE.md` | Design doc; may lag code | `project-snapshot/changed-files-summary.md` | **Medium** | **Review First** |

### 2.2 Duplicate root ↔ `docs/` markdown

| File path | Why redundant | Last known references | Confidence | Safe to delete? |
|-----------|--------------|------------------------|------------|-----------------|
| `system-understanding.md` (root) | Duplicates `docs/system-understanding.md` | 2 refs each | **Medium** | **Review First** (consolidate to one) |
| `file-map.md` (root) | Duplicates `docs/file-map.md` (docs version has more refs) | Root: 4; docs: 18 | **Medium** | **Review First** |
| `bug-inventory.md` (root) | Duplicates `docs/bug-inventory.md` | Root: 0 external; docs: 16 | **Medium** | **Review First** |
| `root-cause-analysis.md` (root) | Duplicates `docs/root-cause-analysis.md` | Root: 4; docs: 9 | **Medium** | **Review First** |
| `project-snapshot.md` (root) | Overlaps `docs/project-snapshot.md` + `project-snapshot/` | Root: 5; docs: 14 | **Medium** | **Review First** |
| `open-issues.md` (root) | Overlaps chart polish open issues | 4 refs | **Low** | **Review First** |

### 2.3 Dated handoff folders

| File path | Why it appears stale | Last known references | Confidence | Safe to delete? |
|-----------|---------------------|------------------------|------------|-----------------|
| `project-snapshot/current-status.md` | June 4, 2026 session slice | 5 refs (handoff docs) | **Medium** | **Review First** |
| `project-snapshot/changed-files-summary.md` | Same | 4 refs | **Medium** | **Review First** |
| `project-snapshot/next-steps.md` | Same | 3 refs | **Medium** | **Review First** |
| `project-snapshot/test-status.md` | Same | 3 refs | **Medium** | **Review First** |
| `project-snapshot/pdf-export-status.md` | Same | 2 refs | **Medium** | **Review First** |
| `project-snapshot/ai-insights-routing-status.md` | Same | 2 refs | **Medium** | **Review First** |
| `docs/project-snapshot.md` | Long engineering handoff; overlaps folder above | 14 refs | **Low** | **Review First** (active reference) |

### 2.4 Backup manifests

| File path | Why flagged | Last known references | Confidence | Safe to delete? |
|-----------|------------|------------------------|------------|-----------------|
| `project_backups/README.md` | Index only; full trees gitignored | `RECOVERY_INSTRUCTIONS.md`, `.gitignore` | **Low** | **No** |
| `project_backups/stable_export_pdf_phase2_backup_2026-05-21/BACKUP_MANIFEST.md` | May 2026 PDF phase checkpoint | 8 refs | **Low** | **No** |
| `project_backups/stable_export_pdf_phase2_backup_2026-05-21/BACKUP_SOURCE.txt` | Commit metadata | 1 ref | **Low** | **No** |
| `project_backups/.../frontend/`, `backend/` (on disk, gitignored) | Full code copy + accidental `.venv` | Not in git | **Medium** | **Review First** — disk space; keep manifest |

### 2.5 Prior audit docs (meta — keep for cleanup guidance)

| File path | Purpose | Safe to delete? |
|-----------|---------|-----------------|
| `docs/unused-files-audit.md` | June 6 unused file audit | **No** — informs this report |
| `docs/dead-code-audit.md` | Symbol-level dead code | **No** |
| `docs/lint-cleanup-report.md` | Lint pass record | **Review First** |

---

## 3. Temporary screenshots

**Total under `docs/`:** ~202 PNG, ~21 PDF (279 git-tracked files total in `docs/`).

Screenshots are **QA/regression evidence** — zero filename references in application code. Safe to **archive externally** if repo size is a concern; not safe to delete without team sign-off on lost evidence.

### 3.1 Folder-level inventory

| Folder path | File count | Why temporary | Last known references | Confidence | Safe to delete? |
|-------------|------------|---------------|------------------------|------------|-----------------|
| `docs/chart-ui-polish-snapshot/` | 37 PNG + 5 MD | Chart polish iteration captures | MD: internal; PNG: **0** | **High** (PNG) | **Review First** |
| `docs/pdf-validation-screenshots/` | 18 PDF + 11 PNG + 3 JSON | Phase 7 PDF matrix outputs | PDFs: runbook + `phase7-pdf-generate.ts`; PNGs: **0** per file | **Medium** | **Review First** (keep PDFs for regression) |
| `docs/ai-insights-ui-polish/` | 34 PNG | AI Insights UI polish passes | **0** | **High** | **Review First** |
| `docs/chart-polish/` | 18 PNG | Overview chart border polish | 1 (`file-map.md`) | **High** | **Review First** |
| `docs/phase6-screenshots/` | 1 PNG | Phase 6 browser home | **0** | **High** | **Yes** (after archive) |
| `docs/data-preview-*` (10 folders) | 38 PNG total | Data Preview phase A/B/final polish | **0** | **High** | **Review First** |
| `docs/overview-*` (18 folders) | 62 PNG total | Overview alignment, donut, scatter, line experiments | **0** | **High** | **Review First** |

### 3.2 Lint / scratch text captures

| File path | Why temporary | Last known references | Confidence | Safe to delete? |
|-----------|--------------|------------------------|------------|-----------------|
| `docs/_lint-before.txt` | Lint diff capture | **0** | **High** | **Yes** |
| `docs/_lint-after.txt` | Lint diff capture | **0** | **High** | **Yes** |

---

## 4. Obsolete chart UI experiment files

Primary location: **`docs/chart-ui-polish-snapshot/`** (42 files, 42 git-tracked).

These document the rejected layout experiments (narrow viewport v2/v3, revert passes, plot-v4 internals, stabilization, restore-good validation). **None are referenced by runtime code.**

### 4.1 Experiment PNG groups

| File path (pattern) | Why obsolete | Last known references | Confidence | Safe to delete? |
|---------------------|-------------|------------------------|------------|-----------------|
| `docs/chart-ui-polish-snapshot/*-layout-v2.png` | Rejected narrow layout pass | **0** | **High** | **Review First** |
| `docs/chart-ui-polish-snapshot/*-layout-v3.png` | Rejected portrait layout pass | **0** | **High** | **Review First** |
| `docs/chart-ui-polish-snapshot/*-revert-after.png` | Post-revert baselines (superseded by plot-v4) | **0** | **High** | **Review First** |
| `docs/chart-ui-polish-snapshot/patch-v1-*.png` | Minimal patch attempt (user rejected) | **0** | **High** | **Review First** |
| `docs/chart-ui-polish-snapshot/restore-good-*.png` | Selective restore validation (June 16) | **0** | **Medium** | **Review First** (most recent good state evidence) |
| `docs/chart-ui-polish-snapshot/*-plot-v4.png` | Successful internal plot allocation pass | **0** | **Medium** | **Review First** (keep as reference for plot-v4) |
| `docs/chart-ui-polish-snapshot/stabilization-*.png` | Stabilization pass (header/spacing) | **0** | **Medium** | **Review First** |
| `docs/chart-ui-polish-snapshot/*-internals-after.png` | Margin/domain internals pass | **0** | **High** | **Review First** |
| `docs/chart-ui-polish-snapshot/analysis-charts-tab-*.png` | Analysis-only measurement pass | **0** | **High** | **Review First** |
| `docs/chart-ui-polish-snapshot/*-premium.png`, `overview-unchanged-after-revert.png` | Early premium polish attempts | **0** | **High** | **Review First** |

**Full file list (42 files):** see `docs/chart-ui-polish-snapshot/` directory listing. All PNGs share the same reference profile (**0 code refs**).

### 4.2 Experiment markdown in same folder

| File path | Why flagged | Last known references | Confidence | Safe to delete? |
|-----------|------------|------------------------|------------|-----------------|
| `docs/chart-ui-polish-snapshot/stable-baseline-status.md` | Branch `4247ef3` checkpoint doc | **0** folder refs | **Medium** | **Review First** (useful context) |
| `docs/chart-ui-polish-snapshot/system-understanding.md` | Duplicates root/docs system understanding | 2 internal | **Medium** | **Review First** |
| `docs/chart-ui-polish-snapshot/file-map.md` | Duplicates `docs/file-map.md` | 2 internal | **Medium** | **Review First** |
| `docs/chart-ui-polish-snapshot/open-issues.md` | Chart polish open issues | 4 refs | **Medium** | **Review First** |
| `docs/chart-ui-polish-snapshot/chart-rendering-map.md` | Pipeline map for polish work | **0** | **Medium** | **Review First** |

### 4.3 Related overview experiment folders (outside chart-ui-polish-snapshot)

Same profile as §3.1 — experiment captures for Overview mini charts (donut fix, line option A, scatter premium, visual rhythm, etc.). **~62 PNG files** across 18 `docs/overview-*` folders. **0 code references.**

---

## 5. Dead test files

**No fully dead test files found** — all **70** `frontend/lib/*.test.ts` files have valid targets exercised by Vitest (`frontend/vitest.config.ts` → `lib/**/*.test.ts`).

### 5.1 Misnamed tests (live, but confusing names)

| File path | Why flagged | Actual target | Last known references | Confidence | Safe to delete? |
|-----------|------------|---------------|------------------------|------------|-----------------|
| `frontend/lib/ai-follow-up-semantic-dedupe.test.ts` | Name ≠ module | `ai-follow-up-suggestions.ts` | Imported in `page.tsx` | **High** | **No** (rename only) |
| `frontend/lib/auto-dashboard-scatter-parse.test.ts` | Name ≠ module | Inline logic mirrored from `page.tsx` | `page.tsx` scatter path | **High** | **No** |
| `frontend/lib/data-preview-dataset-context.test.ts` | Name ≠ module | `data-preview-ui.ts` | Components + `page.tsx` | **High** | **No** |
| `frontend/lib/final-chart-presentation-rate.test.ts` | Name ≠ module | `final-chart-presentation.ts` | `page.tsx` | **High** | **No** |
| `frontend/lib/metric-executive-percent.test.ts` | Name ≠ module | `metric-value-format.ts` | `page.tsx`, `pdf-report.ts` | **High** | **No** |
| `frontend/lib/metric-spread-gap.test.ts` | Name ≠ module | `metric-value-format.ts` | Same | **High** | **No** |
| `frontend/lib/pdf-export-sections.test.ts` | No companion `pdf-export-sections.ts` | Reads `app/pdf-report.ts` via `fs` | Intentional regression guard | **High** | **No** |
| `frontend/lib/phase7-pdf-generate.test.ts` | Manual PDF matrix harness | `pdf-report.ts`, `branding-config.ts`; writes to `docs/pdf-validation-screenshots/` | `vitest.phase7.config.ts` (not default `npm test`) | **High** | **No** |

### 5.2 Tests with indirect app usage (still live)

| File path | Source under test | App path | Safe to delete? |
|-----------|-------------------|----------|-----------------|
| `frontend/lib/auto-dashboard-session-sync.test.ts` | `auto-dashboard-session-sync.ts` | `contexts/chart-session-context.tsx` | **No** |
| `frontend/lib/chart-png-export-qa.test.ts` | `chart-png-export-qa.ts` | Used by `chart-png-export-session.ts` in export path | **No** |

---

## 6. Duplicate utilities

These are **not** dead code — most are layered pipelines. Flagged where true duplication exists.

### 6.1 True / near duplicates

| File path | Duplicate of / overlaps | Why flagged | Last known references | Confidence | Safe to delete? |
|-----------|------------------------|------------|------------------------|------------|-----------------|
| `requirements.txt` (root) | `backend/requirements.txt` | Different dependency sets; root is stale | See §1.5 | **High** | **Yes** |
| `package-lock.json` (root) | `frontend/package-lock.json` | Empty stub | None | **High** | **Yes** |
| `frontend/public/dashboard_showcase_dataset.csv` | `test-fixtures/domains/`, `backend/tests/fixtures/` | Same dataset, 3 copies for static hosting vs tests | Overview tests, backend QA | **Medium** | **Review First** (consolidate source) |
| `frontend/public/screenshot-fixture.csv` | `test-fixtures/domains/` | Browser screenshot fixture duplicated | Manual QA | **Medium** | **Review First** |
| `system-understanding.md` + `docs/system-understanding.md` + `docs/chart-ui-polish-snapshot/system-understanding.md` | Each other | Three copies of handoff content | Cross-doc links | **Medium** | **Review First** |
| `file-map.md` + `docs/file-map.md` + `docs/chart-ui-polish-snapshot/file-map.md` | Each other | Three copies; docs version most linked | 18 refs (docs) | **Medium** | **Review First** |

### 6.2 Parallel frontend/backend modules (intentional ports — not duplicates)

| Frontend | Backend | Notes | Safe to delete? |
|----------|---------|-------|-----------------|
| `frontend/lib/analytics-metadata.ts` | `backend/analytics_metadata.py` | Both actively imported in respective stacks | **No** |

### 6.3 Layered chart/layout utilities (keep all — not redundant)

| Layer | Files | Role |
|-------|-------|------|
| Axis math | `chart-axis-layout.ts` | Core margins |
| Overview plots | `overview-dashboard-plot-layout.ts` | Mini-card cartesian plans |
| Detail plots | `shared-chart-layout.ts` | Insights + Charts tab band |
| Config facade | `chart-layout-config.ts` | Timeline types; re-exports shared layout |
| PNG export | `chart-png-export-layout.ts`, `radial-export-layout.ts` | Export dimensions |
| Overview grid | `overview-chart-grid-layout.ts` | 2-col grid CSS |

### 6.4 Layered export utilities (current production stack — keep)

```
PNG: chart-png-export-session.ts → chart-png-capture.ts → chart-png-export-svg-polish.ts
PDF: build-executive-pdf-input.ts → resolve-pdf-export-context.ts → app/pdf-report.ts (Canvg + jsPDF)
```

| File path | Why NOT duplicate | Safe to delete? |
|-----------|-------------------|-----------------|
| `frontend/lib/export-tab-preview.ts` | Preview data assembly | **No** |
| `frontend/lib/export-tab-ui.ts` | CSS tokens for Export tab | **No** |
| `frontend/lib/pdf-export-quota.ts` | Quota gating | **No** |

---

## 7. Legacy export implementations replaced by current code

**No alternate PDF or PNG export pipeline found.** Production uses Canvg + jsPDF (`app/pdf-report.ts`) and canvas composite PNG export (`chart-png-capture.ts`). No active `html2canvas` export path.

### 7.1 Deprecated wrappers still imported (shim layer — not legacy pipeline)

| File path | Symbol | Replacement | Last known references | Confidence | Safe to delete? |
|-----------|--------|-------------|------------------------|------------|-----------------|
| `frontend/lib/chart-layout-config.ts` | `getInsightLayoutMetrics()` | `getSharedDetailLayoutMetrics()` | Re-export consumers | **High** | **Review First** (remove after call-site migration) |
| `frontend/lib/chart-layout-config.ts` | `resolveDetailPlotHeight()` | `resolveSharedDetailPlotHeight()` | Re-export consumers | **High** | **Review First** |
| `frontend/lib/ai-insights-ui.ts` | `aiInsightsSuggestedQ*` deprecated aliases | `aiInsightsSuggestedQ` | Import stability | **Medium** | **No** (documented shims) |
| `frontend/lib/insight-confidence.ts` | `calculateInsightConfidence` alias | Newer API in same file | Grep before remove | **Medium** | **Review First** |

### 7.2 Removed legacy module (already cleaned)

| File path | Replaced by | Status |
|-----------|-------------|--------|
| `frontend/lib/overview-chart-heuristics.ts` | `final-chart-presentation.ts` | **Deleted** June 6, 2026 |

### 7.3 Manual export validation harness (not production code)

| File path | Role | Safe to delete? |
|-----------|------|-----------------|
| `frontend/lib/phase7-pdf-generate.test.ts` | Writes PDF matrix to `docs/pdf-validation-screenshots/` | **No** — QA harness |
| `frontend/vitest.phase7.config.ts` | Separate Vitest config for Phase 7 | **No** |
| `docs/phase7-pdf-generate.ts` | Doc-side PDF helper | **Review First** |

---

## 8. Empty folders

| Folder path | Why empty | Last known references | Confidence | Safe to delete? |
|-------------|-----------|------------------------|------------|-----------------|
| `frontend/lib/__mocks__` | Vitest/Jest mock placeholder; never populated | **0** | **High** | **Yes** |
| `.venv/Include` | Python venv placeholder (Windows) | N/A (gitignored) | **High** | **No** (recreates with venv) |
| `frontend/.venv/Include` | Same | Gitignored | **High** | **No** |
| `project_backups/.../frontend/.venv/Include` | Accidental venv inside backup tree | Gitignored | **High** | **Review First** (remove whole backup `.venv`) |

---

## 9. Backend module audit (supplemental)

| Finding | Details |
|---------|---------|
| Unused runtime Python modules | **0** — all `services/` and `intent_engine/` modules reachable from `main.py` |
| Dead symbols (not files) | Documented in `docs/dead-code-audit.md` (`main.py::_scoped_follow_up_question`, several unused exports in `intent_engine/`) |
| `backend/scripts/` (21 files) | Manual QA only — same category as §1.4 |

---

## 10. Generated / gitignored artifacts (should not be committed)

| Pattern / path | Status |
|----------------|--------|
| `frontend/.next/` | Gitignored; dev build cache |
| `node_modules/` | Gitignored |
| `.venv/`, `__pycache__/`, `.pytest_cache/` | Gitignored |
| `project_backups/**/frontend/`, `backend/` copies | Gitignored (manifests tracked) |

Initial git status showed many untracked `frontend/.next/**` files — correct to leave untracked.

---

## 11. Recommended cleanup phases

### Phase A — High confidence, low risk

1. Delete `frontend/app/components/home/charts-tab-intelligence-strip.tsx` and unused `chartsTabIntel*` exports in `charts-tab-ui.ts`.
2. Delete root `requirements.txt` and root `package-lock.json` after updating any doc links.
3. Delete `docs/_lint-before.txt`, `docs/_lint-after.txt`.
4. Remove empty `frontend/lib/__mocks__/`.
5. Update stale doc links to removed `overview-chart-heuristics.ts` in `docs/file-map.md` and `docs/root-cause-analysis.md`.

### Phase B — Review with team (documentation & assets)

1. Archive `docs/**` PNG screenshot folders to external storage; keep runbooks and JSON/PDF validation matrix.
2. Consolidate legacy baseline markdown aliases (§2.1) into canonical `AGENTS.md` set with redirect stubs.
3. Merge duplicate `system-understanding.md` / `file-map.md` copies to single canonical paths under `docs/`.
4. Consolidate CSV fixtures to one canonical source (`test-fixtures/`) with copy script for `frontend/public/`.

### Phase C — Optional hygiene

1. Relocate `backend/scripts/` and `frontend/scripts/` to `tools/` with README index.
2. Rename misnamed test files (§5.1) for clarity.
3. Remove deprecated `@deprecated` wrappers after call-site migration.
4. Prune disk-only `project_backups/.../.venv` if backup trees are retained locally.

---

## 12. Cross-reference: prior audits

| Document | Date | Alignment |
|----------|------|-------------|
| `docs/unused-files-audit.md` | June 6, 2026 | Still accurate; `overview-chart-heuristics.ts` already removed |
| `docs/dead-code-audit.md` | June 6, 2026 | Symbol-level dead code; monolith refactor guidance |
| `docs/chart-ui-polish-snapshot/stable-baseline-status.md` | June 16, 2026 | Chart polish baseline at `4247ef3` |

---

*Report generated by read-only repository audit. No application files were modified.*
