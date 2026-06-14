# AI Data Analyst App — Project Snapshot

**Generated:** June 8, 2026  
**Branch:** `DEV` (latest: `b2c1a47` — auto dashboard chart selection fixes)  
**Purpose:** Handoff for a new Cursor chat and external architecture review.

**Companion docs:** [`auto-dashboard-status.md`](auto-dashboard-status.md) · [`file-map.md`](file-map.md) · [`architecture-summary.md`](architecture-summary.md) · [`open-issues.md`](open-issues.md)

---

## Current project status

| Area | Status | Notes |
|------|--------|-------|
| **Pilot / single-user** | ✅ Ready | Upload → Overview → AI Insights → Charts → PDF/PNG export functional |
| **Public multi-user SaaS** | 🔴 Not ready | Global in-memory dataset; no auth; client-spoofable plan tier |
| **Frontend tests** | ✅ 261/261 Vitest pass | `npm run test` |
| **Frontend build** | ✅ Pass | `npm run build` (Next.js 16.2.4) |
| **Backend tests** | ✅ Green | `python run_tests.py -v` or `pytest tests/` |
| **Auto Dashboard** | ✅ Functional | Opportunity engine + diversity selection; recent layout/PNG/title fixes |
| **AI Insights** | ✅ Stable baseline | Deterministic chart routing + Claude narrative; regression packs in CI |
| **PDF Export** | 🟡 Functional | Phase 7 validation artifacts; polish incomplete in places |
| **PNG Export** | ✅ Functional | Offscreen capture; overview + Charts tab parity for orientation |
| **Usage Dashboard** | 🟡 Mock SaaS | In-memory counters; client plan tier header |

---

## Major completed features

### Data ingestion & profiling
- CSV, Parquet, JSON/JSONL upload with tier size caps
- Excel multi-sheet selection (`POST /select-sheet`)
- Semantic column mapping (product, sales, region, date, customer, profit)
- Dataset profile: dtypes, describe stats, column types

### Overview (Auto Dashboard)
- Domain-aware KPI cards (sales, HR, operations, generic)
- Deterministic auto-dashboard chart generation (no LLM)
- Opportunity discovery: trend, ranking, composition, correlation, compare, distribution
- Coverage-first chart selection with KPI deduplication
- Filter-aware refresh (`POST /filtered-dashboard`)
- Drill-down from chart bars to filters
- Two-column responsive chart grid with full-width solo last row (5/7/9 charts)
- Per-chart PNG export from dashboard cards

### AI Insights
- `POST /ask` — question → pandas visualization → Claude narrative
- Intent engine: metric/dimension resolution, correlation pack, confidence scoring
- Executive insight cards, follow-up suggestions, conversation context
- Frontend alignment gates (question match, intent match)
- Relationship scatter with Pearson/Spearman metadata

### Charts tab
- Chart session timeline (AI + auto-dashboard snapshots)
- Shared `ChartRenderer` with presentation contract
- PNG export per session chart

### Data Preview
- Paginated table (`POST /preview` — **not filter-aware**)
- Column quality insights, suggested questions, schema summary

### Export
- Executive PDF (jsPDF + Canvg composite charts)
- Section toggles (KPI, insight, chart, conversation, appendix)
- PDF quota reserve/refund flow
- Branding config (client `localStorage`)

### Usage & plan limits (mock)
- Free vs paid tier limits (AI questions, PDF exports, upload size)
- `GET /usage`, `POST /usage/pdf-export`, refund endpoint
- Header menu usage dashboard (`PlanUsageMenu`)

---

## Current architecture

### Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4, Recharts 3 |
| Backend | FastAPI, pandas (in-memory `df` per process) |
| AI narrative | Anthropic Claude (`claude-haiku-4-5`) via `POST /ask` |
| Chart data | **Deterministic pandas** — not LLM-generated numbers |
| PDF | jsPDF + Canvg in `frontend/app/pdf-report.ts` |
| PNG | Canvg plot + canvas 2D composite in `chart-png-capture.ts` |
| Persistence | Client-only: theme, sidebar, branding, chart session |

### Repository layout

