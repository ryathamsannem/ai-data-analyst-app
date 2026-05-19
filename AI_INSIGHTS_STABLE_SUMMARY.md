# AI Insights — Stable Baseline Summary

Reference for the **restored stable codebase**. Documents the current AI Insights implementation as observed in the tree. **No behavior, UI, CSS, or component changes** are implied by this file.

**Product baseline:** [`AGENTS.md`](AGENTS.md) · [`PROJECT_ARCHITECTURE_SUMMARY.md`](PROJECT_ARCHITECTURE_SUMMARY.md)

---

## 1. AI Insights — current layout

### Navigation and shell

| Piece | Detail |
|-------|--------|
| Tab id | `insights` (`MainNavTabId` in `frontend/app/components/home/main-nav-tabs.tsx`) |
| Label | "AI Insights" |
| Routing | **None** — single home page `frontend/app/page.tsx`; `activeTab` state switches views |
| App chrome | `AppShell` + sidebar (`frontend/components/app-shell/`) |
| Filters | `FilterPanel` when `activeTab === "overview" \|\| activeTab === "insights"` and columns exist; `appearance="legacy"` on Insights vs `"dashboard"` on Overview |

### Desktop page structure

```
AppShell
└─ page.tsx
   ├─ FilterPanel (shared Overview + Insights)
   ├─ Off-screen capture: chartCaptureInsightRef (fixed left:-10000px, w-[860px])
   └─ activeTab === "insights"  (~lines 10370–11180)
      └─ <section> outer Insights shell
         └─ grid lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]  (30% / 70%)
            ├─ Left card: Suggested Questions + Recent (last 3)
            └─ Right card: Ask AI column (vertical stack)
```

**Outer shell** (`page.tsx` ~10371): gradient card, `rounded-[1.25rem]`, theme borders/shadows (`--surface-*`, `--border-default`, `--shadow-card`), `p-4 sm:p-5`.

**Left panel** (~10373): `rounded-2xl`, `lg:max-h-[calc(100vh-12rem)]`, `lg:overflow-y-auto`, `lg:overscroll-contain`.

**Right panel** (~10415): same card chrome; scrolls with content (no max-height on panel).

**Grid:** `lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]`, `gap-3` / `xl:gap-5`.

### Right column — render order (top → bottom)

| # | Block | Gate |
|---|--------|------|
| 1 | Ask AI title + **Reset conversation** (`btnSecondary`) | Always |
| 2 | Follow-up badges (emerald / violet pills) | `lastConversationMeta?.followUpDetected` |
| 3 | Question textarea + **Ask AI** (`btnPrimary`) + loading copy | Always |
| 4 | Alignment repaired warning (amber) | `alignedAnalysis?.alignmentRepaired` |
| 5 | Visualization caution (short) | `insightVisualization?.partialVisualizationWarning` |
| 6 | “This chart is selected…” prompt | Pinned snapshot, no valid answer |
| 7 | **AiExecutiveInsightsPanel** | `hasValidAIAnswer` + viz + executive cards |
| 8 | **Insight confidence** card | `hasValidAIAnswer` + `alignedAnalysis` |
| 9 | **AI Answer** + `<details>` sections | `hasValidAIAnswer` \|\| `loading` \|\| `answer.trim()` |
| 10 | **Suggested follow-ups** (chip buttons → `askAI`) | `hasValidAIAnswer` + chips |
| 11 | **How this insight was generated** (`<details>`) | Provenance / routing / context |
| 12 | **Visualization** card + chart | `insightChartData.length > 0` |
| 13 | No-viz placeholder | Valid answer, `source === "ai"`, empty chart |
| 14 | **Export this insight (PDF)** + export debug `<details>` | Button always; `canExportInsight` enables |

### Visualization card — chart stack

