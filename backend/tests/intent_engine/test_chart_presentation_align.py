"""Bar orientation alignment for geographic ranking provenance."""

from __future__ import annotations

import unittest

from intent_engine.chart_presentation_align import (
    humanize_api_chart_type,
    resolve_presented_bar_api_type,
)


class TestChartPresentationAlign(unittest.TestCase):
    def test_region_highest_revenue_prefers_vertical_bar(self) -> None:
        api, reason = resolve_presented_bar_api_type(
            question="Which region generates the highest revenue?",
            title="Total revenue by zone",
            category_labels=["South", "West", "North", "East"],
            engine_api_type="horizontalBar",
        )
        self.assertEqual(api, "bar")
        self.assertEqual(humanize_api_chart_type(api), "Vertical bar chart")
        self.assertIn("vertical", (reason or "").lower())

    def test_top_performing_city_compact_vertical(self) -> None:
        cities = [
            "Mumbai",
            "Delhi",
            "Bengaluru",
            "Hyderabad",
            "Chennai",
            "Pune",
            "Kolkata",
            "Jaipur",
        ]
        api, reason = resolve_presented_bar_api_type(
            question="Top Performing City",
            title="Total revenue by city",
            category_labels=cities,
            engine_api_type="horizontalBar",
        )
        self.assertEqual(api, "bar")
        self.assertIn("vertical", (reason or "").lower())


if __name__ == "__main__":
    unittest.main()
