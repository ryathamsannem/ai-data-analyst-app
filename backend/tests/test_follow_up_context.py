"""Follow-up context routing — continuation intent and meta thread questions."""

from __future__ import annotations

import unittest

from main import (
    ConversationContextPayload,
    ParentAnalysisContextPayload,
    resolve_follow_up_turn,
)


class TestFollowUpContext(unittest.TestCase):
    def _base_ctx(self) -> ConversationContextPayload:
        return ConversationContextPayload(
            lastQuestion="Which city contributes most revenue?",
            rootQuestion="Which city contributes most revenue?",
            metricColumn="revenue",
            categoryColumn="city",
            aggregation="Total sum",
            chartType="bar",
            lastChartTitle="Total revenue by city",
            followUpChain=["Which city contributes most revenue?"],
            lastAiAnswer="Mumbai leads with the highest revenue in this cohort.",
        )

    def test_meta_evidence_question_is_scoped_follow_up(self) -> None:
        ctx = self._base_ctx()
        plan = resolve_follow_up_turn(
            "What evidence supports this conclusion?",
            ctx,
            continuation_intent=True,
        )
        self.assertTrue(plan["conversation_sidecar"]["wasFollowUp"])
        self.assertEqual(
            plan["effective_question"],
            "Which city contributes most revenue?",
        )
        self.assertIn("Metric column", plan["ai_context_block"])
        self.assertIn("revenue", plan["ai_context_block"])

    def test_columns_used_meta_follow_up(self) -> None:
        ctx = self._base_ctx()
        plan = resolve_follow_up_turn(
            "Which columns were used for this analysis?",
            ctx,
            continuation_intent=True,
        )
        self.assertTrue(plan.get("scoped_follow_up"))
        self.assertIn("city", plan["ai_context_block"])
        self.assertIn("Do not invent columns", plan["ai_context_block"])

    def test_second_level_follow_up_preserves_root_scope(self) -> None:
        ctx = self._base_ctx()
        ctx.followUpChain = [
            "Which city contributes most revenue?",
            "Why is Mumbai highest?",
        ]
        ctx.lastQuestion = "Which city contributes most revenue?"
        plan = resolve_follow_up_turn(
            "Show the calculations behind this answer.",
            ctx,
            continuation_intent=True,
        )
        self.assertEqual(
            plan["effective_question"],
            "Which city contributes most revenue?",
        )
        self.assertIn("Mumbai", plan["ai_context_block"])

    def test_why_entity_highest_uses_scope_not_concat(self) -> None:
        ctx = self._base_ctx()
        plan = resolve_follow_up_turn("Why is Mumbai highest?", ctx)
        self.assertTrue(plan["conversation_sidecar"]["wasFollowUp"])
        self.assertEqual(
            plan["effective_question"],
            "Which city contributes most revenue?",
        )

    def test_continuation_intent_with_parent_context_only(self) -> None:
        parent = ParentAnalysisContextPayload(
            rootQuestion="Which city contributes most revenue?",
            priorQuestion="Which city contributes most revenue?",
            metricColumn="revenue",
            categoryColumn="city",
            followUpChain=["Which city contributes most revenue?"],
            lastAiAnswer="Mumbai leads on revenue.",
        )
        plan = resolve_follow_up_turn(
            "What evidence supports this conclusion?",
            None,
            continuation_intent=True,
            parent_ctx=parent,
        )
        self.assertTrue(plan["conversation_sidecar"]["wasFollowUp"])


if __name__ == "__main__":
    unittest.main()