```
Visualization card (Tailwind group/chart)
├─ "Visualization" kicker (uppercase, --text-subtle)
├─ insightChartHeadingBlock (title/subtitle)
├─ ChartContextSummary (inline memo in page.tsx)
└─ AiInsightChartShell (max-w-[960px], minOuterHeight from insightLayoutMetrics)
   └─ ChartInsightViewportWrapper (min-h-[420px], centered, max-w by kind)
      └─ plot div (animate-chart-surface-in, height: insightShellPlotHeight)
         └─ ChartRenderer (insightMode: true, insightCartesianPlanMain)
└─ SmartChartInsightPanel? (if insightSmartChartIntel?.active)
```

### Off-screen DOM (PDF capture — not visible on tab)

| Ref | Location | Role |
|-----|----------|------|
| `chartCaptureInsightRef` | `page.tsx` ~9314–9332 | Fixed `left: -10000px`, `w-[860px]`; mirrors insight heading + `AiInsightChartShell` + `renderDatasetChart(..., insightMode: true)` |

Capture uses the **same** shell, plot height, and `insightMode` path as the on-screen Visualization card.

### Cross-tab entry points

| From | Mechanism |
|------|-----------|
| Overview Auto Dashboard | `askAiAboutDashboardChart` → `setActiveTab("insights")` + `pendingInsightAutoAskRef` |
| Overview | `openDashboardChartInChartsTab` → Charts tab (not Insights) |
| Charts timeline | `selectChart` / `selectChartWithInsightState` → pins `insightChartId` |
| Data Preview | Suggested questions → `setActiveTab("insights")` + prefill (~10036) |

### Chart kinds on Insights

All `ChartKind` values from `frontend/app/chart-types.ts` can appear via API + presentation pipeline:

`bar` · `line` · `area` · `bar_horizontal` · `pie` · `donut` · `scatter` · `histogram` · `""`

Resolution: frozen `VisualizationContract` → `resolvePresentationKindFromContract` → snapshot fields → `computeFinalChartPresentation` (shared with Charts/PDF, **not** Overview mini-chart rules).

**Product rule:** horizontal bars stay horizontal; trend mode respected (`isTrendMode`, `chart-time-x-axis.ts`).

---

## 2. Exact files, classes, and components

### Component hierarchy

```
page.tsx (Home)
├── ChartSessionProvider (frontend/contexts/chart-session-context.tsx)
│   └── AppShell
│       ├── FilterPanel
│       ├── chartCaptureInsightRef (hidden)
│       │   └── AiInsightChartShell → ChartInsightViewportWrapper → ChartRenderer(insightMode)
│       └── activeTab === "insights"
│           └── <section> outer shell
│               └── grid 30/70
│                   ├── Left: suggested + recent questions
│                   └── Right: Ask AI panel
│                       ├── AiExecutiveInsightsPanel?
│                       ├── confidence card
│                       ├── AI Answer + <details>
│                       ├── follow-up chips
│                       ├── how calculated accordion
│                       ├── Visualization card (group/chart)
│                       │   ├── ChartContextSummary
│                       │   ├── AiInsightChartShell
│                       │   │   └── ChartInsightViewportWrapper
│                       │   │       └── ChartRenderer
│                       │   └── SmartChartInsightPanel?
│                       └── Export insight PDF
```

### Exported components and symbols

