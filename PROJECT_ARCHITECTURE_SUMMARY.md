# AI Data Analyst App — Project Architecture Summary

Reference for development continuity and regression prevention. Documents the **current** codebase; update this file when architecture changes materially.

---

## 1. High-level architecture

### Frontend structure

| Area | Location | Notes |
|------|----------|--------|
| **App shell** | `frontend/app/page.tsx` (~11k lines) | Single client page: upload, filters, all tabs, `/ask`, export orchestration |
| **Provider** | `frontend/contexts/chart-session-context.tsx` | Wraps `HomeInner` via `ChartSessionProvider` in `page.tsx` default export |
| **Rendering** | `frontend/app/components/home/chart-renderer.tsx` | Shared Recharts path for Charts, AI Insights, off-screen PDF capture |
| **Tab chrome** | `frontend/app/components/home/main-nav-tabs.tsx` | `overview` \| `preview` \| `insights` \| `charts` \| `export` |
| **Libs** | `frontend/lib/*` | Presentation, semantics, axes, trend copy, PDF helpers, follow-ups |
| **PDF** | `frontend/app/pdf-report.ts` | jsPDF + Canvg SVG rasterization |
| **Types** | `frontend/app/chart-types.ts`, `dashboard-filter-types.ts` | Chart rows, filter models |

**Stack:** Next.js (App Router) + Tailwind + Recharts. Most business logic lives in `page.tsx`.

### Backend structure

| Area | Location | Notes |
|------|----------|--------|
| **API monolith** | `backend/main.py` | FastAPI: in-memory `df`, upload, sheet select, filtered dashboard, column mapping, `/ask` |
| **Label helpers** | `backend/analytics_metadata.py` | Domain-agnostic metric/axis phrasing (pandas side) |
| **Session state** | Global `df`, `dataset_profile` | One dataset per server process (no per-user DB) |

**Key endpoints:** `/upload`, `/select-sheet`, `/filtered-dashboard`, `/preview`, `/update-column-mapping`, `POST /ask`.

### AI integration flow

1. UI (`askAI` in `page.tsx`) sends `question`, `conversation_context`, `dashboard_filters`, `date_range` to `POST /ask`.
2. Backend: `resolve_follow_up_turn` → filtered pandas slice → viz builder → Claude prompt → narrative.
3. Response: `answer`, `visualization`, `analysis`, `conversation_context`, `conversation_meta`, `filter_breadcrumb`.
4. Frontend: `hydrateVisualizationFromApi`, `parseAlignedAnalysis` → `pushAIChart` **or** `preservePinnedChart` + per-chart answer bundle.

**Split responsibility:** chart **series** are deterministic (pandas/backend); prose is generative (Claude).

---

## 2. Current state management flow

### `selectedVisualization` (intended source of truth)

| Type | File | Role |
|------|------|------|
| **`VisualizationContract`** | `frontend/lib/selected-visualization.ts` | Frozen contract: `mode` (trend/category/comparison/distribution), `chartType`, titles, aggregation labels, `semanticContext` |
| **`ChartSnapshot`** | `frontend/contexts/chart-session-context.tsx` | Session record: `id`, `source` (`ai` \| `auto_dashboard`), `chartData`, `visualization`, `contract`, lineage |

**Aliases:** `SelectedVisualization` = `ChartSnapshot` (session) or `VisualizationContract` (contract module).

**Practical rendering SoT:** `ChartSnapshot.contract` + `chartData` + `visualization`. Some presentation fields are still recomputed in `page.tsx` memos.

Contracts are created via `freezeVisualizationContract()` on push/replace.

### Chart selection lifecycle

| Action | Function | Effect |
|--------|----------|--------|
| Dashboard refresh | `replaceAutoDashboardCharts` | Rebuilds `auto_dashboard` snapshots; keeps `ai` entries |
| User picks chart | `selectChart(id)` | Sets **`activeId` + `insightChartId`** together |
| New AI chart | `pushAIChart` | Upsert by dedupe key; pins active + insight |
| Dataset change | `invalidateForDatasetChange` | Clears history, bumps `datasetEpoch` |

