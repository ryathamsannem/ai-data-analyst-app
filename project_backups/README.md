# Project backups

Full filesystem snapshots of the AI Data Analyst App for recovery between major phases.

| Folder | Purpose |
|--------|---------|
| `stable_export_pdf_phase2_backup_2026-05-21/` | Stable checkpoint after PDF export Phase 2 polish (enterprise layout, appendix, preview tables, footer). |

**Note:** Backups exclude `node_modules`, `.next`, `.venv`, and `__pycache__`. Run `npm install` in `frontend/` and recreate Python venv after restore.

See [`RECOVERY_INSTRUCTIONS.md`](../RECOVERY_INSTRUCTIONS.md) at the repository root.
