"""Overview auto-dashboard correctness for retail_gold_10000.csv."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
GOLDEN_RETAIL = REPO_ROOT / "test-fixtures" / "golden-datasets" / "retail_gold_10000.csv"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
from intent_engine.column_resolve import (  # noqa: E402
    column_prefers_mean_aggregation,
    is_date_part_column,
)
from services.auto_dashboard_opportunities import (  # noqa: E402
    classify_columns,
    _executive_metric_by_dim_title,
)


def _load_retail_gold() -> tuple[pd.DataFrame, dict]:
    df = pd.read_csv(GOLDEN_RETAIL)
    df["order_date"] = pd.to_datetime(df["order_date"], errors="coerce")
    profile = main.build_profile(df)
    main.df = df
    main.dataset_profile = profile
    main.column_mapping = {k: None for k in main.column_mapping}
    proposed, _ = main.compute_semantic_column_mapping(df, profile)
    for key, val in proposed.items():
        main.column_mapping[key] = val
    return df, profile


class TestDatePartColumnClassification(unittest.TestCase):
    def test_date_part_columns_detected(self) -> None:
        for col in ("year", "month", "quarter", "month_num", "week", "day"):
            self.assertTrue(is_date_part_column(col), msg=col)
        self.assertFalse(is_date_part_column("sales_amount"))
        self.assertFalse(is_date_part_column("order_date"))

    def test_profile_marks_year_as_category_not_number(self) -> None:
        df, profile = _load_retail_gold()
        ct = profile.get("column_types", {})
        self.assertEqual(ct.get("year"), "category")
        self.assertEqual(ct.get("month"), "category")
        self.assertEqual(ct.get("quarter"), "category")
        self.assertEqual(ct.get("sales_amount"), "number")

    def test_classify_excludes_date_parts_from_numerics(self) -> None:
        df, profile = _load_retail_gold()
        inv = classify_columns(
            df,
            profile,
            id_like_fn=main._id_like_column_name,
            numeric_series_fn=main.numeric_series,
        )
        numeric_lower = {c.lower() for c in inv.numerics}
        for bad in ("year", "month", "quarter"):
            self.assertNotIn(bad, numeric_lower)


class TestRetailGoldOverviewCharts(unittest.TestCase):
    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping = {k: None for k in main.column_mapping}

    def test_no_invalid_year_measure_charts(self) -> None:
        _load_retail_gold()
        dash = main.build_auto_dashboard()
        titles = [str(c.get("title") or "") for c in dash.get("charts") or []]
        joined = " | ".join(titles).lower()
        self.assertNotIn("year by customer segment", joined)
        self.assertNotIn("monthly year trend", joined)
        self.assertNotIn("year by ", joined)
        useful = any(
            token in joined
            for token in (
                "sales amount by customer segment",
                "sales amount by region",
                "sales amount by marketing channel",
                "product category",
                "profit",
                "delivery days",
            )
        )
        self.assertTrue(useful, msg=f"Expected useful retail charts, got: {titles}")

    def test_trend_uses_latest_months_through_2024_12(self) -> None:
        _load_retail_gold()
        dash = main.build_auto_dashboard()
        trend = next(
            (
                c
                for c in dash.get("charts") or []
                if str(c.get("chartType", "")).lower() in ("line", "area")
                and "trend" in str(c.get("title") or "").lower()
            ),
            None,
        )
        self.assertIsNotNone(trend, msg="Expected a monthly sales trend chart")
        labels = trend.get("labels") or []
        self.assertGreaterEqual(len(labels), 2)
        self.assertEqual(str(labels[-1]), "2024-12")

    def test_delivery_days_uses_average_title(self) -> None:
        self.assertTrue(column_prefers_mean_aggregation("delivery_days"))
        title = _executive_metric_by_dim_title(
            "delivery_days",
            "sub_category",
            "mean",
            main._pretty_label_text,
        )
        self.assertIn("Average Delivery Days", title)
        self.assertIn("Sub Category", title)

        _load_retail_gold()
        dash = main.build_auto_dashboard()
        titles = [str(c.get("title") or "") for c in dash.get("charts") or []]
        delivery_titles = [t for t in titles if "delivery" in t.lower()]
        if delivery_titles:
            self.assertTrue(
                any("average" in t.lower() for t in delivery_titles),
                msg=f"Expected average aggregation in titles: {delivery_titles}",
            )


class TestTrendSeriesUsesLatestPoints(unittest.TestCase):
    def test_line_chart_payload_uses_tail_not_head(self) -> None:
        idx = [f"2022-{m:02d}" for m in range(1, 13)] + [
            f"2023-{m:02d}" for m in range(1, 13)
        ] + [f"2024-{m:02d}" for m in range(1, 13)]
        series = pd.Series(range(len(idx)), index=idx, dtype=float)
        payload = main._dash_series_payload(
            "Monthly Sales Amount Trend",
            series,
            chart_type="line",
            max_points=14,
            metric_column="sales_amount",
        )
        self.assertIsNotNone(payload)
        labels = payload.get("labels") or []
        self.assertEqual(labels[-1], "2024-12")
        self.assertEqual(labels[0], "2023-11")
        self.assertEqual(len(labels), 14)


if __name__ == "__main__":
    unittest.main()
