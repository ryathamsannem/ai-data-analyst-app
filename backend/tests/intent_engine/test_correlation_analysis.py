"""Pearson + Spearman correlation classification and pair resolution."""

from __future__ import annotations

import unittest

import pandas as pd

from intent_engine.correlation_analysis import (
    MIN_PEARSON_SAMPLE,
    NEAR_PERFECT_CORRELATION_CAUTION,
    classify_pearson_r,
    compute_bivariate_correlations,
    compute_relationship_correlations,
    enrich_relationship_insights,
    interpret_correlation_magnitude,
    is_near_perfect_correlation,
    near_perfect_correlation_detected,
    pearson_sample_adequate,
    resolve_relationship_numeric_pair,
)


class TestCorrelationAnalysis(unittest.TestCase):
    def test_magnitude_bands(self) -> None:
        self.assertEqual(interpret_correlation_magnitude(0.1), "Very Weak")
        self.assertEqual(interpret_correlation_magnitude(0.3), "Weak")
        self.assertEqual(interpret_correlation_magnitude(0.5), "Moderate")
        self.assertEqual(interpret_correlation_magnitude(0.7), "Strong")
        self.assertEqual(interpret_correlation_magnitude(0.9), "Very Strong")

    def test_classify_signed_strength(self) -> None:
        self.assertEqual(
            classify_pearson_r(0.85)["correlationLabel"], "Very Strong Positive"
        )
        self.assertEqual(classify_pearson_r(0.45)["correlationLabel"], "Moderate Positive")
        self.assertEqual(
            classify_pearson_r(0.1)["correlationLabel"], "Very Weak Positive"
        )
        self.assertEqual(
            classify_pearson_r(-0.5)["correlationLabel"], "Moderate Negative"
        )

    def test_compute_bivariate_pearson_and_spearman(self) -> None:
        x = pd.Series([1.0, 2.0, 3.0, 4.0, 5.0])
        y = pd.Series([2.0, 4.0, 5.0, 4.0, 5.0])
        stats = compute_bivariate_correlations(x, y)
        self.assertTrue(stats["canCompute"])
        self.assertIsNotNone(stats["pearson"])
        self.assertIsNotNone(stats["spearman"])
        self.assertEqual(stats["sampleSize"], 5)

    def test_near_perfect_correlation_flag(self) -> None:
        self.assertTrue(is_near_perfect_correlation(0.99))
        self.assertTrue(is_near_perfect_correlation(-0.985))
        self.assertFalse(is_near_perfect_correlation(0.9))
        out = enrich_relationship_insights(
            {"pearson": 0.99, "spearman": 0.98, "canCompute": True},
            x_label="Metric A",
            y_label="Metric B",
            n=20,
        )
        self.assertTrue(out.get("nearPerfectCorrelation"))
        self.assertIn("near-perfect", str(out.get("nearPerfectCorrelationCaution", "")).lower())
        self.assertTrue(near_perfect_correlation_detected(0.99, None))

    def test_enrich_adds_sample_warning(self) -> None:
        out = enrich_relationship_insights(
            {"pearson": 0.62, "spearman": 0.58, "canCompute": True},
            x_label="Revenue",
            y_label="Profit",
            n=4,
        )
        self.assertEqual(out["correlationStrength"], "Strong")
        self.assertTrue(out.get("correlationSampleWarning"))
        self.assertFalse(pearson_sample_adequate(4))
        self.assertTrue(pearson_sample_adequate(MIN_PEARSON_SAMPLE))

    def test_resolve_pair_customers_synonym(self) -> None:
        df = pd.DataFrame(
            {
                "customers": [10, 20, 30, 40],
                "revenue": [100, 200, 300, 400],
                "zone": ["A", "B", "C", "D"],
            }
        )
        profile = {
            "column_types": {
                "customers": "number",
                "revenue": "number",
                "zone": "category",
            }
        }
        pair = resolve_relationship_numeric_pair(
            "Is customer count correlated with revenue?", df, profile
        )
        self.assertIsNotNone(pair)
        assert pair is not None
        self.assertEqual(set(pair), {"customers", "revenue"})

    def test_resolve_pair_correlated_with_phrase(self) -> None:
        df = pd.DataFrame(
            {
                "customer_count": [10, 20, 30, 40],
                "revenue": [100, 200, 300, 400],
                "region": ["A", "B", "C", "D"],
            }
        )
        profile = {
            "column_types": {
                "customer_count": "number",
                "revenue": "number",
                "region": "category",
            }
        }
        pair = resolve_relationship_numeric_pair(
            "Is customer count correlated with revenue?", df, profile
        )
        self.assertIsNotNone(pair)
        assert pair is not None
        self.assertEqual(set(pair), {"customer_count", "revenue"})

    def test_compute_insufficient_sample_qualitative_only(self) -> None:
        df = pd.DataFrame({"x": [1.0], "y": [2.0]})
        ins = compute_relationship_correlations(df, "x", "y")
        self.assertTrue(ins.get("qualitativeOnly"))
        self.assertIsNone(ins.get("pearson"))


if __name__ == "__main__":
    unittest.main()
