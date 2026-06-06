"""
Geography QA — outliers, unsupported trend, dual-metric compare (no regressions).
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

GEO_CSV = BACKEND_ROOT / "tests" / "fixtures" / "geographic_performance.csv"
ONE_PERIOD_CSV = BACKEND_ROOT / "tests" / "fixtures" / "geographic_one_period.csv"
RETAIL_CSV = BACKEND_ROOT / "tests" / "fixtures" / "retail_region_product.csv"


def _bucket_label(name: str) -> bool:
    return str(name).strip().startswith("[")


class TestGeographicInsightsQA(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import main as main_mod

        cls.main = main_mod

    def _load(self, path: Path) -> None:
        df = pd.read_csv(path)
        self.main.df = df
        self.main.dataset_profile = self.main.build_profile(df)

    def test_geographic_outliers_use_zone_labels_not_histogram_bins(self) -> None:
        self._load(GEO_CSV)
        q = "Are there geographic outliers?"
        _exact, visualization, analysis = (
            self.main.compute_visualization_for_question(q)
        )
        self.assertIsNotNone(visualization, msg="expected chart")
        labels = visualization.get("labels") or []
        self.assertGreaterEqual(len(labels), 2)
        for lab in labels:
            self.assertFalse(_bucket_label(lab), msg=f"bucket label {lab!r}")
            self.assertIn(
                lab,
                {"South", "West", "North", "East"},
                msg=f"unexpected label {lab!r}",
            )
        ct = str(visualization.get("chartType") or "").lower()
        self.assertNotEqual(ct, "histogram")

    def test_trend_by_region_single_period_unsupported(self) -> None:
        self._load(ONE_PERIOD_CSV)
        q = "Show revenue trend by region"
        _exact, visualization, analysis = self.main.compute_visualization_for_question(q)
        ut = analysis.get("unsupportedTrendAnalysis") or {}
        self.assertTrue(
            ut.get("active") or analysis.get("trendRequestUnsatisfied"),
            msg="expected unsupported trend metadata",
        )
        if ut.get("active"):
            self.assertEqual(ut.get("title"), "Trend Analysis Not Available")
            self.assertIn("one distinct time period", str(ut.get("reason")).lower())
            self.assertIn("multiple periods", str(ut.get("requiredAction")).lower())

    def test_compare_revenue_profit_by_region_still_supported(self) -> None:
        self._load(GEO_CSV)
        q = "Compare revenue and profit by region"
        _exact, visualization, analysis = self.main.compute_visualization_for_question(q)
        intent = analysis.get("intent") or {}
        self.assertTrue(
            analysis.get("dualMetricCompare")
            or intent.get("dual_metric_compare")
            or (visualization or {}).get("multiSeries"),
            msg="dual-metric compare should remain supported",
        )

    def test_profit_margin_by_region_regression(self) -> None:
        self._load(GEO_CSV)
        q = "Compare profit margin by region"
        _exact, visualization, analysis = self.main.compute_visualization_for_question(q)
        self.assertTrue(
            analysis.get("derivedProfitMargin")
            or (analysis.get("intent") or {}).get("derived_profit_margin"),
        )

    def test_region_highest_revenue_regression(self) -> None:
        self._load(GEO_CSV)
        q = "Which region generates highest revenue"
        _exact, visualization, analysis = self.main.compute_visualization_for_question(q)
        self.assertIsNotNone(visualization)
        labels = visualization.get("labels") or []
        self.assertTrue(any(l in {"South", "West", "North", "East"} for l in labels))

    def test_region_contributes_most_profit_regression(self) -> None:
        self._load(GEO_CSV)
        q = "Which region contributes most to profit"
        _exact, visualization, analysis = self.main.compute_visualization_for_question(q)
        self.assertIsNotNone(visualization)

    def test_relationship_revenue_profit_regression(self) -> None:
        self._load(RETAIL_CSV)
        q = "Relationship between revenue and profit"
        _exact, visualization, analysis = self.main.compute_visualization_for_question(q)
        self.assertEqual((visualization or {}).get("chartType"), "scatter")

    def test_missing_ad_spend_multi_metric_regression(self) -> None:
        self._load(GEO_CSV)
        q = "Compare revenue vs ad spend by region"
        _exact, visualization, analysis = self.main.compute_visualization_for_question(q)
        um = analysis.get("unsupportedMultiMetricAnalysis") or {}
        self.assertTrue(
            um.get("active") or analysis.get("multiMetricRequestUnsatisfied"),
            msg="missing ad spend should trigger unsupported multi-metric",
        )


if __name__ == "__main__":
    unittest.main()
