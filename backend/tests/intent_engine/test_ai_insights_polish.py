"""
Final AI Insights polish — confidence calibration, outlier cards, growth wording, driver safety.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

FIXTURE_CSV = BACKEND_ROOT / "tests" / "fixtures" / "geographic_performance.csv"

POLISH_QUESTIONS = [
    "What drives revenue the most?",
    "Which city is an outlier?",
    "Compare growth rate across zones",
    "Is customer count correlated with revenue?",
]


class TestAiInsightsPolish(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.df = pd.read_csv(FIXTURE_CSV)
        import main as main_mod

        cls.main = main_mod
        cls.main.df = cls.df
        cls.main.dataset_profile = cls.main.build_profile(cls.df)

    def _run(self, question: str) -> tuple:
        return self.main.compute_visualization_for_question(question)

    def test_correlation_confidence_calibrated_small_sample(self) -> None:
        q = "Is customer count correlated with revenue?"
        exact, viz, analysis = self._run(q)
        score = int(analysis.get("insightConfidenceScore") or 0)
        self.assertGreaterEqual(score, 45, msg=analysis.get("insightConfidenceReasons"))
        self.assertLessEqual(score, 65)
        self.assertIn(analysis.get("insightConfidenceLevel"), ("low", "medium"))
        joined = " ".join(analysis.get("insightConfidenceReasons") or [])
        self.assertIn("paired row", joined.lower())
        self.assertIn("directional", joined.lower())
        self.assertIsNotNone(viz)
        self.assertEqual(viz.get("chartType"), "scatter")
        ri = viz.get("relationshipInsights") or {}
        self.assertIsNotNone(ri.get("pearson"))

    def test_driver_routing_and_confidence(self) -> None:
        q = "What drives revenue the most?"
        exact, viz, analysis = self._run(q)
        intent = analysis.get("intent") or {}
        self.assertEqual(intent.get("primaryGoal"), "driver")
        self.assertEqual(viz.get("chartType"), "scatter")
        score = int(analysis.get("insightConfidenceScore") or 0)
        self.assertGreaterEqual(score, 45)
        self.assertLessEqual(score, 65)
        self.assertTrue(analysis.get("driverAnalysis"))
        self.assertIn("routingConfidenceScore", analysis)
        self.assertIn("sampleConfidenceScore", analysis)

    def test_outlier_cards_mumbai_jaipur_not_kolkata(self) -> None:
        q = "Which city is an outlier?"
        exact, viz, analysis = self._run(q)
        self.assertEqual((analysis.get("intent") or {}).get("primaryGoal"), "outlier")
        score = int(analysis.get("insightConfidenceScore") or 0)
        self.assertGreaterEqual(score, 45)
        self.assertLessEqual(score, 60)

        ranked = viz.get("rankedExecutiveInsights") or []
        values = [str(c.get("value") or "") for c in ranked if isinstance(c, dict)]
        joined = " ".join(
            str(c.get("narrativeLine") or c.get("hint") or "")
            for c in ranked
            if isinstance(c, dict)
        ).lower()
        self.assertIn("Mumbai", values + [joined])
        self.assertIn("Jaipur", values + [joined])
        self.assertNotIn("Kolkata", values)
        self.assertNotIn("kolkata", joined)

        from intent_engine.categorical_outlier_narrative import (
            compute_categorical_outlier_insights,
        )

        rows = [
            {"name": r["city"], "value": float(r["revenue"])}
            for _, r in self.df.iterrows()
        ]
        coi = compute_categorical_outlier_insights(
            rows, dimension_label="city", metric_label="revenue"
        )
        self.assertIsNotNone(coi)
        high_names = [h["name"] for h in coi.get("highOutliers") or []]
        low_names = [l["name"] for l in coi.get("lowOutliers") or []]
        self.assertEqual(high_names, ["Mumbai"])
        self.assertEqual(low_names, ["Jaipur"])

    def test_static_growth_metric_compare_renders_chart(self) -> None:
        """Compare an existing growth_rate column — chart renders; growth is not suppressed."""
        q = "Compare growth rate across zones"
        exact, viz, analysis = self._run(q)
        self.assertIsNotNone(viz, msg=q)
        labels = (viz or {}).get("labels") or []
        self.assertGreaterEqual(len(labels), 2, msg=q)
        self.assertIn("growth", str(analysis.get("metricColumn") or "").lower(), msg=q)
        self.assertFalse(bool(analysis.get("growthRequestUnsatisfied")), msg=q)
        ug = analysis.get("unsupportedGrowthAnalysis") or {}
        self.assertFalse(bool(ug.get("active")), msg=q)
        score = int(analysis.get("insightConfidenceScore") or 0)
        self.assertGreaterEqual(score, 40)
        self.assertIn(analysis.get("insightConfidenceLevel"), ("low", "medium"))


if __name__ == "__main__":
    unittest.main()
