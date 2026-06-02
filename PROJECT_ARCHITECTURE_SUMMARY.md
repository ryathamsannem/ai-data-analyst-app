# AI Data Analyst App — Project Architecture Summary

**Status:** Current implementation snapshot (May 2026)  
**Source of truth:** Running codebase — not aspirational design.

**Related:** [`AGENTS.md`](AGENTS.md) · [`CURRENT_UI_BASELINE.md`](CURRENT_UI_BASELINE.md) · [`UI_BASELINE_RULES.md`](UI_BASELINE_RULES.md) · [`DATA_PREVIEW_STABLE_SUMMARY.md`](DATA_PREVIEW_STABLE_SUMMARY.md) · [`AI_INSIGHTS_STABLE_SUMMARY.md`](AI_INSIGHTS_STABLE_SUMMARY.md) · [`CHARTS_STABLE_SUMMARY.md`](CHARTS_STABLE_SUMMARY.md) · [`PDF_EXPORT_STABLE_BASELINE.md`](PDF_EXPORT_STABLE_BASELINE.md)

---

## 1. Stack overview

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4, Recharts 3 |
| Backend | FastAPI, pandas (in-memory `df` per process) |
| AI narrative | Claude (`claude-haiku-4-5`) via `POST /ask` |
| Chart data | Deterministic pandas aggregation (not LLM-generated series) |
| PDF | jsPDF + Canvg (`frontend/app/pdf-report.ts`) |
| Persistence | Client-only: theme, sidebar collapse, report branding (localStorage) |

### Repository layout

```
frontend/
  app/
    layout.tsx                 → fonts, ThemeScript, globals.css
    page.tsx                   → single client SPA (~12.5k lines): all tabs + logic
    pdf-report.ts              → PDF export engine
    chart-types.ts             → ChartKind, ChartRow
    components/
      app-shell/               → sidebar, header, workspace
      home/                    → filters, charts, overview, data preview
      ai-insight-chart-shell.tsx, SmartChartInsightPanel.tsx, …
  contexts/chart-session-context.tsx
  lib/                         → tab tokens, chart pipeline, data-preview-* modules

backend/
  main.py                      → all HTTP routes (~11k lines)
  analytics_metadata.py        → metric/chart title builders
  services/file_parsers.py     → CSV, Parquet, JSON/JSONL parsing
```

---

## 2. Frontend architecture

### Entry and navigation

- **Single route:** `frontend/app/page.tsx` — no per-tab URLs.
- **Shell:** `AppShell` (`components/app-shell/app-shell.tsx`) — collapsible sidebar + sticky header + scrollable main.
- **Tab switching:** `activeTab: MainNavTabId` in `HomeInner`, wrapped in `useTransition`.
- **Nav IDs:** `overview` · `preview` · `insights` · `charts` · `export` (`main-nav-tabs.tsx`).

`Home` → `ChartSessionProvider` → `HomeInner`.

### Monolithic SPA pattern

Almost all business logic lives in `page.tsx`:

| Concern | Location |
|---------|----------|
| Upload / mapping | `page.tsx` + mapping modal |
| Filters | `FilterPanel` + local state in `HomeInner` |
| Overview KPI + auto-dashboard | `page.tsx` + `overview/` components |
| Data Preview table | `page.tsx` + extracted preview components |
| AI Insights | `page.tsx` + insight shell components |
| Charts timeline | `page.tsx` + `charts-timeline-aside.tsx` |
| Export / PDF | `page.tsx` + `pdf-report.ts` |

Extracted components handle reusable UI shells; state remains local except chart session.

### Tab entry regions (`page.tsx`)

| Tab | Condition | Approx. lines |
|-----|-----------|---------------|
| Shared filters | `overview` or `insights` when dataset loaded | ~10005 |
| Overview | `activeTab === "overview"` | ~10058 |
| Data Preview | `activeTab === "preview" && columns.length > 0` | ~10643 |
| Charts | `activeTab === "charts"` | ~11033 |
| AI Insights | `activeTab === "insights"` | ~11201 |
| Export | `activeTab === "export"` | ~12047 |

---

## 3. Backend architecture

### Session model

In-memory globals in `main.py`: `df`, `uploaded_file_bytes`, `dataset_profile`, `column_mapping`, `selected_sheet_name`. **One active dataset per server process.**

