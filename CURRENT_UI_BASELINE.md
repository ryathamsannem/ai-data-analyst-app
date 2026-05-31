# Current UI Baseline

**Status:** Current implementation snapshot (May 2026)  
**Scope:** Documents the **live UI** as implemented — documentation only; not a redesign spec.

**Related:** [`PROJECT_ARCHITECTURE_SUMMARY.md`](PROJECT_ARCHITECTURE_SUMMARY.md) · [`UI_BASELINE_RULES.md`](UI_BASELINE_RULES.md) · [`AGENTS.md`](AGENTS.md)

---

## Design language (global)

| Principle | Current implementation |
|-----------|------------------------|
| Tone | Premium enterprise analytics SaaS |
| Surfaces | `rounded-2xl` cards, `rounded-xl` controls, restrained shadows |
| Accent | Indigo/violet wash; emerald for dataset-ready status |
| Theme | `class="dark"` on `<html>` via `lib/theme.ts`; tokens in `globals.css` |
| Typography | `text-sm` body; tabular nums on metrics; muted secondary labels |
| Motion | ~150–220ms transitions; reduced-motion respected on Charts animations |

---

## Overview tab

### Empty state (`columns.length === 0`)

| Element | Behavior |
|---------|----------|
| Intro copy | Short muted paragraph above grid |
| Upload card | `ovCard` — title **Upload**, full-width clickable dropzone |
| Formats | CSV, Excel, JSON, JSONL, Parquet — capability chips + helper text |
| File picker | Hidden input; entire dropzone opens picker |
| Selected file | `OverviewUploadSelectedState` — horizontal confirmation, “Ready to upload”, “Click to replace dataset” |
| Primary CTA | **Upload Dataset** — disabled until file selected; uploads when file present |
| No dataset summary | Dataset-ready card hidden |

### Uploaded state (`columns.length > 0`, not replacing)

| Element | Behavior |
|---------|----------|
| Dataset summary | Full-width `ovCard` spanning grid — **Dataset ready** (green dot) |
| Metadata grid | File (middle-truncate filename + size on separate line), Rows, Columns, Sheet |
| Replace file | `ovOverviewSecondaryBtn` — routes to expanded upload UI |
| Upload card | Hidden unless `overviewUploadExpanded` (replace flow) |
| KPI section | `OverviewKpiCard` grid |
| Auto-dashboard | Mini chart cards at **360px** plot height |
| AI summary | `OverviewAiSummaryPanel` |

### Replace / re-upload state

- Upload card returns with title **Upload a new file**
- Same dropzone + selected-state UX as initial upload
- Dataset summary hidden while replacing

### Filters section

| Rule | Detail |
|------|--------|
| Visibility | When dataset loaded and tab is Overview |
| Component | `FilterPanel` — `appearance="dashboard"`, `overviewFilterCompact={true}` |
| Shell class | `.overview-interactive-filters` |
| Control height | **~43px** compact row (Overview-only; AI Insights uses 52px) |
| Date range | Single grouped bar — start · end, one border |
| Dimensions | Department, Location, Designation selects from `dimensionOptions` |
| Clear filters | Grouped with date bar; `.overview-filter-clear-btn` |
| Empty filter result | Dashboard empty state message from backend |

**Not shown on:** Data Preview, Charts, Export.

### Dataset summary section (Overview)

| Cell | Content |
|------|---------|
| Status | Emerald dot + **Dataset ready** |
| File | `formatOverviewFilenameMiddle()` truncation; size below in muted xs |
| Rows / Columns | Locale-formatted integers |
| Sheet | Selected Excel sheet or “CSV” |
| Action | **Replace file** only on Overview |

---

## Data Preview tab

Visible when `activeTab === "preview" && columns.length > 0`.

### Page chrome

| Region | Detail |
|--------|--------|
| Title | **Data Preview** + description (loaded row window copy) |
| Rows control | Top-right select: 10 / 25 / 50 / 100 / **All rows** → `fetchPreviewRows` |
| Dataset strip | `DataPreviewDatasetContext` — full width below title row |
| Search | ~**68% width** on `lg+`, full width on small screens |
| Search match line | `{matches} of {loaded} loaded rows match` when query active |

### Table architecture

```
dpTableShell (.data-preview-shell)
└─ dpTableScroll (.data-preview-scroll) — max-height min(70vh, 42rem)
   └─ table.data-preview-table
      ├─ thead — sticky top, elevated shadow on vertical scroll
      │  └─ DataPreviewColumnHeader (per column)
      └─ tbody
         ├─ DataPreviewCopyCell — non-null values
         └─ NULL td — pill only
```

| Feature | Implementation |
|---------|----------------|
| Column headers | Sort row (title + chevron) + profile row (type badge + quality badge) |
| Column profile | Popover portal on badge row click |
| Quality badges | Type, Missing, Identifier, Unique, Clean — compact pills |
| First column | Sticky left (`data-preview-cell--sticky`) with subtle divider only |
| Row zebra | Even rows `--dp-row-zebra` |
| Row hover | `--dp-row-hover` on all cells including sticky |

### Sorting

| Behavior | Detail |
|----------|--------|
| Trigger | Click column **title row** (not profile row) |
| Cycle | Ascending → descending → clear (original order) |
| Icons | Inline Lucide-style chevrons — low opacity default, accent when active |
| Active header | Light accent wash on sort button + sticky header corner |
| Compare | Uses `profile.column_types` — numeric, date, locale text |
| Missing values | Sort last |

