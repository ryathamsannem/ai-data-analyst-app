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
        self.assertIn(meta["insightConfidenceLevel"], ("low", "medium"))

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


if __name__ == "__main__":
    unittest.main()
