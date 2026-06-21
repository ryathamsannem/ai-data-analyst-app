# Changelog — Chart Premium Parity Phase

**Phase window:** June 2026  
**Baseline established:** June 20, 2026  
**Benchmark:** Horizontal bar (H-Bar) premium plot-frame usage  

---

## H-Bar

### Root cause
H-Bar already followed the correct model: `YAxis.width` owns category tick space; `margin.left` is outer padding only (~14px). Other cartesian kinds did not follow this model consistently.

### Fix
H-Bar established as **immutable benchmark**. No H-Bar renderer changes during parity phase. Other kinds aligned **to** H-Bar principles.

### Files touched
- Reference only: `chart-axis-layout.ts` (`computeHorizontalBarAxisLayout`), `chart-renderer.tsx` H-Bar branch, `overview-dashboard-plot-layout.ts` (`computeOverviewHorizontalDashLayout`)

### Outcome
H-Bar remains the visual and margin-model reference across Overview, Charts, AI Insights, PNG, and PDF.

---

## V-Bar

### Root cause
1. **Overview live:** `balanceVerticalOuterMargins` mirrored left margin onto right (~55px empty right); V-Bar did not use expanded plot band.
2. **Overview live:** Double-counted Y-axis width in `margin.left` plus `YAxis.width`.
3. **PDF:** Fixed canvas embed made V-Bar feel smaller than live; wrong aspect in executive report.

### Fix
- `computeOverviewVBarLiveOuterMargins()` — outer left 10px; balanced right 18–32px based on left footprint.
- `computeOverviewVBarLivePlotMargins()` — plot height boost +36px; sparse-category top lift.
- Removed Y-axis width from outer `margin.left`; `YAxis.width` owns ticks.
- PDF: content-tight composite; `resolvePdfChartEmbedPolicy("bar")` → `maxHeightMm: 158`, `minWidthRatio: 0.88`.
- Session detail: `sessionDetailVerticalOuterMargins` in `verticalCartesianOuterMargins` when `insightUi`.

### Files touched
- `frontend/lib/overview-dashboard-plot-layout.ts`
- `frontend/app/page.tsx` (Overview inline V-Bar)
- `frontend/lib/chart-platform/chart-presentation-profile.ts`
- `frontend/lib/chart-layout-config.ts`
- `frontend/lib/shared-chart-layout.ts`
- `frontend/app/components/home/chart-renderer.tsx`
- Tests: `overview-dashboard-plot-layout.test.ts`, `chart-presentation-profile.test.ts`, `chart-layout-config.test.ts`

### Outcome
V-Bar fills the live card band comparably to H-Bar; PDF embed uses content-tight framing; session surfaces use H-Bar margin model.

---

## Line

### Root cause
1. **Occupancy:** Legacy 12% Y domain padding left data using ~59% of axis span on showcase trends; tick rounding masked intermediate pad values.
2. **Left gutter (session):** `sessionTrendDetailSideMargins` set `margin.left ≈ yAxisWidth + 4` while `YAxis.width` also reserved tick space → ~2× left footprint vs H-Bar.
3. **Charts PNG drift:** Offscreen capture omitted `detailViewLayout` → default 12% domain vs session 5% live.

### Fix
- `resolveOverviewMiniTrendAxisScale` / `surface: "overview"` with 5% pad (Overview live).
- `surface: "session"` wired in `ChartRenderer` for Charts/AI (5% pad).
- `sessionDetailVerticalOuterMargins()` — outer left 8–10px only.
- Charts PNG: `detailViewLayout` on offscreen `ChartRenderer`.
- Overview live stroke/marker weights preserved; PNG uses export constants.

### Files touched
- `frontend/lib/overview-premium-axis-domain.ts`
- `frontend/app/page.tsx`
- `frontend/app/components/home/chart-renderer.tsx`
- `frontend/lib/shared-chart-layout.ts`
- `frontend/lib/chart-layout-config.ts`
- `frontend/lib/line-area-export-parity.test.ts` (new)

### Outcome
Session Line charts align to card left plot boundary like H-Bar; domain occupancy ~74% on showcase data; Charts PNG matches live domain.

---

## Area

### Root cause
Same as Line for domain and left gutter. Additionally, live `fillOpacity: 0.18` made the band look empty even when domain was correct.

### Fix
- Same domain and margin fixes as Line.
- Overview live `fillOpacity: 0.26` (PNG remains 0.18 by export policy).
- Charts/AI area uses `fillOpacity: 0.22` in `ChartRenderer`.

