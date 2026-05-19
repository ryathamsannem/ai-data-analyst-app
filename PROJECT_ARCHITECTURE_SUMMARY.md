# AI Data Analyst App — Project Architecture Summary

Reference for starting a **fresh Cursor chat** or onboarding. Describes the **current** implementation as of the latest UI shell + Overview dashboard chart work.

**Product baseline:** see [`AGENTS.md`](AGENTS.md) — chart semantics, filters, PDF alignment, no drive-by refactors.

---

## 1. Current app architecture

### Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js App Router, React 19, Tailwind CSS v4 (`@import "tailwindcss"`), Recharts |
| Backend | FastAPI, pandas (in-memory `df` per process) |
| AI | Claude via `/ask` for narrative; chart series are deterministic (pandas) |
| Persistence | Client-only session (no per-user DB on frontend) |

### High-level layout

```
frontend/app/layout.tsx          → fonts, ThemeScript, globals.css
frontend/app/page.tsx            → single client “app” (~11.5k lines): all tabs + business logic
frontend/components/app-shell/   → sidebar + header + main scroll region
frontend/contexts/               → chart session store
frontend/lib/                    → chart contracts, axes, narrative, theme, overview tokens
backend/main.py                  → upload, filters, dashboard, preview, /ask
```

### Main shell (completed)

| File | Role |
|------|------|
| [`frontend/components/app-shell/app-shell.tsx`](frontend/components/app-shell/app-shell.tsx) | `AppShell`: sidebar + workspace; collapse persisted via `sidebar-prefs` |
| [`frontend/components/app-shell/app-sidebar.tsx`](frontend/components/app-shell/app-sidebar.tsx) | Vertical nav; maps to `MainNavTabId` |
| [`frontend/components/app-shell/app-header.tsx`](frontend/components/app-shell/app-header.tsx) | Page title, search placeholder, **ThemeToggle** |
| [`frontend/components/app-shell/nav-config.tsx`](frontend/components/app-shell/nav-config.tsx) | Nav items + icons |
| [`frontend/app/components/home/main-nav-tabs.tsx`](frontend/app/components/home/main-nav-tabs.tsx) | Tab id types + titles (sidebar uses same ids) |

**Layout model:** No nested “floating content panel” gutter. `app-workspace` + `app-main-scroll` + `app-main-inner app-page-gutter` (max-width ~100rem). Overview/charts content scrolls inside main, not a second framed card.

### Integration hub

[`frontend/app/page.tsx`](frontend/app/page.tsx) wraps `HomeInner` in `ChartSessionProvider`. It owns:

- Tab state (`activeTab`), upload, column mapping modal, filters
- `askAI`, `aiAnswerByChartId`, insight pin / `preservePinnedChart`
- Overview auto-dashboard UI + session sync
- Charts tab + off-screen capture for PDF/PNG
- Export tab + `downloadReport`

**Performance:** `React.memo` on heavy subtrees (`OverviewDashboardChartSlot`, `AppShell`, nav), `useMemo` / `useCallback`, `useTransition` for tab switches, `useDeferredValue` on Data Preview search.

### Backend (unchanged shape)

| Endpoint | Purpose |
|----------|---------|
| `POST /upload` | CSV/Excel ingest, profile, mapping inference, initial `autoDashboard` |
| `POST /select-sheet` | Excel sheet switch |
| `POST /filtered-dashboard` | Filtered cohort + refreshed auto-dashboard |
| `POST /preview` | Paginated Data Preview |
| `POST /update-column-mapping` | User role mapping |
| `POST /ask` | Question → visualization + Claude narrative + `analysis` |

---

## 2. Current completed features

### Core product

- Upload CSV/Excel, multi-sheet selection, column mapping modal with confidence hints
- Global dashboard filters + grouped date range (Overview + AI Insights)
- **Overview:** KPI cards, inline KPI chips, AI summary bullets, Auto Dashboard + **Auto Dashboard Charts**
- **Data Preview:** sticky header/first column, search, column profile popover
- **AI Insights:** 30/70 suggested questions / Ask AI, executive blocks gated on `hasValidAIAnswer`, confidence + narrative tone
- **Charts:** timeline aside + main chart via shared `ChartRenderer`
- **Export:** executive PDF (session vs insight scope), chart PNG, contract validation
- Overview → Charts / Ask AI navigation with scroll + auto-ask refs

