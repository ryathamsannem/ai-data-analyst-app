"""Histogram intent routing — bucket/bin/range synonym coverage."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
FIXTURES = BACKEND_ROOT.parent / "test-fixtures" / "domains"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main as main_mod  # noqa: E402

HISTOGRAM_PHRASES = (
    "Show salary distribution",
    "Analyze salary distribution",
    "How is salary distributed?",
    "Show distribution of employee salaries",
    "Show salary histogram",
    "Display salary buckets",
    "Show salary bins",
    "Show salary ranges",
    "Bucketize salaries",
    "Show frequency distribution of salary",
    "Show grouped ranges of salary",
)

HISTOGRAM_INTENT_PHRASES = HISTOGRAM_PHRASES + (
    "Show age distribution",
    "Show age buckets",
    "Display revenue ranges",
)


def _bind_employee() -> None:
    df = pd.read_csv(FIXTURES / "employee_test.csv")
    main_mod.df = df
    main_mod.dataset_profile = main_mod.build_profile(df)


class TestHistogramIntentDetection(unittest.TestCase):
    def test_bucket_and_range_synonyms_trigger_histogram_intent(self) -> None:
        for question in HISTOGRAM_INTENT_PHRASES:
            with self.subTest(question=question):
                self.assertTrue(
                    main_mod._question_asks_numeric_distribution_histogram(question),
                    msg=question,
                )

    def test_compare_questions_do_not_trigger_histogram_intent(self) -> None:
        compare_questions = (
            "Compare salary by department",
            "Which department has the highest average salary?",
            "Rank employees by salary",
            "Show salary trend over time",
        )
        for question in compare_questions:
            with self.subTest(question=question):
                self.assertFalse(
                    main_mod._question_asks_numeric_distribution_histogram(question),
                    msg=question,
                )


class TestHistogramQuestionRouting(unittest.TestCase):
    def setUp(self) -> None:
        _bind_employee()

    def _route(self, question: str) -> tuple[str, str, list]:
        _, viz, analysis = main_mod.compute_visualization_for_question(question)
        chart = str((viz or {}).get("chartType") or "").lower()
        intent = str(
            (analysis.get("routingPlan") or {}).get("intent")
            or analysis.get("intentBucket")
            or main_mod._chart_selection_question_bucket(question.lower())
            or ""
        ).lower()
        rows = list((viz or {}).get("data") or [])
        if not rows and viz:
            labels = list((viz or {}).get("labels") or [])
            values = list((viz or {}).get("values") or [])
            rows = [
                {"name": label, "value": value}
                for label, value in zip(labels, values)
            ]
        return intent, chart, rows

    def test_display_salary_buckets_routes_to_histogram(self) -> None:
        intent, chart, rows = self._route("Display salary buckets")
        self.assertEqual(chart, "histogram")
        self.assertIn("distribution", intent)
        self.assertGreaterEqual(len(rows), 4)

    def test_distribution_phrases_route_to_histogram(self) -> None:
        for question in HISTOGRAM_PHRASES:
            with self.subTest(question=question):
                intent, chart, rows = self._route(question)
                self.assertEqual(chart, "histogram", msg=f"chart for {question!r}")
                self.assertIn("distribution", intent, msg=f"intent for {question!r}")
                self.assertGreaterEqual(len(rows), 4, msg=f"rows for {question!r}")

    def test_compare_by_department_stays_categorical_bar(self) -> None:
        intent, chart, rows = self._route("Compare salary by department")
        self.assertNotEqual(chart, "histogram")
        self.assertIn(intent, ("compare", "ranking"))
        self.assertGreaterEqual(len(rows), 2)


if __name__ == "__main__":
    unittest.main()
