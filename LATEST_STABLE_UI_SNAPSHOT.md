# LATEST_STABLE_UI_SNAPSHOT.md

**Canonical continuation snapshot** for the AI Data Analyst SaaS application.  
**As of:** June 29, 2026 · reflects **current working UI** including completed chart polish pass and final consistency audit.

**Also read:** [`AGENTS.md`](AGENTS.md) · [`UI_BASELINE_RULES.md`](UI_BASELINE_RULES.md) · [`PROJECT_ARCHITECTURE_SUMMARY.md`](PROJECT_ARCHITECTURE_SUMMARY.md) · [`CHARTS_STABLE_SUMMARY.md`](CHARTS_STABLE_SUMMARY.md) · [`DATA_PREVIEW_STABLE_SUMMARY.md`](DATA_PREVIEW_STABLE_SUMMARY.md) · [`AI_INSIGHTS_STABLE_SUMMARY.md`](AI_INSIGHTS_STABLE_SUMMARY.md) · [`UI_ARCHITECTURE_SNAPSHOT.md`](UI_ARCHITECTURE_SNAPSHOT.md) · [`AI_VISUALIZATION_BEHAVIOR.md`](AI_VISUALIZATION_BEHAVIOR.md) · [`docs/current-snapshot/chart-polish-final-snapshot.md`](docs/current-snapshot/chart-polish-final-snapshot.md)

**Recovery point:** June 2026 — chart polish complete at `DEV` / `16526f0`; PDF/AI alignment complete; optional export-contract hardening only.

---

## 1. Application Overview

### Purpose

Single-page analytics workspace: upload CSV/Excel, explore data with filters and auto-dashboard charts, ask natural-language questions, and export executive-style PDF reports. Backend uses Claude for `/ask`; frontend renders Recharts visualizations and structured narrative UI.

### Main modules / tabs

| Tab id | Label | Role |
|--------|--------|------|
| `overview` | Overview | Auto-dashboard KPI grid, mini charts, AI summary, dataset-ready card |
| `preview` | Data Preview | Tabular data exploration |
| `insights` | AI Insights | Suggested questions, Ask AI, executive/answer/viz stack |
| `charts` | Charts | Session chart builder + timeline aside |
| `export` | Export | Report / PDF export controls |

**Routing:** No URL routes per tab — `activeTab` state in `frontend/app/page.tsx` inside `AppShell`.

### Design philosophy

- **Premium enterprise SaaS** — clarity, trust, restrained motion
- **Extend in place** — fix narrow layers; no wholesale redesigns of working regions
- **Shared semantics** — same chart kinds and filter behavior across Overview, Insights, Charts, PDF
- **Theme-first** — CSS variables in `globals.css`; tab-specific token modules where needed

### Styling direction

- Light: soft slate workspace (`#f8fafc`), white cards, subtle shadows, indigo/violet accent
- Dark: deep navy stack (`#071028` → `#111827` cards), scoped **insights layer** variables on `.ai-insights-page`
- Controls: unified **52px** filter bar height, `rounded-xl` / `rounded-2xl` cards, `saas-btn-premium` / `saas-btn-accent` buttons

---

## 2. Current Stable UI Areas

Visually approved / stabilized (fix bugs in place only):

| Area | Status |
|------|--------|
| **Overview** | KPI cards, auto-dashboard chart grid, AI summary panel, dataset-ready card (`ovCard` tokens) |
| **Interactive filters** | Shared `FilterPanel` with `appearance="dashboard"` on Overview **and** AI Insights; 52px control height |
| **Dataset summary** | **Overview:** full card + Replace file · **Data Preview:** `DataPreviewDatasetContext` · **Insights/Charts:** no duplicate card (header badge) |
| **Data Preview** | Table, deferred search, quality chips, extension-preserving filename — [`DATA_PREVIEW_STABLE_SUMMARY.md`](DATA_PREVIEW_STABLE_SUMMARY.md) |
| **Charts tab** | Timeline + preview, labels/axes polish, PNG density, signed bars — [`CHARTS_STABLE_SUMMARY.md`](CHARTS_STABLE_SUMMARY.md) |
| **AI Insights shell** | Outer gradient card + two-column grid (Suggested Questions \| Ask AI column) |
| **Suggested Questions** | Unified question cards, hover-only lift, thin hover scrollbar on left panel |
| **Ask AI** | Compact composer, premium submit hover, Reset aligned with header |
| **Executive Insights** | KPI fact cards inside Ask AI flow; aligned min-heights |
| **AI Answer** | Executive analysis panel: summary inset, accordion “Supporting detail”, metric highlighting |
| **Dark / light mode** | `class="dark"` on `<html>` via `frontend/lib/theme.ts` + `ThemeScript` |
| **Responsive** | Single column on mobile; `lg:` grid splits; filters wrap; chart grids 1→2 cols |
| **Sidebar / nav** | Collapsible `AppSidebar`, icon rail, `MainNavTabs` pill bar |
| **Export / PDF** | Functional + AI/chart aligned — chart embed matches on-screen styling; optional contract hardening only |

