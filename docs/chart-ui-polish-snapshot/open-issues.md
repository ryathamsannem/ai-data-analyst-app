# Open Issues — Chart Visual Polish (Chart UI Polish Baseline)

**Branch:** `chart-ui-polish-baseline`  
**Stable commit:** `4247ef3`  
**Scope:** **Remaining chart visual issues only** — no implementation proposals.  
**Out of scope here:** Backend session model, auth, quota, PDF pagination, Data Preview filters (see [`open-issues.md`](../../open-issues.md) and [`bug-inventory.md`](../../bug-inventory.md)).

---

## Summary

On this branch, **H-Bar and Donut** represent the premium chart layout baseline. **Line, Area, and Scatter** render correctly but do not yet match that baseline. **Charts tab and AI Insights** continuous (non-H-Bar) charts can feel shorter or vertically compressed. **Overview** mini charts have a minor axis/footer alignment issue.

All items below are **visual/layout** — data correctness, routing, and export functional paths are stable.

---

## 1. Line / Area / Scatter do not visually match H-Bar premium layout

**Severity:** Medium (visual parity)  
**Surfaces:** Charts tab, AI Insights, Overview (when line/area/scatter appear), PNG export (inherits on-screen layout)

### Observed gap

Horizontal bar charts on this branch establish the **reference premium feel**:

- Generous vertical presence (category-scaled height for H-Bar)
- Balanced outer margins with optical centering
- Clear separation between plot, axis labels, and footer/metadata region
- Consistent inset plot surface (`ai-insights-viz-plot` border + padding)

Line, area, and scatter charts **function correctly** but appear visually **less premium** by comparison:

| Aspect | H-Bar (reference) | Line / Area / Scatter (current) |
|--------|-------------------|----------------------------------|
| Height strategy | Category-scaled above vh band floor | Fixed vh band only (`460–560px`) |
| Vertical presence | Tall, readable category stack | Plot can feel vertically constrained |
| Margin treatment | Dedicated H-bar layout engine | Generic cartesian / scatter presets |
| X-axis footer | Wrapped category ticks on Y | Angled temporal X or numeric X — busier footer zone |
| Grid styling | Full cartesian grid | Line/area: horizontal grid only |
| Plan viewport | 900px | 850px (line/area) / 760px (scatter) |

### Affected code regions (for future fix — not proposals)

- `frontend/app/components/home/chart-renderer.tsx` — line/area/scatter branches
- `frontend/lib/chart-time-x-axis.ts` — bottom margin multiplier (0.86 detail / 0.94 session)
- `frontend/lib/shared-chart-layout.ts` — shared band without kind-specific elevation
- `frontend/lib/chart-layout-config.ts` — `verticalCartesianOuterMargins` line/area trim

### What is NOT broken

- Chart type selection (trend → line/area, correlation → scatter)
- Data series correctness
- Tooltips and axis formatters
- Export capture (matches on-screen)

---

## 2. Charts tab and AI Insights continuous charts feel shorter / compressed

**Severity:** Medium (visual perception)  
**Surfaces:** Charts tab session preview, AI Insights visualization card  
**Chart kinds primarily affected:** Line, area, scatter (also bar/histogram relative to H-Bar)

### Observed gap

Both Charts tab and AI Insights use the **shared detail plot height system**:

```
SHARED_DETAIL_PLOT_BAND: clamp(460px, 52vh, 560px)
resolveSharedDetailPlotHeight() → band for line/area/scatter
H-Bar exception: basePx 420 + slotPx 24 × categoryCount (cap 580)
```

Because line/area/scatter **do not receive category-based height scaling**, their plot areas can feel **shorter or compressed** compared to:

1. H-Bar charts in the same session/timeline
2. The overall visualization card chrome (header, metadata chips, intel strip, Why this chart, Smart Read)

### Contributing factors

