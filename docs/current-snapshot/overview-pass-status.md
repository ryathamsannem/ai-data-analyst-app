# Overview Pass Status (5A → 5C.5)

Snapshot: June 27, 2026 · Branch `DEV` · Passes 5B/5C in working tree (parity **frozen** after 5C.5).

All passes followed the same constraints: **incremental fixes only**, no AI Insights routing changes,
no chart-rendering architecture rewrite, no export behavior changes except where shared visual constants
naturally apply, and no scatter reintroduced into Overview defaults.

---

## Pass 5A — Banking default chart selection cleanup

**Root cause:** For `banking_gold_10000.csv`, Overview defaults surfaced low-value charts: scatter plots by
default and `account_age_months` (a lifecycle/demographic metric) ranked into top charts, crowding out
business-relevant banking metrics.

**Files changed:**
- `backend/services/auto_dashboard_opportunities.py` — `_is_lifecycle_overview_metric`, `_banking_preferred_metrics`, `_prune_lifecycle_overview_charts`, `_prune_scatter_when_business_rich`; scatter score penalty for finance; `_preferred_breakdown_metric(kind=...)`; date detection for `month`/`report_month`.
- `backend/main.py` — `_dash_priority_metric_columns` prefers loan/deposit/utilization for finance and avoids `account_age_months`; skip generic dashboard charts for banking schema.
- `frontend/lib/overview-dashboard-chart-renderable.ts` — `metricStrengthFromTitle` scores banking metrics; `isLifecycleOverviewTitle` filter (frontend safety net).

**Tests added:** `backend/tests/test_overview_banking_gold_dashboard.py` — no default scatter when ≥4 business charts, no `Account Age Months by Product Type`, ≥5 useful banking charts, finance priority skips lifecycle secondary, explicit relationship question still allows scatter.

**Manual validation:** PASS — banking gold Overview shows business charts, no default scatter.

**Known limitations:** Geographic (city) risk charts could still appear (addressed in 5A.1).

---

## Pass 5A.1 — Banking dimension quality cleanup

**Root cause:** Risk/utilization metrics (delinquency, utilization) were being broken down by weak
geographic dimensions (city/region) when stronger business dimensions (customer segment, product type)
were available.

**Files changed:**
- `backend/services/auto_dashboard_opportunities.py` — `_is_banking_risk_metric`, `_is_geographic_overview_dimension`, `_is_banking_business_dimension`, `_finance_geographic_risk_pair_blocked`, `_prune_geographic_risk_overview_charts`; scoring penalty for geographic risk pairs + boost for risk metrics on business dimensions; explicit "B2" discovery of risk metrics on segment/product; refined `_chart_redundant_with_kpi`; scatter delayed in `relationship` bucket via `_pick_best_candidate`.
- `frontend/lib/overview-dashboard-chart-renderable.ts` — `isBankingRiskMetricTitle`, `isGeographicDimensionTitle`, `isBankingBusinessDimensionTitle`; filter geographic risk charts when business dimensions exist.

**Tests added:** `backend/tests/test_overview_banking_gold_dashboard.py` (extended) — no risk metrics by city when business dimensions exist, includes risk metric on segment/product type, explicit city question still works.

**Manual validation:** PASS — delinquency/utilization show by customer segment / product type; explicit city queries still function.

**Known limitations:** Geography preserved globally (region for spend/loan concentration still allowed) — intentional.

---

## Pass 5A.2 — Banking/finance label, monthly cadence, scatter cleanup, mapping label cleanup

**Root cause:** `banking_financial_services.csv` had trust/readability issues: dataset type sometimes read
"Sales / commercial"; monthly snapshot dates (`2024-01-01`, `2024-02-01`) were treated as weekly; the
mapping modal label was sales-biased; H-Bar finish felt heavy.

**Files changed:**
- `backend/services/executive_kpi_cards.py` — `executive_domain_to_kpi_domain` maps `banking → "banking"` (was `"sales"`).
- `backend/main.py` — `_detect_monthly_snapshot_cadence`; `_adaptive_time_series_grouped` forces `"M"` for month-start snapshots; `_compose_upload_payload` adds `executive_domain` + `dataset_type_label`.
- `frontend/app/page.tsx` — `DatasetKindSlug` adds `"banking"`; mapping modal label → "Secondary metric / comparison metric"; uses `resolveOverviewDatasetTypeLabel` + backend `typeLabel`.
- `frontend/app/pdf-report.ts` — `datasetKindLabel` maps `banking → "Banking / Financial Services"`.
- `frontend/lib/resolved-dataset-type-label.ts` (new) — single source for the Overview dataset-type label.
- `frontend/lib/horizontal-bar-visual.ts` — softer radius + thinner bars (first pass).

