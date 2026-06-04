# AI Data Analyst App — Project Snapshot (Handoff)

**Generated:** June 2026  
**Purpose:** Onboard a new Cursor chat with architecture, stability status, known issues, and priorities.  
**Companion:** [`file-map.md`](file-map.md) — per-file responsibilities.

**Authoritative baseline docs (do not contradict without verifying code):**  
[`AGENTS.md`](../AGENTS.md) · [`PROJECT_ARCHITECTURE_SUMMARY.md`](../PROJECT_ARCHITECTURE_SUMMARY.md) · [`AI_INSIGHTS_STABLE_SUMMARY.md`](../AI_INSIGHTS_STABLE_SUMMARY.md) · [`CHARTS_STABLE_SUMMARY.md`](../CHARTS_STABLE_SUMMARY.md) · [`DATA_PREVIEW_STABLE_SUMMARY.md`](../DATA_PREVIEW_STABLE_SUMMARY.md) · [`PDF_EXPORT_STABLE_BASELINE.md`](../PDF_EXPORT_STABLE_BASELINE.md) · [`AI_VISUALIZATION_BEHAVIOR.md`](../AI_VISUALIZATION_BEHAVIOR.md)

---

## 1. Project architecture overview

### Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4, Recharts 3 |
| Backend | FastAPI, pandas (in-memory `df` per process) |
| AI narrative | Claude (`claude-haiku-4-5`) via `POST /ask` |
| Chart series | **Deterministic pandas** — not LLM-generated numbers |
| PDF | jsPDF + Canvg (+ html2canvas fallback) in `frontend/app/pdf-report.ts` |
| Persistence | Client-only: theme, sidebar, report branding (`localStorage`) |

### Repository layout

```
AI-Data-Analyst-App/
├── frontend/          # Next.js SPA (single route)
├── backend/           # FastAPI + intent_engine package
├── docs/              # Handoff + migration notes
└── *.md               # Product baseline snapshots (May–Jun 2026)
```

---

### 1.1 Frontend structure

**Entry:** `frontend/app/layout.tsx` — fonts, `ThemeScript`, `globals.css`.

**Single SPA:** `frontend/app/page.tsx` (~14k lines) — all tabs, upload, filters, AI Insights, Charts, Export. No per-tab URLs; `activeTab: MainNavTabId` drives visibility.

**Shell:** `frontend/components/app-shell/` — `AppShell`, `AppSidebar`, `AppHeader`, `nav-config.tsx`.

**Extracted UI (presentation only; state stays in `page.tsx`):**

| Area | Path |
|------|------|
| Overview KPI / upload | `app/components/home/overview/` |
| Filters | `app/components/home/filter-panel.tsx` |
| Data Preview table | `app/components/home/data-preview-*.tsx` |
| Charts timeline + renderer | `charts-timeline-aside.tsx`, `chart-renderer.tsx` |
| AI Insights shells | `ai-insight-chart-shell.tsx`, `SmartChartInsightPanel.tsx`, `ai-executive-insights-panel.tsx` |

**Shared context:** `frontend/contexts/chart-session-context.tsx` — AI + auto-dashboard chart contracts, dedupe, dataset invalidation.

**Lib modules:** `frontend/lib/` — chart presentation, insight alignment, confidence, follow-ups, PDF helpers, tab design tokens (see [`file-map.md`](file-map.md)).

**Tab IDs:** `overview` · `preview` · `insights` · `charts` · `export` (`main-nav-tabs.tsx`).

---

### 1.2 Backend structure

**Monolith API:** `backend/main.py` (~14k lines) — HTTP routes, upload/parsing, KPI/auto-dashboard, **`compute_visualization_for_question`**, Claude prompts, unified analysis payload.

**Intent engine (facades + new logic):** `backend/intent_engine/` — question patterns, metric/dimension resolution, correlation, confidence, forecast guardrails, executive ranking, validate support. Many functions still **delegate to `main.py`** via `legacy.py`.

**Parsers:** `backend/services/file_parsers.py` — CSV, Parquet, JSON/JSONL.

**Metadata helpers:** `backend/analytics_metadata.py` — chart titles, metric labels.

**Tests:** `backend/tests/intent_engine/` — routing, correlation, confidence, golden questions, geographic QA.

