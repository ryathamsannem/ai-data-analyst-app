"""
End-to-end regression tests for retail_analytics_regression.csv — dynamic assertions only.
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

FIXTURE_CSV = BACKEND_ROOT / "tests" / "fixtures" / "retail_analytics_regression.csv"

REGRESSION_CASES: List[Tuple[str, str]] = [
    ("ranking", "Rank cities by revenue"),
    ("ranking", "Rank products by profit"),
    ("ranking", "Which city generates the highest revenue?"),
    ("ranking", "Which region performs best?"),
    ("compare", "Compare revenue across cities"),
    ("compare", "Compare profit across regions"),
    ("compare", "Compare customer count across cities"),
    ("compare", "Compare orders across cities"),
    ("trend", "Show revenue trend over time"),
    ("trend", "Show customer growth trend"),
    ("trend", "How has profit changed over time?"),
    ("correlation", "Is revenue correlated with customers?"),
    ("correlation", "What drives revenue the most?"),
    ("correlation", "Relationship between profit and revenue"),
    ("correlation", "Relationship between orders and revenue"),
    ("geographic", "Compare region performance"),
    ("geographic", "Which region contributes most revenue?"),
    ("geographic", "Explain Mumbai performance"),
    ("geographic", "Explain Bengaluru performance"),
    ("outlier", "Which city is an outlier?"),
    ("outlier", "Identify unusual revenue patterns"),
    ("executive", "Summarize business performance"),
    ("executive", "What are the biggest growth opportunities?"),
    ("executive", "What risks do you see?"),
    ("negative", "Which quarter has highest revenue?"),
    ("negative", "Revenue by salesperson"),
    ("negative", "Compare revenue across countries"),
]


def _column_labels(df: pd.DataFrame, col: str) -> Set[str]:
    if col not in df.columns:
        return set()
    return {str(v).strip() for v in df[col].dropna().unique() if str(v).strip()}


def _resolve_expected_metric(main_mod, question: str, df: pd.DataFrame, profile: Dict[str, Any]) -> Optional[str]:
    spec = main_mod._resolve_question_metric_spec(question, df, profile)
    if spec and spec.get("value_col"):
        return str(spec["value_col"])
    ct = profile.get("column_types", {})
    numeric = [c for c in df.columns if ct.get(c) == "number"]
    hit = main_mod._numeric_col_mentioned(question.lower(), numeric)
    return str(hit) if hit else None


def _resolve_expected_dimension(
    main_mod, question: str, df: pd.DataFrame, profile: Dict[str, Any]
) -> Optional[str]:
    intent = main_mod._describe_aggregate_intent(question, df, profile)
    if intent and intent.get("group_col"):
        return str(intent["group_col"])

    from intent_engine.dimension_request import question_requests_executive_summary
    from intent_engine.geographic_scope import resolve_geographic_group_column

    if question_requests_executive_summary(question):
        col = main_mod._pick_executive_summary_dimension(df, profile)
        if col:
            return str(col)

    geo = resolve_geographic_group_column(question, df, profile)
    if geo:
        return str(geo)

    ql = question.lower()
    for c in df.columns:
        cl = str(c).lower().replace("_", " ")
        if len(cl) >= 4 and cl.rstrip("s") in ql.replace("_", " "):
            return str(c)
    return None


def _title_mentions_metric(title: str, metric_col: str) -> bool:
    t = (title or "").lower()
    m = str(metric_col or "").lower().replace("_", " ")
    if not m:
        return True
    return m in t or m.rstrip("s") in t or f"{m}s" in t


class TestRetailAnalyticsRegression(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.df = pd.read_csv(FIXTURE_CSV)
        import main as main_mod

        cls.main = main_mod
        cls.main.df = cls.df
        cls.main.dataset_profile = cls.main.build_profile(cls.df)
        cls.profile = cls.main.dataset_profile

    def _run(self, question: str) -> Tuple[str, Optional[Dict[str, Any]], Dict[str, Any]]:
        self.main.df = self.df
        self.main.dataset_profile = self.profile
        return self.main.compute_visualization_for_question(question)

    def _assert_labels_match_dimension(
        self,
        labels: List[str],
        df: pd.DataFrame,
        dim_col: str,
        *,
        allow_time_buckets: bool = False,
    ) -> None:
        if not labels:
            return
        if allow_time_buckets or self.main._pick_date_column_for_trend(df, self.profile) == dim_col:
            return
        allowed = _column_labels(df, dim_col)
        for lab in labels:
            token = str(lab).strip()
            if not token or re.match(r"^point\s*\d+$", token, re.I):
                continue
            if re.match(r"^\[\d", token):
                continue
            self.assertIn(
                token,
                allowed,
                msg=f"label {token!r} not in {dim_col} values",
            )

    def test_regression_matrix(self) -> None:
        for bucket, question in REGRESSION_CASES:
            with self.subTest(bucket=bucket, question=question):
                self._assert_question(bucket, question)

    def _assert_question(self, bucket: str, question: str) -> None:
        exact, viz, analysis = self._run(question)
        intent = analysis.get("intent") or {}
        metric_col = str(analysis.get("metricColumn") or "")
        cat_col = str(analysis.get("categoryColumn") or "")
        agg_key = str(analysis.get("aggregationKey") or "").lower()
        title = str((viz or {}).get("title") or analysis.get("chartTitle") or "")

        if bucket == "negative":
            self.assertTrue(
                analysis.get("requestedDimensionMissing"),
                msg="expected requestedDimensionMissing for missing dimension",
            )
            redirected = bool(
                analysis.get("dimensionRedirectHandled")
                or analysis.get("partialVisualizationWarning")
            )
            self.assertTrue(
                redirected,
                msg="expected transparent redirect or partial-viz warning",
            )
            return

        expected_metric = _resolve_expected_metric(self.main, question, self.df, self.profile)
        if expected_metric:
            self.assertEqual(metric_col.lower(), expected_metric.lower(), msg=question)
            self.assertTrue(_title_mentions_metric(title, expected_metric), msg=title)

        if bucket in ("ranking", "compare", "geographic", "executive", "outlier"):
            self.assertIsNotNone(viz, msg=f"expected chart for {question!r}")
            labels = (viz or {}).get("labels") or []
            self.assertGreaterEqual(len(labels), 2, msg=question)

        if bucket in ("ranking", "compare", "geographic", "executive") and not question.lower().startswith(
            "explain "
        ):
            exp_dim = _resolve_expected_dimension(self.main, question, self.df, self.profile)
            if exp_dim:
                self.assertEqual(cat_col.lower(), exp_dim.lower(), msg=question)
                self._assert_labels_match_dimension(labels, self.df, exp_dim)

        if bucket == "compare" and "customer count" in question.lower():
            self.assertEqual(agg_key, "sum", msg=question)
            self.assertNotEqual(agg_key, "count", msg=question)

        if bucket == "compare" and re.search(r"\borders\b", question, re.I):
            self.assertEqual(agg_key, "sum", msg=question)

        if bucket == "trend":
            self.assertIsNotNone(viz, msg=question)
            chart_type = str((viz or {}).get("chartType") or "").lower()
            self.assertIn(chart_type, ("line", "area"), msg=question)
            self.assertEqual(
                cat_col.lower(),
                str(self.main._pick_date_column_for_trend(self.df, self.profile) or "").lower(),
                msg=question,
            )
            self.assertGreaterEqual(len((viz or {}).get("labels") or []), 2, msg=question)

        if bucket == "correlation":
            self.assertIsNotNone(viz, msg=question)
            self.assertEqual((viz or {}).get("chartType"), "scatter", msg=question)
            self.assertGreaterEqual(len((viz or {}).get("labels") or []), 2, msg=question)

        if bucket == "outlier" and "city" in question.lower():
            exp_dim = _resolve_expected_dimension(self.main, question, self.df, self.profile)
            if exp_dim:
                self.assertEqual(cat_col.lower(), exp_dim.lower(), msg=question)

        if bucket == "outlier" and "unusual" in question.lower():
            self.assertIn(
                str(intent.get("primaryGoal") or analysis.get("detectedIntent") or ""),
                ("outlier", "distribution"),
            )

        if bucket == "geographic" and question.lower().startswith("explain "):
            from intent_engine.dimension_request import find_categorical_entity_filter

            entity = find_categorical_entity_filter(question, self.df, self.profile)
            self.assertIsNotNone(entity, msg=question)
            fcol, fval = entity
            filtered = self.df[self.df[fcol].astype(str).str.strip() == fval]
            filtered_n = int(analysis.get("analysisRowCount") or len(filtered))
            self.assertEqual(filtered_n, len(filtered), msg=question)
            self.assertGreater(filtered_n, 0, msg=question)
            self.assertNotEqual(
                cat_col.lower(),
                fcol.lower(),
                msg="explain cohort should break down within entity, not by entity column",
            )
            if cat_col and labels:
                self._assert_labels_match_dimension(labels, filtered, cat_col)

        if bucket == "executive":
            exp_dim = _resolve_expected_dimension(self.main, question, self.df, self.profile)
            if exp_dim:
                self.assertEqual(cat_col.lower(), exp_dim.lower(), msg=question)

        self.assertTrue(bool(exact.strip()), msg=f"expected narrative context for {question!r}")


if __name__ == "__main__":
    unittest.main()
