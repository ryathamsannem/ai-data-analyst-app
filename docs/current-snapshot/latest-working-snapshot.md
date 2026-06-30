# Latest Working Snapshot

**Snapshot date:** June 29, 2026  
**Purpose:** Current release snapshot — PDF/AI alignment complete; **major chart polish pass complete**; final chart consistency audit clean  
**Branch:** `DEV`

**Chart polish detail:** [`chart-polish-final-snapshot.md`](./chart-polish-final-snapshot.md)

---

## Git state

| Item | Value |
|------|-------|
| **Branch** | `DEV` |
| **HEAD** | `16526f0` — `fix(frontend): polish chart labels axes png density and signed bars` |
| **Remote** | Ahead of `origin/DEV` by 1 commit (at snapshot time) |
| **Working tree** | **Clean** |
| **Recent commits (newest first)** | `16526f0` chart polish (labels/axes/png/signed) · `4f7e3c2`/`6c3e3b3` bar PNG density · `f494876` donut + odd centering · `3e1634e` V/H-Bar labels · `b66d5d1` PDF label cleanup · `cdb1f6d` aligned insight model · `042db37` live/PDF narrative alignment |

---

## Completed work (full arc)

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

**No blocking chart polish or PDF-2 backlog remains.**

---

## Explicit constraints (do not reopen without evidence)

1. **Chart polish baseline** — frozen at `16526f0` unless measured regression.
2. **H-Bar / V-Bar policy asymmetry** — focused V-Bar rates vs zero-baseline H-Bar wide rates is intentional.
3. **Suggested questions / follow-up chips / PDF narrative** — frozen unless new proven issue.
4. **Future changes** — audit-first, small scoped fixes, test-backed.

---

## Safe to proceed?

**Yes** for release-readiness validation and platform/deployment work. Production code stable at `16526f0`. Chart families consistent across surfaces.
