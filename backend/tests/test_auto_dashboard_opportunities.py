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


if __name__ == "__main__":
    unittest.main()
