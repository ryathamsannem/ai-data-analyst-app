"""
Intent engine tests — decline + multi-metric comparison fixes.
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


class TestIntentDetectionFixes(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.df = pd.read_csv(FIXTURE_CSV)
        import main as main_mod

        cls.main = main_mod
        main_mod.df = cls.df
        main_mod.dataset_profile = main_mod.build_profile(cls.df)
        cls.profile = main_mod.dataset_profile

    def _resolve(self, question: str) -> dict:
        from intent_engine.resolve_analysis_intent import resolve_analysis_intent

        intent_debug = self.main._describe_aggregate_intent(
            question, self.df, self.profile
        )
        spec = self.main._resolve_question_metric_spec(question, self.df, self.profile)
        if spec and intent_debug:
            self.main._apply_metric_spec_to_intent(intent_debug, spec)

        return resolve_analysis_intent(
            question=question,
            df=self.df,
            profile=self.profile,
            intent_debug=intent_debug,
            chart_type_internal="bar",
            chart_points=4,
        )

    def test_category_declining(self) -> None:
        intent = self._resolve("Which category is declining?")
        self.assertEqual(intent["primaryGoal"], "decline")
        self.assertEqual(intent["dimension"]["columnKey"], "product")
        self.assertEqual(intent["metric"]["columnKey"], "revenue")
        self.assertFalse(intent["support"]["supported"])
        self.assertIn("insufficient_time_series", intent["support"]["reasonCodes"])

    def test_product_declining(self) -> None:
        intent = self._resolve("Which product is declining?")
        self.assertEqual(intent["primaryGoal"], "decline")
        self.assertEqual(intent["dimension"]["columnKey"], "product")
        self.assertEqual(intent["metric"]["columnKey"], "revenue")
        self.assertFalse(intent["support"]["supported"])

    def test_region_declining(self) -> None:
        intent = self._resolve("Which region is declining?")
        self.assertEqual(intent["primaryGoal"], "decline")
        self.assertEqual(intent["dimension"]["columnKey"], "region")
        self.assertEqual(intent["metric"]["columnKey"], "revenue")
        self.assertFalse(intent["support"]["supported"])
        self.assertIn("insufficient_time_series", intent["support"]["reasonCodes"])

    def test_compare_revenue_vs_ad_spend(self) -> None:
        intent = self._resolve("Compare revenue vs ad spend")
        self.assertEqual(intent["primaryGoal"], "multi_metric_comparison")
        self.assertIn("revenue", intent["requestedMetrics"])
        self.assertIn("ad_spend", intent["requestedMetrics"])
        self.assertFalse(intent["support"]["supported"])
        reasons = intent["support"]["reasonCodes"]
        self.assertIn("missing_metric_operand", reasons)
        self.assertIn("missing_ad_spend_column", reasons)
        self.assertNotEqual(intent["primaryGoal"], "relationship")

    def test_compare_revenue_profit_by_region_unchanged(self) -> None:
        intent = self._resolve("Compare revenue and profit by region")
        self.assertEqual(intent["primaryGoal"], "compare")
        self.assertTrue(intent["flags"]["dualMetricCompare"])
        self.assertEqual(intent["dimension"]["columnKey"], "region")
        self.assertTrue(intent["support"]["supported"])

    def test_relationship_between_revenue_and_profit(self) -> None:
        intent = self._resolve("Relationship between revenue and profit")
        self.assertEqual(intent["primaryGoal"], "relationship")
        self.assertTrue(intent["flags"]["requestsRelationship"])
        self.assertNotEqual(intent["primaryGoal"], "multi_metric_comparison")


if __name__ == "__main__":
    unittest.main()