---

## 3. Current Design System

### Spacing

- Card padding: `p-3`–`p-5` / `sm:p-5` on major shells
- Section stacks: `space-y-3`–`space-y-4` (Insights), `gap-3` / `xl:gap-4` on grids
- Filter grid: `gap-x-3 gap-y-3`, 52px control height

### Border radius

- Cards: `rounded-2xl` (primary), inner panels `rounded-xl`, chips `rounded-full` / `rounded-lg`
- Buttons: `rounded-[0.625rem]` (premium), `rounded-xl` (inputs)

### Card hierarchy

1. **Workspace** — page background + optional page gradient  
2. **Tab shell** — e.g. `aiInsightsOuterShell`, Overview sections  
3. **Panel** — `aiInsightsPanelShell` / `ovCard`  
4. **Inset** — summary panels, accordion group, executive brief  

### Typography

- **Page title:** shell header / `text-lg`–`text-base font-semibold`
- **Kickers:** `text-[10px]–[11px] uppercase tracking-[0.1em]–[0.14em]`
- **Body:** `text-sm` / `text-[14px]–[15px]`, `leading-[1.65]–[1.72]`
- **Data:** `tabular-nums` on metrics; `overview-data-label` / `overview-data-value` on Overview

### Color / tokens

| Layer | Location |
|-------|----------|
| Global light/dark | `frontend/app/globals.css` (`:root`, `.dark`) |
| Overview UI | `frontend/lib/overview-ui.ts` (`ovCard`, `ovFilterControl`, …) |
| AI Insights UI | `frontend/lib/ai-insights-ui.ts` |
| Buttons | `frontend/lib/ui-buttons.ts` + `.saas-btn-*` in `globals.css` |
| Insights dark layers | `.dark .ai-insights-page { --insights-layer-* }` in `globals.css` |

### Dark mode

- Base surfaces: `--card`, `--surface-elevated`, `--surface-inset`
- Insights tab adds `--insights-layer-shell` … `--insights-layer-inset`, `--insights-border-soft|medium`, text tiers
- AI Answer adds `--insights-answer-body|emphasis|metric|label` (scoped readability)

### Light mode

- Explicit slate/white surfaces; avoid washed-out panels via `color-mix` on **light** inset cards only
- AI Answer summary uses subtle inset highlight (`shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]`)

### Hover / focus

- Cards: light `hover:shadow-md` on panel shells only where tokenized
- Ask AI submit: `translateY(-2px)` + accent shadow (`globals.css`)
- Suggested questions: hover border/background shift; no “always active” styling
- Focus: ring on inputs/chips; softened textarea focus (no heavy purple glow in light)

### Glass / shadow

- **No heavy glassmorphism** — occasional `backdrop-blur` on mobile nav overlay only
- Shadows: `--shadow-sm`, `--shadow-md`, `--shadow-card`; dark uses subtle inset highlights on cards

### Charts

- Recharts; shared `ChartRenderer`, `chart-layout-config`, `ChartInsightViewportWrapper`, `AiInsightChartShell`
- Centered plots; axis tokens `--chart-axis-tick`, `--chart-axis-line` (dark overridden under `.ai-insights-page`)
- **Chart polish (June 2026):** V/H-Bar labels, donut sorting, line/area labels, PNG density tiers, signed bars, close-value axes — all surfaces pass final audit ([`chart-polish-final-snapshot.md`](docs/current-snapshot/chart-polish-final-snapshot.md))

---

## 4. Current Technical Architecture

### Frontend

| Piece | Technology |
|-------|------------|
| Framework | **Next.js 16** (App Router) |
| UI | **React 19**, **TypeScript** |
| Styling | **Tailwind CSS v4** (`@import "tailwindcss"`), CSS variables |
| Charts | **Recharts 3** |
| Fonts | Geist / Geist Mono (`layout.tsx`) |

### Backend

| Piece | Technology |
|-------|------------|
| API | **FastAPI** (`backend/main.py`) |
| Data | **pandas** |
| LLM | **Anthropic Claude** (`/ask`, upload profiling) |
| CORS | `localhost:3000` |

