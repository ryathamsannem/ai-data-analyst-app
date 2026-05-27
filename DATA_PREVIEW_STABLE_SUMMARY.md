# Data Preview — Stable Summary

**Status:** STABLE baseline (May 2026)  
**Scope:** `activeTab === "preview"` — tabular exploration, quality signals, compact dataset metadata.  
**Recovery use:** Pre–Export/PDF enhancement snapshot. Extend in place; do not broad-redesign.

**Related:** [`AGENTS.md`](AGENTS.md) · [`PROJECT_ARCHITECTURE_SUMMARY.md`](PROJECT_ARCHITECTURE_SUMMARY.md) · [`UI_BASELINE_RULES.md`](UI_BASELINE_RULES.md) · [`UI_ARCHITECTURE_SNAPSHOT.md`](UI_ARCHITECTURE_SNAPSHOT.md)

---

## 1. Purpose

Data Preview is the **row-level inspection** surface:

- Paginated table of loaded rows (`/preview` backend).
- Column-level quality badges (type, missing %, ID, unique).
- Full-width search across all columns (`useDeferredValue`).
- AI suggestion chips that can prefill AI Insights questions.
- **Compact dataset summary** — same visual language as Overview, without Replace file.

**Does not** host interactive filters (filters live on Overview + AI Insights only).

---

## 2. Component hierarchy

```
activeTab === "preview" (page.tsx ~10347+)
└─ section.mb-6
   └─ header row (flex col → lg row)
      ├─ dpPreviewHeaderMain
      │  ├─ dpSectionTitle — "Data Preview"
      │  ├─ dpSectionDesc — row window copy
      │  └─ DataPreviewDatasetContext  ← dataset strip
      └─ Rows limit select (dpControl)
   ├─ dpToolbarRow
   │  └─ dpSearchWrap → dpSearchInput
   ├─ dpSuggestionsPanel (optional AI chips)
   ├─ dpInsightsPanel (column quality notes)
   └─ dpTableShell → dpTableScroll → dpTable
```

### Extracted component

| Component | Path |
|-----------|------|
| `DataPreviewDatasetContext` | `frontend/app/components/home/data-preview-dataset-context.tsx` |

Memoized; uses Overview tokens (`ovCard`, `ovDataLabel`, `ovDataValue`, `ovMuted`) + Data Preview spacing hooks.

---

## 3. Dataset metadata card standard

### Layout (matches Overview inner grid)

| Cell | Content |
|------|---------|
| Status | Green dot + **Dataset ready** (emerald text) |
| File | Stem truncation + preserved extension + **·** + size |
| Rows | `rows.toLocaleString()` |
| Columns | `columnCount.toLocaleString()` |
| Sheet | CSV label or selected sheet name |

**Not included:** Replace file button (Overview-only action via `openOverviewReplaceUpload`).

### Filename truncation (stable)

| Rule | Implementation |
|------|----------------|
| Split | `splitFileName()` — last `.` separates stem / extension |
| Stem | `truncate` on `min-w-0` span inside `flex-1 overflow-hidden` group |
| Extension | `shrink-0 whitespace-nowrap` — always visible (e.g. `.csv`) |
| Full name | `title` attribute on `<dd>` |
| File size | Separate flex item: `· {formatBytes(n)}` — never overlaps extension |

**File cell width:** `dpDatasetContextFileCell` — `sm:max-w-[14rem] md:max-w-[18rem] lg:max-w-[22rem]`.

**Header column width:** `dpPreviewHeaderMain` — `lg:max-w-[min(54rem,calc(100%-11.5rem))]` for balance vs Rows control.

### Dark / light mode

- Reuses `ovCard` — inherits global card tokens and dark overrides.
- Muted labels: `ovMuted`, `ovDataLabel`.
- Values: `ovDataValue` / `font-medium text-foreground` on file row.

---

## 4. Token module (`data-preview-ui.ts`)

