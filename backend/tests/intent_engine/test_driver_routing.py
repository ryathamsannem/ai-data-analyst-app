"""Driver / root-cause questions — correlation routing, not category ranking."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

GEO_CSV = BACKEND_ROOT / "tests" / "fixtures" / "geographic_performance.csv"


class TestDriverRouting(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import main as main_mod

        cls.main = main_mod
        cls.geo_df = pd.read_csv(GEO_CSV)

    def _run(self, question: str, df: pd.DataFrame) -> tuple:
        self.main.df = df
        self.main.dataset_profile = self.main.build_profile(df)
        return self.main.compute_visualization_for_question(question)

    def test_what_drives_revenue_scatter_not_zone_ranking(self) -> None:
        q = "What drives revenue the most?"
        exact, visualization, analysis = self._run(q, self.geo_df)

        intent = analysis.get("intent") or {}
        self.assertEqual(intent.get("primaryGoal"), "driver")
        self.assertTrue(intent.get("flags", {}).get("requestsDriver"))

        self.assertIsNotNone(visualization)
        self.assertEqual(visualization.get("chartType"), "scatter")
        self.assertIn("scatterX", visualization)

        title = str(visualization.get("title") or "").lower()
        self.assertNotIn("zone", title)
        self.assertNotIn("by zone", exact.lower())

        x_lab = str(visualization.get("scatterXLabel") or "").lower()
        self.assertIn("customer", x_lab)

    def test_driver_without_explanatory_columns_returns_message(self) -> None:
        slim = self.geo_df[["city", "revenue", "profit"]].copy()
        q = "What drives revenue the most?"
        exact, visualization, analysis = self._run(q, slim)

        self.assertIsNone(visualization)
        intent = analysis.get("intent") or {}
        self.assertEqual(intent.get("primaryGoal"), "driver")
        joined = (exact or "").lower()
        self.assertIn("revenue drivers cannot be determined", joined)
        self.assertNotIn("by zone", joined)
        self.assertNotIn("south", joined)


if __name__ == "__main__":
    unittest.main()
