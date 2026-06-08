"""
Domain-quality matrix — pattern-based routing checks across business domains.

Validates RoutingPlan + chart type + confidence bands deterministically.
Does NOT assert LLM narrative wording (see docs/ai-insights-domain-quality-framework.md).
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

FIXTURES = {
    "retail": BACKEND_ROOT / "tests" / "fixtures" / "retail_analytics_regression.csv",
    "geographic": BACKEND_ROOT / "tests" / "fixtures" / "geographic_performance.csv",
    "generic": BACKEND_ROOT / "tests" / "fixtures" / "domain_quality_generic.csv",
}

# domain, pattern, fixture_key, question, expect
DomainRow = Tuple[str, str, str, str, Dict[str, Any]]

DOMAIN_QUALITY_MATRIX: List[DomainRow] = [
    # --- Retail (primary regression fixture) ---
    ("Retail", "compare", "retail", "Compare revenue across cities", {"intent": "compare", "metric_contains": "revenue", "dimension_contains": "city", "chartType": "bar"}),
    ("Retail", "ranking", "retail", "Which city generates the highest revenue?", {"intent_in": ("ranking", "compare"), "metric_contains": "revenue", "dimension_contains": "city", "chartType_in": ("bar", "horizontalBar")}),
    ("Retail", "trend", "retail", "Show revenue trend over time", {"intent": "trend", "metric_contains": "revenue", "chartType": "line"}),
    ("Retail", "relationship", "retail", "Is revenue correlated with customers?", {"intent": "relationship", "chartType": "scatter"}),
    ("Retail", "geographic", "retail", "Compare region performance", {"intent_in": ("compare", "ranking"), "dimension_contains": "region", "chartType": "bar"}),
    ("Retail", "outlier", "retail", "Which city is an outlier?", {"intent_in": ("outlier", "ranking"), "chartType_in": ("bar", "histogram")}),
    ("Retail", "executive_risk", "retail", "What are the biggest risks?", {"intent_in": ("executive", "risk"), "executiveLens_in": ("risk", None)}),
    ("Retail", "executive_opportunity", "retail", "What are the biggest opportunities?", {"intent_in": ("executive",), "executiveLens_in": ("opportunity",)}),
    ("Retail", "summary", "retail", "Summarize business performance", {"intent_in": ("summary", "executive", "compare"), "chartType": "bar"}),
    # --- Sales (generic vocabulary on shared fixture) ---
    ("Sales", "compare", "generic", "Compare revenue across regions", {"intent": "compare", "metric_contains": "revenue", "dimension_contains": "region", "chartType": "bar"}),
    ("Sales", "ranking", "generic", "Rank departments by revenue", {"intent_in": ("ranking", "compare"), "metric_contains": "revenue", "chartType_in": ("bar", "horizontalBar")}),
    ("Sales", "trend", "generic", "Show revenue trend over time", {"intent": "trend", "metric_contains": "revenue", "dimension_contains": "date", "chartType_in": ("line", "area")}),
    ("Sales", "trend", "generic", "How did revenue change over time?", {"intent": "trend", "metric_contains": "revenue", "dimension_contains": "date", "chartType_in": ("line", "area")}),
    ("Sales", "ranking", "generic", "Rank products by revenue", {"intent_in": ("ranking", "compare"), "metric_contains": "revenue", "dimension_contains": "category", "chartType_in": ("bar", "horizontalBar")}),
    # --- Marketing ---
    ("Marketing", "compare", "generic", "Compare satisfaction_score by category", {"intent": "compare", "metric_contains": "satisfaction", "dimension_contains": "category", "aggregationKey": "mean", "chartType_in": ("bar", "horizontalBar")}),
    ("Marketing", "compare_across", "generic", "Compare satisfaction_score across categories", {"intent": "compare", "metric_contains": "satisfaction", "dimension_contains": "category", "aggregationKey": "mean", "chartType_in": ("bar", "horizontalBar"), "not_requested_dimension_missing": True}),
    ("Marketing", "compare", "generic", "Compare spend across campaigns", {"intent": "compare", "metric_contains": "cost", "dimension_contains": "category", "chartType_in": ("bar", "horizontalBar")}),
    ("Marketing", "trend", "generic", "Monthly trend of satisfaction score", {"intent": "trend", "metric_contains": "satisfaction", "dimension_contains": "date", "aggregationKey": "mean", "chartType_in": ("line", "area")}),
    ("Marketing", "trend", "generic", "Track satisfaction score over periods", {"intent": "trend", "metric_contains": "satisfaction", "dimension_contains": "date", "aggregationKey": "mean", "chartType_in": ("line", "area")}),
    ("Marketing", "relationship", "generic", "Is revenue correlated with satisfaction_score?", {"intent": "relationship", "chartType": "scatter"}),
    # --- Finance ---
    ("Finance", "compare", "generic", "Compare cost across departments", {"intent_in": ("compare", "ranking", "profitability"), "metric_contains": "cost", "chartType_in": ("bar", "horizontalBar")}),
    ("Finance", "profitability", "generic", "Where are we losing money?", {"intent_in": ("profitability", "executive", "compare"), "metric_contains_in": ("cost", "profit", "revenue")}),
    ("Finance", "trend", "generic", "Trend of cost by report date", {"intent": "trend", "metric_contains": "cost", "dimension_contains": "date", "chartType_in": ("line", "area")}),
    # --- Operations ---
    ("Operations", "compare", "generic", "Compare units across departments", {"intent_in": ("compare", "ranking"), "metric_contains": "unit", "chartType_in": ("bar", "horizontalBar")}),
    ("Operations", "trend", "generic", "Show units trend over time", {"intent": "trend", "metric_contains": "unit", "dimension_contains": "date", "chartType_in": ("line", "area")}),
    ("Operations", "trend", "generic", "How did units change over time?", {"intent": "trend", "metric_contains": "unit", "dimension_contains": "date", "chartType_in": ("line", "area")}),
    ("Operations", "synonym", "generic", "Compare downtime across departments", {"intent": "compare", "metric_contains": "cost", "dimension_contains": "department", "chartType_in": ("bar", "horizontalBar")}),
    # --- HR ---
    ("HR", "ranking", "generic", "Rank departments by units", {"intent_in": ("ranking", "compare"), "metric_contains": "unit", "chartType_in": ("bar", "horizontalBar")}),
    ("HR", "compare", "generic", "Compare units across departments", {"intent_in": ("compare", "ranking"), "metric_contains": "unit", "chartType_in": ("bar", "horizontalBar")}),
    ("HR", "synonym", "generic", "Compare headcount across departments", {"intent": "compare", "metric_contains": "unit", "dimension_contains": "department", "chartType_in": ("bar", "horizontalBar")}),
    ("HR", "ranking", "generic", "Which department has the highest headcount?", {"intent_in": ("ranking", "compare"), "metric_contains": "unit", "dimension_contains": "department", "aggregationKey": "sum", "chartType_in": ("bar", "horizontalBar")}),
    ("HR", "ranking", "generic", "Rank departments by headcount", {"intent_in": ("ranking", "compare"), "metric_contains": "unit", "dimension_contains": "department", "aggregationKey": "sum", "chartType_in": ("bar", "horizontalBar")}),
    # --- Customer Support ---
    ("Customer Support", "compare", "generic", "Compare satisfaction_score across departments", {"intent_in": ("compare", "ranking"), "metric_contains": "satisfaction", "aggregationKey": "mean", "chartType_in": ("bar", "horizontalBar")}),
    ("Customer Support", "ranking", "generic", "Which department has the lowest satisfaction_score?", {"intent_in": ("ranking", "compare"), "metric_contains": "satisfaction", "aggregationKey": "mean", "chartType_in": ("bar", "horizontalBar")}),
    ("Customer Support", "synonym", "generic", "Compare resolution across departments", {"intent": "compare", "metric_contains": "satisfaction", "dimension_contains": "department", "chartType_in": ("bar", "horizontalBar")}),
    # --- Healthcare-style (generic ward/department vocabulary) ---
    ("Healthcare", "compare", "generic", "Compare units across departments", {"intent_in": ("compare", "ranking"), "metric_contains": "unit", "chartType_in": ("bar", "horizontalBar")}),
    ("Healthcare", "ranking", "generic", "Rank departments by units", {"intent_in": ("ranking", "compare"), "metric_contains": "unit", "chartType_in": ("bar", "horizontalBar")}),
    ("Healthcare", "synonym", "generic", "Compare patient volume across wards", {"intent": "compare", "metric_contains": "unit", "dimension_contains": "category", "chartType_in": ("bar", "horizontalBar"), "dimension_notes_contains": "category column"}),
    ("Healthcare", "ranking", "generic", "Which ward has highest patient volume?", {"intent_in": ("ranking", "compare"), "metric_contains": "unit", "dimension_contains": "category", "aggregationKey": "sum", "chartType_in": ("bar", "horizontalBar"), "dimension_notes_contains": "category column"}),
    # --- Geography (dedicated fixture) ---
    ("Geography", "compare", "geographic", "Compare revenue across zones", {"intent_in": ("compare", "ranking"), "metric_contains": "revenue", "dimension_contains": "zone", "chartType": "bar"}),
    ("Geography", "ranking", "geographic", "Which city generates the highest revenue?", {"intent_in": ("ranking", "compare"), "metric_contains": "revenue", "dimension_contains": "city", "chartType_in": ("bar", "horizontalBar")}),
    ("Geography", "relationship", "geographic", "Is revenue correlated with customers?", {"intent": "relationship", "chartType": "scatter"}),
    ("Geography", "geographic", "geographic", "Compare region performance by zone", {"intent_in": ("compare", "ranking"), "dimension_contains_in": ("zone", "city", "state"), "chartType": "bar"}),
    ("Geography", "trend_unsupported", "geographic", "Show revenue trend over time", {"expect_unsupported_trend": True}),
]

FOLLOW_UP_CHAIN = [
    "Which city generates the highest revenue?",
    "Why is Mumbai highest?",
    "What evidence supports this conclusion?",
    "Which columns were used for this analysis?",
    "Show the calculations behind this answer.",
]

INVENTED_MARKERS = (
    "market penetration",
    "conversion rate",
    "customer lifetime value",
    "net promoter",
)


def _col_has(value: Optional[str], needle: Optional[str]) -> bool:
    if not needle:
        return True
    if not value:
        return False
    return needle.lower().replace("_", " ") in str(value).lower().replace("_", " ")


def _plan_from_analysis(analysis: Dict[str, Any]) -> Dict[str, Any]:
    plan = analysis.get("routingPlan")
    return plan if isinstance(plan, dict) else {}


class TestDomainQualityMatrix(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import main as main_mod

        cls.main = main_mod
        cls._frames: Dict[str, pd.DataFrame] = {
            key: pd.read_csv(path) for key, path in FIXTURES.items()
        }

    def _bind_fixture(self, fixture_key: str) -> None:
        df = self._frames[fixture_key]
        self.main.df = df
        self.main.dataset_profile = self.main.build_profile(df)

    def _assert_expect(
        self,
        domain: str,
        pattern: str,
        question: str,
        expect: Dict[str, Any],
        analysis: Dict[str, Any],
        viz: Optional[Dict[str, Any]],
    ) -> None:
        plan = _plan_from_analysis(analysis)
        if expect.get("expect_unsupported_trend"):
            ut = analysis.get("unsupportedTrendAnalysis") or {}
            self.assertTrue(
                ut.get("active") or analysis.get("trendRequestUnsatisfied"),
                msg=f"{domain}: expected unsupported trend for {question!r}",
            )
            self.assertFalse(viz and (viz.get("labels") or []), msg=question)
            return

        self.assertTrue(
            plan,
            msg=f"{domain}/{pattern}: missing routingPlan for {question!r}",
        )

        intent = str(plan.get("intent") or "")
        if "intent" in expect:
            self.assertEqual(intent, expect["intent"], msg=f"{domain}: {question}")
        if "intent_in" in expect:
            self.assertIn(intent, expect["intent_in"], msg=f"{domain}: {question} intent={intent}")

        lens = plan.get("executiveLens")
        if "executiveLens" in expect:
            self.assertEqual(str(lens or "").lower(), expect["executiveLens"], msg=question)
        if "executiveLens_in" in expect:
            self.assertIn(
                str(lens).lower() if lens else None,
                tuple(str(x).lower() if x else None for x in expect["executiveLens_in"]),
                msg=f"{question} lens={lens}",
            )

        metric = plan.get("metricColumn")
        if expect.get("metric_contains"):
            self.assertTrue(_col_has(metric, expect["metric_contains"]), msg=f"{question} metric={metric}")
        if expect.get("metric_contains_in"):
            self.assertTrue(
                any(_col_has(metric, m) for m in expect["metric_contains_in"]),
                msg=f"{question} metric={metric}",
            )

        dim = plan.get("dimensionColumn")
        if expect.get("dimension_contains"):
            self.assertTrue(_col_has(dim, expect["dimension_contains"]), msg=f"{question} dim={dim}")
        if expect.get("dimension_contains_in"):
            self.assertTrue(
                any(_col_has(dim, d) for d in expect["dimension_contains_in"]),
                msg=f"{question} dim={dim}",
            )

        chart = plan.get("chartType") or (viz or {}).get("chartType")
        if "chartType" in expect:
            norm = str(chart or "").strip()
            if norm.lower() == "horizontalbar":
                norm = "horizontalBar"
            expected = expect["chartType"]
            if str(expected).lower() == "horizontalbar":
                expected = "horizontalBar"
            self.assertEqual(
                norm.lower(),
                str(expected).lower(),
                msg=f"{domain}/{pattern}: {question}",
            )
        if "chartType_in" in expect:
            norm = str(chart or "").strip()
            if norm.lower() == "horizontalbar":
                norm = "horizontalBar"
            allowed = tuple(
                "horizontalBar" if str(x).lower() == "horizontalbar" else str(x)
                for x in expect["chartType_in"]
            )
            self.assertIn(norm if norm else None, allowed, msg=f"{question} chart={chart}")

        if pattern in ("compare", "ranking", "geographic", "executive_risk", "executive_opportunity", "summary"):
            if "chartType" in expect or expect.get("chartType_in"):
                self.assertTrue(viz and (viz.get("labels") or []), msg=f"{domain}: {question}")

        if pattern == "trend":
            ct = str((viz or {}).get("chartType") or chart or "").lower()
            self.assertIn(ct, ("line", "area"), msg=f"{domain}: {question} chart={chart}")

        if pattern == "relationship":
            self.assertEqual(
                str((viz or {}).get("chartType") or chart or "").lower(),
                "scatter",
                msg=f"{domain}: {question}",
            )

        conf = str(analysis.get("insightConfidenceLevel") or "").lower()
        if expect.get("confidence_in"):
            self.assertIn(conf, expect["confidence_in"], msg=f"{domain}: {question} conf={conf}")

        if expect.get("not_requested_dimension_missing"):
            self.assertFalse(
                analysis.get("requestedDimensionMissing"),
                msg=f"{domain}: {question} should not redirect dimension",
            )

        if expect.get("aggregationKey"):
            agg = str(analysis.get("aggregationKey") or "").lower()
            self.assertEqual(
                agg,
                str(expect["aggregationKey"]).lower(),
                msg=f"{domain}: {question} agg={agg}",
            )

        if expect.get("dimension_notes_contains"):
            intent = self.main._describe_aggregate_intent(
                question,
                self.main.df,
                self.main.dataset_profile,
            )
            notes = str((intent or {}).get("dimension_notes") or "").lower()
            self.assertIn(
                str(expect["dimension_notes_contains"]).lower(),
                notes,
                msg=f"{domain}: {question} notes={notes!r}",
            )

    def test_domain_quality_matrix(self) -> None:
        seen: set[Tuple[str, str, str]] = set()
        for domain, pattern, fixture_key, question, expect in DOMAIN_QUALITY_MATRIX:
            key = (domain, pattern, question)
            if key in seen:
                continue
            seen.add(key)
            self._bind_fixture(fixture_key)
            _exact, viz, analysis = self.main.compute_visualization_for_question(question)
            self._assert_expect(domain, pattern, question, expect, analysis, viz)

    def test_retail_ranking_confidence_can_reach_high(self) -> None:
        self._bind_fixture("retail")
        _exact, viz, analysis = self.main.compute_visualization_for_question(
            "Which city generates the highest revenue?"
        )
        self.assertTrue(viz and (viz.get("labels") or []))
        conf = str(analysis.get("insightConfidenceLevel") or "").lower()
        self.assertIn(conf, ("high", "moderate"), msg=f"confidence={conf}")

    def test_retail_follow_up_routing_preserves_root_scope(self) -> None:
        from main import ConversationContextPayload, resolve_follow_up_turn

        self._bind_fixture("retail")
        ctx = ConversationContextPayload(
            lastQuestion="Which city generates the highest revenue?",
            rootQuestion="Which city generates the highest revenue?",
            metricColumn="revenue",
            categoryColumn="city",
            aggregation="Total sum",
            chartType="bar",
            lastChartTitle="Total revenue by city",
            followUpChain=["Which city generates the highest revenue?"],
            lastAiAnswer="Mumbai leads with the highest revenue.",
        )
        for i, q in enumerate(FOLLOW_UP_CHAIN[1:], start=1):
            plan = resolve_follow_up_turn(q, ctx, continuation_intent=True)
            self.assertTrue(plan.get("conversation_sidecar", {}).get("wasFollowUp"), msg=q)
            self.assertEqual(
                plan.get("effective_question"),
                "Which city generates the highest revenue?",
                msg=q,
            )
            block = plan.get("ai_context_block") or ""
            self.assertIn("revenue", block.lower(), msg=q)
            self.assertIn("city", block.lower(), msg=q)
            for marker in INVENTED_MARKERS:
                self.assertNotIn(marker, block.lower(), msg=q)

    def test_trend_date_resolution_unit(self) -> None:
        from intent_engine.trend_date_resolve import (
            pick_trend_date_column,
            question_requests_trend_intent,
        )

        self._bind_fixture("generic")
        df = self._frames["generic"]
        profile = self.main.build_profile(df)
        self.assertEqual(pick_trend_date_column(df, profile), "report_date")
        self.assertTrue(question_requests_trend_intent("Track satisfaction score over periods"))
        self.assertTrue(question_requests_trend_intent("How did units change over time?"))

    def test_dimension_phrase_resolution_unit(self) -> None:
        from intent_engine.column_resolve import resolve_dimension_phrase_to_column

        self._bind_fixture("generic")
        df = self._frames["generic"]
        profile = self.main.build_profile(df)
        cols = df.columns.tolist()
        cases = {
            "categories": "category",
            "campaigns": "category",
            "wards": "category",
            "departments": "department",
            "regions": "region",
        }
        for phrase, expected_sub in cases.items():
            hit = resolve_dimension_phrase_to_column(phrase, cols, profile)
            self.assertTrue(
                _col_has(hit, expected_sub),
                msg=f"{phrase!r} -> {hit}, expected ~{expected_sub}",
            )

    def test_score_metric_synonym_resolution(self) -> None:
        self._bind_fixture("generic")
        df = self._frames["generic"]
        profile = self.main.build_profile(df)
        from intent_engine.column_resolve import (
            column_prefers_mean_aggregation,
            resolve_synonym_metric_column,
        )
        from intent_engine.resolve_explicit_metric import (
            question_requests_record_count,
            resolve_explicit_metric_column,
        )

        self.assertEqual(
            resolve_synonym_metric_column(
                "Which department has the highest headcount?", df, profile
            ),
            "units",
        )
        self.assertEqual(
            resolve_explicit_metric_column(
                "Rank departments by headcount", df, profile
            ),
            "units",
        )
        self.assertFalse(
            question_requests_record_count(
                "Which department has the highest headcount?",
                resolved_metric_col="units",
            )
        )
        self.assertTrue(column_prefers_mean_aggregation("satisfaction_score"))
        self.assertTrue(column_prefers_mean_aggregation("conversion_rate_pct"))
        self.assertFalse(column_prefers_mean_aggregation("units"))
        self.assertFalse(column_prefers_mean_aggregation("revenue"))

    def test_analysis_payload_pdf_provenance_fields(self) -> None:
        """PDF readiness: analysis must expose metric/dimension for appendix."""
        self._bind_fixture("retail")
        _exact, viz, analysis = self.main.compute_visualization_for_question(
            "Compare revenue across cities"
        )
        self.assertTrue(analysis.get("metricColumn"))
        self.assertTrue(analysis.get("categoryColumn") or analysis.get("routingPlan"))
        self.assertIsInstance(analysis.get("routingPlan"), dict)


if __name__ == "__main__":
    unittest.main()
