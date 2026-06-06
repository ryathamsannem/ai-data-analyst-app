"""Unit tests for explicit metric phrase extraction and resolution."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from intent_engine.resolve_explicit_metric import (
    extract_explicit_metric_phrases,
    question_names_metric_quantity,
    question_requests_record_count,
    resolve_explicit_metric_column,
)


class TestResolveExplicitMetric(unittest.TestCase):
    def setUp(self) -> None:
        self.df = pd.read_csv(
            BACKEND_ROOT / "tests" / "fixtures" / "geographic_performance.csv"
        )
        import main as main_mod

        self.profile = main_mod.build_profile(self.df)

    def test_extract_compare_phrase(self) -> None:
        phrases = extract_explicit_metric_phrases("Compare customer count across cities")
        self.assertTrue(any("customer" in p for p in phrases))

    def test_resolve_customers_column(self) -> None:
        col = resolve_explicit_metric_column(
            "Compare customer count across cities", self.df, self.profile
        )
        self.assertEqual(col, "customers")

    def test_customer_count_is_metric_not_row_count(self) -> None:
        self.assertTrue(
            question_names_metric_quantity(
                "Compare customer count across cities", "customers"
            )
        )
        self.assertFalse(
            question_requests_record_count(
                "Compare customer count across cities",
                resolved_metric_col="customers",
            )
        )

    def test_headcount_synonym_resolves_to_units(self) -> None:
        generic = pd.read_csv(
            BACKEND_ROOT / "tests" / "fixtures" / "domain_quality_generic.csv"
        )
        import main as main_mod

        profile = main_mod.build_profile(generic)
        for question in (
            "Which department has the highest headcount?",
            "Rank departments by headcount",
            "Which ward has highest patient volume?",
        ):
            col = resolve_explicit_metric_column(question, generic, profile)
            self.assertEqual(col, "units", msg=question)

    def test_headcount_is_not_row_count(self) -> None:
        self.assertFalse(
            question_requests_record_count(
                "Which department has the highest headcount?",
                resolved_metric_col="units",
            )
        )

    def test_row_count_question(self) -> None:
        self.assertTrue(
            question_requests_record_count("How many records are in the dataset?")
        )


if __name__ == "__main__":
    unittest.main()