```
AI-Data-Analyst-App/
├── frontend/                 # Next.js SPA (single route `/`)
├── backend/                  # FastAPI monolith + intent_engine/
├── docs/                     # Deployment, QA, validation PDFs/screenshots
├── project-snapshot.md       # This file
├── auto-dashboard-status.md
├── file-map.md
├── architecture-summary.md
├── open-issues.md
├── bug-inventory.md          # Full severity-ranked bug list
├── deployment-readiness.md   # Pilot vs prod verdict
└── AGENTS.md                 # Agent baseline rules
```

### Session model (critical)

- **One active dataset per backend process** — globals `df`, `dataset_profile`, `column_mapping`
- Usage tracked in-memory per `X-Session-Id` header (not durable across restarts)
- Chart history lives in browser (`ChartSessionProvider`)

---

## Backend services

| Module | Path | Role |
|--------|------|------|
| **API monolith** | `backend/main.py` | All HTTP routes, upload, KPIs, auto-dashboard, `/ask` viz pipeline, Claude prompts |
| **Auto dashboard engine** | `backend/services/auto_dashboard_opportunities.py` | Column inventory, opportunity discovery, diversity selection |
| **File parsers** | `backend/services/file_parsers.py` | CSV, Parquet, JSON parsing |
| **Usage tracker** | `backend/services/usage_tracker.py` | In-memory AI/PDF counters |
| **Plan limits** | `backend/services/plan_limits.py` | Tier limit definitions |
| **SaaS context** | `backend/services/saas_context.py` | Session/plan from headers |
| **CORS** | `backend/services/cors_config.py` | `ALLOWED_ORIGINS` parsing |
| **Readiness** | `backend/services/readiness.py` | `/ready` health checks |
| **Intent engine** | `backend/intent_engine/` | Question patterns, routing, correlation, confidence, narratives |
| **Analytics metadata** | `backend/analytics_metadata.py` | Chart titles, metric labels |

### Key HTTP endpoints

| Method | Path | Role |
|--------|------|------|
| `POST` | `/upload` | Parse file, profile, mapping, KPIs, `auto_dashboard` |
| `POST` | `/filtered-dashboard` | Apply filters → refreshed KPIs + charts |
| `POST` | `/preview` | Data Preview rows (unfiltered) |
| `POST` | `/ask` | AI Insights visualization + narrative |
| `POST` | `/update-column-mapping` | User column role overrides |
| `GET` | `/usage` | Plan tier + remaining quotas |
| `POST` | `/usage/pdf-export` | Reserve PDF export slot |
| `GET` | `/health`, `/ready` | Liveness / readiness |

---

## Frontend modules

| Area | Primary files |
|------|---------------|
| **SPA shell** | `app/page.tsx`, `components/app-shell/` |
| **Overview UI** | `lib/overview-ui.ts`, `app/globals.css` (overview-chart-grid) |
| **Auto dashboard charts** | `OverviewAutoDashboardChartCard` in `page.tsx`, `lib/overview-dashboard-*.ts` |
| **Shared chart renderer** | `app/components/home/chart-renderer.tsx` |
| **Chart session** | `contexts/chart-session-context.tsx` |
| **Presentation** | `lib/final-chart-presentation.ts`, `lib/selected-visualization.ts` |
| **PNG export** | `lib/chart-png-capture.ts`, `chart-png-export-session.ts`, `chart-png-offscreen-host.tsx` |
| **PDF export** | `app/pdf-report.ts`, `lib/build-executive-pdf-input.ts` |
| **AI Insights UI** | `SmartChartInsightPanel.tsx`, `ai-executive-insights-panel.tsx` |
| **Data Preview** | `app/components/home/data-preview-*.tsx` |
| **Usage** | `app/components/usage-dashboard.tsx`, `lib/usage-api.ts` |

**Tab IDs:** `overview` · `preview` · `insights` · `charts` · `export`

---

## AI Insights status

**Pipeline:** Question → filters → `compute_visualization_for_question()` → unified analysis payload → Claude narrative → frontend gates → `ChartSession`.

