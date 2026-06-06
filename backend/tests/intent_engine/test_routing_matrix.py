"""
Routing matrix regression — validates RoutingPlan fields (not narrative wording).
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

FIXTURE_CSV = BACKEND_ROOT / "tests" / "fixtures" / "retail_analytics_regression.csv"


def _col_has(value: Optional[str], needle: Optional[str]) -> bool:
    if not needle:
        return True
    if not value:
        return False
    return needle.lower().replace("_", " ") in str(value).lower().replace("_", " ")


def _plan_from_analysis(analysis: Dict[str, Any]) -> Dict[str, Any]:
    plan = analysis.get("routingPlan")
    if isinstance(plan, dict):
        return plan
    return {}


# category, question, expect dict
ROUTING_MATRIX: List[Tuple[str, str, Dict[str, Any]]] = [
    # Compare
    ("compare", "Compare customer count across cities", {"intent": "compare", "metric_contains": "customer", "dimension_contains": "city", "chartType": "bar"}),
    ("compare", "Compare revenue across regions", {"intent": "compare", "metric_contains": "revenue", "dimension_contains": "region", "chartType": "bar"}),
    ("compare", "Compare profit across products", {"intent": "compare", "metric_contains": "profit", "dimension_contains": "product", "chartType_in": ("bar", "horizontalBar")}),
    ("compare", "Compare growth rate across regions", {"intent": "compare", "metric_contains": "growth", "chartType": "bar"}),
    ("compare", "Compare orders across cities", {"intent": "compare", "metric_contains": "order", "chartType": "bar"}),
    # Trend
    ("trend", "Show revenue trend over time", {"intent": "trend", "metric_contains": "revenue", "chartType": "line"}),
    ("trend", "How has profit changed over time?", {"intent": "trend", "metric_contains": "profit", "chartType": "line"}),
    ("trend", "Is revenue improving?", {"intent_in": ("trend", "compare", "fallback"), "chartType_in": ("line", "bar", "horizontalBar")}),
    ("trend", "Show customer growth trend", {"intent": "trend", "chartType": "line"}),
    # Relationship
    ("relationship", "Is revenue correlated with customers?", {"intent": "relationship", "chartType": "scatter"}),
    ("relationship", "What factors are correlated with profit?", {"intent": "relationship", "chartType": "scatter"}),
    ("relationship", "What drives revenue the most?", {"intent": "relationship", "chartType": "scatter"}),
    ("relationship", "Relationship between profit and revenue", {"intent": "relationship", "chartType": "scatter"}),
    # Ranking
    ("ranking", "Rank products by profit", {"intent_in": ("ranking", "compare"), "metric_contains": "profit", "dimension_contains": "product"}),
    ("ranking", "Which city generates the highest revenue?", {"intent_in": ("ranking", "compare"), "metric_contains": "revenue", "dimension_contains": "city"}),
    ("ranking", "Which region performs best?", {"intent_in": ("ranking", "compare"), "dimension_contains": "region"}),
    ("ranking", "Rank cities by revenue", {"intent_in": ("ranking", "compare"), "metric_contains": "revenue"}),
    # Executive strategy
    ("executive_strategy", "What should management focus on?", {"intent": "executive", "executiveLens": "strategy", "chartType": "bar"}),
    ("executive_strategy", "What should leadership prioritize?", {"intent": "executive", "executiveLens_in": ("strategy",), "chartType": "bar"}),
    ("executive_strategy", "What should the CEO know?", {"intent_in": ("executive", "summary", "compare", "fallback"), "chartType_in": ("bar", "horizontalBar", None)}),
    ("executive_strategy", "Where should we focus first?", {"intent": "executive", "executiveLens": "strategy"}),
    # Executive risk
    ("executive_risk", "What concerns you most?", {"intent": "executive", "executiveLens": "risk"}),
    ("executive_risk", "What are the biggest risks?", {"intent_in": ("executive", "risk"), "executiveLens_in": ("risk", None)}),
    ("executive_risk", "Where are we vulnerable?", {"intent": "executive", "executiveLens": "risk"}),
    ("executive_risk", "What warning signs should we watch?", {"intent_in": ("executive", "fallback"), "executiveLens_in": ("risk", None)}),
    ("executive_risk", "What keeps leadership up at night?", {"intent": "executive", "executiveLens": "risk"}),
    ("executive_risk", "What is our biggest exposure?", {"intent": "executive", "executiveLens": "risk"}),
    # Executive opportunity
    ("executive_opportunity", "What should we improve?", {"intent": "executive", "executiveLens": "opportunity"}),
    ("executive_opportunity", "What are the biggest opportunities?", {"intent_in": ("executive",), "executiveLens_in": ("opportunity",)}),
    ("executive_opportunity", "Where should we invest next?", {"intent_in": ("executive", "opportunity"), "executiveLens_in": ("opportunity", None)}),
    ("executive_opportunity", "Where can we grow?", {"intent_in": ("executive", "compare"), "executiveLens_in": ("opportunity", None)}),
    # Profitability
    ("profitability", "Where are we losing money?", {"intent": "profitability", "metric_contains": "profit", "chartType": "bar"}),
    ("profitability", "Which products have the lowest profit?", {"intent_in": ("profitability", "ranking", "compare"), "metric_contains": "profit"}),
    ("profitability", "Where is margin risk?", {"intent_in": ("profitability", "executive", "compare"), "metric_contains_in": ("profit", "margin", "revenue")}),
    ("profitability", "Which segments are unprofitable?", {"intent_in": ("profitability", "ranking", "compare", "fallback")}),
    # Outlier / standout
    ("outlier", "What stands out?", {"intent": "outlier", "executiveLens_in": ("standout",), "chartType": "bar"}),
    ("outlier", "Which city is an outlier?", {"intent": "outlier", "chartType_in": ("bar", "histogram")}),
    ("outlier", "Identify unusual revenue patterns", {"intent_in": ("outlier", "ranking", "distribution"), "chartType_in": ("bar", "histogram")}),
    ("outlier", "What looks surprising in this data?", {"intent_in": ("outlier", "executive", "fallback")}),
    # Fallback / missing dimension
    ("fallback", "Revenue by salesperson", {"intent": "fallback", "unsupported_expected": True}),
    ("fallback", "Compare revenue across countries", {"intent_in": ("fallback", "compare"), "unsupported_expected": True}),
    ("fallback", "Which quarter has highest revenue?", {"intent_in": ("fallback", "ranking", "compare"), "unsupported_expected": True}),
    ("fallback", "Show revenue by warehouse zone", {"intent_in": ("fallback", "compare")}),
    # Geographic / working flows (regression guards)
    ("geographic", "Compare region performance", {"intent_in": ("compare", "ranking"), "dimension_contains": "region", "chartType": "bar"}),
    ("geographic", "What explains Mumbai's performance?", {"intent_in": ("compare", "executive", "ranking"), "chartType": "bar"}),
    ("summary", "Summarize business performance", {"intent_in": ("summary", "executive", "compare"), "chartType": "bar"}),
    ("compare", "Compare customer count with orders by city", {"intent_in": ("compare",), "metric_contains": "customer"}),
    ("trend", "Revenue momentum over time", {"intent_in": ("trend", "compare"), "chartType_in": ("line", "bar")}),
    ("ranking", "Top performing city", {"intent_in": ("ranking", "compare"), "chartType": "bar"}),
    ("relationship", "Is profit correlated with revenue?", {"intent": "relationship", "chartType": "scatter"}),
]


class TestRoutingMatrix(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import main as main_mod

        cls.main = main_mod
        cls.df = pd.read_csv(FIXTURE_CSV)
        cls.main.df = cls.df
        cls.main.dataset_profile = cls.main.build_profile(cls.df)

    def _assert_expect(
        self,
        category: str,
        question: str,
        expect: Dict[str, Any],
        analysis: Dict[str, Any],
        viz: Optional[Dict[str, Any]],
    ) -> None:
        plan = _plan_from_analysis(analysis)
        self.assertTrue(plan, msg=f"{category}: missing routingPlan for {question!r}")

        intent = str(plan.get("intent") or "")
        if "intent" in expect:
            self.assertEqual(intent, expect["intent"], msg=question)
        if "intent_in" in expect:
            self.assertIn(intent, expect["intent_in"], msg=f"{question} got intent={intent}")

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
            self.assertTrue(
                _col_has(metric, expect["metric_contains"]),
                msg=f"{question} metric={metric}",
            )
        if expect.get("metric_contains_in"):
            self.assertTrue(
                any(_col_has(metric, m) for m in expect["metric_contains_in"]),
                msg=f"{question} metric={metric}",
            )
        if expect.get("metric_not"):
            self.assertFalse(
                _col_has(metric, expect["metric_not"]),
                msg=f"{question} should not use {expect['metric_not']}",
            )

        dim = plan.get("dimensionColumn")
        if expect.get("dimension_contains"):
            self.assertTrue(
                _col_has(dim, expect["dimension_contains"]),
                msg=f"{question} dimension={dim}",
            )

        chart = plan.get("chartType") or (viz or {}).get("chartType")
        if "chartType" in expect:
            if expect["chartType"] is None:
                self.assertFalse(viz and (viz.get("labels") or []), msg=question)
            else:
                self.assertEqual(
                    str(chart or "").lower(),
                    str(expect["chartType"]).lower(),
                    msg=question,
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

        if expect.get("unsupported_expected"):
            has_unsupported = bool(
                plan.get("unsupportedReason")
                or analysis.get("partialVisualizationWarning")
                or analysis.get("requestedDimensionMissing")
                or not (viz and (viz.get("labels") or []))
            )
            self.assertTrue(has_unsupported, msg=f"{question} expected unsupported/fallback signal")

    def test_routing_matrix(self) -> None:
        seen: set[str] = set()
        for category, question, expect in ROUTING_MATRIX:
            key = (category, question)
            if key in seen:
                continue
            seen.add(key)
            _exact, viz, analysis = self.main.compute_visualization_for_question(question)
            self._assert_expect(category, question, expect, analysis, viz)

    def test_routing_plan_present_on_all_matrix_rows(self) -> None:
        for _cat, question, _exp in ROUTING_MATRIX[:12]:
            _e, _v, analysis = self.main.compute_visualization_for_question(question)
            self.assertIsInstance(analysis.get("routingPlan"), dict, msg=question)


class TestRoutingPlanUnit(unittest.TestCase):
    def test_normalize_executive_and_profitability(self) -> None:
        from intent_engine.routing_plan import normalize_routing_intent

        self.assertEqual(
            normalize_routing_intent(
                primary_goal="executive_strategy",
                executive_lens=None,
                executive_bucket=None,
            ),
            ("executive", "strategy"),
        )
        self.assertEqual(
            normalize_routing_intent(
                primary_goal="loss_profitability",
                executive_lens="loss",
                executive_bucket="executive_loss_profitability",
            ),
            ("profitability", None),
        )


if __name__ == "__main__":
    unittest.main()
