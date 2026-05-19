# AI Insights — Stable Baseline Summary

Reference for work **after** `git reset --hard` to the last stable version. Documents the **current** AI Insights implementation as observed in the restored tree. **No behavior changes** are implied by this file.

**Product baseline:** see [`AGENTS.md`](AGENTS.md) and [`PROJECT_ARCHITECTURE_SUMMARY.md`](PROJECT_ARCHITECTURE_SUMMARY.md).

---

## 1. Current AI Insights tab structure

### Shell and navigation

| Piece | Behavior |
|-------|----------|
| Tab id | `insights` (`MainNavTabId` in `frontend/app/components/home/main-nav-tabs.tsx`) |
| Tab state | In-memory in `frontend/app/page.tsx` (`activeTab`) — no URL route per tab |
| App shell | `AppShell` + sidebar (`frontend/components/app-shell/`) |
| Filters | `FilterPanel` shown when `activeTab === "overview" \|\| activeTab === "insights"` and dataset loaded (`appearance`: `"legacy"` on Insights vs `"dashboard"` on Overview) |

### Page layout (desktop)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  FilterPanel (shared with Overview)                                      │
├─────────────────────────────────────────────────────────────────────────┤
│  <section> AI Insights outer shell (gradient card, ~10370 in page.tsx)   │
│  ┌──────────────────────┬──────────────────────────────────────────────┐ │
│  │ 30% — Suggested Qs   │ 70% — Ask AI column                          │ │
│  │ • Suggested buttons  │ • Reset conversation                         │ │
│  │ • Recent questions   │ • Follow-up context badges (optional)        │ │
│  │   (last 3)           │ • Question textarea + Ask AI                 │ │
│  │                      │ • Status / warnings                          │ │
│  │                      │ • Executive insights (gated)                 │ │
│  │                      │ • Confidence card (gated)                    │ │
│  │                      │ • AI Answer (gated)                          │ │
│  │                      │ • Suggested follow-up chips (gated)          │ │
│  │                      │ • “How this insight was generated” (details) │ │
│  │                      │ • Visualization card + chart                 │ │
│  │                      │ • Export this insight (PDF) + debug details  │ │
│  └──────────────────────┴──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

Grid: `lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]` with `gap-3` / `xl:gap-5`.

### Right column — render order (top → bottom)

Sections appear **in this order** inside the Ask AI panel. Conditional gates matter for polish and regression.

| # | Block | Typical gate |
|---|--------|----------------|
| 1 | Ask AI title + **Reset conversation** | Always |
| 2 | Follow-up badges (“Using previous insight context”, etc.) | `lastConversationMeta?.followUpDetected` |
| 3 | Question textarea + **Ask AI** button + loading copy | Always |
| 4 | Alignment repaired warning | `alignedAnalysis?.alignmentRepaired` |
| 5 | Visualization caution (short) | `insightVisualization?.partialVisualizationWarning` |
| 6 | “This chart is selected…” prompt | Pinned snapshot, no valid answer yet |
| 7 | **Executive insights** (`AiExecutiveInsightsPanel`) | `hasValidAIAnswer` + visualization + executive cards |
| 8 | **Insight confidence** card | `hasValidAIAnswer` + `alignedAnalysis` |
| 9 | **AI Answer** (summary + `<details>` sections) | `hasValidAIAnswer` \|\| loading \|\| draft answer |
| 10 | **Suggested follow-ups** (chip buttons → `askAI(chip)`) | `hasValidAIAnswer` + chips |
| 11 | **How this insight was generated** (collapsible) | Provenance / routing / context / follow-up |
| 12 | **Visualization** (title, heading, `ChartContextSummary`, chart) | `insightChartData.length > 0` |
| 13 | No visualization placeholder | Valid AI answer, `source === "ai"`, empty chart |
| 14 | **Export this insight (PDF)** + export debug `<details>` | Export button always; enabled via `canExportInsight` |

### Chart rendering path (Insights only)

1. API `/ask` → `hydrateVisualizationFromApi` → session via `ChartSessionProvider` (`pushAIChart`, `selectChart`, etc.).
2. Presentation: `insightPresentationChartKind` from contract / `computeFinalChartPresentation` (shared with Charts/PDF — **not** Overview mini-chart rules).
3. Plot height: `insightShellPlotHeight` from `getInsightLayoutMetrics` + row-count heuristics (`page.tsx` ~8163–8201).
4. Render: `renderDatasetChart(..., insightMode: true)` → **`ChartRenderer`** with `insightMode: true`, `insightCartesianPlanMain`.
5. Layout shell: **`AiInsightChartShell`** → **`ChartInsightViewportWrapper`** (centered, max-width by chart kind).

