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
    ("compare", "Compare growth rate across regions"),
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
    ("geographic", "What explains Mumbai's performance?"),
    ("geographic", "Explain Bengaluru performance"),
    ("outlier", "Which city is an outlier?"),
    ("outlier", "Identify unusual revenue patterns"),
    ("executive_summary", "Summarize business performance"),
    ("executive_opportunity", "What are the biggest opportunities?"),
    ("executive_risk", "What are the biggest risks?"),
    ("negative", "Which quarter has highest revenue?"),
    ("negative", "Revenue by salesperson"),
    ("negative", "Compare revenue across countries"),
]


def _column_labels(df: pd.DataFrame, col: str) -> Set[str]:
    if col not in df.columns:
        return set()
    return {str(v).strip() for v in df[col].dropna().unique() if str(v).strip()}


def _resolve_expected_metric(main_mod, question: str, df: pd.DataFrame, profile: Dict[str, Any]) -> Optional[str]:
    try:
        from intent_engine.correlation_analysis import (
            resolve_relationship_numeric_pair,
            resolve_scatter_metric_columns_for_payload,
        )
        from intent_engine.question_patterns import (
            question_requests_correlation_routing,
            question_requests_driver_intent,
        )

        if question_requests_correlation_routing(question):
            pair = resolve_relationship_numeric_pair(question, df, profile)
            if pair:
                primary, _ = resolve_scatter_metric_columns_for_payload(
                    question,
                    str(pair[0]),
                    str(pair[1]),
                    driver=question_requests_driver_intent(question),
                    profile=profile,
                )
                return str(primary)
    except Exception:
        pass
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
    try:
        from intent_engine.executive_ambiguous_intent import (
            classify_executive_ambiguous_bucket,
            pick_executive_breakdown_column,
        )

        exec_bucket = classify_executive_ambiguous_bucket(question)
        if exec_bucket:
            exec_dim = pick_executive_breakdown_column(
                df, profile, question=question, bucket=exec_bucket
            )
            if exec_dim:
                return str(exec_dim)
    except Exception:
        pass

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

        exec_buckets = (
            "executive",
            "executive_summary",
            "executive_opportunity",
            "executive_risk",
        )
        if bucket in ("ranking", "compare", "geographic", *exec_buckets, "outlier"):
            self.assertIsNotNone(viz, msg=f"expected chart for {question!r}")
            labels = (viz or {}).get("labels") or []
            self.assertGreaterEqual(len(labels), 2, msg=question)

        if bucket in ("ranking", "compare", "geographic", *exec_buckets) and not re.search(
            r"\bexplain\b|what explains\b", question, re.I
        ):
            exp_dim = _resolve_expected_dimension(self.main, question, self.df, self.profile)
            if exp_dim:
                self.assertEqual(cat_col.lower(), exp_dim.lower(), msg=question)
                self._assert_labels_match_dimension(labels, self.df, exp_dim)

        if bucket == "compare" and "customer count" in question.lower():
            self.assertEqual(agg_key, "sum", msg=question)
            self.assertNotEqual(agg_key, "count", msg=question)
            self.assertIn("customer", metric_col.lower(), msg=question)

        if bucket == "compare" and re.search(r"\borders\b", question, re.I):
            self.assertEqual(agg_key, "sum", msg=question)

        if bucket == "compare" and re.search(r"\bgrowth\s+rate\b", question, re.I):
            self.assertIn("growth", metric_col.lower(), msg=question)
            exp_dim = _resolve_expected_dimension(self.main, question, self.df, self.profile)
            if exp_dim:
                self.assertEqual(cat_col.lower(), exp_dim.lower(), msg=question)
            self.assertEqual(
                agg_key,
                "mean",
                msg=f"expected average growth rate aggregation for {question!r}",
            )
            self.assertEqual((viz or {}).get("chartType"), "bar", msg=question)
            self.assertIsNotNone(viz, msg=question)
            self.assertGreaterEqual(len((viz or {}).get("labels") or []), 2, msg=question)
            self.assertGreaterEqual(len((viz or {}).get("values") or []), 2, msg=question)
            self.assertFalse(
                bool(analysis.get("growthRequestUnsatisfied")),
                msg=f"growth compare should not suppress chart for {question!r}",
            )
            ug = analysis.get("unsupportedGrowthAnalysis") or {}
            self.assertFalse(
                bool(ug.get("active")),
                msg=f"static growth_rate compare should not mark unsupported growth for {question!r}",
            )
            pts = int(analysis.get("chartSeriesPointCount") or analysis.get("chartPointCount") or 0)
            if pts >= 2:
                self.assertGreaterEqual(len((viz or {}).get("labels") or []), 2, msg=question)

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
            if "drives" in question.lower():
                self.assertEqual(
                    str(analysis.get("executiveLens") or "").lower(),
                    "driver",
                    msg=question,
                )

        if bucket == "outlier" and "city" in question.lower():
            exp_dim = _resolve_expected_dimension(self.main, question, self.df, self.profile)
            if exp_dim:
                self.assertEqual(cat_col.lower(), exp_dim.lower(), msg=question)

        if bucket == "outlier" and "unusual" in question.lower():
            self.assertIn(
                str(intent.get("primaryGoal") or analysis.get("detectedIntent") or ""),
                ("outlier", "distribution"),
            )

        if bucket == "geographic" and re.search(r"\bexplains?\b|what explains\b", question, re.I):
            from intent_engine.dimension_request import find_categorical_entity_filter

            entity = find_categorical_entity_filter(question, self.df, self.profile)
            self.assertIsNotNone(entity, msg=question)
            self.assertEqual(
                str(analysis.get("executiveLens") or "").lower(),
                "explain",
                msg=question,
            )
            fcol, fval = entity
            self.assertEqual(
                str(analysis.get("entityFilterColumn") or "").lower(),
                str(fcol).lower(),
                msg=question,
            )
            self.assertEqual(
                str(analysis.get("entityFilterValue") or "").strip(),
                str(fval).strip(),
                msg=question,
            )
            explain_mode = str(analysis.get("entityExplainMode") or "").lower()
            if explain_mode == "peer_compare":
                self.assertEqual(cat_col.lower(), str(fcol).lower(), msg=question)
                self.assertNotIn("product", cat_col.lower(), msg=question)
                if cat_col and labels:
                    self._assert_labels_match_dimension(labels, self.df, cat_col)
            else:
                filtered = self.df[self.df[fcol].astype(str).str.strip() == fval]
                self.assertGreater(int(analysis.get("analysisRowCount") or len(filtered)), 0, msg=question)
                self.assertNotEqual(cat_col.lower(), fcol.lower(), msg=question)
                if cat_col and labels:
                    self._assert_labels_match_dimension(labels, filtered, cat_col)

        if bucket in exec_buckets:
            exp_dim = _resolve_expected_dimension(self.main, question, self.df, self.profile)
            if exp_dim:
                self.assertEqual(cat_col.lower(), exp_dim.lower(), msg=question)
            breakdown = analysis.get("insightConfidenceBreakdown") or {}
            self.assertIsInstance(breakdown, dict, msg=question)
            self.assertIn("sampleSize", breakdown, msg=question)
            self.assertIn("intentMatch", breakdown, msg=question)
            lens_map = {
                "executive_summary": "summary",
                "executive_opportunity": "opportunity",
                "executive_risk": "risk",
            }
            expected_lens = lens_map.get(bucket)
            if expected_lens:
                self.assertEqual(
                    str(analysis.get("executiveLens") or "").lower(),
                    expected_lens,
                    msg=question,
                )
            ranked = analysis.get("rankedExecutiveInsights") or []
            if bucket == "executive_opportunity" and ranked:
                kinds = {str(x.get("kind") or "").lower() for x in ranked if isinstance(x, dict)}
                self.assertTrue(
                    kinds & {"opportunity", "gap"},
                    msg=f"expected opportunity lens cards, got {kinds}",
                )
            if bucket == "executive_risk" and ranked:
                kinds = {str(x.get("kind") or "").lower() for x in ranked if isinstance(x, dict)}
                self.assertTrue(
                    kinds & {"risk", "concentration"},
                    msg=f"expected risk lens cards, got {kinds}",
                )
            if bucket in ("executive_opportunity", "executive_risk") and ranked:
                keys = [
                    (
                        str(x.get("kind") or "").strip().lower(),
                        str(x.get("title") or "").strip().lower(),
                        str(x.get("value") or "").strip().lower(),
                    )
                    for x in ranked
                    if isinstance(x, dict)
                ]
                self.assertEqual(
                    len(keys),
                    len(set(keys)),
                    msg=f"duplicate executive cards found: {keys}",
                )
            if bucket == "executive_risk" and ranked:
                risk_by_entity: Dict[str, int] = {}
                for x in ranked:
                    if not isinstance(x, dict):
                        continue
                    if str(x.get("kind") or "").lower() != "risk":
                        continue
                    ent = str(x.get("value") or "").strip().lower()
                    if ent:
                        risk_by_entity[ent] = risk_by_entity.get(ent, 0) + 1
                for ent, cnt in risk_by_entity.items():
                    self.assertLessEqual(
                        cnt,
                        1,
                        msg=f"expected at most one risk card per entity, got {cnt} for {ent!r}",
                    )
            if bucket == "executive_summary" and ranked:
                kinds = {str(x.get("kind") or "").lower() for x in ranked if isinstance(x, dict)}
                self.assertTrue(
                    not (kinds & {"risk", "opportunity"}),
                    msg=f"executive summary should avoid dedicated risk/opportunity lens cards, got kinds={kinds}",
                )
                self.assertTrue(
                    len(kinds) >= 2,
                    msg=f"executive summary should combine multiple signals, got kinds={kinds}",
                )
                joined = " ".join(
                    str(x.get("narrativeLine") or x.get("hint") or "")
                    for x in ranked
                    if isinstance(x, dict)
                )
                if "contributes" in joined.lower() and "of" in joined.lower():
                    self.assertIn("%", joined, msg="share narratives must include %")

        chart_type = str((viz or {}).get("chartType") or analysis.get("chartType") or "").lower()
        chart_rec = analysis.get("chartRecommendation") or {}
        if isinstance(chart_rec, dict) and chart_type in ("bar", "horizontalbar", "line", "scatter"):
            sel = str(chart_rec.get("selectionExplanation") or "").lower()
            if sel:
                if chart_type == "bar":
                    self.assertIn("vertical", sel, msg=question)
                    self.assertNotIn("horizontal bar", sel, msg=question)
                elif chart_type == "horizontalbar":
                    self.assertIn("horizontal", sel, msg=question)
                elif chart_type == "line":
                    self.assertIn("line", sel, msg=question)
                elif chart_type == "scatter":
                    self.assertIn("scatter", sel, msg=question)

        self.assertTrue(bool(exact.strip()), msg=f"expected narrative context for {question!r}")

    def test_growth_compare_renders_chart_payload(self) -> None:
        question = "Compare growth rate across regions"
        _, viz, analysis = self._run(question)
        self.assertIsNotNone(viz, msg=question)
        labels = (viz or {}).get("labels") or []
        values = (viz or {}).get("values") or []
        self.assertGreaterEqual(len(labels), 2, msg=question)
        self.assertEqual(len(labels), len(values), msg=question)
        self.assertEqual((viz or {}).get("chartType"), "bar", msg=question)
        self.assertIn("growth", str(analysis.get("metricColumn") or "").lower(), msg=question)
        self.assertEqual(str(analysis.get("aggregationKey") or "").lower(), "mean", msg=question)
        self.assertFalse(bool(analysis.get("growthRequestUnsatisfied")), msg=question)

    def test_chart_metadata_requires_nonempty_visualization(self) -> None:
        """Regression: debug metadata must not claim a chart when viz payload is empty."""
        for question, _bucket in REGRESSION_CASES:
            _, viz, analysis = self._run(question)
            pts = int(
                analysis.get("chartSeriesPointCount")
                or analysis.get("chartPointCount")
                or 0
            )
            chart_type = str(
                (viz or {}).get("chartType")
                or analysis.get("chartType")
                or ""
            ).strip()
            if pts >= 2 and chart_type and chart_type.lower() not in ("none", "table"):
                self.assertIsNotNone(
                    viz,
                    msg=f"chartPointCount={pts} but visualization is null for {question!r}",
                )
                labels = (viz or {}).get("labels") or []
                self.assertGreaterEqual(
                    len(labels),
                    2,
                    msg=f"chartPointCount={pts} but labels empty for {question!r}",
                )

    def test_entity_explain_detects_city_not_global_product(self) -> None:
        from intent_engine.dimension_request import find_categorical_entity_filter

        question = "What explains Mumbai's performance?"
        _, viz, analysis = self._run(question)
        entity = find_categorical_entity_filter(question, self.df, self.profile)
        self.assertIsNotNone(entity, msg=question)
        fcol, fval = entity
        self.assertIn("city", str(fcol).lower(), msg=question)
        self.assertEqual(
            str(analysis.get("entityFilterColumn") or "").lower(),
            str(fcol).lower(),
            msg=question,
        )
        self.assertEqual(
            str(analysis.get("entityFilterValue") or "").strip(),
            str(fval).strip(),
            msg=question,
        )
        cat_col = str(analysis.get("categoryColumn") or "").lower()
        self.assertNotEqual(
            cat_col,
            "product",
            msg="entity explain must not return global product-only ranking",
        )
        explain_mode = str(analysis.get("entityExplainMode") or "").lower()
        if explain_mode == "peer_compare":
            self.assertEqual(cat_col, str(fcol).lower(), msg=question)
            labels = (viz or {}).get("labels") or []
            if labels:
                city_vals = set(self.df[fcol].astype(str).str.strip().unique())
                self.assertTrue(
                    set(str(x) for x in labels).issubset(city_vals),
                    msg=f"labels should be city values, got {labels}",
                )

    def test_risk_cards_deduplicate_by_entity_and_category(self) -> None:
        question = "What are the biggest risks?"
        _, _viz, analysis = self._run(question)
        self.assertEqual(str(analysis.get("executiveLens") or "").lower(), "risk", msg=question)
        ranked = analysis.get("rankedExecutiveInsights") or []
        self.assertTrue(len(ranked) >= 1, msg=question)
        keys = [
            (
                str(x.get("kind") or "").strip().lower(),
                str(x.get("title") or "").strip().lower(),
                str(x.get("value") or "").strip().lower(),
            )
            for x in ranked
            if isinstance(x, dict)
        ]
        self.assertEqual(len(keys), len(set(keys)), msg=f"duplicate cards: {keys}")
        risk_by_entity: Dict[str, int] = {}
        for x in ranked:
            if not isinstance(x, dict):
                continue
            if str(x.get("kind") or "").lower() != "risk":
                continue
            ent = str(x.get("value") or "").strip().lower()
            if ent:
                risk_by_entity[ent] = risk_by_entity.get(ent, 0) + 1
        for ent, cnt in risk_by_entity.items():
            self.assertLessEqual(cnt, 1, msg=f"duplicate risk card for entity {ent!r}")

    def test_opportunity_and_risk_lens_differ(self) -> None:
        _, _, opp_analysis = self._run("What are the biggest opportunities?")
        _, _, risk_analysis = self._run("What are the biggest risks?")
        self.assertEqual(str(opp_analysis.get("executiveLens") or "").lower(), "opportunity")
        self.assertEqual(str(risk_analysis.get("executiveLens") or "").lower(), "risk")
        opp_kinds = {
            str(x.get("kind") or "").lower()
            for x in (opp_analysis.get("rankedExecutiveInsights") or [])
            if isinstance(x, dict)
        }
        risk_kinds = {
            str(x.get("kind") or "").lower()
            for x in (risk_analysis.get("rankedExecutiveInsights") or [])
            if isinstance(x, dict)
        }
        self.assertTrue(opp_kinds & {"opportunity", "gap"}, msg=str(opp_kinds))
        self.assertTrue(risk_kinds & {"risk", "concentration"}, msg=str(risk_kinds))
        self.assertNotEqual(opp_kinds, risk_kinds)


if __name__ == "__main__":
    unittest.main()
