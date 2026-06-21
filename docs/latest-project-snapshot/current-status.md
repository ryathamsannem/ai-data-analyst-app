# Current Status

**Snapshot date:** June 18, 2026  
**Branch:** `DEV` (working tree)  
**Latest commit at snapshot time:** `d79410f` — *Polish vertical bar presentation parity*

---

## Architecture Overview

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind v4, Recharts 3 | Single-route SPA in `frontend/app/page.tsx` |
| Backend | FastAPI, pandas | In-memory `df` per process — one active dataset |
| AI narrative | Claude (`claude-haiku-4-5`) via `POST /ask` | Chart **data** is deterministic pandas, not LLM-generated |
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

**Related baseline docs (root):** [`PROJECT_ARCHITECTURE_SUMMARY.md`](../../PROJECT_ARCHITECTURE_SUMMARY.md) · [`AGENTS.md`](../../AGENTS.md) · [`CHARTS_STABLE_SUMMARY.md`](../../CHARTS_STABLE_SUMMARY.md) · [`AI_INSIGHTS_STABLE_SUMMARY.md`](../../AI_INSIGHTS_STABLE_SUMMARY.md) · [`PDF_EXPORT_STABLE_BASELINE.md`](../../PDF_EXPORT_STABLE_BASELINE.md)

---

## Major Completed Features

### Product surfaces (stable)

| Surface | Status |
|---------|--------|
| **Overview** | Upload, KPI cards, filters, auto-dashboard grid, drill path, per-card PNG export |
| **Data Preview** | Paginated table, schema/quality metadata, search/sort, profile popovers |
| **AI Insights** | Ask AI, alignment gates, suggested questions, executive cards, AI Read, insight PDF |
| **Charts tab** | Session timeline, selected chart preview, SmartChartInsightPanel, PNG export |
| **Export** | Executive PDF with section selection, branding, quota preflight |

### Chart platform (completed phases)

1. **Presentation contract** — `ChartPresentationContract` + `VisualizationContract` frozen at snapshot time; drives metadata chips and PDF-native headers.
2. **Capture artifact platform** — `ChartPngCaptureRequest` → `ChartCaptureHost` → `captureChartPngArtifact()` → `ChartArtifact`; shared by Overview PNG, Charts PNG, and PDF.
3. **Presentation profile** — read-only `ChartPresentationProfile` per surface (`overviewLive`, `overviewPng`, `chartsLive`, `chartsPng`, `aiInsightsLive`, `pdfChart`); dimensions, axis policy id, PDF embed policy.
4. **Axis presentation plan (partial)** — `AxisPresentationPlan` + `resolveVerticalBarValueAxisProps` / H-Bar helpers; vertical bar + histogram value-axis domain parity landed in `3161616` / `cb87011`.
5. **PDF artifact path** — PDF chart images prefer captured artifacts; native contract chips in chart header panel; kind-aware embed sizing via `pdfEmbed`.

---

## Recent Chart Parity Work (June 2026)

### Chart-kind routing unification

- **`resolveBarFamilyKind()`** in `frontend/lib/final-chart-presentation.ts` is the canonical bar-family policy across Overview, Charts, AI Insights, PNG, and PDF.
- Backend removed `"compare"` from H-Bar-only triggers so compact comparisons (e.g. 4 regions) resolve to **vertical bar** consistently.
- Overview layout override that flipped narrow cards to H-Bar via `allowHorizontalBarFallback` was disabled; session snapshots persist **`displayKind`**, not layout-flipped kind.
- Charts PNG export uses session `chartKind` for bar family, not stale `overviewEffectiveChartKind`.

### Vertical bar presentation parity (`d79410f`)

| Surface | Fix |
|---------|-----|
| Overview live | `maxBarSize` 52, `barCategoryGap` 16% (≤6 cats), +28px plot boost |
| Charts / Insights live | `SHARED_CHART_LAYOUT.verticalBar` — 16% gap, 520px plot floor for compact bars |
| PDF | Content-tight composite (same pattern as scatter); embed `minWidthRatio: 0.88`, `maxHeightMm: 150` |

### Scatter PDF sizing (prior)

- Content-tight composite for `pdfChart` + `scatter` to avoid small chart in large dark frame.
- Extended to vertical bar in latest polish.

---

## Production Readiness Status

| Area | Readiness | Blockers |
|------|-----------|----------|
| **Demo / pilot UX** | High | Modern SaaS dashboard, stable tab flows, export works |
| **Chart visual parity** | Medium–High | Kind routing unified; V-Bar presentation aligned; dual renderer pipelines remain |
| **Export reliability** | High | Artifact capture + readiness; blank PNG/PDF charts largely resolved |
| **Multi-user production** | Low | No auth; global in-memory dataset; client-spoofable plan tier |
| **Backend scale** | Low | Single-process dataset; no durable usage; limited integration tests |
| **Automated E2E** | Low | Unit tests strong (540+); no browser export regression suite |

**Validation at snapshot time:**

```bash
cd frontend && npm run test   # 70 files / 540 tests passed
cd frontend && npm run build  # passed
```

See [`open-issues.md`](./open-issues.md) for full issue inventory.

---

## Remaining Known Issues (summary)

- **Dual chart pipelines:** Overview inline Recharts in `page.tsx` vs shared `ChartRenderer` — main long-term visual drift risk.
- **Axis parity:** Vertical bar/histogram domains centralized; H-Bar and some cross-surface tick spacing may still differ.
- **Platform:** No authentication, no durable multi-tenant dataset isolation, PDF is main-thread heavy.
- **Testing:** Export parity relies on unit tests + manual matrix; no Playwright export suite.

Full detail: [`open-issues.md`](./open-issues.md).

---

## Safe Change Boundaries

Per [`AGENTS.md`](../../AGENTS.md):

- Incremental fixes only — do not broad-redesign working Overview, Insights, Charts, or PDF layouts.
- Do not change chart-kind semantics or H-Bar / Donut / Pie renderer internals without explicit scope.
- Preserve AI Insights alignment gates (`insightChartMatchesCurrentQuestion`, `chartSnapshotMatchesQuestionIntent`).
- Preserve shell widths: Insights 760/850/900px; Charts ≤860px; Overview mini 360px.

---

## Snapshot Doc Index

| File | Purpose |
|------|---------|
| [`current-status.md`](./current-status.md) | This file |
| [`chart-rendering-summary.md`](./chart-rendering-summary.md) | End-to-end rendering flow |
| [`chart-kind-policy.md`](./chart-kind-policy.md) | Kind resolution rules |
| [`file-map.md`](./file-map.md) | Important files and ownership |
| [`open-issues.md`](./open-issues.md) | Issues and technical debt |
| [`export-system-summary.md`](./export-system-summary.md) | PNG/PDF export architecture |
