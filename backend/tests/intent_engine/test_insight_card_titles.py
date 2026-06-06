"""Executive insight card title helper — no raw question text."""

from __future__ import annotations

import unittest

from intent_engine.insight_card_titles import (
    build_insight_card_title,
    is_question_like_label,
    resolve_executive_measure_label,
    sanitize_measure_for_card_title,
)


class TestInsightCardTitles(unittest.TestCase):
    def test_question_like_detected(self) -> None:
        q = "Is customer count correlated with revenue?"
        self.assertTrue(is_question_like_label(q))
        self.assertEqual(sanitize_measure_for_card_title(q), "")

    def test_build_gap_title(self) -> None:
        self.assertEqual(
            build_insight_card_title("Revenue", "gap"),
            "Revenue Gap",
        )
        self.assertEqual(
            build_insight_card_title("Customer Count", "share"),
            "Customer Count Share",
        )

    def test_resolve_from_columns_not_question(self) -> None:
        label = resolve_executive_measure_label(
            value_axis="Is customer count correlated with revenue?",
            chart_title="Is customer count correlated with revenue?",
            dataset_columns=["customer_count", "revenue", "region"],
        )
        self.assertIn(label.lower(), ("customer count", "revenue"))


if __name__ == "__main__":
    unittest.main()
