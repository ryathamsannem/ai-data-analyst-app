# AI_INSIGHTS_LATEST_STATE.md

**UI-focused snapshot** for the AI Insights tab only. Use with [`LATEST_STABLE_UI_SNAPSHOT.md`](LATEST_STABLE_UI_SNAPSHOT.md) for app-wide context.

**As of:** May 2026 · **current working state only**

---

## Tab entry & shell

| Item | Value |
|------|--------|
| Tab id | `insights` |
| Page title | “AI Insights” (`MAIN_NAV_PAGE_TITLES`) |
| Root class | `ai-insights-page` on `<section>` + `aiInsightsOuterShell` |
| Location | `frontend/app/page.tsx` (`activeTab === "insights"`) |

### Layout (approved)

```
┌─ aiInsightsOuterShell (gradient card, rounded-[1.25rem]) ─────────────┐
│  aiInsightsGrid                                                        │
│  ┌─ Left (~268px max) ─────┐  ┌─ Right (1fr) ─────────────────────────┐ │
│  │ aiInsightsPanelShellScroll│  │ aiInsightsAskPanel + stack below   │ │
│  │ • Suggested Questions      │  │ • Ask AI (composer)                │ │
│  │ • Recent (last 3)          │  │ • Executive Insights (conditional) │ │
│  │                            │  │ • Confidence (conditional)         │ │
│  │                            │  │ • AI Answer                      │ │
│  │                            │  │ • Follow-ups, Provenance, Viz…   │ │
│  └────────────────────────────┘  └────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

- **Desktop:** `lg:grid-cols-[minmax(0,min(100%,268px))_minmax(0,1fr)]`, `gap-3` / `xl:gap-4`
- **Mobile:** single column (Suggested Questions above Ask AI)
- **Filters / dataset:** Above Insights shell when `columns.length > 0` — same as Overview (`FilterPanel` `appearance="dashboard"`, `ovCard` dataset strip)

---

## Shared filters & dataset (top of tab)

Not inside the gradient shell but part of Insights view:

- **FilterPanel** — `appearance="dashboard"` (same tokens as Overview: `ovCard`, `ovFilterControl`, drill path)
- **Dataset ready** — `ovCard` section: file, rows, columns, sheet, Replace file, optional sheet `<select>` with `ovFilterControl`

---

## Suggested Questions (left panel)

**Tokens:** `aiInsightsSuggested*` in `frontend/lib/ai-insights-ui.ts`

| Element | Token / behavior |
|---------|------------------|
| Shell | `aiInsightsPanelShellScroll` + `ai-insights-suggested-scroll` |
| Heading | `aiInsightsSuggestedHeading` |
| Cards | **Single** `aiInsightsSuggestedQ` for all items (no primary/secondary split) |
| Hover | Lift + border/shadow **only on hover** |
| Recent | `aiInsightsSuggestedRecentSection` / `RecentItem` |
| Scrollbar | 5px, hidden until panel hover (`globals.css`) |

**Approved direction:** Clean assistant sidebar; equal card weight; no “disabled” idle look.

---

## Ask AI (right panel, top)

**Tokens:** `aiInsightsAsk*` + `aiInsightsPanelShell` via `aiInsightsAskPanel`

| Element | Notes |
|---------|--------|
| Header | `aiInsightsAskHeaderRow` — title + compact `Reset conversation` (`btnSecondary` + `aiInsightsAskResetBtn`) |
| Meta row | Follow-up pills (emerald/violet) — only when `lastConversationMeta.followUpDetected` |
| Label | `aiInsightsAskQuestionLabel` |
| Composer | `aiInsightsAskComposer` — `gap-1` between textarea and button |
| Textarea | `aiInsightsAskTextarea`, min-h ~5.75rem / 6rem sm, dark `insights-layer-inset` |
| Submit | `btnPrimary` + `aiInsightsAskSubmitBtn` — premium hover in `globals.css` (lift + shadow) |

**Approved direction:** Compact premium composer; **not** a tall empty form; Ask AI dark panel is the **visual baseline** for other Insights surfaces.

---

## Executive Insights (inside Ask AI column)

**Component:** `AiExecutiveInsightsPanel`  
**Tokens:** `aiInsightsExecutive*`

| Element | Notes |
|---------|--------|
| Shell | `aiInsightsExecutiveShell`, `mt-3.5`, dark `insights-layer-card` |
| Title | `aiInsightsExecutiveTitle` — slate-600 / `#c8d4e8` dark |
| Brief | Optional AI context paragraph |
| KPI grid | `aiInsightsExecutiveGrid` — 2 cols → 4 cols `lg` |
| Cards | `aiInsightsExecutiveCard`, min-h `5.5rem`, left accent bar + dot |

**Gate:** `hasValidAIAnswer` + visualization + `insightExecutiveVizInsights.length > 0`

**Approved direction:** Subtle separation, equal card heights, readable labels — no KPI redesign.

---

## AI Answer (executive analysis panel)

**Tokens:** `aiInsightsAnswer*` · **body:** `AiInsightAnswerBody` / `formatInsightSummary`

### Structure

1. **Header** — kicker “Executive analysis” + title “AI Answer” (`aiInsightsAnswerHeader`)
2. **Lead** (optional) — domain/chart lead-in (`aiInsightsAnswerLead`)
3. **Summary panel** — inset card (`aiInsightsAnswerSummaryPanel`) with `formatInsightSummary` (labels like “Key findings:” emphasized)
4. **Supporting detail** — `aiInsightsAnswerDetailsGroup` with accordions:
   - **Key findings** — `open` by default, `variant="findings"` list styling
   - Hypotheses / Recommendations / Methodology / More — badges (Context, Action, Method, More)

