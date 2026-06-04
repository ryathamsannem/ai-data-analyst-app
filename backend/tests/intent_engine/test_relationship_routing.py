"""
Regression tests — relationship / correlation scatter routing.
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

RELATIONSHIP_QUESTIONS = [
    "Relationship between revenue and profit",
    "Revenue vs profit",
    "Profit vs revenue",
    "Correlation between sales and profit",
    "What is the association between revenue and profit?",
    "How does spend impact revenue?",
]

GEO_FIXTURE = BACKEND_ROOT / "tests" / "fixtures" / "geographic_performance.csv"

RETEST_QUESTIONS = [
    "Is customer count correlated with revenue?",
    "What is the relationship between profit and sales?",
    "What is the correlation between growth rate and revenue?",
]


class TestRelationshipRouting(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.df = pd.read_csv(FIXTURE_CSV)
        import main as main_mod

        cls.main = main_mod
        cls.main.df = cls.df
        cls.main.dataset_profile = cls.main.build_profile(cls.df)

    def _run(self, question: str) -> tuple:
        return self.main.compute_visualization_for_question(question)

    def test_relationship_questions_use_scatter_not_combined_totals(self) -> None:
        for question in RELATIONSHIP_QUESTIONS:
            with self.subTest(question=question):
                exact, visualization, analysis = self._run(question)

                intent = analysis.get("intent") or {}
                self.assertEqual(
                    intent.get("primaryGoal"),
                    "relationship",
                    msg=f"intent for {question!r}",
                )

                self.assertIsNotNone(
                    visualization,
                    msg=f"expected visualization for {question!r}",
                )
                self.assertEqual(
                    visualization.get("chartType"),
                    "scatter",
                    msg=f"chart type for {question!r}",
                )

                labels = visualization.get("labels") or []
                self.assertGreaterEqual(
                    len(labels),
                    2,
                    msg=f"scatter points for {question!r}",
                )
                self.assertIn("scatterX", visualization)

                self.assertNotIn("Laptop", exact)
                self.assertNotIn("Keyboard", exact)
                combined_hint = "347,850"
                self.assertNotIn(
                    combined_hint,
                    exact,
                    msg="should not report revenue+profit sum by product",
                )

                ri = visualization.get("relationshipInsights") or {}
                self.assertIsNotNone(ri.get("pearson"))
                self.assertIsNotNone(ri.get("spearman"))
                self.assertIsNotNone(ri.get("correlationStrength"))
                self.assertFalse(ri.get("qualitativeOnly"))
                label = str(ri.get("correlationLabel") or "")
                self.assertTrue(
                    any(
                        w in label
                        for w in (
                            "Very Weak",
                            "Weak",
                            "Moderate",
                            "Strong",
                            "Very Strong",
                        )
                    ),
                    msg=f"unexpected label {label!r}",
                )

    def test_compare_by_region_still_grouped_bar(self) -> None:
        _, visualization, analysis = self._run("Compare revenue and profit by region")
        intent = analysis.get("intent") or {}
        self.assertEqual(intent.get("primaryGoal"), "compare")
        self.assertIsNotNone(visualization)
        self.assertNotEqual(visualization.get("chartType"), "scatter")

    def test_retest_correlation_questions_geographic_fixture(self) -> None:
        geo_df = pd.read_csv(GEO_FIXTURE)
        self.main.df = geo_df
        self.main.dataset_profile = self.main.build_profile(geo_df)
        for question in RETEST_QUESTIONS:
            with self.subTest(question=question):
                exact, visualization, analysis = self._run(question)
                intent = analysis.get("intent") or {}
                self.assertEqual(
                    intent.get("primaryGoal"),
                    "relationship",
                    msg=f"intent for {question!r}",
                )
                self.assertIsNotNone(visualization)
                self.assertEqual(
                    visualization.get("chartType"),
                    "scatter",
                    msg=f"chart for {question!r}",
                )
                ri = visualization.get("relationshipInsights") or {}
                self.assertFalse(ri.get("qualitativeOnly"), msg=question)
                self.assertIsNotNone(ri.get("pearson"), msg=question)
                self.assertIn("Pearson", exact)
                self.assertNotIn("Revenue Share", exact)
                self.assertNotIn("Revenue Gap", exact)
                score = int(analysis.get("insightConfidenceScore") or 0)
                self.assertGreater(
                    score,
                    0,
                    msg=f"confidence score for {question!r}",
                )
                if "customer count" in question.lower():
                    self.assertEqual(
                        str(visualization.get("scatterXLabel") or "").lower(),
                        "customers",
                        msg="x-axis should be customers",
                    )
                    self.assertEqual(
                        str(visualization.get("scatterYLabel") or "").lower(),
                        "revenue",
                        msg="y-axis should be revenue",
                    )


if __name__ == "__main__":
    unittest.main()
