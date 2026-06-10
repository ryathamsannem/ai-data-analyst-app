"""
Regression tests for Wave 2 cross-domain routing blockers (Finance FP&A, Customer Support).
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

FINANCE_FIXTURE = REPO_ROOT / "test-fixtures" / "domains" / "finance_fpa.csv"
SUPPORT_FIXTURE = REPO_ROOT / "test-fixtures" / "domains" / "customer_support.csv"


class TestWave2RoutingBlockers(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import main as main_mod

        cls.main = main_mod

    def _load(self, path: Path) -> None:
        df = pd.read_csv(path)
        self.main.df = df
        self.main.dataset_profile = self.main.build_profile(df)

    def test_finance_ebitda_margin_trend_unsupported_not_revenue(self) -> None:
        self._load(FINANCE_FIXTURE)
        q = "Compare EBITDA margin trend by quarter"
        _exact, viz, analysis = self.main.compute_visualization_for_question(q)

        urm = analysis.get("unsupportedRequestedMetricAnalysis") or {}
        self.assertTrue(
            urm.get("active") or analysis.get("unsupportedRequestedMetric"),
            msg="expected unsupported requested-metric routing",
        )
        self.assertIsNone(viz, msg="should not render revenue trend chart")
        metric = str(analysis.get("metricColumn") or "").lower()
        self.assertNotEqual(
            metric,
            "revenue",
            msg="must not substitute revenue for EBITDA margin",
        )
        plan = analysis.get("routingPlan") or {}
        intent = str(plan.get("intent") or analysis.get("intentBucket") or "").lower()
        self.assertIn(
            intent,
            ("fallback", "unsupported", "trend", ""),
            msg="unsupported or fallback intent expected when chart suppressed",
        )
        if plan.get("unsupportedReason"):
            self.assertNotIn("revenue trend", str(plan["unsupportedReason"]).lower())

    def test_customer_support_satisfaction_resolution_correlation(self) -> None:
        self._load(SUPPORT_FIXTURE)
        q = "Is satisfaction correlated with resolution time?"
        _exact, viz, analysis = self.main.compute_visualization_for_question(q)

        intent_obj = analysis.get("intent") or {}
        primary = str(
            intent_obj.get("primaryGoal")
            or (analysis.get("routingPlan") or {}).get("intent")
            or analysis.get("intentBucket")
            or ""
        ).lower()
        self.assertIn(
            primary,
            ("relationship", "driver"),
            msg=f"expected relationship intent, got {primary!r}",
        )
        self.assertIsNotNone(viz, msg="expected scatter visualization")
        chart_type = str((viz or {}).get("chartType") or "").lower()
        self.assertEqual(chart_type, "scatter")

        x_col = str(
            (viz or {}).get("scatterXLabel")
            or analysis.get("metricColumn")
            or ""
        ).lower()
        y_col = str(
            (viz or {}).get("scatterYLabel")
            or analysis.get("categoryColumn")
            or ""
        ).lower()
        blob = f"{x_col} {y_col} {analysis.get('metricColumn')} {analysis.get('categoryColumn')}"
        self.assertIn("satisfaction", blob)
        self.assertIn("resolution", blob)

        ur = analysis.get("unsupportedRelationship") or {}
        self.assertFalse(ur.get("active"), msg="should not be unsupported")


if __name__ == "__main__":
    unittest.main()