### Inline formatting

- `formatInsightInline` — `**bold**` + numeric metric highlights (`aiInsightsAnswerBodyMetric`)
- Lists auto-detected from bullet lines

### Dark mode text tokens (readability pass)

Defined on `.dark .ai-insights-page` in `globals.css`:

| Token | Hex (fallback) | Use |
|-------|----------------|-----|
| `--insights-answer-body` | `#d2dce9` | Paragraphs |
| `--insights-answer-emphasis` | `#eef2f8` | Labels, accordion titles, bold |
| `--insights-answer-metric` | `#f8fafc` | Numbers, salaries, counts |
| `--insights-answer-label` | `#b4c4dc` | Kickers, section labels |

**CSS enforcement:** `.ai-insights-answer-summary`, `.ai-insights-answer-body-para`, `.ai-insights-answer-body-metric`, etc.

### Light mode

Unchanged: slate-800 summary, slate-600 body, slate-900 metrics.

---

## Below AI Answer (same right column)

| Block | Token prefix | When shown |
|-------|--------------|------------|
| Confidence | `aiInsightsConfidence*` | Valid answer + alignment |
| Suggested follow-ups | `aiInsightsFollowup*` | Chips → `askAI()` |
| Provenance | `aiInsightsProvenance*` | “How this insight was generated” |
| Visualization | `aiInsightsViz*` + `AiInsightChartShell` | Chart data present |
| Export insight PDF | buttons + `pdf-report` | User action |

---

## Theme consistency (Insights)

### Dark layer stack (`.dark .ai-insights-page`)

```text
--insights-layer-shell:   #0a1224
--insights-layer-panel:   #0f172a
--insights-layer-card:    #172238
--insights-layer-nested:  #1e2f4f
--insights-layer-inset:   #1a2744
--insights-border-soft:   rgba(255,255,255,0.08)
--insights-border-medium: rgba(255,255,255,0.14)
--insights-text-secondary: #e8eef7
--insights-text-muted:     #a8b8d0
```

### Rules (do not regress)

1. Use **`ai-insights-ui.ts`** exports for Insights-only surfaces — don’t duplicate Overview tokens on Insights cards  
2. **Ask AI** inset + border = reference for nested panels  
3. **AI Answer** uses `--insights-answer-*` for all body copy — not `--insights-text-muted` alone  
4. **No** `color-mix(..., transparent)` on dark containers that wrap paragraphs  
5. **No** text opacity modifiers on dark (`/75`, `/88`) for body content  
6. **Solid** dark backgrounds on summary panel + supporting detail group  

### Light mode

- Uses global `--surface-*` + slate text classes on tokens  
- Insights outer shell: light gradient wash (not dark layer vars)

---

## Responsive behavior

| Breakpoint | Behavior |
|------------|----------|
| `< lg` | Single column; full-width panels |
| `lg+` | 268px suggested column + flexible Ask AI column |
| Zoom 80–125% | Grid and composer tested informally; use relative units / minmax |

Left panel: `lg:max-h-[calc(100vh-12rem)]`, `overflow-y-auto`.

---

## Approved visual direction (summary)

- **Premium executive analysis** — not chat bubbles; structured cards and accordions  
- **Restrained indigo/violet** accents on findings and focus states  
- **Equal weight** suggested questions; compact Ask AI composer  
- **Overview-aligned** filters and dataset strip above the Insights shell  
- **Centered, readable charts** in visualization card (shared chart stack)  

---

## Remaining issues / watch list

| Item | Severity | Notes |
|------|----------|--------|
| Long answers without `##` sections | Medium UX | Content stays in summary; accordions may be empty — parser in `parseAnswerIntoSections` |
| Provenance body `dark:bg-.../90` | Low | Possible slight fade vs Ask AI text |
| Follow-up chips `foreground/88` | Low | Minor dark contrast |
| Metric regex gaps | Low | Unusual formats may not highlight (e.g. spelled-out numbers) |
| Contrast at extreme zoom | Low | Re-verify 80%/125% after token changes |
| `page.tsx` size | Maintenance | Insights UI not extracted to separate route component |

**Not current blockers:** Primary/secondary suggested question split (removed); white filter cards on dark (fixed via `appearance="dashboard"`); AI Answer “unreadable gray” (addressed with answer-specific tokens — **re-test** in product).

---

## Key files (edit map)

| Change type | File |
|-------------|------|
| Insights tokens | `frontend/lib/ai-insights-ui.ts` |
| Dark insights variables + answer overrides | `frontend/app/globals.css` (`.ai-insights-page` section) |
| Layout / gates | `frontend/app/page.tsx` |
| Executive KPIs | `frontend/app/components/ai-executive-insights-panel.tsx` |
| Answer body formatting | `frontend/app/components/ai-insight-answer-body.tsx` |
| Section labels | `frontend/lib/ux-narrative.ts` (`AI_INSIGHT_SECTION_LABELS`) |
| Filters | `frontend/app/components/home/filter-panel.tsx` |

---

## Do not use as current truth

- Older notes referencing `appearance="insights"` or `appearance="legacy"` for Insights filters  
- `3fr / 7fr` grid split (replaced by `268px / 1fr`)  
- Separate `aiInsightsFilter*` / `aiInsightsDataset*` tokens (removed; Overview tokens reused)  
- “AI Answer unreadable” as **open** bug without re-verifying after May 2026 contrast pass  

---

*End of AI Insights UI snapshot.*