### HTTP endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/` | Health check |
| `POST` | `/upload` | Parse file, profile, semantic mapping, dashboard payload |
| `POST` | `/select-sheet` | Excel sheet switch |
| `POST` | `/preview` | Row preview slice (not filter-aware) |
| `POST` | `/update-column-mapping` | User column role overrides |
| `POST` | `/filtered-dashboard` | KPIs + auto-dashboard on filtered slice |
| `POST` | `/ask` | AI Insights — pandas viz + Claude narrative |

Frontend calls `http://localhost:8000/` directly (no Next.js API proxy).

### File parsing

| Format | Handler |
|--------|---------|
| CSV | `file_parsers.py` → `load_dataframe_from_upload` |
| Parquet | Same (requires `pyarrow`) |
| JSON / JSONL | Same + `_flatten_json_dataframe()` for nested objects |
| Excel | `main.py` — sheet scoring, header detection, `read_sheet_from_excel` |

### Dataset profile

`build_profile(df)` returns:

- `column_types`: `number` | `date` | `text` | `category`
- `null_counts`
- `summary_stats` (numeric columns)

Used by Data Preview headers, sort compare, and AI context.

### Filters (backend)

- `DashboardFilterEntryModel` — equality on column value
- `DashboardDateRangeModel` — inclusive date range
- `apply_dashboard_filters_to_df()` — AND-combined; used on `/filtered-dashboard` and `/ask`
- **`/preview` does not apply dashboard filters** — returns raw loaded rows

---

## 4. Dataset upload flow

```
User picks file (Overview upload card)
  → assignOverviewPickedFile / drag-drop
  → uploadFile() POST /upload (multipart)
  → Backend: parse → clean_dataframe → build_profile → semantic column mapping
  → Response: columns, rows, preview (15 rows), profile, kpis, auto_dashboard,
              suggested_questions, column_mapping, dimension_options
  → Frontend: set state, push auto-dashboard charts to ChartSession,
              fetchPreviewRows(10), activeTab stays / user navigates
```

**Supported extensions:** `.csv`, `.xlsx`, `.xls`, `.json`, `.jsonl`, `.parquet`  
**Replace file:** Overview only — `openOverviewReplaceUpload()` expands upload UI.

**Column mapping:** Modal when confidence low; `POST /update-column-mapping` persists roles (`product`, `sales`, `date`, etc.).

---

## 5. Overview tab architecture

### States

| State | UI |
|-------|-----|
| Empty (`columns.length === 0`) | Upload card — dropzone, format chips, **Upload Dataset** (disabled until file selected) |
| File selected, not uploaded | `OverviewUploadSelectedState` — compact confirmation |
| Dataset ready | Full-width dataset summary card + Replace file; upload card hidden unless replacing |

### Post-upload content

- **Interactive filters** — `FilterPanel` with `overviewFilterCompact={true}` (~43px compact row via `.overview-interactive-filters`)
- **KPI grid** — `OverviewKpiCard`
- **Auto-dashboard charts** — `OverviewDashboardChartSlot` (360px mini charts, separate presentation pipeline)
- **AI summary** — `OverviewAiSummaryPanel`

### Tokens

`frontend/lib/overview-ui.ts` — cards, upload dropzone, filter controls, KPI typography.

### Backend

`/upload`, `/filtered-dashboard`, `/select-sheet`, `/update-column-mapping`

---

## 6. Data Preview tab architecture

### Purpose

Row-level inspection: paginated table, column quality signals, search, sort, copy — **no filter bar**.

### Component hierarchy

```
activeTab === "preview"
└─ section
   ├─ Header: title + Rows-per-page select (10/25/50/100/All)
   ├─ DataPreviewDatasetContext (full-width metadata strip)
   ├─ Search toolbar (dpSearchWrap ~68% on lg+)
   ├─ AI suggested questions panel (optional)
   ├─ Column quality notes panel (optional)
   └─ dpTableShell → dpTableScroll → table
       ├─ DataPreviewColumnHeader (per column: sort + profile)
       ├─ DataPreviewCopyCell (non-null values)
       └─ NULL cells (pill only)
   └─ Pagination footer
```

### Extracted components

| Component | Path |
|-----------|------|
| `DataPreviewDatasetContext` | `data-preview-dataset-context.tsx` |
| `DataPreviewColumnHeader` | `data-preview-column-header.tsx` |
| `DataPreviewCopyCell` | `data-preview-copy-cell.tsx` |
| `DataPreviewSortIcon` | `data-preview-sort-icons.tsx` |

### Logic modules

| Module | Role |
|--------|------|
| `lib/data-preview-ui.ts` | Tailwind token strings |
| `lib/data-preview-sort.ts` | Sort cycle + typed compare |
| `lib/data-preview-missing.ts` | `isMissingValue`, search tokens |
| `globals.css` | `.data-preview-*` table, pagination, scrollbars |