### Off-screen DOM (PDF / capture — not visible on tab)

| Ref | Role |
|-----|------|
| `chartCaptureInsightRef` | Fixed `left: -10000px`, `w-[860px]`, mirrors insight chart + heading for export capture |
| `chartCaptureSessionRef` | Session chart capture (Charts scope — separate from insight) |

Insight capture uses the **same** `AiInsightChartShell` + `insightShellPlotHeight` as the on-screen Visualization card.

### Cross-tab entry points

| From | Mechanism |
|------|-----------|
| Overview Auto Dashboard | **Charts** / **Ask AI** → `openDashboardChartInChartsTab`, `askAiAboutDashboardChart` + `pendingInsightAutoAskRef` |
| Charts timeline | Select snapshot → pins insight chart via `selectChartWithInsightState` |
| Data Preview | Suggested questions strip → `setActiveTab("insights")` + prefill |

---

## 2. Important files involved

### Primary UI (stable: inline Tailwind in `page.tsx`)

| File | Role |
|------|------|
| [`frontend/app/page.tsx`](frontend/app/page.tsx) | **Hub:** `activeTab === "insights"` block (~10370–11180), `askAI`, insight state, `renderDatasetChart`, capture refs, export button |
| [`frontend/app/components/ai-executive-insights-panel.tsx`](frontend/app/components/ai-executive-insights-panel.tsx) | Executive insight fact grid + optional narrative brief |
| [`frontend/app/components/ai-insight-chart-shell.tsx`](frontend/app/components/ai-insight-chart-shell.tsx) | Max-width shell + min outer height for insight charts |
| [`frontend/app/components/home/chart-insight-viewport-wrapper.tsx`](frontend/app/components/home/chart-insight-viewport-wrapper.tsx) | Centers plot; `min-h-[420px]`, vertical padding — **also used by PDF capture** |
| [`frontend/app/components/home/chart-renderer.tsx`](frontend/app/components/home/chart-renderer.tsx) | Shared Recharts renderer; `insightMode` branch for AI Insights + capture |
| [`frontend/app/components/SmartChartInsightPanel.tsx`](frontend/app/components/SmartChartInsightPanel.tsx) | Optional panel under chart when `insightSmartChartIntel?.active` |
| [`frontend/components/app-shell/`](frontend/components/app-shell/) | Sidebar, header, workspace scroll |
| [`frontend/app/components/home/filter-panel.tsx`](frontend/app/components/home/filter-panel.tsx) | Global filters on Overview + Insights |

### Session, API, and intelligence

| File | Role |
|------|------|
| [`frontend/contexts/chart-session-context.tsx`](frontend/contexts/chart-session-context.tsx) | `ChartSnapshot`, `pushAIChart`, `insightChartId`, `dashboardChartKey`, dedupe keys |
| [`frontend/lib/final-chart-presentation.ts`](frontend/lib/final-chart-presentation.ts) | `computeFinalChartPresentation` — chart kind for AI / Charts / PDF |
| [`frontend/lib/selected-visualization.ts`](frontend/lib/selected-visualization.ts) | `freezeVisualizationContract`, `isTrendMode` |
| [`frontend/lib/chart-layout-config.ts`](frontend/lib/chart-layout-config.ts) | `getInsightLayoutMetrics`, `insightViewportMaxClassForChartKind`, `insightCartesianOuterMargins` |
| [`frontend/lib/chart-axis-layout.ts`](frontend/lib/chart-axis-layout.ts) | Category plans, margins (`computeCartesianCategoryPlanForRender` with `insightMode: true`) |
| [`frontend/lib/chart-time-x-axis.ts`](frontend/lib/chart-time-x-axis.ts) | Trend ticks, chronological sort |
| [`frontend/lib/insight-confidence.ts`](frontend/lib/insight-confidence.ts) | Unified confidence scoring (UI consumes in `page.tsx`) |
| [`frontend/lib/insight-narrative-tone.ts`](frontend/lib/insight-narrative-tone.ts) | Cautious tone / disclaimer copy |
| [`frontend/lib/chart-insight-answers.ts`](frontend/lib/chart-insight-answers.ts) | Per-chart answer bundle restore (`aiAnswerByChartId`) |
| [`frontend/app/pdf-report.ts`](frontend/app/pdf-report.ts) | Executive PDF; insight scope uses captured DOM + narrative sections |

