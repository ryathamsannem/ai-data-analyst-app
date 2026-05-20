# AI Data Analyst App — Project Architecture Summary

Reference for onboarding and **fresh Cursor chats**. Describes the **current stable implementation** (May 2026) across all tabs.

**Product baseline:** [`AGENTS.md`](AGENTS.md)  
**Tab deep-dives:** [`CHARTS_TAB_STABLE_SUMMARY.md`](CHARTS_TAB_STABLE_SUMMARY.md) · [`UI_ARCHITECTURE_SNAPSHOT.md`](UI_ARCHITECTURE_SNAPSHOT.md) · [`AI_VISUALIZATION_BEHAVIOR.md`](AI_VISUALIZATION_BEHAVIOR.md) · [`AI_INSIGHTS_STABLE_SUMMARY.md`](AI_INSIGHTS_STABLE_SUMMARY.md) · [`CHARTS_TAB_BASELINE.md`](CHARTS_TAB_BASELINE.md) (legacy) · [`LATEST_STABLE_UI_SNAPSHOT.md`](LATEST_STABLE_UI_SNAPSHOT.md)

---

## 1. Application architecture

### Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js App Router, React 19, Tailwind CSS v4, Recharts |
| Backend | FastAPI, pandas (in-memory `df` per process) |
| AI | Claude via `POST /ask` for narrative; chart series are **deterministic** (pandas) |
| Persistence | Client-only session (no per-user DB on frontend) |

### Repository layout

```
frontend/app/layout.tsx          → fonts, ThemeScript, globals.css
frontend/app/page.tsx            → single client app (~12k lines): all tabs + business logic
frontend/components/app-shell/   → sidebar + header + main scroll region
frontend/contexts/               → chart session store
frontend/lib/                    → chart contracts, axes, narrative, theme, tab tokens
backend/main.py                  → upload, filters, dashboard, preview, /ask
```

### Navigation model

| Tab id | Label | Primary backend |
|--------|--------|-----------------|
| `overview` | Overview | `/upload`, `/filtered-dashboard` |
| `preview` | Data Preview | `/preview` |
| `insights` | AI Insights | `/ask` |
| `charts` | Charts | Session only (snapshots from Overview + AI) |
| `export` | Export | Client PDF (`pdf-report.ts`) |

**No URL routes per tab** — `activeTab` state in `page.tsx` inside `AppShell`.

### App shell (stable)

| File | Role |
|------|------|
| `frontend/components/app-shell/app-shell.tsx` | Sidebar + workspace; collapse via `sidebar-prefs` |
| `frontend/components/app-shell/app-sidebar.tsx` | Nav → `MainNavTabId` |
| `frontend/components/app-shell/app-header.tsx` | Title, search placeholder, **ThemeToggle** |
| `frontend/app/components/home/main-nav-tabs.tsx` | Tab ids + page titles |

**Layout:** `app-workspace` → `app-main-scroll` → `app-main-inner app-page-gutter` (max-width ~100rem). Content scrolls in main region — no nested floating panel gutter.

---

## 2. Integration hub (`page.tsx`)

`HomeInner` wrapped in **`ChartSessionProvider`**. Owns:

| Concern | State / handlers |
|---------|------------------|
| Tabs | `activeTab`, `useTransition` for switches |
| Data | Upload, mapping modal, filters, `autoDashboard` |
| AI Insights | `askAI`, `resetAiConversation`, `aiAnswerByChartId`, insight gates |
| Charts | `chartHistory`, `activeSnapshot`, timeline selection |
| Export | `downloadReport`, `downloadChartPng`, capture refs |
| Viewport | `viewportH` / `viewportW` (resize debounce 140ms) |

**Performance patterns (preserve):** `React.memo` on heavy subtrees, `useMemo` / `useCallback`, `useDeferredValue` on Data Preview search.

---

## 3. Chart rendering — two paths

### Path A — Shared `ChartRenderer` (Charts, AI Insights, PDF/PNG)

| File | Role |
|------|------|
| `frontend/app/components/home/chart-renderer.tsx` | Recharts; `insightMode` flag |
| `frontend/lib/final-chart-presentation.ts` | **`computeFinalChartPresentation`** — single deterministic kind |
| `frontend/lib/selected-visualization.ts` | Contract freeze, trend mode, row sort |
| `frontend/lib/chart-axis-layout.ts` | Category plans, margins |
| `frontend/lib/chart-time-x-axis.ts` | Line/area X ticks and bottom margin |
| `frontend/lib/chart-layout-config.ts` | Insight plan widths, `insightCartesianOuterMargins` |
| `frontend/app/components/ai-insight-chart-shell.tsx` | Insights + PDF capture frame |
| `frontend/app/components/home/chart-insight-viewport-wrapper.tsx` | Insight plot centering |

