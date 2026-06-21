"""Donut/Pie routing for share, mix, contribution, and distribution questions."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

FIXTURE_CSV = BACKEND_ROOT.parent / "test-fixtures" / "domains" / "screenshot-fixture.csv"

SHOULD_ROUTE: List[Tuple[str, str, Optional[str]]] = [
    ("What is the revenue share by product category?", "product_category", None),
    ("Show sales mix by region", "region", None),
    ("Show product category contribution", "product_category", None),
    (
        "Show revenue share by customer segment",
        "customer_segment",
        "segment_fixture",
    ),
    (
        "What is the customer segment distribution?",
        "customer_segment",
        "segment_fixture",
    ),
    (
        "Which segment contributes the largest share?",
        "customer_segment",
        "segment_fixture",
    ),
]

SHOULD_NOT_ROUTE: List[Tuple[str, Optional[str]]] = [
    ("Top regions by revenue", None),
    ("Compare revenue by region", None),
    ("Rank products by revenue", None),
    ("Show conversion rate by campaign", "campaign_fixture"),
]


def _segment_fixture_df(base: pd.DataFrame) -> pd.DataFrame:
    out = base.copy()
    segments = ["Enterprise", "SMB", "Consumer"]
    out["customer_segment"] = [segments[i % len(segments)] for i in range(len(out))]
    return out


def _campaign_fixture_df(base: pd.DataFrame) -> pd.DataFrame:
    out = base.copy()
    campaigns = ["Alpha", "Beta", "Gamma"]
    rates = [0.12, 0.08, 0.15]
    out["campaign"] = [campaigns[i % len(campaigns)] for i in range(len(out))]
    out["conversion_rate"] = [rates[i % len(rates)] for i in range(len(out))]
    return out


class TestDonutPieShareRouting(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import main as main_mod

        cls.main = main_mod
        cls.base_df = pd.read_csv(FIXTURE_CSV)
        cls.profile = cls.main.build_profile(cls.base_df)

    def _run(
        self,
        question: str,
        df: Optional[pd.DataFrame] = None,
    ) -> Tuple[str, Optional[Dict[str, Any]], Dict[str, Any]]:
        use_df = df if df is not None else self.base_df
        self.main.df = use_df
        self.main.dataset_profile = self.main.build_profile(use_df)
        return self.main.compute_visualization_for_question(question)

    def _chart_labels(self, viz: Optional[Dict[str, Any]]) -> List[str]:
        if not viz:
            return []
        labels = viz.get("labels")
        if labels:
            return [str(x).strip() for x in labels]
        return [
            str(r.get("name", "")).strip()
            for r in viz.get("chartData") or []
        ]

    def _resolve_df(self, fixture_key: Optional[str]) -> pd.DataFrame:
        if fixture_key == "segment_fixture":
            return _segment_fixture_df(self.base_df)
        if fixture_key == "campaign_fixture":
            return _campaign_fixture_df(self.base_df)
        return self.base_df

    def test_share_composition_routes_to_donut_or_pie(self) -> None:
        for question, expected_dim, fixture_key in SHOULD_ROUTE:
            with self.subTest(question=question):
                df = self._resolve_df(fixture_key)
                _exact, viz, analysis = self._run(question, df)
                self.assertIsNotNone(viz, msg=question)
                chart_type = str(viz.get("chartType") or "").lower()
                self.assertIn(
                    chart_type,
                    ("pie", "donut"),
                    msg=f"{question} -> {chart_type}",
                )
                group_col = str(analysis.get("categoryColumn") or "")
                self.assertEqual(
                    group_col,
                    expected_dim,
                    msg=f"{question} dimension={group_col}",
                )
                allowed = set(
                    df[expected_dim].dropna().astype(str).str.strip().unique().tolist()
                )
                for label in self._chart_labels(viz):
                    if label:
                        self.assertIn(label, allowed, msg=f"{question} label={label}")

    def test_ranking_and_compare_do_not_route_to_donut(self) -> None:
        for question, fixture_key in SHOULD_NOT_ROUTE:
            with self.subTest(question=question):
                df = self._resolve_df(fixture_key)
                _exact, viz, _analysis = self._run(question, df)
                if viz is None:
                    continue
                chart_type = str(viz.get("chartType") or "").lower()
                self.assertNotIn(
                    chart_type,
                    ("pie", "donut"),
                    msg=f"{question} -> {chart_type}",
                )


if __name__ == "__main__":
    unittest.main()
