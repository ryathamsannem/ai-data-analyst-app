"""
Regression tests for QA audit high-priority fixes:
- Banking metric collapse (avoid spend_amount fallback)
- Trend vs compare routing (MoM / growth phrases)
- Dual-metric ROI routing (revenue vs spend by campaign)
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_ROOT.parent
FIXTURES = REPO_ROOT / "test-fixtures" / "domains"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main as main_mod  # noqa: E402


def _bind_csv(name: str) -> None:
    path = FIXTURES / name
    df = pd.read_csv(path)
    main_mod.df = df
    main_mod.dataset_profile = main_mod.build_profile(df)


def _viz(question: str):
    return main_mod.compute_visualization_for_question(question)


class TestBankingMetricCollapseFixes(unittest.TestCase):
    def test_loan_balance_ranking(self) -> None:
        _bind_csv("banking_financial_services.csv")
        _, viz, analysis = _viz("Which branch has the highest loan balance?")
        metric = str(analysis.get("metricColumn") or "").lower()
        self.assertIn("loan", metric)
        self.assertNotIn("spend_amount", metric)
        self.assertTrue(viz and (viz.get("labels") or viz.get("chartData")))

    def test_deposit_compare(self) -> None:
        _bind_csv("banking_financial_services.csv")
        _, viz, analysis = _viz("Compare deposits across regions")
        metric = str(analysis.get("metricColumn") or "").lower()
        self.assertIn("deposit", metric)
        self.assertNotIn("spend_amount", metric)

    def test_delinquency_rate_ranking(self) -> None:
        _bind_csv("banking_financial_services.csv")
        _, viz, analysis = _viz("Which branch has the lowest delinquency rate?")
        metric = str(analysis.get("metricColumn") or "").lower()
        self.assertIn("delinquency", metric)
        self.assertNotIn("spend_amount", metric)

    def test_delinquency_average_by_region(self) -> None:
        _bind_csv("banking_financial_services.csv")
        _, viz, analysis = _viz("Which regions exceed average delinquency?")
        metric = str(analysis.get("metricColumn") or "").lower()
        self.assertIn("delinquency", metric)
        self.assertNotIn("spend_amount", metric)
        plan = analysis.get("routingPlan") or {}
        intent = str(plan.get("intent") or "").lower()
        self.assertIn(intent, ("ranking",))
        self.assertTrue(viz and (viz.get("labels") or viz.get("chartData")))

    def test_credit_risk_executive_uses_npl_not_spend(self) -> None:
        _bind_csv("banking_financial_services.csv")
        _, viz, analysis = _viz("Biggest credit risk")
        metric = str(analysis.get("metricColumn") or "").lower()
        self.assertTrue("npl" in metric or "delinquency" in metric, metric)
        self.assertNotIn("spend_amount", metric)

    def test_credit_utilization_by_region(self) -> None:
        _bind_csv("banking_financial_services.csv")
        _, viz, analysis = _viz("Credit utilization by region")
        metric = str(analysis.get("metricColumn") or "").lower()
        self.assertIn("utilization", metric)
        self.assertNotIn("spend_amount", metric)


class TestTrendVsCompareFixes(unittest.TestCase):
    def test_sales_mom_revenue_trend_intent(self) -> None:
        _bind_csv("sales.csv")
        _, viz, analysis = _viz("Which region grew revenue month over month?")
        plan = analysis.get("routingPlan") or {}
        intent = str(plan.get("intent") or analysis.get("intentBucket") or "").lower()
        self.assertIn(intent, ("trend",))
        chart_type = str((viz or {}).get("chartType") or "").lower()
        self.assertIn(chart_type, ("line", "area"))
        dim = str(analysis.get("categoryColumn") or "").lower()
        self.assertIn("date", dim)

    def test_trend_date_resolve_detects_mom(self) -> None:
        from intent_engine.trend_date_resolve import question_requests_trend_intent

        self.assertTrue(
            question_requests_trend_intent(
                "Which region grew revenue month over month?"
            )
        )
        self.assertTrue(
            question_requests_trend_intent("Show revenue growth over time by region")
        )


class TestDualMetricRoiFixes(unittest.TestCase):
    def test_campaign_roi_revenue_vs_spend_by_campaign(self) -> None:
        _bind_csv("marketing.csv")
        q = "Compare campaign ROI: revenue vs spend by campaign"
        self.assertTrue(main_mod._question_requests_two_metric_compare(q))
        spec = main_mod._resolve_two_metric_compare_spec(
            q, main_mod.df, main_mod.dataset_profile
        )
        self.assertIsNotNone(spec)
        self.assertIn("campaign", str(spec.get("group_col", "")).lower())
        self.assertIn("revenue", str(spec.get("metric_a", "")).lower())
        self.assertIn("spend", str(spec.get("metric_b", "")).lower())

        _, viz, analysis = _viz(q)
        self.assertIsNotNone(viz)
        metric = str(analysis.get("metricColumn") or "").lower()
        dim = str(analysis.get("categoryColumn") or "").lower()
        self.assertIn("revenue", metric)
        self.assertIn("campaign", dim)
        sec = str(analysis.get("secondaryMetricColumn") or "").lower()
        self.assertIn("spend", sec)

    def test_campaign_efficiency_dual_metric(self) -> None:
        _bind_csv("marketing.csv")
        q = "Campaign efficiency: revenue vs spend by campaign"
        self.assertTrue(main_mod._question_requests_two_metric_compare(q))
        spec = main_mod._resolve_two_metric_compare_spec(
            q, main_mod.df, main_mod.dataset_profile
        )
        self.assertIsNotNone(spec)


if __name__ == "__main__":
    unittest.main()
