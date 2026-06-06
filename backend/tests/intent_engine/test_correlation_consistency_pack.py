"""
Regression — geographic pack correlation values consistent across viz + confidence.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

FIXTURE = BACKEND_ROOT / "tests" / "fixtures" / "geographic_performance.csv"

CASES = (
    ("Is customer count correlated with revenue?", 1.0),
    ("What is the relationship between profit and sales?", 0.98),
    ("What is the correlation between growth rate and revenue?", 0.93),
)


class TestCorrelationConsistencyPack(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.df = pd.read_csv(FIXTURE)
        import main as main_mod

        cls.main = main_mod
        cls.main.df = cls.df
        cls.main.dataset_profile = cls.main.build_profile(cls.df)

    def _run(self, question: str) -> tuple:
        return self.main.compute_visualization_for_question(question)

    def test_pearson_and_confidence_aligned(self) -> None:
        for question, expected_r in CASES:
            with self.subTest(question=question):
                exact, visualization, analysis = self._run(question)
                self.assertEqual(visualization.get("chartType"), "scatter")
                ri = visualization.get("relationshipInsights") or {}
                pearson = float(ri["pearson"])
                self.assertAlmostEqual(pearson, expected_r, places=2)
                self.assertFalse(ri.get("qualitativeOnly"))
                self.assertIn("Pearson", exact)
                self.assertNotIn(
                    "Numeric correlation could not be calculated",
                    exact,
                )
                reasons = " ".join(analysis.get("insightConfidenceReasons") or [])
                self.assertNotIn(
                    "could not be computed numerically",
                    reasons.lower(),
                )
                rationale = str(analysis.get("insightConfidenceRationale") or "")
                self.assertNotIn(
                    "could not be computed numerically",
                    rationale.lower(),
                )
                self.assertTrue(
                    any(
                        needle in reasons
                        for needle in (
                            "Correlation computed on",
                            "Based on 8 paired rows",
                            "Based on 7 paired rows",
                        )
                    ),
                    msg=reasons,
                )


if __name__ == "__main__":
    unittest.main()