**Stable behaviors:**
- Correlation/relationship routing runs early (scatter when |r| sufficient)
- Chart numbers authoritative from `exact_result` / `visualization` block
- Confidence scoring, executive ranking, insight card titles
- Follow-up context payload to backend
- Frontend blocks misaligned charts (`chartSnapshotMatchesQuestionIntent`)

**Gates:**
- `insightChartMatchesCurrentQuestion`
- `showInsightExportButton` (valid answer + aligned viz)

**Tests:** `backend/tests/intent_engine/` — routing matrix, correlation pack, five-questions, geographic QA, wave QA scripts.

---

## PDF Export status

**Flow:** Export tab or Insights export → `buildExecutivePdfExportInput` → alignment validation → `runExecutivePdfExport` (`pdf-report.ts`).

**Features:**
- Light print-safe theme
- KPI section, insight narrative, chart capture, conversation appendix
- Section toggles; analyst-mode advanced sections
- Quota reserve with refund on failure

**Validation:** `docs/pdf-validation-screenshots/phase7-*.pdf`, `frontend/lib/phase7-pdf-generate.test.ts`

**Limitations:** Heavy main-thread work; appendix unbounded; some polish gaps vs on-screen Charts tab.

---

## Usage Dashboard status

**Location:** Header `PlanUsageMenu` → `UsageDashboard` component.

**Data source:** `GET /usage` with `X-Session-Id` + `X-Plan-Tier` headers from `saas-session.ts`.

**Tracks:**
- AI questions remaining (daily)
- PDF exports remaining
- Upload size limit display

**Limitations:**
- Plan tier is **client-set** (`localStorage`) — spoofable
- Counters in-memory — reset on backend restart
- Not tied to real billing

---

## Auto Dashboard status

**Summary:** Deterministic BI-style dashboard from column inventory. See [`auto-dashboard-status.md`](auto-dashboard-status.md) for full detail.

**Recent fixes (Jun 2026):**
- Grid gap: filter non-renderable charts; explicit `gridColumn: span 1` / solo full-width
- PNG h-bar parity: shared `buildOverviewDashboardPlot()` for live + export
- PNG padding: reduced export chrome constants
- Donut export: `radial-export-layout.ts` safe radius + dynamic canvas height
- Composition %: `radial-chart-format.ts` share_pct sanity
- Title polish: `polishAutoDashboardChartTitle()` in `canonical-chart-title.ts`

**Validation fixture:** `backend/tests/fixtures/dashboard_showcase_dataset.csv` (500+ rows), mirrored at `frontend/public/dashboard_showcase_dataset.csv`

---

## Known limitations

1. **Single-tenant backend** — global `df`; last upload wins across users
2. **No authentication** — all routes open
3. **Mock SaaS** — plan tier and session ID from client headers
4. **Data Preview ignores Overview filters** — intentional but confusing
5. **Monolithic files** — `page.tsx` (~14k lines), `main.py` (~16k lines)
6. **AI narrative drift** — mitigated by grounding; not fully validated post-generation
7. **No HTTP E2E in CI** — unit tests only
8. **In-memory usage** — not durable or multi-worker safe

---

## Active branches

| Branch | Role |
|--------|------|
| `DEV` | **Active development** (current) |
| `QA` | QA / validation branch |
| `main` | Production baseline (`origin/HEAD`) |
| `stable/pdf-export-phase2` | PDF export stable snapshot |
| `cursor/agents-md-product-baseline` | Agent baseline docs |

**Remotes:** `origin/DEV`, `origin/QA`, `origin/main`, `origin/cursor/agents-md-product-baseline`

---

## Quick start (new developer)

```bash
# Backend
cd backend
pip install -r requirements.txt
# Set ANTHROPIC_API_KEY, ALLOWED_ORIGINS in .env
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
# Set NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
npm run dev
```

**Tests:**
```bash
cd frontend && npm run lint && npm run test && npm run build
cd backend && python run_tests.py -v
```

**Showcase validation:** Upload `frontend/public/dashboard_showcase_dataset.csv` → Overview should show 6–8 charts, KPI chips, no grid holes.