### Files touched
- Same as Line, plus Area branch styling in `page.tsx` and `chart-renderer.tsx`

### Outcome
Area reads as substantial on live surfaces; frame alignment matches Line and H-Bar.

---

## Scatter

### Root cause
1. Plot height boost +32 vs H-Bar +36 — smaller band.
2. Occupancy target 70% left cluster using fraction of plot.
3. Session margins double-counted Y-axis width (`overviewTrendLiveSideMargins` / `computeOverviewScatterPremiumMargins`).
4. 3px point radius read small in large session frames.

### Fix
- `OVERVIEW_SCATTER_TARGET_OCCUPANCY`: 0.70 → 0.74.
- `OVERVIEW_SCATTER_PLOT_HEIGHT_BOOST_PX`: 32 → 36.
- `OVERVIEW_SCATTER_POINT_RADIUS_PX`: 3 → 3.5.
- Overview PNG: inline scatter path + balanced `computeOverviewScatterDashMargins`.
- Session: `sessionDetailVerticalOuterMargins` replaces `computeOverviewScatterPremiumMargins` in `ChartRenderer`.

### Files touched
- `frontend/lib/overview-premium-axis-domain.ts`
- `frontend/lib/overview-dashboard-plot-layout.ts`
- `frontend/app/page.tsx`
- `frontend/app/components/home/chart-renderer.tsx`
- Tests: `overview-premium-axis-domain.test.ts`, `overview-dashboard-plot-layout.test.ts`

### Outcome
Scatter cluster occupies ~72–76% of axis span; plot band matches H-Bar height; session left gutter aligned.

---

## PNG Export

### Root cause
1. Charts PNG offscreen host did not pass `detailViewLayout` → wrong domain for Line/Area.
2. Some surfaces inherited legacy margin helpers that duplicated axis width.
3. Overview PNG correctly shared Overview inline path but differed cosmetically (fill, stroke, height).

### Fix
- `detailViewLayout` on Charts tab offscreen `ChartRenderer`.
- Session margin model applied to all session PNG captures via same props as live.
- Overview PNG continues inline `buildOverviewDashboardPlot(pngCapture=true)` — domain parity with live.

### Files touched
- `frontend/app/page.tsx`
- `frontend/app/components/home/chart-renderer.tsx`
- `frontend/lib/chart-capture-controller.ts`
- `frontend/lib/chart-png-export-layout.ts`

### Outcome
Charts PNG matches Charts live for domain and left alignment; Overview PNG domain matches Overview live.

---

## PDF

### Root cause
1. V-Bar and scatter embedded in fixed canvas → excessive empty frame in executive PDF.
2. Line/Area PDF capture shared session path but inherited double-counted margins before gutter fix.
3. Kind-generic embed sizing crushed or under-filled some chart types.

### Fix
- `pdfChartUsesContentTightComposite()` for scatter and vertical bar.
- `resolvePdfChartEmbedPolicy()` per kind (H-Bar 158mm, Line/Area 158mm @ 0.9 width, Scatter 150mm @ 0.92, V-Bar 158mm @ 0.88, Donut 108mm).
- PDF hidden capture uses `renderDatasetChart(..., detailViewLayout=true, pngCaptureMode=true)` — same fixed margins as Charts live post gutter fix.
- Primary embed path: `ChartArtifact` from `captureChartPngArtifact(profile: "pdfChart")`.

### Files touched
- `frontend/lib/chart-platform/chart-presentation-profile.ts`
- `frontend/lib/chart-platform/chart-capture-controller.ts`
- `frontend/app/pdf-report.ts`
- `frontend/lib/build-executive-pdf-input.ts`
- `frontend/app/page.tsx` (PDF capture mount)

### Outcome
PDF chart images match on-screen session styling; embed sizing is kind-appropriate; no large blank left gutter on Line/Area.

---

## Phase Summary

| Metric | Before phase | After phase |
|--------|--------------|-------------|
| Frontend tests | ~540 | **546** (71 files) |
| Build | Passing | **Passing** |
| Session Line left footprint | ~148px | ~80px |
| Showcase Line Y occupancy (session) | ~59% | ~74% |
| Charts PNG vs live domain | Drift on Line/Area | Aligned |
| H-Bar | Benchmark | Unchanged benchmark |

---

## Out of Scope (this phase)

- Histogram dedicated premium pass
- Donut/Pie margin changes
- Overview PNG cosmetic unification (fill/stroke/height)
- Chart kind routing changes
- Card/footer/header layout redesign
- Backend viz engine changes