| Symbol | File | Notes |
|--------|------|-------|
| `AiInsightChartShell` | `frontend/app/components/ai-insight-chart-shell.tsx` | `max-w-[960px]`, `minOuterHeight` |
| `ChartInsightViewportWrapper` | `frontend/app/components/home/chart-insight-viewport-wrapper.tsx` | Insights + PDF capture only |
| `ChartRenderer` | `frontend/app/components/home/chart-renderer.tsx` | `insightMode?: boolean` |
| `AiExecutiveInsightsPanel` | `frontend/app/components/ai-executive-insights-panel.tsx` | `memo`; type `AiExecutiveInsightFact` |
| `SmartChartInsightPanel` | `frontend/app/components/SmartChartInsightPanel.tsx` | Under viz when intel active |
| `MainNavTabs`, `MAIN_NAV_TABS`, `MainNavTabId` | `frontend/app/components/home/main-nav-tabs.tsx` | Tab id `insights` |
| `FilterPanel` | `frontend/app/components/home/filter-panel.tsx` | Shared Overview + Insights |
| `useChartSession` | `frontend/contexts/chart-session-context.tsx` | `insightSnapshot`, `insightChartId`, `pushAIChart`, `clearAiInsightSession` |
| `ChartContextSummary` | **`page.tsx` only** (~542) | Inline `memo`; not exported |
| `renderDatasetChart` | `page.tsx` | Bridge to `ChartRenderer`; 3rd arg `insightMode` |

### Inline helpers in `page.tsx` (Insights-critical)

| Symbol | Purpose |
|--------|---------|
| `askAI` | POST `/ask`, session push, bundle save, pinned chart preservation |
| `resetAiConversation` | Clears answer, chips, insight chart, thread; keeps file/filters/history |
| `hasValidAIAnswer` | Gates executive, confidence, answer, chips, export |
| `insightPresentationChartKind` | Resolved chart kind for insight snapshot |
| `insightShellPlotHeight` | Plot height heuristics (~8168–8201) |
| `insightCartesianPlanMain` | Category plan with `insightMode: true` |
| `insightLayoutMetrics` | From `getInsightLayoutMetrics` |
| `chartCaptureInsightRef` | PDF DOM capture |
| `canExportInsight` / `exportEnabledReason` | Export guards |
| `provenanceConfidenceBadgeClass` | Badge styling (~2058) |
| `insightEngineConfidenceBadgeClass` | Badge styling (~2069) |

### File inventory

#### Primary UI

| File | Role |
|------|------|
| [`frontend/app/page.tsx`](frontend/app/page.tsx) | Hub: Insights block ~10370–11180, ask flow, capture, export |
| [`frontend/app/components/ai-executive-insights-panel.tsx`](frontend/app/components/ai-executive-insights-panel.tsx) | Executive fact grid + narrative brief |
| [`frontend/app/components/ai-insight-chart-shell.tsx`](frontend/app/components/ai-insight-chart-shell.tsx) | Insight-only chart shell |
| [`frontend/app/components/home/chart-insight-viewport-wrapper.tsx`](frontend/app/components/home/chart-insight-viewport-wrapper.tsx) | Centered viewport; shared with capture |
| [`frontend/app/components/home/chart-renderer.tsx`](frontend/app/components/home/chart-renderer.tsx) | Recharts; `insightMode` branch |
| [`frontend/app/components/SmartChartInsightPanel.tsx`](frontend/app/components/SmartChartInsightPanel.tsx) | Optional “AI read on this chart” |
| [`frontend/app/components/home/filter-panel.tsx`](frontend/app/components/home/filter-panel.tsx) | Global filters |
| [`frontend/components/app-shell/`](frontend/components/app-shell/) | Sidebar, header, workspace |

#### Session, presentation, intelligence