**Tests added:** `backend/tests/test_overview_banking_financial_services.py`; `frontend/lib/resolved-dataset-type-label.test.ts`; updated `overview-dashboard-context-chips.test.ts`, `horizontal-bar-visual.test.ts`.

**Manual validation:** PASS — consistent "Banking / Financial Services"; monthly trends; no default scatter; mapping label neutralized.

**Known limitations:** H-Bar visual polish still not fully matching V-Bar (carried into 5A.3).

---

## Pass 5A.3 — H-Bar constants, axis formatting, V-Bar rate formatting, cross-domain mapping QA

**Root cause:**
- (Issue 1) H-Bar still read heavy/pill-like vs V-Bar; large numeric x-axis labels too technical (`127,500,000`).
- (Issue 2) Small-spread rate V-Bars (delinquency rate) hard to read; axis showed raw decimals.
- (Issue 3) Cross-domain mapping not validated; QA found banking secondary metric = `account_age_months` and HR primary = `training_hours` / dimension = `age_band` (both wrong vs expectations).

**Files changed:**
- `frontend/lib/horizontal-bar-visual.ts` — `HORIZONTAL_BAR_END_RADIUS [0,8,8,0] → [0,5,5,0]`; `HORIZONTAL_BAR_MAX_SIZE {compact 24→22, detail 40→36, default 30→28}`; stacked variants thinned; stacked radius → `[0,5,5,0]`.
- `frontend/app/page.tsx` — Overview H-Bar literal radius `[0,6,6,0] → [0,5,5,0]`, live `maxBarSize 32 → 28`; new memoized `barValueTickFormatter` wired into Overview H-Bar x-axis, V-Bar y-axis, and bar-end labels; label-fit check uses it too.
- `frontend/app/components/home/chart-renderer.tsx` — memoized `barValueTickFormatter` (uses `metricTooltipCtx`) wired into H-Bar x-axis and V-Bar y-axis.
- `frontend/lib/overview-premium-axis-domain.ts` — new `formatOverviewBarValueAxisTick(tick, rows, ctx)`: percent ticks coerce 0–1 fraction → points; currency/large numbers compact to `K`/`M`.
- `backend/main.py` — mapping role scorers: `_sales_role_keyword_score` adds salary/payroll/compensation + lifecycle/age penalties; `_profit_role_keyword_score` adds banking secondary metrics (deposit/utilization/delinquency/etc.) + lifecycle penalties; `_product_role_keyword_score` adds department/job_family/product_type + age-band penalty; `_date_role_keyword_score` adds `report_date`/`hire_date`.

**Tests added:**
- `backend/tests/test_cross_domain_mapping_qa.py` (new) — retail/banking-gold/banking-fs/HR domain, type label, primary/secondary metric, date, dimension, no conflicting labels.
- `frontend/lib/overview-premium-axis-domain.test.ts` — `formatOverviewBarValueAxisTick` currency M, utilization %, delinquency %, 0–100 passthrough, HR counts.
- `frontend/lib/overview-dash-chart-insights.test.ts` — rate breakdown chips show percent + `pp` gap.
- `frontend/lib/horizontal-bar-visual.test.ts` — updated radius/thickness expectations.

**Manual validation:**
- Cross-domain mapping: PASS (probe across all 4 fixtures — see [`validation-results.md`](./validation-results.md)).
- Axis/percent formatting: PASS (unit tests).
- **H-Bar/V-Bar visual parity: NOT PASS** — still visually different in screenshots; needs geometry-level review (see [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md)).

**Known limitations:**
- HR `customer` role still resolves to `age` (minor; not a stated requirement).
- HR auto-dashboard discovery can still surface weaker "Monthly Age Trend" / "Records by Age Band" charts (discovery layer, not mapping; separate follow-up).
- 6 pre-existing `pytest` failures unrelated to 5A.3 remain.

---

## Pass 5B.1 — H-Bar percent/rate zero baseline + percent chip fix

**Root cause:** H-Bar rate charts truncated X-axis (started ~5.6% instead of 0%); V-Bar chip showed `100.0%` when value was ~1.0% (`coercePercentDisplayNumber` treated 1.0 as fraction).

**Files changed:**
- `frontend/lib/overview-bar-value-domain.ts` — post-process force `domainMin = 0` for bar/horizontal-bar percent metrics with low floor.
- `frontend/lib/metric-value-format.ts` — `coercePercentDisplayNumber` gains `maxContextValue`; `formatExecutiveMetricValue` passes dataset max.

**Tests:** `overview-bar-value-domain.test.ts`, `metric-executive-percent.test.ts`.

