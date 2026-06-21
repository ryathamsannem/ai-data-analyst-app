# Current Status

**Snapshot date:** June 20, 2026  
**Baseline:** Chart Premium Parity phase complete  
**Branch:** working tree at snapshot time  

---

## Production Readiness Status

| Area | Readiness | Notes |
|------|-----------|-------|
| **Demo / pilot UX** | High | Modern SaaS dashboard; stable Overview, Data Preview, AI Insights, Charts, Export tabs |
| **Chart visual parity** | High | H-Bar premium baseline; V-Bar/Line/Area/Scatter aligned on session surfaces; Overview mini-cards polished |
| **Export reliability** | High | Artifact PNG capture + readiness gates; PDF prefers `ChartArtifact` over legacy DOM capture |
| **Multi-user production** | Low | No auth; in-memory dataset per process; client-spoofable plan tier |
| **Backend scale** | Low | Single-process pandas; no durable usage DB; limited integration tests |
| **Automated E2E** | Low | Strong unit coverage; no Playwright export regression suite |

---

## Major Completed Features

### Product surfaces

| Surface | Status |
|---------|--------|
| **Overview** | Upload, KPI cards, filters, auto-dashboard grid, drill path, per-card PNG export |
| **Data Preview** | Paginated table, schema/quality metadata, search/sort, profile popovers |
| **AI Insights** | Ask AI, alignment gates, suggested questions, executive cards, AI Read, insight PDF |
| **Charts tab** | Session timeline, selected chart preview, SmartChartInsightPanel, PNG export |
| **Export** | Executive PDF with section selection, branding, quota preflight |

### Chart platform (Chart Premium Parity phase)

1. **H-Bar premium baseline** — category labels on `YAxis.width`; outer `margin.left` ~10–14px only.
2. **V-Bar alignment** — Overview live centering; session detail outer margins; PDF content-tight embed.
3. **Line / Area / Scatter** — occupancy-tuned Y domains on live/session; left-gutter fix on Charts/AI/PDF.
4. **Capture artifact platform** — `ChartPngCaptureRequest` → `ChartCaptureHost` → `captureChartPngArtifact()` → `ChartArtifact`.
5. **Presentation profiles** — per-surface read-only profiles (`overviewLive`, `overviewPng`, `chartsLive`, `chartsPng`, `aiInsightsLive`, `pdfChart`).
6. **PDF embed sizing** — kind-aware `resolvePdfChartEmbedPolicy()`; content-tight composite for scatter and V-Bar.

---

## Test / Build Status (snapshot time)

```bash
cd frontend && npm run test   # 71 files / 546 tests passed
cd frontend && npm run build  # passed (Next.js 16.2.4)
```

Backend: FastAPI + pandas; no automated suite counted in this snapshot.

---

## Open Items (summary)

See [`open-items.md`](./open-items.md) for the full list. Highlights:

- **Histogram review** — implemented as styled V-Bar; dedicated premium pass pending
- **Large dataset performance** — future optimization (100k+ row datasets)
- **Dual renderer pipelines** — Overview inline Recharts vs shared `ChartRenderer` (intentional; drift managed by shared helpers)
- **Production platform** — auth, multi-tenant isolation, durable usage tracking

---

## Known Limitations

- **Two chart pipelines:** Overview mini-cards render inline in `page.tsx`; Charts / AI Insights / PDF use `ChartRenderer`. Shared helpers reduce drift; surfaces are not a single DOM path.
- **Overview vs session styling:** Overview Area live uses higher `fillOpacity` (0.26) than PNG (0.18); export stroke weights differ by design.
- **PDF generation:** Main-thread jsPDF + PNG embed; legacy DOM capture retained as fallback.
- **Pilot constraints:** Free tier file/row/AI/PDF limits; no payment integration.
- **Histogram:** No separate Recharts chart type; histogram semantics via `barCategoryGap: 2` and flat-top radius on vertical bars.

---

## Safe Change Boundaries

Per root [`AGENTS.md`](../../AGENTS.md):

- Incremental fixes only — do not broad-redesign working Overview, Insights, Charts, or PDF layouts.
- Preserve AI Insights alignment gates (`insightChartMatchesCurrentQuestion`, `chartSnapshotMatchesQuestionIntent`).
- Preserve shell widths: Insights 760/850/900px plan viewports; Charts ≤860px; Overview mini 360px + boosts.
- H-Bar internals, Donut/Pie routing, and chart-kind semantics are frozen unless explicitly scoped.

---

## Snapshot Doc Index

| File | Purpose |
|------|---------|
| [`current-status.md`](./current-status.md) | This file |
| [`chart-rendering-summary.md`](./chart-rendering-summary.md) | Per-kind, per-surface rendering map |
| [`chart-premium-parity-status.md`](./chart-premium-parity-status.md) | Completed parity work and design principles |
| [`architecture-map.md`](./architecture-map.md) | Pipelines and file ownership |
| [`file-map.md`](./file-map.md) | Chart-related file inventory |
| [`open-items.md`](./open-items.md) | Remaining work only |
| [`changelog-premium-chart-phase.md`](./changelog-premium-chart-phase.md) | Phase changelog |

**Prior snapshot:** [`docs/latest-project-snapshot/`](../latest-project-snapshot/) (June 18, 2026 — pre left-gutter / occupancy pass).