### Styling tokens (shared)

| File | Role |
|------|------|
| [`frontend/app/globals.css`](frontend/app/globals.css) | Theme variables (`:root` / `.dark`), SaaS buttons, chart axis tokens |
| [`frontend/lib/ui-buttons.ts`](frontend/lib/ui-buttons.ts) | `btnPrimary`, `btnSecondary`, `btnExportSm` (Insights export button) |
| [`frontend/lib/theme.ts`](frontend/lib/theme.ts) | Light/dark persistence |

### Optional / unused in stable UI

| File | Note |
|------|------|
| [`frontend/lib/ai-insights-ui.ts`](frontend/lib/ai-insights-ui.ts) | Class tokens + comments for a **dedicated** Insights CSS layer — **not imported** by `page.tsx` in the stable tree; **no** matching `.ai-insights-*` rules in `globals.css` after reset. Safe to wire in a future polish pass or remove if unused. |

### Backend (do not change for UI-only work)

| Endpoint | Role |
|----------|------|
| `POST /ask` | Question → visualization + narrative + `analysis` |
| `POST /filtered-dashboard` | Filtered cohort (feeds filter context on ask) |

---

## 3. What is working well now (stable)

- **End-to-end ask flow:** Upload → filter → ask → narrative + chart + session snapshot; loading and error surfaces behave predictably.
- **Pinned chart / follow-up context:** `preservePinnedChart`, `lineageParentChartId`, conversation payload, and follow-up badges keep thread continuity without breaking chart contracts.
- **Executive insights gating:** Facts and brief only show when `hasValidAIAnswer` and visualization data exist — avoids empty executive blocks.
- **Shared chart intelligence:** AI Insights uses the same `ChartRenderer` + `computeFinalChartPresentation` path as Charts tab and PDF capture (horizontal bars stay horizontal, trend mode respected).
- **Insight layout metrics:** `getInsightLayoutMetrics` + `insightShellPlotHeight` adapt plot height by chart kind and point count.
- **Export insight scope:** `downloadReport({ chartScope: "insight", ... })` with `canExportInsight` guards and off-screen `chartCaptureInsightRef` aligned to on-screen shell.
- **Overview integration:** Drill from dashboard charts into Insights with prefill / auto-ask refs works without URL routing changes.
- **Performance patterns:** Heavy memoization on insight-derived data (`insightCartesianPlanMain`, executive cards, parsed answer); `AiExecutiveInsightsPanel` is `memo`’d.
- **30/70 layout:** Suggested questions column scrolls independently on large viewports (`lg:max-h`, `overflow-y-auto`).

---

## 4. What should NOT be changed (unless explicitly requested)

| Area | Why |
|------|-----|
| **`askAI` implementation** | `preservePinnedChart`, bundle save to `aiAnswerByChartId`, narrative sanitization for pinned contracts, `/ask` payload shape |
| **`hydrateVisualizationFromApi` / API parsing** | Breaks chart data, provenance, stacked series |
| **`ChartSessionProvider` snapshot shape** | `pushAIChart`, `selectChart`, `insightChartId`, `dashboardChartKey`, dedupe keys |
| **`computeFinalChartPresentation`** (shared path) | Charts tab, AI Insights, and PDF must stay aligned |
| **`ChartRenderer` chart-type semantics** | Do not force horizontal → vertical or change trend detection for Insights only without explicit product sign-off |
| **PDF pipeline** | `downloadReport`, `pdf-report.ts`, `validateExportMatchesContract`, capture ref wiring |
| **`chartCaptureInsightRef` structure** | DOM used for export image capture; must stay in sync with on-screen insight chart |
| **`insightShellPlotHeight` / `getInsightLayoutMetrics`** | Changing math regresses readability and PDF framing |
| **Overview Auto Dashboard chart path** | Separate from Insights (`OverviewAutoDashboardChartCard` in `page.tsx`) |
| **Navigation / tab ids** | Sidebar `insights` id, `pendingInsightAutoAskRef`, `openDashboardChartInChartsTab` |
| **Filter application on ask** | `dashboard_filters`, `date_range`, `conversation_context` in `askAI` |

---

## 5. Safe areas for future UI polish

These can be changed **without** touching business logic if handlers and gates are preserved.

