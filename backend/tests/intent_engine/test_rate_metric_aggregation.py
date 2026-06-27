"""Rate / percentage metrics must aggregate with mean, not sum."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
from analytics_metadata import build_metric_label  # noqa: E402
from intent_engine.column_resolve import column_prefers_mean_aggregation  # noqa: E402


class TestRateMetricAggregation(unittest.TestCase):
    def test_conversion_rate_pct_prefers_mean(self) -> None:
        self.assertTrue(column_prefers_mean_aggregation("conversion_rate_pct"))

    def test_rate_and_pct_tokens_prefers_mean(self) -> None:
        self.assertTrue(column_prefers_mean_aggregation("click_through_rate"))
        self.assertTrue(column_prefers_mean_aggregation("margin_pct"))
        self.assertTrue(column_prefers_mean_aggregation("nps_score"))

    def test_additive_metrics_still_sum(self) -> None:
        self.assertFalse(column_prefers_mean_aggregation("revenue"))
        self.assertFalse(column_prefers_mean_aggregation("units_sold"))

    def test_delivery_days_prefers_mean(self) -> None:
        self.assertTrue(column_prefers_mean_aggregation("delivery_days"))
        self.assertTrue(column_prefers_mean_aggregation("discount_pct"))

    def test_ranking_question_uses_average_for_rate_column(self) -> None:
        label, key = main._resolve_agg_label_and_key(
            "conversion rate by campaign name",
            value_col="conversion_rate_pct",
        )
        self.assertEqual(key, "mean")
        self.assertEqual(label, "Average")

    def test_explicit_total_overrides_rate_default(self) -> None:
        label, key = main._resolve_agg_label_and_key(
            "total conversion rate by campaign",
            value_col="conversion_rate_pct",
        )
        self.assertEqual(key, "sum")
        self.assertEqual(label, "Total")

    def test_metric_label_uses_average_not_total(self) -> None:
        title = build_metric_label("mean", "average", "conversion_rate_pct")
        self.assertIn("Average", title)
        self.assertNotIn("Total", title)

    def test_conversion_rate_by_campaign_prefers_horizontal_bar(self) -> None:
        chart_data = [
            {"name": "Spring", "value": 2.4},
            {"name": "Summer", "value": 3.1},
            {"name": "Fall", "value": 2.8},
        ]
        chart_type, reason, _conf = main.determine_chart_type_and_reason(
            "conversion rate by campaign name",
            "pie",
            chart_data,
            {"value_col": "conversion_rate_pct", "group_col": "campaign_name"},
            {},
        )
        self.assertEqual(chart_type, "bar_horizontal")
        self.assertIn("Rate or percentage", reason)


if __name__ == "__main__":
    unittest.main()
