"""Unit tests for executive business lens detection and cards."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from intent_engine.executive_lens import (  # noqa: E402
    build_lens_specific_insights,
    detect_executive_lens,
    merge_lens_insights,
)

FIXTURE_CSV = BACKEND_ROOT / "tests" / "fixtures" / "retail_analytics_regression.csv"


class TestExecutiveLensDetection(unittest.TestCase):
    def test_detects_distinct_lenses(self) -> None:
        self.assertEqual(detect_executive_lens("What are the biggest opportunities?"), "opportunity")
        self.assertEqual(detect_executive_lens("What are the biggest risks?"), "risk")
        self.assertEqual(detect_executive_lens("Summarize business performance"), "summary")
        self.assertEqual(detect_executive_lens("What drives revenue the most?"), "driver")
        self.assertEqual(detect_executive_lens("What explains Mumbai's performance?"), "explain")

    def test_risk_not_opportunity_when_both_words(self) -> None:
        self.assertEqual(
            detect_executive_lens("What are the risks and not opportunities?"),
            "risk",
        )


class TestExecutiveLensCards(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import main as main_mod

        cls.main = main_mod
        cls.df = pd.read_csv(FIXTURE_CSV)
        cls.profile = cls.main.build_profile(cls.df)

    def test_opportunity_and_risk_cards_differ(self) -> None:
        opp = build_lens_specific_insights(
            self.df,
            self.profile,
            question="What are the biggest opportunities?",
            lens="opportunity",
        )
        risk = build_lens_specific_insights(
            self.df,
            self.profile,
            question="What are the biggest risks?",
            lens="risk",
        )
        opp_kinds = {str(x.get("kind")) for x in opp}
        risk_kinds = {str(x.get("kind")) for x in risk}
        self.assertTrue(opp_kinds & {"opportunity"})
        self.assertTrue(risk_kinds & {"risk", "concentration"})
        self.assertNotEqual(opp_kinds, risk_kinds)

    def test_opportunity_cards_avoid_unscoped_customer_claims(self) -> None:
        opp = build_lens_specific_insights(
            self.df,
            self.profile,
            question="What are the biggest opportunities?",
            lens="opportunity",
            metric_col="revenue",
            dimension_col="region",
        )
        narratives = " ".join(
            str(x.get("narrativeLine") or x.get("hint") or "") for x in opp
        ).lower()
        self.assertNotIn("high customers but lower revenue", narratives)
        if "customer" in narratives:
            self.assertTrue(
                "rank" in narratives or "among peers" in narratives,
                msg="customer mention should be scoped, not assumed",
            )

    def test_merge_boosts_lens_relevant_cards(self) -> None:
        base = [
            {"kind": "ranking", "priority": 50, "narrativeLine": "leader ranks first"},
            {"kind": "concentration", "priority": 50, "narrativeLine": "share is high"},
        ]
        lens_cards = [
            {
                "kind": "opportunity",
                "priority": 80,
                "narrativeLine": "growth upside segment",
            }
        ]
        merged = merge_lens_insights(base, lens_cards, lens="opportunity")
        self.assertEqual(merged[0]["kind"], "opportunity")


if __name__ == "__main__":
    unittest.main()
