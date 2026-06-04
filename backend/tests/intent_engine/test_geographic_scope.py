"""
Regression tests — geographic scope (region vs city reasoning drift).
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

FIXTURE_CSV = BACKEND_ROOT / "tests" / "fixtures" / "geographic_performance.csv"

REGION_QUESTIONS = [
    "Which region is underperforming?",
    "Which region performs best?",
    "Compare regions",
    "Compare revenue across regions",
    "Which region has the lowest revenue?",
]

CITY_QUESTION = "Which city has the lowest revenue?"

CITY_RANKING_QUESTIONS = [
    "Top city",
    "Highest revenue city",
    "Best performing city",
    "Top Performing City",
    "City ranking",
]

from intent_engine.geographic_scope import (
    geographic_context_sample_rows,
    geographic_scope_prompt_block,
    question_geographic_scope_level,
    resolve_geographic_group_column,
)


class TestGeographicScope(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.df = pd.read_csv(FIXTURE_CSV)
        import main as main_mod

        cls.main = main_mod
        cls.main.df = cls.df
        cls.main.dataset_profile = cls.main.build_profile(cls.df)
        cls.profile = cls.main.dataset_profile

    def test_region_questions_detect_region_scope(self) -> None:
        for q in REGION_QUESTIONS:
            with self.subTest(question=q):
                self.assertEqual(question_geographic_scope_level(q), "region")

    def test_region_questions_prefer_zone_over_city(self) -> None:
        for q in REGION_QUESTIONS:
            with self.subTest(question=q):
                gcol = resolve_geographic_group_column(q, self.df, self.profile)
                self.assertEqual(gcol, "zone")

    def test_city_question_detects_city_scope(self) -> None:
        self.assertEqual(question_geographic_scope_level(CITY_QUESTION), "city")
        gcol = resolve_geographic_group_column(
            CITY_QUESTION, self.df, self.profile
        )
        self.assertEqual(gcol, "city")

    def test_context_sample_aggregates_at_zone_for_region_questions(self) -> None:
        q = "Which region is underperforming?"
        rows = geographic_context_sample_rows(
            self.df, self.profile, q, max_rows=8
        )
        self.assertGreaterEqual(len(rows), 2)
        self.assertIn("zone", rows[0])
        zones = {str(r.get("zone", "")).strip() for r in rows}
        self.assertTrue(zones.issubset({"South", "West", "North", "East"}))
        for r in rows:
            self.assertNotIn("city", r)

    def test_geographic_prompt_block_forbids_city_drift(self) -> None:
        block = geographic_scope_prompt_block(
            "Compare revenue across regions", "zone", self.profile
        )
        self.assertIn("region-level", block.lower())
        self.assertIn("do not introduce", block.lower())
        self.assertIn("Jaipur", block)  # bad example in prompt

    def test_city_ranking_questions_prefer_city_over_zone(self) -> None:
        for q in CITY_RANKING_QUESTIONS:
            with self.subTest(question=q):
                self.assertEqual(question_geographic_scope_level(q), "city")
                gcol = resolve_geographic_group_column(q, self.df, self.profile)
                self.assertEqual(gcol, "city")

    def test_city_ranking_charts_use_city_labels(self) -> None:
        zone_labels = {"South", "West", "North", "East"}
        for q in CITY_RANKING_QUESTIONS[:4]:
            with self.subTest(question=q):
                _exact, visualization, analysis = (
                    self.main.compute_visualization_for_question(q)
                )
                self.assertIsNotNone(visualization, msg=f"chart for {q!r}")
                labels = visualization.get("labels") or []
                self.assertGreaterEqual(len(labels), 2)
                for lab in labels:
                    self.assertNotIn(
                        lab,
                        zone_labels,
                        msg=f"zone label {lab!r} for city question {q!r}",
                    )
                self.assertIn("Mumbai", labels)
                prov = (visualization.get("provenance") or {}) if visualization else {}
                cat = prov.get("categoryColumn") or analysis.get("categoryColumn")
                if cat:
                    self.assertEqual(str(cat).lower(), "city")

    def test_compute_visualization_groups_region_questions_by_zone(self) -> None:
        for q in REGION_QUESTIONS[:3]:
            with self.subTest(question=q):
                _exact, visualization, analysis = (
                    self.main.compute_visualization_for_question(q)
                )
                intent = analysis.get("intent") or {}
                group_col = (
                    intent.get("geographic_scope_column")
                    or intent.get("group_col")
                    or analysis.get("categoryColumn")
                )
                if group_col:
                    self.assertEqual(str(group_col).lower(), "zone")
                self.assertIsNotNone(visualization, msg=f"chart for {q!r}")
                labels = visualization.get("labels") or []
                self.assertGreaterEqual(len(labels), 2)
                for lab in labels:
                    self.assertIn(
                        lab,
                        {"South", "West", "North", "East"},
                        msg=f"unexpected city-level label {lab!r}",
                    )


if __name__ == "__main__":
    unittest.main()
