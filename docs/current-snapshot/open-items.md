# Open Items

**Snapshot:** June 20, 2026  

Only **real remaining work** is listed. Completed Chart Premium Parity items are documented in [`chart-premium-parity-status.md`](./chart-premium-parity-status.md) and [`changelog-premium-chart-phase.md`](./changelog-premium-chart-phase.md) — not repeated here.

---

## Pending Product / Chart Work

### Histogram premium review

| Field | Detail |
|-------|--------|
| **Status** | Pending |
| **Current state** | Histogram renders as styled vertical bar (`barCategoryGap: 2`, flat top radius, wider bars) in both Overview inline path and `ChartRenderer` |
| **Gap** | No dedicated occupancy/margin pass equivalent to Line/Area/Scatter; uses V-Bar layout helpers |
| **Scope when started** | Histogram-only styling and domain review; do not regress V-Bar or change kind routing |

---

## Future / Non-Blocking

### Large dataset performance optimization

| Field | Detail |
|-------|--------|
| **Status** | Future |
| **Context** | Pilot supports up to 100k preview rows (paid tier); cold-start and filter latency documented in `docs/large-dataset-validation-*.md` |
| **Not in scope now** | Virtualization of full analytics pipeline, server-side aggregation cache, WebWorker chart prep |

### Browser E2E export regression suite

| Field | Detail |
|-------|--------|
| **Status** | Future |
| **Context** | 546 unit tests cover domain/margin/capture logic; no Playwright matrix for live PNG/PDF pixel regression |
| **Reference** | `docs/pdf-export-final-validation-runbook.md`, Phase 7 PDF fixtures |

---

## Platform / Production Gaps

| Item | Severity | Notes |
|------|----------|-------|
| Authentication & tenant isolation | High for production | Session-only; no user accounts |
| Durable usage metering | Medium | PDF/AI quota client-side with API enforcement |
| Multi-tenant dataset storage | High for production | In-memory `df` per backend process |
| Payment integration | N/A pilot | Pricing UI informational only |

---

## Technical Debt (accepted)

| Item | Notes |
|------|-------|
| **Dual renderer pipelines** | Overview inline vs `ChartRenderer` — managed via shared helpers; full convergence not scheduled |
| **Monolithic `page.tsx`** | ~14.6k lines; incremental extraction only when scoped |
| **Legacy PDF DOM capture** | Fallback path in `pdf-report.ts` when artifact missing; primary path is artifact PNG |
| **Deprecated API aliases** | `getInsightLayoutMetrics`, `resolveDetailPlotHeight`, `pdfChartScatterUsesContentTightComposite` — remove when callers migrated |
| **Axis presentation plan coverage** | Fully wired for H-Bar/V-Bar export; line/area/scatter use renderer domain helpers on live path |

---

## Explicitly Not Open (completed this phase)

Do **not** reopen unless regression found:

- H-Bar premium baseline and margin model
- Overview V-Bar centering and live plot band
- Overview Line/Area/Scatter alignment and occupancy
- Charts PNG domain parity (`detailViewLayout` on offscreen capture)
- Charts/AI left-gutter fix (`sessionDetailVerticalOuterMargins`)
- PDF V-Bar/scatter content-tight embed and kind-aware sizing
- Scatter occupancy target (74%) and plot height boost parity

---

## Suggested Next Steps (priority order)

1. Manual QA pass on showcase dataset across six surfaces × six cartesian kinds (regression guard).
2. Histogram premium review (narrow scope).
3. E2E export smoke tests (Playwright or similar) — optional hardening.
4. Production platform items — separate initiative from chart parity.
