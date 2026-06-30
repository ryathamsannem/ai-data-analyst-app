"""Profit margin routing — existing margin columns vs derived profit/revenue."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from intent_engine.column_resolve import (
    column_prefers_mean_aggregation,
    find_existing_margin_percent_column,
)
from intent_engine.narrative_guardrails import detect_missing_requested_metrics


class TestProfitMarginColumnRouting(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import main as main_mod

        cls.main = main_mod

    def _load(self, df: pd.DataFrame) -> dict:
        self.main.df = df
        profile = self.main.build_profile(df)
        self.main.dataset_profile = profile
        return profile

    def test_profit_margin_by_product_uses_existing_column(self) -> None:
        df = pd.DataFrame(
            {
                "product": ["Widget A", "Widget B", "Widget C"],
                "profit_margin_pct": [-2.5, 3.1, -1.2],
                "region": ["North", "South", "East"],
            }
        )
        profile = self._load(df)
        q = "Show profit margin by product"
        _exact, visualization, analysis = self.main.compute_visualization_for_question(q)
        self.assertGreater(int(analysis.get("chartPointCount") or 0), 0)
        self.assertIsNotNone(visualization)
        labels = (visualization or {}).get("labels") or []
        self.assertGreater(len(labels), 0)
        self.assertFalse(analysis.get("unsupportedRequestedMetric"))
        self.assertFalse(analysis.get("profitMarginUnavailable"))
        spec = self.main._resolve_question_metric_spec(q, df, profile)
        self.assertEqual(spec.get("value_col"), "profit_margin_pct")
        self.assertTrue(spec.get("explicit_metric"))
        self.assertFalse(spec.get("derived_profit_margin"))

    def test_existing_margin_column_preferred_over_derivation(self) -> None:
        df = pd.DataFrame(
            {
                "product": ["A", "B"],
                "profit_margin_pct": [12.0, 8.0],
                "profit": [100.0, 80.0],
                "revenue": [1000.0, 900.0],
            }
        )
        profile = self._load(df)
        q = "Show profit margin by product"
        spec = self.main._resolve_question_metric_spec(q, df, profile)
        self.assertEqual(spec.get("value_col"), "profit_margin_pct")
        self.assertFalse(spec.get("derived_profit_margin"))
        intent = self.main._describe_aggregate_intent(q, df, profile)
        self.assertEqual(intent.get("value_col"), "profit_margin_pct")
        self.assertEqual(intent.get("agg_key"), "mean")

    def test_guardrail_supported_when_margin_pct_exists(self) -> None:
        df = pd.DataFrame(
            {
                "product": ["A", "B"],
                "profit_margin_pct": [5.0, 7.0],
            }
        )
        profile = self._load(df)
        q = "Show profit margin by product"
        missing = detect_missing_requested_metrics(q, df, profile)
        self.assertEqual(missing, [])
        hit = find_existing_margin_percent_column(
            df.columns.tolist(), profile, q
        )
        self.assertEqual(hit, "profit_margin_pct")

    def test_profit_margin_pct_uses_mean_aggregation(self) -> None:
        df = pd.DataFrame(
            {
                "product": ["A", "B", "A", "B"],
                "profit_margin_pct": [10.0, 20.0, 14.0, 24.0],
            }
        )
        profile = self._load(df)
        q = "Show profit margin by product"
        self.assertTrue(column_prefers_mean_aggregation("profit_margin_pct"))
        intent = self.main._describe_aggregate_intent(q, df, profile)
        self.assertEqual(intent.get("agg_key"), "mean")
        self.assertEqual(intent.get("value_col"), "profit_margin_pct")

    def test_no_bogus_derivation_with_return_amount(self) -> None:
        df = pd.DataFrame(
            {
                "product": ["A", "B"],
                "profit_margin_pct": [-2.5, 3.1],
                "return_amount": [-100.0, -50.0],
            }
        )
        profile = self._load(df)
        nums = [c for c, t in profile["column_types"].items() if t == "number"]
        profit_c, rev_c = self.main._find_profit_and_revenue_columns(
            df.columns.tolist(), nums
        )
        self.assertIsNone(profit_c)
        self.assertIsNone(rev_c)
        q = "Show profit margin by product"
        spec = self.main._resolve_question_metric_spec(q, df, profile)
        self.assertEqual(spec.get("value_col"), "profit_margin_pct")
        _exact, visualization, analysis = self.main.compute_visualization_for_question(q)
        self.assertGreater(int(analysis.get("chartPointCount") or 0), 0)
        self.assertIsNotNone(visualization)

    def test_return_amount_by_product_unchanged(self) -> None:
        df = pd.DataFrame(
            {
                "product": ["A", "B", "C"],
                "return_amount": [-100.0, -50.0, -20.0],
                "profit_margin_pct": [1.0, 2.0, 3.0],
            }
        )
        profile = self._load(df)
        q = "Show return amount by product"
        spec = self.main._resolve_question_metric_spec(q, df, profile)
        self.assertEqual(spec.get("value_col"), "return_amount")
        _exact, visualization, analysis = self.main.compute_visualization_for_question(q)
        self.assertGreater(int(analysis.get("chartPointCount") or 0), 0)
        self.assertIsNotNone(visualization)

    def test_net_change_by_product_unchanged(self) -> None:
        df = pd.DataFrame(
            {
                "product": ["A", "B", "C"],
                "net_change": [10.0, -5.0, 3.0],
            }
        )
        profile = self._load(df)
        q = "Show net change by product"
        spec = self.main._resolve_question_metric_spec(q, df, profile)
        self.assertEqual(spec.get("value_col"), "net_change")
        _exact, visualization, analysis = self.main.compute_visualization_for_question(q)
        self.assertGreater(int(analysis.get("chartPointCount") or 0), 0)

    def test_cash_flow_by_region_unchanged(self) -> None:
        df = pd.DataFrame(
            {
                "region": ["North", "South", "East"],
                "cash_flow": [1000.0, 1200.0, 900.0],
            }
        )
        profile = self._load(df)
        q = "Show cash flow by region"
        spec = self.main._resolve_question_metric_spec(q, df, profile)
        self.assertEqual(spec.get("value_col"), "cash_flow")
        _exact, visualization, analysis = self.main.compute_visualization_for_question(q)
        self.assertGreater(int(analysis.get("chartPointCount") or 0), 0)

    def test_derived_margin_when_no_margin_column(self) -> None:
        retail_csv = BACKEND_ROOT / "tests" / "fixtures" / "retail_region_product.csv"
        df = pd.read_csv(retail_csv)
        profile = self._load(df)
        q = "Which region has the best profit margin?"
        spec = self.main._resolve_question_metric_spec(q, df, profile)
        self.assertTrue(spec.get("derived_profit_margin"))
        _exact, visualization, analysis = self.main.compute_visualization_for_question(q)
        self.assertTrue(
            analysis.get("derivedProfitMargin")
            or (analysis.get("intent") or {}).get("derived_profit_margin")
            or int(analysis.get("chartPointCount") or 0) > 0
        )


if __name__ == "__main__":
    unittest.main()
