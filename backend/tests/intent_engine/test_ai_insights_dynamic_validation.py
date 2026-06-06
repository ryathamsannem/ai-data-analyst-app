"""
Regression validation for five AI Insights polish scenarios — dynamic assertions only.
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

FIXTURE_CSV = BACKEND_ROOT / "tests" / "fixtures" / "retail_analytics_regression.csv"

VALIDATION_CASES: List[Tuple[str, str]] = [
    ("trend", "Show revenue trend over time"),
    ("opportunity", "What are the biggest opportunities?"),
    ("summary", "Summarize business performance"),
    ("correlation_derived", "What factors are correlated with profit?"),
    ("correlation_normal", "Is revenue correlated with customers?"),
]


class TestAiInsightsDynamicValidation(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.df = pd.read_csv(FIXTURE_CSV)
        import main as main_mod

        cls.main = main_mod
        cls.main.df = cls.df
        cls.main.dataset_profile = cls.main.build_profile(cls.df)
        cls.profile = cls.main.dataset_profile

    def _run(self, question: str) -> Tuple[str, Optional[Dict[str, Any]], Dict[str, Any]]:
        self.main.df = self.df
        self.main.dataset_profile = self.profile
        return self.main.compute_visualization_for_question(question)

    def test_validation_matrix(self) -> None:
        for bucket, question in VALIDATION_CASES:
            with self.subTest(bucket=bucket, question=question):
                self._assert_case(bucket, question)

    def _assert_case(self, bucket: str, question: str) -> None:
        _, viz, analysis = self._run(question)

        if bucket == "trend":
            self.assertEqual((viz or {}).get("chartType"), "line", msg=question)
            self.assertGreaterEqual(len((viz or {}).get("labels") or []), 2, msg=question)

        if bucket == "opportunity":
            self.assertEqual(str(analysis.get("executiveLens") or "").lower(), "opportunity")
            ranked = analysis.get("rankedExecutiveInsights") or []
            narratives = " ".join(
                str(x.get("narrativeLine") or x.get("hint") or "")
                for x in ranked
                if isinstance(x, dict)
            ).lower()
            self.assertNotIn("high customers but lower revenue", narratives, msg=question)

        if bucket == "summary":
            self.assertEqual(str(analysis.get("executiveLens") or "").lower(), "summary")
            self.assertIsNotNone(viz, msg=question)

        if bucket == "correlation_derived":
            self.assertEqual((viz or {}).get("chartType"), "scatter", msg=question)
            ri = (viz or {}).get("relationshipInsights") or {}
            self.assertTrue(
                ri.get("pearson") is not None or ri.get("spearman") is not None,
                msg=question,
            )
            if ri.get("nearPerfectCorrelation"):
                caution = str(ri.get("nearPerfectCorrelationCaution") or "").lower()
                self.assertIn("near-perfect", caution, msg=question)

        if bucket == "correlation_normal":
            self.assertEqual((viz or {}).get("chartType"), "scatter", msg=question)
            ri = (viz or {}).get("relationshipInsights") or {}
            self.assertIsNotNone(ri.get("pearson"), msg=question)


if __name__ == "__main__":
    unittest.main()
