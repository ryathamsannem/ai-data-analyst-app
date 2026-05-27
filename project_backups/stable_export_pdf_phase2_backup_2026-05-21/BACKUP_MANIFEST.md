# Backup manifest — stable_export_pdf_phase2_backup_2026-05-21

| Field | Value |
|-------|--------|
| **Created** | 2026-05-21 |
| **Git branch (source)** | `DEV` |
| **Git commit** | `10a400d` (verify with `BACKUP_SOURCE.txt`) |
| **Checkpoint name** | PDF Export Phase 2 stable |
| **Suggested git branch** | `stable/pdf-export-phase2` |

## Included

- `frontend/` — source only (no `node_modules`, `.next`)
- `backend/` — Python API (no `__pycache__`)
- `tests/` — fixtures
- Root baseline docs (`AGENTS.md`, `*_STABLE_*.md`, `UI_*.md`, etc.)
- `package.json.frontend`, `requirements.txt.backend` copies at backup root

## Excluded (reinstall after restore)

- `node_modules/`, `.next/`, `.venv/`, `__pycache__/`
- `.env`, logs, OS junk
- `.cursor/` (per root `.gitignore`)

## Critical paths in this backup

| Area | Path |
|------|------|
| PDF engine | `frontend/app/pdf-report.ts` |
| PDF tokens | `frontend/lib/pdf-enterprise-style.ts` |
| PDF dates | `frontend/lib/pdf-date-format.ts` |
| Metric formatting | `frontend/lib/metric-value-format.ts` |
| Main SPA | `frontend/app/page.tsx` |
| Chart renderer | `frontend/app/components/home/chart-renderer.tsx` |
| Session store | `frontend/contexts/chart-session-context.tsx` |
| Backend API | `backend/main.py` |

## Restore

See repository root [`RECOVERY_INSTRUCTIONS.md`](../../RECOVERY_INSTRUCTIONS.md).
