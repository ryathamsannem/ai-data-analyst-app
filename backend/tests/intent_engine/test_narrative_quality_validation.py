"""Unit tests for narrative quality validation helpers."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from intent_engine.narrative_guardrails import sanitize_narrative_answer
from intent_engine.narrative_quality_validation import (
    build_compliant_fixture_narrative,
    validate_narrative_prompt_assembly,
    validate_narrative_quality,
)


class TestNarrativeQualityValidation(unittest.TestCase):
    def test_flags_causal_overclaim(self) -> None:
        bad = (
            "Key findings:\n"
            "North caused 35% of total sales.\n\n"
            "What this may indicate:\n"
            "Pricing is driven by regional mix."
        )
        report = validate_narrative_quality(bad)
        self.assertFalse(report.ok)
        codes = {i.code for i in report.issues}
        self.assertIn("causal_overclaim", codes)

    def test_allows_hedged_interpretation(self) -> None:
        good = (
            "Key findings:\n"
            "North contributes 35% of total sales.\n\n"
            "What this may indicate:\n"
            "This may indicate concentration among top regions in this cohort."
        )
        ctx = {"metricColumn": "sales_amount", "metricColumnDisplay": "sales amount"}
        blocks = [{"claim": "North contributes 35% of total sales."}]
        report = validate_narrative_quality(
            good, analysis_ctx=ctx, reasoning_blocks=blocks
        )
        self.assertTrue(report.ok)

    def test_metric_mismatch_utilization_vs_spend(self) -> None:
        bad = (
            "Key findings:\n"
            "Total spend amount decreased over the last month.\n"
        )
        ctx = {"metricColumn": "utilization_pct", "metricColumnDisplay": "utilization pct"}
        report = validate_narrative_quality(bad, analysis_ctx=ctx)
        self.assertFalse(report.ok)
        self.assertTrue(any(i.code == "metric_mismatch" for i in report.issues))

    def test_scatter_causal_flagged(self) -> None:
        bad = "Key findings:\nRevenue drives profit across the sample."
        ctx = {"chartTypeInternal": "scatter", "intent": {"primaryGoal": "relationship"}}
        report = validate_narrative_quality(bad, analysis_ctx=ctx)
        self.assertFalse(report.ok)
        self.assertTrue(any(i.code == "scatter_causal" for i in report.issues))

    def test_forecast_overclaim_without_support(self) -> None:
        bad = "Sales will increase 20% next quarter based on the trend."
        ctx = {"forecastGuardrails": {"canForecast": False, "active": True}}
        report = validate_narrative_quality(bad, analysis_ctx=ctx)
        self.assertFalse(report.ok)
        self.assertTrue(any(i.code == "forecast_overclaim" for i in report.issues))

    def test_ui_duplication_warning(self) -> None:
        blocks = [
            {"claim": "North contributes 35% of total sales amount."},
            {"claim": "Top 3 regions account for 86% of total sales amount."},
            {"claim": "North is 2.4x higher than East on sales amount."},
        ]
        answer = "\n".join(b["claim"] for b in blocks)
        report = validate_narrative_quality(answer, reasoning_blocks=blocks)
        self.assertTrue(any(i.code == "reasoning_ui_duplication" for i in report.issues))

    def test_compliant_fixture_passes(self) -> None:
        ctx = {"metricColumn": "sales_amount", "metricColumnDisplay": "sales amount"}
        blocks = [{"claim": "North contributes 35% of total sales amount."}]
        answer = build_compliant_fixture_narrative(
            analysis_ctx=ctx, reasoning_blocks=blocks
        )
        report = validate_narrative_quality(
            answer, analysis_ctx=ctx, reasoning_blocks=blocks
        )
        self.assertTrue(report.ok)

    def test_sanitize_softens_causal_phrasing(self) -> None:
        import pandas as pd

        raw = "North is clearly caused by pricing strategy."
        out = sanitize_narrative_answer(raw, pd.DataFrame({"a": [1]}), {})
        self.assertNotIn("caused by", out.lower())
        self.assertIn("associated with", out.lower())

    def test_prompt_validation_requires_reasoning_block(self) -> None:
        ctx = {
            "metricColumn": "sales_amount",
            "reasoningBlocks": [{"claim": "North contributes 35% of total sales."}],
        }
        prompt = (
            "Structured reasoning evidence (authoritative — use as factual support only):\n"
            "- Do not invent causes, drivers, or external explanations beyond this list.\n"
            "- Distinguish: (1) what the numbers show\n"
            "Confidence-aware reasoning (mandatory):\n"
            "Metric column: sales_amount\n"
        )
        report = validate_narrative_prompt_assembly(prompt, ctx)
        self.assertTrue(report.ok)


if __name__ == "__main__":
    unittest.main()
