"""E2E confidence — missing requested dimension with transparent redirect."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

FIXTURE_CSV = BACKEND_ROOT / "tests" / "fixtures" / "retail_region_product.csv"


class TestDimensionRedirectConfidence(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.df = pd.read_csv(FIXTURE_CSV)
        import main as main_mod

        cls.main = main_mod
        main_mod.df = cls.df
        main_mod.dataset_profile = main_mod.build_profile(cls.df)

    def test_which_month_highest_sales_medium_confidence(self) -> None:
        question = "Which month had highest sales?"
        _exact, visualization, analysis = self.main.compute_visualization_for_question(
            question
        )
        self.assertIsNotNone(visualization)
        self.assertTrue(analysis.get("dimensionRedirectHandled"))
        self.assertTrue(analysis.get("requestedDimensionMissing"))
        warn = str(analysis.get("partialVisualizationWarning") or "").lower()
        self.assertIn("month", warn)
        score = int(analysis.get("insightConfidenceScore") or 0)
        self.assertGreaterEqual(score, 55)
        self.assertLessEqual(score, 70)
        self.assertEqual(analysis.get("insightConfidenceLevel"), "medium")


if __name__ == "__main__":
    unittest.main()