**Session model:** In-memory globals — `df`, `dataset_profile`, `column_mapping`, `uploaded_file_bytes`. **One active dataset per server process** (not multi-tenant).

**HTTP endpoints:**

| Method | Path | Role |
|--------|------|------|
| `GET` | `/` | Health |
| `POST` | `/upload` | Parse file, profile, semantic mapping, KPIs, auto-dashboard |
| `POST` | `/select-sheet` | Excel sheet switch |
| `POST` | `/preview` | Row slice (**not** filter-aware) |
| `POST` | `/update-column-mapping` | User role overrides |
| `POST` | `/filtered-dashboard` | Filtered KPIs + auto-dashboard |
| `POST` | `/ask` | AI Insights: viz pipeline + Claude narrative |

Frontend calls `http://localhost:8000/` directly (no Next.js API proxy).

---

### 1.3 AI Insights pipeline

```
User question (frontend)
  → POST /ask { question, filters, conversation context }
  → apply_dashboard_filters_to_df()     # same filters as Overview
  → compute_visualization_for_question() # pandas — chart rows + intent_debug
  → _build_unified_analysis_payload()   # confidence, intent, relationshipInsights
  → _generate_insight_narrative()       # Claude with exact_result anchor
  → JSON: answer, visualization, analysis, rankedExecutiveInsights (optional)
  → Frontend: gates (question match, intent alignment)
  → pushAIChart → ChartSession
  → Render: executive cards, answer body, AiInsightChartShell, SmartChartInsightPanel
```

**Critical rule:** Chart numbers in the UI/PDF must come from the **authoritative exact_result / visualization** block, not free-form LLM memory.

**Gates (frontend):**

- `insightChartMatchesCurrentQuestion` — turn/question/snapshot alignment
- `chartSnapshotMatchesQuestionIntent` — blocks misleading charts (e.g. department-average bar for outlier questions)
- `showInsightExportButton` — valid answer + aligned viz only

---

### 1.4 Chart generation pipeline

**Backend (data):** `compute_visualization_for_question` in `main.py` — ordered routing:

1. **Correlation / relationship** (early) — `_try_correlation_routing_pack` → scatter or missing-column message
2. Dual-metric grouped bar (`_resolve_two_metric_compare_spec`)
3. Stacked two-category charts
4. Trend line (`_try_build_trend_line_visualization`)
5. Outlier / unsupported multi-metric / `analyze_data` fallback

Relationship path: row-level scatter, Pearson/Spearman via `intent_engine/correlation_analysis.py`.

**Frontend (presentation):** Two pipelines (do not merge without approval):

| Pipeline | Consumers | Resolver |
|----------|-----------|----------|
| **A — Shared** | Charts tab, AI Insights, PDF capture | `computeFinalChartPresentation` → `ChartRenderer` |
| **B — Overview only** | Auto-dashboard mini charts (360px) | `computeOverviewDashboardChartPresentation` |

**Flow A:** `selected-visualization.ts` contract → `final-chart-presentation.ts` → `chart-layout-config.ts` / `chart-renderer.tsx` → Recharts.

**Chart session:** Charts tab reads **only** `ChartSessionProvider` (no refetch on tab switch). Sources: `pushAIChart` (Insights), `replaceAutoDashboardCharts` (Overview).

---

### 1.5 PDF export pipeline

```
Export tab or Insights "Export this insight"
  → build ExecutivePdfExportInput (page.tsx)
  → validateExportMatchesContract (alignment gates)
  → runExecutivePdfExport (pdf-report.ts)
      → buildPdfExportTheme (light, print-safe)
      → Cover + executive snapshot + summary sections
      → Chart: off-screen ref capture (860px)
          → Primary: SVG → Canvg → PNG
          → Fallback: html2canvas
      → Optional: Data Preview table (native PDF draw)
      → jsPDF save
```

**Refs:** `chartCaptureSessionRef` (Charts), `chartCaptureInsightRef` (Insights plan widths 760/850/900).

**Status:** Functional end-to-end; product treats Export as **not finalized** (polish phase pending). See §2 and §7.

---

## 2. Current implemented features

Status key: **Stable** = baseline-tested, do not redesign casually · **Experimental** = partial / env-gated / migrating · **Needs Fix** = known gaps or regressions risk