| Export | Role |
|--------|------|
| `dpSectionTitle` | Page heading |
| `dpSectionDesc` | Subtitle / row window explanation |
| `dpPreviewHeaderMain` | Wider header column for dataset strip |
| `dpDatasetContextStrip` | `mt-3 w-full min-w-0 p-4 sm:p-5` on `ovCard` |
| `dpDatasetContextFileCell` | Responsive max-width on File column |
| `dpControl` | Rows dropdown |
| `dpSearchInput` / `dpSearchWrap` | Search field |
| `dpToolbarRow` | Search + actions row |
| `dpSuggestionsPanel` | AI suggestion chips container |
| `dpSuggestionChip` | Individual chip |
| `dpTableShell` / `dpTableScroll` / `dpTable` | Table chrome |
| `dpThBtn`, `dpThName`, `dpThMeta` | Column headers + badges |
| `dpBadge*` | Type / missing / ID / unique / clean |
| `dpCell*`, `dpNullPill` | Body cells, null styling |

**Table CSS:** `data-preview-*` classes in `frontend/app/globals.css`.

---

## 5. Table and search behavior

| Feature | Implementation |
|---------|----------------|
| Row limit | Select: 10 / 25 / 50 / 100 / all → `fetchPreviewRows` |
| Search | `dataPreviewSearchQuery` + `useDeferredValue` for filter |
| Sort | Column header buttons in `dpThBtn` |
| Missing values | `dpCellNull` + `dpNullPill` |
| Sticky row index | `dpCellSticky` |
| Empty states | `dpEmptyState`, `dpEmptySearch` |

---

## 6. AI suggestions integration

| Behavior | Detail |
|----------|--------|
| Chips | `dpSuggestionChip` — truncated labels, hover accent wash |
| Click | Can `setActiveTab("insights")` + prefill question (`page.tsx` ~10460) |
| Panel | `dpSuggestionsPanel` above table when suggestions exist |

---

## 7. Responsive behavior

| Breakpoint | Layout |
|------------|--------|
| Default | Stacked header; full-width search |
| `lg+` | Title/dataset left, Rows control right (`justify-between`) |
| Table | Horizontal scroll in `dpTableScroll` |

**Do not** resize the dataset card shell — only internal truncation adapts.

---

## 8. Cross-tab metadata rules

| Tab | Dataset UI |
|-----|------------|
| Overview | Full card + Replace file |
| **Data Preview** | `DataPreviewDatasetContext` (this doc) |
| AI Insights | No inline card — header “Dataset loaded” |
| Charts | None |
| Export | Report summary rows/columns only |

Avoid re-adding duplicate dataset strips to Insights or Charts.

---

## 9. Critical files

| Path | Role |
|------|------|
| `frontend/app/page.tsx` | Preview tab JSX, search, table, suggestions |
| `frontend/app/components/home/data-preview-dataset-context.tsx` | Dataset strip |
| `frontend/lib/data-preview-ui.ts` | Design tokens |
| `frontend/lib/overview-ui.ts` | Shared card / data label tokens |
| `frontend/app/globals.css` | `data-preview-*` table styles |
| `backend/main.py` | `/preview` endpoint |

---

## 10. Stable UX decisions (do not regress)

1. **Extension-preserving truncation** on filename stem only.
2. **Separated file size** — flex row with gap; size never touches `.csv`.
3. **Overview visual parity** for dataset grid (without Replace file).
4. **No filter bar** on Data Preview tab.
5. **Deferred search** for performance on large previews.
6. **Do not** widen or restructure the dataset card for layout experiments.

---

## 11. Known pending items

| Item | Notes |
|------|--------|
| Export / PDF | Not part of Data Preview tab — separate phase |
| Overview file row | Overview still uses single-line truncate + `(size)` — intentional difference |

---

*Last updated: May 2026 — stable baseline before Export/PDF enhancements.*
