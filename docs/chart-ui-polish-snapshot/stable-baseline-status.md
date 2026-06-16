# Stable Baseline Status — Chart UI Polish Baseline

**Branch:** `chart-ui-polish-baseline`  
**Stable commit:** `4247ef3` (`testing done. only bulk performnace pending`, 2026-06-15)  
**Purpose:** What works on this branch before further chart visual fixes.

---

## 1. Branch summary

This branch is a **clean checkpoint** at stable commit `4247ef3` — based on the May 2026 production snapshot (pre–Export/PDF finalization) with chart UI polish work validated through testing. **Bulk performance work is explicitly pending** per commit message; no application code changes are included in this documentation snapshot.

The branch preserves:

- Modern SaaS dashboard UI (Overview, AI Insights, Charts, Export)
- Dual chart pipelines (Overview mini vs shared session/insight)
- Chart session timeline across tabs
- PNG and PDF export paths
- AI routing with frontend alignment gates

---

## 2. What works in this branch

### Application shell & navigation

| Area | Status |
|------|--------|
| App shell (sidebar, header, theme toggle) | Stable |
| Tab switching with `useTransition` | Stable |
| Dark / light mode | Stable |
| Dataset upload (CSV, Excel, JSON, Parquet) | Stable |
| Column mapping modal | Stable |
| Filter panel (Overview compact + Insights dashboard) | Stable |

### Overview tab

| Area | Status |
|------|--------|
| Upload / replace file flow | Stable |
| KPI cards | Stable |
| Auto-dashboard chart grid | Stable |
| Filter refresh via `/filtered-dashboard` | Stable |
| Drill-down from chart clicks | Stable |
| View in Charts / Ask AI shortcuts | Stable |
| Per-card PNG export | Stable |
| AI summary panel | Stable |

### Data Preview tab

| Area | Status |
|------|--------|
| Paginated table, search, sort | Stable |
| Column quality headers | Stable |
| Copy cell values | Stable |
| NULL pill rendering | Stable |

### Charts tab

| Area | Status |
|------|--------|
| Timeline (AI + Auto sections) | Stable |
| Session preview with metadata stack | Stable |
| Why this chart strip | Stable |
| SmartChartInsightPanel | Stable |
| Plot transition on selection change | Stable |
| Download Chart PNG | Stable |

### AI Insights tab

| Area | Status |
|------|--------|
| Suggested questions panel | Stable |
| Ask AI + Reset conversation | Stable |
| Answer rendering + follow-ups | Stable |
| Visualization gates (question + intent match) | Stable |
| Executive insight cards | Stable |
| SmartChartInsightPanel (gated) | Stable |
| Export this insight (PDF) when aligned | Stable |

### Export tab

| Area | Status |
|------|--------|
| Section toggles + branding | Stable |
| Full executive PDF download | Stable |
| Native data preview table in PDF | Stable |
| Appendix (metadata, thumbnails, spec) | Stable |
| Print-safe light theme | Stable (by design) |

### Backend

| Area | Status |
|------|--------|
| Upload + profile + auto-dashboard | Stable |
| Filtered dashboard | Stable |
| `/ask` visualization + narrative | Stable |
| Intent engine routing pack | Stable (regression tests) |
| Health / ready endpoints | Stable |

---

## 3. H-Bar status

**Status: Reference premium layout — stable baseline**

| Surface | Status | Notes |
|---------|--------|-------|
| Charts tab | ✅ Stable | Category-scaled height; dedicated horizontal layout; intel strip + reason copy |
| AI Insights | ✅ Stable | 900px plan viewport; symmetric margins; wrapped Y ticks |
| Overview mini cards | ✅ Stable | Pipeline B resolves bar → horizontal where appropriate |
| PNG export | ✅ Stable | Category-count canvas scaling; parity validation on Overview |
| PDF export | ✅ Stable | Remains horizontal; centered embed |

**Strengths:**

- `computeHorizontalBarAxisLayout` + `WrappedCategoryYAxisTick` handle long labels.
- Height scales with category count (not fixed vh band only).
- Optical centering via balanced outer margins.
- Used as the **visual reference** for premium chart layout in this branch.

---

## 4. Donut status

**Status: Stable — radial path mature**

| Surface | Status | Notes |
|---------|--------|-------|
| Charts tab | ✅ Stable | Legend + share tooltips |
| AI Insights | ✅ Stable | Radial margins via `radialChartOuterMargins` |
| Overview | ✅ Stable | When auto-dashboard emits pie/donut |
| PNG export | ✅ Stable | `radial-export-layout.ts` radii + legend row estimate |
| PDF export | ✅ Stable | Proportional embed |

**Strengths:**

- Share % formatting via `formatRadialTooltipValue`.
- Pie (≤5 groups) vs donut (>5) presentation rules in `smart-chart-intelligence.ts`.
- Export-specific outer margins (`radialChartExportOuterMargins`).

---

## 5. Line / Area / Scatter current status

**Status: Functional but visually behind H-Bar premium baseline**

| Kind | Charts tab | AI Insights | Overview | PNG | PDF |
|------|------------|-------------|----------|-----|-----|
| Line | ⚠️ Works | ⚠️ Works | ⚠️ Works | ✅ Works | ✅ Works |
| Area | ⚠️ Works | ⚠️ Works | ⚠️ Works | ✅ Works | ✅ Works |
| Scatter | ⚠️ Works | ⚠️ Works | ⚠️ Works | ✅ Works | ✅ Works |