- **Charts tab:** `activeSnapshot` (`activeChartId`).
- **Overview:** renders `autoDashboard` API payload; linked to session via `dashboardChartKeyFromTitle(title)` → `snapshotId`.

### AI Insights lifecycle

| State | Scope | Purpose |
|-------|--------|---------|
| `question`, `answer`, `hasValidAIAnswer`, `lastAskedQuestion` | Global live | Current UI |
| `alignedAnalysis` | Global live | Parsed `/ask` `analysis` |
| `aiAnswerByChartId` | Per `chartId` | Persisted Q&A when asking about a pinned chart |
| `insightSnapshot` | Session | Pinned chart for Insights + export (`insight` scope) |
| `conversationSnapshot`, `aiConversationState`, `lastConversationMeta` | Global | Thread, follow-ups, turn ids |

**`askAI` highlights:**

1. Clears live answer/analysis; sets `lastAskedQuestion`.
2. Uses `insightChartId` as lineage parent in conversation payload.
3. **`preservePinnedChart`** (parent has data): no `pushAIChart`; re-`selectChart(parent)`; sanitize narrative vs contract; save bundle on **parent** chart id.
4. Else: hydrate viz → `pushAIChart` → pin insight.

**Overview → Ask AI** (`askAiAboutDashboardChart`): `selectChart`, prefill question, clear answer/analysis, tab → `insights` (user must run Ask).

**Chart switch** (`selectChartWithInsightState`): restores `aiAnswerByChartId` into live fields.

**Reset** (`resetAiConversation`): clears thread + `clearAiInsightSession` (removes AI snapshots from history).

### Follow-up lifecycle

| Layer | Mechanism |
|-------|-----------|
| **Backend** | `resolve_follow_up_turn`, follow-up filters, `conversation_sidecar`, `followUpChain` |
| **Frontend** | `conversationSnapshot` on each `/ask`; `aiConversationState.followUpChain`; chips via `buildAiFollowUpQuestionChips` / `schemaAwareFollowUpSeeds` |
| **UI** | `lastConversationMeta.followUpDetected`, `alignedAnalysis.conversationFollowUp` |

### Export / PDF lifecycle

| Step | Behavior |
|------|----------|
| **Scope** | `exportOptions.chartScope`: `session` (Charts) or `insight` (pinned insight) |
| **Snapshot** | `pdfSnap` = `activeSnapshot` or `insightSnapshot` |
| **Validation** | `validateExportMatchesContract` — blocks on id/type/dimension mismatch |
| **Narrative** | `insightAnswerForExport`, `insightAnalysisForExport` (live or per-chart store) |
| **Capture** | Hidden `ChartRenderer` via `chartCaptureSessionRef` / `chartCaptureInsightRef` |
| **Build** | `downloadReportImplRef` → `runExecutivePdfExport` (`pdf-report.ts`) |

AI charts need valid answer + question alignment for insight export; auto-dashboard charts can export chart-only.

---

## 3. Source-of-truth objects

### Visualization rendering

| Priority | Object | Used by |
|----------|--------|---------|
| 1 | `ChartSnapshot.contract` | Kind, mode, display titles, trend vs category |
| 2 | `chartData` + `visualization` | Series, stacked/scatter, provenance |
| 3 | Fallback memos in `page.tsx` | `computeFinalChartPresentation`, axis bundles |

**Entry point:** `renderDatasetChart` → `ChartRenderer`.

**Exception:** Overview mini cards (`OverviewAutoDashboardChartCard`) render from raw `autoDashboard.charts[]` locally; session syncs in parallel via `replaceAutoDashboardCharts`.

### AI answer state

| Concern | Source of truth |
|---------|-----------------|
| Answer text | Live `answer`; durable `aiAnswerByChartId[chartId]` |
| Structured analysis | Live `alignedAnalysis`; durable in same bundle |
| Thread | `conversationSnapshot` + `aiConversationState` |
| Chart scope for Q&A | `insightChartId` / lineage / bundle keyed by parent id when preserving pin |

### Metadata flow across surfaces

