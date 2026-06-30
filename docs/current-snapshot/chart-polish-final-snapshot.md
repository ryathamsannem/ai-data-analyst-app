# Chart Polish — Final Snapshot

**Snapshot date:** June 29, 2026  
**Branch:** `DEV`  
**HEAD:** `16526f0` — `fix(frontend): polish chart labels axes png density and signed bars`  
**Status:** Major chart polish pass **complete**. Final cross-surface consistency audit found **no blocking regressions**.

**Companion:** [`latest-working-snapshot.md`](./latest-working-snapshot.md) (full product arc) · [`stable-baseline-status.md`](../chart-ui-polish-snapshot/stable-baseline-status.md) · [`CHARTS_STABLE_SUMMARY.md`](../../CHARTS_STABLE_SUMMARY.md)

---

## 1. Git state (chart polish arc)

| Item | Value |
|------|-------|
| **Branch** | `DEV` (ahead of `origin/DEV` by 1 commit at snapshot time) |
| **HEAD** | `16526f0` |
| **Working tree** | Clean |
| **Recent chart commits (newest first)** | `16526f0` labels/axes/png/signed bars · `4f7e3c2`/`6c3e3b3` bar PNG density · `f494876` donut + odd dashboard centering · `3e1634e` V-Bar/H-Bar label consistency |

---

## 2. Completed scope

| Area | Summary | Key modules |
|------|---------|-------------|
| **V-Bar labels** | End labels gated for overlap; clutter-safe visibility | `overview-dashboard-export.ts`, `chart-renderer-vbar-labels` tests |
| **V-Bar focused percent precision** | Tight domains for clustered low rates; explicit percent ticks | `overview-bar-value-domain.ts`, `resolveFocusedRateBarValueAxisTicks` |
| **Executive chip precision** | Metadata chips match focused rate formatting | `metric-value-format.ts`, viz meta chips |
| **H-Bar labels (all surfaces)** | Overview, Charts, AI Insights, PNG, PDF; small-bar **outside** labels | `chart-renderer-hbar-labels`, `horizontal-bar-visual.ts` |
| **Donut/pie** | Slice sorting, legend consistency, small-slice palette/readability | `radial-chart-format.ts` |
| **Odd auto-dashboard centering** | Single-column / odd-count grid optical centering | Overview dashboard layout |
| **Line / area value labels** | Clutter-safe point labels across live + capture surfaces | `chart-renderer-line-labels` |
| **Histogram / line / area PNG density** | Standalone `overviewPng` / `chartsPng` tiers by category/point count | `chart-png-export-layout.ts` |
| **V-Bar / H-Bar PNG density** | Bar-specific export width/height tiers | `chart-png-export-layout.ts` |
| **Negative / signed bars** | Zero baseline anchor + `ReferenceLine` at 0 (V-Bar + H-Bar) | `chart-renderer.tsx`, `page.tsx` inline |
| **Close-value axis readability** | Focused rate domains; bounded score/rating ticks on H-Bar | `overview-bar-value-domain.ts`, `cartesian-chart-decisions.ts` |
| **Final consistency audit** | No blocking cross-surface regressions (audit-only, June 29) | See §4 |

---

## 3. Shared render paths (parity contract)

```
Overview live (inline page.tsx)     → resolveCartesianBarValueAxisProps(pipeline: "overview")
Overview PNG (pngCapture)           → same overview pipeline + export layout tiers
Charts / AI live (ChartRenderer)    → pipeline: "session"
Charts / AI PNG capture             → session + exportAxisPlan domain + attachOverviewBarValueAxisTicks
PDF embedded chart                  → pdfChart profile + captured PNG (860px path)

Bar / histogram domain + ticks      → overview-bar-value-domain.ts + cartesian-chart-decisions.ts
Line / area / scatter domain        → overview-premium-axis-domain.ts
Donut / pie                         → radial-chart-format.ts → ChartRenderer radial branch
Label safety (bars)                 → overview-dashboard-export.ts (shouldShowOverviewBarValueLabels)
Signed bars                         → barChartRowsHaveNegativeValues + ReferenceLine y/x=0
PNG sizing                          → chart-png-export-layout.ts (STANDALONE_PNG_* tiers)
PDF embed policy                    → chart-presentation-profile.ts → resolvePdfChartEmbedPolicy
```