### UI / shell (recent)

- **Light + dark theme** with `ThemeScript` (no flash), `ThemeToggle`, CSS variables in `globals.css`
- **Sidebar layout** (collapsible, mobile overlay), unified workspace background
- Premium button classes (`.saas-btn-premium`, `.saas-btn-accent`) wired from `ui-buttons.ts` / `overview-ui.ts`
- Overview KPI cards (`overview-kpi-card.tsx`), filter panel alignment, app header
- Auto Dashboard chart **card chrome**: header actions (Charts / Ask AI / PNG), footer insight pills (Top / Lowest / Gap), premium card styling

### Chart intelligence (shared libs, stable)

- `VisualizationContract` freeze + trend mode (`selected-visualization.ts`)
- `computeFinalChartPresentation` for Charts / AI / PDF (`final-chart-presentation.ts`)
- Axis layout helpers (`chart-axis-layout.ts`, `chart-time-x-axis.ts`)
- Canonical titles, semantic metrics, PDF pipeline (`pdf-report.ts`)

---

## 3. Theme system and sidebar layout (completed)

### Theme

| Piece | Location |
|-------|----------|
| Tokens | [`frontend/app/globals.css`](frontend/app/globals.css) — `:root` + `.dark` (surfaces, borders, sidebar, chart axis colors, shadows) |
| Helpers | [`frontend/lib/theme.ts`](frontend/lib/theme.ts) — `readStoredTheme`, `applyResolvedTheme`, `persistTheme` |
| FOUC guard | [`frontend/components/theme-script.tsx`](frontend/components/theme-script.tsx) in `layout.tsx` `<head>` |
| Toggle | [`frontend/components/theme-toggle.tsx`](frontend/components/theme-toggle.tsx) in app header |

Charts use theme-aware axis tokens: `--chart-axis-tick`, `--chart-axis-line`, `--chart-axis-label`.

### Sidebar

- Width tokens: `--sidebar-width`, `--sidebar-width-collapsed`
- Collapse preference: [`frontend/lib/sidebar-prefs.ts`](frontend/lib/sidebar-prefs.ts)
- Nav uses same tab ids as before: `overview` | `preview` | `insights` | `charts` | `export`
- **Tab state remains in-memory** in `page.tsx` (no URL routing per tab)

---

## 4. Known issues (especially Auto Dashboard Charts)

### Auto Dashboard Charts — active focus area

The Overview mini-chart section (`OverviewAutoDashboardChartCard` in `page.tsx`) has had several layout passes. **Verify on real data** at browser zoom **75%, 100%, 125%** in **light and dark**.

| Issue | Status / notes |
|-------|----------------|
| Blank chart area (`width(-1) height(-1)` in console) | **Mitigated:** `ResponsiveContainer` uses explicit `height={360}` + `minHeight={360}`; plot CSS sets `--overview-chart-plot-min-h: 360px`. Hard-refresh after deploy. |
| Horizontal overflow at some zoom levels | Grid uses `repeat(auto-fit, minmax(min(100%, 420px), 1fr))` — wide min can still squeeze two columns on medium viewports. Target design was **max 2 columns**, **560px** min, **1600px** centered wrap — **not fully landed in CSS** (see gap below). |
| Three charts in one row | Should not happen if wrap + max-width enforced; current grid may still fit 2 narrow columns before wrapping. |
| Line / trend charts cramped or overlapping X labels | Overview uses `computeOverviewDashboardChartPresentation` + `formatOverviewTrendTickLabel`, interval thinning, optional -25° rotation; manufacturing weekly series needs QA. |
| Large vertical axis titles | Overview cards use **compact** Y-axis layout and **no** rotated value-axis title on mini charts; titles shortened via `overviewDashShortValueAxisLabel`. |
| Footer insight chips overlap / clip | Chips are separate `<span>` pills with `flex-wrap`; edge cases on very narrow cards may still need padding tweaks. |
| `.overview-charts-wrap` class | Token `ovChartsWrap` is used in JSX and `overview-ui.ts`, but **`.overview-charts-wrap` rules may be missing from `globals.css`** — add `max-width: 1600px; margin: 0 auto` when finishing grid work. |

### Other regression-sensitive areas (unchanged)

