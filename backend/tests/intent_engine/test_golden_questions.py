"""
Golden-question fixtures for Phase 1 intent engine (parallel metadata only).
Run from backend/: python -m unittest tests.intent_engine.test_golden_questions
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

GOLDEN_QUESTIONS = [
    "Show revenue trend by month",
    "Which region is growing fastest?",
    "Which region is declining?",
    "Compare revenue and profit by region",
    "Which region has the best profit margin?",
]


class TestGoldenIntentFixtures(unittest.TestCase):
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

    def test_all_golden_questions_produce_intent(self) -> None:
        for q in GOLDEN_QUESTIONS:
            with self.subTest(question=q):
                intent = self._resolve(q)
                self.assertEqual(intent.get("version"), 1)
                self.assertEqual(intent.get("question"), q)
                self.assertIn("primaryGoal", intent)
                self.assertIn("metric", intent)
                self.assertIn("dimension", intent)
                self.assertIn("support", intent)
                self.assertIn("tags", intent)

    def test_revenue_trend_by_month(self) -> None:
        intent = self._resolve("Show revenue trend by month")
        self.assertIn(intent["primaryGoal"], ("trend", "compare", "rank"))
        self.assertTrue(
            intent["flags"]["requestsTrend"]
            or "trend" in intent.get("tags", [])
            or intent["chart"]["routingBucket"] == "trend"
        )
        self.assertIn(
            str(intent["metric"].get("displayLabel", "")).lower(),
            ("revenue", "sales", "—"),
        )

    def test_growing_fastest_unsupported_growth(self) -> None:
        intent = self._resolve("Which region is growing fastest?")
        self.assertTrue(intent["flags"]["requestsGrowth"])
        self.assertEqual(intent["primaryGoal"], "unsupported_analysis")
        support = intent["support"]
        self.assertFalse(support["supported"])
        self.assertTrue(support.get("growth", {}).get("active"))

    def test_declining_region(self) -> None:
        intent = self._resolve("Which region is declining?")
        self.assertEqual(intent["primaryGoal"], "decline")
        self.assertEqual(intent["dimension"].get("columnKey"), "region")
        self.assertEqual(intent["metric"].get("columnKey"), "revenue")
        self.assertFalse(intent["support"]["supported"])
        self.assertIn("insufficient_time_series", intent["support"]["reasonCodes"])

    def test_compare_revenue_profit_by_region(self) -> None:
        intent = self._resolve("Compare revenue and profit by region")
        self.assertIn(intent["primaryGoal"], ("compare", "rank"))
        self.assertEqual(
            str(intent["dimension"].get("columnKey", "")).lower(),
            "region",
        )
        self.assertTrue(
            intent["flags"].get("dualMetricCompare")
            or intent["chart"]["routingBucket"] == "compare"
            or "compare" in intent.get("tags", [])
        )

    def test_profit_margin_derived_candidate(self) -> None:
        intent = self._resolve("Which region has the best profit margin?")
        self.assertTrue(intent["flags"]["requestsProfitMargin"])
        derived = intent.get("derivedMetricCandidate")
        self.assertIsNotNone(derived)
        self.assertEqual(derived.get("id"), "profit_margin")
        self.assertTrue(derived.get("computable"))
        self.assertIn(
            intent["primaryGoal"],
            ("derived_metric", "rank", "compare"),
        )
        if intent["primaryGoal"] == "derived_metric":
            self.assertEqual(intent["metric"].get("kind"), "derived")
            self.assertEqual(
                intent["metric"].get("derived", {}).get("id"),
                "profit_margin",
            )

    def test_enrich_analysis_attaches_intent(self) -> None:
        from intent_engine.attach import enrich_analysis_with_intent

        analysis = {"chartPointCount": 4, "chartTypeInternal": "bar"}
        enrich_analysis_with_intent(
            analysis,
            question="Which region has the best profit margin?",
            df=self.df,
            profile=self.profile,
            intent_debug=self.main._describe_aggregate_intent(
                "Which region has the best profit margin?",
                self.df,
                self.profile,
            ),
            chart_points=4,
        )
        self.assertIn("intent", analysis)
        self.assertEqual(
            analysis["intent"]["derivedMetricCandidate"]["id"],
            "profit_margin",
        )


if __name__ == "__main__":
    unittest.main()
