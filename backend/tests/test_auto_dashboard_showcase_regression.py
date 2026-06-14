"""Regression tests for Auto Dashboard on dashboard_showcase_dataset.csv."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
from analytics_metadata import format_executive_number  # noqa: E402
from services.auto_dashboard_opportunities import (  # noqa: E402
    DashboardDeps,
    _metric_agg_key,
    build_dashboard_charts_from_opportunities,
    classify_columns,
)

FIXTURE = BACKEND_ROOT / "tests" / "fixtures" / "dashboard_showcase_dataset.csv"


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


class TestShowcaseDomainAndKpis(unittest.TestCase):
    def setUp(self) -> None:
        self.df = pd.read_csv(FIXTURE, parse_dates=["date"])
        self.profile = main.build_profile(self.df)
        main.df = self.df
        main.dataset_profile = self.profile

    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping = {k: None for k in main.column_mapping}

    def test_classifies_as_sales_not_hr(self) -> None:
        self.assertEqual(main.infer_dataset_kind(), "sales")
        self.assertEqual(main.infer_auto_dashboard_kind(), "sales")
        self.assertEqual(main.infer_kpi_domain(), "sales")

    def test_sales_kpi_cards_use_business_metrics(self) -> None:
        dash = main.build_auto_dashboard()
        titles = [str(c.get("title", "")) for c in dash.get("cards", [])]
        self.assertIn("Total Revenue", titles)
        self.assertTrue(
            "Average Revenue per Record" in titles or "Average Revenue" in titles,
            msg=f"titles={titles}",
        )
        self.assertIn("Total Profit", titles)
        self.assertNotIn("Total Employees", titles)
        self.assertNotIn("Department Count", titles)
        for card in dash.get("cards", []):
            val = str(card.get("value", ""))
            self.assertNotEqual(val, "N/A", msg=f"KPI {card.get('title')} should not be N/A")

    def test_calculate_kpis_total_sales_populated(self) -> None:
        kp = main.calculate_kpis()
        self.assertIsNotNone(kp.get("total_sales"))
        self.assertGreater(float(kp["total_sales"]), 0)


class TestShowcaseCharts(unittest.TestCase):
    def setUp(self) -> None:
        self.df = pd.read_csv(FIXTURE, parse_dates=["date"])
        self.profile = main.build_profile(self.df)
        main.df = self.df
        main.dataset_profile = self.profile

    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None

    def test_scatter_payload_has_numeric_x_axis(self) -> None:
        charts = build_dashboard_charts_from_opportunities(
            self.df, self.profile, "sales", _deps(), seed_candidates=[]
        )
        scatters = [
            c
            for c in charts
            if str(c.get("chartType", "")).lower() == "scatter"
        ]
        self.assertGreaterEqual(len(scatters), 1, "expected at least one scatter chart")
        sc = scatters[0]
        sx = sc.get("scatterX") or []
        sy = sc.get("values") or []
        self.assertGreaterEqual(len(sx), 12)
        self.assertEqual(len(sx), len(sy))
        self.assertTrue(all(isinstance(x, (int, float)) for x in sx))
        disp = sc.get("scatterXDisplay") or []
        self.assertEqual(len(disp), len(sx))
        for label in disp:
            self.assertNotIn("e+", str(label).lower())
            self.assertNotIn("e-", str(label).lower())

    def test_satisfaction_by_country_uses_mean_not_sum(self) -> None:
        inv = classify_columns(
            self.df, self.profile, id_like_fn=main._id_like_column_name
        )
        self.assertEqual(_metric_agg_key("satisfaction_score", inv), "mean")

        charts = build_dashboard_charts_from_opportunities(
            self.df, self.profile, "sales", _deps(), seed_candidates=[]
        )
        country_sat = [
            c
            for c in charts
            if "country" in str(c.get("dimensionColumn", "")).lower()
            and "satisfaction" in str(c.get("title", "")).lower()
        ]
        if country_sat:
            title = str(country_sat[0].get("title", "")).lower()
            self.assertNotIn("total satisfaction", title)


class TestExecutiveNumberFormat(unittest.TestCase):
    def test_no_scientific_notation(self) -> None:
        self.assertEqual(format_executive_number(40720.0), "40,720")
        self.assertNotIn("e", format_executive_number(4.072e4).lower())


class TestManualMappingConfidence(unittest.TestCase):
    def setUp(self) -> None:
        self.df = pd.read_csv(FIXTURE, parse_dates=["date"])
        self.profile = main.build_profile(self.df)
        main.df = self.df
        main.dataset_profile = self.profile

    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None

    def test_user_mapping_boosts_role_confidence(self) -> None:
        from main import ColumnMappingRequest, update_column_mapping

        req = ColumnMappingRequest(
            product_column="product",
            sales_column="revenue",
            region_column="region",
            customer_column=None,
            profit_column="profit",
            date_column="date",
        )
        result = update_column_mapping(req)
        roles = (result.get("mapping_metadata") or {}).get("roles") or {}
        for rk in ("product", "sales", "region", "date"):
            conf = str((roles.get(rk) or {}).get("confidence", "")).lower()
            self.assertEqual(conf, "high", msg=f"role {rk} confidence should be high")


if __name__ == "__main__":
    unittest.main()