### Row loading

`fetchPreviewRows(limit)` → `POST /preview` with `row_limit`. Initial upload loads 10 rows; user changes via Rows dropdown.

---

## 7. Search system (Data Preview)

| Piece | Implementation |
|-------|----------------|
| Input state | `dataPreviewSearchQuery` |
| Deferred filter | `useDeferredValue(deferredDataPreviewSearch)` |
| Row match | `previewRowMatchesSearch` — scans all columns |
| Token helper | `previewCellSearchToken()` — missing → `"null"` |
| Highlight | `highlightSearchInText` in matching cells |
| Reset | Clears on sheet / file change |

**Pipeline position:** `preview` → **filter** → sort → paginate → render

Search applies to **loaded preview rows only**, not full backend dataset beyond fetched window.

---

## 8. Sorting system (Data Preview)

| Piece | Implementation |
|-------|----------------|
| State | `dataPreviewSort: { column, direction: "asc" \| "desc" } \| null` |
| Cycle | `cycleDataPreviewSort` — asc → desc → clear |
| Apply | `sortDataPreviewRows(filteredRows, sort, profile.column_types)` |
| Compare | Type-aware: numeric, date, locale text; missing sorts last |
| UI | `DataPreviewColumnHeader` — title row sorts; badge row opens profile |
| Reset page | `setDataPreviewPageIndex(0)` on sort change |

**Pipeline position:** preview → filter → **sort** → paginate → render

---

## 9. Pagination system (Data Preview)

| Piece | Implementation |
|-------|----------------|
| Active when | `previewRowLimit !== "all"` |
| Page size | Equals rows-per-page select value |
| Page count | `ceil(filteredCount / pageSize)` |
| Slice | `dataPreviewSortedRows.slice(start, start + pageSize)` |
| Controls | Previous / pill `N / M` / Next — hidden when `pageCount <= 1` |
| Footer copy | Single page: `Showing all {N} rows`; multi: `Showing 1–25 of 100 rows · Page 1 of 4` |
| Static footer | `.data-preview-pagination__inner--static` when no pager |
| Reset page | On search, sort, rows-per-page, sheet/file change |

**All rows mode:** No pager; footer shows `Showing all {N} rows`.

---

## 10. AI Insights architecture

### Layout

Two-column grid: suggested questions + Ask AI / answer / visualization stack.

### Flow

```
User question → POST /ask
  → apply_dashboard_filters_to_df (same filters as Overview)
  → compute_visualization_for_question (pandas)
  → Claude narrative (_generate_insight_narrative)
  → pushAIChart → ChartSession
  → Render: answer body + AiInsightChartShell + SmartChartInsightPanel
```

### Gates

- `insightChartMatchesCurrentQuestion` / `chartSnapshotMatchesQuestionIntent` before viz, AI Read, export
- `showInsightExportButton` when valid answer + aligned viz

### Components

| Component | Role |
|-----------|------|
| `AiInsightChartShell` | Insight chart frame + PDF capture |
| `SmartChartInsightPanel` | “AI Read on this chart” |
| `AiInsightAnswerBody` | Parsed answer rendering |
| `AiExecutiveInsightsPanel` | Executive insight cards |

### Filters

Full-height `FilterPanel` (`appearance="dashboard"`, 52px) — not compact Overview mode.

### Tokens

`frontend/lib/ai-insights-ui.ts` + `.ai-insights-page` CSS layers.

---

## 11. Charts tab architecture

### Layout

Timeline column (~23%) + session preview (`1fr`) at `lg+`.

### Data source

`ChartSessionProvider` only — no direct backend fetch on tab switch.

| Source | Entry |
|--------|-------|
| AI Insights | `pushAIChart` |
| Overview auto-dashboard | `replaceAutoDashboardCharts` |

### Components

| Component | Role |
|-----------|------|
| `ChartsTimelineAside` | AI vs Auto sections, scroll preserve |
| `ChartsTabIntelligenceStrip` | Source, type, measure metadata |
| `ChartsTabChartReason` | “Why this chart” copy |
| `ChartRenderer` | Recharts (`insightMode=false`) |

### Rendering

`renderDatasetChart()` → `ChartInsightViewportWrapper` → `ChartRenderer`  
Session viewport cap ≤860px; shared `computeFinalChartPresentation`.

---

## 12. Export / PDF architecture

### UI

Export tab — section toggles, branding fields, preview summary (`export-tab-ui.ts`).

### Engine

