# File Map

**Generated:** June 8, 2026  
**Purpose:** Navigate the codebase safely in a new Cursor session

---

## Repository layout

```
AI-Data-Analyst-App/
├── frontend/          Next.js 16 app
├── backend/           FastAPI + intent_engine
├── docs/              Deployment, QA, validation artifacts
├── project-snapshot/  Older handoff notes (Jun 4)
├── handoff docs/      Root-level *.md (this package)
├── AGENTS.md          Agent baseline rules (READ FIRST)
├── render.yaml        Render backend deploy
└── .env.example       Env template
```

---

## Critical path files

### Frontend — entry and shell

| File | Purpose | Depends on |
|------|---------|------------|
| `frontend/app/page.tsx` | **Monolithic SPA** — all tabs, upload, filters, Insights, Charts, Export (~14k lines) | Most of `lib/`, `contexts/`, `components/` |
| `frontend/app/layout.tsx` | Root layout, fonts, theme script | `globals.css` |
| `frontend/app/chart-types.ts` | `ChartKind`, `ChartRow` types | — |
| `frontend/contexts/chart-session-context.tsx` | Chart timeline state | `chart-types.ts` |
| `frontend/components/app-shell/app-shell.tsx` | Sidebar + header chrome | `app-sidebar.tsx`, `app-header.tsx` |

### Frontend — chart pipeline

| File | Purpose | Depends on |
|------|---------|------------|
| `frontend/app/components/home/chart-renderer.tsx` | Shared Recharts renderer (Charts/Insights/export) | `chart-axis-layout.ts`, `chart-time-x-axis.ts` |
| `frontend/lib/final-chart-presentation.ts` | Resolve presentation kind from API + question | `chart-types.ts` |
| `frontend/lib/selected-visualization.ts` | Viz normalization for renderer | `final-chart-presentation.ts` |
| `frontend/lib/chart-axis-layout.ts` | Margin/category axis plans | — |
| `frontend/lib/chart-time-x-axis.ts` | Trend x-axis ticks, chronological sort | — |
| `frontend/lib/chart-layout-config.ts` | Viewport wrappers, outer margins | — |
| `frontend/lib/trend-visualization.ts` | Trend bucket labels | — |
| `frontend/lib/metric-value-format.ts` | Currency, %, pp gap formatting | — |
| `frontend/lib/chart-quality-warnings.ts` | Rate >100% warning + detection | `metric-value-format.ts` |
| `frontend/lib/overview-ui.ts` | Overview dash CSS class tokens | — |

### Frontend — PNG export

| File | Purpose | Depends on |
|------|---------|------------|
| `frontend/lib/chart-png-capture.ts` | Canvg plot + canvas header/composite | `chart-png-export-text.ts`, `chart-axis-theme.ts` |
| `frontend/lib/chart-png-export-layout.ts` | Export canvas dimensions by chart kind | `chart-types.ts` |
| `frontend/lib/chart-png-export-session.ts` | Offscreen wait + download orchestration | `chart-png-capture.ts` |
| `frontend/lib/chart-png-offscreen-host.tsx` | Body portal for export-only render | `chart-png-export-layout.ts` |

### Frontend — PDF export

| File | Purpose | Depends on |
|------|---------|------------|
| `frontend/app/pdf-report.ts` | jsPDF engine, capture, pagination (~4k lines) | `pdf-enterprise-style.ts`, `chart-png-capture.ts` |
| `frontend/lib/build-executive-pdf-input.ts` | PDF input contract builder | `pdf-export-sections.ts` |
| `frontend/lib/pdf-executive-content.ts` | Executive narrative blocks for PDF | — |
| `frontend/lib/pdf-export-quota.ts` | Quota reserve/refund helpers | `usage-api.ts` |

### Frontend — AI Insights client

| File | Purpose | Depends on |
|------|---------|------------|
| `frontend/lib/ai-conversation-context.ts` | Follow-up / thread payload | — |
| `frontend/lib/ai-follow-up-suggestions.ts` | Suggested questions | — |
| `frontend/lib/routing-plan.ts` | RoutingPlan TypeScript mirror | — |
| `frontend/lib/api-base.ts` | `getApiBaseUrl()` from env | — |
| `frontend/lib/saas-session.ts` | Session ID + plan tier headers | — |
| `frontend/lib/plan-limits.ts` | Client-side limit gates | — |

### Backend — core

| File | Purpose | Depends on |
|------|---------|------------|
| `backend/main.py` | **All routes**, viz pipeline, narrative (~15.8k lines) | `intent_engine/`, `services/` |
| `backend/analytics_metadata.py` | Metric/chart title builders | — |
| `backend/services/file_parsers.py` | CSV/Excel/JSON/Parquet parse | — |
| `backend/services/plan_limits.py` | Tier limits definition | — |
| `backend/services/usage_tracker.py` | In-memory usage counters | — |
| `backend/services/saas_context.py` | Parse `X-Session-Id`, `X-Plan-Tier` | — |
| `backend/services/readiness.py` | `/health`, `/ready` | — |
| `backend/run_tests.py` | Canonical test runner | `tests/` |

