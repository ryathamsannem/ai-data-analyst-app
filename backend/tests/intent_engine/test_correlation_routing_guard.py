"""
Correlation routing guard — no generic fallback charts; bucket alignment; trend safe.
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
GEO_FIXTURE = BACKEND_ROOT / "tests" / "fixtures" / "geographic_performance.csv"
ONE_PERIOD_CSV = BACKEND_ROOT / "tests" / "fixtures" / "geographic_one_period.csv"


class TestCorrelationRoutingGuard(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import main as main_mod

        cls.main = main_mod

    def _load(self, path: Path) -> None:
        df = pd.read_csv(path)
        self.main.df = df
        self.main.dataset_profile = self.main.build_profile(df)

    def test_correlated_with_bucket_is_relationship_not_compare(self) -> None:
        bucket = self.main._chart_selection_question_bucket(
            "is customer count correlated with revenue"
        )
        self.assertEqual(bucket, "relationship")

    def test_missing_metric_columns_no_bar_fallback(self) -> None:
        self._load(FIXTURE_CSV)
        q = "What is the correlation between nonexistent_metric_a and nonexistent_metric_b?"
        exact, visualization, analysis = self.main.compute_visualization_for_question(q)
        intent = analysis.get("intent") or {}
        self.assertEqual(intent.get("primaryGoal"), "relationship")
        self.assertIsNone(visualization)
        self.assertNotIn("Laptop", exact)
        self.assertNotIn("Keyboard", exact)
        rec = analysis.get("chartRecommendation") or {}
        self.assertEqual(rec.get("detectedIntent"), "relationship")
        self.assertTrue(
            analysis.get("partialVisualizationWarning")
            or "not found" in (exact or "").lower()
            or "column" in (exact or "").lower(),
            msg="expected missing-column context",
        )

    def test_compare_by_region_not_correlation_locked(self) -> None:
        self._load(FIXTURE_CSV)
        q = "Compare revenue and profit by region"
        _, visualization, analysis = self.main.compute_visualization_for_question(q)
        intent = analysis.get("intent") or {}
        self.assertEqual(intent.get("primaryGoal"), "compare")
        self.assertIsNotNone(visualization)
        self.assertNotEqual(visualization.get("chartType"), "scatter")

    def test_trend_by_month_unchanged(self) -> None:
        self._load(FIXTURE_CSV)
        q = "Show revenue trend by month"
        _exact, visualization, analysis = self.main.compute_visualization_for_question(q)
        intent = analysis.get("intent") or {}
        self.assertIn(
            intent.get("primaryGoal"),
            ("trend", "compare", "rank"),
            msg="trend intent should not become relationship",
        )
        if visualization:
            self.assertIn(
                str(visualization.get("chartType") or "").lower(),
                ("line", "area", "bar"),
            )

    def test_trend_single_period_still_unsupported(self) -> None:
        self._load(ONE_PERIOD_CSV)
        q = "Show revenue trend by region"
        _exact, _viz, analysis = self.main.compute_visualization_for_question(q)
        ut = analysis.get("unsupportedTrendAnalysis") or {}
        self.assertTrue(
            ut.get("active") or analysis.get("trendRequestUnsatisfied"),
            msg="single-period trend should stay unsupported",
        )


if __name__ == "__main__":
    unittest.main()
