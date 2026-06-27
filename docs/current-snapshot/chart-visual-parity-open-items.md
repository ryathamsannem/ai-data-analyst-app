# Chart Visual Parity — Open Items (H-Bar vs V-Bar)

Snapshot: June 27, 2026 · After Overview Pass 5A.3.
**Status: UNRESOLVED.** This is the top open visual issue (P0).

---

## Symptom

Even after Pass 5A.3 radius/thickness changes and axis-formatting improvements, the **horizontal bar
(H-Bar) still does not visually match the V-Bar premium finish** in the latest manual screenshots:

- H-Bar bars still read slightly heavy / different in weight from V-Bar.
- The end radius and band rhythm do not feel identical to the vertical bars.
- The chart "fills" its plot band differently from the V-Bar.

The constants were aligned **proportionally** to V-Bar (V-Bar top radius ≈15–18% of bar thickness → 5px
end radius on the thinner H-Bar), yet the rendered output still differs. This strongly suggests the gap is
**geometry / layout behavior**, not the literal radius/thickness numbers.

> Guidance: **Do not blindly change constants again.** First compare the *rendered* plot bands and bar
> geometry (DOM/SVG measurements) between a V-Bar and an H-Bar with the same data, then decide.

---

## Possible root causes to investigate (in priority order)

1. **Different Recharts layout behavior between vertical and horizontal bars.** `layout="vertical"` (H-Bar)
   vs default (V-Bar) compute band thickness and spacing through different axis types (category on Y vs X),
   which can change effective bar size independent of `maxBarSize`.
2. **Different plot dimensions / category band calculation.** H-Bar category band height is derived from
   `YAxis` (type `category`) + plot height; V-Bar band width from `XAxis` + plot width. With different card
   aspect ratios the per-band space (and thus visual bar weight) diverges.
3. **`barCategoryGap` / `barGap` / `maxBarSize` interaction.** V-Bar sets explicit `barCategoryGap` /
   `barGap` in some paths; the H-Bar path does not set the same gaps. `maxBarSize` only caps thickness — it
   does not equalize the band rhythm.
4. **H-Bar value-axis domain / tick spacing.** The H-Bar value axis (`resolveOverviewBarValueDomain` /
   `hBarValueAxisProps`) may produce a domain/tick layout that compresses the plotting region differently
   from the V-Bar value axis, changing how much horizontal space bars occupy.
5. **Card-level padding / plot band utilization.** Outer `margin` (left/right/top/bottom) and category-axis
   width (`hb.categoryAxisWidth`) differ between the two; the H-Bar reserves width for category labels on the
   left, shrinking the plot band.
6. **Overview inline renderer vs shared `ChartRenderer`.** Overview mini-cards render inline in `page.tsx`
   with their own literals; AI Insights / Charts use the shared `ChartRenderer` with the
   `horizontal-bar-visual.ts` constants. The two H-Bar paths are not guaranteed pixel-identical.

---

## Latest constants in use (as of 5A.3)

### Shared H-Bar constants — `frontend/lib/horizontal-bar-visual.ts`

```ts
HORIZONTAL_BAR_END_RADIUS         = [0, 5, 5, 0]
HORIZONTAL_BAR_MAX_SIZE           = { compact: 22, detail: 36, default: 28 }
HORIZONTAL_BAR_STACKED_MAX_SIZE   = { compact: 16, detail: 26, default: 20 }
HORIZONTAL_BAR_STACKED_RADIUS     = [0, 5, 5, 0]
```

### Overview inline renderer — `frontend/app/page.tsx`

```ts
// H-Bar
radius     = [0, 5, 5, 0]
maxBarSize = pngCapture ? OVERVIEW_PNG_EXPORT_HBAR_MAX_SIZE /* 48 */ : 28
// (no explicit barCategoryGap / barGap on the H-Bar path)

// V-Bar
radius     = isHist ? [3, 3, 0, 0] : [8, 8, 4, 4]
maxBarSize = isHist ? OVERVIEW_HISTOGRAM_LIVE_MAX_BAR_SIZE /* 52 */
                    : OVERVIEW_PNG_EXPORT_VBAR_MAX_SIZE     /* 52 */
```

### Shared `ChartRenderer` — `frontend/app/components/home/chart-renderer.tsx`

```ts
// H-Bar
radius     = HORIZONTAL_BAR_END_RADIUS                 // [0,5,5,0]
maxBarSize = compact ? HORIZONTAL_BAR_MAX_SIZE.compact  // 22
           : detailLayout ? HORIZONTAL_BAR_MAX_SIZE.detail   // 36
           : HORIZONTAL_BAR_MAX_SIZE.default                 // 28

// V-Bar
radius     = isHistogram ? [3, 3, 0, 0] : [10, 10, 6, 6]
maxBarSize = isHistogram ? (compact ? 52 : 60) : (compact ? 40 : 56)
barCategoryGap / barGap = set conditionally (see SHARED_CHART_LAYOUT.verticalBar)
```

### Export max-size constants — `frontend/lib/overview-dashboard-export.ts`

```ts
OVERVIEW_PNG_EXPORT_HBAR_MAX_SIZE     = 48
OVERVIEW_PNG_EXPORT_VBAR_MAX_SIZE     = 52
OVERVIEW_HISTOGRAM_LIVE_MAX_BAR_SIZE  = 52
```

> Observation worth checking: V-Bar `maxBarSize` (52–56) is materially larger than H-Bar (28 live).
> The V-Bar also uses a larger corner radius (8–10) on a wider bar, so the *ratio* differs even though the
> H-Bar 5px was chosen to match V-Bar's ratio. Confirm whether the perceived mismatch is thickness, radius
> ratio, band gap, or plot-band width — by measurement, not by guessing.

---

## Exact files responsible

| Concern | File |
|---------|------|
| Shared H-Bar visual constants | `frontend/lib/horizontal-bar-visual.ts` |
| Shared H-Bar + V-Bar rendering (AI Insights / Charts) | `frontend/app/components/home/chart-renderer.tsx` |
| Overview inline H-Bar + V-Bar rendering | `frontend/app/page.tsx` |
| Bar value-axis tick formatting | `frontend/lib/overview-premium-axis-domain.ts` (`formatOverviewBarValueAxisTick`) |
| Bar value-axis domain / props | `frontend/lib/cartesian-chart-decisions.ts` (`resolveCartesianBarValueAxisProps`), `resolveOverviewBarValueDomain` |
| Shared layout (gaps, viewport) | `frontend/lib/shared-chart-layout.ts` |
| H-Bar axis layout (margins, category width) | H-Bar layout helper used by both paths (`computeHorizontalBarAxisLayout`) |
| Export max-size constants | `frontend/lib/overview-dashboard-export.ts` |
| Visual-constant tests | `frontend/lib/horizontal-bar-visual.test.ts` |

---

## Recommended next step (do this first)

Render a V-Bar and an H-Bar from the **same dataset** on the same surface and **measure** the SVG:
plot band width/height, per-category band size, actual bar thickness, gap between bars, and value-axis
domain/ticks. Compare against the V-Bar. Only after identifying *which* geometry differs should constants,
gaps, or layout be adjusted. Avoid further blind constant edits.
