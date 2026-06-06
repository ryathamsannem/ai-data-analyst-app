"""
Non-retail follow-up chain validation — lightweight 3-step chains per domain.

Uses domain_quality_generic.csv and resolve_follow_up_turn (no LLM calls).
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

GENERIC_CSV = BACKEND_ROOT / "tests" / "fixtures" / "domain_quality_generic.csv"

# domain, base question (domain wording)
DOMAIN_FOLLOW_UP_CHAINS: List[Tuple[str, str]] = [
    ("Sales", "Which region generates the highest revenue?"),
    ("Marketing", "Which category has the highest satisfaction_score?"),
    ("Finance", "Which department has the highest cost?"),
    ("Operations", "Which department has the most units?"),
    ("HR", "Rank departments by units"),
    ("Support", "Which department has the lowest satisfaction_score?"),
    ("Healthcare", "Compare patient volume across wards"),
]

INVENTED_MARKERS = (
    "market penetration",
    "conversion rate",
    "customer lifetime value",
    "net promoter",
    "churn",
    "patient risk",
)

META_COLUMNS_QUESTION = "Which columns were used for this analysis?"


def _leading_entity(viz: Optional[Dict[str, Any]], base_question: str) -> str:
    labels = list((viz or {}).get("labels") or [])
    values = list((viz or {}).get("values") or [])
    if not labels:
        return "Unknown"
    ql = (base_question or "").lower()
    if "lowest" in ql and values and len(values) == len(labels):
        idx = min(range(len(values)), key=lambda i: float(values[i]))
        return str(labels[idx])
    return str(labels[0])


def _why_follow_up(entity: str, base_question: str) -> str:
    if "lowest" in (base_question or "").lower():
        return f"Why is {entity} lowest?"
    return f"Why is {entity} highest?"


class TestFollowUpDomainChains(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import main as main_mod

        cls.main = main_mod
        cls.df = pd.read_csv(GENERIC_CSV)
        cls.main.df = cls.df
        cls.main.dataset_profile = cls.main.build_profile(cls.df)
        cls.fixture_columns = set(cls.df.columns.tolist())

    def _run_base(self, base_question: str) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
        _exact, viz, analysis = self.main.compute_visualization_for_question(base_question)
        return viz, analysis

    def _build_context(
        self,
        base_question: str,
        viz: Optional[Dict[str, Any]],
        analysis: Dict[str, Any],
        top_entity: str,
    ):
        from main import ConversationContextPayload

        plan = analysis.get("routingPlan") or {}
        metric = str(analysis.get("metricColumn") or plan.get("metricColumn") or "")
        dim = str(analysis.get("categoryColumn") or plan.get("dimensionColumn") or "")
        labels = list((viz or {}).get("labels") or [])
        return ConversationContextPayload(
            lastQuestion=base_question,
            rootQuestion=base_question,
            metricColumn=metric or None,
            categoryColumn=dim or None,
            aggregation=str(analysis.get("aggregation") or "Total sum"),
            chartType=str((viz or {}).get("chartType") or "bar"),
            lastChartTitle=str(analysis.get("chartTitle") or ""),
            followUpChain=[base_question],
            lastAiAnswer=f"{top_entity} leads for this analysis.",
            lastChartLabelSample=labels[:8],
        )

    def test_domain_follow_up_chains(self) -> None:
        from main import resolve_follow_up_turn

        for domain, base_question in DOMAIN_FOLLOW_UP_CHAINS:
            with self.subTest(domain=domain, base=base_question):
                viz, analysis = self._run_base(base_question)
                plan = analysis.get("routingPlan") or {}
                self.assertTrue(plan, msg=f"{domain}: missing routingPlan")
                self.assertTrue(viz and (viz.get("labels") or []), msg=f"{domain}: no chart")

                metric = str(analysis.get("metricColumn") or plan.get("metricColumn") or "")
                dim = str(analysis.get("categoryColumn") or plan.get("dimensionColumn") or "")
                self.assertTrue(metric, msg=f"{domain}: missing metric")
                self.assertTrue(dim, msg=f"{domain}: missing dimension")
                self.assertIn(metric, self.fixture_columns, msg=f"{domain}: metric not in fixture")
                self.assertIn(dim, self.fixture_columns, msg=f"{domain}: dimension not in fixture")

                top_entity = _leading_entity(viz, base_question)
                ctx = self._build_context(base_question, viz, analysis, top_entity)

                for follow_q in (_why_follow_up(top_entity, base_question), META_COLUMNS_QUESTION):
                    plan_fu = resolve_follow_up_turn(
                        follow_q, ctx, continuation_intent=True
                    )
                    sidecar = plan_fu.get("conversation_sidecar") or {}
                    self.assertTrue(sidecar.get("wasFollowUp"), msg=f"{domain}: {follow_q!r}")
                    self.assertEqual(
                        plan_fu.get("effective_question"),
                        base_question,
                        msg=f"{domain}: scope lost for {follow_q!r}",
                    )
                    self.assertTrue(plan_fu.get("scoped_follow_up"), msg=f"{domain}: {follow_q!r}")

                    block = (plan_fu.get("ai_context_block") or "").lower()
                    self.assertIn(metric.lower(), block, msg=f"{domain}: metric missing in block")
                    self.assertIn(dim.lower(), block, msg=f"{domain}: dimension missing in block")
                    self.assertIn(base_question.lower(), block, msg=f"{domain}: root question missing")

                    if follow_q == META_COLUMNS_QUESTION:
                        self.assertIn("do not invent columns", block, msg=domain)

                    for marker in INVENTED_MARKERS:
                        self.assertNotIn(marker, block, msg=f"{domain}: {marker} in {follow_q!r}")

    def test_support_lowest_entity_follow_up(self) -> None:
        """Support chain uses the true minimum entity (Finance), not chart sort order."""
        from main import resolve_follow_up_turn

        base = "Which department has the lowest satisfaction_score?"
        viz, analysis = self._run_base(base)
        entity = _leading_entity(viz, base)
        self.assertEqual(entity, "Finance")
        ctx = self._build_context(base, viz, analysis, entity)
        plan = resolve_follow_up_turn(
            "Why is Finance lowest?", ctx, continuation_intent=True
        )
        self.assertTrue((plan.get("conversation_sidecar") or {}).get("wasFollowUp"))
        self.assertIn("satisfaction", (plan.get("ai_context_block") or "").lower())


if __name__ == "__main__":
    unittest.main()
