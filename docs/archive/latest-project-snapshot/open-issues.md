# Open Issues

**Snapshot date:** June 21, 2026

---

## Recently Resolved (June 2026)

| Area | Resolution |
|------|------------|
| Histogram intent routing | `_question_asks_numeric_distribution_histogram()` + regression tests |
| Donut/pie share routing | `question_asks_categorical_share_composition()`; executive-risk guards; `test_donut_pie_share_routing.py` |
| Revenue share mis-route to city bar | Narrowed `_CONCENTRATION_RE`; pie upgrade before compare-bar in `main.py` |
| Auto-dashboard weak share titles | `{dim} {metric} Share` in `_executive_share_by_dim_title()` |
| Overview mini-radial live sizing | `OVERVIEW_MINI_RADIAL_SIZE_SCALE = 1.24`, session legend tokens, `cy=48%` |
| Radial export proportional balance | `resolveProportionalExportRadialRadii` at 0.63 band ratio; `RADIAL_EXPORT_PLOT_WIDTH_UTIL = 0.86` |
| Radial export legend/footer readability | External composite legend at 24px/17px icon; radial footer 22px |
| Rate warning on share donuts | `resolveRateExceeds100Warning()` suppresses for valid composition |
| Overview premium donut experiment | Rolled back — inline Recharts + standard footer chips restored |
| V-Bar / histogram value-axis domain | Shared `resolveVerticalBarValueAxisProps` |
| Scatter PDF small frame | Content-tight composite for `pdfChart` + scatter/bar/histogram |

---

## Chart / Export Issues

| ID | Priority | Issue | Notes |
|----|----------|-------|-------|
| CE1 | **High** | Dual chart pipelines | Overview inline Recharts in `page.tsx` vs `ChartRenderer` — primary long-term visual drift risk |
| CE2 | **Medium** | H-Bar cross-surface tick/domain parity | V-Bar/histogram domains centralized; H-Bar may still differ Overview PNG vs Charts/Insights |
| CE3 | **Medium** | `AxisPresentationPlan` diagnostic-only on some surfaces | Plan identifies mismatches; not all surfaces consume plan props uniformly |
| CE4 | **Medium** | PDF chart is rasterized | Native chips yes; plot internals are PNG in PDF, not vector |
| CE5 | **Medium** | Legacy PDF DOM capture fallback | Intentional safety net in `pdf-report.ts`; remove only after extended artifact validation |
| CE6 | **Medium** | No browser/E2E export regression suite | 561 frontend + 339 backend unit tests; manual matrix for 6-surface parity |
| CE7 | **Low** | `overviewEffectiveChartKind` legacy field | Still on snapshots; Charts PNG uses session `chartKind` for bar family |
| CE8 | **Low** | Overview vs Charts PNG axis tick font sizes | Overview export 14px ticks; live detail may differ |
| CE9 | **Low** | Uncommitted baseline changes | Radial legend/footer + rate-warning fixes in working tree, not yet committed to `DEV` |

---

## Product / Platform Issues

| ID | Priority | Issue | Location |
|----|----------|-------|----------|
| P1 | **Critical** | Global in-memory dataset; last upload wins per process | `backend/main.py` |
| P2 | **Critical** | No real authentication | frontend/backend |
| P3 | **Critical** | Plan tier client-spoofable (localStorage/session headers) | plan/usage paths |
| P4 | **High** | In-memory usage tracker not durable across restarts/workers | backend usage tracker |
| P5 | **High** | AI quota can debit before full pipeline success | AI request flow |
| P6 | **High** | Missing API key → template answers while chart still renders | backend AI paths |
| P7 | **High** | `/preview` does not honor dashboard filters | preview API/UI |
| P8 | **High** | Large monoliths increase merge risk | `page.tsx`, `main.py` |
| P9 | **Medium** | PDF generation main-thread heavy, not cancellable | frontend PDF |
| P10 | **Medium** | Conversation appendix can grow large | PDF export |
| P11 | **Medium** | CSV formula injection not sanitized on preview API | backend preview |
| P12 | **Medium** | No HTTP integration test pack for upload/ask/CORS | backend tests |
| P13 | **Medium** | Broad `except Exception` in backend hot paths | backend |
| P14 | **Low** | Upload TTL/memory cleanup lifecycle missing | backend |
| P15 | **Low** | Placeholder support email in PDF footer | branding/PDF |
| P16 | **Low** | No CI/deployment pipeline in repository | no `.github/` workflows found |

---

## Technical Debt

| Item | Description |
|------|-------------|
| **Monolithic SPA** | ~14k-line `page.tsx` owns upload, all tabs, export, AI |
| **Dual contract models** | `VisualizationContract` (legacy) + `ChartPresentationContract` (platform) coexist |
| **Overview inline charts** | Duplicate Recharts logic vs `ChartRenderer`; export parity requires parallel constants |
| **Backend globals** | Single `df` global; not suitable for multi-tenant production |
| **Intent engine split** | Routing in both `main.py` and `intent_engine/` |
| **Generated PDF artifacts in repo** | `docs/pdf-validation-screenshots/` modified by tests; clutters git status |
| **HEAD vs working tree** | Latest radial/warning polish not committed; snapshot docs describe working tree behavior |

---

## Future Enhancements

| Enhancement | Value | Risk |
|-------------|-------|------|
| **Commit baseline tag** | Freeze June 2026 chart/export state | Low |
| **Browser export E2E** | Catch PNG/PDF regressions across 6 surfaces | Medium setup |
| **H-Bar axis parity pass** | Close remaining Overview vs session tick gaps | Medium |
| **Extract Overview chart module** | Reduce `page.tsx` size | High if scope creeps |
| **Server-side session/dataset** | Production multi-user readiness | High |
| **Auth + durable usage** | Real plan enforcement | High |
| **Vector PDF charts** | Sharper print quality | High |
| **CI pipeline** | Automated test/build on push | Medium |

---

## Recommended Next Steps

1. Commit working-tree chart/export changes; tag as baseline.
2. Run manual export smoke: Overview PNG, Charts PNG, PDF — donut, bar, histogram, scatter.
3. Add Playwright/Cypress export snapshot tests (radial legend readability regression).
4. Product decision on auth + dataset persistence before production deploy.
