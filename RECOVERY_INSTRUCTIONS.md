# Recovery Instructions — Stable PDF Export Phase 2

Use this guide to restore the **2026-05-21** stable checkpoint if a future session breaks UI, PDF, charts, or insights.

---

## 1. What is protected

| Asset | Location |
|-------|----------|
| Full filesystem backup | `project_backups/stable_export_pdf_phase2_backup_2026-05-21/` |
| Git checkpoint branch | `stable/pdf-export-phase2` |
| Baseline docs | `PROJECT_ARCHITECTURE_SUMMARY.md`, `PDF_EXPORT_STABLE_BASELINE.md`, `UI_UX_STABLE_BASELINE.md`, `CURRENT_BUG_STATUS.md` |
| Agent rules | `AGENTS.md`, `UI_BASELINE_RULES.md` |

---

## 2. Restore from filesystem backup

### Step A — Backup current work (optional)

```powershell
cd D:\Projects\AI-Data-Analyst-App
git stash push -u -m "pre-recovery-wip"
```

### Step B — Restore source trees

```powershell
$backup = "D:\Projects\AI-Data-Analyst-App\project_backups\stable_export_pdf_phase2_backup_2026-05-21"
$root = "D:\Projects\AI-Data-Analyst-App"

# Replace frontend and backend (destructive — confirm path first)
Remove-Item -Recurse -Force "$root\frontend" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$root\backend" -ErrorAction SilentlyContinue
Copy-Item -Recurse "$backup\frontend" "$root\frontend"
Copy-Item -Recurse "$backup\backend" "$root\backend"
if (Test-Path "$backup\tests") { Copy-Item -Recurse "$backup\tests" "$root\tests" -Force }
```

### Step C — Reinstall dependencies

```powershell
cd D:\Projects\AI-Data-Analyst-App\frontend
npm install

cd D:\Projects\AI-Data-Analyst-App
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

### Step D — Verify

```powershell
cd frontend
npx tsc --noEmit
npm run build
```

Run app: `npm run dev` (frontend) + backend per your usual start command.

---

## 3. Restore from Git

```powershell
cd D:\Projects\AI-Data-Analyst-App
git fetch origin
git checkout stable/pdf-export-phase2
# Or create local branch from tag/commit:
# git checkout -b stable/pdf-export-phase2 origin/stable/pdf-export-phase2
```

To pin `DEV` to this checkpoint:

```powershell
git checkout DEV
git reset --hard stable/pdf-export-phase2
```

**Warning:** `reset --hard` discards uncommitted work on `DEV`.

---

## 4. Important folders — do not delete casually

| Path | Why |
|------|-----|
| `frontend/app/pdf-report.ts` | Entire PDF engine |
| `frontend/lib/pdf-enterprise-style.ts` | PDF tokens, footer, chart sizing |
| `frontend/lib/pdf-date-format.ts` | Date formatting |
| `frontend/lib/metric-value-format.ts` | Appendix raw values |
| `frontend/app/page.tsx` | SPA, export payload, capture refs |
| `frontend/app/components/home/chart-renderer.tsx` | Shared charts |
| `frontend/contexts/chart-session-context.tsx` | Chart history |
| `frontend/lib/final-chart-presentation.ts` | Chart semantics |
| `frontend/lib/chart-layout-config.ts` | Insight/Charts viewport |
| `backend/main.py` | API + pandas |
| `project_backups/` | Offline snapshots |
| `AGENTS.md` / `UI_BASELINE_RULES.md` | Agent constraints |

---

## 5. PDF-sensitive files

Touch only for intentional PDF work; regression-test full export after any edit:

- `frontend/app/pdf-report.ts`
- `frontend/lib/pdf-enterprise-style.ts`
- `frontend/lib/metric-value-format.ts`
- Export assembly in `frontend/app/page.tsx` (`downloadReport`, `ExecutivePdfExportInput`)

Read [`PDF_EXPORT_STABLE_BASELINE.md`](PDF_EXPORT_STABLE_BASELINE.md) first.

---

## 6. Chart-sensitive files

- `frontend/app/components/home/chart-renderer.tsx`
- `frontend/lib/final-chart-presentation.ts`
- `frontend/lib/chart-axis-layout.ts`
- `frontend/lib/selected-visualization.ts`
- `frontend/app/components/ai-insight-chart-shell.tsx`
- `frontend/app/components/home/chart-insight-viewport-wrapper.tsx`

Read [`CHARTS_STABLE_SUMMARY.md`](CHARTS_STABLE_SUMMARY.md) and [`AI_VISUALIZATION_BEHAVIOR.md`](AI_VISUALIZATION_BEHAVIOR.md).

---

## 7. Responsive layout–sensitive files

- `frontend/app/page.tsx` (viewport state, tab layouts)
- `frontend/lib/ai-insights-ui.ts`, `charts-tab-ui.ts`, `overview-ui.ts`
- `frontend/app/globals.css`
- `frontend/components/app-shell/`

---

## 8. Continuing future work safely

1. Branch from `stable/pdf-export-phase2` (or current `DEV` if aligned).
2. Read `AGENTS.md` and relevant `*_STABLE_*.md` before Insights/Charts/PDF edits.
3. Prefer **narrow fixes** — one layer per bug.
4. Run `npx tsc --noEmit` and a full PDF export smoke test before merging.

---

## 9. Backup verification

Check `project_backups/stable_export_pdf_phase2_backup_2026-05-21/BACKUP_SOURCE.txt` for git commit hash at backup time. Compare:

```powershell
git rev-parse HEAD
Get-Content project_backups\stable_export_pdf_phase2_backup_2026-05-21\BACKUP_SOURCE.txt
```

---

*Recovery point: 2026-05-21 — PDF Export Phase 2 stable.*
