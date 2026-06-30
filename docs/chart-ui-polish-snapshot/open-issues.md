# Open Issues — Chart Visual Polish

**Branch:** `DEV`  
**Stable commit:** `16526f0` (2026-06-29)  
**Status:** **Major chart visual polish complete.** Prior issues CV-1 through CV-3 from the June 16 baseline are **resolved or superseded**.

**Authoritative status:** [`../current-snapshot/chart-polish-final-snapshot.md`](../current-snapshot/chart-polish-final-snapshot.md)

---

## Summary

The chart visual polish pass is **complete**. Final cross-surface consistency audit (June 29, 2026) found **no blocking regressions** across V-Bar, H-Bar, donut/pie, line, area, histogram, scatter, and KPI cards.

**Remaining items are optional hardening only** — not user-visible defects.

---

## Resolved (formerly open on `chart-ui-polish-baseline` @ `4247ef3`)

| ID | Former issue | Resolution |
|----|--------------|------------|
| CV-1 | Line/area/scatter lack H-Bar premium layout parity | Line/area value labels, PNG density tiers, shared premium domains; visual parity acceptable per audit |
| CV-2 | Continuous charts feel shorter/compressed | Standalone PNG density + label polish; plot height policy unchanged by design |
| CV-3 | Overview mini chart axis/footer alignment | Odd dashboard centering fix; axis/tick helpers shared with session path |

---

## Optional hardening only (low risk)

| ID | Item | Severity | Notes |
|----|------|----------|-------|
| CH-1 | Export axis plan omits explicit `tickValues` | Low | PNG/PDF rely on post-plan `attachOverviewBarValueAxisTicks`; works today |
| CH-2 | `validateOverviewDashboardExportParity` skips domain/tick compare | Low | QA coverage gap only |
| CH-3 | Scatter close-cluster test coverage thinner than line/area | Low | No observed bug |

No implementation proposed here — see chart polish snapshot §5 if tightening before release.

---

## Explicitly out of scope (unchanged)

- Global in-memory dataset
- AI narrative drift (separate track)
- Backend session / auth / quota
- PDF narrative text (frozen)
- Bulk performance work (pending)
- Monolithic `page.tsx` / `main.py` structure

---

## Validation datasets (manual QA)

| Dataset | Path | Useful for |
|---------|------|------------|
| Dashboard showcase | `frontend/public/dashboard_showcase_dataset.csv` | Mixed chart types on Overview |
| Screenshot fixture | `frontend/public/screenshot-fixture.csv` | Trend + category charts |
| Backend fixture | `backend/tests/fixtures/dashboard_showcase_dataset.csv` | Engine diversity tests |

**Suggested release spot-check:** one chart per family — Overview live → Export PNG → PDF preview.

---

*Updated: 2026-06-29 — supersedes June 16 open-issues snapshot.*
