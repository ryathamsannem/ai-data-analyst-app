"""
Golden-dataset integration tests for reasoningBlocks on analysis payloads.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

GOLDEN_DIR = REPO_ROOT / "test-fixtures" / "golden-datasets"

GOLDEN_CASES = [
    (
        "retail_gold_10000.csv",
        "Which region has the highest total sales?",
        ("contribution", "leader_laggard_gap"),
    ),
    (
        "hr_gold_5000.csv",
        "Which department has the highest average salary?",
        ("contribution", "leader_laggard_gap"),
    ),
    (
        "banking_gold_10000.csv",
        "Which customer segment has the highest total loan balance?",
        ("contribution", "leader_laggard_gap"),
    ),
    (
        "retail_gold_10000.csv",
        "Show monthly sales amount trend over time",
        ("trend_movement",),
    ),
]


class TestReasoningBlocksGolden(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import main as main_mod

        cls.main = main_mod

    def _run(self, csv_name: str, question: str):
        path = GOLDEN_DIR / csv_name
        self.assertTrue(path.is_file(), msg=f"Missing fixture {path}")
        df = pd.read_csv(path)
        self.main.df = df
        self.main.dataset_profile = self.main.build_profile(df)
        return self.main.compute_visualization_for_question(question)

    def test_golden_reasoning_blocks(self) -> None:
        for csv_name, question, expected_types in GOLDEN_CASES:
            with self.subTest(csv=csv_name, question=question):
                _, viz, analysis = self._run(csv_name, question)
                self.assertIsNotNone(analysis, msg=question)
                blocks = (analysis or {}).get("reasoningBlocks") or []
                self.assertIsInstance(blocks, list)
                self.assertGreaterEqual(len(blocks), 1, msg=question)
                types = {str(b.get("type")) for b in blocks if isinstance(b, dict)}
                for et in expected_types:
                    self.assertIn(et, types, msg=f"{question} missing {et}")
                for b in blocks:
                    self.assertTrue(str(b.get("claim", "")).strip())
                    self.assertIn(
                        str(b.get("confidence")),
                        ("high", "medium", "low"),
                    )
                    self.assertTrue(str(b.get("reason", "")).strip())


if __name__ == "__main__":
    unittest.main()