**Status:** ✅ Frozen.

---

## Pass 5B.2 — Universal zero-baseline for normal positive business bars

**Root cause:** Pass 5B.1 only fixed percent metrics; currency/count bars still used tight domain via `spreadRatio < 0.06`.

**Files changed:**
- `frontend/lib/overview-bar-value-domain.ts` — broadened post-process: `domainMin = 0` for all normal positive bar metrics except score/rating and bounded rating scales.

**Status:** ✅ Frozen.

---

## Pass 5B.3 — Export/shared/legacy domain parity validation

**Root cause:** Risk that export paths still used old tight-domain behavior without `presentationKind`.

**Files changed / validated:**
- `frontend/lib/overview-dashboard-export.ts` — `horizontalBarValueDomain()` passes `presentationKind: "bar_horizontal"`.
- Cross-surface parity tests in `overview-bar-value-domain.test.ts`, `cartesian-chart-decisions.test.ts`, `axis-presentation-plan.test.ts`, `overview-dashboard-export.test.ts`.

**Status:** ✅ Frozen.

---

## Pass 5C.1 — H-Bar visual weight / band-fill parity

**Root cause:** H-Bar looked like thin strips vs premium V-Bar (maxBarSize 28 vs 52, weak radius, no category gap).

**Files changed:**
- `frontend/lib/horizontal-bar-visual.ts` (new/expanded) — `OVERVIEW_HBAR_LIVE_MAX_BAR_SIZE = 48`, `HORIZONTAL_BAR_END_RADIUS = [4,6,6,4]`, category gap resolver, export/live aliases.
- `frontend/app/page.tsx`, `chart-renderer.tsx`, `overview-dashboard-export.ts` — wired centralized constants.

**Status:** ✅ Frozen.

---

## Pass 5C.2 — Low-rate V-Bar axis upper-bound polish

**Root cause:** Delinquency 3.4–4.1% got top tick ~9.1% (tight-domain min pad 0.05 on fraction scale after zero-baseline override).

**Files changed:**
- `frontend/lib/overview-bar-value-domain.ts` — `resolveBarChartRateDisplayCap`, `resolveBarChartRateUpperBound`; tiered percent headroom post-process.

**Status:** ✅ Frozen.

---

## Pass 5C.3 — H-Bar 7-category rhythm + count-axis ticks

**Root cause:** 7+ category H-Bars lost 16% gap; Recharts auto-ticks showed decimals (e.g. `1,258.2`).

**Files changed:**
- `frontend/lib/horizontal-bar-visual.ts` — category-responsive maxSize (48/44/42/36); gap through 8 categories.
- `frontend/lib/overview-premium-axis-domain.ts` — `resolveOverviewBarCountValueAxisTicks`.
- `frontend/lib/cartesian-chart-decisions.ts` — attach clean ticks for Overview count bars.
- `frontend/lib/overview-dashboard-plot-layout.ts` — `OVERVIEW_HBAR_LIVE_MARGIN_RIGHT_MIN_PX = 32`.

**Status:** ✅ Frozen.

---

## Pass 5C.4 — H-Bar utilization verification (×1.10 headroom)

**Root cause confirmed:** Logic active but visually ineffective (~91% vs ~94% utilization, ~11px delta).

**Files changed:**
- `frontend/lib/overview-bar-value-domain.ts` — `OVERVIEW_HBAR_VALUE_DOMAIN_PAD_RATIO = 0.10`, `overviewHorizontalBarHeadroom` flag.

**Status:** ✅ Superseded by 5C.5.

---

## Pass 5C.5 — Overview H-Bar 85% utilization cap (FINAL)

**Root cause:** ×1.10 headroom not perceptible; V-Bar rate charts use ~80% occupancy vs H-Bar ~91%.

**Policy:** For Overview H-Bar magnitude charts (currency/count/revenue, not percent/score):
```ts
domainMax = max(existingDomainMax, maxRaw / 0.85)
```

**Expected effect:** Loan Balance max $183.9M → domainMax ~$216M; longest bar ~85% plot width.

**Files changed:**
- `frontend/lib/overview-bar-value-domain.ts` — `OVERVIEW_HBAR_TARGET_MAX_UTILIZATION = 0.85`, `resolveOverviewHBarUtilizationDomainMax`.
- `frontend/lib/cartesian-chart-decisions.ts`, `overview-dashboard-export.ts` — `overviewHorizontalBarHeadroom: true`.

**Tests:** 722 vitest pass; build clean.

**Status:** ✅ **Frozen — P0 H-Bar/V-Bar parity closed.**

**Accepted limitation:** Orientation-natural difference (horizontal length vs vertical thickness) remains; not a bug.
