# Current Bug Status — May 2026

**Checkpoint:** `stable/pdf-export-phase2` / backup `stable_export_pdf_phase2_backup_2026-05-21`

---

## Resolved (recent / stable)

| Area | Resolution |
|------|------------|
| PDF data preview dark rectangle | Native jsPDF table; stroke-only outer frame |
| Appendix percent on raw metrics | `formatRawMetricValue` / `formatPdfAppendixSeriesValue` |
| ISO dates in PDF copy | `pdf-date-format.ts` |
| Duplicate “highest highest” phrasing | `polishPdfBusinessCopy`, ranking helpers |
| PDF empty states | `PDF_EMPTY_STATES` premium panels |
| Executive summary hierarchy | Partitioned blocks, takeaway callout, dividers |
| Appendix metadata density | KPI-style `drawAppendixFactGrid` |
| Appendix thumbnails | Compact list table with sparklines |
| Data preview table | Stronger header, row separators, zebra |
| PDF footer clutter | Single-line footer (file · product · page) |
| Viz page whitespace | Tighter chart-to-insights spacing |
| KPI row alignment | `measureKpiRowHeightMm` + fixed padding |
| Chart embed stretch | `computePdfChartEmbedDimensions` |

---

## Remaining minor polish (non-blocking)

| Item | Severity | Notes |
|------|----------|--------|
| PDF not using app dark theme | By design | Print-safe light only |
| Export code-split | Low | jsPDF/html2canvas still bundled with main path |
| Very long AI answers | Low | Paginate OK; density could be tuned |
| html2canvas fallback quality | Low | Browser-dependent |
| Monolithic `page.tsx` | Structural | Maintainability, not user-facing bug |

---

## Known limitations (not bugs)

| Limitation | Detail |
|------------|--------|
| Preview table | Max 10×7 in PDF |
| Appendix thumbnails | Max 8 charts |
| No deep links per tab | By design |
| Backend single-process DataFrame | Resets on server restart |
| Scatter appendix cells | Left-aligned mixed `x=, y=` text |

---

## Risky areas — avoid breaking

| Area | Risk |
|------|------|
| `pdf-report.ts` pagination | `ensurePageSpace`, `footerY`, `contentTop0` |
| `metric-value-format.ts` | Appendix vs axis formatting split |
| `computeFinalChartPresentation` | Charts/Insights/PDF parity |
| `insightChartMatchesCurrentQuestion` | Wrong chart in export |
| `chart-session-context.tsx` | Timeline/history integrity |
| `FilterPanel` 52px dashboard layout | Cross-tab alignment |
| Overview vs session chart pipelines | Mixing breaks Overview mini charts |

---

## Suggested regression smoke test

1. Upload CSV → map columns → Overview KPIs + auto-dashboard  
2. Filter → AI Insights question (with chart) → verify viz alignment  
3. Charts tab timeline → select chart → Why-this-chart  
4. Export full PDF (all sections) + appendix on/off  
5. Dark mode UI → confirm PDF still print-light  
6. Small dataset (&lt;15 rows) → low-data note in snapshot  

---

*Updated: 2026-05-21*
