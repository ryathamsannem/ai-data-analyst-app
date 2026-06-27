# Current Status

**Snapshot date:** June 27, 2026
**Phase:** After Overview Pass 5A.3 (H-Bar/V-Bar visual parity + cross-domain mapping QA)
**Branch:** `DEV`
**Latest commit:** `f648151` — `f648151ba730de39eec921d810014aa1abd6783d` ("AI Summary repetitive kpi fix")

> Note: the Overview Pass 5A.x work (including 5A.3) is in the **working tree**, not yet committed.
> `DEV` is ahead of `origin/DEV` by 2 commits. The 5A.x changes show as modified/untracked files
> (`backend/main.py`, `backend/services/*`, `frontend/app/page.tsx`, `frontend/lib/*`, new tests).

---

## What is working

- **Overview tab** — upload, KPI cards, filters, auto-dashboard grid, drill path, per-card PNG export.
- **Banking default charts** — no default scatter; lifecycle (`account_age_months`) demoted; segment/product breakdowns, delinquency, utilization, loan/deposit/spend trends preferred (Passes 5A / 5A.1).
- **Banking / Financial Services labeling** — consistent "Banking / Financial Services" dataset type across KPI section, auto-dashboard chips, data setup, AI summary; monthly snapshot cadence detected; no "Sales / commercial" leak (Pass 5A.2).
- **Cross-domain mapping** — retail, banking (gold + financial services), HR all resolve correct domain, type label, primary/secondary metric, date column, and main dimension (Pass 5A.3, Issue 3).
- **Bar value-axis formatting** — currency/amount ticks compact to `K`/`M` (e.g. `127.5M`); percent/rate ticks read as points (`35%`, `3.4%`); V-Bar rate gap chips show percentage points (`Gap: 1.0 pp`) (Pass 5A.3, Issues 1 & 2).
- **AI Insights** — structured reasoning blocks, "Why this matters" cards, narrative QA, follow-up reasoning, recommended next actions, insight result restore (see [`ai-insights-status.md`](./ai-insights-status.md)).
- **Tests/build** — frontend 668/668 vitest pass; `npm run build` clean; backend targeted domain suites 37/37 pass.

---

## What is still unresolved

- **H-Bar / V-Bar visual parity (NOT fully achieved).** Overview Pass 5A.3 adjusted H-Bar radius/thickness and axis formatting, but the horizontal bar still does **not** visually match the V-Bar premium finish in the latest manual screenshots. Constants were aligned proportionally, yet the rendered result still differs. See [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md).
- **Pre-existing backend failures** — 6 `pytest` failures exist in the full suite (sales showcase diversity/scatter, banking suggested-questions utilization trend, marketing weak-title). Proven pre-existing (fail identically on reverted `main.py`); out of scope for 5A.3.

---

## Overview Pass 5A.3 — status

Pass 5A.3 was **completed** (visual constants, axis formatting, V-Bar rate formatting, cross-domain mapping QA, tests, build all green) **but H-Bar/V-Bar visual parity still needs review.** The next session should start with a geometry-level investigation rather than another constant tweak.

---

## Snapshot Doc Index (this snapshot)

| File | Purpose |
|------|---------|
| [`current-status.md`](./current-status.md) | This file |
| [`overview-pass-status.md`](./overview-pass-status.md) | Overview Passes 5A → 5A.3 detail |
| [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md) | Unresolved H-Bar/V-Bar parity items + constants |
| [`ai-insights-status.md`](./ai-insights-status.md) | AI Insights completed work |
| [`file-map.md`](./file-map.md) | Key files by area |
| [`open-items.md`](./open-items.md) | Prioritized open items (P0/P1/P2) |
| [`validation-results.md`](./validation-results.md) | Latest test/build/manual results |

Prior parity-phase docs remain in this folder: `chart-rendering-summary.md`, `chart-premium-parity-status.md`, `architecture-map.md`, `changelog-premium-chart-phase.md`.
