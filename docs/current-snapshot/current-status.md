# Current Status

**Snapshot date:** June 27, 2026
**Phase:** After Overview Pass 5C.5 (H-Bar/V-Bar visual parity **frozen**)
**Branch:** `DEV`

> Overview Passes 5B.x and 5C.x (H-Bar/V-Bar parity) are in the **working tree**, not yet committed as a single snapshot commit.

---

## What is working

- **Overview tab** — upload, KPI cards, filters, auto-dashboard grid, drill path, per-card PNG export.
- **Banking default charts** — no default scatter; lifecycle demoted; segment/product breakdowns, delinquency, utilization, loan/deposit/spend trends preferred (Passes 5A / 5A.1).
- **Banking / Financial Services labeling** — consistent "Banking / Financial Services" dataset type; monthly snapshot cadence; no "Sales / commercial" leak (Pass 5A.2).
- **Cross-domain mapping** — retail, banking (gold + financial services), HR resolve correct domain, type label, primary/secondary metric, date column, and main dimension (Pass 5A.3).
- **H-Bar / V-Bar visual parity — RESOLVED / FROZEN (P0).** Passes 5B.1 → 5C.5 complete. H-Bar band fill, zero baseline, low-rate axis caps, count-axis ticks, and Overview magnitude utilization cap (~85%) are in place. Remaining orientation difference (horizontal length vs vertical thickness) is **accepted as orientation-natural**. See [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md).
- **Bar value-axis policy** — zero baseline for normal positive business bars (currency/count/revenue); score/rating tight-domain exception preserved; low-rate V/H-Bar percent caps (5C.2); Overview H-Bar 85% utilization cap for magnitude charts (5C.5).
- **Percent chip formatting** — `1.0%` no longer displays as `100.0%` (Pass 5B.1).
- **Bar value-axis formatting** — currency/amount ticks compact to `K`/`M`; percent/rate ticks read as points (`35%`, `3.4%`); rate gap chips show `pp` (Pass 5A.3+).
- **Export regression (P1)** — PNG/PDF export validated after 5B/5C domain changes: 87 targeted export tests + Phase 7 PDF 18/18; no regressions found (June 27, 2026).
- **Export/shared domain parity** — Overview live + PNG use inline pipeline with 85% H-Bar cap; session/PDF charts share `resolveOverviewBarValueDomain` zero-baseline policy without Overview stretch (Pass 5B.3).
- **AI Insights** — structured reasoning blocks, "Why this matters" cards, narrative QA, follow-up reasoning, recommended next actions, insight result restore (see [`ai-insights-status.md`](./ai-insights-status.md)).
- **Tests/build** — frontend **722/722** vitest pass; `npm run build` clean; backend targeted domain suites 37/37 pass.

---

## What is still unresolved

- **Pre-existing backend failures** — 6 `pytest` failures (sales showcase diversity/scatter, banking suggested-questions utilization trend, marketing weak-title). Proven pre-existing; out of scope for chart parity work.
- **Manual UI confirmation** — ~~cross-domain Overview defaults on all four gold fixtures~~ **closed** (June 27, 2026); optional live-browser spot-check remains non-blocking.

---

## Overview Pass 5B / 5C — status (frozen)

| Pass | Summary | Status |
|------|---------|--------|
| **5B.1** | H-Bar percent/rate zero baseline + percent chip fix (`coercePercentDisplayNumber`) | ✅ Frozen |
| **5B.2** | Universal zero-baseline for normal positive business bars (currency/count/revenue) | ✅ Frozen |
| **5B.3** | Export/shared/legacy domain parity validation | ✅ Frozen |
| **5C.1** | H-Bar visual weight / band-fill parity (`maxBarSize`, radius, category gap) | ✅ Frozen |
| **5C.2** | Low-rate V-Bar axis upper-bound polish (delinquency ~5% cap) | ✅ Frozen |
| **5C.3** | H-Bar 7-category rhythm, count-axis clean ticks, right margin | ✅ Frozen |
| **5C.4** | H-Bar utilization verification (×1.10 headroom — visually too small) | ✅ Superseded by 5C.5 |
| **5C.5** | Overview H-Bar **85% utilization cap** for magnitude charts (`maxRaw / 0.85`) | ✅ Frozen |

Detail: [`overview-pass-status.md`](./overview-pass-status.md).

---

## Snapshot Doc Index (this snapshot)

| File | Purpose |
|------|---------|
| [`current-status.md`](./current-status.md) | This file |
| [`overview-pass-status.md`](./overview-pass-status.md) | Overview Passes 5A → 5C.5 detail |
| [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md) | **Resolved/frozen** H-Bar/V-Bar parity record + final constants |
| [`ai-insights-status.md`](./ai-insights-status.md) | AI Insights completed work |
| [`file-map.md`](./file-map.md) | Key files by area |
| [`open-items.md`](./open-items.md) | Prioritized open items (P0/P1/P2) |
| [`validation-results.md`](./validation-results.md) | Latest test/build/manual results |

Prior parity-phase docs remain in this folder: `chart-rendering-summary.md`, `chart-premium-parity-status.md`, `architecture-map.md`, `changelog-premium-chart-phase.md`.
