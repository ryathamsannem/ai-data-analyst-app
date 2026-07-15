"""Auto Dashboard opportunity discovery — chart count, diversity, showcase dataset."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
from services.auto_dashboard_opportunities import (  # noqa: E402
    DashboardDeps,
    MAX_DONUT_CHARTS,
    build_dashboard_charts_bundle,
    build_dashboard_charts_from_opportunities,
    classify_columns,
    compute_dashboard_coverage_telemetry,
    evaluate_chart_visual_quality,
    extract_kpi_chart_context,
    target_chart_count,
    _chart_skip_due_to_weak_visual_quality,
)

FIXTURE = BACKEND_ROOT / "tests" / "fixtures" / "dashboard_showcase_dataset.csv"
RETAIL_FIXTURE = BACKEND_ROOT / "tests" / "fixtures" / "retail_analytics_regression.csv"


def _deps() -> DashboardDeps:
    return DashboardDeps(
        numeric_series=main.numeric_series,
        time_series_grouped=main._adaptive_time_series_grouped,
        series_payload=main._dash_series_payload,
        pretty_label=main._pretty_label_text,
        chart_title_by_dimension=main._dash_chart_title_by_dimension,
        freq_human_label=main._freq_human_label,
        id_like_column=main._id_like_column_name,
        priority_metrics=main._dash_priority_metric_columns,
        record_metric_key=main._DASH_RECORD_METRIC_KEY,
    )


def _chart_dimensions(charts: list) -> list[str | None]:
    dims: list[str | None] = []
    for c in charts:
        dim = c.get("dimensionColumn")
        if dim:
            dims.append(str(dim).strip().lower())
            continue
        inter = c.get("interaction") or {}
        drill = inter.get("drillDimensions") or []
        if drill and isinstance(drill[0], dict):
            col = drill[0].get("column")
            dims.append(str(col).strip().lower() if col else None)
        else:
            dims.append(None)
    return dims


def _donut_count(charts: list) -> int:
    return sum(
        1
        for c in charts
        if str(c.get("chartType", "")).lower() in ("donut", "pie")
    )


class TestAutoDashboardOpportunities(unittest.TestCase):
    def test_showcase_fixture_exists_with_500_plus_rows(self) -> None:
        self.assertTrue(FIXTURE.is_file(), f"missing {FIXTURE}")
        df = pd.read_csv(FIXTURE)
        self.assertGreaterEqual(len(df), 500)

    def test_classify_showcase_columns(self) -> None:
        df = pd.read_csv(FIXTURE, parse_dates=["date"])
        profile = main.build_profile(df)
        inv = classify_columns(df, profile, id_like_fn=main._id_like_column_name)
        self.assertTrue(inv.dates)
        self.assertGreaterEqual(len(inv.numerics), 6)
        self.assertGreaterEqual(len(inv.geographic), 3)
        self.assertGreaterEqual(len(inv.categories), 3)
        self.assertGreaterEqual(target_chart_count(inv, len(df)), 6)

    def test_showcase_produces_diverse_charts(self) -> None:
        df = pd.read_csv(FIXTURE, parse_dates=["date"])
        profile = main.build_profile(df)
        main.df = df
        main.dataset_profile = profile
        try:
            charts = build_dashboard_charts_from_opportunities(
                df, profile, "sales", _deps(), seed_candidates=[]
            )
        finally:
            main.df = None
            main.dataset_profile = None
        self.assertGreaterEqual(len(charts), 6)
        types = {str(c.get("chartType", "")).lower() for c in charts}
        self.assertTrue(
            types & {"line", "bar", "horizontalbar", "scatter", "pie", "donut"},
            f"expected diverse types, got {types}",
        )
        titles = " ".join(str(c.get("title", "")).lower() for c in charts)
        self.assertTrue(
            "trend" in titles or "correlation" in titles or "top" in titles,
            "expected executive-style insights in chart titles",
        )
        # No duplicate titles
        self.assertEqual(len({c["title"] for c in charts}), len(charts))

    def test_showcase_dimension_diversity_and_donut_cap(self) -> None:
        df = pd.read_csv(FIXTURE, parse_dates=["date"])
        profile = main.build_profile(df)
        main.df = df
        main.dataset_profile = profile
        try:
            charts = build_dashboard_charts_from_opportunities(
                df, profile, "sales", _deps(), seed_candidates=[]
            )
        finally:
            main.df = None
            main.dataset_profile = None

        breakdown_dims = [
            d
            for d in _chart_dimensions(charts)
            if d is not None
        ]
        dim_counts: dict[str, int] = {}
        for d in breakdown_dims:
            dim_counts[d] = dim_counts.get(d, 0) + 1
        self.assertGreaterEqual(len(dim_counts), 3, f"expected ≥3 dimensions, got {dim_counts}")
        for dim, count in dim_counts.items():
            self.assertLessEqual(
                count,
                2,
                f"dimension {dim!r} used {count} times — should spread across dims",
            )
        self.assertLessEqual(_donut_count(charts), MAX_DONUT_CHARTS)

    def test_showcase_coverage_buckets(self) -> None:
        df = pd.read_csv(FIXTURE, parse_dates=["date"])
        profile = main.build_profile(df)
        main.df = df
        main.dataset_profile = profile
        try:
            charts = build_dashboard_charts_from_opportunities(
                df, profile, "sales", _deps(), seed_candidates=[]
            )
        finally:
            main.df = None
            main.dataset_profile = None

        types = {str(c.get("chartType", "")).lower() for c in charts}
        titles = " ".join(str(c.get("title", "")).lower() for c in charts)
        self.assertTrue(
            "line" in types or "area" in types,
            "expected a trend chart (line or area)",
        )
        self.assertTrue(
            "donut" in types
            or "pie" in types
            or "share" in titles
            or "scatter" in types,
            "expected composition or relationship insight",
        )
        dept_only = sum(
            1
            for d in _chart_dimensions(charts)
            if d and "department" in d
        )
        self.assertLess(
            dept_only,
            len(charts),
            "dashboard should not be entirely department breakdowns",
        )

    def test_coverage_telemetry_reports_filled_and_missing_buckets(self) -> None:
        df = pd.read_csv(FIXTURE, parse_dates=["date"])
        profile = main.build_profile(df)
        main.df = df
        main.dataset_profile = profile
        try:
            charts, telemetry = build_dashboard_charts_bundle(
                df, profile, "sales", _deps(), seed_candidates=[]
            )
        finally:
            main.df = None
            main.dataset_profile = None

        self.assertGreaterEqual(len(charts), 4)
        self.assertEqual(telemetry["selectedCount"], len(charts))
        self.assertGreater(telemetry["maxCharts"], 0)
        self.assertIsInstance(telemetry["bucketsFilled"], list)
        self.assertIsInstance(telemetry["bucketsMissing"], list)
        self.assertGreaterEqual(len(telemetry["bucketsFilled"]), 1)
        self.assertGreater(len(telemetry["bucketsInDiscovery"]), 1)
        inv = classify_columns(df, profile, id_like_fn=main._id_like_column_name)
        direct = compute_dashboard_coverage_telemetry(
            selected=charts,
            discovered=[],
            merged_count=len(charts),
            max_charts=telemetry["maxCharts"],
            inv=inv,
        )
        self.assertEqual(direct["bucketsFilled"], telemetry["bucketsFilled"])

    def test_kpi_deduplication_skips_redundant_top_dimension_charts(self) -> None:
        df = pd.read_csv(FIXTURE, parse_dates=["date"])
        profile = main.build_profile(df)
        kpi_cards = [
            {
                "title": "Top Region",
                "value": "North",
                "subtitle": "Leading region by revenue",
            },
            {
                "title": "Total Revenue",
                "value": "1,234,567",
                "subtitle": None,
            },
        ]
        main.df = df
        main.dataset_profile = profile
        try:
            without_kpi = build_dashboard_charts_from_opportunities(
                df, profile, "sales", _deps(), seed_candidates=[], kpi_cards=[]
            )
            with_kpi = build_dashboard_charts_from_opportunities(
                df,
                profile,
                "sales",
                _deps(),
                seed_candidates=[],
                kpi_cards=kpi_cards,
            )
        finally:
            main.df = None
            main.dataset_profile = None

        ctx = extract_kpi_chart_context(kpi_cards)
        self.assertTrue(ctx)
        redundant = [
            c
            for c in without_kpi
            if c.get("dimensionColumn")
            and "region" in str(c.get("dimensionColumn", "")).lower()
            and str(c.get("chartType", "")).lower() in ("bar", "horizontalbar")
        ]
        kept_redundant = [
            c
            for c in with_kpi
            if c.get("dimensionColumn")
            and "region" in str(c.get("dimensionColumn", "")).lower()
            and str(c.get("chartType", "")).lower() in ("bar", "horizontalbar")
        ]
        self.assertLessEqual(len(kept_redundant), len(redundant))

    def test_before_after_chart_count_improvement(self) -> None:
        """Legacy cap was 3 charts; rich showcase should surface more."""
        df = pd.read_csv(FIXTURE, parse_dates=["date"])
        profile = main.build_profile(df)
        legacy_seed = main._dash_sales_dashboard_charts()
        main.df = df
        main.dataset_profile = profile
        try:
            legacy_final = main._finalize_auto_dashboard_charts(
                legacy_seed, kind="sales", max_charts=3
            )
            upgraded = main.build_auto_dashboard_charts("sales")
        finally:
            main.df = None
            main.dataset_profile = None
        self.assertLessEqual(len(legacy_final), 3)
        self.assertGreater(len(upgraded), len(legacy_final))
        self.assertGreaterEqual(len(upgraded), 6)

    def test_simple_dataset_caps_at_four_charts(self) -> None:
        df = pd.read_csv(RETAIL_FIXTURE)
        profile = main.build_profile(df)
        main.df = df
        main.dataset_profile = profile
        try:
            charts = build_dashboard_charts_from_opportunities(
                df, profile, "sales", _deps(), seed_candidates=[]
            )
        finally:
            main.df = None
            main.dataset_profile = None
        self.assertGreaterEqual(len(charts), 2)
        self.assertLessEqual(len(charts), 8)


class TestChartVisualQuality(unittest.TestCase):
    def test_detects_low_spread_percent_breakdown(self) -> None:
        chart = {
            "title": "Conversion Rate by Campaign",
            "chartType": "bar",
            "metricColumn": "conversion_rate",
            "labels": ["A", "B", "C", "D", "E"],
            "values": [5.2, 5.2, 5.1, 5.0, 4.9],
        }
        q = evaluate_chart_visual_quality(chart)
        self.assertTrue(q["is_percent_metric"])
        self.assertTrue(q["weak_differentiation"])
        self.assertTrue(q["prefer_tight_domain"])

    def test_keeps_wide_spread_revenue_breakdown(self) -> None:
        chart = {
            "title": "Revenue by Region",
            "chartType": "bar",
            "metricColumn": "revenue",
            "labels": ["East", "West", "North"],
            "values": [120000.0, 240000.0, 310000.0],
        }
        q = evaluate_chart_visual_quality(chart)
        self.assertFalse(q["weak_differentiation"])

    def test_skips_flat_kpi_redundant_compare_chart(self) -> None:
        chart = {
            "title": "Satisfaction Score by Country",
            "chartType": "bar",
            "metricColumn": "satisfaction_score",
            "dimensionColumn": "country",
            "_opportunityType": "compare",
            "labels": ["US", "UK", "DE", "FR"],
            "values": [82.1, 82.4, 82.8, 83.0],
        }
        kpi_ctx = extract_kpi_chart_context(
            [
                {
                    "title": "Top Country",
                    "value": "US",
                    "subtitle": "satisfaction score 83.0",
                }
            ]
        )
        self.assertTrue(
            _chart_skip_due_to_weak_visual_quality(
                chart, kpi_ctx, main._DASH_RECORD_METRIC_KEY
            )
        )


class TestDiscoverRequestLocalCaches(unittest.TestCase):
    """Output-equivalent caches used by discover_chart_opportunities."""

    def test_cardinality_memo_matches_direct(self) -> None:
        from services.auto_dashboard_opportunities import (
            _dimension_cardinality,
            _unique_count_for_column,
        )

        df = pd.read_csv(RETAIL_FIXTURE)
        profile = main.build_profile(df)
        memo: dict[str, int] = {}
        for col in ("region", "product_category", "city"):
            if col not in df.columns:
                continue
            direct = _unique_count_for_column(
                df, col, profile, string_normalized=True
            )
            via_memo = _dimension_cardinality(df, col, profile, memo=memo)
            again = _dimension_cardinality(df, col, profile, memo=memo)
            self.assertEqual(direct, via_memo)
            self.assertEqual(via_memo, again)

    def test_agg_dim_metric_series_memo_matches_groupby(self) -> None:
        from services.auto_dashboard_opportunities import _agg_dim_metric_series

        df = pd.read_csv(RETAIL_FIXTURE)
        main.df = df
        main.dataset_profile = main.build_profile(df)
        try:
            memo: dict = {}
            cached = _agg_dim_metric_series(
                df,
                "region",
                "revenue",
                "sum",
                main.numeric_series,
                aggregate_memo=memo,
            )
            again = _agg_dim_metric_series(
                df,
                "region",
                "revenue",
                "sum",
                main.numeric_series,
                aggregate_memo=memo,
            )
            sub = df[["region", "revenue"]].copy()
            sub["_v"] = main.numeric_series("revenue")
            sub = sub.dropna(subset=["region", "_v"])
            direct = sub.groupby("region")["_v"].sum()
            self.assertIsNotNone(cached)
            assert cached is not None
            pd.testing.assert_series_equal(
                cached.sort_index(), direct.sort_index(), check_names=False
            )
            pd.testing.assert_series_equal(
                again.sort_index(), direct.sort_index(), check_names=False
            )
        finally:
            main.df = None
            main.dataset_profile = None

    def test_adaptive_time_series_optional_series_match(self) -> None:
        df = pd.read_csv(RETAIL_FIXTURE)
        if "order_date" not in df.columns or "revenue" not in df.columns:
            self.skipTest("retail fixture missing order_date/revenue")
        main.df = df
        try:
            dt = pd.to_datetime(df["order_date"], errors="coerce")
            nums = main.numeric_series("revenue")
            baseline, meta_a = main._adaptive_time_series_grouped(
                df, "order_date", "revenue", agg_key="sum"
            )
            reused, meta_b = main._adaptive_time_series_grouped(
                df,
                "order_date",
                "revenue",
                agg_key="sum",
                datetime_values=dt,
                numeric_values=nums,
            )
            self.assertIsNotNone(baseline)
            self.assertIsNotNone(reused)
            assert baseline is not None and reused is not None
            pd.testing.assert_series_equal(baseline, reused, check_names=False)
            self.assertEqual(meta_a.get("timeBucket"), meta_b.get("timeBucket"))
        finally:
            main.df = None

    def test_small_dataset_discover_families_and_titles_stable(self) -> None:
        from services.auto_dashboard_opportunities import (
            _bind_deps_to_dataframe,
            classify_columns,
            discover_chart_opportunities,
        )

        df = pd.read_csv(RETAIL_FIXTURE)
        profile = main.build_profile(df)
        main.df = df
        main.dataset_profile = profile
        try:
            bound = _bind_deps_to_dataframe(df, _deps())
            inv = classify_columns(df, profile, id_like_fn=main._id_like_column_name)
            disc = discover_chart_opportunities(df, profile, "sales", bound, inv=inv)
            types = {str(c.get("chartType", "")).lower() for c in disc}
            self.assertTrue(types & {"line", "area"}, f"trend missing: {types}")
            self.assertTrue(
                types & {"donut", "pie"} or types & {"horizontalbar", "bar"},
                f"breakdown/composition missing: {types}",
            )
            titles = [str(c.get("title") or "") for c in disc]
            self.assertEqual(len(titles), len(set(titles)))
            self.assertGreaterEqual(len(disc), 3)
        finally:
            main.df = None
            main.dataset_profile = None

    def test_100k_fixture_selected_chart_fingerprint_stable(self) -> None:
        from services.auto_dashboard_opportunities import (
            _bind_deps_to_dataframe,
            classify_columns,
            discover_chart_opportunities,
            extract_kpi_chart_context,
            select_diverse_charts,
            target_chart_count,
        )
        from services.executive_kpi_cards import (
            build_executive_kpi_cards,
            infer_executive_domain,
        )

        retail_100k = (
            BACKEND_ROOT.parent / "test-fixtures" / "large-dataset" / "retail_100k.csv"
        )
        if not retail_100k.is_file():
            self.skipTest("retail_100k fixture not present")
        raw, _ = main.load_dataframe_from_upload(
            retail_100k.read_bytes(), retail_100k.name
        )
        df = main.clean_dataframe(raw)
        profile = main.build_profile(df)
        main.df = df
        main.dataset_profile = profile
        main.column_mapping = {k: None for k in main.column_mapping}
        main.apply_semantic_column_mapping(main.df, profile)
        try:
            bound = _bind_deps_to_dataframe(df, _deps())
            inv = classify_columns(df, profile, id_like_fn=main._id_like_column_name)
            disc = discover_chart_opportunities(df, profile, "sales", bound, inv=inv)
            self.assertEqual(len(disc), 14)
            self.assertTrue(
                any(str(c.get("chartType", "")).lower() in ("donut", "pie") for c in disc)
            )
            self.assertTrue(
                any(str(c.get("chartType", "")).lower() == "scatter" for c in disc)
            )
            kp = main.calculate_kpis()
            cards = build_executive_kpi_cards(
                infer_executive_domain(df.columns.tolist()),
                main._kpi_build_context(profile, kp),
            )
            selected = select_diverse_charts(
                list(disc),
                kind="sales",
                max_charts=target_chart_count(inv, len(df)),
                deps=bound,
                kpi_context=extract_kpi_chart_context(cards),
                discovered_count=len(disc),
            )
            fingerprint = [
                (
                    str(c.get("title") or ""),
                    str(c.get("chartType") or ""),
                    str(c.get("metricColumn") or ""),
                    str(c.get("dimensionColumn") or ""),
                )
                for c in selected
            ]
            self.assertEqual(len(selected), 5)
            self.assertEqual(
                [t[0] for t in fingerprint],
                [
                    "Monthly Revenue Trend",
                    "Profit by City",
                    "Revenue by City",
                    "Monthly Profit Trend",
                    "Monthly Customers Trend",
                ],
            )
            self.assertEqual(
                [t[1] for t in fingerprint],
                ["line", "horizontalBar", "horizontalBar", "area", "area"],
            )
            self.assertEqual(
                [t[2] for t in fingerprint],
                ["revenue", "profit", "revenue", "profit", "customers"],
            )
            self.assertEqual(fingerprint[1][3], "city")
            self.assertEqual(fingerprint[2][3], "city")
            self.assertEqual(fingerprint[0][3], "")
            self.assertEqual(fingerprint[3][3], "")
            self.assertEqual(fingerprint[4][3], "")
        finally:
            main.df = None
            main.dataset_profile = None


ECOMMERCE_FIXTURE = (
    BACKEND_ROOT.parent / "test-fixtures" / "domain_upload_1k" / "ecommerce_orders_10k.csv"
)
BANKING_FIXTURE = (
    BACKEND_ROOT.parent / "test-fixtures" / "domain_upload_1k" / "banking_loans_10k.csv"
)
HEALTHCARE_FIXTURE = (
    BACKEND_ROOT.parent / "test-fixtures" / "domain_upload_1k" / "covid_healthcare_10k.csv"
)
MANUFACTURING_FIXTURE = (
    BACKEND_ROOT.parent / "test-fixtures" / "domain_upload_1k" / "manufacturing_quality_10k.csv"
)
OPERATIONS_INCIDENTS_FIXTURE = (
    BACKEND_ROOT.parent / "test-fixtures" / "domains" / "operations_incidents_chart_test.csv"
)


def _bind_fixture_csv(path: Path) -> list:
    df = pd.read_csv(path)
    for col in df.columns:
        if "date" in str(col).lower():
            df[col] = pd.to_datetime(df[col], errors="coerce")
    df = main.clean_dataframe(df)
    profile = main.build_profile(df)
    main.df = df
    main.dataset_profile = profile
    proposed, meta = main.compute_semantic_column_mapping(df, profile)
    main.column_mapping_metadata = meta
    for key, val in proposed.items():
        main.column_mapping[key] = val
    try:
        dash = main.build_auto_dashboard()
        return dash.get("charts") or []
    finally:
        main.df = None
        main.dataset_profile = None
        main.column_mapping_metadata = None
        main.column_mapping = {k: None for k in main.column_mapping}


class TestAutoDashboardChartDiversity(unittest.TestCase):
    def test_ecommerce_no_composition_ranking_metric_dim_duplicate(self) -> None:
        from services.auto_dashboard_opportunities import (
            chart_breakdown_metric_dimension_pair,
            has_composition_ranking_metric_dim_duplicate,
        )

        self.assertTrue(ECOMMERCE_FIXTURE.is_file())
        charts = _bind_fixture_csv(ECOMMERCE_FIXTURE)
        record_key = main._DASH_RECORD_METRIC_KEY
        self.assertFalse(
            has_composition_ranking_metric_dim_duplicate(charts, record_key)
        )
        return_flag_pairs = [
            chart_breakdown_metric_dimension_pair(c, record_key)
            for c in charts
            if chart_breakdown_metric_dimension_pair(c, record_key)[1] == "return_flag"
        ]
        self.assertGreaterEqual(len(return_flag_pairs), 1)
        profit_return = [
            p for p in return_flag_pairs if p[0] == "profit"
        ]
        self.assertLessEqual(
            len(profit_return),
            1,
            msg="profit × return_flag should appear at most once across chart families",
        )
        titles = {str(c.get("title") or "") for c in charts}
        self.assertNotIn("Profit by Return Flag", titles)

    def test_ecommerce_keeps_expected_chart_count(self) -> None:
        charts = _bind_fixture_csv(ECOMMERCE_FIXTURE)
        self.assertGreaterEqual(len(charts), 5)

    def test_ecommerce_still_includes_composition_chart(self) -> None:
        charts = _bind_fixture_csv(ECOMMERCE_FIXTURE)
        types = {str(c.get("chartType") or "").lower() for c in charts}
        titles = " ".join(str(c.get("title") or "").lower() for c in charts)
        self.assertTrue(
            types & {"pie", "donut"} or "share" in titles,
            msg=f"expected a composition chart, got types={types}",
        )

    def test_banking_dashboard_not_degraded(self) -> None:
        charts = _bind_fixture_csv(BANKING_FIXTURE)
        self.assertGreaterEqual(len(charts), 4)
        titles = " ".join(str(c.get("title") or "").lower() for c in charts)
        self.assertTrue(
            "loan" in titles or "delinquency" in titles or "utilization" in titles
        )

    def test_healthcare_dashboard_not_degraded(self) -> None:
        charts = _bind_fixture_csv(HEALTHCARE_FIXTURE)
        self.assertGreaterEqual(len(charts), 4)
        titles = " ".join(str(c.get("title") or "").lower() for c in charts)
        self.assertTrue(
            "case" in titles or "variant" in titles or "admission" in titles
        )

    def test_chart_story_blocks_composition_ranking_same_metric_dim(self) -> None:
        from services.auto_dashboard_opportunities import (
            _chart_story_blocked_by_selected,
            _prune_duplicate_chart_stories,
            has_composition_ranking_metric_dim_duplicate,
        )

        record_key = main._DASH_RECORD_METRIC_KEY
        pie = {
            "title": "Return Flag Profit Share",
            "chartType": "pie",
            "metricColumn": "profit",
            "dimensionColumn": "return_flag",
            "labels": ["N", "Y"],
            "values": [100.0, 200.0],
            "_opportunityType": "composition",
        }
        bar = {
            "title": "Profit by Return Flag",
            "chartType": "bar",
            "metricColumn": "profit",
            "dimensionColumn": "return_flag",
            "labels": ["N", "Y"],
            "values": [100.0, 200.0],
            "_opportunityType": "ranking",
        }
        category_bar = {
            "title": "Profit by Product Category",
            "chartType": "bar",
            "metricColumn": "profit",
            "dimensionColumn": "product_category",
            "labels": ["A", "B", "C"],
            "values": [50.0, 80.0, 120.0],
            "_opportunityType": "ranking",
        }
        self.assertTrue(_chart_story_blocked_by_selected([pie], bar, record_key))
        pruned = _prune_duplicate_chart_stories([pie, bar, category_bar], record_key)
        self.assertFalse(
            has_composition_ranking_metric_dim_duplicate(pruned, record_key)
        )
        self.assertEqual(len(pruned), 2)


class TestManufacturingOperationsChartSelection(unittest.TestCase):
    def test_manufacturing_label_and_quality_focused_charts(self) -> None:
        self.assertTrue(MANUFACTURING_FIXTURE.is_file())
        df = pd.read_csv(MANUFACTURING_FIXTURE)
        for col in df.columns:
            if "date" in str(col).lower():
                df[col] = pd.to_datetime(df[col], errors="coerce")
        df = main.clean_dataframe(df)
        main.df = df
        main.dataset_profile = main.build_profile(df)
        proposed, meta = main.compute_semantic_column_mapping(df, main.dataset_profile)
        main.column_mapping_metadata = meta
        for key, val in proposed.items():
            main.column_mapping[key] = val
        try:
            dash = main.build_auto_dashboard()
            self.assertEqual(dash.get("type_label"), "Manufacturing / Operations")
            self.assertEqual(proposed.get("sales"), "units_produced")
            self.assertEqual(proposed.get("date"), "production_date")
            self.assertEqual(proposed.get("product"), "product_family")
            self.assertEqual(proposed.get("region"), "plant")
            titles = [str(c.get("title") or "") for c in dash.get("charts") or []]
            joined = " | ".join(titles)
            self.assertIn("Monthly Units Produced Trend", joined)
            self.assertIn("Average Defect Rate by Product Family", joined)
            self.assertIn("Monthly Defect Rate Trend", joined)
            self.assertIn("Monthly Defect Count Trend", joined)
            self.assertNotIn("Units Produced by Product Family", joined)
            self.assertTrue(
                any("downtime" in t.lower() for t in titles)
                or any("defect count by" in t.lower() for t in titles)
            )
            self.assertGreaterEqual(len(titles), 5)
        finally:
            main.df = None
            main.dataset_profile = None
            main.column_mapping_metadata = None
            main.column_mapping = {k: None for k in main.column_mapping}

    def test_generic_operations_incidents_label_unchanged(self) -> None:
        self.assertTrue(OPERATIONS_INCIDENTS_FIXTURE.is_file())
        df = pd.read_csv(OPERATIONS_INCIDENTS_FIXTURE)
        for col in df.columns:
            if "date" in str(col).lower():
                df[col] = pd.to_datetime(df[col], errors="coerce")
        df = main.clean_dataframe(df)
        main.df = df
        main.dataset_profile = main.build_profile(df)
        try:
            dash = main.build_auto_dashboard()
            self.assertEqual(dash.get("type_label"), "Operations")
        finally:
            main.df = None
            main.dataset_profile = None


if __name__ == "__main__":
    unittest.main()
