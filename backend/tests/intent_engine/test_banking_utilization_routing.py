"""Banking utilization trend — metric routing and suggested questions."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

GOLDEN = REPO_ROOT / "test-fixtures" / "golden-datasets" / "banking_gold_10000.csv"


class TestBankingUtilizationRouting(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import main as main_mod

        cls.main = main_mod
        cls.df = pd.read_csv(GOLDEN)
        cls.main.df = cls.df
        cls.main.dataset_profile = cls.main.build_profile(cls.df)

    def test_utilization_trend_routes_to_utilization_pct(self) -> None:
        for q in (
            "Show utilization trend",
            "Show monthly utilization trend",
            "How does utilization trend over month?",
        ):
            with self.subTest(question=q):
                _, viz, analysis = self.main.compute_visualization_for_question(q)
                self.assertIsNotNone(analysis, msg=q)
                metric = str((analysis or {}).get("metricColumn") or "").lower()
                self.assertIn("utilization", metric, msg=f"{q} -> {metric}")
                self.assertNotIn("spend", metric, msg=f"{q} -> {metric}")
                dim = str((analysis or {}).get("categoryColumn") or "").lower()
                self.assertNotIn("account_age", dim, msg=f"{q} -> {dim}")
                self.assertNotIn("monthly_income", dim, msg=f"{q} -> {dim}")
                self.assertTrue(
                    dim == "month" or "month" in dim.split("_"),
                    msg=f"{q} -> {dim}",
                )

    def test_suggested_questions_include_utilization_trend(self) -> None:
        from intent_engine.suggested_questions_engine import compose_suggested_questions

        profile = self.main.dataset_profile
        numeric = [
            c
            for c in self.df.columns
            if profile["column_types"].get(c) == "number"
        ]
        cat = [
            c
            for c in self.df.columns
            if profile["column_types"].get(c) in ("category", "text")
        ]
        ranked_m = self.main._rank_numeric_metrics(self.df, numeric)
        ranked_d = self.main._rank_category_dimensions(self.df, cat, profile)
        date_cols = [
            c for c in self.df.columns if profile["column_types"].get(c) == "date"
        ]
        qs = compose_suggested_questions(
            df=self.df,
            profile=profile,
            ranked_dims=ranked_d,
            ranked_metrics=ranked_m,
            date_cols=date_cols,
            columns=self.df.columns.tolist(),
            dashboard_kind="banking",
        )
        util_trend = [
            q
            for q in qs
            if "utilization" in q.lower() and "trend" in q.lower()
        ]
        self.assertGreaterEqual(len(util_trend), 1, msg=qs)
        self.assertFalse(
            any("spend" in q.lower() and "utilization" not in q.lower() for q in util_trend)
        )


if __name__ == "__main__":
    unittest.main()