| Feature | Status | Notes |
|---------|--------|-------|
| Dataset upload (CSV, Excel, JSON, Parquet) | **Stable** | Overview upload + replace |
| Semantic column mapping + modal | **Stable** | Roles: product, sales, date, region, customer, profit |
| Overview KPIs + auto-dashboard | **Stable** | Domain heuristics (ecommerce, manufacturing, generic) |
| Dashboard filters (equality + date range) | **Stable** | Overview + Insights; single grouped date control |
| Filtered dashboard API | **Stable** | `/filtered-dashboard` applies filters |
| Data Preview (search, sort, pagination, copy) | **Stable** | Client-side on loaded preview rows only |
| AI Insights Q&A + visualization | **Stable** | Deterministic viz + Claude narrative |
| Chart–question alignment gates | **Stable** | Prevents wrong chart for outlier / stale turn |
| Charts tab timeline + session preview | **Stable** | ≤860px viewport |
| Correlation / relationship scatter routing | **Stable** | Jun 2026 fix; schema-driven pair resolution |
| Pearson + Spearman + strength bands | **Stable** | `correlation_analysis.py` |
| Confidence scoring (component model) | **Stable** | Backend + frontend; no fixed 38/52 floors |
| Forecast guardrails (`canForecast`) | **Stable** | Blocks invalid single-period forecasts |
| Decline / growth / trend unsupported UX | **Stable** | Dedicated executive cards + copy |
| Multi-metric compare (missing operand) | **Stable** | Suppresses misleading charts |
| Derived profit margin / ROI | **Stable** | Derived metrics by dimension |
| AI Read (`SmartChartInsightPanel`) | **Stable** | Dynamic dimension labels in chart view |
| Follow-up question chips | **Stable** | Schema-driven; prefills only (no auto-send) |
| Intent engine metadata on `/ask` | **Experimental** | `analysis.intent`; parallel to chart pipeline |
| Intent debug panel | **Experimental** | `NEXT_PUBLIC_AI_INSIGHTS_DEBUG` |
| Executive insight ranking (category bar) | **Stable** | Not used for scatter (relationship cards instead) |
| Export tab PDF download | **Experimental** | Works; polish / contract finalization pending |
| Per-insight PDF export | **Experimental** | Gated; same engine as Export tab |
| Geographic scope routing | **Stable** | `geographic_scope.py` + tests |
| Categorical outlier narrative | **Stable** | Backend + frontend unsupported paths |
| Conversation follow-up context | **Stable** | Sidecar on `/ask` |
| Theme (light/dark) | **Stable** | PDF uses separate light theme |
| Vitest follow-up tests | **Experimental** | `*.test.ts` excluded from `tsc`; not in npm test script |

---

## 3. Current known issues

| Issue | Severity | Suspected root cause |
|-------|----------|----------------------|
| **Export/PDF not product-finalized** | Medium | Documented next phase; spacing, appendix, and contract validation still evolving ([`PDF_EXPORT_STABLE_BASELINE.md`](../PDF_EXPORT_STABLE_BASELINE.md)) |
| **`/preview` ignores dashboard filters** | Medium | `POST /preview` returns raw loaded rows; Data Preview search/sort only sees fetched window, not filtered cohort |
| **Single-process in-memory `df`** | Medium | No per-user/session isolation; server restart loses data; not horizontally scalable |
| **`main.py` size (~14k lines)** | Low (maint.) | Chart routing + prompts + upload in one file; `intent_engine` only partially extracted |
| **`page.tsx` size (~14k lines)** | Low (maint.) | All tab state in one component; hard to navigate |
| **Intent `detected_intent` logs sometimes say `compare` for scatter** | Low | Legacy logging bucket vs `analysis.intent.primaryGoal=relationship` — metadata inconsistency only |
| **Small-sample correlation (n&lt;8)** | Low | Confidence band may stay LOW while score &gt; 0; `cautiousNarrativeRequired` by design |
| **Growth metric name vs growth intent** | Low (mitigated) | Phrases like "growth rate" used to trigger `_GROWTH_INTENT_RE`; mitigated by correlation routing exemption |
| **Overview filename truncate vs Preview wrap** | Low | Intentional UI difference ([`DATA_PREVIEW_STABLE_SUMMARY.md`](../DATA_PREVIEW_STABLE_SUMMARY.md)) |
| **No automated E2E browser tests** | Medium | Reliance on `unittest` intent_engine suite + manual UI verification |
| **Frontend `npm test` not configured** | Low | `ai-follow-up-suggestions.test.ts` exists but vitest not in `package.json` scripts |
| **Hardcoded `localhost:8000`** | Low | Backend URL in frontend; no env-based API base in all paths |

