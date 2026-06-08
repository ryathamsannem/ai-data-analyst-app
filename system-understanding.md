# System Understanding

**Generated:** June 8, 2026  
**Audience:** New Cursor chat / engineer onboarding

---

## Stack overview

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind v4, Recharts 3 |
| Backend | FastAPI, pandas (in-memory `df` per process) |
| AI narrative | Claude Haiku via Anthropic SDK (`POST /ask`) |
| Chart data | Deterministic pandas aggregation — **not** LLM-generated series |
| PDF | jsPDF + Canvg (`frontend/app/pdf-report.ts`) |
| PNG | Canvg + canvas 2D composite (`frontend/lib/chart-png-capture.ts`) |
| Persistence | Client-only: theme, sidebar, session ID, plan tier, PDF branding (`localStorage`) |

**Single route:** `frontend/app/page.tsx` — all tabs in one SPA (~14k lines).

---

## Frontend architecture

### Shell and navigation

```
app/layout.tsx
  └── AppShell (sidebar + header)
        └── page.tsx → Home → ChartSessionProvider → HomeInner
```

| Tab ID | Label | Primary concern |
|--------|-------|-----------------|
| `overview` | Overview | KPIs, filters, auto-dashboard mini charts |
| `preview` | Data Preview | Table search/sort/pagination |
| `insights` | AI Insights | Ask AI, answer, aligned chart |
| `charts` | Charts | Timeline + session chart preview |
| `export` | Export | PDF section checkboxes + download |

Nav: `frontend/app/components/home/main-nav-tabs.tsx`

### State ownership

| State | Location | Scope |
|-------|----------|-------|
| Dataset, filters, mapping, tabs | `HomeInner` in `page.tsx` | App session |
| Chart history, active chart | `ChartSessionProvider` | Cross-tab chart session |
| AI answers per chart | `aiAnswerByChartId` in `page.tsx` | Insights + Charts |
| Plan tier / usage | `page.tsx` + `use-plan-usage.ts` | Mock SaaS |
| Theme / sidebar | `lib/theme.ts`, `lib/sidebar-prefs.ts` | Browser |

### Chart pipelines (two paths — do not merge)

**1. Overview mini charts (360px band)**

- Separate compact Recharts path in `OverviewAutoDashboardChartCard` (`page.tsx`)
- Uses `computeOverviewDashboardChartPresentation()` — overview-only rules
- PNG export uses **offscreen** `ChartRenderer` clone at export dimensions

**2. Shared session pipeline (Charts / AI Insights / PDF capture)**

```
POST /ask visualization
  → final-chart-presentation.ts
  → selected-visualization.ts
  → chart-renderer.tsx
```

Shells: `AiInsightChartShell`, `ChartInsightViewportWrapper`, `SmartChartInsightPanel`

**Alignment gates (must pass before viz/export):**

- `insightChartMatchesCurrentQuestion`
- `chartSnapshotMatchesQuestionIntent`

---

## Backend architecture

### Entry point

`backend/main.py` — all HTTP routes (~15.8k lines)

### Key endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness |
| `GET` | `/ready` | Readiness (503 in prod without API key) |
| `GET` | `/plan`, `/usage` | Plan tier + usage envelope |
| `POST` | `/usage/pdf-export` | Reserve PDF quota |
| `POST` | `/upload` | Parse file, profile, mapping, auto-dashboard |
| `POST` | `/select-sheet` | Excel sheet switch |
| `POST` | `/preview` | Raw row preview (not filter-aware) |
| `POST` | `/update-column-mapping` | Column role overrides |
| `POST` | `/filtered-dashboard` | KPIs + dashboard on filtered slice |
| `POST` | `/ask` | AI Insights — viz + narrative |

### Intent engine

```
backend/intent_engine/attach.py
  → enrich_analysis_with_intent()
  → resolve_analysis_intent.py
```

Key modules: `routing_plan.py`, `confidence_scoring.py`, `correlation_routing_guard.py`, `executive_lens.py`, `geographic_scope.py`, `column_resolve.py`

Disable: `INTENT_ENGINE_DISABLE=true`

### Session model (critical)

- **Single global `df`** per backend process — last upload wins
- Usage counters in-memory per `X-Session-Id` header
- **Not multi-tenant** — parallel users share/overwrite dataset

---

## AI Insights flow

```
User types question (AI Insights tab)
  │
  ├─ Frontend builds payload:
  │    question, filters, column_mapping, continuation_intent,
  │    parent_analysis_context, thread metadata
  │    (ai-conversation-context.ts)
  │
  ├─ POST /ask
  │    ├─ Plan limit check (record_ai_question)
  │    ├─ compute_visualization_for_question()
  │    │    ├─ intent_engine enrichment
  │    │    ├─ correlation routing pack (early)
  │    │    └─ pandas aggregation → visualization JSON
  │    ├─ _generate_insight_narrative() → Claude
  │    └─ Returns { answer, visualization, alignedAnalysis, routingPlan, … }
  │
  ├─ Frontend stores answer in aiAnswerByChartId
  ├─ pushAIChart() → chart session timeline
  ├─ Gates: question match + chart intent match
  └─ Render: answer prose + ChartRenderer + SmartChartInsightPanel
```

