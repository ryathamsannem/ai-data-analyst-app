# Architecture Summary

**Snapshot:** June 16, 2026 — post chart UI polish + Phase A cleanup

---

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind v4, Recharts 3 |
| Backend | FastAPI, pandas (in-memory `df` per process) |
| AI narrative | Claude via `POST /ask` |
| Chart data | Deterministic pandas aggregation (not LLM-generated series) |
| PDF | jsPDF + Canvg (`frontend/app/pdf-report.ts`) |
| PNG | Canvg canvas composite (`frontend/lib/chart-png-export-session.ts`) |

---

## Repository layout

```
frontend/
  app/page.tsx              → single SPA (~14k lines): all tabs + state
  app/pdf-report.ts         → PDF engine
  app/components/           → shells, chart-renderer, insight panels
  contexts/chart-session-context.tsx
  lib/                      → chart pipeline, tab tokens, export helpers

backend/
  main.py                   → HTTP routes + viz + narrative
  analytics_metadata.py
  services/                 → parsers, limits, KPI cards, CORS
  intent_engine/            → question routing modules
```

---

## Main tabs

| Tab | ID | Primary role |
|-----|-----|--------------|
| Overview | `overview` | Upload, KPIs, auto-dashboard, filters |
| Data Preview | `preview` | Paginated filtered table |
| AI Insights | `insights` | Ask AI, aligned viz, executive cards, insight PDF |
| Charts | `charts` | Session timeline + preview + PNG |
| Export | `export` | Full executive PDF assembly |

Navigation: `AppShell` sidebar + `useTransition` tab switching. No per-tab URLs.

---

## Chart pipelines (dual)

### Pipeline A — Overview mini cards

- **Builder:** `buildOverviewDashboardPlot` in `page.tsx`
- **Layout:** `overview-dashboard-plot-layout.ts`, `final-chart-presentation.ts`
- **Renderer:** inline Recharts in `page.tsx` (compact mode)
- **Plot band:** ~300–340px card height (mobile/desktop), continuous kinds get boost constants
- **Export:** per-card PNG via offscreen portal + `overview-dashboard-export.ts`

### Pipeline B — Session detail (Charts tab + AI Insights)

- **Renderer:** `ChartRenderer` (`chart-renderer.tsx`) with `detailLayout` / `insightMode`
- **Dimensions:** `shared-chart-layout.ts` → `chart-layout-config.ts`
- **Shell:** `AiInsightChartShell` (960px frame) → `ChartInsightViewportWrapper` (kind max-width)
- **Gates (Insights only):** `insightChartMatchesCurrentQuestion`, `chartSnapshotMatchesQuestionIntent`

Both pipelines share axis formatters, palette, and chart kind semantics (`ChartKind`).

---

## Export paths

| Export | Entry | Engine |
|--------|-------|--------|
| Overview card PNG | Per-card button | `chart-png-export-session.ts` + offscreen host |
| Charts tab PNG | Timeline preview | Same session export path |
| AI Insights PDF | Export this insight | `build-executive-pdf-input.ts` → `pdf-report.ts` |
| Full executive PDF | Export tab | `page.tsx` assembly → `pdf-report.ts` |

PNG and PDF reuse aligned chart images where gates pass. PDF uses print-light theme.

---

## Backend request flow (AI Insights)

```
POST /ask
  → apply filters
  → compute_visualization_for_question (intent_engine)
  → Claude narrative with grounding blocks
  → frontend alignment gates before viz/export
```

---

## Key contexts & state

- **Chart session:** `ChartSessionProvider` — timeline entries, selected chart, auto-dashboard sync
- **Filters:** `HomeInner` local state; Overview + Insights share filter bar
- **Plan/usage:** client session headers + `usage_tracker` (in-memory)

See [`file-map.md`](file-map.md) for edit boundaries.