| Surface | Chart data | Titles / aggregation | Axes / semantics |
|---------|------------|----------------------|------------------|
| **Overview** | `autoDashboard` payload | `getCanonicalChartTitle` + snapshot `contract` for title | Local mini-card heuristics |
| **Charts** | `activeSnapshot` | `contract` / `contractDisplayTitle` | `buildChartAxisPresentationBundle` + viz |
| **AI Insights** | `insightSnapshot` | Same + `alignedAnalysis` (non-dashboard) | Insight pipeline (mirrors session) |
| **PDF** | `pdfSnap` by scope | Contract + `buildNormalizedVizMetadata` + trend sanitization | PDF axis merge + capture refs |

---

## 4. Semantic engine overview

### Aggregation-aware titles

- `normalizeAggregationKey` / `formatAggregationLabel` (`semantic-metric-engine.ts`)
- `freezeVisualizationContract` — metric labels, trend/comparison display titles
- `getCanonicalChartTitle` (`canonical-chart-title.ts`)
- Backend provenance + `analysis` fields

### Semantic metadata

- **`SemanticMetricContext`:** metric, dimension, aggregation, chart type — from columns/keys, not vertical nouns
- **`chart-semantic-metadata.ts`:** axis headers, category resolution
- **`normalized-viz-metadata.ts`:** title harmonization with aligned analysis
- **`fromAlignedAnalysis` / `fromAutoDashboardChart`:** API ↔ UI bridge

### Trend vs category

| | Trend | Category / comparison |
|--|--------|------------------------|
| **Detection** | Temporal labels, line/area, title “trend”, `inferVisualizationMode` | Bar/pie, “by dimension” |
| **Sort** | Disabled (`isTrendMode`) | `applyBarChartSort` |
| **Narrative** | `sanitizeNarrativeForTrendContract` | `buildChartNarrative` |
| **PDF** | Trend ranked signals; dimension validation | Category ranked signals |

Bar + temporal labels may upgrade to **line** in `freezeVisualizationContract`.

### Dynamic domain support

- Backend: `infer_dataset_kind`, domain-specific + generic auto-dashboard builders
- Semantic column mapping (product/sales/region/date scores)
- Frontend: `datasetKind` for KPIs/seeds; UI wording stays column/aggregation-based

---

## 5. Important shared helpers

| Module | Responsibility |
|--------|----------------|
| `selected-visualization.ts` | Freeze contract, trend mode, export validation, narrative sanitization |
| `final-chart-presentation.ts` | Deterministic chart kind/orientation |
| `semantic-metric-engine.ts` | Semantic context, aggregation labels, follow-up templates |
| `canonical-chart-title.ts` | Display titles, trend grain |
| `chart-semantic-metadata.ts` | Axis labels, PDF axis helpers |
| `normalized-viz-metadata.ts` | Title inference, analysis alignment |
| `insight-aligned-axis-merge.ts` | Viz axes + `/ask` analysis merge |
| `trend-visualization.ts` | Trend axes, executive facts, PDF signals |
| `chart-axis-layout.ts`, `chart-time-x-axis.ts` | Margins, temporal ticks |
| `chart-layout-config.ts` | Heights, timeline ↔ kind |
| `smart-chart-intelligence.ts` | Routing, API string ↔ kind |
| `ux-narrative.ts`, `ai-follow-up-suggestions.ts` | Narrative sections, follow-up chips |
| `chart-insight-answers.ts` | Per-chart answer store |
| `insight-confidence.ts` | Confidence from analysis |
| `pdf-report.ts` | Executive PDF generation |
| `hydrateVisualizationFromApi` (`page.tsx`) | API viz → stored viz + rows |

---

## 6. Risky areas / regression-prone flows

### Overview → Ask AI

- Clears `alignedAnalysis` until user runs Ask; export narrative incomplete beforehand.
- `preservePinnedChart` must not call `pushAIChart` and replace series.
- Trend narrative sanitization must not leak category dimension wording.

### Chart synchronization

- Dual path: Overview (`autoDashboard`) vs session (`replaceAutoDashboardCharts`).
- Filter refresh replaces auto-dashboard snapshot ids (title-keyed linking).
- `selectChart` syncs active + insight; `setActiveChart` exists but is unused — do not use alone.