**Intentional dual path:** Overview mini charts render **inline** in `page.tsx`; session charts use **`ChartRenderer`**. Both call the same domain/tick helpers; label/margin logic is partially duplicated.

---

## 4. Chart family × surface parity status

Legend: **P** = pass · **P\*** = pass with known policy caveat · **N/A** = not applicable

| Family | Overview live | Overview PNG | Charts live | Charts PNG | AI Insights live | AI/Chart PNG | PDF embed |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **V-Bar** | P | P | P | P | P | P | P |
| **H-Bar** | P\* | P\* | P | P | P | P | P\* |
| **Donut / pie** | P | P | P | P | P | P | P |
| **Line** | P | P | P | P | P | P | P |
| **Area** | P | P | P | P | P | P | P |
| **Histogram** | P | P | P | P | P | P | P |
| **Scatter** | P | P | P | P | P | P | P |
| **KPI cards** | P | N/A | N/A | N/A | N/A | N/A | P |

**P\* notes (not failures):**

- **H-Bar wide % rates** (e.g. delinquency 3.4–4.1%): zero-baseline with capped headroom by design; **V-Bar close rates** use focused domains. Tested asymmetry.
- **H-Bar close integer counts** (e.g. 198–202): zero-baseline; bars look similar but integer ticks are correct.

**Audit criteria checked:** (1) labels only when safe · (2) readable domains/ticks · (3) PNG density · (4) PDF good · (5) signed bars at zero · (6) close values not misleading · (7) no family broken.

---

## 5. Remaining optional hardening only

No user-visible fix required before further product work.

| Priority | Item | Risk | Scope |
|----------|------|------|-------|
| Low | Populate `tickValues` in `axis-presentation-plan.ts` from same helpers as `attachOverviewBarValueAxisTicks` | Future capture shortcut could skip tick attach | ~15–25 LOC |
| Low | Extend `validateOverviewDashboardExportParity` to compare domain + tick arrays | QA gap only; export works today | ~10–20 LOC |
| Low | Add one tight-cluster scatter test mirroring line close-value coverage | Coverage gap only | ~10 LOC in `overview-premium-axis-domain.test.ts` |

**Do not reopen without evidence:** signed-bar geometry, global chart sizing, donut palette logic, PDF narrative text, backend routing.

---

## 6. Test & build status (recorded June 29, 2026)

| Suite | Result |
|-------|--------|
| Chart consistency vitest batch (15 files) | **289 passed, 0 failed** |
| `npm run build` (Next.js 16) | **PASS** |

**Chart consistency test command:**

```bash
cd frontend
npx vitest run lib/overview-bar-value-domain.test.ts lib/cartesian-chart-decisions.test.ts lib/chart-png-export-qa.test.ts lib/chart-png-export-layout.test.ts lib/chart-platform/chart-capture-controller.test.ts lib/chart-platform/chart-presentation-profile.test.ts lib/chart-renderer-vbar-labels.test.ts lib/chart-renderer-hbar-labels.test.ts lib/chart-renderer-line-labels.test.ts lib/chart-renderer-radial-legend.test.ts lib/radial-chart-format.test.ts lib/overview-premium-axis-domain.test.ts lib/overview-dashboard-export.test.ts lib/build-executive-pdf-input.test.ts lib/horizontal-bar-visual.test.ts
npm run build
```

---

## 7. Next recommended priorities

1. **Release-readiness validation** — Optional browser spot-check: one chart per family on Overview live → Export PNG → PDF preview.
2. **Export/PDF product sign-off** — Narrative/PDF arc complete; chart embed now visually aligned — run PDF regression checklist if shipping.
3. **Optional hardening (§5)** — Only if tightening export contracts before release.
4. **Platform production** — Auth, durable storage, metering, E2E suite (out of chart polish scope).

---

## 8. Explicit constraints (frozen)

1. **H-Bar / V-Bar parity policies** — focused V-Bar rates vs zero-baseline H-Bar wide rates are intentional.
2. **Chart axis / domain / bar sizing** — frozen unless test or screenshot proves regression.
3. **Dual Overview render paths** — inline + ChartRenderer; fix narrowest layer only.
4. **Future chart changes** — audit-first, small scoped fixes, test-backed.

---

*Snapshot docs only — no production code changed in this update.*
