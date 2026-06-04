"""
Regression tests — unsupported decline routing (no ranking chart fallback).
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


class TestDeclineRouting(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.df = pd.read_csv(FIXTURE_CSV)
        import main as main_mod

        cls.main = main_mod
        main_mod.df = cls.df
        main_mod.dataset_profile = main_mod.build_profile(cls.df)

    def test_category_declining_suppresses_ranking_chart(self) -> None:
        question = "Which category is declining?"
        exact, visualization, analysis = (
            self.main.compute_visualization_for_question(question)
        )

        self.assertIsNone(visualization)

        uda = analysis.get("unsupportedDeclineAnalysis")
        self.assertIsInstance(uda, dict)
        self.assertTrue(uda.get("active"))
        self.assertTrue(analysis.get("declineRequestUnsatisfied"))
        self.assertEqual(
            uda.get("leadSentence"),
            "Decline cannot be determined from the available data.",
        )
        self.assertIn(
            uda.get("reasonCode"),
            ("insufficient_time_series", "category_snapshot"),
        )

        intent = analysis.get("intent")
        self.assertIsInstance(intent, dict)
        self.assertEqual(intent.get("primaryGoal"), "decline")
        self.assertFalse(intent.get("support", {}).get("supported"))
        self.assertIn(
            "insufficient_time_series",
            intent.get("support", {}).get("reasonCodes", []),
        )

        self.assertTrue(exact.strip())


if __name__ == "__main__":
    unittest.main()
