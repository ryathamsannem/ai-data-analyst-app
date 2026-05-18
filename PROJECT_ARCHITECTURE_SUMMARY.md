# AI Data Analyst App — Project Architecture Summary

Reference for continuity and **regression prevention** before/during a major SaaS UI redesign (theme system, sidebar layout, visual modernization). Describes the **current** implementation. Update when behavior changes materially.

**Product baseline:** see `AGENTS.md` (chart semantics, filters, PDF alignment, no drive-by refactors).

---

## 1. Frontend architecture

| Layer | Location | Role |
|-------|----------|------|
| **App shell** | `frontend/app/page.tsx` (~11.4k lines) | Single client page: all tabs, upload, filters, mapping modal, `/ask`, export, Overview mini-charts, navigation orchestration |
| **Root layout** | `frontend/app/layout.tsx` | Geist fonts, `globals.css`, full-height body — **no sidebar yet** |
| **Session provider** | `frontend/contexts/chart-session-context.tsx` | `ChartSessionProvider` wraps `HomeInner` in `page.tsx` default export |
| **Shared chart render** | `frontend/app/components/home/chart-renderer.tsx` | Recharts for Charts tab, AI Insights, off-screen PDF capture |
| **Tab chrome** | `frontend/app/components/home/main-nav-tabs.tsx` | Horizontal pill nav: `overview` \| `preview` \| `insights` \| `charts` \| `export` |
| **PDF** | `frontend/app/pdf-report.ts` | jsPDF + Canvg SVG rasterization |
| **Types** | `frontend/app/chart-types.ts`, `dashboard-filter-types.ts` | `ChartRow`, filter models |
| **Libs** | `frontend/lib/*` (~44 modules) | Contracts, semantics, axes, narrative, confidence, PDF helpers |

**Stack:** Next.js App Router, Tailwind v4 (`@import "tailwindcss"`), Recharts, client-only data plane (no per-user DB on frontend).

**State shape:** Most business logic and UI state live in `HomeInner` inside `page.tsx` (not a feature-folder split). Redesign should treat `page.tsx` as an integration hub — restyle and re-layout without moving chart/session logic unless explicitly planned.

**Performance patterns already in use:** `React.memo` on heavy subtrees (Overview chart slots, nav tabs), `useMemo` / `useCallback`, `useTransition` for tab switches, `useDeferredValue` (Data Preview search), dev render counters (`useDevRenderCount`).

---

## 2. Backend architecture

| Area | Location | Role |
|------|----------|------|
| **API monolith** | `backend/main.py` | FastAPI app; in-memory pandas `df` per server process |
| **Labels / phrasing** | `backend/analytics_metadata.py` | Domain-agnostic metric and axis labels |
| **Session globals** | `df`, `dataset_profile`, `column_mapping`, `column_mapping_metadata`, `uploaded_file_*` | One active dataset per process |

**Key endpoints:**

| Endpoint | Purpose |
|----------|---------|
| `POST /upload` | Ingest CSV/Excel, profile, infer mapping, initial dashboard |
| `POST /select-sheet` | Multi-sheet Excel sheet switch |
| `POST /filtered-dashboard` | Filtered cohort + auto-dashboard payload |
| `POST /preview` | Paginated row preview |
| `POST /update-column-mapping` | User-confirmed role mapping |
| `POST /ask` | Question → pandas viz + Claude narrative + `analysis` block |

**Split responsibility:** Chart **series and aggregation** are deterministic (pandas). **Prose** is generative (Claude) with confidence/sample prompts and safety blocks.

**Recent backend behaviors (regression-sensitive):** Ranking questions prefer **SUM** over MAX for additive metrics; region role rejects temporal/numeric columns; chronological sort for trend series; dynamic KPI titles; `cautiousNarrativeRequired` / mapping confidence in `/ask` analysis metadata.

---

## 3. Tab and navigation flow

**Tabs** (`MainNavTabId`): `overview` → `preview` → `insights` → `charts` → `export`.

