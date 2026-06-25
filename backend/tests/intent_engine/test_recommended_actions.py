"""Phase C — recommended actions tests."""

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

from intent_engine.recommended_actions import (
    attach_recommended_actions_to_analysis,
    build_recommended_actions,
    recommended_actions_prompt_block,
)


class TestRecommendedActionsGolden(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import main as main_mod

        cls.main = main_mod

    def _run(self, csv_name: str, question: str):
        path = GOLDEN_DIR / csv_name
        df = pd.read_csv(path)
        self.main.df = df
        profile = self.main.build_profile(df)
        self.main.dataset_profile = profile
        return self.main.compute_visualization_for_question(question)

    def _actions(self, csv_name: str, question: str):
        _, _, analysis = self._run(csv_name, question)
        self.assertIsNotNone(analysis)
        return (analysis or {}).get("recommendedActions") or []

    def test_retail_concentration_drilldowns(self) -> None:
        actions = self._actions(
            "retail_gold_10000.csv",
            "Which region has the highest total sales?",
        )
        self.assertGreaterEqual(len(actions), 2)
        joined = " ".join(
            f"{a.get('title', '')} {a.get('description', '')}" for a in actions
        ).lower()
        self.assertTrue(
            "product" in joined or "segment" in joined or "category" in joined
        )
        self.assertTrue(
            any(a.get("type") in ("drilldown", "comparison", "validation") for a in actions)
        )
        prompt = recommended_actions_prompt_block(actions)
        self.assertIn("not guaranteed fixes", prompt)

    def test_retail_dedup_product_category_actions(self) -> None:
        actions = self._actions(
            "retail_gold_10000.csv",
            "Which region has the highest total sales?",
        )
        product_actions = [
            a
            for a in actions
            if "product" in f"{a.get('title', '')} {a.get('question', '')}".lower()
            and "category" in f"{a.get('title', '')} {a.get('question', '')}".lower()
        ]
        self.assertLessEqual(len(product_actions), 1)
        joined = " ".join(
            f"{a.get('title', '')} {a.get('question', '')}" for a in actions
        ).lower()
        self.assertTrue(
            "segment" in joined or "channel" in joined or "state" in joined or "city" in joined
        )

    def test_hr_attrition_recommends_rate_validation(self) -> None:
        actions = self._actions(
            "hr_gold_5000.csv",
            "Which department has the highest attrition?",
        )
        joined = " ".join(
            f"{a.get('title', '')} {a.get('description', '')}" for a in actions
        ).lower()
        self.assertIn("attrition rate", joined)
        self.assertTrue(
            "job" in joined or "engagement" in joined or "tenure" in joined or "performance" in joined
        )

    def test_banking_loan_concentration_risk_checks(self) -> None:
        actions = self._actions(
            "banking_gold_10000.csv",
            "Which customer segment has the highest total loan balance?",
        )
        joined = " ".join(
            f"{a.get('title', '')} {a.get('description', '')}" for a in actions
        ).lower()
        self.assertTrue(
            "average" in joined or "customer" in joined or "per customer" in joined
        )
        self.assertTrue(
            "delinquency" in joined or "product" in joined
        )
        self.assertLessEqual(len(actions), 3)

    def test_trend_recommends_breakdown(self) -> None:
        actions = self._actions(
            "retail_gold_10000.csv",
            "Show monthly sales amount trend over time",
        )
        self.assertGreaterEqual(len(actions), 1)
        self.assertTrue(
            any(a.get("type") == "trend_check" for a in actions)
        )

    def test_no_actions_without_reasoning_blocks(self) -> None:
        actions = build_recommended_actions({}, [], df=pd.DataFrame(), profile={})
        self.assertEqual(actions, [])

    def test_attach_sets_empty_list_without_blocks(self) -> None:
        analysis: dict = {}
        attach_recommended_actions_to_analysis(analysis, df=pd.DataFrame(), profile={})
        self.assertEqual(analysis.get("recommendedActions"), [])

    def test_actions_have_required_shape(self) -> None:
        actions = self._actions(
            "retail_gold_10000.csv",
            "Which region has the highest total sales?",
        )
        for a in actions:
            self.assertIn(a.get("type"), ("drilldown", "validation", "risk_check", "trend_check", "comparison"))
            self.assertTrue(str(a.get("title", "")).strip())
            self.assertTrue(str(a.get("description", "")).strip())
            self.assertIn(a.get("priority"), ("high", "medium", "low"))
            self.assertTrue(str(a.get("reason", "")).strip())
            self.assertIsInstance(a.get("basedOn"), list)


if __name__ == "__main__":
    unittest.main()
