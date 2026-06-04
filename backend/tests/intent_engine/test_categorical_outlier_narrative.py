"""
Categorical outlier narrative — peer median distance and suggested phrasing.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from intent_engine.categorical_outlier_narrative import (
    categorical_outlier_prompt_block,
    compute_categorical_outlier_insights,
    format_categorical_outlier_context,
)

GEO_CSV = BACKEND_ROOT / "tests" / "fixtures" / "geographic_performance.csv"


class TestCategoricalOutlierNarrative(unittest.TestCase):
    def test_zone_revenue_outliers_material_phrases(self) -> None:
        rows = [
            {"name": "South", "value": 548000.0},
            {"name": "West", "value": 392000.0},
            {"name": "North", "value": 338000.0},
            {"name": "East", "value": 116000.0},
        ]
        insights = compute_categorical_outlier_insights(
            rows, dimension_label="region", metric_label="Total Revenue"
        )
        self.assertIsNotNone(insights)
        phrases = " ".join(insights.get("suggestedPhrases") or [])
        self.assertIn("materially above", phrases)
        self.assertIn("materially below", phrases)
        self.assertIn("South", phrases)
        self.assertIn("East", phrases)
        self.assertIn("peer region", phrases.lower())

        ctx = format_categorical_outlier_context(insights)
        self.assertIn("vs median", ctx.lower())
        self.assertIn("median", ctx.lower())
        self.assertNotIn("highest and lowest", ctx.lower())
        self.assertIn("South appears materially above", ctx)

        block = categorical_outlier_prompt_block(insights)
        self.assertIn("peer median", block.lower())

    def test_geographic_outlier_question_includes_narrative_context(self) -> None:
        import main as main_mod

        df = pd.read_csv(GEO_CSV)
        main_mod.df = df
        main_mod.dataset_profile = main_mod.build_profile(df)
        exact, visualization, analysis = main_mod.compute_visualization_for_question(
            "Are there geographic outliers?"
        )
        self.assertIsNotNone(visualization)
        coi = visualization.get("categoricalOutlierInsights")
        self.assertIsInstance(coi, dict)
        phrases = " ".join(coi.get("suggestedPhrases") or [])
        self.assertIn("materially", phrases.lower())
        self.assertIn("South", phrases)
        self.assertIn("East", phrases)
        er = (exact or "") + str(analysis.get("insightSummary") or "")
        self.assertIn("materially", er.lower())
        self.assertIn("median", er.lower())
        anchor = main_mod.build_visualization_anchor_for_prompt(visualization)
        self.assertIn("materially above", anchor)
        self.assertNotIn("[", anchor.split("Chart values")[-1][:20])


if __name__ == "__main__":
    unittest.main()
