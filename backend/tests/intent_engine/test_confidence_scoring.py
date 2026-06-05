"""Dynamic confidence scoring — component model, differentiated scores."""

from __future__ import annotations

import unittest

from intent_engine.confidence_scoring import (
    InsightConfidenceInput,
    calculate_insight_confidence,
    compute_insight_confidence_meta,
)


class TestConfidenceScoring(unittest.TestCase):
    def test_scores_differ_across_scenarios(self) -> None:
        large_ranking = calculate_insight_confidence(
            InsightConfidenceInput(
                row_count=1200,
                chart_point_count=8,
                mapping_confidence="high",
                intent_structured=True,
                analysis_kind="ranking",
                chart_type="bar",
            )
        )
        thin_corr = calculate_insight_confidence(
            InsightConfidenceInput(
                row_count=60,
                chart_point_count=12,
                mapping_confidence="medium",
                relationship_scatter=True,
                relationship_sample_size=5,
                analysis_kind="relationship_scatter",
                chart_type="scatter",
            )
        )
        growth_fail = calculate_insight_confidence(
            InsightConfidenceInput(
                row_count=400,
                chart_point_count=6,
                mapping_confidence="high",
                growth_request_unsatisfied=True,
                analysis_kind="ranking",
            )
        )
        s1 = large_ranking["score"]
        s2 = thin_corr["score"]
        s3 = growth_fail["score"]
        self.assertGreater(s1, s2)
        self.assertGreater(s2, s3)
        self.assertNotEqual(s1, s2)
        self.assertNotEqual(s2, s3)

    def test_no_fixed_low_38_for_moderate_cohort(self) -> None:
        meta = compute_insight_confidence_meta(
            45,
            4,
            "medium",
            intent_structured=True,
            analysis_kind="aggregation",
            chart_type="bar",
        )
        self.assertNotEqual(meta["insightConfidenceScore"], 38)
        self.assertIn(meta["insightConfidenceLevel"], ("low", "medium", "high"))

    def test_aggregation_large_cohort_high_band(self) -> None:
        meta = compute_insight_confidence_meta(
            250,
            6,
            "medium",
            intent_structured=True,
            analysis_kind="ranking",
            chart_type="bar",
        )
        self.assertGreaterEqual(meta["insightConfidenceScore"], 55)
        self.assertIn(meta["insightConfidenceLevel"], ("medium", "high"))
        reasons = meta.get("insightConfidenceReasons") or []
        self.assertGreaterEqual(len(reasons), 2)

    def test_correlation_small_sample_lower_than_ranking(self) -> None:
        ranking = compute_insight_confidence_meta(
            250,
            6,
            "medium",
            intent_structured=True,
            analysis_kind="ranking",
        )
        corr = compute_insight_confidence_meta(
            250,
            12,
            "medium",
            relationship_scatter=True,
            relationship_sample_size=5,
            analysis_kind="relationship_scatter",
            chart_type="scatter",
        )
        self.assertLess(corr["insightConfidenceScore"], ranking["insightConfidenceScore"])

    def test_forecast_projection_low(self) -> None:
        meta = compute_insight_confidence_meta(
            500,
            4,
            "high",
            forecast_projection_low=True,
        )
        self.assertEqual(meta["insightConfidenceLevel"], "low")
        self.assertLess(meta["insightConfidenceScore"], 50)
        joined = " ".join(meta.get("insightConfidenceReasons") or [])
        self.assertIn("Forecast", joined)

    def test_returns_score_band_reasons(self) -> None:
        out = calculate_insight_confidence(InsightConfidenceInput(row_count=100, chart_point_count=5))
        self.assertIn("score", out)
        self.assertIn("band", out)
        self.assertIn("reasons", out)
        self.assertIsInstance(out["reasons"], list)

    def test_rationale_no_dangling_single_letter_fragments(self) -> None:
        """Ranking alignment must append one reason string, not per-character tokens."""
        meta = compute_insight_confidence_meta(
            8,
            4,
            "medium",
            intent_structured=True,
            analysis_kind="ranking",
            chart_type="bar_horizontal",
        )
        rationale = str(meta.get("insightConfidenceRationale") or "")
        self.assertNotRegex(rationale, r";\s*R\.\s*$")
        self.assertNotIn("; a.", rationale)
        reasons = meta.get("insightConfidenceReasons") or []
        self.assertTrue(all(len(str(r)) > 1 for r in reasons), msg=reasons)
        joined = " ".join(str(r) for r in reasons).lower()
        self.assertIn("ranking question", joined)

    def test_dimension_redirect_month_style_medium_band(self) -> None:
        """Transparent redirect when requested breakdown column is missing."""
        meta = compute_insight_confidence_meta(
            13,
            3,
            "medium",
            intent_structured=True,
            analysis_kind="ranking",
            chart_type="horizontalBar",
            partial_visualization_warning=True,
            dimension_redirect_handled=True,
            requested_dimension_missing=True,
        )
        score = int(meta["insightConfidenceScore"])
        self.assertGreaterEqual(score, 55)
        self.assertLessEqual(score, 70)
        self.assertEqual(meta["insightConfidenceLevel"], "medium")
        joined = " ".join(meta.get("insightConfidenceReasons") or []).lower()
        self.assertIn("closest valid ranking", joined)
        self.assertFalse(meta.get("cautiousNarrativeRequired"))

    def test_horizontal_bar_api_chart_type_scores_like_internal(self) -> None:
        internal = calculate_insight_confidence(
            InsightConfidenceInput(
                row_count=13,
                chart_point_count=3,
                mapping_confidence="medium",
                intent_structured=True,
                analysis_kind="ranking",
                chart_type="bar_horizontal",
            )
        )
        api_form = calculate_insight_confidence(
            InsightConfidenceInput(
                row_count=13,
                chart_point_count=3,
                mapping_confidence="medium",
                intent_structured=True,
                analysis_kind="ranking",
                chart_type="horizontalBar",
            )
        )
        self.assertEqual(internal["score"], api_form["score"])

    def test_ranking_small_cohort_directional_low_band(self) -> None:
        meta = compute_insight_confidence_meta(
            8,
            4,
            None,
            intent_structured=True,
            analysis_kind="ranking",
            chart_type="bar",
        )
        score = int(meta["insightConfidenceScore"])
        self.assertGreaterEqual(score, 45)
        self.assertLessEqual(score, 60)
        self.assertIn(meta["insightConfidenceLevel"], ("low", "medium"))
        joined = " ".join(meta.get("insightConfidenceReasons") or []).lower()
        self.assertIn("ranking", joined)

    def test_small_scatter_rationale_mentions_joint_pairs(self) -> None:
        meta = compute_insight_confidence_meta(
            8,
            8,
            "medium",
            intent_structured=True,
            relationship_scatter=True,
            relationship_sample_size=7,
            analysis_kind="relationship_scatter",
            chart_type="scatter",
        )
        rationale = str(meta.get("insightConfidenceRationale") or "").lower()
        summary = str(meta.get("evidenceSummaryLine") or "").lower()
        self.assertTrue(
            "joint pair" in rationale or "joint pair" in summary,
            msg=f"expected joint-pair copy, got rationale={rationale!r} summary={summary!r}",
        )
        self.assertIn("directional", summary)
        self.assertLess(meta["insightConfidenceScore"], 70)


if __name__ == "__main__":
    unittest.main()
