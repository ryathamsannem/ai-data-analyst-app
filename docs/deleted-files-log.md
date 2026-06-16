# Deleted Files Log — Repository Cleanup Phase A

**Date:** June 16, 2026  
**Branch:** DEV  
**Reference:** `docs/repository-cleanup-report.md` (Phase A — high-confidence, low-risk)

---

## Summary

| Action | Count |
|--------|-------|
| Files deleted | 5 |
| Directories removed | 1 (empty) |
| Files edited | 1 |

---

## Deleted files

| Path | Reason |
|------|--------|
| `frontend/app/components/home/charts-tab-intelligence-strip.tsx` | Unused component — never imported; Charts tab uses `charts-tab-chart-reason.tsx` and inlined preview in `page.tsx`. |
| `requirements.txt` (repo root) | Stale full-environment pin list; canonical deploy path is `backend/requirements.txt` (`render.yaml` uses `rootDir: backend`). |
| `package-lock.json` (repo root) | Empty npm stub (`"packages": {}`); real lockfile is `frontend/package-lock.json`. |
| `docs/_lint-before.txt` | Temporary lint diff capture; no code or doc references. |
| `docs/_lint-after.txt` | Temporary lint diff capture; no code or doc references. |

## Removed directories

| Path | Reason |
|------|--------|
| `frontend/lib/__mocks__/` | Empty Vitest/Jest mock placeholder; never populated. |

---

## Edited files

| Path | Change |
|------|--------|
| `frontend/lib/charts-tab-ui.ts` | Removed unused `chartsTabIntel*` CSS token exports (only consumer was deleted component). Kept all `chartsTabChartReason*` exports. |

---

## Not deleted (per Phase A scope)

- `docs/` screenshots and PDF validation artifacts  
- `docs/chart-ui-polish-snapshot/`  
- `docs/overview-*` folders  
- Tests, backend scripts, frontend scripts  
- `project_backups/`  
- `AGENTS.md` baseline documentation  
- Chart renderer / layout runtime files  

---

## Validation

| Command | Result | Notes |
|---------|--------|-------|
| `npm run test` (frontend) | **463 passed, 2 failed** | Failures in `lib/chart-layout-config.test.ts` (scatter height 560 vs expected 540) — **pre-existing plot-v4 test drift**; unrelated to Phase A deletions. |
| `npm run build` (frontend) | **Failed** | TypeScript error in `app/page.tsx:5096` (`trendSide.right` union type) — **pre-existing**; unrelated to Phase A deletions. |

Phase A deletions were **not restored** — no failure was caused by the deleted/edited files above.