| Mechanism | Implementation |
|-----------|----------------|
| Active tab | `activeTab` state in `HomeInner` |
| Tab switch | `handleMainTabClick` → `useTransition` → `setActiveTab` |
| Conditional chrome | Filter bar visible on **Overview** and **AI Insights** when columns loaded; compact filter strip on other tabs when data exists |

**No router-based tab URLs** — tab state is in-memory only. A sidebar redesign should preserve the same tab ids or provide a thin mapping layer.

**Layout today:** Centered max-width column (`max-w-6xl` / `max-w-7xl` regions), stacked sections per tab. Primary nav is **top horizontal pills**, not a sidebar.

---

## 4. Dataset upload and mapping flow

1. **Upload** (`uploadFile`): `POST /upload` → sets `rows`, `columns`, `profile`, `datasetKind`, `mappingMetadata`, `autoDashboard`, KPIs; calls `invalidateForDatasetChange` + `replaceAutoDashboardCharts`.
2. **Sheet select** (`selectSheet`): `POST /select-sheet` for Excel workbooks.
3. **Column mapping modal** (`mappingModalOpen`): user assigns product / sales / region / customer / profit / date; `POST /update-column-mapping` → refresh dashboard and mapping metadata.
4. **Mapping confidence (UI):** Role scores from `mappingMetadata.roles.*.confidence`; fallback heuristic from resolved column count; feeds unified insight confidence on frontend.

**Overview replace upload:** Expandable drop zone on Overview; same upload pipeline.

**Regression:** Upload or mapping change must reset chart session (`invalidateForDatasetChange`) and not leave stale `insightChartId` / export scope.

---

## 5. Auto-dashboard flow

| Step | Behavior |
|------|----------|
| API payload | `autoDashboard`: `cards[]`, `charts[]` (labels, values, chartType, interaction/drill metadata) |
| Overview UI | Renders API charts via `OverviewAutoDashboardChartCard` (local Recharts, **not** `ChartRenderer`) |
| Session sync | `useEffect` → `replaceAutoDashboardCharts(autoDashboard.charts)` builds `ChartSnapshot` entries with `source: "auto_dashboard"`, `dashboardChartKey` from `dashboardChartKeyFromTitle(title)` |
| Linking | `dashboardSnapshotByKey` Map connects Overview card → session `snapshotId` |
| Filters | `POST /filtered-dashboard` on filter/date change; replaces auto-dashboard snapshots, keeps AI history entries |

**Dual path:** Overview displays live API payload; Charts/Export use **session snapshots** derived from the same titles/keys. Titles must stay aligned via `getCanonicalChartTitle` + frozen `contract` on snapshots.

**Overview actions per card:** Drill on bar/slice (dashboard filters), **Charts** button, **Ask AI** button, click chart area → Charts tab, PNG export of mini chart.

---

## 6. AI Insights and Ask AI flow

### Live state (global in `HomeInner`)

| State | Purpose |
|-------|---------|
| `question`, `answer`, `hasValidAIAnswer`, `lastAskedQuestion` | Current Q&A UI |
| `alignedAnalysis` | Parsed `/ask` `analysis` (confidence, KPIs, intent) |
| `conversationSnapshot`, `lastConversationMeta`, `aiConversationState` | Thread / follow-up |
| `loading` | Ask in flight |

### Session state

| State | Purpose |
|-------|---------|
| `insightChartId` / `insightSnapshot` | Pinned chart for Insights + export (`chartScope: "insight"`) |
| `activeChartId` / `activeSnapshot` | Charts tab selection |
| `visualization` | Hydrated API viz for active insight path |

### Per-chart persistence

| Store | Purpose |
|-------|---------|
| `aiAnswerByChartId` | `ChartInsightAnswerBundle` per `chartId` (answer, analysis, last question) |
| `selectChartWithInsightState` | On chart pick: restore bundle into live fields |
| `saveInsightBundleForChart` | After `/ask`, save on **lineage parent** id when preserving pin |

### `askAI` sequence (do not break)