- `preservePinnedChart` / `aiAnswerByChartId` restore on chart switch
- `selectChart` must set **both** `activeId` and `insightChartId`
- Overview API `autoDashboard` vs session snapshots must stay aligned via `dashboardChartKey` + `getCanonicalChartTitle`
- PDF: `validateExportMatchesContract`, off-screen capture refs

---

## 5. Chart rendering approach

### Two rendering paths

| Path | Where | Purpose |
|------|--------|---------|
| **Shared** | [`frontend/app/components/home/chart-renderer.tsx`](frontend/app/components/home/chart-renderer.tsx) | Charts tab, AI Insights (`AiInsightChartShell`), PDF/PNG capture |
| **Overview mini** | `OverviewAutoDashboardChartCard` inside [`frontend/app/page.tsx`](frontend/app/page.tsx) | Auto Dashboard Charts only — local Recharts, overview-specific margins and presentation |

Do **not** assume changes to `ChartRenderer` fix Overview cards (or vice versa) unless intentionally shared.

### Overview mini-chart pipeline

1. **Data:** `autoDashboard.charts[]` from API (`parseAutoDashboardPayload` in `page.tsx`).
2. **Presentation (overview-only):** `computeOverviewDashboardChartPresentation()` — stricter than `computeFinalChartPresentation`:
   - Line/area only if time series looks readable (2–28 points, mostly temporal labels).
   - Vertical bar only if ≤4 categories and short labels.
   - Otherwise horizontal bar.
3. **Layout width:** `OverviewDashboardChartSlot` measures card width via `ResizeObserver` → `viewportWidthPx` for axis plans.
4. **Category plan:** `computeCartesianCategoryPlanForRender(..., allowHorizontalBarFallback: true)` for vertical bars; can flip to horizontal in-card via `miniCategoryPlan.renderAsHorizontalBar`.
5. **Render:** Recharts `ResponsiveContainer` `width="100%"`, `height={360}`, `minWidth={0}`.
6. **Margins:** `OV_DASH_CHART_MARGIN` — top 24, right 32, bottom 48, left 32 (left may grow for Y-axis tick width).
7. **Trend ticks:** `formatOverviewTrendTickLabel` (e.g. `Feb 03`); `computeLineAreaXAxisInterval`; X label often **Week** from title heuristics.
8. **Footer:** `formatOverviewMiniInsightChips()` → three pills (Top / Lowest / Gap).

### Shared presentation (Charts / AI / PDF)

- `computeFinalChartPresentation` in [`frontend/lib/final-chart-presentation.ts`](frontend/lib/final-chart-presentation.ts)
- `freezeVisualizationContract`, `isTrendMode`, `sortRowsForPresentation` in [`frontend/lib/selected-visualization.ts`](frontend/lib/selected-visualization.ts)
- Axis helpers: [`frontend/lib/chart-axis-layout.ts`](frontend/lib/chart-axis-layout.ts), [`frontend/lib/chart-time-x-axis.ts`](frontend/lib/chart-time-x-axis.ts)

### Overview styling tokens

| Token / class | File |
|---------------|------|
| `ovChartsWrap`, `ovChartGrid`, `ovDashChartCard`, … | [`frontend/lib/overview-ui.ts`](frontend/lib/overview-ui.ts) |
| `.overview-dash-chart-card`, `.overview-chart-plot`, grid | [`frontend/app/globals.css`](frontend/app/globals.css) |
| `--overview-chart-plot-min-h` | `globals.css` (:root) |

### Key components

| Component | Path |
|-----------|------|
| `OverviewDashboardChartSlot` | `page.tsx` — memo wrapper + width measurement |
| `OverviewAutoDashboardChartCard` | `page.tsx` — header, plot, footer chips |
| `OverviewKpiCard` | `components/home/overview/overview-kpi-card.tsx` |
| `OverviewInlineKpiChip` | `components/home/overview-inline-kpi-chip.tsx` |
| `OverviewAiSummaryPanel` | `components/home/overview/overview-ai-summary.tsx` |
| `ChartInsightViewportWrapper` | `components/home/chart-insight-viewport-wrapper.tsx` |
| `WrappedCategoryYAxisTick` | `components/chart-category-axis-tick.tsx` |
| `FilterPanel` | `components/home/filter-panel.tsx` |

---