| Factor | Detail |
|--------|--------|
| Shared CSS clamp | `.ai-insights-viz-plot { height: var(--insights-viz-plot-h, clamp(460px, 52vh, 560px)) }` |
| Charts tab sets same vars | `--charts-tab-plot-h` + `--insights-viz-plot-h` in `ChartsTabPlotTransition` |
| Header stack height | Sticky header + chips + intel + reason consume vertical space above plot |
| No H-Bar-style slot growth | Continuous charts don't add px per data point |
| Viewport ≤860px (Charts) | Session width cap may compress horizontal breathing room for line/area |

### User-visible symptom

When browsing the Charts timeline or viewing an AI Insights answer with a line/area/scatter chart, the **plot slot appears visually shorter** than neighboring H-Bar entries or than the surrounding card chrome suggests — the chart reads as **compressed into the middle** of a tall card frame.

### What is NOT broken

- Plot height formula is intentional and shared (parity between Charts + Insights)
- H-Bar height behavior is correct and serves as the target feel
- Timeline selection, transitions, and metadata remain stable

---

## 3. Overview minor axis / footer alignment issue

**Severity:** Low (visual polish)  
**Surface:** Overview auto-dashboard mini cards only (Pipeline B)

### Observed gap

Overview mini charts use a **separate rendering pipeline** with fixed plot heights:

- Mobile: **300px**
- Desktop (≥768px): **340px**

Axis labels, category ticks, and footer-adjacent spacing in some Overview cards show **minor misalignment** — typically:

- X-axis label or tick band sitting slightly off relative to card footer / insight chips
- Bottom margin inconsistent between vertical bar and horizontal bar mini variants
- `overview_half` layout variant (`overview-dashboard-plot-layout.ts`) tighter than detail view

### Affected code regions (for future fix — not proposals)

- `frontend/app/page.tsx` — `buildOverviewDashboardPlot()`, `useOverviewDashPlotHeight()`
- `frontend/lib/overview-dashboard-plot-layout.ts` — `layoutVariant: overview_half`
- `frontend/app/globals.css` — `.overview-dash-chart-card__footer`, plot min-heights

### What is NOT broken

- Chart data and kind resolution on Overview
- PNG export from Overview cards (parity validation passes)
- Grid layout and card actions (View in Charts, Ask AI, PNG)
- H-Bar premium feel on Overview is generally acceptable; issue is **alignment**, not missing charts

---

## 4. Issue matrix (chart visual only)

| ID | Issue | Kinds | Surfaces | Severity |
|----|-------|-------|----------|----------|
| CV-1 | Line/area/scatter lack H-Bar premium layout parity | Line, Area, Scatter | Charts, Insights, Overview, PNG | Medium |
| CV-2 | Continuous charts feel shorter/compressed vs H-Bar | Line, Area, Scatter (+ bar/hist relative) | Charts, Insights | Medium |
| CV-3 | Overview mini chart axis/footer alignment | All (mini layout) | Overview | Low |

---

## 5. Explicitly not in scope for this polish pass

The following are documented elsewhere and are **not chart visual issues**:

- Global in-memory dataset (C1)
- AI narrative drift (C2)
- Chart routing fallback risk (C3)
- Missing API key fallback (C4)
- `/preview` not filter-aware (H2)
- PDF print-light theme (by design)
- Bulk performance work (pending per `4247ef3` commit message)
- Monolithic file structure (maintainability)

---

## 6. Validation datasets for repro (manual QA)

| Dataset | Path | Useful for |
|---------|------|------------|
| Dashboard showcase | `frontend/public/dashboard_showcase_dataset.csv` | Mixed chart types on Overview |
| Screenshot fixture | `frontend/public/screenshot-fixture.csv` | Trend + category charts |
| Backend fixture | `backend/tests/fixtures/dashboard_showcase_dataset.csv` | Engine diversity tests |

**Suggested visual compare flow (when fixing):**

1. Upload showcase CSV → Overview grid.
2. Open same chart types in Charts tab timeline.
3. Ask AI trend question (line) and share question (donut) in Insights.
4. Compare vertical plot presence: H-Bar vs line vs scatter side by side.

---

*Snapshot generated: 2026-06-16 — branch `chart-ui-polish-baseline` @ `4247ef3`. No implementation proposed.*