| Area | Location | Notes |
|------|----------|--------|
| **Outer Insights shell** | `page.tsx` ~10371 | Gradient, border, shadow, padding |
| **Left / right panel cards** | `page.tsx` ~10373–10415 | Surface elevation, hover, dark-mode slate → CSS variables |
| **Suggested / recent question buttons** | `page.tsx` ~10385–10408 | Hover, focus, typography |
| **Confidence card** | `page.tsx` ~10520–10576 | Background opacity in dark mode; caution vs normal variants |
| **AI Answer card + `<details>`** | `page.tsx` ~10579–10659 | `bg-white` → theme tokens; section title hierarchy |
| **Follow-up chips** | `page.tsx` ~10662–10682 | Hover, focus ring, accent border |
| **“How calculated” accordion** | `page.tsx` ~10685–11073 | Borders, dark surfaces |
| **Visualization card chrome** | `page.tsx` ~11075–11121 | Padding around chart (not plot height math) |
| **Export button styling** | `btnExportSm` usage ~11149 | Prefer Insights-only class so Export tab unchanged |
| **`AiExecutiveInsightsPanel`** | Component file | Card gradients, kicker typography, dark mode |
| **Dedicated CSS layer** | Wire `ai-insights-ui.ts` + `globals.css` `.ai-insights-*` | Replace long inline Tailwind incrementally; **do not** change JSX structure on first pass |

**Preferred approach:** visual-only diffs; same conditional renders and same `onClick` handlers.

---

## 6. Risky areas that can break layout

| Risk | What goes wrong |
|------|------------------|
| **`ChartInsightViewportWrapper` `min-h` / padding** | Affects **both** on-screen Insights **and** `chartCaptureInsightRef` PDF capture |
| **`AiInsightChartShell` `max-w` / `minOuterHeight`** | Plot centering and export parity |
| **`insightShellPlotHeight` heuristics** | Cramped or overflowing axes; PDF clip |
| **`insightCartesianPlanMain` inputs** | `viewportWidthPx`, `chartHeight`, `insightMode` — overlap, wrong horizontal fallback |
| **`ChartRenderer` `insightMode` margins** | Shared with capture; can crush cartesian width (see `insightCartesianOuterMargins` in `chart-layout-config.ts`) |
| **Reordering gated sections** | UX confusion; export narrative order in PDF is separate but user mental model follows UI order |
| **Moving chart above answer** | May conflict with “answer first” product flow and PDF section expectations |
| **Removing off-screen capture duplicate** | Broken or blank PDF charts |
| **Hardcoding pixel widths on outer grid** | Breaks `lg:grid-cols-[3fr_7fr]` responsiveness |
| **Global `btnExportSm` changes** | Unintended Export tab button changes |
| **Refactoring `page.tsx` insights block into many files** | Easy to miss gates or refs unless done mechanically |

---

## 7. Exact regression checklist for AI Insights

Run after **any** Insights UI change. Use a dataset with categories, a metric, and a date column (e.g. operations or HR sample).

### Setup

- [ ] Dataset uploaded; column mapping saved
- [ ] Light mode and dark mode
- [ ] Browser zoom **75%, 100%, 125%**

### Ask flow

- [ ] Suggested question prefills textarea (does not auto-send unless designed)
- [ ] **Ask AI** returns narrative + chart (or explicit no-viz message)
- [ ] Loading states: “Thinking…”, “Generating answer…”, “Generating visualization…”
- [ ] Invalid empty question shows error
- [ ] **Reset conversation** clears answer, chips, insight chart, thread badges; **keeps** file, filters, dashboard, non-AI chart history

### Gating and content

- [ ] Executive insights **hidden** until valid answer + chart facts exist
- [ ] Confidence card shows level + score; caution styling on small sample / cautious tone
- [ ] AI Answer summary + expandable sections (statistical, hypotheses, etc.) when present
- [ ] Follow-up chips call `askAI` with chip text; disabled while loading
- [ ] “How this insight was generated” expands; provenance fields readable

### Chart and visualization

- [ ] Chart renders (no Recharts `width(-1)` / `height(-1)` in console)
- [ ] Horizontal bar remains horizontal; trend charts readable
- [ ] `ChartContextSummary` chips and title/subtitle present
- [ ] Smart chart panel appears only when intel active
- [ ] Chart drill (if enabled for insight) does not throw

### Session and navigation

