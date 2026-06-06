"""
Compare questions — explicit metric resolution, aggregation, and chart alignment.
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
RETAIL_CSV = BACKEND_ROOT / "tests" / "fixtures" / "retail_region_product.csv"


class TestCompareMetricResolution(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import main as main_mod

        cls.main = main_mod
        cls.geo_df = pd.read_csv(GEO_CSV)
        cls.retail_df = pd.read_csv(RETAIL_CSV)
        cls.hr_df = pd.DataFrame(
            {
                "department": [
                    "Sales",
                    "Engineering",
                    "HR",
                    "Sales",
                    "Engineering",
                    "HR",
                ],
                "salary": [80000, 95000, 70000, 82000, 98000, 72000],
                "employee_id": ["E1", "E2", "E3", "E4", "E5", "E6"],
            }
        )

    def _run(self, question: str, df: pd.DataFrame) -> tuple:
        self.main.df = df
        self.main.dataset_profile = self.main.build_profile(df)
        return self.main.compute_visualization_for_question(question)

    def test_compare_customer_count_across_cities(self) -> None:
        q = "Compare customer count across cities"
        exact, viz, analysis = self._run(q, self.geo_df)

        self.assertEqual(str(analysis.get("metricColumn") or "").lower(), "customers")
        self.assertEqual(str(analysis.get("categoryColumn") or "").lower(), "city")
        self.assertEqual(str(analysis.get("aggregationKey") or "").lower(), "sum")
        self.assertNotEqual(str(analysis.get("aggregationKey") or "").lower(), "count")

        self.assertIsNotNone(viz)
        title = str(viz.get("title") or analysis.get("chartTitle") or "").lower()
        self.assertIn("customer", title)
        self.assertNotIn("revenue", title)

        values = viz.get("values") or []
        self.assertGreaterEqual(len(values), 2)
        self.assertGreater(max(float(v) for v in values), 1.0)
        labels = viz.get("labels") or []
        self.assertIn("Mumbai", labels)
        self.assertEqual(labels[0], "Mumbai")

        intent = analysis.get("intent") or {}
        self.assertEqual(
            str((intent.get("metric") or {}).get("columnKey") or "").lower(),
            "customers",
        )

    def test_compare_revenue_across_cities(self) -> None:
        q = "Compare revenue across cities"
        exact, viz, analysis = self._run(q, self.geo_df)

        self.assertEqual(str(analysis.get("metricColumn") or "").lower(), "revenue")
        self.assertEqual(str(analysis.get("categoryColumn") or "").lower(), "city")
        self.assertEqual(str(analysis.get("aggregationKey") or "").lower(), "sum")
        self.assertIsNotNone(viz)
        title = str(viz.get("title") or "").lower()
        self.assertIn("revenue", title)
        values = viz.get("values") or []
        self.assertGreater(max(float(v) for v in values), 1000.0)

    def test_compare_profit_across_regions(self) -> None:
        q = "Compare profit across regions"
        exact, viz, analysis = self._run(q, self.retail_df)

        self.assertEqual(str(analysis.get("metricColumn") or "").lower(), "profit")
        cat = str(analysis.get("categoryColumn") or "").lower()
        self.assertIn(cat, ("region", "zone"))
        self.assertIsNotNone(viz)
        title = str(viz.get("title") or "").lower()
        self.assertIn("profit", title)
        self.assertGreater(len(viz.get("labels") or []), 1)

    def test_compare_salary_across_departments(self) -> None:
        q = "Compare salary across departments"
        exact, viz, analysis = self._run(q, self.hr_df)

        self.assertEqual(str(analysis.get("metricColumn") or "").lower(), "salary")
        self.assertEqual(str(analysis.get("categoryColumn") or "").lower(), "department")
        self.assertIn(
            str(analysis.get("aggregationKey") or "").lower(),
            ("mean", "sum"),
        )
        self.assertIsNotNone(viz)
        title = str(viz.get("title") or "").lower()
        self.assertIn("salary", title)
        values = [float(v) for v in (viz.get("values") or [])]
        self.assertTrue(all(v >= 1000 for v in values))

    def test_compare_employee_count_across_departments(self) -> None:
        q = "Compare employee count across departments"
        exact, viz, analysis = self._run(q, self.hr_df)

        self.assertEqual(str(analysis.get("categoryColumn") or "").lower(), "department")
        self.assertEqual(str(analysis.get("aggregationKey") or "").lower(), "count")
        self.assertIsNotNone(viz)
        title = str(viz.get("title") or "").lower()
        self.assertIn("employee", title)
        self.assertNotIn("salary", title)
        values = [float(v) for v in (viz.get("values") or [])]
        self.assertEqual(len(values), 3)
        self.assertEqual(sum(values), 6.0)

    def test_explicit_metric_spec_resolves_customers(self) -> None:
        spec = self.main._resolve_question_metric_spec(
            "Compare customer count across cities",
            self.geo_df,
            self.main.build_profile(self.geo_df),
        )
        self.assertIsNotNone(spec)
        self.assertEqual(str(spec.get("value_col") or "").lower(), "customers")
        self.assertTrue(spec.get("explicit_metric"))

    def test_record_count_not_triggered_for_customer_count_phrase(self) -> None:
        from intent_engine.resolve_explicit_metric import question_requests_record_count

        self.assertFalse(
            question_requests_record_count(
                "Compare customer count across cities",
                resolved_metric_col="customers",
            )
        )


if __name__ == "__main__":
    unittest.main()