| Mode | Viewport | Margins | Shell |
|------|----------|---------|-------|
| Session (`insightMode=false`) | Live `viewportEffective` ≤ 860px | Session cartesian plan | Fixed `chartHeightMain` |
| Insight (`insightMode=true`) | Fixed 760/850/900px plan | `insightCartesianOuterMargins` | `AiInsightChartShell` + plot height var |

### Path B — Overview auto-dashboard mini charts only

| File | Role |
|------|------|
| `page.tsx` — `OverviewAutoDashboardChartCard` | Local Recharts, 360px height |
| `computeOverviewDashboardChartPresentation` | Stricter than shared presentation (≤4 categories for vertical bar, etc.) |
| `frontend/lib/overview-ui.ts` | `ovCard`, `ovChartGrid`, dashboard tokens |

**Do not assume** `ChartRenderer` changes fix Overview cards (or vice versa) unless intentionally shared.

---

## 4. AI Insights — stable behaviors (summary)

Full detail: [`AI_INSIGHTS_STABLE_SUMMARY.md`](AI_INSIGHTS_STABLE_SUMMARY.md)

| Area | Implementation |
|------|----------------|
| Layout | `ai-insights-ui.ts` tokens; `268px` + `1fr` grid |
| Filters | `appearance="dashboard"` (same as Overview) |
| Viz gate | `insightHasRenderableVisualization` + question + intent match |
| Outlier sync | `chart-question-intent.ts` + backend `_try_outlier_visualization` |
| Metadata chips | `ChartContextSummary` + `resolveHistogramMeasureChipLabel` |
| Dark chips | `--insights-answer-label` / `--insights-answer-body` |
| AI Read | `SmartChartInsightPanel` gated on question match |
| Export | `showInsightExportButton` → `chartScope: "insight"` |
| Reset | `clearAiInsightSession`; disabled until conversation exists |
| Suggested Q | Scroll body; click prefills only |

---

## 5. Charts tab — stable behaviors (summary)

Full detail: [`CHARTS_TAB_BASELINE.md`](CHARTS_TAB_BASELINE.md)

| Area | Implementation |
|------|----------------|
| Layout | Timeline ~23% + preview card |
| Render | `renderDatasetChart(..., insightMode=false)` |
| Metadata | `ChartContextSummary` (non-compact) |
| Smart panel | No Insights question gate |
| PNG | `downloadChartPng` + `chartCaptureSessionRef` |
| Presentation | Same `computeFinalChartPresentation` as Insights |

---

## 6. Backend chart intelligence

| Area | `backend/main.py` |
|------|-------------------|
| Ask | `POST /ask` → visualization + Claude narrative + `analysis` |
| Chart types | `bar`, `bar_horizontal`, `pie`, `donut`, `line`, `area`, `scatter`, `histogram` |
| Outlier routing | `_try_outlier_visualization` — histogram or ranked horizontal bar |
| Histogram | `_histogram_bucket_rows`, `_resolve_histogram_numeric_column_for_question` |
| Recommendation | `_build_chart_recommendation_dict` on viz payload |

Frontend mirrors intent in `smart-chart-intelligence.ts`, `chart-question-intent.ts`, `final-chart-presentation.ts`.

---

## 7. Session store

**File:** `frontend/contexts/chart-session-context.tsx`

| API | Behavior |
|-----|----------|
| `pushAIChart` | Dedupe by intent; freeze contract; set `insightChartId` |
| `selectChart` | Sets `activeId` **and** `insightChartId` |
| `clearAiInsightSession` | Removes AI-sourced charts only |
| `replaceAutoDashboardCharts` | Sync Overview dashboard into timeline |

---

## 8. Theme and design system

| Piece | Location |
|-------|----------|
| Global tokens | `globals.css` `:root` / `.dark` |
| Theme persistence | `frontend/lib/theme.ts` |
| FOUC guard | `frontend/components/theme-script.tsx` |
| Overview UI | `frontend/lib/overview-ui.ts` |
| AI Insights UI | `frontend/lib/ai-insights-ui.ts` (**wired**) |
| Buttons | `frontend/lib/ui-buttons.ts`, `.saas-btn-*` |

**Insights dark layers** (scoped `.ai-insights-page`): `--insights-layer-*`, `--insights-answer-*`, viz metadata chip overrides.

**Charts tab:** primarily slate Tailwind on preview card; inherits global dark via `<html class="dark">`.

---

## 9. Export pipeline

