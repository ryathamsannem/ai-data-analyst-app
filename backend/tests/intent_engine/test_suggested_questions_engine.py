"""Tests for dataset-aware suggested question generation."""

from __future__ import annotations

import re
import unittest
from collections import Counter
from pathlib import Path

import pandas as pd

import main as m
from intent_engine.suggested_questions_engine import (
    compose_suggested_questions,
    detect_suggestion_vertical,
    select_diverse_candidates,
    QuestionCandidate,
    _normalize_question_key,
)

FIXTURES = Path(__file__).resolve().parents[3] / "test-fixtures" / "domains"


def _load(name: str) -> pd.DataFrame:
    return pd.read_csv(FIXTURES / f"{name}.csv")


def _metric_mentions(questions: list[str]) -> list[str]:
    hits: list[str] = []
    for q in questions:
        low = q.lower()
        for token in (
            "loan balance",
            "deposit",
            "delinquency",
            "credit utilization",
            "npl",
            "spend",
            "revenue",
            "profit",
            "conversion",
        ):
            if token in low:
                hits.append(token)
    return hits


class SuggestedQuestionsEngineTests(unittest.TestCase):
    def test_banking_vertical_detected(self):
        df = _load("banking_financial_services")
        self.assertEqual(
            detect_suggestion_vertical(df.columns.tolist()),
            "banking",
        )

    def test_banking_covers_multiple_metrics(self):
        df = _load("banking_financial_services")
        profile = m.build_profile(df)
        numeric = [c for c in df.columns if profile["column_types"].get(c) == "number"]
        cat = [c for c in df.columns if profile["column_types"].get(c) in ("category", "text")]
        ranked_m = m._rank_numeric_metrics(df, numeric)
        ranked_d = m._rank_category_dimensions(df, cat, profile)
        qs = compose_suggested_questions(
            df=df,
            profile=profile,
            ranked_dims=ranked_d,
            ranked_metrics=ranked_m,
            date_cols=[c for c in df.columns if profile["column_types"].get(c) == "date"],
            columns=df.columns.tolist(),
            dashboard_kind="sales",
        )
        self.assertGreaterEqual(len(qs), 5)
        metrics = _metric_mentions(qs)
        self.assertGreaterEqual(len(set(metrics)), 3, metrics)

    def test_no_single_metric_dominates_banking(self):
        df = _load("banking_financial_services")
        m.df = df
        m.dataset_profile = m.build_profile(df)
        qs = m.build_suggested_questions()
        counts = Counter()
        for q in qs:
            for token in ("loan balance", "deposit", "delinquency", "credit utilization", "npl", "spend"):
                if token in q.lower():
                    counts[token] += 1
        if counts:
            most_common = counts.most_common(1)[0][1]
            self.assertLessEqual(most_common, 2, dict(counts))

    def test_diversity_selection_limits_repeated_intent(self):
        pool = [
            QuestionCandidate("Compare revenue across regions", "basic", "compare", "revenue", "region", 9),
            QuestionCandidate("Compare revenue across cities", "basic", "compare", "revenue", "city", 8),
            QuestionCandidate("What are the biggest risks?", "executive", "risk", score=10),
            QuestionCandidate("How does revenue correlate with profit?", "relationship", "correlation", "revenue", "profit", 8),
        ]
        out = select_diverse_candidates(pool, max_n=3)
        compare_count = sum(1 for q in out if "compare" in q.lower())
        self.assertLessEqual(compare_count, 1)

    def test_retail_includes_executive_and_relationship(self):
        df = _load("retail")
        m.df = df
        m.dataset_profile = m.build_profile(df)
        qs = m.build_suggested_questions()
        joined = " ".join(qs).lower()
        self.assertTrue(any(w in joined for w in ("risk", "opportunity")))
        self.assertTrue(any(w in joined for w in ("drive", "correlat", "factor")))

    def test_no_duplicate_normalized_questions(self):
        df = _load("marketing")
        m.df = df
        m.dataset_profile = m.build_profile(df)
        qs = m.build_suggested_questions()
        keys = [_normalize_question_key(q) for q in qs]
        self.assertEqual(len(keys), len(set(keys)))


if __name__ == "__main__":
    unittest.main()