**What works:**

- Correct chart type selection (trend → line/area; correlation → scatter).
- Data renders; tooltips, axis labels, and drill-down (where enabled) function.
- Shared vh height band (`clamp(460px, 52vh, 560px)`) applies consistently.
- Trend X-axis: angled ticks, interval thinning, temporal label formatting.
- Scatter: numeric X/Y axes with custom tooltip.

**Known visual gaps (see `open-issues.md`):**

- Plot framing does not match H-Bar premium feel (padding, vertical presence, axis/footer balance).
- Line/area/scatter can appear **shorter or more compressed** relative to H-Bar in Charts tab and AI Insights.
- Scatter uses simpler margin preset vs polished cartesian category plans.

---

## 6. PNG export status

**Status: Stable for all chart kinds**

| Path | Status | Engine |
|------|--------|--------|
| Charts tab Download PNG | ✅ Stable | Canvg + canvas composite |
| Overview card PNG | ✅ Stable | Offscreen portal + parity check |
| All ChartKind branches | ✅ Covered | `buildPresentationExportSpec` per kind |

**Features:**

- SVG polish pre-capture (`chart-png-export-svg-polish.ts`).
- Header/chips/footer drawn on canvas (avoids html2canvas Tailwind v4 issues).
- Dark export palette when capturing from dark UI.
- QA validation in dev (`chart-png-export-qa.ts`).

**Limitation:** Export typography/spacing tuned for H-Bar and donut; line/area/scatter export matches on-screen layout (including current compression).

---

## 7. PDF export status

**Status: Phase 2 stable — not final product polish**

| Feature | Status |
|---------|--------|
| Cover + executive snapshot | ✅ Stable |
| KPI cards (2-column grid) | ✅ Stable |
| AI insight narrative blocks | ✅ Stable |
| Chart image embed (Canvg primary) | ✅ Stable |
| Data preview native table | ✅ Stable |
| Appendix (thumbnails, spec, series) | ✅ Stable |
| Running header/footer | ✅ Stable |
| Alignment gates before export | ✅ Stable |

**Limitations (documented, not blocking):**

- Print-light theme only (not app dark theme).
- Preview table capped at 10×7.
- Appendix thumbnails max 8 charts.
- html2canvas fallback quality varies by browser.
- Monolithic export assembly in `page.tsx`.

---

## 8. AI routing status

**Status: Stable with guards — residual risk documented**

### Backend routing

```
POST /ask
  → apply_dashboard_filters_to_df
  → compute_visualization_for_question
      → correlation routing pack (early)
      → intent_engine modules (resolve, trend, correlation, outlier, …)
      → analyze_data / build_smart_chart
      → _deterministic_viz_last_resort (fallback)
  → Claude narrative with grounding blocks
```

| Routing area | Status |
|--------------|--------|
| Correlation → scatter | ✅ Stable (regression tests) |
| Trend → line/area | ✅ Stable |
| Share → pie/donut | ✅ Stable |
| Outlier → histogram / H-bar rank | ✅ Stable |
| Rank / long labels → H-bar | ✅ Stable |
| Fallback chain | ⚠️ Residual risk if guards bypassed |

### Frontend alignment gates

| Gate | Purpose | Status |
|------|---------|--------|
| `insightChartMatchesCurrentQuestion` | Question/turn/title match | ✅ Active |
| `chartSnapshotMatchesQuestionIntent` | Blocks misleading department bars for outlier Qs | ✅ Active |
| `showInsightExportButton` | Export only when answer + viz aligned | ✅ Active |
| Charts tab Smart Read | No question gate (by design) | ✅ Active |

### Narrative grounding

- Prompt includes authoritative chart-values block.
- Fallback when `ANTHROPIC_API_KEY` missing returns template text (known limitation C4).
- Residual LLM drift risk on thin grounding (documented in bug inventory).

---

## 9. Known limitations (branch-wide)

| Limitation | Severity | Notes |
|------------|----------|-------|
| Single-process in-memory `df` | Critical for multi-user | One dataset per server process |
| `/preview` not filter-aware | High | Data Preview vs Insights cohort mismatch |
| Monolithic `page.tsx` / `main.py` | Medium | Maintainability |
| Bulk performance pending | Medium | Per commit message at `4247ef3` |
| Dual chart pipelines | Medium | Overview vs shared — drift risk |
| Line/Area/Scatter visual parity | Medium | **Primary chart UI polish target** |
| Charts/Insights continuous chart height feel | Medium | Shared vh band vs H-Bar category scaling |
| Overview minor axis/footer alignment | Low | Mini-card layout |
| No per-tab URLs | Low | By design |
| Client-spoofable plan tier | High (prod) | Server-side billing not wired |

---

## 10. Regression smoke test (recommended before fixes)

1. Upload showcase CSV → Overview KPIs + auto-dashboard grid (H-Bar, line, donut if present).
2. Apply filter → verify dashboard refresh.
3. AI Insights: ask trend question → line chart; ask share question → donut; ask outlier → histogram/H-bar.
4. Charts tab: select each timeline entry → verify metadata + Why strip.
5. Download PNG from Charts tab (H-Bar + line).
6. Export full PDF with chart section enabled.
7. Toggle dark mode → confirm on-screen charts readable; PDF stays light.

---

*Snapshot generated: 2026-06-16 — branch `chart-ui-polish-baseline` @ `4247ef3`.*