1. Clear live answer/analysis; set `lastAskedQuestion`; `loading = true`.
2. Build `conversation_context`, `dashboard_filters`, `date_range`; `POST /ask`.
3. `hydrateVisualizationFromApi`, `parseAlignedAnalysis`.
4. **`preservePinnedChart`:** If pinned snapshot has data and matches `insightChartId`, **do not** `pushAIChart`; re-`selectChart(parent)`; sanitize narrative vs contract; save bundle on parent id.
5. **Else:** `pushAIChart` → new/updated AI snapshot; pin insight.
6. Apply narrative tone softening (`insight-narrative-tone.ts`) and unified confidence (`insight-confidence.ts`).

### Insights UI gating (current)

Executive insights, confidence panel, methodology, follow-ups render only when **`hasValidAIAnswer`**. Empty state: “This chart is selected. Click Ask AI…” when chart pinned but no answer. Layout: **30% suggested questions / 70% Ask AI** on large screens (`lg:grid-cols-[3fr_7fr]`).

### Auto-ask from Overview

`askAiAboutDashboardChart`: pins chart, prefills summarize question; restores stored answer if valid; else `pendingInsightAutoAskRef` + `useEffect` auto-runs `askAI` after tab → `insights`.

---

## 7. Chart history, ChartSnapshot, VisualizationContract

### `ChartSnapshot` (`chart-session-context.tsx`)

Fields include: `id`, `source` (`ai` \| `auto_dashboard`), `chartData`, `visualization`, `contract`, `dashboardChartKey`, dedupe keys (`semanticIntentKey`, `analysisContextKey`), lineage (`derivedFromChartId`, turn ids).

| Action | Function |
|--------|----------|
| Select chart | `selectChart(id)` → sets **`activeId` and `insightChartId` together** |
| Push AI chart | `pushAIChart` → upsert by dedupe key; pins active + insight |
| Replace dashboard | `replaceAutoDashboardCharts` → rebuilds auto entries; **keeps** `ai` snapshots |
| Dataset reset | `invalidateForDatasetChange` → clears history, bumps `datasetEpoch` |
| Clear AI thread | `clearAiInsightSession` → removes AI snapshots only |

**Do not use `setActiveChart` alone** — it only sets `activeId`, not insight pin.

### `VisualizationContract` (`selected-visualization.ts`)

Frozen via `freezeVisualizationContract()`: `mode` (`trend` \| `category` \| `comparison` \| `distribution`), `chartType`, titles, aggregation labels, `semanticContext`, `isTimeSeries`.

| Helper | Use |
|--------|-----|
| `isTrendMode(contract)` | Disables category sort; trend axes/narrative/PDF branches |
| `validateExportMatchesContract` | Blocks PDF on contract/chart drift |
| `sanitizeNarrativeForTrendContract` | Strips category wording from AI text for trends |

**Rendering SoT:** `ChartSnapshot.contract` + `chartData` + `visualization`. `computeFinalChartPresentation` still used for kind/orientation; Overview mini charts use a **parallel local** presentation path.

---

## 8. Overview → Charts routing

**Entry points:** “Charts” toolbar button; **click chart plot area** (keyboard accessible).

**Handler:** `openDashboardChartInChartsTab(snapshotId)`

1. Resolve `ChartSnapshot` from `chartHistory`.
2. `selectChartWithInsightState(id, { restoreFromStore: true, clearAnswerWhenMissing: true })`.
3. `pendingChartsPreviewScrollRef = true`.
4. `setActiveTab("charts")`.

**Scroll:** `useLayoutEffect` when `activeTab === "charts"` scrolls `chartsSessionHeadingRef` (chart title block) into view with `block: "start"` (avoids landing at bottom of Charts tab).

**Regression:** Must select the **same** snapshot id linked via `dashboardChartKey`; scroll target must remain the heading ref, not an arbitrary footer.

---

## 9. Overview → AI Insights routing

**Entry points:** “Ask AI” on card; Data Preview suggestion chips (prefill + tab switch).

**Handler:** `askAiAboutDashboardChart(snapshotId)`

1. Build summarize question from `getCanonicalChartTitle` + snapshot contract.
2. `selectChartWithInsightState` + `setQuestion(q)`.
3. If `aiAnswerByChartId` has valid stored answer → tab `insights` only.
4. Else → `pendingInsightAutoAskRef = q`, tab `insights`, effect calls `askAI(q)`.