### State management

- **Local React state** in `page.tsx` (dataset, filters, tab, Q&A, charts)
- **`ChartSessionProvider`** (`frontend/contexts/chart-session-context.tsx`) for Charts tab session
- **localStorage:** theme (`theme.ts`), sidebar collapse (`sidebar-prefs.ts`)

### Export

- **`jspdf`** + **`html2canvas`** via `frontend/app/pdf-report.ts`
- Off-screen chart capture refs in `page.tsx` (`chartCaptureInsightRef`, overview capture)
- Narrative sections aligned with UI `parseAnswerIntoSections` contract

### Theme

- `ThemeScript` prevents flash; `applyResolvedTheme` toggles `document.documentElement.classList.toggle("dark")`
- Preference key: `ai-data-analyst-theme`

### Responsiveness

- Tailwind breakpoints (`sm:`, `lg:`, `xl:`)
- Insights grid: `lg:grid-cols-[minmax(0,min(100%,268px))_minmax(0,1fr)]`
- Overview chart grid: CSS `.overview-chart-grid` (1 col → 2 cols)
- Sidebar: drawer overlay on small screens

### Performance (implemented)

- Widespread **`useMemo` / `useCallback`**
- **`useTransition`** on main tab switches
- **`React.memo`** on shell components (`FilterPanel`, `AiExecutiveInsightsPanel`, nav, chart helpers)
- **`useDevRenderCount`** in dev on hot components
- Recharts animation disabled above point threshold (constant in `page.tsx`)

---

## 5. Current Stable Components

| Component | Path | Purpose |
|-----------|------|---------|
| `AppShell` | `components/app-shell/app-shell.tsx` | Sidebar + header + workspace |
| `AppSidebar` | `components/app-shell/app-sidebar.tsx` | Nav icons, collapse |
| `MainNavTabs` | `components/home/main-nav-tabs.tsx` | Tab bar |
| `FilterPanel` | `components/home/filter-panel.tsx` | Interactive filters (dashboard appearance) |
| `ChartRenderer` | `components/home/chart-renderer.tsx` | Central chart drawing |
| `ChartInsightViewportWrapper` | `components/home/chart-insight-viewport-wrapper.tsx` | Centered insight plot viewport |
| `AiInsightChartShell` | `components/ai-insight-chart-shell.tsx` | Insight chart frame + min height |
| `AiExecutiveInsightsPanel` | `components/ai-executive-insights-panel.tsx` | Viz-derived KPI cards |
| `AiInsightAnswerBody` | `components/ai-insight-answer-body.tsx` | Parsed answer body, metrics, bullets |
| `OverviewKpiCard` | `components/home/overview/overview-kpi-card.tsx` | Overview KPI tile |
| `OverviewAiSummaryPanel` | `components/home/overview/overview-ai-summary.tsx` | Overview AI blurb |
| `ChartsTimelineAside` | `components/home/charts-timeline-aside.tsx` | Charts tab timeline |
| `DataPreviewDatasetContext` | `components/home/data-preview-dataset-context.tsx` | Data Preview dataset strip |
| `SmartChartInsightPanel` | `components/SmartChartInsightPanel.tsx` | Optional smart chart copy |
| `ThemeToggle` | `components/theme-toggle.tsx` | Light/dark control |

**Token modules:** `overview-ui.ts`, `ai-insights-ui.ts`, `charts-tab-ui.ts`, `ui-buttons.ts`, `data-preview-ui.ts`

---

## 6. Current Known Issues

Only **unresolved or monitor** items (not fixed historical attempts).

| Issue | Notes |
|-------|--------|
| **Monolithic `page.tsx`** | ~11k lines; UI logic concentrated — refactors are out of scope unless requested |
| **Answer parser shape** | Without `##` section headers, long replies may stay in **summary** only; accordions empty |
| **Provenance dark inset** | `aiInsightsProvenanceBody` uses `dark:bg-[...]/90` — watch for slight fade vs Ask AI |
| **Follow-up chip text** | `text-[var(--foreground)]/88` in dark — minor contrast vs body |
| **PDF bundle** | `pdf-report.ts` statically imported from `page.tsx` — not code-split |
| **AI Answer contrast** | **Recently hardened** with `--insights-answer-*` tokens + `globals.css` overrides; verify at 80%/125% zoom and very long content |
| **WCAG audit** | Contrast improved by design pass; no formal audit logged in repo |

Do **not** treat deprecated docs (`AI_INSIGHTS_STABLE_SUMMARY.md` old grid/filter notes) as current.

