# Current Status

**Snapshot date:** June 16, 2026

---

## Git state

| Item | Value |
|------|-------|
| **Branch** | `DEV` |
| **Latest commit** | `8cddf08` — *Clean unused files and update validation after chart polish* (2026-06-16) |
| **Remote** | `origin/DEV` — **ahead by 1 commit** (not pushed at snapshot time) |
| **Merge base** | In sync with `origin/DEV` ancestry; local tip is one commit ahead |

### Recent commits (newest first)

| Commit | Summary |
|--------|---------|
| `8cddf08` | Phase A cleanup + test/build fixes after chart polish |
| `0956e35` | Chart UI polish baseline — plot-v4 internals (Y-axis, line styling, 580px continuous plots) |
| `319481f` | Overview dashboard fixes |
| `4247ef3` | Stable testing checkpoint — bulk performance still pending |

---

## What is stable now

- **Overview** — KPI cards, auto-dashboard grid, mini charts, filters, drill-down, per-card PNG
- **Data Preview** — paginated table, schema/quality headers, search/sort
- **AI Insights** — Ask AI, alignment gates, executive insights, PDF export button when aligned
- **Charts tab** — timeline, session preview, PNG download, SmartChartInsightPanel
- **Export tab** — executive PDF with section toggles and branding
- **Chart rendering (session detail)** — full-width shells (960px frame); plot-v4 internals for line/area/scatter; H-Bar/Donut unchanged
- **Backend routing** — intent engine + regression test pack green
- **Frontend validation** — all tests and production build passing

---

## What changed recently (chart polish + cleanup)

### Chart UI polish (`0956e35`)

- **Line/area/scatter (Charts + AI Insights detail only):** 580px plot allocation (560px floor), premium rounded Y-axis (5% pad), tighter Recharts margins (top 2px, bottom ≤30px, X-band 44px), 3px line stroke, r=5 markers
- **H-Bar / Donut / Overview:** layout paths preserved; no shell max-width experiments restored
- **Rejected experiments not restored:** narrow viewport (520–640px), centered chart island, shell/CSS width changes

### Phase A cleanup + fixes (`8cddf08`)

- Deleted unused `charts-tab-intelligence-strip.tsx`, stale root `requirements.txt` / `package-lock.json`, lint scratch files, empty `__mocks__`
- Removed dead `chartsTabIntel*` CSS exports
- Fixed stale test expectations (`chart-layout-config.test.ts`) and TypeScript union in `page.tsx` (overview trend margins)

---

## Test / build status

| Command | Result (post-fix) |
|---------|-------------------|
| `cd frontend && npm run test` | **465 / 465 passed** (63 files) |
| `cd frontend && npm run build` | **Success** — TypeScript + static generation |

Backend: `python -m pytest tests/intent_engine/` — not re-run for this snapshot; last stable checkpoint reports green.

---

## Deployment notes

- **Backend deps:** `backend/requirements.txt` (Render `rootDir: backend`)
- **Frontend deps:** `frontend/package-lock.json`
- **Export/PDF:** functional; product polish phase not finalized (see `open-issues.md`)
