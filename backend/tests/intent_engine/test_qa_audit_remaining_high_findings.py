"""
Regression tests for remaining QA audit High findings:
- Correlation scatter metricColumn (R-I01, M-I01, S-I01, G-I01, B-I03, …)
- Causation follow-up chain (M-C2-F2)
- Categorical outlier chart (S-I03)
- Threshold ranking intent (B-I04)
"""

from __future__ import annotations

import sys
import unittest
import uuid
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_ROOT.parent
FIXTURES = REPO_ROOT / "test-fixtures" / "domains"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main as main_mod  # noqa: E402
from main import ConversationContextPayload, resolve_follow_up_turn  # noqa: E402


def _bind_csv(name: str) -> None:
    path = FIXTURES / name
    df = pd.read_csv(path)
    main_mod.df = df
    main_mod.dataset_profile = main_mod.build_profile(df)


def _viz(question: str):
    return main_mod.compute_visualization_for_question(question)


def _intent(analysis: dict) -> str:
    plan = analysis.get("routingPlan") or {}
    return str(plan.get("intent") or analysis.get("intentBucket") or "").lower()


class TestCorrelationMetricReporting(unittest.TestCase):
    """Scatter must expose the question's primary metric on metricColumn (QIDs from audit)."""

    CASES = [
        ("retail.csv", "R-I01", "Is revenue correlated with customers?", "revenue", "customers"),
        ("marketing.csv", "M-I01", "Is revenue correlated with satisfaction_score?", "revenue", "satisfaction"),
        ("sales.csv", "S-I01", "Is revenue correlated with units?", "revenue", "units"),
        ("geography.csv", "G-I01", "Is revenue correlated with customers?", "revenue", "customers"),
        (
            "banking_financial_services.csv",
            "B-I03",
            "Is interest income correlated with loan balance?",
            "interest",
            "loan",
        ),
        ("finance_fpa.csv", "F2-I02", "Is revenue correlated with units?", "revenue", "units"),
        ("operations.csv", "O2-I01", "Is downtime correlated with defect rate?", "downtime", "defect"),
        (
            "customer_support.csv",
            "C2-I02",
            "Is satisfaction correlated with resolution time?",
            "satisfaction",
            "resolution",
        ),
        (
            "hr.csv",
            "H3-I02",
            "Is attrition correlated with satisfaction score?",
            "attrition",
            "satisfaction",
        ),
        (
            "healthcare.csv",
            "HC3-I01",
            "Is cost correlated with patient volume?",
            "cost",
            "patient",
        ),
    ]

    def test_correlation_scatter_metrics(self) -> None:
        for csv_name, qid, question, primary_hint, secondary_hint in self.CASES:
            with self.subTest(qid=qid, question=question):
                _bind_csv(csv_name)
                _, viz, analysis = _viz(question)
                self.assertEqual(_intent(analysis), "relationship", msg=qid)
                chart_type = str((viz or {}).get("chartType") or "").lower()
                self.assertEqual(chart_type, "scatter", msg=qid)
                metric = str(analysis.get("metricColumn") or "").lower()
                self.assertIn(primary_hint, metric, msg=f"{qid}: metricColumn={metric}")
                sec = str(analysis.get("secondaryMetricColumn") or "").lower()
                self.assertIn(secondary_hint, sec, msg=f"{qid}: secondary={sec}")


class TestCausationFollowUp(unittest.TestCase):
    """M-C2-F2 — causation advisory follow-up preserves relationship scatter scope."""

    def test_m_c2_f2_causation_follow_up(self) -> None:
        _bind_csv("marketing.csv")
        root_q = "Is revenue correlated with satisfaction_score?"
        _, viz0, analysis0 = _viz(root_q)
        self.assertEqual(_intent(analysis0), "relationship")

        ctx = ConversationContextPayload(
            lastQuestion=root_q,
            rootQuestion=root_q,
            metricColumn=analysis0.get("metricColumn"),
            categoryColumn=analysis0.get("categoryColumn"),
            aggregation=analysis0.get("aggregation"),
            chartType=(viz0 or {}).get("chartType"),
            intentBucket=_intent(analysis0),
            lastChartTitle=analysis0.get("chartTitle") or "",
            followUpChain=[root_q],
            turnId=str(uuid.uuid4()),
        )

        fu1 = "What evidence supports this conclusion?"
        plan1 = resolve_follow_up_turn(fu1, ctx, continuation_intent=True)
        self.assertTrue(plan1.get("scoped_follow_up"))
        ctx.lastQuestion = fu1
        ctx.followUpChain = list(ctx.followUpChain or []) + [fu1]

        fu2 = "What caution applies to causation?"
        plan2 = resolve_follow_up_turn(fu2, ctx, continuation_intent=True)
        self.assertTrue(plan2.get("scoped_follow_up"), msg="M-C2-F2 should scope to root")
        self.assertEqual(
            plan2.get("effective_question"),
            root_q,
            msg="M-C2-F2 effective question must be root correlation question",
        )

        _, viz2, analysis2 = _viz(str(plan2.get("effective_question")))
        self.assertEqual(_intent(analysis2), "relationship", msg="M-C2-F2")
        self.assertEqual(
            str((viz2 or {}).get("chartType") or "").lower(),
            "scatter",
            msg="M-C2-F2",
        )
        metric = str(analysis2.get("metricColumn") or "").lower()
        self.assertIn("revenue", metric, msg="M-C2-F2 metricColumn")


class TestCategoricalOutlierChart(unittest.TestCase):
    """S-I03 — which department is an outlier → bar by department, not histogram."""

    def test_s_i03_department_outlier_bar(self) -> None:
        _bind_csv("sales.csv")
        q = "Which department is an outlier for revenue?"
        _, viz, analysis = _viz(q)
        self.assertEqual(_intent(analysis), "outlier")
        chart_type = str((viz or {}).get("chartType") or "").lower()
        self.assertIn(chart_type, ("bar", "horizontalbar"), msg=chart_type)
        self.assertNotEqual(chart_type, "histogram")
        dim = str(analysis.get("categoryColumn") or "").lower()
        self.assertIn("department", dim)
        metric = str(analysis.get("metricColumn") or "").lower()
        self.assertIn("revenue", metric)


class TestThresholdRankingIntent(unittest.TestCase):
    """B-I04 — exceed average delinquency → ranking intent, not fallback."""

    def test_b_i04_exceed_average_ranking(self) -> None:
        _bind_csv("banking_financial_services.csv")
        _, viz, analysis = _viz("Which regions exceed average delinquency?")
        self.assertIn(_intent(analysis), ("ranking",))
        chart_type = str((viz or {}).get("chartType") or "").lower()
        self.assertIn(chart_type, ("bar", "horizontalbar"))
        metric = str(analysis.get("metricColumn") or "").lower()
        self.assertIn("delinquency", metric)
        dim = str(analysis.get("categoryColumn") or "").lower()
        self.assertIn("region", dim)


if __name__ == "__main__":
    unittest.main()