**Regression:** Do not show executive/confidence blocks without `hasValidAIAnswer`; do not clear stored bundles when restoring; auto-ask must not double-fire on chart switch; `preservePinnedChart` behavior unchanged for follow-ups on pinned chart.

---

## 10. Export PNG and PDF flow

### Chart PNG (Charts tab)

`downloadChartPng`: reads SVG from `chartCaptureSessionRef` (hidden mount), Canvg → canvas → download. Requires chart mounted in capture container.

### Insight PDF shortcut (AI Insights)

`downloadReport({ chartScope: "insight", ... })` — same pipeline as Export tab with preset options.

### Executive PDF (Export tab)

| Piece | Behavior |
|-------|----------|
| Options | `exportOptions`: KPIs, AI insight, chart, preview, quality, conversation, technical appendix; `chartScope`: `session` \| `insight` |
| Snapshot | `pdfSnap` = `activeSnapshot` or `insightSnapshot` |
| Validation | `validateExportMatchesContract` before build |
| Narrative | `insightAnswerForExport` / `insightAnalysisForExport` (live or per-chart store); trend sanitization |
| Chart image | Off-screen `ChartRenderer` via `chartCaptureSessionRef` / `chartCaptureInsightRef` |
| Build | `downloadReportImplRef` → `runExecutivePdfExport` (`pdf-report.ts`) |

**Insight export gates:** Valid AI answer, question alignment with last ask, hydrated visualization — see `canExportInsight` / `exportEnabledReason` memos.

**Regression:** PDF chart must use same contract + sort rules as UI (`sortRowsForPresentation`, trend mode). Do not bypass `validateExportMatchesContract`.

---

## 11. Current styling and UI structure

### Design tokens (`frontend/app/globals.css`)

CSS variables on `:root`: `--background`, `--foreground`, `--surface-elevated`, `--surface-subtle`, `--surface-accent-wash`, `--border-default`, `--shadow-*`, badge colors, radii. **`.dark` block exists** but is not wired to a toggle yet — preferred hook for theme system.

Tailwind uses `bg-[color:var(--surface-elevated)]` pattern throughout cards.

### Button system (`frontend/lib/ui-buttons.ts`)

| Token | Use |
|-------|-----|
| `btnPrimary` / `btnPrimarySm` | Slate-900 — Ask AI, upload, mapping save |
| `btnExport` / `btnExportSm` | Indigo-600 — PDF downloads |
| `btnSecondary` | Outlined — reset conversation, secondary actions |
| `btnSuccess` | Emerald — reserved for success confirmations (not export CTAs) |

### Visual patterns

- Rounded-2xl cards, subtle rings, gradient washes on chart shells.
- `AiInsightChartShell` — consistent insight chart viewport height.
- AI Insights: collapsible `<details>` sections for statistical/hypothesis/methodology blocks.
- Confidence panel: amber tint when cautious narrative / small sample.
- Charts tab: timeline aside (~23% width) + main preview (~77%).
- Data Preview: sticky header + sticky first column, zebra rows, truncated cells with `title` tooltip.

### Typography

Geist Sans / Geist Mono via `layout.tsx`. Uppercase micro-labels for section headers in places.

---

## 12. Reusable components (safe to restyle)

