# AI Data Analyst App — Project Snapshot

**Snapshot date:** June 2026  
**Purpose:** Concise orientation for developers and stakeholders. For deep UI/chart rules, see `AGENTS.md` and the `*_STABLE_SUMMARY.md` baseline docs.

---

## 1. Architecture overview

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4, Recharts 3 |
| Backend | FastAPI, pandas (in-memory DataFrame per process) |
| AI narrative | Claude (`claude-haiku-4-5`) on `POST /ask` |
| Chart series | Deterministic pandas aggregation (not LLM-generated numbers) |
| PDF | jsPDF + Canvg (`frontend/app/pdf-report.ts`) |
| Persistence | Client-only: theme, sidebar, report branding (`localStorage`) |

**Pattern:** Single-page app — almost all product logic lives in `frontend/app/page.tsx` (~12k+ lines). Reusable UI is extracted into `components/` and `lib/`; state is mostly local in `HomeInner`, with **chart history** in `ChartSessionProvider`.

**Backend session:** One active dataset per server process (`df`, profile, column mapping). Frontend calls `http://localhost:8000/` directly (no Next.js API proxy).

**Two chart presentation pipelines (intentional):**

- **Pipeline A** — Charts tab, AI Insights, PDF: `computeFinalChartPresentation` → `ChartRenderer`.
- **Pipeline B** — Overview auto-dashboard only: `computeOverviewDashboardChartPresentation` (360px mini charts).

---

## 2. Folder structure

```
AI-Data-Analyst-App/
├── backend/
│   ├── main.py                 # All HTTP routes, /ask, viz engine
│   ├── analytics_metadata.py   # Metric/chart label helpers
│   └── services/
│       └── file_parsers.py     # CSV, Parquet, JSON/JSONL
├── frontend/
│   ├── app/
│   │   ├── layout.tsx          # Root layout, theme
│   │   ├── page.tsx            # Main SPA (tabs, upload, AI, export)
│   │   ├── pdf-report.ts       # PDF generation engine
│   │   ├── chart-types.ts      # ChartKind, ChartRow types
│   │   ├── globals.css         # Design tokens, tab-specific CSS
│   │   └── components/         # Shell, charts, insights, overview, preview
│   ├── contexts/
│   │   └── chart-session-context.tsx
│   └── lib/                    # Chart pipeline, PDF, insights, preview helpers
├── AGENTS.md                   # Agent/engineering baseline rules
├── PROJECT_ARCHITECTURE_SUMMARY.md  # Long-form architecture reference
└── *_STABLE_SUMMARY.md         # Per-area stable behavior docs
```

---

## 3. Key frontend files

| File | Role |
|------|------|
| `app/page.tsx` | Upload, filters, Overview, Data Preview, AI Insights, Charts, Export; `/ask` client; chart hydrate |
| `app/pdf-report.ts` | `runExecutivePdfExport()` — cover, summary, KPIs, chart capture, appendix |
| `contexts/chart-session-context.tsx` | AI + auto-dashboard chart timeline, selection, contracts |
| `components/home/chart-renderer.tsx` | Recharts rendering (bar, line, scatter, grouped/stacked multi-metric) |
| `components/ai-insight-chart-shell.tsx` | Insight chart frame + PDF capture surface |
| `components/SmartChartInsightPanel.tsx` | “AI read on this chart” (why, signals) |
| `components/ai-executive-insights-panel.tsx` | Executive insight cards + AI context brief |
| `components/home/filter-panel.tsx` | Unified filter bar (Overview compact / Insights full height) |
| `lib/final-chart-presentation.ts` | Chart type/orientation resolution |
| `lib/smart-chart-intelligence.ts` | Chart-view copy, alignment with rendered chart |
| `lib/executive-insights-brief.ts` | Numbered takeaways for executive-style questions |
| `lib/narrative-number-format.ts` | Narrative commas, ROAS wording polish |
| `lib/ai-follow-up-suggestions.ts` | Suggested follow-up chips |
| `lib/selected-visualization.ts` | Viz contracts, trend mode |
| `lib/metric-value-format.ts` | Currency/percent formatting (UI + PDF appendix) |
| `lib/pdf-enterprise-style.ts` | PDF layout tokens, spacing, typography |

---

## 4. Key backend files

| File | Role |
|------|------|
| `main.py` | FastAPI app: upload, preview, filtered dashboard, column mapping, **`POST /ask`** |
| `services/file_parsers.py` | Parse uploads (CSV, Excel, JSON, Parquet) |
| `analytics_metadata.py` | Humanized metric/category labels for charts and prompts |

**Primary endpoints**

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/upload` | Parse file, profile, semantic mapping, KPIs, auto-dashboard |
| `POST` | `/filtered-dashboard` | Filtered KPIs + dashboard charts |
| `POST` | `/preview` | Row preview slice (not filter-aware) |
| `POST` | `/update-column-mapping` | User column role overrides |
| `POST` | `/ask` | Filters → pandas viz → Claude narrative + `analysis` payload |

---

## 5. AI insight pipeline

```
User question (AI Insights tab)
  → Dashboard filters applied (same as Overview)
  → POST /ask
       ├─ Question intent: metric, category, chart type, dual-metric compare, trend, etc.
       ├─ compute_visualization_for_question() — pandas aggregates → labels/values or stackedBarRows
       ├─ chartRecommendation + provenance + aligned analysis context
       └─ Claude narrative (sections: findings, hypotheses, recommendations, …)
  → Frontend hydrates StoredVisualization + chart rows
  → computeFinalChartPresentation() — bar horizontal/vertical, line, scatter, grouped_bar, …
  → pushAIChart() → ChartSession timeline
  → UI gates before viz/export:
       insightChartMatchesCurrentQuestion, chartSnapshotMatchesQuestionIntent
