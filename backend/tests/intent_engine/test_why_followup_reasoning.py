"""Phase B — why follow-up reasoning tests."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

GOLDEN_DIR = REPO_ROOT / "test-fixtures" / "golden-datasets"

from intent_engine.narrative_quality_validation import validate_narrative_quality
from intent_engine.why_followup_reasoning import (
    attach_why_followup_to_analysis,
    build_why_followup_context,
    is_why_followup_question,
    suggest_next_drilldowns,
    why_followup_prompt_block,
)
from main import resolve_follow_up_turn, ConversationContextPayload


class TestWhyFollowupDetection(unittest.TestCase):
    def test_detects_bare_why(self) -> None:
        self.assertTrue(is_why_followup_question("Why?"))
        self.assertTrue(is_why_followup_question("why"))

    def test_detects_entity_why(self) -> None:
        self.assertTrue(is_why_followup_question("Why is North highest?"))
        self.assertTrue(is_why_followup_question("Why is Corporate loan balance highest?"))

    def test_detects_trend_why(self) -> None:
        self.assertTrue(is_why_followup_question("Why did sales increase?"))
        self.assertTrue(is_why_followup_question("Why did utilization decrease?"))

    def test_detects_attrition_why(self) -> None:
        self.assertTrue(is_why_followup_question("Why is Support attrition high?"))

    def test_meta_not_why_only(self) -> None:
        self.assertFalse(is_why_followup_question("Which columns were used for this analysis?"))


class TestWhyFollowupSidecar(unittest.TestCase):
    def test_resolve_marks_why_follow_up(self) -> None:
        ctx = ConversationContextPayload(
            lastQuestion="Which region has the highest total sales?",
            rootQuestion="Which region has the highest total sales?",
            metricColumn="sales_amount",
            categoryColumn="region",
            lastChartTitle="Total sales by region",
            followUpChain=["Which region has the highest total sales?"],
        )
        plan = resolve_follow_up_turn("Why?", ctx, continuation_intent=True)
        sidecar = plan.get("conversation_sidecar") or {}
        self.assertTrue(sidecar.get("whyFollowUp"))
        self.assertEqual(
            plan["effective_question"],
            "Which region has the highest total sales?",
        )


class TestWhyFollowupGoldenIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import main as main_mod

        cls.main = main_mod

    def _parent_then_why(self, csv: str, parent_q: str, why_q: str):
        path = GOLDEN_DIR / csv
        df = pd.read_csv(path)
        self.main.df = df
        profile = self.main.build_profile(df)
        self.main.dataset_profile = profile
        exact, viz, analysis = self.main.compute_visualization_for_question(parent_q)
        self.assertIsNotNone(analysis)
        blocks = (analysis or {}).get("reasoningBlocks") or []
        attach_why_followup_to_analysis(
            analysis,
            follow_up_question=why_q,
            parent_question=parent_q,
            visualization=viz,
            exact_result=str(exact or ""),
            df=df,
            profile=profile,
        )
        return analysis, blocks

    def test_retail_why_north_uses_reasoning_blocks(self) -> None:
        parent_q = "Which region has the highest total sales?"
        analysis, _ = self._parent_then_why(
            "retail_gold_10000.csv", parent_q, "Why is North highest?"
        )
        ctx = analysis.get("whyFollowupContext") or {}
        self.assertEqual(ctx.get("type"), "why_followup")
        evidence = ctx.get("evidence") or []
        self.assertGreaterEqual(len(evidence), 1)
        claims = " ".join(str(b.get("claim", "")) for b in evidence).lower()
        self.assertIn("north", claims)
        self.assertGreaterEqual(len(ctx.get("nextQuestions") or []), 1)
        prompt = why_followup_prompt_block(ctx)
        self.assertIn("Do NOT use caused by", prompt)
        self.assertIn("Limitations", prompt)
        self.assertIn("90–130 words", prompt)
        self.assertIn("Why this matters", prompt)
        self.assertIn("Do NOT use Key findings", prompt)

    def test_banking_why_corporate(self) -> None:
        parent_q = "Which customer segment has the highest total loan balance?"
        analysis, _ = self._parent_then_why(
            "banking_gold_10000.csv", parent_q, "Why is Corporate highest?"
        )
        ctx = analysis.get("whyFollowupContext") or {}
        self.assertEqual(ctx.get("type"), "why_followup")
        ent = str(ctx.get("entity") or "").lower()
        self.assertIn("corporate", ent)
        next_qs = " ".join(ctx.get("nextQuestions") or []).lower()
        self.assertTrue(
            "product" in next_qs or "segment" in next_qs or "delinquency" in next_qs
        )

    def test_hr_why_salary_department(self) -> None:
        parent_q = "Which department has the highest average salary?"
        analysis, _ = self._parent_then_why(
            "hr_gold_5000.csv", parent_q, "Why is Engineering highest?"
        )
        ctx = analysis.get("whyFollowupContext") or {}
        self.assertEqual(ctx.get("type"), "why_followup")
        self.assertGreaterEqual(len(ctx.get("evidence") or []), 1)

    def test_hr_why_support_attrition(self) -> None:
        parent_q = "Which department has the highest attrition?"
        analysis, _ = self._parent_then_why(
            "hr_gold_5000.csv", parent_q, "Why is Support attrition high?"
        )
        ctx = analysis.get("whyFollowupContext") or {}
        self.assertEqual(ctx.get("type"), "why_followup")
        evidence = ctx.get("evidence") or []
        self.assertGreaterEqual(len(evidence), 1)
        claims = " ".join(str(b.get("claim", "")) for b in evidence).lower()
        self.assertIn("support", claims)
        next_qs = " ".join(ctx.get("nextQuestions") or []).lower()
        self.assertTrue(
            "job" in next_qs or "tenure" in next_qs or "engagement" in next_qs
        )

    def test_trend_why_bare(self) -> None:
        parent_q = "Show monthly sales amount trend over time"
        analysis, _ = self._parent_then_why(
            "retail_gold_10000.csv", parent_q, "Why did sales decrease?"
        )
        ctx = analysis.get("whyFollowupContext") or {}
        self.assertEqual(ctx.get("type"), "why_followup")
        interp = str(ctx.get("interpretation") or "").lower()
        self.assertIn("may indicate", interp)

    def test_synthetic_why_answer_passes_narrative_qa(self) -> None:
        parent_q = "Which region has the highest total sales?"
        analysis, blocks = self._parent_then_why(
            "retail_gold_10000.csv", parent_q, "Why?"
        )
        ctx = analysis.get("whyFollowupContext") or {}
        claims = [str(b.get("claim")) for b in ctx.get("evidence") or [] if b.get("claim")]
        answer = (
            "Key findings:\n"
            + "\n".join(f"- {c}" for c in claims[:2])
            + "\n\nWhat this may indicate:\n"
            "- This may indicate regional concentration in the current cohort; "
            "not proven causation.\n\nSuggested next steps:\n"
            + "\n".join(f"- {q}" for q in (ctx.get("nextQuestions") or [])[:2])
        )
        report = validate_narrative_quality(
            answer,
            analysis_ctx=analysis,
            reasoning_blocks=blocks,
        )
        self.assertTrue(report.ok)

    def test_bad_causal_why_answer_fails_qa(self) -> None:
        parent_q = "Which region has the highest total sales?"
        analysis, blocks = self._parent_then_why(
            "retail_gold_10000.csv", parent_q, "Why?"
        )
        bad = (
            "Key findings:\nNorth caused 35% of sales because of pricing.\n"
            "Root cause is customer density."
        )
        report = validate_narrative_quality(
            bad, analysis_ctx=analysis, reasoning_blocks=blocks
        )
        self.assertFalse(report.ok)


class TestNextDrilldowns(unittest.TestCase):
    def test_retail_drilldowns_mention_product_or_trend(self) -> None:
        df = pd.read_csv(GOLDEN_DIR / "retail_gold_10000.csv")
        import main as m

        profile = m.build_profile(df)
        qs = suggest_next_drilldowns(
            df,
            profile,
            metric_col="sales_amount",
            category_col="region",
            entity="North",
            parent_question="Which region has highest sales?",
        )
        joined = " ".join(qs).lower()
        self.assertTrue("north" in joined or "product" in joined or "month" in joined)


if __name__ == "__main__":
    unittest.main()
