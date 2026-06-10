"""
Regression tests for Wave 2/3 live narrative QA polish (C2-B01, HC3-NEG).
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

SUPPORT_FIXTURE = REPO_ROOT / "test-fixtures" / "domains" / "customer_support.csv"
HEALTHCARE_FIXTURE = REPO_ROOT / "test-fixtures" / "domains" / "healthcare.csv"


class TestWave23LiveQAPolish(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import main as main_mod

        cls.main = main_mod

    def _load(self, path: Path) -> None:
        df = pd.read_csv(path)
        self.main.df = df
        self.main.dataset_profile = self.main.build_profile(df)

    def test_customer_support_longest_resolution_time_by_category(self) -> None:
        self._load(SUPPORT_FIXTURE)
        q = "Which category has the longest resolution time?"
        _exact, viz, analysis = self.main.compute_visualization_for_question(q)

        metric = str(analysis.get("metricColumn") or "").lower()
        category = str(analysis.get("categoryColumn") or "").lower()
        self.assertIn(
            "resolution",
            metric,
            msg=f"expected resolution-time metric, got {metric!r}",
        )
        self.assertNotIn("tickets_opened", metric)
        self.assertTrue(
            "ticket_category" in category or category == "category",
            msg=f"expected ticket_category dimension, got {category!r}",
        )
        self.assertIsNotNone(viz, msg="expected chart for supported resolution metric")
        chart_type = str((viz or {}).get("chartType") or "").lower()
        self.assertIn(chart_type, ("bar", "horizontalbar"))

        urm = analysis.get("unsupportedRequestedMetricAnalysis") or {}
        self.assertFalse(
            urm.get("active") or analysis.get("unsupportedRequestedMetric"),
            msg="resolution time is supported in customer_support fixture",
        )

    def test_healthcare_patient_risk_score_unsupported_not_volume(self) -> None:
        self._load(HEALTHCARE_FIXTURE)
        q = "Compare patient risk score across wards"
        _exact, viz, analysis = self.main.compute_visualization_for_question(q)

        urm = analysis.get("unsupportedRequestedMetricAnalysis") or {}
        self.assertTrue(
            urm.get("active") or analysis.get("unsupportedRequestedMetric"),
            msg="expected unsupported requested-metric routing",
        )
        metric = str(analysis.get("metricColumn") or "").lower()
        category = str(analysis.get("categoryColumn") or "").lower()
        self.assertNotEqual(
            metric,
            "patient_volume",
            msg="must not substitute patient_volume for patient risk score",
        )
        self.assertNotEqual(
            category,
            "region",
            msg="must not substitute region when wards are requested",
        )
        self.assertIsNone(
            viz,
            msg="should not render patient_volume-by-region chart",
        )
        plan = analysis.get("routingPlan") or {}
        intent = str(plan.get("intent") or analysis.get("intentBucket") or "").lower()
        self.assertNotEqual(intent, "executive")


if __name__ == "__main__":
    unittest.main()
