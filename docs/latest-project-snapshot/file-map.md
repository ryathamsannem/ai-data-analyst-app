# File Map

**Important files only** — safe edit zones vs avoid zones (June 16, 2026)

---

## Frontend — safe to edit (scoped fixes)

| Path | Role |
|------|------|
| `frontend/lib/shared-chart-layout.ts` | Session detail plot height / viewport metrics |
| `frontend/lib/overview-premium-axis-domain.ts` | Premium Y-axis domains, session detail margins |
| `frontend/lib/chart-layout-config.ts` | Viewport max-width classes, margin presets |
| `frontend/lib/chart-axis-layout.ts` | Axis width / margin math |
| `frontend/lib/chart-time-x-axis.ts` | Trend X-axis ticks, bottom margin |
| `frontend/app/components/home/chart-renderer.tsx` | Shared Recharts renderer (all kinds) |
| `frontend/lib/charts-tab-ui.ts` | Charts tab CSS tokens |
| `frontend/lib/ai-insights-ui.ts` | AI Insights CSS tokens |
| `frontend/app/components/home/charts-tab-chart-reason.tsx` | “Why this chart” strip |
| `frontend/app/components/SmartChartInsightPanel.tsx` | AI Read panel |
| `frontend/lib/chart-png-export-*.ts` | PNG export pipeline |
| `frontend/app/pdf-report.ts` | PDF rendering |
| `frontend/lib/build-executive-pdf-input.ts` | PDF input assembly |
| `frontend/contexts/chart-session-context.tsx` | Timeline session state |

---

## Frontend — edit with care

| Path | Why careful |
|------|-------------|
| `frontend/app/page.tsx` | Monolith (~14k lines) — all tabs; high conflict risk |
| `frontend/app/components/ai-insight-chart-shell.tsx` | Fixed 960px frame — baseline shell |
| `frontend/app/components/home/chart-insight-viewport-wrapper.tsx` | Kind viewport caps — baseline shell |
| `frontend/lib/overview-dashboard-plot-layout.ts` | Overview mini pipeline only |
| `frontend/lib/final-chart-presentation.ts` | Overview chart kind selection |
| `frontend/app/components/home/chart-renderer.tsx` H-Bar/Donut branches | Reference premium layouts |

---

## Frontend — avoid unless task requires

| Path | Reason |
|------|--------|
| `frontend/app/globals.css` (chart/shell sections) | Broad visual blast radius |
| `frontend/lib/chart-renderer` H-Bar / Donut / pie sections | Stable reference layouts |
| Overview inline plot block in `page.tsx` | Separate pipeline; don’t mix with session detail |
| `frontend/app/chart-types.ts` | Kind semantics across all surfaces |

---

## Backend — safe to edit

| Path | Role |
|------|------|
| `backend/intent_engine/*.py` | Question routing (with regression tests) |
| `backend/services/file_parsers.py` | Upload parsing |
| `backend/services/executive_kpi_cards.py` | KPI generation |
| `backend/analytics_metadata.py` | Title/metric label builders |
| `backend/tests/intent_engine/` | Routing regression pack |

---

## Backend — avoid broad edits

| Path | Reason |
|------|--------|
| `backend/main.py` | Monolith (~11k lines); routing order fragile |
| `backend/main.py` `compute_visualization_for_question` | Core viz pipeline |

---

## Docs & config (safe)

| Path | Role |
|------|------|
| `AGENTS.md` + `*_STABLE_SUMMARY.md` | Product baseline rules |
| `docs/latest-project-snapshot/` | This snapshot |
| `render.yaml` | Backend deploy (`rootDir: backend`) |
| `backend/requirements.txt` | Canonical Python deps |

---

## Tests to run after chart changes

```bash
cd frontend && npm run test && npm run build
cd backend && python -m pytest tests/intent_engine/ -q
```