| Component | Path | Notes |
|-----------|------|-------|
| `MainNavTabs` | `components/home/main-nav-tabs.tsx` | **Replaceable with sidebar nav** if tab ids preserved |
| `FilterPanel` | `components/home/filter-panel.tsx` | Dashboard filters + date range grouped control |
| `ChartRenderer` | `components/home/chart-renderer.tsx` | **Logic-heavy** — restyle margins only via layout libs |
| `ChartsTimelineAside` | `components/home/charts-timeline-aside.tsx` | History list; preserve `onSelectChart` contract |
| `AiInsightChartShell` | `components/ai-insight-chart-shell.tsx` | Insight chart chrome / min height |
| `ChartInsightViewportWrapper` | `components/home/chart-insight-viewport-wrapper.tsx` | Centering wrapper |
| `AiExecutiveInsightsPanel` | `components/ai-executive-insights-panel.tsx` | Executive fact cards |
| `SmartChartInsightPanel` | `components/SmartChartInsightPanel.tsx` | Schema routing hints |
| `OverviewInlineKpiChip` | `components/home/overview-inline-kpi-chip.tsx` | Overview KPI strip |
| `OverviewAutoDashboardChartCard` | Defined in `page.tsx` | Mini charts + actions — candidate to extract later, not required for redesign |
| `WrappedCategoryYAxisTick` | `components/chart-category-axis-tick.tsx` | Horizontal bar Y-axis labels |
| `DataPreviewColumnProfilePopover` | Portal in `page.tsx` | Column stats popover |

**Not components (do not “restyle only” without care):** `freezeVisualizationContract`, `pushAIChart`, `askAI`, `hydrateVisualizationFromApi`, `downloadReportImplRef`.

---

## 13. Risky areas — do not break

| Area | Why |
|------|-----|
| `preservePinnedChart` | Wrong branch replaces pinned series or loses lineage bundles |
| `selectChart` vs `setActiveChart` | Insight pin must stay in sync with active chart |
| `freezeVisualizationContract` / `isTrendMode` | Breaks sort, axes, narrative, PDF for trends |
| `validateExportMatchesContract` | Silent PDF/UI mismatch if bypassed |
| Overview dual path | API `autoDashboard` vs session snapshots desync on title keys |
| `replaceAutoDashboardCharts` on filter refresh | Snapshot ids change; Overview linking depends on `dashboardChartKey` |
| `aiAnswerByChartId` restore | Chart switch must repopulate live answer/analysis |
| `pendingInsightAutoAskRef` / scroll refs | Overview navigation UX regressions |
| Aggregation inference (backend) | Ranking vs peak questions revert to wrong agg |
| Region mapping guards | Temporal columns (e.g. `campaign_date`) must not become region |
| Horizontal bar orientation | `bar_horizontal` must not be forced vertical for readability |
| Capture refs | PDF/PNG require off-screen chart mount with correct snapshot |

---

## 14. Safe boundaries for redesign

### Generally safe

- `globals.css` tokens and `.dark` theme class wiring.
- `layout.tsx` shell (add sidebar wrapper, move `{children}`).
- `MainNavTabs` → sidebar component **if** `MainNavTabId` and `onTabClick` unchanged.
- Card padding, typography, colors using CSS variables.
- `ui-buttons.ts` class strings (keep semantic roles: primary/export/secondary).
- Spacing in Insights 30/70 grid, Export tab forms, Data Preview table **without** removing sticky behavior.
- Empty/loading states copy and layout.

### Change with caution (visual only, no logic moves)

- `AiInsightChartShell`, `ChartInsightViewportWrapper` dimensions.
- Filter panel grid — keep single date-range control grouping per `AGENTS.md`.
- Chart card chrome around `ChartRenderer` (titles, badges).

### Not safe without explicit migration plan

- Splitting `page.tsx` logic without regression tests.
- Replacing Recharts or `ChartRenderer` pipeline.
- Removing `ChartSessionProvider` or changing `ChartSnapshot` shape.
- URL routing for tabs/charts without restoring scroll + pin behavior.
- Storing theme preference in ways that remount capture trees mid-export.
- Rewriting `askAI` / `/ask` payload or `VisualizationContract` fields.

---

## 15. Recommended safe order — theme, sidebar, SaaS redesign

### Phase A — Theme system (foundation)

1. Finalize token map in `globals.css` (light + wire `.dark`).
2. Map tokens to Tailwind `@theme` if needed; replace hardcoded `#f2f5fb` in `layout.tsx` body with `var(--background)`.
3. Migrate `ui-buttons.ts` and badge colors to tokens.
4. Smoke: all tabs, focus rings, disabled states, amber/indigo/emerald semantic colors.

**Do not** change component tree depth around chart capture nodes in this phase.

### Phase B — App shell / sidebar layout