| File | Role |
|------|------|
| [`frontend/contexts/chart-session-context.tsx`](frontend/contexts/chart-session-context.tsx) | Snapshots, `insightChartId`, dedupe |
| [`frontend/lib/final-chart-presentation.ts`](frontend/lib/final-chart-presentation.ts) | `computeFinalChartPresentation` |
| [`frontend/lib/selected-visualization.ts`](frontend/lib/selected-visualization.ts) | `freezeVisualizationContract`, `isTrendMode` |
| [`frontend/lib/chart-layout-config.ts`](frontend/lib/chart-layout-config.ts) | `getInsightLayoutMetrics`, `insightViewportMaxClassForChartKind`, `insightCartesianOuterMargins` |
| [`frontend/lib/chart-axis-layout.ts`](frontend/lib/chart-axis-layout.ts) | Plans; `insightMode` in render helper |
| [`frontend/lib/chart-time-x-axis.ts`](frontend/lib/chart-time-x-axis.ts) | Trend ticks/sort |
| [`frontend/lib/insight-aligned-axis-merge.ts`](frontend/lib/insight-aligned-axis-merge.ts) | Axis merge when alignment repaired |
| [`frontend/lib/insight-confidence.ts`](frontend/lib/insight-confidence.ts) | Confidence scoring |
| [`frontend/lib/insight-narrative-tone.ts`](frontend/lib/insight-narrative-tone.ts) | Cautious tone / disclaimers |
| [`frontend/lib/chart-insight-answers.ts`](frontend/lib/chart-insight-answers.ts) | Per-chart answer bundles |
| [`frontend/lib/smart-chart-intelligence.ts`](frontend/lib/smart-chart-intelligence.ts) | Smart chart intel panel |
| [`frontend/lib/ux-narrative.ts`](frontend/lib/ux-narrative.ts) | `AI_INSIGHT_SECTION_LABELS`, copy |
| [`frontend/app/chart-types.ts`](frontend/app/chart-types.ts) | `ChartKind`, `ChartRow` |
| [`frontend/app/pdf-report.ts`](frontend/app/pdf-report.ts) | PDF; `chartScope: "insight"` |

#### Styling tokens (shared app-wide)

| File | Role |
|------|------|
| [`frontend/app/globals.css`](frontend/app/globals.css) | Theme variables, `.saas-btn-premium`, `.animate-chart-surface-in` |
| [`frontend/lib/ui-buttons.ts`](frontend/lib/ui-buttons.ts) | `btnPrimary`, `btnSecondary`, `btnExportSm` |
| [`frontend/lib/theme.ts`](frontend/lib/theme.ts) | Light/dark persistence |

#### Planned but unwired (stable tree)

| File | Role |
|------|------|
| [`frontend/lib/ai-insights-ui.ts`](frontend/lib/ai-insights-ui.ts) | BEM-style class name constants — **not imported** anywhere; **no** `.ai-insights-*` rules in `globals.css` |

#### Backend (behavior — out of scope for UI-only work)

| Endpoint | Role |
|----------|------|
| `POST /ask` | Question → visualization + narrative + `analysis` |
| `POST /filtered-dashboard` | Filtered cohort for ask context |

**No dedicated Insights route, page folder, or CSS module** — Insights UI is inline Tailwind in `page.tsx` plus shared components above.

### Class names and styling hooks in use

#### Tailwind / structural (active in JSX)

| Hook | Where | Purpose |
|------|-------|---------|
| `group/chart` | Visualization card ~11076 | Hover gradient on plot surface |
| `group-hover/chart:from-slate-50/55` | Plot div ~11102 | Chart surface hover |
| `animate-chart-surface-in` | Plot divs (Insights + Charts) | Reveal animation |
| `motion-reduce:animate-none` | Plot divs | A11y |
| `[&_.recharts-responsive-container]:mx-auto` | `ChartInsightViewportWrapper` | Center Recharts |
| `lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]` | Insights grid | 30/70 layout |

#### CSS variables (Insights shell uses heavily)

`--surface-elevated` · `--surface-subtle` · `--surface-accent-wash` · `--border-default` · `--foreground` · `--text-muted` · `--text-subtle` · `--shadow-card` · `--shadow-sm` · `--shadow-md` · `--accent` · `--btn-primary-*`

#### Planned BEM tokens (`ai-insights-ui.ts`) — not on DOM today

```
ai-insights-page
ai-insights-grid
ai-insights-side-panel
ai-insights-ask-panel
ai-insights-section (+ --answer, --viz, --confidence, --confidence-caution, --followup)
ai-insights-executive (+ __brief, __card)
ai-insights-section__title | __kicker | __desc
ai-insights-followup-chip
ai-insights-btn-export
ai-insights-suggested-q
ai-insights-chart-plot
```

