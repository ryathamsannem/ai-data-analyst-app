# Chart Visual Parity — H-Bar vs V-Bar

Snapshot: June 27, 2026 · After Overview Pass **5C.5**.
**Status: RESOLVED / FROZEN (P0 closed).** Do not reopen unless a regression is reported with measured SVG evidence.

---

## Final outcome

Overview H-Bar and V-Bar now share the same premium design system within orientation constraints:

| Concern | Resolution |
|---------|------------|
| H-Bar thin strips / weak band fill | **5C.1** — centralized `maxBarSize` 48 (category-responsive 36–48), asymmetric radius `[4,6,6,4]`, `16%` category gap through 8 categories |
| Non-zero baseline on rate/currency bars | **5B.1 / 5B.2** — `domainMin = 0` for normal positive business bars; score/rating exception preserved |
| Low-rate V-Bar excessive headroom (e.g. 9.1% top tick) | **5C.2** — `resolveBarChartRateDisplayCap` / `resolveBarChartRateUpperBound` |
| Percent chip `100.0%` for `1.0%` | **5B.1** — `coercePercentDisplayNumber` with `maxContextValue` |
| H-Bar edge-to-edge stretch on magnitude charts | **5C.5** — Overview H-Bar **85% utilization cap** (`domainMax ≥ maxRaw / 0.85`) |
| Count-axis decimal ticks (e.g. `1,258.2`) | **5C.3** — `resolveOverviewBarCountValueAxisTicks` on Overview live |
| Export/live domain drift | **5B.3** — all surfaces pass `presentationKind` into `resolveOverviewBarValueDomain` |

**Accepted residual difference:** H-Bar encodes value as **horizontal length**; V-Bar encodes value as **vertical height** with fixed bar width (~52px). Perfect pixel parity is not achievable; ~85% H-Bar utilization vs ~80% V-Bar rate occupancy is the agreed balance.

---

## Final constants (as of 5C.5)

### Shared H-Bar visual policy — `frontend/lib/horizontal-bar-visual.ts`

```ts
OVERVIEW_VBAR_MAX_BAR_SIZE              = 52
OVERVIEW_HBAR_LIVE_MAX_BAR_SIZE         = 48   // alias; use category resolver
OVERVIEW_HBAR_MAX_SIZE_BY_CATEGORY      = { sparse: 48, six: 44, dense: 42, compact: 36 }
HORIZONTAL_BAR_END_RADIUS               = [4, 6, 6, 4]
HORIZONTAL_BAR_MAX_SIZE                 = { compact: 36, detail: 48, default: 44 }
resolveHorizontalBarCategoryGap         → "16%" for ≤8 categories (overview)
estimateHorizontalBarLengthUtilization  → diagnostics helper
```

### Bar value domain — `frontend/lib/overview-bar-value-domain.ts`

```ts
DEFAULT_BAR_RIGHT_PAD_RATIO             = 0.06
OVERVIEW_HBAR_TARGET_MAX_UTILIZATION    = 0.85   // magnitude H-Bar only, Overview flag
resolveOverviewHBarUtilizationDomainMax → max(existing, maxRaw / 0.85)
resolveBarChartRateDisplayCap           → low-rate percent caps (5C.2)
overviewHorizontalBarHeadroom             → true on Overview live + PNG export H-Bar
```

### Overview live margins — `frontend/lib/overview-dashboard-plot-layout.ts`

```ts
OVERVIEW_HBAR_LIVE_MARGIN_RIGHT_MIN_PX  = 32
```

### Overview inline renderer — `frontend/app/page.tsx`

```ts
// H-Bar
radius      = HORIZONTAL_BAR_END_RADIUS
maxBarSize  = resolveOverviewHorizontalBarMaxSize({ pngCapture, categoryCount })
barCategoryGap = resolveHorizontalBarCategoryGap({ categoryCount })
minRight    = OVERVIEW_HBAR_LIVE_MARGIN_RIGHT_MIN_PX (live)

// V-Bar
radius      = [8, 8, 4, 4]  (non-histogram)
maxBarSize  = OVERVIEW_VBAR_MAX_BAR_SIZE (52)
barCategoryGap = "16%" for ≤8 categories
```

### Domain entry points (all pass `presentationKind`)

| Surface | Entry |
|---------|-------|
| Overview live H/V-Bar | `resolveCartesianBarValueAxisProps({ pipeline: "overview" })` in `page.tsx` |
| PNG export H-Bar | `horizontalBarValueDomain()` in `overview-dashboard-export.ts` |
| Charts / AI Insights | `ChartRenderer` → same resolver with `pipeline: "session"` (no 85% cap unless flag added) |
| PDF axis plan | `axis-presentation-plan.ts` → `resolveOverviewBarValueDomain` |

---

## Measured reference (Loan Balance H-Bar, Pass 5C.5)

| Metric | Pre-5C (×1.06) | 5C.4 (×1.10) | **5C.5 (85% cap)** |
|--------|----------------|--------------|---------------------|
| max value | $183.9M | $183.9M | $183.9M |
| domainMax | ~$195M | ~$202M | **~$216M** |
| Longest-bar utilization | ~94% | ~91% | **~85%** |
| Visually noticeable | — | No (~11px) | **Yes (~25–30px)** |

---

## Exact files (frozen baseline)

| Concern | File |
|---------|------|
| H-Bar visual constants + category sizing | `frontend/lib/horizontal-bar-visual.ts` |
| Bar domain + utilization cap + rate caps | `frontend/lib/overview-bar-value-domain.ts` |
| Overview axis props wiring | `frontend/lib/cartesian-chart-decisions.ts` |
| Count-axis clean ticks | `frontend/lib/overview-premium-axis-domain.ts` |
| Overview inline renderer | `frontend/app/page.tsx` |
| Shared session renderer | `frontend/app/components/home/chart-renderer.tsx` |
| Export domain + maxSize re-exports | `frontend/lib/overview-dashboard-export.ts` |
| Live H-Bar margins | `frontend/lib/overview-dashboard-plot-layout.ts` |
| Percent chip formatting | `frontend/lib/metric-value-format.ts` |
| Tests | `horizontal-bar-visual.test.ts`, `overview-bar-value-domain.test.ts`, `cartesian-chart-decisions.test.ts`, `overview-dashboard-export.test.ts`, `overview-premium-axis-domain.test.ts` |

---

## Do not change without regression evidence

- H-Bar/V-Bar `maxBarSize`, radius, category gap policy
- Zero-baseline post-process in `resolveOverviewBarValueDomain`
- Low-rate percent cap logic (5C.2)
- Overview H-Bar 85% utilization cap (5C.5)
- Score/rating tight-domain exception

Future cosmetic tuning belongs in **P2** only after explicit product request.
