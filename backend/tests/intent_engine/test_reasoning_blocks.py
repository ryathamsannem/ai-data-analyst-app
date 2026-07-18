"""Unit tests for structured reasoning blocks (Phase A)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from intent_engine.reasoning_blocks import (
    build_contribution_blocks,
    build_leader_laggard_gap_blocks,
    build_reasoning_blocks,
    build_trend_movement_blocks,
    is_rate_percentage_reasoning_metric,
    reasoning_blocks_prompt_block,
)


class TestReasoningBlocks(unittest.TestCase):
    def test_contribution_block_top_entity(self) -> None:
        rows = [
            {"name": "North", "value": 350_000},
            {"name": "South", "value": 300_000},
            {"name": "East", "value": 200_000},
            {"name": "West", "value": 150_000},
        ]
        blocks = build_contribution_blocks(
            [(r["name"], r["value"]) for r in rows],
            metric_label="Sales",
            dimension_label="Region",
            cohort_n=500,
            confidence_level="high",
        )
        self.assertGreaterEqual(len(blocks), 1)
        top = blocks[0]
        self.assertEqual(top["type"], "contribution")
        self.assertIn("North", top["claim"])
        self.assertIn("35%", top["claim"])
        self.assertEqual(top["entity"], "North")
        self.assertEqual(top["confidence"], "high")

    def test_top3_concentration_block(self) -> None:
        pairs = [
            ("North", 400_000),
            ("South", 250_000),
            ("East", 150_000),
            ("West", 50_000),
        ]
        blocks = build_contribution_blocks(
            pairs,
            metric_label="Sales",
            dimension_label="Region",
            cohort_n=1000,
        )
        top3 = [b for b in blocks if "Top 3" in b["claim"]]
        self.assertEqual(len(top3), 1)
        self.assertGreaterEqual(float(top3[0]["sharePct"]), 40.0)

    def test_leader_laggard_gap_ratio(self) -> None:
        pairs = [
            ("Electronics", 420_000),
            ("Home & Kitchen", 100_000),
        ]
        blocks = build_leader_laggard_gap_blocks(
            pairs,
            metric_label="Sales",
            dimension_label="Product Category",
            cohort_n=800,
        )
        ratio_blocks = [b for b in blocks if b.get("gapRatio")]
        self.assertGreaterEqual(len(ratio_blocks), 1)
        self.assertIn("4.2x", ratio_blocks[0]["claim"])
        self.assertEqual(ratio_blocks[0]["type"], "leader_laggard_gap")

    def test_leader_laggard_absolute_gap(self) -> None:
        pairs = [
            ("North", 1_800_000),
            ("South", 1_000_000),
        ]
        blocks = build_leader_laggard_gap_blocks(
            pairs,
            metric_label="Sales",
            dimension_label="Region",
            cohort_n=500,
        )
        # Ratio is preferred when meaningful — only one gap block.
        self.assertEqual(len(blocks), 1)
        self.assertTrue(
            "x higher" in blocks[0]["claim"].lower()
            or "exceeds" in blocks[0]["claim"].lower()
        )

    def test_ranking_blocks_capped_at_three_without_duplicate_gap(self) -> None:
        rows = [
            {"name": "North", "value": 2_723_580},
            {"name": "South", "value": 2_140_062},
            {"name": "West", "value": 1_848_833},
            {"name": "East", "value": 1_137_246},
        ]
        blocks = build_reasoning_blocks(
            rows,
            chart_kind="bar",
            metric_label="sales amount",
            dimension_label="region",
            cohort_row_count=10_000,
        )
        self.assertLessEqual(len(blocks), 3)
        gap_blocks = [b for b in blocks if b["type"] == "leader_laggard_gap"]
        self.assertEqual(len(gap_blocks), 1)
        for b in blocks:
            self.assertIn(
                b["reason"],
                (
                    "Shows how much of the total this group represents.",
                    "Shows how concentrated the metric is among the top groups.",
                    "Shows the spread between the strongest and weakest group.",
                ),
            )

    def test_trend_movement_block(self) -> None:
        pairs = [
            ("2024-01", 100.0),
            ("2024-02", 88.0),
        ]
        blocks = build_trend_movement_blocks(
            pairs,
            metric_label="Sales",
            cohort_n=200,
        )
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0]["type"], "trend_movement")
        self.assertIn("decreased", blocks[0]["claim"].lower())
        self.assertIn("12%", blocks[0]["claim"])
        self.assertEqual(
            blocks[0]["reason"],
            "Compares the latest period to the one before it.",
        )

    def test_trend_chart_emits_only_trend_block(self) -> None:
        rows = [
            {"name": "2024-01", "value": 100.0},
            {"name": "2024-02", "value": 88.0},
            {"name": "2024-03", "value": 95.0},
        ]
        blocks = build_reasoning_blocks(
            rows,
            chart_kind="area",
            metric_label="Sales",
            cohort_row_count=500,
        )
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0]["type"], "trend_movement")

    def test_no_blocks_when_sparse_or_invalid(self) -> None:
        self.assertEqual(
            build_reasoning_blocks([{"name": "Only", "value": 100}], chart_kind="bar"),
            [],
        )
        self.assertEqual(
            build_reasoning_blocks(
                [{"name": "A", "value": 0}, {"name": "B", "value": 0}],
                chart_kind="bar",
            ),
            [],
        )
        pairs = [("A", 50.0), ("B", 48.0)]
        self.assertEqual(
            build_trend_movement_blocks(pairs, metric_label="Sales", cohort_n=100),
            [],
        )

    def test_prompt_block_includes_no_causation_guidance(self) -> None:
        blocks = build_reasoning_blocks(
            [
                {"name": "North", "value": 350},
                {"name": "South", "value": 150},
            ],
            chart_kind="bar",
            metric_label="Sales",
            dimension_label="Region",
        )
        prompt = reasoning_blocks_prompt_block(blocks)
        self.assertIn("Do not invent causes", prompt)
        self.assertIn("North", prompt)

    def test_rate_metric_detection(self) -> None:
        self.assertTrue(
            is_rate_percentage_reasoning_metric(
                "Average profit margin pct", "profit_margin_pct"
            )
        )
        self.assertTrue(
            is_rate_percentage_reasoning_metric("utilization pct", "utilization_pct")
        )
        self.assertTrue(
            is_rate_percentage_reasoning_metric("defect rate", "defect_rate")
        )
        self.assertTrue(
            is_rate_percentage_reasoning_metric(
                "conversion rate", "conversion_rate_pct"
            )
        )
        self.assertFalse(
            is_rate_percentage_reasoning_metric("sales amount", "revenue")
        )
        self.assertFalse(is_rate_percentage_reasoning_metric("profit", "profit"))

    def test_profit_margin_pct_uses_comparison_not_contribution(self) -> None:
        rows = [
            {"name": "Enterprise", "value": 14.4},
            {"name": "Professional", "value": 6.7},
            {"name": "Starter", "value": 0.1},
        ]
        blocks = build_reasoning_blocks(
            rows,
            chart_kind="bar",
            metric_label="Average profit margin pct",
            metric_column="profit_margin_pct",
            dimension_label="product",
            cohort_row_count=500,
        )
        claims = " ".join(b["claim"] for b in blocks).lower()
        self.assertNotIn("contributes", claims)
        self.assertNotIn("top 3", claims)
        self.assertNotIn("account for", claims)
        self.assertIn("highest average profit margin pct", claims)
        self.assertIn("lowest average profit margin pct", claims)
        self.assertIn("percentage points", claims)
        self.assertTrue(all(b["type"] != "contribution" for b in blocks))

    def test_revenue_still_uses_contribution_wording(self) -> None:
        rows = [
            {"name": "North", "value": 350_000},
            {"name": "South", "value": 300_000},
            {"name": "East", "value": 200_000},
            {"name": "West", "value": 150_000},
        ]
        blocks = build_reasoning_blocks(
            rows,
            chart_kind="bar",
            metric_label="Sales",
            metric_column="revenue",
            dimension_label="Region",
            cohort_row_count=500,
        )
        contrib = [b for b in blocks if b["type"] == "contribution"]
        self.assertGreaterEqual(len(contrib), 1)
        self.assertIn("contributes", contrib[0]["claim"].lower())

    def test_profit_amount_still_uses_contribution_wording(self) -> None:
        rows = [
            {"name": "Widget A", "value": 2400},
            {"name": "Widget B", "value": 1800},
            {"name": "Widget C", "value": 900},
        ]
        blocks = build_reasoning_blocks(
            rows,
            chart_kind="bar",
            metric_label="Profit",
            metric_column="profit",
            dimension_label="product",
            cohort_row_count=120,
        )
        contrib = [b for b in blocks if b["type"] == "contribution"]
        self.assertGreaterEqual(len(contrib), 1)
        self.assertIn("contributes", contrib[0]["claim"].lower())


if __name__ == "__main__":
    unittest.main()
