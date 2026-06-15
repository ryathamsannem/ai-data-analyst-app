"""
Regression tests for final AI routing hardening phase (strict structural improvements).
Dynamic phrase patterns only — no QID hardcoding in production logic.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = BACKEND_ROOT.parent / "test-fixtures" / "domains"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main as main_mod  # noqa: E402


def _bind(csv_name: str) -> None:
    df = pd.read_csv(FIXTURES / csv_name)
    main_mod.df = df
    main_mod.dataset_profile = main_mod.build_profile(df)


def _route(question: str) -> tuple[str, str, str, str]:
    _, viz, analysis = main_mod.compute_visualization_for_question(question)
    plan = analysis.get("routingPlan") or {}
    intent = str(plan.get("intent") or analysis.get("intentBucket") or "").lower()
    chart = str((viz or {}).get("chartType") or "").lower()
    metric = str(analysis.get("metricColumn") or "").lower()
    dim = str(analysis.get("categoryColumn") or "").lower()
    return intent, chart, metric, dim


class TestRankingSuperlativeRouting(unittest.TestCase):
    """Bucket A — which/drives/delivers/exceeds-the-most → ranking."""

    def test_drives_the_most_orders(self) -> None:
        _bind("retail.csv")
        intent, _, metric, dim = _route("Which product drives the most orders?")
        self.assertEqual(intent, "ranking")
        self.assertIn("order", metric)
        self.assertIn("product", dim)

    def test_delivers_the_most_revenue(self) -> None:
        _bind("sales.csv")
        intent, _, metric, dim = _route("Which territory delivers the most revenue?")
        self.assertEqual(intent, "ranking")
        self.assertIn("revenue", metric)
        self.assertIn("territory", dim)

    def test_underperforms_on_named_metric(self) -> None:
        _bind("marketing.csv")
        intent, _, metric, dim = _route("Which channel underperforms on satisfaction?")
        self.assertEqual(intent, "ranking")
        self.assertIn("satisfaction", metric)
        self.assertIn("channel", dim)

    def test_exceeds_budget_variance_metric(self) -> None:
        _bind("finance_fpa.csv")
        intent, _, metric, dim = _route("Which cost center exceeds budget the most?")
        self.assertEqual(intent, "ranking")
        self.assertIn("variance", metric)
        self.assertIn("cost_center", dim.replace(" ", ""))

    def test_longest_resolution_time_ranking(self) -> None:
        _bind("customer_support.csv")
        intent, _, metric, _ = _route(
            "Which ticket category has the longest resolution time?"
        )
        self.assertEqual(intent, "ranking")
        self.assertTrue(
            "resolution" in metric or "hours" in metric,
            msg=f"metric={metric}",
        )


class TestExecutiveStrategyRouting(unittest.TestCase):
    """Bucket B — leadership / strategy prompts → executive intent."""

    def test_strategic_budget_allocation(self) -> None:
        _bind("marketing.csv")
        intent, _, metric, _ = _route("Strategic recommendation for budget allocation")
        self.assertEqual(intent, "executive")
        self.assertTrue("spend" in metric or "budget" in metric, msg=metric)

    def test_sales_leader_focus(self) -> None:
        _bind("sales.csv")
        intent, _, _, _ = _route("What should the sales leader focus on?")
        self.assertEqual(intent, "executive")

    def test_cro_focus(self) -> None:
        _bind("banking_financial_services.csv")
        intent, _, _, _ = _route("What should the CRO focus on?")
        self.assertEqual(intent, "executive")


class TestExecutiveRiskMetrics(unittest.TestCase):
    """Executive risk should prefer profit / variance over revenue leaderboard."""

    def test_retail_biggest_risks_uses_profit(self) -> None:
        _bind("retail.csv")
        intent, _, metric, _ = _route("What are the biggest risks?")
        self.assertEqual(intent, "executive")
        self.assertIn("profit", metric)

    def test_fpa_risks_use_variance(self) -> None:
        _bind("finance_fpa.csv")
        intent, _, metric, _ = _route("What are the biggest FP&A risks?")
        self.assertEqual(intent, "executive")
        self.assertIn("variance", metric)

    def test_cost_overrun_uses_actual(self) -> None:
        _bind("finance_fpa.csv")
        intent, _, metric, _ = _route("Where is cost overrun concentrated?")
        self.assertEqual(intent, "executive")
        self.assertIn("actual", metric)


class TestCompositionIntent(unittest.TestCase):
    """Bucket D — composition breakdown → distribution intent (not ranking)."""

    def test_spend_category_breakdown_distribution(self) -> None:
        _bind("banking_financial_services.csv")
        intent, chart, metric, dim = _route("Spend category breakdown")
        self.assertIn(intent, ("distribution", "compare"))
        self.assertIn(chart, ("donut", "pie", "bar"))
        self.assertIn("spend", metric)
        self.assertIn("category", dim)


if __name__ == "__main__":
    unittest.main()