```

**UI layers**

- **Executive Insights** — KPI-style cards from chart data; numbered brief for “top insights / takeaways / executive summary” questions (`executive-insights-brief.ts`).
- **AI Answer** — Parsed sections (`parseAnswerIntoSections`), confidence strip, supporting detail accordions.
- **Visualization** — `AiInsightChartShell` + metadata chips + `ChartRenderer`.
- **AI read** — `SmartChartInsightPanel` (chart view, why-this-chart, signals).

**Alignment rule:** Narrative, chart, and export must reference the same question intent; misaligned charts are suppressed or warned.

---

## 6. PDF export pipeline

```
Export tab or “Export this insight (PDF)”
  → Build ExecutivePdfExportInput (page.tsx)
  → validateExportMatchesContract (when chart/insight included)
  → runExecutivePdfExport() (pdf-report.ts)
       ├─ Print-safe light theme (independent of app dark mode)
       ├─ Cover + executive snapshot + partitioned executive summary
       ├─ KPI cards, AI insight blocks, optional conversation context
       ├─ Chart: off-screen capture ref (860px) — Canvg SVG→PNG, html2canvas fallback
       ├─ Executive insights brief + viz fact cards (same as on-screen)
       ├─ Optional native jsPDF data preview table (not screenshot)
       └─ Optional technical appendix (metadata, series sample, chart spec)
  → Browser download (A4)
```

**Branding:** Company name, tagline, colors via `localStorage` (`ai-data-analyst-report-branding-v1`).

---

## 7. Current completed features

| Area | Status |
|------|--------|
| Multi-format upload | CSV, Excel, JSON/JSONL, Parquet |
| Column mapping modal | Semantic roles (product, sales, date, region, …) |
| Overview | KPIs, interactive filters, auto-dashboard mini charts, AI summary |
| Data Preview | Search, sort, pagination, copy cells, column profiles, NULL handling |
| AI Insights | Ask AI, suggested questions, conversation reset, confidence scoring |
| Charts tab | Timeline (AI + auto), session chart, “why this chart”, metadata chips |
| Chart types | Bar (V/H), line, area, pie/donut, scatter, histogram, stacked/grouped multi-metric |
| Dual-metric compare | e.g. revenue vs ad spend by campaign (`grouped_bar`) |
| Executive insights | Data-driven KPI cards, gap % on spread cards, numbered executive briefs |
| Narrative polish | Thousands separators, ROAS terminology, dual-metric ROAS lead in summary |
| Smart chart read | Single aligned “why this chart” + signal cards |
| Export / PDF | Section toggles, chart capture, executive summary, appendix |
| Theming | Light/dark UI; PDF always print-light |

---

## 8. Known issues

| Category | Detail |
|----------|--------|
| **Structural** | `page.tsx` and `main.py` are monolithic — maintainability cost, not a runtime defect |
| **Preview vs filters** | `POST /preview` does not apply dashboard filters; table shows loaded slice only |
| **Backend session** | In-memory `df` resets on server restart; single tenant per process |
| **PDF limits** | Preview table capped in PDF; appendix thumbnails capped (~8 charts) |
| **Export bundle** | jsPDF/html2canvas on main path — no lazy split yet |
| **Very long AI answers** | Paginate OK; density could be tuned |
| **html2canvas fallback** | Browser-dependent chart capture quality |

**Risky to change without regression tests:** `pdf-report.ts` pagination, `computeFinalChartPresentation`, insight/export alignment gates, Overview vs session chart pipelines, filter bar layout.

See `CURRENT_BUG_STATUS.md` for resolved PDF/UI items (May 2026 checkpoint).

---

## 9. Next roadmap items

| Priority | Item |
|----------|------|
| **Export/PDF** | Final polish pass — baseline exists; treat as active phase per `AGENTS.md` |
| **Product** | Broader question templates, richer follow-ups per dataset domain |
| **Engineering** | Incremental extraction from `page.tsx` (preview, export, insights) without UI redesign |
| **Backend** | Optional persistence / multi-session datasets (not implemented) |
| **Performance** | Lazy-load heavy PDF/capture dependencies if bundle size becomes an issue |
| **QA** | Smoke: upload → filter → dual-metric ask → executive numbered brief → PDF with matching chart |

**Explicit non-goals unless requested:** Full UI redesign, merging Overview and session chart pipelines, changing stable chart-type semantics.

---

## Related documentation

| Doc | Use when |
|-----|----------|
| `AGENTS.md` | Coding constraints and baseline stance |
| `PROJECT_ARCHITECTURE_SUMMARY.md` | Full architecture (tabs, filters, state) |
| `AI_INSIGHTS_STABLE_SUMMARY.md` | Insights UX and gates |
| `CHARTS_STABLE_SUMMARY.md` | Charts tab behavior |
| `PDF_EXPORT_STABLE_BASELINE.md` | PDF sections and capture |
| `DATA_PREVIEW_STABLE_SUMMARY.md` | Preview table pipeline |
| `UI_BASELINE_RULES.md` | Visual hierarchy and metadata placement |

---

*Summaries only — no substitute for reading baseline docs before changing Insights, Charts, or PDF.*