---

## 7. Current UX Rules

Established product rules (see `AGENTS.md`):

1. **No redesigns** of working Overview / Insights / Charts / Timeline / PDF blocks without explicit ask  
2. **Preserve layout** structure and two-column Insights grid  
3. **Preserve responsiveness** (mobile stack, desktop split)  
4. **Preserve spacing system** — extend tokens, don’t invent one-off margins  
5. **No hardcoded dataset domains** in copy — use metadata / `ux-narrative.ts` helpers  
6. **Enterprise SaaS tone** — no flashy gradients, oversized chrome, or novelty chrome  
7. **Chart semantics frozen** — horizontal bars stay horizontal; same kinds across surfaces  
8. **Filters aligned** — single date bar, 52px controls, dashboard appearance on Insights  
9. **Small scoped diffs** — narrowest owning file (tokens → component → page)  

---

## 8. Theme Consistency Rules

| Rule | Detail |
|------|--------|
| **Ask AI baseline** | Dark Ask AI panel (`insights-layer-inset`, border-soft) is reference for Insights surfaces |
| **AI Answer parity** | Answer text uses `--insights-answer-body` / `emphasis` / `metric` — not generic muted gray |
| **Semantic tokens** | Prefer `var(--card)`, `ovCard`, `aiInsights*` exports over raw hex except scoped insights palette |
| **No opacity stacking** | Avoid `color-mix(..., transparent)` on dark **container** backgrounds for text-heavy panels |
| **No faded body text** | Dark body ≥ `#d2dce9` equivalent; metrics brightest (`#f8fafc`) |
| **WCAG-friendly** | Stronger contrast pass completed for AI Answer; keep hierarchy without pure white everywhere |
| **Overview vs Insights** | Overview uses global + `overview-ui`; Insights uses `ai-insights-ui` + `.ai-insights-page` scope |

---

## 9. Current File / Folder Architecture (UI-relevant)

```
AI-Data-Analyst-App/
├── AGENTS.md
├── PROJECT_ARCHITECTURE_SUMMARY.md       ← Onboarding + file index
├── UI_BASELINE_RULES.md                  ← Product UI rules (canonical)
├── LATEST_STABLE_UI_SNAPSHOT.md          ← this file
├── CHARTS_STABLE_SUMMARY.md              ← Charts tab baseline
├── DATA_PREVIEW_STABLE_SUMMARY.md        ← Data Preview baseline
├── AI_INSIGHTS_STABLE_SUMMARY.md
├── UI_ARCHITECTURE_SNAPSHOT.md
├── AI_VISUALIZATION_BEHAVIOR.md
├── AI_INSIGHTS_LATEST_STATE.md
├── backend/
│   └── main.py                           # FastAPI + /ask + upload
└── frontend/
    ├── app/
    │   ├── page.tsx                      # Main SPA (all tabs)
    │   ├── layout.tsx
    │   ├── globals.css                   # Theme variables + component CSS
    │   ├── pdf-report.ts                 # PDF generation
    │   ├── chart-types.ts
    │   ├── dashboard-filter-types.ts
    │   └── components/
    │       ├── home/                     # Overview, charts, filters
    │       ├── ai-insight-chart-shell.tsx
    │       ├── ai-executive-insights-panel.tsx
    │       └── ai-insight-answer-body.tsx
    ├── components/
    │   ├── app-shell/                    # Shell, sidebar, header
    │   └── theme-toggle.tsx
    ├── contexts/
    │   └── chart-session-context.tsx
    └── lib/
        ├── overview-ui.ts
        ├── ai-insights-ui.ts
        ├── theme.ts
        ├── ui-buttons.ts
        └── ux-narrative.ts               # Section labels, lead-ins
```

---

## 10. Next Recommended Enhancements

**Primary next phase:** **Export / PDF** finalization (UI polish, dark capture, WYSIWYG parity, code-split).

Other optional items:

1. **Code-split** `pdf-report.ts` / html2canvas for faster initial load  
2. **Section parser UX** — detect plain-text “Key findings:” headers even without `##` markdown  
3. **Contrast pass** on provenance + follow-up chips (remove `/88` and `/90` on dark text surfaces)  
4. **Extract Insights column** from `page.tsx` into `AiInsightsTab.tsx` (structure only, no visual change)  
5. **Automated contrast checks** for `.ai-insights-page` in dark mode (Storybook or Playwright screenshot suite)  
6. **Charts tab polish** — align timeline aside tokens with Overview filter chrome where still divergent  

---

*End of snapshot — update this file when stable UI baseline changes materially.*
