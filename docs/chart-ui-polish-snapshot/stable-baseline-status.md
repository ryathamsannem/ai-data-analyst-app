# Stable Baseline Status — Chart UI Polish

**Branch:** `DEV`  
**Stable commit:** `16526f0` (`fix(frontend): polish chart labels axes png density and signed bars`, 2026-06-29)  
**Prior checkpoint:** `4247ef3` on `chart-ui-polish-baseline` (June 2026 pre-polish)  
**Purpose:** Current chart visual baseline after major polish pass and final consistency audit.

**Authoritative chart snapshot:** [`../current-snapshot/chart-polish-final-snapshot.md`](../current-snapshot/chart-polish-final-snapshot.md)

---

## 1. Branch summary

`DEV` at `16526f0` is the **current chart polish baseline**. The major visual polish pass is **complete**:

- V-Bar / H-Bar labels, focused percent precision, signed bars
- Donut/pie sorting, legend, small-slice readability
- Line / area value labels
- Standalone PNG density (bar, histogram, line, area)
- Close-value axis readability (focused rates, bounded scores)
- Odd auto-dashboard centering
- Final cross-surface consistency audit: **no blocking regressions**

Bulk performance work remains **pending** (unchanged from prior baseline).

---

## 2. What works on this branch

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
| Auto-dashboard chart grid (incl. odd-count centering) | Stable |
| Filter refresh via `/filtered-dashboard` | Stable |
| Drill-down from chart clicks | Stable |
| View in Charts / Ask AI shortcuts | Stable |
| Per-card PNG export (density tiers) | Stable |
| AI summary panel | Stable |

### Charts tab

| Area | Status |
|------|--------|
| Timeline (AI + Auto sections) | Stable |
| Session preview with metadata stack | Stable |
| Why this chart strip | Stable |
| SmartChartInsightPanel | Stable |
| Plot transition on selection change | Stable |
| Download Chart PNG (density tiers) | Stable |

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

### Export / PDF

| Area | Status |
|------|--------|
| Section toggles + branding | Stable |
| Full executive PDF download | Stable |
| Chart embed (aligned with on-screen styling) | Stable |
| Native data preview table in PDF | Stable |
| Appendix (metadata, thumbnails, spec) | Stable |

### Backend

| Area | Status |
|------|--------|
| Upload + profile + auto-dashboard | Stable |
| Filtered dashboard | Stable |
| `/ask` visualization + narrative | Stable |
| Intent engine routing pack | Stable (regression tests) |

---

## 3. Chart family parity (June 29 audit)

| Family | Overview | Charts | AI Insights | PNG | PDF | Notes |
|--------|----------|--------|-------------|-----|-----|-------|
| V-Bar | ✅ | ✅ | ✅ | ✅ | ✅ | Focused rate domains + safe labels |
| H-Bar | ✅ | ✅ | ✅ | ✅ | ✅ | Outside labels; bounded score ticks |
| Donut / pie | ✅ | ✅ | ✅ | ✅ | ✅ | Sorted slices, legend, palette |
| Line | ✅ | ✅ | ✅ | ✅ | ✅ | Clutter-safe value labels |
| Area | ✅ | ✅ | ✅ | ✅ | ✅ | Same label policy as line |
| Histogram | ✅ | ✅ | ✅ | ✅ | ✅ | Shares V-Bar domain path |
| Scatter | ✅ | ✅ | ✅ | ✅ | ✅ | Premium domain shared across surfaces |
| KPI cards | ✅ | — | — | — | ✅ | Text cards only |

---

## 4. H-Bar status (reference premium layout — **stable**)

| Surface | Status | Notes |
|---------|--------|-------|
| Charts tab | ✅ Stable | Category-scaled height; signed bars; bounded score ticks |
| AI Insights | ✅ Stable | 900px plan viewport; outside labels for small bars |
| Overview mini cards | ✅ Stable | Pipeline B; PNG density tiers |
| PNG export | ✅ Stable | `chartsPng` / `overviewPng` tiers |
| PDF export | ✅ Stable | Horizontal; centered embed; zero baseline for signed values |

---

## 5. Shared chart modules (post-polish)

| Module | Path | Role |
|--------|------|------|
| Bar domain / ticks | `frontend/lib/overview-bar-value-domain.ts` | Focused rates, bounded scores, signed domains |
| Cartesian decisions | `frontend/lib/cartesian-chart-decisions.ts` | Overview vs session pipeline; tick attach |
| Premium line/area/scatter | `frontend/lib/overview-premium-axis-domain.ts` | Close-value trend domains |
| Label safety | `frontend/lib/overview-dashboard-export.ts` | Bar end-label overlap gates |
| PNG layout | `frontend/lib/chart-png-export-layout.ts` | Standalone density tiers |
| Radial | `frontend/lib/radial-chart-format.ts` | Donut/pie sort, legend, palette |
| Session renderer | `frontend/app/components/home/chart-renderer.tsx` | Recharts all kinds + capture mode |
| Overview inline | `frontend/app/page.tsx` | Pipeline B mini charts + PNG capture |
| Capture / PDF | `frontend/lib/chart-platform/*` | Profiles, axis plans, capture controller |

---

## 6. Optional hardening (not required)

See [`../current-snapshot/chart-polish-final-snapshot.md`](../current-snapshot/chart-polish-final-snapshot.md) §5:

- Export axis plan explicit `tickValues`
- Overview export parity validation for domain/ticks
- Scatter close-cluster unit test

---

## 7. Test status

| Suite | Result |
|-------|--------|
| Chart consistency vitest (15 files) | **289 passed** |
| `npm run build` | **PASS** |

---

*Updated: 2026-06-29 — `DEV` @ `16526f0`. Supersedes June 16 baseline on `chart-ui-polish-baseline` @ `4247ef3` for chart visual status.*