#### `data-*` attributes

Insights UI uses **almost no** `data-*` hooks. Data Preview on the same page uses `data-preview-*`; Insights does not.

---

## 3. What must NOT be changed

Unless the user explicitly requests it:

| Area | Why |
|------|-----|
| **`askAI`** | `preservePinnedChart`, `aiAnswerByChartId` bundles, narrative sanitization, `/ask` payload (`dashboard_filters`, `date_range`, `conversation_context`) |
| **`hydrateVisualizationFromApi` / API parsing** | Chart rows, provenance, stacked series |
| **`ChartSessionProvider` snapshot shape** | `pushAIChart`, `selectChart`, `insightChartId`, dedupe keys |
| **`computeFinalChartPresentation`** | Shared with Charts tab and PDF |
| **`ChartRenderer` chart-type semantics** | Do not force horizontal → vertical or change trend rules for Insights only |
| **`insightShellPlotHeight` / `getInsightLayoutMetrics`** | Readability + PDF framing |
| **`insightCartesianPlanMain` inputs** | `viewportWidthPx`, `chartHeight`, `insightMode: true` |
| **`ChartRenderer` `insightMode` + `insightCartesianOuterMargins`** | On-screen + capture margins |
| **`chartCaptureInsightRef` DOM structure** | Must match on-screen insight shell for PDF |
| **PDF pipeline** | `downloadReport`, `pdf-report.ts`, `chartScope: "insight"` |
| **Section render order and gates** | `hasValidAIAnswer`, executive/confidence gating |
| **Navigation / tab ids** | `insights`, `pendingInsightAutoAskRef`, Overview drill helpers |
| **Overview Auto Dashboard chart path** | Separate presentation (`computeOverviewDashboardChartPresentation`) |
| **Filter application on ask** | Filter state passed into `askAI` |

---

## 4. Safe scoped selectors for styling

Use these for **visual-only** polish without touching logic, gates, or chart math.

### A. Future dedicated layer (recommended path)

Wire [`frontend/lib/ai-insights-ui.ts`](frontend/lib/ai-insights-ui.ts) into JSX incrementally, then add matching rules in `globals.css`:

```css
/* Example — scope all rules under page root */
.ai-insights-page .ai-insights-section--answer { ... }
.ai-insights-page .ai-insights-followup-chip { ... }
```

**Safe tokens to adopt first:** `ai-insights-page`, `ai-insights-side-panel`, `ai-insights-ask-panel`, `ai-insights-section--*`, `ai-insights-followup-chip`, `ai-insights-suggested-q`, `ai-insights-btn-export` (Insights-only export variant without changing global `btnExportSm`).

### B. Component-scoped files (edit in isolation)

| Target | File | Safe to change |
|--------|------|----------------|
| Executive cards / brief | `ai-executive-insights-panel.tsx` | Borders, gradients, typography, dark mode (`slate-*` → tokens) |
| Smart chart panel | `SmartChartInsightPanel.tsx` | Card chrome only (panel is Insights-adjacent) |
| Insight shell max-width box | `ai-insight-chart-shell.tsx` | **Avoid** changing `max-w-[960px]` or `minOuterHeight` prop contract without PDF check |

### C. Inline regions in `page.tsx` (visual only)

| Region | Approx. lines | Safe changes |
|--------|---------------|--------------|
| Outer Insights `<section>` | ~10371 | Gradient, border, shadow, padding |
| Left suggested-questions card | ~10373–10413 | Button hover, typography, `slate-*` → CSS variables |
| Right Ask AI panel chrome | ~10415–10428 | Surface, header spacing |
| Follow-up badges | ~10430–10448 | Pill colors (keep copy/handlers) |
| Confidence card | ~10520–10576 | Background, caution vs normal variant styling |
| AI Answer + `<details>` | ~10579–10659 | Card elevation; replace `bg-white` with tokens |
| Follow-up chips | ~10662–10682 | Hover, focus ring |
| “How calculated” accordion | ~10685–11073 | Borders, dark surfaces |
| Visualization **card chrome** (not plot) | ~11076–11095 | Padding around header/summary |
| Export button wrapper | ~11134–11176 | Add Insights-only class alongside `btnExportSm` |

