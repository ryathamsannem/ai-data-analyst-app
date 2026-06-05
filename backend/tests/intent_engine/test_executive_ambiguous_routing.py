"""Ambiguous executive question routing — five management prompts."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from intent_engine.executive_ambiguous_intent import (  # noqa: E402
    bucket_to_executive_lens,
    classify_executive_ambiguous_bucket,
)
from intent_engine.executive_lens import detect_executive_lens  # noqa: E402

FIXTURE_CSV = BACKEND_ROOT / "tests" / "fixtures" / "retail_analytics_regression.csv"

FIVE_QUESTIONS = [
    (
        "What should management focus on?",
        "executive_strategy",
        "strategy",
        ("priority", "risk", "opportunity", "focus", "improve"),
    ),
    (
        "Where are we losing money?",
        "executive_loss_profitability",
        "loss",
        ("profit", "margin", "loss", "negative"),
    ),
    (
        "What should we improve?",
        "executive_opportunity",
        "opportunity",
        ("improve", "upside", "opportunity", "margin", "growth"),
    ),
    (
        "What concerns you most?",
        "executive_risk",
        "risk",
        ("risk", "concentration", "declin", "margin", "underperform"),
    ),
    (
        "What stands out?",
        "executive_outlier_standout",
        "standout",
        ("outlier", "standout", "unusual", "gap", "concentration"),
    ),
]


class TestExecutiveAmbiguousClassification(unittest.TestCase):
    def test_bucket_and_lens_detection(self) -> None:
        for question, bucket, lens, _terms in FIVE_QUESTIONS:
            self.assertEqual(
                classify_executive_ambiguous_bucket(question),
                bucket,
                msg=question,
            )
            self.assertEqual(detect_executive_lens(question), lens, msg=question)
            self.assertEqual(bucket_to_executive_lens(bucket), lens, msg=question)


class TestExecutiveAmbiguousVizRouting(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import main as main_mod

        cls.main = main_mod
        cls.df = pd.read_csv(FIXTURE_CSV)
        cls.main.df = cls.df
        cls.main.dataset_profile = cls.main.build_profile(cls.df)

    def _run(self, question: str) -> tuple:
        return self.main.compute_visualization_for_question(question)

    def test_five_questions_differ_by_lens_and_metric(self) -> None:
        results: dict = {}
        for question, bucket, lens, _terms in FIVE_QUESTIONS:
            exact, viz, analysis = self._run(question)
            results[question] = (exact, viz, analysis)
            self.assertEqual(
                str(analysis.get("executiveLens") or "").lower(),
                lens,
                msg=question,
            )
            self.assertEqual(
                str(analysis.get("executiveAmbiguousBucket") or ""),
                bucket,
                msg=question,
            )
            intent = analysis.get("intent") or {}
            goal = str(intent.get("primaryGoal") or "")
            self.assertTrue(
                goal
                in (
                    "executive_strategy",
                    "loss_profitability",
                    "executive_opportunity",
                    "executive_risk",
                    "executive_outlier_standout",
                    "compare",
                    "rank",
                ),
                msg=f"{question} primaryGoal={goal}",
            )
            cat = str(analysis.get("categoryColumn") or "").lower()
            self.assertNotEqual(cat, "product", msg=f"{question} should not default to product")

        loss_exact, loss_viz, loss_analysis = results["Where are we losing money?"]
        self.assertEqual(
            str(loss_analysis.get("metricColumn") or "").lower(),
            "profit",
            msg="loss question should chart profit",
        )
        self.assertIn("No loss-making rows", (loss_exact or "") + (loss_analysis.get("insightSummary") or ""))
        loss_title = str((loss_viz or {}).get("title") or "").lower()
        self.assertIn("profit", loss_title, msg=loss_title)

        strat_analysis = results["What should management focus on?"][2]
        improve_analysis = results["What should we improve?"][2]
        self.assertNotEqual(
            str(strat_analysis.get("executiveLens") or ""),
            str(improve_analysis.get("executiveLens") or ""),
        )
        loss_analysis = results["Where are we losing money?"][2]
        self.assertNotEqual(
            str(loss_analysis.get("metricColumn") or ""),
            str(strat_analysis.get("metricColumn") or ""),
        )

    def test_ranked_cards_match_lens(self) -> None:
        for question, _bucket, lens, terms in FIVE_QUESTIONS:
            _exact, viz, _analysis = self._run(question)
            ranked = (viz or {}).get("rankedExecutiveInsights") or []
            kinds = {str(c.get("kind") or "").lower() for c in ranked if isinstance(c, dict)}
            joined = " ".join(
                str(c.get("narrativeLine") or c.get("hint") or "")
                for c in ranked
                if isinstance(c, dict)
            ).lower()
            if lens == "loss":
                self.assertTrue(
                    kinds & {"risk", "ranking"},
                    msg=f"{question} kinds={kinds}",
                )
                self.assertIn("no loss", joined)
            if lens == "risk":
                self.assertTrue(
                    kinds & {"risk", "concentration"},
                    msg=f"{question} kinds={kinds}",
                )
            if lens == "opportunity":
                self.assertTrue(
                    kinds & {"opportunity", "gap", "concentration"},
                    msg=f"{question} kinds={kinds}",
                )
            if lens == "standout":
                self.assertTrue(
                    kinds & {"outlier", "concentration", "gap"},
                    msg=f"{question} kinds={kinds}",
                )
            if lens == "strategy":
                self.assertGreaterEqual(len(kinds), 2, msg=f"{question} kinds={kinds}")
            if terms:
                self.assertTrue(
                    any(t in joined for t in terms),
                    msg=f"{question} missing narrative terms in {joined[:200]}",
                )


if __name__ == "__main__":
    unittest.main()
