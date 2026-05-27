# UI / UX — Stable Baseline (May 2026)

**Recovery snapshot:** After PDF Export Phase 2; UI/charts/insights/responsive behavior frozen for incremental work only.

**Rules:** [`AGENTS.md`](AGENTS.md) · [`UI_BASELINE_RULES.md`](UI_BASELINE_RULES.md)

---

## 1. Stable layouts (by tab)

| Tab | Layout |
|-----|--------|
| **Overview** | KPI grid, auto-dashboard chart cards (360px), full dataset card, filters, upload/mapping |
| **Data Preview** | Compact dataset strip, searchable table, column suggestions |
| **AI Insights** | Two-column: questions left, answer + viz right; fixed plan widths (760/850/900) |
| **Charts** | Timeline aside + main preview (≤860px viewport); intelligence strip, Why-this-chart |
| **Export** | Branding, section toggles, preview summary, download CTA |

**No per-tab URLs** — `activeTab` in `HomeInner` inside `AppShell`.

---

## 2. Sidebar and shell

| Piece | Behavior |
|-------|----------|
| `AppShell` | Sidebar + header + scrollable workspace |
| `AppSidebar` | Tab navigation; collapse preference in `sidebar-prefs.ts` |
| `AppHeader` | Dataset status badge (non-Overview tabs) |
| Viewport | `viewportH` / `viewportW` with debounced resize (~140ms) |

---

## 3. Chart responsiveness

| Surface | Viewport rule |
|---------|----------------|
| Charts tab | `ChartInsightViewportWrapper`, session ≤860px |
| AI Insights | `AiInsightChartShell`, plan 760/850/900 + height cap |
| Overview | Separate mini-chart path (360px), **not** `computeFinalChartPresentation` |
| Shared renderer | `ChartRenderer` + `insightMode` flag |

**Horizontal bars** stay horizontal everywhere. Centering via shared layout helpers — do not replace with unmeasured fluid layouts.

---

## 4. Dark / light mode

| Mechanism | Detail |
|-----------|--------|
| Toggle | `theme.ts`, `ThemeScript`, `ThemeToggle` |
| Storage | `localStorage` theme preference |
| Tokens | `globals.css` `:root` / `.dark` |
| Tab scopes | `ai-insights-ui.ts`, `charts-tab-ui.ts`, `overview-ui.ts`, `data-preview-ui.ts` |
| PDF export | **Always print-light** in PDF (UI theme does not affect PDF) |

---

## 5. Export tab styling

- Premium SaaS cards aligned with Overview/Insights
- Toggles for PDF sections; technical appendix optional
- Report preview summary (rows/columns, viz status) — no duplicate dataset card
- Branding fields persist via `loadReportBranding` / `saveReportBranding`

---

## 6. Premium UI direction

- Enterprise analytics SaaS: clarity, spacing, restrained shadows
- `rounded-2xl` cards, indigo/violet accent, `tabular-nums` on metrics
- Section hierarchy: page title → kickers → card titles → chart titles → metadata chips
- Informational chips use insight answer tokens (not disabled opacity)

---

## 7. Card spacing rules

| Context | Standard |
|---------|----------|
| Major cards | `p-4 sm:p-5` / `p-5 sm:p-6` |
| Section stacks | `space-y-3`–`space-y-4` |
| Filter bar | **52px** unified height (`FilterPanel`, `appearance="dashboard"`) |
| Charts plot | Tight top rhythm — minimal dead `min-h` |
| Insights viz | Shell height via CSS vars; viewport wrapper |

---

## 8. Typography hierarchy

| Level | Typical use |
|-------|-------------|
| Page title | Tab header in shell |
| Section kicker | Uppercase 10–11px labels |
| Card title | `text-sm` semibold |
| Body | `text-sm` normal |
| Muted meta | Tokenized muted colors per tab |

---

## 9. Grid system

- Overview KPIs: responsive grid
- Insights: CSS grid two-column at `lg+`
- Charts: aside + main flex; timeline scroll
- Filters: unified grid with grouped date range (single bar)

---

## 10. Tab consistency

| Rule | Detail |
|------|--------|
| Dataset card | Overview full card only; Preview compact strip; Insights/Charts none |
| Filters | Overview + Insights only |
| Replace file | Overview only → `openOverviewReplaceUpload()` |
| Chart types | Same semantics across Overview (mini), Charts, Insights, PDF |

---

## 11. What not to change without approval

- Working Overview, Insights, Charts, filter bar layouts
- `computeFinalChartPresentation` for session/insight paths
- Insight–chart sync gates
- Horizontal bar orientation
- Established viewport width caps

**Safe:** narrow fixes, contrast, axis margins, PDF polish in `pdf-report.ts` when requested.

---

*Last updated: 2026-05-21 — paired with `stable/pdf-export-phase2`.*
