# AI Data Analyst App — Project Architecture Summary

**Recovery snapshot:** May 2026 — stable SaaS baseline **after** UI refinements and **PDF Export Phase 2** (enterprise PDF layout, native preview table, appendix polish, footer). Checkpoint branch: `stable/pdf-export-phase2` · backup: `project_backups/stable_export_pdf_phase2_backup_2026-05-21/`.

**PDF baseline:** [`PDF_EXPORT_STABLE_BASELINE.md`](PDF_EXPORT_STABLE_BASELINE.md) · **Recovery:** [`RECOVERY_INSTRUCTIONS.md`](RECOVERY_INSTRUCTIONS.md)

**Agent rules:** [`AGENTS.md`](AGENTS.md) · **UI rules:** [`UI_BASELINE_RULES.md`](UI_BASELINE_RULES.md)

**Tab deep-dives:** [`CHARTS_STABLE_SUMMARY.md`](CHARTS_STABLE_SUMMARY.md) · [`DATA_PREVIEW_STABLE_SUMMARY.md`](DATA_PREVIEW_STABLE_SUMMARY.md) · [`AI_INSIGHTS_STABLE_SUMMARY.md`](AI_INSIGHTS_STABLE_SUMMARY.md) · [`UI_ARCHITECTURE_SNAPSHOT.md`](UI_ARCHITECTURE_SNAPSHOT.md) · [`LATEST_STABLE_UI_SNAPSHOT.md`](LATEST_STABLE_UI_SNAPSHOT.md) · [`AI_VISUALIZATION_BEHAVIOR.md`](AI_VISUALIZATION_BEHAVIOR.md)

---

## 1. Snapshot scope (what is complete)

| Area | Status |
|------|--------|
| Dark / light mode polish | Stable — `theme.ts`, `globals.css`, scoped Insights layers |
| Light mode consistency | Stable — slate cards, unified control chrome |
| Charts tab redesign + stabilization | Stable — timeline, preview, Why-this-chart, tight plot rhythm |
| Timeline / history | Stable — scroll body, section labels, preserve scroll on select |
| Smart chart layouts + alignment | Stable — shared viewport wrappers, centered plots |
| “Why this chart” | Stable — `ChartsTabChartReason` + `generate-chart-reason.ts` |
| Data Preview redesign | Stable — table, search, suggestions, compact dataset strip |
| Interactive filters | Stable — 52px dashboard bar on Overview + AI Insights |
| Button styling | Stable — `saas-btn-premium`, `saas-btn-accent`, `ovBtnSecondary` |
| Metadata card standardization | Stable — deduplicated per tab (see §6) |
| Dataset status + Replace file | Stable on **Overview** only; header badge elsewhere |
| Overview tab | Stable — KPI grid, auto-dashboard, upload/mapping UX |
| AI Insights layout | Stable — two-column grid, gates, viz stack |
| Chart container alignment | Stable — `ChartInsightViewportWrapper`, insight margins |
| Upload section cleanup | Stable — premium/accent buttons, mapping toast auto-hide |
| Typography + spacing | Stable — token modules per tab |

| Area | Status |
|------|--------|
| **Export / PDF** | **Stable baseline (Phase 2)** — enterprise polish; incremental fixes only |

---

## 2. Application architecture

### Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js App Router, React 19, Tailwind CSS v4, Recharts |
| Backend | FastAPI, pandas (in-memory `df` per process) |
| AI | Claude via `POST /ask`; chart series are **deterministic** (pandas) |
| Persistence | Client-only session (theme, sidebar, report branding in localStorage) |

### Repository layout

```
frontend/app/layout.tsx              → fonts, ThemeScript, globals.css
frontend/app/page.tsx                → single client SPA (~12k lines): all tabs + logic
frontend/app/pdf-report.ts           → jsPDF + Canvg (Export — stable Phase 2)
frontend/lib/pdf-enterprise-style.ts → PDF tokens, footer, chart embed sizing
frontend/lib/pdf-date-format.ts      → ISO date normalization in PDF
frontend/lib/metric-value-format.ts  → raw vs display metrics (appendix)
frontend/app/components/home/        → charts, filters, overview, data preview
frontend/app/components/               → insight shells, answer body, executive panel
frontend/components/app-shell/       → sidebar, header, workspace scroll
frontend/contexts/chart-session-context.tsx
frontend/lib/                        → chart contracts, axes, tab tokens, theme
backend/main.py                      → upload, filters, dashboard, preview, /ask
```

### Navigation

| Tab id | Label | Primary backend / source |
|--------|--------|---------------------------|
| `overview` | Overview | `/upload`, `/filtered-dashboard` |
| `preview` | Data Preview | `/preview` |
| `insights` | AI Insights | `/ask` |
| `charts` | Charts | `ChartSessionProvider` only |
| `export` | Export | Client PDF (`pdf-report.ts`) — **stable Phase 2** |

**No per-tab URLs** — `activeTab` in `HomeInner` inside `AppShell`.

---

## 3. Integration hub (`page.tsx`)