- [ ] New ask adds/updates timeline entry (`chartHistory`)
- [ ] Switching timeline chart restores pinned insight + stored answer when available
- [ ] Overview → **Ask AI** on dashboard chart: tab switch + prefill/auto-ask
- [ ] Overview → **Charts** opens correct snapshot
- [ ] Filter change + re-ask respects dashboard filters in provenance

### Follow-up / pinned chart

- [ ] Follow-up question shows context badges when applicable
- [ ] Pinned chart follow-up preserves contract where expected (`preservePinnedChart`)
- [ ] Narrative stays aligned with pinned trend contract when applicable

### Export

- [ ] **Export this insight (PDF)** enabled only when `canExportInsight` (valid AI ask, chart, narrative)
- [ ] Disabled helper text matches reason (`exportEnabledReason`)
- [ ] PDF includes chart image (centered, not clipped)
- [ ] PDF narrative sections match answer content
- [ ] Export debug `<details>` still optional (dev-facing)

### Non-regression (other tabs)

- [ ] **Overview** Auto Dashboard charts unchanged
- [ ] **Charts** tab session chart unchanged
- [ ] **Export** tab full report unchanged
- [ ] **Data Preview** unchanged

---

## 8. Current known improvement opportunities

Visual / UX only — stable function is good; polish targets below.

### Light mode depth

- Outer and inner panels rely on similar `--surface-elevated` tones; can feel **flat white** in light mode.
- Confidence block uses `bg-slate-50/60`; AI Answer uses `bg-[var(--surface-subtle)]`; details use **`bg-white`** — weak separation between layers.
- Executive panel cards use white gradients; opportunity for consistent **card elevation** (border + shadow tokens).

### Dark mode cleanup

- Many **hardcoded `slate-*`** classes in the Insights block (questions, confidence, details, “How calculated”) do not adapt to `.dark`.
- Confidence / follow-up areas use **light-tinted** `amber-50`, `indigo-50` overlays that can look foggy in dark mode.
- Executive panel brief uses `bg-white/80` — poor contrast in dark theme.

### Visualization whitespace

- `ChartInsightViewportWrapper`: `min-h-[420px]` + `py-4 sm:py-5` leaves **empty vertical band** around the plot.
- Visualization card adds header + `ChartContextSummary` + shell padding before plot — chart uses less than half of perceived card height on some kinds.
- **Improvement:** reduce **shell padding** only; keep `insightShellPlotHeight` math unless measured otherwise.

### Typography hierarchy

- “Ask AI” and “Suggested Questions” both `text-lg font-semibold` — weak distinction from section kickers inside the column.
- “AI Answer” is `text-base` — should be stronger vs body and vs “Visualization” uppercase label.
- Muted copy mixes `text-slate-500`, `text-slate-600`, and `var(--text-muted)` inconsistently.

### Follow-up chips and buttons

- Follow-up chips: basic indigo border; opportunity for **hover/focus/active** (accent glow) without size changes.
- Export uses generic `btnExportSm` — opportunity for Insights-only premium purple variant.
- Suggested questions: same hover as recent questions — could align with SaaS button tokens (`.saas-btn-premium`).

### Consistency and maintainability

- Large inline Tailwind block in `page.tsx` (~800 lines) is hard to tune consistently.
- **`ai-insights-ui.ts` exists but is unwired** — future polish can adopt it + `.ai-insights-*` in `globals.css` to centralize spacing (`1rem` padding, `1rem` radius) without a redesign.

### Not bugs — product constraints

- Insights chart path is **intentionally separate** from Overview mini-charts (`computeOverviewDashboardChartPresentation` does not apply here).
- PDF capture **must** stay aligned with on-screen insight shell — any polish must verify export after viewport/shell tweaks.

---

## Quick file index (search strings in `page.tsx`)

| Search | Purpose |
|--------|---------|
| `activeTab === "insights"` | Tab root |
| `const askAI` | Ask handler |
| `hasValidAIAnswer` | Content gates |
| `insightShellPlotHeight` | Plot sizing |
| `renderDatasetChart` | ChartRenderer bridge |
| `chartCaptureInsightRef` | PDF capture |
| `canExportInsight` | Export guard |
| `AiExecutiveInsightsPanel` | Executive block |
| `pendingInsightAutoAskRef` | Overview → Insights auto-ask |

---

*Last updated: reflects post–`git reset --hard` stable tree with inline Insights Tailwind in `page.tsx`; `ai-insights-ui.ts` present but not wired.*
