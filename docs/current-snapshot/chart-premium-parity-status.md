# Chart Premium Parity Status

**Baseline established:** June 20, 2026  
**Benchmark:** Horizontal bar (H-Bar) — clean plot-frame start, high ink density, premium SaaS feel.

---

## Completed Parity Work

| Item | Status | Surfaces |
|------|--------|----------|
| H-Bar premium baseline | ✅ Accepted | All |
| V-Bar alignment parity | ✅ Complete | Overview live, Charts/AI, PNG, PDF |
| Overview V-Bar centering | ✅ Complete | Overview live (balanced outer margins) |
| Overview Line/Area alignment | ✅ Complete | Overview live + PNG (inline path) |
| Overview Scatter alignment | ✅ Complete | Overview live + PNG (inline path) |
| Line/Area/Scatter occupancy tuning | ✅ Complete | Overview live, Charts/AI session domains |
| Charts PNG domain parity | ✅ Complete | `detailViewLayout` on offscreen capture |
| Charts/AI left-gutter fix | ✅ Complete | Line, Area, V-Bar, Scatter session detail |
| PDF embed sizing | ✅ Complete | Kind-aware `resolvePdfChartEmbedPolicy` |
| Scatter occupancy improvements | ✅ Complete | Target 74% cluster occupancy; plot boost parity |

---

## Final Accepted Design Principles

### 1. H-Bar margin model (canonical)

- **`YAxis.width`** (or category axis width) owns tick-label space.
- **`margin.left`** is **outer padding only** (~8–14px), never duplicates axis width.
- **Right margin** is a modest balanced gutter (18–32px), not a mirror of left axis footprint.

### 2. Vertical value charts (V-Bar, Line, Area, Scatter)

- Same principle as H-Bar on **session detail** surfaces (Charts tab, AI Insights, PDF capture).
- `sessionDetailVerticalOuterMargins()` in `shared-chart-layout.ts` is the shared session helper.
- Overview mini-cards use parallel helpers in `overview-dashboard-plot-layout.ts` (`computeOverviewContinuousLiveOuterMargins`, etc.).

### 3. Domain vs frame

- **Domain padding** controls data occupancy (Y/X span used by series).
- **Margin/frame** controls where the plot band starts inside the card.
- These are independent layers; parity fixes addressed both in separate passes.

### 4. Centering without crushing width

- `balanceVerticalOuterMargins` in **full/export** mode keeps a modest right gutter — does not mirror full `marginLeft` onto `marginRight` (that crushed cartesian width on Insights/PDF).
- Plot titles and metadata chips stay above the plot; visual hierarchy preserved per `AGENTS.md`.

### 5. Export fidelity

- PNG/PDF use the same `ChartRenderer` (or Overview inline path) with `pngCaptureMode` / capture profiles.
- Readiness gates (`waitForBasicChartCaptureReady`) before artifact capture.
- PDF prefers `ChartArtifact` PNG; legacy DOM capture is fallback only.

### 6. Incremental scope

- Fix the **narrowest owning layer** (margin helper, domain resolver, or wiring).
- Do not redesign cards, footers, typography, or chart-kind routing as part of parity work.

---

## Remaining Intentional Live vs Export Differences

| Difference | Live | Export (PNG/PDF) | Rationale |
|------------|------|------------------|-----------|
| Overview Area fill opacity | 0.26 | 0.18 | Live readability; export print density |
| Overview line stroke / markers | Thinner live weights | `OVERVIEW_PNG_EXPORT_*` constants | PNG legibility at capture resolution |
| Overview plot height boost | +36px live band | Base band in PNG capture | Live premium feel; export uses fixed capture spec |
| Recharts animation | Enabled (≤ point threshold) | Disabled (`pngCaptureMode`) | Capture stability |
| Axis tick font size (Overview PNG) | 9px live | 15px export | PNG readability |
| PDF page layout | N/A | Kind-aware embed (`maxHeightMm`, `minWidthRatio`, aspect clamps) | Executive report pagination |
| Scatter / V-Bar PDF frame | N/A | Content-tight composite (no fixed dark canvas) | Avoid small chart in large frame |
| Charts PNG offscreen host | On-screen detail shell | 860px fixed capture root | Export dimension contract |

**Not intentional drift (fixed in this phase):**

- ~~Charts PNG Line/Area using legacy 12% domain vs session 5%~~ → fixed via `detailViewLayout` on offscreen `ChartRenderer`
- ~~Line/Area double-counting Y-axis width in `margin.left`~~ → fixed via `sessionDetailVerticalOuterMargins`

---

## Verification Matrix (post-phase)

| Pair | Domain parity | Frame / gutter parity |
|------|---------------|------------------------|
| Overview live ↔ Overview PNG | ✅ Same `surface: "overview"` | ⚠️ Cosmetic (fill, stroke, height) |
| Charts live ↔ Charts PNG | ✅ Session domain | ✅ Session outer margins |
| AI Insights live ↔ PDF | ✅ Session domain | ✅ Same capture path |
| H-Bar ↔ Line/Area (session) | N/A (different semantics) | ✅ Same outer-pad model |

Unit tests: `line-area-export-parity.test.ts`, `chart-layout-config.test.ts`, `shared-chart-layout.test.ts`, `overview-premium-axis-domain.test.ts`.