`Home` → `ChartSessionProvider` → `HomeInner`.

| Concern | Implementation |
|---------|----------------|
| Tabs | `activeTab`, `useTransition` on switch |
| Data | Upload, mapping modal, filters, `autoDashboard` |
| AI Insights | `askAI`, insight gates, answer parsing |
| Charts | `chartHistory`, timeline, `renderDatasetChart` session path |
| Export | `downloadReport`, capture refs — **stable Phase 2** |
| Viewport | `viewportH` / `viewportW` (resize debounce ~140ms) |

**Performance (preserve):** `React.memo`, `useMemo`, `useCallback`, `useDeferredValue` (Data Preview search).

### Tab entry anchors (search in `page.tsx`)

| Tab | Approx. region |
|-----|----------------|
| Shared filters | `activeTab === "overview" \|\| activeTab === "insights"` |
| Capture refs | Off-screen session + insight DOM |
| Overview | `activeTab === "overview"` |
| Data Preview | `activeTab === "preview"` |
| Charts | `activeTab === "charts"` |
| AI Insights | `activeTab === "insights"` |
| Export | `activeTab === "export"` |

---

## 4. Chart rendering — two pipelines

### Pipeline A — Shared `ChartRenderer` (Charts, AI Insights, PNG/PDF)

| File | Role |
|------|------|
| `chart-renderer.tsx` | Recharts; `insightMode` flag |
| `final-chart-presentation.ts` | `computeFinalChartPresentation` |
| `selected-visualization.ts` | Contract freeze, trend mode |
| `chart-axis-layout.ts` | Category plans, margins |
| `chart-time-x-axis.ts` | Line/area X ticks |
| `chart-layout-config.ts` | Insight plan widths, `resolveChartsTabPreviewPlotHeight` |
| `ai-insight-chart-shell.tsx` | Insight + PDF capture frame |
| `chart-insight-viewport-wrapper.tsx` | Plot centering |

| Mode | Viewport | Shell |
|------|----------|-------|
| Session (`insightMode=false`) | ≤ 860px effective | Charts preview card |
| Insight (`insightMode=true`) | 760/850/900px plan | `AiInsightChartShell` |

### Pipeline B — Overview auto-dashboard only

| File | Role |
|------|------|
| `OverviewAutoDashboardChartCard` in `page.tsx` | Local Recharts, 360px |
| `computeOverviewDashboardChartPresentation` | Stricter category caps |
| `overview-ui.ts` | `ovCard`, `ovChartGrid` |

**Do not** route Overview mini charts through `computeFinalChartPresentation` without explicit approval.

Full behavior: [`AI_VISUALIZATION_BEHAVIOR.md`](AI_VISUALIZATION_BEHAVIOR.md).

---

## 5. Session store

**File:** `frontend/contexts/chart-session-context.tsx`

| API | Behavior |
|-----|----------|
| `pushAIChart` | Dedupe by intent; freeze contract |
| `selectChart` | `activeId` + `insightChartId` |
| `clearAiInsightSession` | AI-sourced charts only |
| `replaceAutoDashboardCharts` | Sync Overview into timeline |

History resets on dataset / mapping change.

---

## 6. Dataset metadata — per-tab standard

| Tab | Dataset UI |
|-----|------------|
| **Overview** | Full `ovCard`: Dataset ready, File/Rows/Columns/Sheet, **Replace file** |
| **Data Preview** | `DataPreviewDatasetContext` — same inner grid, no Replace; extension-preserving truncation |
| **AI Insights** | **No** inline dataset card — filters only; status in **header** (“Dataset loaded”) |
| **Charts** | **No** top dataset card |
| **Export** | Report Preview Summary (rows/columns, viz status) — **no** duplicate filename card |

**Replace file:** `openOverviewReplaceUpload()` → Overview tab + expanded upload.

---

## 7. Filters (shared standard)

| Item | Rule |
|------|------|
| Component | `FilterPanel` (`filter-panel.tsx`) |
| Surfaces | Overview + AI Insights when `columns.length > 0` |
| Appearance | `appearance="dashboard"` |
| Height | **52px** unified control row |
| Date range | Single grouped bar (start · end), no redundant labels |

Tokens: `ovCard`, `ovFilterControl` from `overview-ui.ts`.

---

## 8. Theme and design language

| Piece | Location |
|-------|----------|
| Global tokens | `globals.css` `:root` / `.dark` |
| Theme toggle | `theme.ts`, `theme-script.tsx`, `theme-toggle.tsx` |
| Overview | `overview-ui.ts` |
| AI Insights | `ai-insights-ui.ts` + `.ai-insights-page` layers |
| Charts | `charts-tab-ui.ts` + shared `chart-viz-theme` |
| Data Preview | `data-preview-ui.ts` |
| Buttons | `ui-buttons.ts`, `.saas-btn-*` |

**Design language:** premium enterprise SaaS — `rounded-2xl` cards, restrained shadows, indigo/violet accent, `tabular-nums` on metrics, no heavy glassmorphism.

---

