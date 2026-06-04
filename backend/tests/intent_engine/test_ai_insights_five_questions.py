"""
Regression — five geographic-performance AI Insights questions (user QA set).
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

FIVE_QUESTIONS = [
    "Is customer count correlated with revenue?",
    "What is the relationship between profit and sales?",
    "What is the correlation between growth rate and revenue?",
    "Which region generates the highest revenue?",
    "Top Performing City",
]

CORRELATION_QUESTIONS = FIVE_QUESTIONS[:3]
GEO_RANK_QUESTIONS = FIVE_QUESTIONS[3:]

RANKING_GEO_QUESTIONS = [
    "Which region generates the highest revenue?",
    "Top Performing City",
]


class TestAiInsightsFiveQuestions(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.df = pd.read_csv(FIXTURE_CSV)
        import main as main_mod

        cls.main = main_mod
        cls.main.df = cls.df
        cls.main.dataset_profile = cls.main.build_profile(cls.df)

    def _run(self, question: str) -> tuple:
        return self.main.compute_visualization_for_question(question)

    def test_correlation_questions_scatter_no_bar_fallback(self) -> None:
        for question in CORRELATION_QUESTIONS:
            with self.subTest(question=question):
                exact, visualization, analysis = self._run(question)
                intent = analysis.get("intent") or {}
                self.assertEqual(
                    intent.get("primaryGoal"),
                    "relationship",
                    msg=f"intent for {question!r}",
                )
                self.assertIsNotNone(visualization, msg=question)
                self.assertEqual(
                    visualization.get("chartType"),
                    "scatter",
                    msg=f"chart for {question!r}",
                )
                self.assertNotIn(
                    visualization.get("chartType"),
                    ("bar", "bar_horizontal", "line"),
                    msg=f"bar/line fallback for {question!r}",
                )
                ri = visualization.get("relationshipInsights") or {}
                self.assertFalse(ri.get("qualitativeOnly"), msg=question)
                self.assertIsNotNone(ri.get("pearson"), msg=question)
                self.assertIn("Pearson", exact)
                self.assertFalse(
                    bool(analysis.get("growthRequestUnsatisfied")),
                    msg=f"growth unsupported for correlation {question!r}",
                )

                if "customer count" in question.lower():
                    self.assertEqual(
                        str(visualization.get("scatterXLabel") or "").lower(),
                        "customers",
                    )
                    self.assertEqual(
                        str(visualization.get("scatterYLabel") or "").lower(),
                        "revenue",
                    )
                if "profit" in question.lower() and "sales" in question.lower():
                    labels = {
                        str(visualization.get("scatterXLabel") or "").lower(),
                        str(visualization.get("scatterYLabel") or "").lower(),
                    }
                    self.assertIn("profit", labels)
                    self.assertIn("revenue", labels)
                if "growth rate" in question.lower():
                    labels = {
                        str(visualization.get("scatterXLabel") or "")
                        .lower()
                        .replace(" ", "_"),
                        str(visualization.get("scatterYLabel") or "")
                        .lower()
                        .replace(" ", "_"),
                    }
                    self.assertTrue(
                        "growth_rate" in labels or "growth" in labels,
                        msg=f"growth axis labels {labels!r}",
                    )
                    self.assertIn("revenue", labels)

                ri = visualization.get("relationshipInsights") or {}
                self.assertNotIn("marginByCategory", ri)
                reasons_joined = " ".join(
                    analysis.get("insightConfidenceReasons") or []
                ).lower()
                self.assertNotIn(
                    "could not be computed numerically",
                    reasons_joined,
                    msg=question,
                )
                rationale = str(
                    analysis.get("insightConfidenceRationale") or ""
                ).lower()
                summary = str(analysis.get("evidenceSummaryLine") or "").lower()
                self.assertTrue(
                    "joint pair" in rationale
                    or "scatter" in rationale
                    or "correlation" in rationale
                    or "joint pair" in summary
                    or "correlation" in summary,
                    msg=f"confidence copy for {question!r}",
                )

    def test_region_highest_revenue_maps_zone(self) -> None:
        question = GEO_RANK_QUESTIONS[0]
        exact, visualization, analysis = self._run(question)
        intent = analysis.get("intent") or {}
        self.assertIn(
            intent.get("primaryGoal"),
            ("rank", "ranking", "compare"),
            msg="rank-style intent",
        )
        self.assertIsNotNone(visualization)
        labels = visualization.get("labels") or []
        self.assertGreaterEqual(len(labels), 2)
        for lab in labels:
            self.assertIn(lab, {"South", "West", "North", "East"})
        group_col = (
            intent.get("geographic_scope_column")
            or intent.get("group_col")
            or analysis.get("categoryColumn")
            or (visualization.get("provenance") or {}).get("categoryColumn")
        )
        if group_col:
            self.assertEqual(str(group_col).lower(), "zone")
        self.assertNotEqual(visualization.get("chartType"), "scatter")

    def test_top_performing_city_uses_city_and_revenue(self) -> None:
        question = GEO_RANK_QUESTIONS[1]
        exact, visualization, analysis = self._run(question)
        intent = analysis.get("intent") or {}
        self.assertIn(
            intent.get("primaryGoal"),
            ("rank", "ranking", "compare"),
        )
        self.assertIsNotNone(visualization)
        labels = visualization.get("labels") or []
        zone_labels = {"South", "West", "North", "East"}
        for lab in labels:
            self.assertNotIn(lab, zone_labels)
        self.assertIn("Mumbai", labels)
        prov = visualization.get("provenance") or {}
        cat = prov.get("categoryColumn") or analysis.get("categoryColumn")
        if cat:
            self.assertEqual(str(cat).lower(), "city")
        metric = (
            intent.get("metric_col")
            or analysis.get("metricColumn")
            or prov.get("valueColumn")
        )
        if metric:
            self.assertEqual(str(metric).lower(), "revenue")
        self.assertNotEqual(visualization.get("chartType"), "scatter")

    def test_ranking_geo_questions_confidence_and_chart_labels(self) -> None:
        for question in RANKING_GEO_QUESTIONS:
            with self.subTest(question=question):
                _exact, visualization, analysis = self._run(question)
                prov = (visualization or {}).get("provenance") or {}
                score = int(analysis.get("insightConfidenceScore") or 0)
                self.assertGreaterEqual(
                    score,
                    25,
                    msg=f"score {score} for {question!r}",
                )
                self.assertLessEqual(score, 45, msg=f"score {score} for {question!r}")
                self.assertEqual(
                    str(analysis.get("insightConfidenceLevel") or "").lower(),
                    "low",
                )
                self.assertEqual(
                    str((visualization or {}).get("chartType") or ""),
                    "bar",
                    msg=f"api chartType for {question!r}",
                )
                self.assertEqual(
                    str(prov.get("visualizationType") or ""),
                    "Vertical bar chart",
                    msg=f"viz type for {question!r}",
                )
                reason = str(prov.get("chartSelectionReason") or "").lower()
                self.assertNotIn("horizontal bar", reason, msg=question)
                summary = str(analysis.get("evidenceSummaryLine") or "").lower()
                self.assertIn("small cohort", summary, msg=question)
                ranked = visualization.get("rankedExecutiveInsights") or []
                if ranked:
                    blob = " ".join(
                        str(r.get("narrativeLine") or "")
                        for r in ranked
                        if isinstance(r, dict)
                    )
                    self.assertNotIn("revenue points", blob.lower(), msg=question)


if __name__ == "__main__":
    unittest.main()