**Narrative is LLM-generated; chart values are pandas-grounded.** Frontend gates prevent stale chart display.

---

## Chart rendering flow

### On-screen (Charts / Insights)

```
chartRows + presentationKind
  → computeCartesianCategoryPlanForRender() [bar/line/area]
  → computeHorizontalBarAxisLayout() [h-bar]
  → ChartRenderer (Recharts)
```

Layout helpers: `chart-axis-layout.ts`, `chart-time-x-axis.ts`, `chart-layout-config.ts`, `trend-visualization.ts`

### Overview mini charts

Inline Recharts in `OverviewAutoDashboardChartCard` with compact margins (`overview-ui.ts`).

### Presentation kind resolution

`final-chart-presentation.ts` — harmonizes API chart type, question phrasing, row shape (e.g. rate metrics avoid donut default).

---

## Export flow

### PNG (chart card)

```
User clicks PNG (Overview or Charts tab)
  │
  ├─ setExportingPng(true) — button only, visible chart unchanged
  ├─ setOffscreenExportLayout(spec) — portal mounts
  ├─ ChartPngOffscreenHost (body portal, left: -12000px)
  │    └─ ChartRenderer at export dimensions, pngCaptureMode=true
  ├─ runChartPngExport()
  │    ├─ waitForOffscreenChartReady()
  │    ├─ prepareChartForPngCapture() — disable Recharts animation
  │    └─ captureElementToPng()
  │         ├─ renderHeaderChromeToPng() — title, warning, chips (canvas)
  │         ├─ renderPlotSvgToPng() — Canvg from SVG
  │         └─ compositeExportPng() — card frame, shadow, footer
  └─ Browser download .png
```

Sizing: `chart-png-export-layout.ts` — line 1200×800, h-bar 1100×900 (≤10 cats) / 1300×900 (>10).

### PDF (executive report)

```
Export tab checkboxes OR AI Insights export button
  │
  ├─ buildExecutivePdfExportInput() — contract validation
  ├─ reservePdfExport() — quota (free: 1/day)
  ├─ runExecutivePdfExport() — pdf-report.ts
  │    ├─ Off-screen capture refs (860px): chartCaptureSessionRef, chartCaptureInsightRef
  │    ├─ jsPDF pages: cover, snapshot, KPIs, insight, conversation, viz, appendix
  │    └─ Canvg chart images centered at 860px
  └─ Download .pdf (refund quota on failure — implemented)
```

---

## Session management

### Chart session (frontend)

`frontend/contexts/chart-session-context.tsx`

| Action | Effect |
|--------|--------|
| `pushAIChart` | Add Insights result to timeline |
| `replaceAutoDashboardCharts` | Sync Overview auto-dashboard snapshots |
| `selectChart` | Activate chart in Charts tab |
| `clearAiInsightSession` | Reset Insights charts only |
| `invalidateForDatasetChange` | Clear on upload/mapping change |

### SaaS mock session (frontend → backend headers)

`frontend/lib/saas-session.ts`

- `X-Session-Id` — `localStorage` `ai-analyst-session-id`
- `X-Plan-Tier` — `localStorage` `ai-analyst-plan-tier` (**spoofable**)

### Backend dataset session

- Globals in `main.py`: `df`, `uploaded_file_bytes`, `column_mapping`, `dataset_profile`
- One active dataset per process — no server-side chart history

---

## Data flow (end-to-end)

```
Upload file
  → POST /upload
  → parse (file_parsers.py) → profile + column_mapping + auto_dashboard JSON
  → Frontend: columns, preview rows, KPIs, overview charts pushed to session

Apply filters (Overview/Insights)
  → POST /filtered-dashboard (filtered cohort)
  → Overview KPIs + mini charts refresh
  → Filters included in /ask payload

Ask AI
  → POST /ask with filters + mapping + thread context
  → pandas viz + Claude narrative
  → Chart session + Insights UI update

Export PNG
  → Offscreen portal render → canvas composite → download

Export PDF
  → build input from live state + captured chart refs → jsPDF
```

---

## Environment variables

| Variable | Layer | Purpose |
|----------|-------|---------|
| `ANTHROPIC_API_KEY` | Backend | Claude API (required in prod) |
| `APP_ENV` | Backend | `production` \| `development` |
| `ALLOWED_ORIGINS` | Backend | CORS (comma-separated) |
| `AI_NARRATIVE_ENABLED` | Backend | Toggle narrative |
| `NEXT_PUBLIC_API_BASE_URL` | Frontend | Backend URL |
| `NEXT_PUBLIC_AI_INSIGHTS_DEBUG` | Frontend | Debug panels |
| `INTENT_ENGINE_DISABLE` | Backend | Disable intent enrichment |

Template: [`.env.example`](.env.example)

---

## Baseline rules for changes

Read [`AGENTS.md`](AGENTS.md) before modifying Insights, Charts, or shared chart presentation:

- Do not redesign working dashboard regions
- Narrow fixes over broad rewrites
- Preserve `AiInsightChartShell` / viewport wrappers / filter alignment
- PNG/Insights gates must stay in place