## 6. What must NOT be changed (unless explicitly requested)

These areas are easy to break with “layout-only” PRs:

| Area | Why |
|------|-----|
| **`askAI` flow** | `preservePinnedChart`, bundle save on lineage parent, narrative sanitization |
| **Export logic** | `downloadReport`, `validateExportMatchesContract`, capture refs, `runExecutivePdfExport` |
| **Dataset parsing / API contracts** | `POST /upload`, mapping payloads, `autoDashboard` shape from backend |
| **Navigation behavior** | Overview → Charts (`openDashboardChartInChartsTab` + scroll ref), Overview → AI (`askAiAboutDashboardChart` + auto-ask ref), tab ids |
| **`ChartSessionProvider` snapshot shape** | `pushAIChart`, `replaceAutoDashboardCharts`, `dashboardChartKey` linking |
| **`computeFinalChartPresentation` for non-Overview surfaces** | Charts tab, AI Insights, PDF must stay consistent with each other |
| **Horizontal bar semantics** | Do not force `bar_horizontal` to vertical |

**Safe to change:** Overview-only CSS, `computeOverviewDashboardChartPresentation`, `OverviewAutoDashboardChartCard` layout/axes/margins, `globals.css` overview-* classes, card chrome.

---

## 7. Recommended next step

**Fix Auto Dashboard Charts layout, responsiveness, axis labels, and card polish** — narrow scope, UI-only:

1. **Grid**
   - Add missing `.overview-charts-wrap { max-width: 1600px; margin: 0 auto; width: 100%; min-width: 0; }`
   - Desktop: max **2** columns (`repeat(2, minmax(0, 1fr))` at `min-width: 1120px` or `auto-fit` with `minmax(min(100%, 560px), 1fr)` inside 1600px wrap).
   - Tablet/mobile: **1** column below breakpoint.
   - Never three charts per row.

2. **Charts**
   - Keep explicit plot height (360px) for `ResponsiveContainer`; do not use `height="100%"` without resolved parent height.
   - QA line charts with `employee_test.csv` and manufacturing/production-loss weekly data at 75% / 100% / 125% zoom.

3. **Axes**
   - Short trend ticks; interval when crowded; rotate only if needed (max -25°).
   - Short value-axis phrasing; X-axis **Week** (or Day/Month) on trends.
   - Horizontal bar for long categories or >4 groups.

4. **Cards**
   - Preserve header actions (not over plot), footer chip `flex-wrap`, premium border/shadow in light + dark.

5. **Regression pass**
   - After changes: upload → filter → Overview drill → Charts / Ask AI → PDF export (do not touch export pipeline logic).

---

## Quick reference

### Tab → primary state

| Tab | State | Backend |
|-----|--------|---------|
| Overview | `autoDashboard`, filters, `dashboardSnapshotByKey` | `/upload`, `/filtered-dashboard` |
| Data Preview | `preview`, `profile` | `/preview` |
| AI Insights | `question`, `answer`, `insightSnapshot` | `/ask` |
| Charts | `chartHistory`, `activeSnapshot` | Session only |
| Export | `exportOptions`, capture refs | Client PDF |

### Files to open first in a new chat

1. [`frontend/app/page.tsx`](frontend/app/page.tsx) — search `OverviewAutoDashboardChartCard`, `computeOverviewDashboardChartPresentation`, `Auto Dashboard Charts`
2. [`frontend/app/globals.css`](frontend/app/globals.css) — search `overview-dash-chart`, `overview-chart-grid`
3. [`frontend/lib/overview-ui.ts`](frontend/lib/overview-ui.ts)
4. [`AGENTS.md`](AGENTS.md)

### Regression checklist (after Overview chart changes)

- [ ] Charts render (no Recharts -1 size); light + dark
- [ ] 75% / 100% / 125% zoom — no horizontal overflow; ≤2 columns on desktop
- [ ] Trend chart readable (ticks, line visible, Week label)
- [ ] Insight footer chips: three separate pills, wrapped
- [ ] Overview → Charts / Ask AI still work
- [ ] Charts tab / AI Insights / PDF unchanged (`computeFinalChartPresentation` path)

---

*Last updated: reflects app shell, theme toggle, sidebar layout, and Overview Auto Dashboard Charts work in progress. Update this file when behavior changes materially.*