## 9. Export / PDF (stable Phase 2)

| Item | Current state |
|------|----------------|
| UI | Export tab — branding, toggles, preview summary (`activeTab === "export"`) |
| Engine | `pdf-report.ts` — `runExecutivePdfExport`, jsPDF + Canvg SVG-first embed |
| Tokens | `pdf-enterprise-style.ts` — spacing, typography, footer, empty states |
| Capture | `chartCaptureSessionRef`, `chartCaptureInsightRef` (off-screen) |
| Preview table | Native `drawPdfDataPreviewTable` (not screenshot) |
| Validation | `validateExportMatchesContract` before export |
| Theme | Print-safe light PDF (independent of app dark mode) |

**Full detail:** [`PDF_EXPORT_STABLE_BASELINE.md`](PDF_EXPORT_STABLE_BASELINE.md). Treat export as **frozen** unless user requests PDF changes.

---

## 10. Critical file index

### Shared UI

| Need | Path |
|------|------|
| Main SPA | `frontend/app/page.tsx` |
| App shell | `frontend/components/app-shell/` |
| Nav tabs | `frontend/app/components/home/main-nav-tabs.tsx` |
| Filters | `frontend/app/components/home/filter-panel.tsx` |
| Header status | `frontend/components/app-shell/app-header.tsx` |

### Charts

| Need | Path |
|------|------|
| Renderer | `frontend/app/components/home/chart-renderer.tsx` |
| Viewport | `frontend/app/components/home/chart-insight-viewport-wrapper.tsx` |
| Timeline | `frontend/app/components/home/charts-timeline-aside.tsx` |
| Why strip | `frontend/app/components/home/charts-tab-chart-reason.tsx` |
| Intel strip | `frontend/app/components/home/charts-tab-intelligence-strip.tsx` |
| Plot transition | `frontend/app/components/home/charts-tab-plot-transition.tsx` |
| Metadata chips | `ChartContextSummary` in `page.tsx` (~672) |
| Session | `frontend/contexts/chart-session-context.tsx` |
| Tokens | `frontend/lib/charts-tab-ui.ts`, `frontend/lib/ai-insights-ui.ts` |
| Layout | `frontend/lib/chart-layout-config.ts`, `frontend/lib/final-chart-presentation.ts` |
| Reason copy | `frontend/lib/generate-chart-reason.ts` |

### Data Preview

| Need | Path |
|------|------|
| Dataset strip | `frontend/app/components/home/data-preview-dataset-context.tsx` |
| Tokens | `frontend/lib/data-preview-ui.ts` |
| Tab JSX | `page.tsx` — `activeTab === "preview"` |

### Overview

| Need | Path |
|------|------|
| KPI / summary | `frontend/app/components/home/overview/` |
| Tokens | `frontend/lib/overview-ui.ts` |
| Heuristics | `frontend/lib/overview-chart-heuristics.ts` |

### AI Insights

| Need | Path |
|------|------|
| Chart shell | `frontend/app/components/ai-insight-chart-shell.tsx` |
| Answer body | `frontend/app/components/ai-insight-answer-body.tsx` |
| Executive panel | `frontend/app/components/ai-executive-insights-panel.tsx` |
| Smart read | `frontend/app/components/SmartChartInsightPanel.tsx` |
| Gates | `frontend/lib/chart-question-intent.ts` |

### Styling / theme

| Need | Path |
|------|------|
| Global CSS | `frontend/app/globals.css` |
| Theme | `frontend/lib/theme.ts` |
| Buttons | `frontend/lib/ui-buttons.ts` |

---

## 11. Known pending items

| Item | Notes |
|------|--------|
| PDF code-split | jsPDF/html2canvas still static import — optional optimization |
| Monolithic `page.tsx` | Structural extract optional; not blocking |
| No deep links per tab | By design today |
| Overview grid max-width | Optional 1600px cap — verify before changing |

See [`CURRENT_BUG_STATUS.md`](CURRENT_BUG_STATUS.md) for resolved vs remaining polish.

---

## 12. What must NOT change without explicit request

| Area | Why |
|------|-----|
| `computeFinalChartPresentation` (non-Overview) | Charts / Insights / PDF parity |
| Horizontal bar semantics | Product rule |
| Insight question–chart gates | Trust + export integrity |
| Charts tab layout (timeline + preview) | Stable baseline |
| Dataset deduplication per tab | UX standardization |
| Filter 52px dashboard appearance | Cross-tab alignment |
| Data Preview filename truncation | Extension preserved; size separated |

**Safe:** narrow bug fixes, token contrast, axis margin tuning, Export tab work when requested.

---

## 13. Recommended next work

1. Branch from **`stable/pdf-export-phase2`** for new features.
2. Regression: upload → filter → Insights → Charts timeline → PDF (all sections + appendix on/off).
3. Incremental only — see [`UI_BASELINE_RULES.md`](UI_BASELINE_RULES.md) and [`AGENTS.md`](AGENTS.md).

---

*Last updated: 2026-05-21 — PDF Export Phase 2 stable recovery point.*
