# UI Architecture Snapshot

**Status:** Stable production snapshot (May 2026)  
**Scope:** Application-wide UI structure with **Charts tab** documented at current baseline.

**Related:** [`LATEST_STABLE_UI_SNAPSHOT.md`](LATEST_STABLE_UI_SNAPSHOT.md) · [`CHARTS_TAB_STABLE_SUMMARY.md`](CHARTS_TAB_STABLE_SUMMARY.md) · [`AI_INSIGHTS_STABLE_SUMMARY.md`](AI_INSIGHTS_STABLE_SUMMARY.md) · [`AGENTS.md`](AGENTS.md)

---

## 1. Application shell

| Layer | Location | Behavior |
|-------|----------|----------|
| Root layout | `frontend/app/layout.tsx` | Fonts, `ThemeScript`, `globals.css` |
| App shell | `frontend/components/app-shell/` | Sidebar + header + scrollable main |
| Single page app | `frontend/app/page.tsx` | All tabs via `activeTab` state |
| Theme | `frontend/lib/theme.ts` | `class="dark"` on `<html>` |

**Navigation:** `MainNavTabs` — `overview` · `preview` · `insights` · `charts` · `export` (no per-tab URLs).

**Content scroll:** `app-main-scroll` → `app-main-inner` (max-width ~100rem).

---

## 2. Design system (cross-tab)

### Token modules

| Tab / area | Module |
|------------|--------|
| Global | `frontend/app/globals.css` (`:root`, `.dark`) |
| Overview | `frontend/lib/overview-ui.ts` |
| AI Insights | `frontend/lib/ai-insights-ui.ts` |
| Charts | `frontend/lib/charts-tab-ui.ts` |
| Buttons | `frontend/lib/ui-buttons.ts` + `.saas-btn-*` |
| Data Preview | `frontend/lib/data-preview-ui.ts` |

### Spacing & radius

- Major cards: `rounded-2xl` / `rounded-[1.35rem]`, `p-3`–`p-5`
- Filters: unified **52px** control height (`FilterPanel`)
- Grids: `gap-3`–`gap-6`, `min-h-0` on flex children for nested scroll

### Dark mode layers

- **Global:** `--card`, `--surface-elevated`, `--foreground`, chart axis vars
- **AI Insights page:** `--insights-layer-shell` … `--insights-layer-inset`
- **Charts tab:** Reuses insights layer tokens on preview card via `chart-viz-theme`; page shell via `charts-tab-page`

### Motion

- Restrained transitions (`duration-200`–`300`, cubic-bezier easing)
- `prefers-reduced-motion` overrides on Charts preview animations and timeline hover lift

---

## 3. Tab architecture overview

```
AppShell
└─ page.tsx (HomeInner + ChartSessionProvider)
   ├─ overview    → auto dashboard, KPIs, mini charts (local Recharts path)
   ├─ preview     → Data Preview grid
   ├─ insights    → Ask AI, viz card, executive stack (insightMode=true path)
   ├─ charts      → timeline + session preview (insightMode=false path)
   └─ export      → PDF / report options
```

| Tab | Primary data | Chart path |
|-----|--------------|------------|
| Overview | `/filtered-dashboard` | Mini charts — **separate** presentation helper |
| AI Insights | `/ask` | Shared `ChartRenderer`, `insightMode=true` |
| Charts | Session store | Shared `ChartRenderer`, `insightMode=false` |
| Export | Client | Captured DOM from session or insight ref |

---

## 4. Charts tab UI architecture (current baseline)

### 4.1 Region map

