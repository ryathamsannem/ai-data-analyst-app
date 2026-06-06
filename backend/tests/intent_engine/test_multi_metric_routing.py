"""
Regression tests — unsupported multi-metric comparison routing (no ranking fallback).
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

FIXTURE_CSV = BACKEND_ROOT / "tests" / "fixtures" / "retail_region_product.csv"


class TestMultiMetricRouting(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.df = pd.read_csv(FIXTURE_CSV)
        import main as main_mod

        cls.main = main_mod
        main_mod.df = cls.df
        main_mod.dataset_profile = main_mod.build_profile(cls.df)

    def test_revenue_vs_ad_spend_suppresses_ranking_chart(self) -> None:
        question = "Compare revenue vs ad spend"
        exact, visualization, analysis = (
            self.main.compute_visualization_for_question(question)
        )

        self.assertIsNone(visualization)

        umm = analysis.get("unsupportedMultiMetricAnalysis")
        self.assertIsInstance(umm, dict)
        self.assertTrue(umm.get("active"))
        self.assertTrue(analysis.get("multiMetricRequestUnsatisfied"))
        self.assertIn("ad_spend", umm.get("missingMetrics") or [])
        self.assertIn("missing_ad_spend_column", umm.get("reasonCodes") or [])
        self.assertEqual(umm.get("reasonCode"), "missing_ad_spend_column")
        self.assertIn("ad_spend", (umm.get("leadSentence") or "").lower())
        avail = umm.get("availableRelatedColumns") or []
        self.assertIn("revenue", avail)
        self.assertNotIn("Laptop", exact)
        self.assertNotIn("product", exact.lower().split("missing metric:")[0] if exact else "")

        intent = analysis.get("intent")
        self.assertIsInstance(intent, dict)
        self.assertEqual(intent.get("primaryGoal"), "multi_metric_comparison")
        self.assertFalse(intent.get("support", {}).get("supported"))
        self.assertIn(
            "missing_ad_spend_column",
            intent.get("support", {}).get("reasonCodes", []),
        )

        self.assertTrue(exact.strip())

    def test_revenue_profit_by_region_still_charts(self) -> None:
        _, visualization, analysis = self.main.compute_visualization_for_question(
            "Compare revenue and profit by region"
        )
        intent = analysis.get("intent")
        self.assertEqual(intent.get("primaryGoal"), "compare")
        self.assertTrue(intent.get("support", {}).get("supported"))
        self.assertIsNotNone(visualization)


if __name__ == "__main__":
    unittest.main()