### Backend — intent engine

| File | Purpose |
|------|---------|
| `backend/intent_engine/attach.py` | Entry: enrich analysis with intent |
| `backend/intent_engine/resolve_analysis_intent.py` | Core intent resolution |
| `backend/intent_engine/routing_plan.py` | RoutingPlan schema |
| `backend/intent_engine/confidence_scoring.py` | Confidence bands |
| `backend/intent_engine/correlation_routing_guard.py` | Correlation-first routing |
| `backend/intent_engine/executive_lens.py` | Executive lens prioritization |
| `backend/intent_engine/executive_ambiguous_intent.py` | Ambiguous phrase routing |
| `backend/intent_engine/chart_presentation_align.py` | Chart type alignment |

---

## Baseline documentation (stable behavior contracts)

| Doc | Topic |
|-----|-------|
| `AGENTS.md` | Agent rules — do not redesign working UI |
| `UI_BASELINE_RULES.md` | Filter/chart/metadata rules |
| `AI_INSIGHTS_STABLE_SUMMARY.md` | Insights behaviors |
| `CHARTS_STABLE_SUMMARY.md` | Charts tab behaviors |
| `CHARTS_STABLE_SUMMARY.md` | Chart types + layout |
| `DATA_PREVIEW_STABLE_SUMMARY.md` | Preview table |
| `PDF_EXPORT_STABLE_BASELINE.md` | PDF sections + capture |
| `AI_VISUALIZATION_BEHAVIOR.md` | Viz alignment gates |

---

## Test files

| Area | Location | Count (Jun 2026) |
|------|----------|------------------|
| Frontend unit | `frontend/lib/*.test.ts` | 36 files, **180 tests** |
| Backend intent | `backend/tests/intent_engine/test_*.py` | 30+ files |
| Backend infra | `backend/tests/test_*.py` | health, CORS, usage, follow-up |
| Fixtures | `backend/tests/fixtures/*.csv` | Regression datasets |

**Run:**

```bash
cd frontend && npm run test
cd backend && python run_tests.py -v
```

---

## Files safe to modify

Low regression risk when changes are scoped:

| File / area | Safe for |
|-------------|----------|
| `frontend/lib/chart-png-*.ts` | PNG export polish only |
| `frontend/lib/metric-*.ts` | Formatting / display labels |
| `frontend/lib/chart-quality-warnings.ts` | Warning copy/styling hooks |
| `frontend/lib/chart-tooltip-format.ts` | Tooltip text |
| `frontend/lib/pilot-*.ts` | Landing / nav copy |
| `frontend/lib/branding-config.ts` | PDF footer email, branding |
| `backend/intent_engine/*.py` + matching tests | Routing rules (with tests) |
| `backend/tests/intent_engine/` | New regression tests |
| `docs/*` | Documentation |
| `.env.example`, `render.yaml` | Deploy config |

---

## Files high-risk to modify

Touch only with narrow fix + tests + baseline doc review:

| File | Risk | Why |
|------|------|-----|
| `frontend/app/page.tsx` | 🔴 **Very high** | 14k lines; all tabs; easy to break gates/filters/export |
| `backend/main.py` | 🔴 **Very high** | 15.8k lines; routing order matters; globals |
| `frontend/app/pdf-report.ts` | 🔴 High | PDF pagination, capture refs, quota interaction |
| `frontend/app/components/home/chart-renderer.tsx` | 🟠 High | Shared by Charts, Insights, PNG offscreen |
| `frontend/lib/final-chart-presentation.ts` | 🟠 High | Chart kind affects all surfaces |
| `frontend/contexts/chart-session-context.tsx` | 🟠 High | Cross-tab chart history |
| `frontend/app/globals.css` | 🟠 High | Shared tokens; chart shell spacing |
| `backend/intent_engine/resolve_analysis_intent.py` | 🟠 High | Central routing |
| `frontend/lib/ai-conversation-context.ts` | 🟡 Medium | Follow-up thread behavior |

---

## Dependency graph (simplified)

```
page.tsx
 ├── chart-session-context
 ├── chart-renderer
 │    ├── chart-axis-layout
 │    ├── chart-time-x-axis
 │    └── final-chart-presentation
 ├── pdf-report.ts
 │    └── chart-png-capture.ts
 └── api-base / saas-session / plan-limits

main.py
 ├── intent_engine/*
 ├── file_parsers
 ├── plan_limits / usage_tracker
 └── analytics_metadata
```

---

## Do not modify without explicit approval

- Working Overview layout / filter bar / card chrome
- `AiInsightChartShell` / `ChartInsightViewportWrapper` structure
- Chart-type semantics across Overview / Insights / Charts / PDF
- Horizontal bar orientation (must stay horizontal)
- Backend pandas aggregation formulas (chart **calculations**)