**Recently fixed (no longer open):**

- Correlation questions routing to zone/category bar aggregation
- `"correlated with"` not detected as relationship intent
- `customer count` → `customers` synonym resolution
- Growth-rate correlation marked `unsupported_analysis` with 0 confidence
- Generic Revenue Share/Gap cards on scatter relationship questions

---

## 4. AI Insights flow (detailed)

### 4.1 Question parsing

| Layer | Location | Behavior |
|-------|----------|----------|
| Tags / buckets | `main.py` — `_chart_selection_question_bucket`, `detect_intent_tags` | compare, trend, relationship, ranking, … |
| Decline / multi-metric / relationship | `intent_engine/question_patterns.py` | Explicit regex; relationship blocks compare-by-dimension steal |
| Correlation routing | `question_requests_correlation_routing()` | Includes `correlated with`, `correlation between`, etc. |
| Growth / trend | `main.py` — `_question_requests_growth_intent`, `_question_requests_trend_intent` | Growth suppressed when correlation routing active |
| Follow-up | `main.py` — conversation sidecar + `_attach_conversation_followup_payload` | Prior answer excerpt in prompt |

### 4.2 Metric detection

| Step | Location |
|------|----------|
| Semantic mapping at upload | `compute_semantic_column_mapping` in `main.py` |
| Per-question metric spec | `_resolve_question_metric_spec`, `_best_numeric_column_for_question` |
| Intent engine facade | `resolve_metric_and_dimension` in `intent_engine/resolve_metric_dimension.py` |
| Column tokens | `intent_engine/column_resolve.py` — sales→revenue, ad_spend, profit, … |
| Correlation pair | `resolve_relationship_numeric_pair` — phrase patterns + aliases |

### 4.3 Chart routing

**Owner:** `compute_visualization_for_question` (`main.py`).

**Relationship first:** `_try_correlation_routing_pack` → `_try_build_relationship_scatter_visualization` or `_try_build_relationship_correlation_only` or **missing columns** (no bar fallback).

**Outputs:** `chart_data`, `chart_type`, `chart_title`, `intent_debug`, `smart_trace`, `exact_result` (tabular + correlation lines).

**Frontend kind:** API `chartType` + rows → `apiChartStringToKind` / `computeFinalChartPresentation`.

### 4.4 Confidence scoring

**Backend:** `intent_engine/confidence_scoring.py` — `calculate_insight_confidence()` sums:

- Cohort row count
- Chart points / scatter joint pairs (relationship-aware)
- Mapping confidence
- Chart–intent fit
- Statistical support (Pearson sample ≥ 8)
- Forecast validity
- Alignment repair / partial viz warnings

**API fields:** `insightConfidenceScore`, `insightConfidenceLevel`, `insightConfidenceReasons`, `evidenceSummaryLine`.

**Frontend:** `frontend/lib/insight-confidence.ts` — trusts backend score when present; displays band + reasons.

### 4.5 Executive summary generation

| Source | When |
|--------|------|
| **Relationship cards** | `buildRelationshipExecutiveCards` — Pearson, strength, direction, sample size |
| **Trend / decline / growth unsupported** | Dedicated builders in `page.tsx` + lib modules |
| **Ranked category insights** | `executive_insight_ranking.py` → `rankedExecutiveInsights` on bar charts (≥2 points, non-scatter) |
| **Generic bar** | `buildExecutiveVizInsights` + `insight-card-titles.ts` |
| **AI narrative** | Claude sections in answer body; must align with `exact_result` |

**Order in UI:** Unsupported paths → relationship scatter → profit margin → trend → grouped bar → ranked API → generic executive.

### 4.6 Follow-up generation

**File:** `frontend/lib/ai-follow-up-suggestions.ts`

