# Latest Working Snapshot

**Snapshot date:** July 8, 2026  
**Purpose:** Post-performance-fix stable snapshot — large dataset upload/dashboard performance restored; PDF/AI/chart polish baseline preserved  
**Branch:** `DEV`

**Chart polish detail:** [`chart-polish-final-snapshot.md`](./chart-polish-final-snapshot.md)

---

## Git state

| Item | Value |
|------|-------|
| **Branch** | `DEV` |
| **HEAD** | `a9e1e85` — `done charts & Ai Insights, Only performance was pending` |
| **Remote** | `DEV...origin/DEV` (status at snapshot time) |
| **Working tree** | **Modified with completed performance fixes + this docs snapshot** |
| **Performance files changed** | `backend/main.py`, `backend/services/auto_dashboard_opportunities.py`, `backend/tests/test_auto_dashboard_opportunities.py`, `frontend/lib/overview-premium-axis-domain.ts`, `frontend/lib/overview-premium-axis-domain.test.ts` |
| **Docs changed in snapshot pass** | `docs/current-snapshot/latest-working-snapshot.md`, `current-status.md`, `validation-results.md`, `open-items.md` |

---

## Completed work (full arc)

### Large dataset upload/dashboard performance (July 2026 — **restored**)

**Summary:** Large dataset upload/dashboard performance restored. **100k upload now responds quickly and auto-dashboard appears immediately** after the upload response. No lazy rendering or staged dashboard rendering was used.

| Area | Summary |
|------|---------|
| Root cause | Frontend Overview trend axis tick generation could materialize huge tick arrays for large-magnitude, low-variance line/area charts (for example monthly revenue around 1.2B–1.3B). |
| Backend fix | Request-local memoization/reuse in auto-dashboard discovery reduced repeated DataFrame scans without output drift. |
| Frontend fix | Bounded tick generation in `overview-premium-axis-domain.ts` prevents UI freeze by estimating tick count before materializing arrays and adding a defensive tick cap. |
| Output safety | Backend golden output matched for 10k / 50k / 75k / 100k; chart selection/scoring/titles/response shape were not intentionally changed. |
| UX result | 10k, 50k, and 100k uploads respond quickly; KPIs and auto-dashboard charts appear immediately after response. |

### Performance validation (recorded July 8, 2026)

| Check | Result |
|-------|--------|
| Backend auto-dashboard discovery tests | **PASS** (`tests/test_auto_dashboard_opportunities.py`) |
| Frontend axis/domain tests | **PASS** (`lib/overview-premium-axis-domain.test.ts`) |
| Related chart label/domain tests | **PASS** (`chart-renderer-line-labels`, `line-value-labels`, `cartesian-chart-decisions`) |
| `npm run build` | **PASS** |
| Manual upload validation | **PASS** for 10k, 50k, and 100k uploads |
| Duplicate `/filtered-dashboard` after upload | **Not observed** |

Recorded 50k timing after bounded tick fix: JSON parse → all Recharts wrappers ~338ms (before fix: ~74s). 10k timing after fix: JSON parse → all Recharts wrappers ~342ms.

### Chart polish (June 2026 — **complete**)

| Area | Summary |
|------|---------|
| V-Bar / H-Bar labels | Clutter-safe end labels; H-Bar small-bar outside labels across all surfaces |
| Focused percent / score axes | Close-value readability for rates and bounded scores |
| Donut/pie | Sorting, legend, small-slice palette |
| Line / area labels | Value labels when safe; PNG font sizing |
| PNG density | Standalone tiers for bar, histogram, line, area (`overviewPng` / `chartsPng`) |
| Signed / negative bars | Zero baseline + reference line at 0 |
| Odd dashboard centering | Auto-dashboard grid optical centering |
| Consistency audit | No blocking cross-surface regressions |

Full matrix and shared paths: [`chart-polish-final-snapshot.md`](./chart-polish-final-snapshot.md)

### PDF / AI / product (prior arc)

| Area | Commit(s) | Summary |
|------|-----------|---------|
| **Suggested Questions** | `3ee3e48` | Backend quality across 15 domains |
| **Follow-up chips** | `c460bcc` | Generic/duplicate chip suppression |
| **PDF-1 / PDF-2** | `c764f5d`–`cf643d9` | Narrative/chart alignment, appendix, KPI dedupe, branding |
| **Mandatory alignment** | `042db37`, `cdb1f6d` | Shared live/PDF `insightPresentation` model |
| **PDF label cleanup** | `b66d5d1` | Strip redundant in-body section labels |

Detail: [`suggested-questions-15-domain-quality.md`](./suggested-questions-15-domain-quality.md) · [`pdf-quality-audit.md`](./pdf-quality-audit.md) · [`pdf-export-phase-changelog.md`](./pdf-export-phase-changelog.md)

---

## Current product status

### Charts (all families)

- **Cross-surface parity:** Overview live/PNG, Charts live/PNG, AI Insights live/PNG, PDF embed — **pass** per final audit (see chart polish snapshot).
- **Shared helpers:** `cartesian-chart-decisions.ts`, `overview-bar-value-domain.ts`, `overview-premium-axis-domain.ts`, `chart-png-export-layout.ts`, `radial-chart-format.ts`.
- **KPI cards:** Overview live + PDF snapshot only (not cartesian charts).

### PDF / AI Insight

- Live UI and PDF share **normalized aligned insight presentation model**.
- PDF AI Insight sections, chart view compact mode, export context, and visualization cohesion — **stable**.
- Chart images in PDF use same capture path as on-screen insight styling (centered, consistent margins).

---

## Test & build status (recorded June 29, 2026)

| Suite | Result |
|-------|--------|
| Chart consistency vitest batch (15 files) | **289 passed, 0 failed** |
| `npm run build` | **PASS** |
| Backend Phase 1 (suggested questions) | **492 passed** (prior snapshot) |
| PDF/export/alignment targeted suites | **PASS** (prior snapshot) |

---

## Remaining work

| Item | Notes |
|------|-------|
| Optional chart hardening | Export axis plan tick contract; parity validation for domain/ticks — **low risk, not required** |
| Final release-readiness validation | Optional browser spot-check per chart family |
| Platform production | Auth, durable storage, metering, optional E2E suite |
| Donut/scatter auto-dashboard selection | Separate product-selection topic; not part of the performance fix |
| Monthly revenue flatness | 1.2B–1.3B tight ranges can look visually flat and are mathematically expected unless a future smart variance view is chosen |

**No blocking chart polish or PDF-2 backlog remains.**

---

## Explicit constraints (do not reopen without evidence)

1. **Chart polish baseline** — frozen at `16526f0` unless measured regression.
2. **H-Bar / V-Bar policy asymmetry** — focused V-Bar rates vs zero-baseline H-Bar wide rates is intentional.
3. **Suggested questions / follow-up chips / PDF narrative** — frozen unless new proven issue.
4. **Future changes** — audit-first, small scoped fixes, test-backed.
5. **Performance baseline** — do not reintroduce lazy/staged dashboard rendering for this issue.
6. **Chart selection** — do not change chart selection just for performance without golden-output validation.
7. **Visual parity** — do not reopen chart visual parity unless screenshot/test proves regression.
8. **Donut/scatter selection** — treat as product-selection work, not a performance regression.

---

## Safe to proceed?

**Yes** for release-readiness validation and platform/deployment work. Production code stable at `16526f0`. Chart families consistent across surfaces.
