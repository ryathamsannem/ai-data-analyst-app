"""Executive insight ranking — concentration over raw amounts."""

from __future__ import annotations

import unittest

from intent_engine.executive_insight_ranking import (
    is_weak_executive_line,
    rank_category_executive_insights,
)


class TestExecutiveInsightRanking(unittest.TestCase):
    def test_weak_line_detection(self) -> None:
        self.assertTrue(is_weak_executive_line("East contributes 116k"))
        self.assertFalse(
            is_weak_executive_line(
                "South contributes 39% of total revenue and dominates performance."
            )
        )

    def test_concentration_ranked_first(self) -> None:
        rows = [
            {"name": "South", "value": 390_000},
            {"name": "East", "value": 116_000},
            {"name": "West", "value": 90_000},
        ]
        ranked = rank_category_executive_insights(
            rows, metric_label="Revenue", dimension_label="Region"
        )
        self.assertGreaterEqual(len(ranked), 1)
        top = ranked[0]
        self.assertEqual(top["kind"], "concentration")
        self.assertIn("%", top["value"])
        self.assertIn("dominates", str(top["narrativeLine"]).lower())
        self.assertIn("Revenue", top["title"])
        self.assertNotIn("?", top["title"])


if __name__ == "__main__":
    unittest.main()