| File | Role |
|------|------|
| `pdf-report.ts` | `runExecutivePdfExport`, jsPDF + Canvg |
| `pdf-enterprise-style.ts` | Layout tokens, footer, typography |
| `pdf-date-format.ts` | ISO date normalization |

### Capture

Off-screen DOM refs at 860px: `chartCaptureSessionRef`, `chartCaptureInsightRef`.  
Native table draw for Data Preview appendix (`drawPdfDataPreviewTable`).  
Print-safe light theme independent of app dark mode.

### Validation

`validateExportMatchesContract` before export.

---

## 13. Shared components

| Component | Used by |
|-----------|---------|
| `AppShell` / `AppSidebar` / `AppHeader` | All tabs |
| `FilterPanel` | Overview, AI Insights |
| `ChartRenderer` | Charts, AI Insights, Overview (separate path), PDF capture |
| `ChartInsightViewportWrapper` | Charts, AI Insights |
| `AiInsightChartShell` | AI Insights, PDF |
| `SmartChartInsightPanel` | AI Insights, Charts |
| `ChartContextSummary` | Chart metadata chips |

### Design token modules

| Module | Scope |
|--------|-------|
| `overview-ui.ts` | Overview + shared dataset cards |
| `data-preview-ui.ts` | Data Preview |
| `ai-insights-ui.ts` | AI Insights |
| `charts-tab-ui.ts` | Charts |
| `export-tab-ui.ts` | Export |
| `ui-buttons.ts` | Shared button variants |
| `globals.css` | CSS variables, `.data-preview-*`, `.overview-interactive-filters`, theme |

---

## 14. State management

### React Context (one)

`ChartSessionProvider` (`chart-session-context.tsx`):

| API | Behavior |
|-----|----------|
| `pushAIChart` | Dedupe by semantic intent; freeze contract |
| `selectChart` | `activeId` + `insightChartId` |
| `replaceAutoDashboardCharts` | Sync Overview mini charts |
| `clearAiInsightSession` | Remove AI-sourced charts |
| `invalidateForDatasetChange` | Reset on upload/mapping change |

### Local state in `HomeInner` (selected)

| Bucket | Keys |
|--------|------|
| Navigation | `activeTab` |
| Dataset | `file`, `uploadMeta`, `profile`, `columns`, `rows`, `preview`, `sheets`, `selectedSheet` |
| Mapping | `productColumn`, `salesColumn`, `dateColumn`, …, `mappingModalOpen` |
| Filters | `dashboardFilters`, `dashDateStart`, `dashDateEnd`, `dimensionOptions` |
| AI | `question`, `answer`, `aiAnswerByChartId`, `loading`, `conversationSnapshot` |
| Data Preview | `previewRowLimit`, `dataPreviewSearchQuery`, `dataPreviewSort`, `dataPreviewPageIndex`, `dataPreviewProfileOpen` |
| Export | `exportOptions`, report branding (localStorage) |

### Performance patterns

`React.memo`, `useMemo`, `useCallback`, `useDeferredValue` (preview search), `useTransition` (tab switch).

---

## 15. Chart rendering — two pipelines

### Pipeline A — Shared (Charts, AI Insights, PDF)

`computeFinalChartPresentation` → `ChartRenderer` with contract from `selected-visualization.ts`.

### Pipeline B — Overview auto-dashboard only

`computeOverviewDashboardChartPresentation` — 360px mini charts, stricter category caps.  
**Do not** merge into Pipeline A without explicit approval.

---

## 16. Cross-tab dataset metadata

| Tab | Dataset UI |
|-----|------------|
| Overview | Full card + Replace file |
| Data Preview | `DataPreviewDatasetContext` — same grid, no Replace; full filename with wrap |
| AI Insights | Header badge only |
| Charts | None |
| Export | Report summary rows/columns |

---

## 17. Critical file index

| Need | Path |
|------|------|
| Main SPA | `frontend/app/page.tsx` |
| App shell | `frontend/components/app-shell/` |
| Chart session | `frontend/contexts/chart-session-context.tsx` |
| Filters | `frontend/app/components/home/filter-panel.tsx` |
| Data Preview sort/missing | `frontend/lib/data-preview-sort.ts`, `data-preview-missing.ts` |
| Data Preview UI | `frontend/lib/data-preview-ui.ts`, `globals.css` |
| Backend API | `backend/main.py` |
| File parsers | `backend/services/file_parsers.py` |
| PDF | `frontend/app/pdf-report.ts` |

---

*Last updated: 2026-05-27 — reflects Data Preview search, sort, pagination, copy, and normalized NULL handling.*