| Scope | Capture ref | Chart mode |
|-------|-------------|------------|
| Session | `chartCaptureSessionRef` | `insightMode=false` |
| Insight | `chartCaptureInsightRef` (860px) | `insightMode=true` |

**File:** `frontend/app/pdf-report.ts` — `runExecutivePdfExport`, SVG-first chart image, lazy `html2canvas` fallback.

**Validation:** `validateExportMatchesContract` in `page.tsx` before export.

---

## 10. Question ↔ chart synchronization (cross-cutting)

```
User asks → /ask → viz + analysis
       ↓
pushAIChart (session) + insight pin
       ↓
insightChartMatchesQuestionIntent (outlier guard)
       ↓
insightChartMatchesCurrentQuestion (text / turnId / analysis)
       ↓
Viz + AI Read + Export enabled
```

**Preserve pinned chart** only when `shouldPreservePinnedInsightChart()` — same question, follow-up, or aligned metrics.

**Typing** a new question clears insight thread when text diverges (`setQuestionAndResetInsightState`).

---

## 11. Responsive and zoom (cross-cutting)

| Surface | Width model | Height model |
|---------|-------------|--------------|
| Overview mini | `ResizeObserver` on card | Fixed 360px |
| Charts session | `viewportEffective` ≤ 860px | `chartHeightMain` + viewport cap |
| AI Insights | Fixed plan 760–900px | `insightShellPlotHeight` + viewport cap |
| Browser zoom | Resize events only | No `visualViewport` |

**Stable QA target:** 90% and 100% zoom in light and dark for Insights viz and Charts preview.

---

## 12. Overview — current status

Overview is **stable** for KPI grid, filters, dataset card, and auto-dashboard charts. Some **grid polish** items remain documented as optional follow-ups (e.g. `.overview-charts-wrap` max-width 1600px, strict 2-column desktop cap) — see architecture notes in older commits; verify against `globals.css` before changing.

Overview-specific presentation: **`computeOverviewDashboardChartPresentation`** — do not route Overview mini charts through `computeFinalChartPresentation` without explicit approval.

---

## 13. Known limitations (project-wide)

| Area | Limitation |
|------|------------|
| Architecture | Monolithic `page.tsx` |
| Routing | No deep links per tab |
| Zoom | No explicit browser zoom handling |
| PDF | Static import; white fallback capture in dark mode |
| Docs | Prefer this file + tab baselines over stale line-number references in `page.tsx` |

---

## 14. What must NOT change without explicit request

| Area | Why |
|------|-----|
| `askAI` + preserve-pin logic | Conversation continuity |
| `computeFinalChartPresentation` (non-Overview) | Charts / Insights / PDF parity |
| Horizontal bar semantics | Product rule in `AGENTS.md` |
| Insight question–chart gates | Trust and export integrity |
| Outlier routing (BE + FE) | Fixed misleading chart class |
| `ChartSessionProvider` snapshot shape | Timeline + export contracts |
| Export validation + capture refs | PDF integrity |
| Working layout shells | `AiInsightChartShell`, filter bar, card hierarchy |

**Safe:** narrow bug fixes, token contrast tweaks, axis margin tuning, Overview-only grid CSS, incremental Charts tab polish aligned with [`CHARTS_TAB_BASELINE.md`](CHARTS_TAB_BASELINE.md).

---

## 15. Recommended next work (incremental only)

Per product direction, treat the current UI as **production baseline**:

1. **Charts tab enhancements** — polish timeline/preview tokens toward Overview chrome **without** replacing `ChartRenderer` or presentation logic ([`CHARTS_TAB_BASELINE.md`](CHARTS_TAB_BASELINE.md)).
2. **Overview chart grid** — optional max-width / 2-column enforcement if still needed on target viewports.
3. **Regression pass** after any change: upload → filter → Insights ask (outlier + grouped) → Charts timeline → PDF export (session + insight).

---

## 16. Quick file index

| Need | Open first |
|------|------------|
| AI Insights UI | `frontend/lib/ai-insights-ui.ts`, `AI_INSIGHTS_STABLE_SUMMARY.md` |
| Charts tab | `CHARTS_TAB_BASELINE.md`, `page.tsx` search `activeTab === "charts"` |
| Chart semantics | `final-chart-presentation.ts`, `chart-semantic-metadata.ts` |
| Outlier guards | `chart-question-intent.ts`, `backend/main.py` |
| Session | `chart-session-context.tsx` |
| PDF | `pdf-report.ts` |
| Agent rules | `AGENTS.md` |

---

*Last updated: May 2026 — stable SaaS baseline snapshot before Charts tab enhancements.*