- `resolveFollowUpDimensionPhrase` — uses actual dimension label (e.g. zone, not hardcoded region)
- `buildNaturalBusinessFollowUpChips` — dimension + measure + chart kind + schema
- Click **prefills** question only (no auto-send)
- Low-quality chips filtered via `isLowQualityFollowUpChip`

---

## 5. Important files and responsibilities

See **[`file-map.md`](file-map.md)** for the full path → purpose → dependencies table.

**Top 10 navigation anchors:**

| Path | Purpose |
|------|---------|
| `frontend/app/page.tsx` | Entire product UI and state |
| `frontend/contexts/chart-session-context.tsx` | Chart contracts across tabs |
| `frontend/app/components/home/chart-renderer.tsx` | Recharts rendering |
| `frontend/lib/final-chart-presentation.ts` | Chart kind/orientation resolution |
| `frontend/app/pdf-report.ts` | PDF generation |
| `backend/main.py` | All APIs and viz pipeline |
| `backend/intent_engine/correlation_analysis.py` | Pearson/Spearman + pair resolution |
| `backend/intent_engine/confidence_scoring.py` | Confidence model |
| `backend/intent_engine/question_patterns.py` | Intent detection |
| `AGENTS.md` | Agent rules for incremental changes |

---

## 6. Recent major fixes completed

| Area | Summary | Key files |
|------|---------|-----------|
| **Correlation routing** | Early routing; scatter not bar; `correlated with` intent; synonyms (customer count, sales, growth rate); missing-column message; no profit-margin bar fallback | `main.py`, `correlation_analysis.py`, `question_patterns.py` |
| **Confidence** | Component-sum model; relationship scatter joint-pair scoring; no arbitrary 0/100 when routing valid | `confidence_scoring.py`, `insight-confidence.ts` |
| **Forecast guardrails** | `can_forecast()` — multi-period, non-degenerate; scenario estimate when invalid | `forecast_guardrails.py`, `main.py` |
| **Follow-ups** | Dynamic dimension phrasing; removed zone→region hardcode | `ai-follow-up-suggestions.ts` |
| **AI Read labels** | Dynamic comparison label (e.g. zone comparison) | `smart-chart-intelligence.ts` |
| **Intent engine Phase 1** | `analysis.intent` on API; facades; golden tests | `resolve_analysis_intent.py`, tests |
| **Executive ranking** | Category bar insight cards | `executive_insight_ranking.py` |
| **Geographic QA** | Scope + single-period trend unsupported tests | `geographic_scope.py`, tests |

---

## 7. Remaining work

| Item | Description |
|------|-------------|
| **Export/PDF finalization** | Product polish, validation matrix, regression on capture refs |
| **Intent engine extraction** | Move more of `compute_visualization_for_question` branches into `intent_engine/` |
| **Filter-aware preview** | Optional `POST /preview` with same filters as dashboard |
| **API base URL config** | Environment-driven backend URL for deployment |
| **Automated E2E** | Playwright or similar for Insights + PDF smoke |
| **Frontend test runner** | Wire vitest for `lib/*.test.ts` |
| **Session / multi-tenant** | If product requires concurrent datasets or auth |
| **`page.tsx` / `main.py` decomposition** | Only with explicit approval (baseline warns against drive-by refactors) |

---

## 8. Suggested next priorities

1. **Export/PDF finalization** — Run regression checklist in [`PDF_EXPORT_STABLE_BASELINE.md`](../PDF_EXPORT_STABLE_BASELINE.md); verify insight + session capture at 860px; do not break alignment gates.
2. **Correlation QA on real customer datasets** — Verify pair resolution for column naming variants not in fixtures.
3. **Filter-aware Data Preview (optional)** — If product needs cohort-consistent row inspection.
4. **Intent logging consistency** — Align `detected_intent` logs with `analysis.intent.primaryGoal` for easier debugging.
5. **Expand `unittest` coverage** — Add golden questions for new chart routes without broad refactors.
6. **Deployment hardening** — Env for API URL, CORS, and dataset session strategy.

---

## Quick start (dev)

```bash
# Backend
cd backend
pip install -r requirements.txt   # if present
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

**Tests:**

```bash
cd backend
python -m unittest discover -s tests/intent_engine -v
```

**Agent discipline:** Read [`AGENTS.md`](../AGENTS.md) before changing Insights, Charts, or shared chart shells — **incremental fixes only**.

---

*End of snapshot.*