### AI answer persistence

- Global `alignedAnalysis` vs `aiAnswerByChartId` — chart switch must restore bundle.
- Question edit without re-ask invalidates export unless text matches stored question.
- Bundle saved on **lineage parent** id, not always new AI chart id.

### PDF export consistency

- Third axis/title pipeline in `downloadReportImplRef`.
- `validateExportMatchesContract` blocks on presentation drift.
- Requires mounted off-screen chart; wrong `chartScope` pairs wrong chart/answer.

### Trend chart preservation

- Contract `mode: "trend"` must drive sort, axes, and PDF branches consistently.
- `preservePinnedChart` must not reintroduce category axis semantics into analysis overlay.

---

## 7. Architectural decisions already implemented

| Decision | Implementation |
|----------|----------------|
| Pinned visualization / contract | `freezeVisualizationContract`; `validateExportMatchesContract` on export |
| Unified chart pin | `selectChart` sets active + insight together |
| Dynamic aggregation labels | `formatAggregationLabel`, trend metric labels, `analytics_metadata` |
| Metadata-driven charts | Backend viz from mapped columns; frontend hydrates |
| Domain-agnostic wording | Semantic engine; no dataset literals in follow-up chips |
| Deterministic presentation | `computeFinalChartPresentation` (Overview has parallel local path) |
| Follow-up support | `conversation_context`, backend routing, UI chips/meta |
| Ask without rebuild | `preservePinnedChart` + per-chart answer store |
| Performance | Memoized overview slots, `useTransition` for tabs, dev render counts |
| Horizontal bar preservation | Kind locked in presentation layer |

---

## 8. Key files for debugging

| File | Controls |
|------|----------|
| `frontend/app/page.tsx` | Tabs, `askAI`, filters, session/insight memos, export, hydration/parsing |
| `frontend/contexts/chart-session-context.tsx` | History, active/insight ids, `pushAIChart`, contracts |
| `frontend/lib/selected-visualization.ts` | `VisualizationContract`, freeze/validate/trend narrative |
| `frontend/lib/final-chart-presentation.ts` | Chart kind/orientation |
| `frontend/lib/semantic-metric-engine.ts` | Semantic context, aggregation, follow-ups |
| `frontend/lib/chart-semantic-metadata.ts` | Axis labels, headers |
| `frontend/lib/trend-visualization.ts` | Trend UX and PDF signals |
| `frontend/lib/chart-insight-answers.ts` | Per-chart Q&A persistence |
| `frontend/app/components/home/chart-renderer.tsx` | Recharts + capture target |
| `frontend/app/pdf-report.ts` | PDF document |
| `frontend/app/components/home/charts-timeline-aside.tsx` | Chart history selection |
| `frontend/app/components/ai-insight-chart-shell.tsx` | Insights chart chrome |
| `frontend/app/components/home/filter-panel.tsx` | Dashboard filters |
| `backend/main.py` | Upload, dashboard, `/ask`, viz, follow-ups, Claude |
| `backend/analytics_metadata.py` | Server-side label rules |
| `AGENTS.md` (repo root) | Product baseline: charts, filters, PDF alignment constraints |

---

## Quick reference: tab → state → API

| Tab | Primary state | Backend |
|-----|---------------|---------|
| Overview | `autoDashboard`, filters, linked `chartHistory` | `/upload`, `/filtered-dashboard` |
| Preview | `preview`, `columns` | `/preview` |
| AI Insights | `question`, `answer`, `insightSnapshot`, conversation | `/ask` |
| Charts | `activeSnapshot`, `chartHistory` | (session only) |
| Export | `exportOptions`, capture refs | (client PDF) |

---

## Change checklist (regression prevention)

When changing chart behavior, verify **all** of:

- [ ] `freezeVisualizationContract` / `computeFinalChartPresentation`
- [ ] Overview link (title key) + Charts + AI Insights memos
- [ ] `preservePinnedChart` and per-chart bundles
- [ ] PDF export (`chartScope`, contract validation, capture)
- [ ] Trend vs category branches (sort, axes, narrative, ranked signals)

---

*Last documented from codebase inspection. No application code changes implied by this file.*