```
┌─────────────────────────────────────────────────────────────┐
│ chartsTabPage                                                │
│  [Header: title + desc | Download PNG]                       │
│  ┌──────────────┬──────────────────────────────────────────┐│
│  │ Timeline     │ chartsTabVizPreviewCard                     ││
│  │ (scroll)     │  ┌ sticky header band ────────────────────┐ ││
│  │              │  │ title / chips / intel / why strip      │ ││
│  │              │  └────────────────────────────────────────┘ ││
│  │              │  [ChartsTabPlotTransition → plot]           ││
│  │              │  [SmartChartInsightPanel]                   ││
│  └──────────────┴──────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Component tree (preview column)

| Order | Component | Token / class source |
|-------|-----------|----------------------|
| Shell | `chartsTabVizPreviewCard` | `ai-insights-ui.ts` + `chart-viz-theme` |
| Sticky band | `chartsTabPreviewHeaderSticky` | `charts-tab-ui.ts` + `globals.css` |
| Title | `chartHeadingBlock` or fallback zone | `chartsTabVizHeaderZone`, `aiInsightsVizTitle` |
| Pills | `ChartContextSummary` | `aiInsightsVizMetaChip*` + `compactChips` |
| Intel row | `ChartsTabIntelligenceStrip` | `charts-tab-ui.ts` |
| Why strip | `ChartsTabChartReason` | `charts-tab-ui.ts` + `generate-chart-reason.ts` |
| Plot | `ChartsTabPlotTransition` → `ChartInsightViewportWrapper` → `ChartRenderer` | `charts-tab-ui.ts`, `chart-renderer.tsx` |
| Deep read | `SmartChartInsightPanel` | `ai-insights-ui.ts` smart read tokens |

### 4.3 Timeline UI architecture

| Part | Structure |
|------|-----------|
| Shell | `chartsTabTimelineAside` — `overflow-hidden`, flex column |
| Header | Fixed — title + description |
| Body | `charts-tab-timeline-scroll` — **only** scrollable region |
| Lists | Two sections with `chartsTabTimelineSectionLabel` |
| Card | `ChartTimelineCard` — 108px min height, badge top-right |

### 4.4 Visual hierarchy (Charts)

1. Tab title (page level)  
2. Chart title / subtitle (preview)  
3. Metadata chips (compact, centered wrap)  
4. Intelligence strip (secondary inset bar)  
5. Why this chart (muted one-liner)  
6. Plot (primary visual weight)  
7. Smart read (tertiary, separated by top border)

### 4.5 Responsive grid

| Breakpoint | Layout |
|------------|--------|
| Default | Stacked: timeline above preview |
| `lg+` | `23%` timeline · `1fr` preview; timeline height `min(72vh, 540px)` |
| Header | `md:flex-row` title + download |

### 4.6 Zoom behavior (80% – 125%)

- No browser-zoom-specific code; stability comes from:
  - `clamp()` plot slot in CSS
  - Viewport-derived `chartHeightMain` with **440px** cap
  - `min-h-0` / `overflow` discipline on grid and timeline
  - Relative `rem`/`px` typography on tokens

---

## 5. Shared chart visualization shell

Charts preview **shares** the AI Insights visualization theme:

| Shared piece | Purpose |
|--------------|---------|
| `chartVizThemeScope` | Scopes `globals.css` Recharts + plot rules |
| `chartsTabVizPreviewCard` | Same card chrome as insights viz (padding tuned for Charts) |
| `ChartInsightViewportWrapper` | Centering; `sessionMode` removes 760/850/900 max-width cap |
| `aiInsightsVizMetaChip*` | Metadata pills |

**Difference from AI Insights:**

| Aspect | Charts | AI Insights |
|--------|--------|-------------|
| Plot height | `resolveChartsTabPreviewPlotHeight` | Insight shell metrics + CSS var |
| Margins | Session cartesian plan | `insightCartesianOuterMargins` |
| Question gate | None on smart read | `insightChartMatchesCurrentQuestion` |
| Layout grid | Timeline + preview | Q&A two-column |

---

## 6. State and data flow (Charts)

```
ChartSessionProvider
  chartHistory[] → chartHistorySections { aiSorted, autoSorted }
  activeChartId → activeSnapshot → chartData, visualization
       ↓
page.tsx memos: sessionRenderedChartKind, chartAxisLabels, sessionChartReason, sessionSmartChartIntel
       ↓
UI: timeline select → ChartsTabPlotTransition(chartId) → renderDatasetChart
```

---

## 7. Export / capture hooks (UI)

| Action | UI trigger | Capture ref |
|--------|------------|-------------|
| Download PNG | Header button | `chartCaptureSessionRef` |
| Export PDF (session) | Export tab | Same session ref, `insightMode=false` |

Off-screen capture DOM mirrors preview styling for WYSIWYG PNG/PDF charts.

---

## 8. Stable cross-tab UI rules

1. **Extend in place** — token modules + narrow CSS, not layout rewrites  
2. **Preserve tab-specific shells** — Overview mini charts ≠ session preview  
3. **Keep filter bar height** aligned across Overview and Insights  
4. **Charts tight vertical rhythm** — see [`CHARTS_TAB_STABLE_SUMMARY.md`](CHARTS_TAB_STABLE_SUMMARY.md) §4  
5. **Dark mode** — chart plot tokens via `chart-viz-theme`, not ad-hoc slate overrides on Recharts  

---

## 9. File map (UI-focused)

| Path | UI role |
|------|---------|
| `frontend/lib/charts-tab-ui.ts` | Charts tokens |
| `frontend/lib/ai-insights-ui.ts` | Insights + shared viz |
| `frontend/lib/overview-ui.ts` | Overview dashboard |
| `frontend/app/globals.css` | Theme, Charts motion/scroll |
| `frontend/app/page.tsx` | Tab composition |
| `frontend/app/components/home/*.tsx` | Charts tab subcomponents |

---

*Last updated: May 2026 — recovery baseline for UI work including Export/PDF.*