1. Add persistent shell in `layout.tsx` or thin `AppShell` component: sidebar + main content.
2. Port `MainNavTabs` items to sidebar; keep `activeTab` + `handleMainTabClick` API.
3. Move max-width constraints from page sections to `main` content area; preserve scroll regions (Data Preview table, timeline aside).
4. Verify Overview → Charts scroll (`chartsSessionHeadingRef`) still works with new scroll container (may need `scroll-mt` on main).

**Do not** move `HomeInner` state into sidebar; navigation stays prop/callback driven.

### Phase C — Surface SaaS polish (tab by tab)

1. **Overview** — KPI strip, dashboard cards, upload dropzone (visual only).
2. **Data Preview** — table chrome; keep sticky first column behavior.
3. **Charts** — timeline + preview card; preserve `selectChartPreserveScroll`.
4. **AI Insights** — 30/70 split, question chips, answer sections, confidence panel.
5. **Export** — checkbox cards, preview summary, indigo export CTA.

### Phase D — Regression pass (required)

Use checklist below on each phase. Test: upload → mapping → filter → Overview drill → Charts navigation → Ask AI (new + follow-up on pinned chart) → preservePinnedChart → Export PDF (session + insight scopes) → trend vs bar chart.

---

## Quick reference tables

### Tab → primary state → API

| Tab | Primary state | Backend |
|-----|---------------|---------|
| Overview | `autoDashboard`, filters, `dashboardSnapshotByKey` | `/upload`, `/filtered-dashboard`, `/update-column-mapping` |
| Data Preview | `preview`, `columns`, `profile` | `/preview` |
| AI Insights | `question`, `answer`, `insightSnapshot`, conversation | `/ask` |
| Charts | `activeSnapshot`, `chartHistory` | Session only |
| Export | `exportOptions`, capture refs | Client PDF |

### Key lib modules

| Module | Responsibility |
|--------|----------------|
| `selected-visualization.ts` | Contract freeze, trend mode, export validation |
| `final-chart-presentation.ts` | Chart kind / orientation |
| `semantic-metric-engine.ts` | Aggregation labels, semantic context |
| `canonical-chart-title.ts` | Display titles |
| `chart-axis-layout.ts`, `chart-time-x-axis.ts` | Margins, chronological sort |
| `chart-insight-answers.ts` | Per-chart Q&A store |
| `insight-confidence.ts`, `insight-narrative-tone.ts` | Unified confidence + cautious copy |
| `ux-narrative.ts`, `ai-follow-up-suggestions.ts` | Answer sections, chips |
| `pdf-report.ts` | Executive PDF |

### Key files for debugging

| File | Controls |
|------|----------|
| `frontend/app/page.tsx` | Tabs, navigation, `askAI`, export, Overview cards |
| `frontend/contexts/chart-session-context.tsx` | History, pins, `pushAIChart` |
| `frontend/lib/selected-visualization.ts` | Contract + validation |
| `frontend/app/components/home/chart-renderer.tsx` | Shared Recharts |
| `frontend/app/pdf-report.ts` | PDF document |
| `backend/main.py` | Data plane + `/ask` |

---

## Regression checklist

After any chart, navigation, or shell change, verify:

- [ ] `freezeVisualizationContract` / `computeFinalChartPresentation` / `isTrendMode`
- [ ] Overview `dashboardChartKey` linking + `replaceAutoDashboardCharts` after filters
- [ ] Overview → Charts: correct snapshot + scroll to title (`chartsSessionHeadingRef`)
- [ ] Overview → AI Insights: restore or auto-ask; no empty executive shell
- [ ] `preservePinnedChart` + `aiAnswerByChartId` on parent chart id
- [ ] `selectChart` sets active + insight together
- [ ] PDF export: `chartScope`, `validateExportMatchesContract`, capture refs
- [ ] Ranking question uses **Total/SUM**; peak wording uses **MAX** where appropriate
- [ ] Region mapping does not pick date columns

---

*Last updated from codebase inspection (navigation, confidence/narrative, UI tokens, button system). Document only — application behavior unchanged by this file.*