### D. CSS variables (global but safe for Insights if used consistently)

Tune in `globals.css` `:root` / `.dark` — affects whole app but improves Insights when replacing hardcoded `slate-*`:

`--surface-elevated` · `--surface-subtle` · `--text-muted` · `--border-default` · `--shadow-card`

### E. Do NOT treat as “safe” without PDF + chart regression

- `ChartInsightViewportWrapper` — `min-h-[420px]`, `py-4 sm:py-5`
- `insightViewportMaxClassForChartKind` — `max-w-[900px]` / `[850px]` / `[760px]`
- `insightShellPlotHeight` heuristics
- Plot `style={{ height: insightShellPlotHeight }}`
- `animate-chart-surface-in` timing (shared with Charts tab)
- `chartCaptureInsightRef` dimensions (`w-[860px]`, padding)

---

## 5. Risky shared / global classes

Changing these can break **Charts**, **Export**, **Overview**, or **PDF capture** — not only Insights.

### Global CSS classes (`frontend/app/globals.css`)

| Class | Used on Insights | Also affects |
|-------|------------------|--------------|
| `.saas-btn-premium` | Via `btnSecondary` (Reset) | Overview (`overview-ui.ts`), many secondary actions |
| `.saas-btn-accent` | Via `btnPrimarySm` (elsewhere on page) | Primary small actions app-wide |
| `.animate-chart-surface-in` | Insight + Charts plot surfaces | Charts tab session chart |
| `:root` / `.dark` CSS variables | All Insights theme-aware surfaces | Entire dashboard |

### Shared button tokens (`frontend/lib/ui-buttons.ts`)

| Token | Insights usage | Risk |
|-------|----------------|------|
| `btnPrimary` | Ask AI button ~10471 | Other tabs / upload flows on same page |
| `btnSecondary` | Reset conversation ~10423 | Export tab, filter actions |
| `btnExportSm` | Export this insight ~11149 | **Export tab** full-report buttons |

**Mitigation:** For Insights-only export styling, add `ai-insights-btn-export` (or similar) **in addition to** `btnExportSm`, not by editing `btnExportSm` globally.

### Shared chart pipeline

| Module | Risk if changed |
|--------|-----------------|
| `chart-renderer.tsx` (`insightMode`) | Insights on-screen + off-screen capture |
| `chart-layout-config.ts` (`insightCartesianOuterMargins`, `getInsightLayoutMetrics`) | Axis overlap, centering, PDF clip |
| `chart-axis-layout.ts` (`insightMode` plans) | Category tick angles, horizontal bar layout |
| `final-chart-presentation.ts` | Charts tab + PDF kind resolution |
| `ChartInsightViewportWrapper` | **Insights + `chartCaptureInsightRef`** |

### Tailwind groups and Recharts hooks

| Selector | Risk |
|----------|------|
| `group/chart` + `group-hover/chart:*` | Visualization card hover only — low cross-tab risk |
| `[&_.recharts-responsive-container]:*` in viewport wrapper | All insight/capture renders |

### Overview-specific (do not conflate)

| Class source | Note |
|--------------|------|
| `overview-ui.ts` (`ov*`, `ovCard`, `ovMuted`) | Overview only — not used in Insights block |
| `computeOverviewDashboardChartPresentation` | Must not replace Insights presentation path |

### Hardcoded palette in Insights block

Many `slate-*`, `indigo-*`, `emerald-*`, `amber-*`, `violet-*` utilities in `page.tsx` ~10370–11180 are **Insights-local** but inconsistent in dark mode — safe to replace with variables **within the Insights block** without touching other tabs.

