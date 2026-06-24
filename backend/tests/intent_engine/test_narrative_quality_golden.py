"""
Phase A.2 — golden-dataset narrative quality regression (deterministic, no LLM).

Exercises chart/analysis pipeline, narrative prompt assembly, and quality validators
on representative AI Insight questions.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List, Tuple

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from intent_engine.narrative_quality_validation import (  # noqa: E402
    build_compliant_fixture_narrative,
    validate_narrative_prompt_assembly,
    validate_narrative_quality,
)
from services.ask_narrative_phase import build_ask_narrative_prompt  # noqa: E402

GOLDEN_DIR = REPO_ROOT / "test-fixtures" / "golden-datasets"

# (csv, question, expect_reasoning_in_prompt_if_present, trend_chart)
NARRATIVE_GOLDEN_CASES: List[Tuple[str, str, bool, bool]] = [
    ("retail_gold_10000.csv", "Which region has the highest total sales?", True, False),
    ("retail_gold_10000.csv", "Show monthly sales amount trend over time", True, True),
    (
        "retail_gold_10000.csv",
        "Which product category contributes the most profit?",
        True,
        False,
    ),
    ("hr_gold_5000.csv", "Which department has the highest average salary?", True, False),
    ("hr_gold_5000.csv", "Which department has the highest attrition?", True, False),
    ("hr_gold_5000.csv", "Show salary distribution", True, False),
    (
        "banking_gold_10000.csv",
        "Which customer segment has the highest total loan balance?",
        True,
        False,
    ),
    ("banking_gold_10000.csv", "Show utilization trend by month", False, True),
    (
        "banking_gold_10000.csv",
        "Which product type has the highest total spend amount?",
        True,
        False,
    ),
]


class TestNarrativeQualityGolden(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import main as main_mod

        cls.main = main_mod

    def _run(self, csv_name: str, question: str):
        path = GOLDEN_DIR / csv_name
        df = pd.read_csv(path)
        self.main.df = df
        profile = self.main.build_profile(df)
        self.main.dataset_profile = profile
        exact, viz, analysis = self.main.compute_visualization_for_question(question)
        return df, profile, exact, viz, analysis or {}

    def _minimal_plan(self) -> Dict[str, Any]:
        return {"ai_context_block": ""}

    def _build_prompt(self, **kwargs):
        return build_ask_narrative_prompt(**kwargs)

    def test_golden_prompt_carries_reasoning_and_metric_focus(self) -> None:
        for csv_name, question, expect_in_prompt, _ in NARRATIVE_GOLDEN_CASES:
            with self.subTest(csv=csv_name, question=question):
                df, profile, exact, viz, analysis = self._run(csv_name, question)
                if not analysis.get("metricColumn") and not viz:
                    continue
                assembly, _ = self._build_prompt(
                    question=question,
                    eff_q=question,
                    exact_result=str(exact or "No exact result."),
                    visualization=viz,
                    analysis_ctx=analysis,
                    plan=self._minimal_plan(),
                    sidecar=None,
                    dash_labs=[],
                    df=df,
                    dataset_profile=profile,
                )
                prompt_report = validate_narrative_prompt_assembly(
                    assembly.prompt, analysis
                )
                self.assertTrue(
                    prompt_report.ok,
                    msg=f"{question}: {[i.message for i in prompt_report.issues]}",
                )
                low = assembly.prompt.lower()
                self.assertIn("confidence-aware reasoning", low)
                blocks = analysis.get("reasoningBlocks") or []
                if expect_in_prompt and blocks:
                    self.assertIn("structured reasoning evidence", low)
                    self.assertIn("do not invent causes", low)
                    self.assertIn("why this matters", low)

    def test_golden_compliant_fixture_narratives_pass_validation(self) -> None:
        for csv_name, question, _, trend_only in NARRATIVE_GOLDEN_CASES:
            with self.subTest(csv=csv_name, question=question):
                _, _, _, _, analysis = self._run(csv_name, question)
                blocks = analysis.get("reasoningBlocks") or []
                if not blocks:
                    continue
                if trend_only:
                    types = {str(b.get("type")) for b in blocks if isinstance(b, dict)}
                    self.assertIn("trend_movement", types, msg=question)
                answer = build_compliant_fixture_narrative(
                    analysis_ctx=analysis, reasoning_blocks=blocks
                )
                report = validate_narrative_quality(
                    answer,
                    question=question,
                    analysis_ctx=analysis,
                    reasoning_blocks=blocks,
                )
                self.assertTrue(
                    report.ok,
                    msg=f"{question}: {[i.message for i in report.issues]}",
                )

    def test_bad_narratives_fail_quality_checks(self) -> None:
        _, _, _, _, analysis = self._run(
            "retail_gold_10000.csv",
            "Which region has the highest total sales?",
        )
        blocks = analysis.get("reasoningBlocks") or []
        bad_causal = (
            "Key findings:\nNorth caused 35% of sales.\n\n"
            "What this may indicate:\nPricing drove the gap."
        )
        r1 = validate_narrative_quality(
            bad_causal, analysis_ctx=analysis, reasoning_blocks=blocks
        )
        self.assertFalse(r1.ok)

        _, _, _, _, bank = self._run(
            "banking_gold_10000.csv",
            "Show utilization trend by month",
        )
        bad_metric = "Key findings:\nTotal spend amount trended lower by month.\n"
        r2 = validate_narrative_quality(bad_metric, analysis_ctx=bank)
        self.assertFalse(r2.ok)
        self.assertTrue(any(i.code == "metric_mismatch" for i in r2.issues))

    def test_banking_utilization_prompt_uses_utilization_not_spend(self) -> None:
        df, profile, exact, viz, analysis = self._run(
            "banking_gold_10000.csv",
            "Show utilization trend by month",
        )
        metric = str(analysis.get("metricColumn") or "").lower()
        self.assertIn("utilization", metric)
        assembly, _ = self._build_prompt(
            question="Show utilization trend by month",
            eff_q="Show utilization trend by month",
            exact_result=str(exact or ""),
            visualization=viz,
            analysis_ctx=analysis,
            plan=self._minimal_plan(),
            sidecar=None,
            dash_labs=[],
            df=df,
            dataset_profile=profile,
        )
        low = assembly.prompt.lower()
        self.assertIn("utilization", low)
        self.assertIn("metric column: utilization_pct", low)
        self.assertNotIn("metric column: spend_amount", low)

    def test_flat_utilization_trend_may_omit_reasoning_blocks(self) -> None:
        """Flat utilization series (<5% period change) may produce no trend_movement block."""
        _, _, _, _, analysis = self._run(
            "banking_gold_10000.csv",
            "Show utilization trend by month",
        )
        ct = str(analysis.get("chartTypeInternal") or "").lower()
        self.assertIn(ct, ("line", "area"))
        self.assertIn("utilization", str(analysis.get("metricColumn") or "").lower())


if __name__ == "__main__":
    unittest.main()
