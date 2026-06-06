"""
Regression — executive narrative totals and correlation messaging consistency.
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

TOP_CITY = "Top Performing City"
REGION_REV = "Which region generates the highest revenue?"
GROWTH_CORR = "What is the correlation between growth rate and revenue?"


class TestExecutiveNarrativeCorrelation(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.df = pd.read_csv(FIXTURE)
        import main as main_mod

        cls.main = main_mod
        cls.main.df = cls.df
        cls.main.dataset_profile = cls.main.build_profile(cls.df)

    def _run(self, question: str) -> tuple:
        return self.main.compute_visualization_for_question(question)

    def test_top_performing_city_chart_uses_aggregated_city_revenue(self) -> None:
        _exact, visualization, analysis = self._run(TOP_CITY)
        self.assertIsNotNone(visualization)
        labels = visualization.get("labels") or []
        values = visualization.get("values") or []
        self.assertEqual(len(labels), len(values))
        total = sum(float(v) for v in values)
        self.assertAlmostEqual(total, 1_394_000.0, delta=1.0)
        top3 = sum(
            float(v)
            for _, v in sorted(
                zip(labels, values), key=lambda t: t[1], reverse=True
            )[:3]
        )
        self.assertAlmostEqual(top3, 718_000.0, delta=1.0)
        self.assertIn("Mumbai", labels)
        ranked = visualization.get("rankedExecutiveInsights") or []
        if ranked:
            joined = " ".join(
                str(r.get("narrativeLine") or r.get("hint") or "")
                for r in ranked
                if isinstance(r, dict)
            )
            self.assertNotIn("revenue points", joined.lower())
            self.assertNotIn("58,000", joined)

    def test_region_highest_revenue_zone_aggregation(self) -> None:
        exact, visualization, analysis = self._run(REGION_REV)
        intent = analysis.get("intent") or {}
        group_col = intent.get("group_col") or analysis.get("categoryColumn")
        self.assertEqual(str(group_col).lower(), "zone")
        labels = visualization.get("labels") or []
        self.assertIn("South", labels)
        values = visualization.get("values") or []
        self.assertAlmostEqual(sum(float(v) for v in values), 1_394_000.0, delta=1.0)

    def test_growth_rate_correlation_no_margin_and_no_qualitative_conflict(
        self,
    ) -> None:
        exact, visualization, analysis = self._run(GROWTH_CORR)
        self.assertEqual(visualization.get("chartType"), "scatter")
        ri = visualization.get("relationshipInsights") or {}
        self.assertIsNotNone(ri.get("pearson"))
        self.assertFalse(ri.get("qualitativeOnly"))
        self.assertNotIn("marginByCategory", ri)
        self.assertIn("Pearson", exact)
        self.assertNotIn(
            "Numeric correlation unavailable",
            exact,
            msg="exact result must not claim unavailable when r is computed",
        )
        reasons = " ".join(analysis.get("insightConfidenceReasons") or [])
        self.assertNotIn(
            "could not be computed numerically",
            reasons.lower(),
        )


if __name__ == "__main__":
    unittest.main()