---

## 6. Regression checklist

Run after **any** AI Insights change (UI or chart layout). Use a dataset with categories, a metric, and a date column.

### Setup

- [ ] Dataset uploaded; column mapping saved
- [ ] Light mode and dark mode
- [ ] Browser zoom **75%, 100%, 125%**

### Ask flow

- [ ] Suggested question prefills textarea (does not auto-send unless designed)
- [ ] **Ask AI** returns narrative + chart (or explicit no-viz message)
- [ ] Loading: “Thinking…”, “Generating answer…”, “Generating visualization…”
- [ ] Empty question shows error
- [ ] **Reset conversation** clears answer, chips, insight chart, thread badges; **keeps** file, filters, dashboard, non-AI chart history

### Gating and content

- [ ] Executive insights **hidden** until valid answer + chart facts exist
- [ ] Confidence card shows level + score; caution styling on small sample / cautious tone
- [ ] AI Answer summary + expandable sections when present
- [ ] Follow-up chips call `askAI`; disabled while loading
- [ ] “How this insight was generated” expands; provenance readable

### Chart and visualization

- [ ] Chart renders (no Recharts `width(-1)` / `height(-1)` in console)
- [ ] Horizontal bar stays horizontal; trend charts readable
- [ ] `ChartContextSummary` chips and title/subtitle present
- [ ] `SmartChartInsightPanel` only when `insightSmartChartIntel?.active`
- [ ] Chart centered in card; no axis label overlap at 100% zoom

### Session and navigation

- [ ] New ask updates timeline (`chartHistory`)
- [ ] Timeline chart switch restores pinned insight + stored answer when available
- [ ] Overview → **Ask AI** on dashboard chart: tab switch + prefill/auto-ask
- [ ] Overview → **Charts** opens correct snapshot
- [ ] Filter change + re-ask respects filters in provenance

### Follow-up / pinned chart

- [ ] Follow-up badges when `followUpDetected`
- [ ] Pinned chart follow-up preserves contract (`preservePinnedChart`)
- [ ] Narrative aligned with pinned trend contract when applicable

### Export

- [ ] **Export this insight (PDF)** enabled only when `canExportInsight`
- [ ] Disabled helper text matches `exportEnabledReason`
- [ ] PDF chart image centered, not clipped
- [ ] PDF narrative matches answer content

### Non-regression (other tabs)

- [ ] **Overview** Auto Dashboard charts unchanged
- [ ] **Charts** tab session chart unchanged
- [ ] **Export** tab full report unchanged
- [ ] **Data Preview** unchanged

---

## Quick reference — `page.tsx` search strings

| Search | Purpose |
|--------|---------|
| `activeTab === "insights"` | Tab root (~10370) |
| `const askAI` | Ask handler |
| `hasValidAIAnswer` | Content gates |
| `insightShellPlotHeight` | Plot sizing (~8168) |
| `renderDatasetChart` | ChartRenderer bridge |
| `chartCaptureInsightRef` | PDF capture (~9314) |
| `canExportInsight` | Export guard |
| `AiExecutiveInsightsPanel` | Executive block |
| `pendingInsightAutoAskRef` | Overview → Insights auto-ask |

---

## Appendix — stable strengths (no change needed)

- End-to-end ask → narrative + chart + session snapshot
- Pinned chart / follow-up context and badges
- Executive insights gated on valid answer + visualization
- Shared `ChartRenderer` + `computeFinalChartPresentation` with Charts/PDF
- `insightShellPlotHeight` + `getInsightLayoutMetrics` by chart kind
- Export insight scope with off-screen capture aligned to on-screen shell
- 30/70 layout with independent left-column scroll on large viewports

---

*Last updated: stable tree analysis — Insights inline in `page.tsx` (~10370–11180); `ai-insights-ui.ts` present but unwired; no Insights CSS module.*