### Pagination

| Behavior | Detail |
|----------|--------|
| Pipeline | Filter → sort → **paginate** → render |
| Active | When rows-per-page ≠ All |
| Controls | Previous · `{page} / {total}` pill · Next |
| Hidden when | `pageCount <= 1` or All rows mode |
| Single-page copy | **Showing all {N} rows** (centered static footer) |
| Multi-page copy | **Showing 1–25 of 100 rows · Page 1 of 4** |
| Reset | Page 1 on sort, search, or rows-per-page change |

### Copy-to-clipboard

| Behavior | Detail |
|----------|--------|
| Component | `DataPreviewCopyCell` |
| Scope | Non-null cells only |
| Icon | Hidden by default; **opacity fade-in** on cell hover/focus |
| Position | Absolute right inside cell; fixed `padding-right: 1.625rem` always on copyable cells |
| Layout | No scale transform; no column width change on hover |
| Action | `navigator.clipboard.writeText(displayValue)` |
| Feedback | Tooltip **Copy value** → **Copied**; check icon ~1.4s |
| NULL cells | No copy control |

### Null / missing handling

Central helper: `isMissingValue()` in `lib/data-preview-missing.ts`.

| Treated as missing | Render |
|------------------|--------|
| `null`, `undefined`, `""`, whitespace-only strings, `NaN` | Subtle cell tint + **NULL** pill |

| Styling | Detail |
|---------|--------|
| Cell class | `data-preview-cell--null` |
| Background | Very subtle rose mix (`--dp-cell-null-bg` ~96–97% surface) |
| Pill | `dpNullPill` — rose border/wash, readable in light and dark |
| Row hover | Same row hover as other cells (not heavy red wash) |
| Zebra rows | NULL tint preserved on even rows |
| Search | Missing token maps to `"null"` for query matching |

### Sticky headers & first column

| Element | Behavior |
|---------|----------|
| Header row | `position: sticky; top: 0` — `--dp-header-bg`, subtle top inset |
| Header text | `.data-preview-th-name` — 13–13.5px, weight 600, `--dp-header-fg` |
| First column header | Sticky left + subtle `border-right` divider |
| First column body | Sticky left, shared row backgrounds, no drop shadow |
| Scroll elevation | `--elevated` class adds bottom shadow when table scrolled vertically |

### Scrollbars

| Axis | Style |
|------|-------|
| Vertical | **10px** width, softer thumb, easier grab |
| Horizontal | **8px** height (unchanged) |
| Container | `.data-preview-scroll` — `overflow: auto`, thin scrollbar-color tokens |
| Wide tables | Horizontal scroll preserved; sticky first column stays visible |

### Dark mode

| Token | Light | Dark |
|-------|-------|------|
| `--dp-surface` | `--card` white | `#111827` card |
| `--dp-header-bg` | Slight slate lift | Slight slate lift on card |
| `--dp-header-fg` | 90% foreground mix | Same pattern |
| `--dp-body-fg` | 86% foreground mix | Same pattern |
| `--dp-cell-null-bg` | 96% surface + rose | 97% surface + deep rose |
| `--dp-row-zebra` / `--dp-row-hover` | Opaque surface mixes | Opaque surface mixes |
| Pagination footer | Inset card, soft border | Darker inset, reduced glow |

### Light mode

Same structure — all Data Preview colors derive from CSS variables in `:root` / `.dark`. No hardcoded hex in JSX.

### Optional panels (above table)

| Panel | When shown |
|-------|------------|
| AI suggested questions | When backend suggestions exist — click prefills AI Insights |
| Column quality notes | When heuristics produce notes — amber insights panel |

---

## AI Insights (UI reference)

| Element | Current state |
|---------|---------------|
| Filters | Full 52px dashboard bar (not Overview compact) |
| Layout | Two-column: suggestions + ask/answer/viz |
| Dataset card | None inline — **Dataset loaded** in app header |
| Viz shell | `AiInsightChartShell` — fixed plan widths 760/850/900px |
| AI Read | `SmartChartInsightPanel` — gated on question match |

---

## Charts (UI reference)

| Element | Current state |
|---------|---------------|
| Layout | Timeline ~23% + preview |
| Dataset card | None |
| Timeline | AI vs Auto sections, preserve scroll on select |
| Preview | Session chart at ≤860px viewport |

---

## Export (UI reference)

| Element | Current state |
|---------|---------------|
| Dataset card | Report preview summary only (rows/columns, viz status) |
| PDF theme | Print-safe light — independent of app dark mode |

---

## Files governing this baseline

| Area | Path |
|------|------|
| Overview tokens | `frontend/lib/overview-ui.ts` |
| Overview upload | `frontend/app/components/home/overview-upload-selected-state.tsx` |
| Filters | `frontend/app/components/home/filter-panel.tsx` |
| Data Preview tokens | `frontend/lib/data-preview-ui.ts` |
| Data Preview table CSS | `frontend/app/globals.css` (`.data-preview-*`) |
| Data Preview components | `frontend/app/components/home/data-preview-*.tsx` |
| Missing values | `frontend/lib/data-preview-missing.ts` |
| Sort | `frontend/lib/data-preview-sort.ts` |
| Tab JSX | `frontend/app/page.tsx` |

---

*Last updated: 2026-05-27 — reflects current Data Preview sort, pagination, copy, and NULL normalization.*
