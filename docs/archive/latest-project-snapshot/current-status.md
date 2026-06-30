# Current Status

**Snapshot date:** June 21, 2026  
**Branch:** `DEV`  
**Latest commit (HEAD):** `e42d62fe615181e2a24034fa9d4d6f85a82181f6` — *histogram done and do-nut premium*  
**Working tree:** Uncommitted changes present (radial export legend/footer tuning, rate-warning suppression, Overview mini-radial polish). See [Discrepancies](#snapshot-discrepancies) below.

---

## Quality Status (verified June 21, 2026)

| Check | Result |
|-------|--------|
| Frontend tests | **561 passed** (71 files) — `cd frontend && npm run test` |
| Backend tests | **339 passed** — `cd backend && python -m pytest` |
| Frontend build | **Pass** — Next.js 16.2.4 production build |
| Deployment / CI | **No `.github/` workflows or deployment config observed in repository** |

---

## Architecture Overview

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | Next.js 16.2.4, React 19.2.4, Tailwind v4, Recharts 3 | Single-route SPA in `frontend/app/page.tsx` |
| Backend | FastAPI, pandas | In-memory `df` per process — one active dataset |
| AI narrative | Claude via `POST /ask` | Chart **data** is deterministic pandas, not LLM-generated |
| PDF | jsPDF + Canvg (`frontend/app/pdf-report.ts`) | Prefers `ChartArtifact` PNG before legacy DOM capture |
| Persistence | Client-only | Theme, sidebar, branding in localStorage |

### Repository layout (high level)

```
frontend/
  app/page.tsx                 → all tabs, filters, upload, export orchestration
  app/components/home/         → ChartRenderer, filters, overview cards
  app/pdf-report.ts            → executive PDF engine
  contexts/chart-session-context.tsx
  lib/                         → chart pipeline, export, presentation, data preview
backend/
  main.py                      → HTTP routes, viz engine, AI ask pipeline
  intent_engine/               → intent routing helpers
  services/                    → parsers, KPI cards, auto-dashboard
```

**Related baseline docs (root):** [`PROJECT_ARCHITECTURE_SUMMARY.md`](../../PROJECT_ARCHITECTURE_SUMMARY.md) · [`AGENTS.md`](../../AGENTS.md) · [`CHARTS_STABLE_SUMMARY.md`](../../CHARTS_STABLE_SUMMARY.md) · [`AI_INSIGHTS_STABLE_SUMMARY.md`](../../AI_INSIGHTS_STABLE_SUMMARY.md)

---

## Major Completed Features (current codebase)

### Product surfaces

| Surface | Status |
|---------|--------|
| **Overview** | Upload, KPI cards, filters, auto-dashboard grid, drill path, per-card PNG export |
| **Data Preview** | Paginated table, schema/quality metadata, search/sort |
| **AI Insights** | Ask AI, alignment gates, suggested questions, executive cards, AI Read, insight PDF |
| **Charts tab** | Session timeline, selected chart preview, SmartChartInsightPanel, PNG export |
| **Export** | Executive PDF with section selection, branding, quota preflight |

### Chart platform (completed through June 2026)

| Area | Status |
|------|--------|
| **H-Bar parity** | `resolveBarFamilyKind()` canonical policy; Overview/Charts/AI/PNG/PDF aligned |
| **V-Bar / histogram** | Shared value-axis domain via `resolveVerticalBarValueAxisProps`; Overview live plot boost +28px |
| **Line / Area** | Y-axis domain parity via `overview-premium-axis-domain.ts` + shared session helpers |
| **Scatter** | Point sizing, plot-band alignment, PDF content-tight composite |
| **Histogram** | Backend intent routing + frontend `histogram` kind in Overview/ChartRenderer |
| **Donut / Pie routing** | Share/composition questions route to pie/donut; executive-risk overrides blocked |
| **Overview mini-radial** | Live compact donuts via `overviewMiniRadial` + `overview-mini-radial-polish.ts` |
| **Radial export** | Proportional export radii, external composite legend, PDF/PNG parity |
| **Rate-warning suppression** | Valid share/composition donuts suppress misleading rate>100% warning |
| **Auto-dashboard titles** | `{dim} {metric} Share` pattern in `auto_dashboard_opportunities.py` |

### Export platform

| Component | Status |
|-----------|--------|
| `ChartPresentationContract` | Drives metadata chips and PDF-native headers |
| `ChartPngCaptureRequest` → `ChartArtifact` | Shared by Overview PNG, Charts PNG, PDF |
| `ChartPresentationProfile` | Per-surface dimensions (`overviewLive`, `overviewPng`, `chartsLive`, `chartsPng`, `aiInsightsLive`, `pdfChart`) |
| PDF embed policy | Kind-aware sizing via `resolvePdfChartEmbedPolicy()` |
| Radial export pipeline | `resolveProportionalExportRadialRadii` + `renderLegendChromeToPng` composite |

### AI Insights (stable behaviors)

| Area | Status |
|------|--------|
| Follow-up suggestions | `ai-follow-up-suggestions.ts`, semantic dedupe, continuation classifier |
| Routing consistency | Backend `routing_consistency.py` + frontend `final-chart-presentation.ts` |
| Confidence display | Normalized viz metadata confidence; PDF executive content includes rationale |
| Correlation / relationship | `relationship-scatter-presentation.ts`, backend correlation intent tests |
| Alignment gates | `insightChartMatchesCurrentQuestion`, `chartSnapshotMatchesQuestionIntent` before viz/export |

---

## Remaining Work (high level)

See [`open-issues.md`](./open-issues.md) for tracked items. Summary:

- Dual chart pipeline (Overview inline vs `ChartRenderer`) — primary drift risk
- No browser/E2E export regression suite
- Production blockers: auth, durable dataset/session, plan enforcement
- PDF charts remain rasterized (PNG embed)

---

## Recommended Next Priorities

1. **Commit and tag** current working-tree chart/export fixes as the new baseline commit.
2. **Manual 6-surface export matrix** — Overview/Charts PNG + PDF for bar, histogram, scatter, donut (smoke after any chart change).
3. **H-Bar tick/domain audit** — remaining cross-surface gaps if any user-reported drift appears.
4. **Browser E2E for export** — highest-value regression guard for artifact platform.
5. **Production readiness** — auth, server-side dataset, usage tracking (product decision).

---

## Snapshot Discrepancies

| Item | Detail |
|------|--------|
| Previous snapshot | Dated **June 18, 2026**; test count cited as 540+ frontend |
| Current test count | **561** frontend, **339** backend |
| Uncommitted changes | Radial export legend/footer constants, `resolveProportionalExportRadialRadii`, rate-warning helper, Overview mini-radial polish — **not in HEAD** |
| HEAD commit message | References "do-nut premium"; premium Overview custom radial UI (`overview-mini-radial-chart.tsx`) is **not present** in tree (rolled back) |
| PDF validation PDFs | Modified in working tree under `docs/pdf-validation-screenshots/` |
| Deployment | Not documented in repo; no CI workflow files found |
