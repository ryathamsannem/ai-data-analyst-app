"""Forecast validation — can_forecast and guardrail payloads."""

from __future__ import annotations

import unittest

import pandas as pd

from intent_engine.forecast_guardrails import (
    UNRELIABLE_FORECAST_MESSAGE,
    ForecastDataset,
    assess_forecast_guardrails,
    can_forecast,
    question_requests_forecast_or_projection,
)


class TestForecastGuardrails(unittest.TestCase):
    def test_detects_forecast_question(self) -> None:
        self.assertTrue(
            question_requests_forecast_or_projection(
                "What is the revenue forecast next quarter?"
            )
        )

    def test_can_forecast_rejects_cross_sectional_snapshot(self) -> None:
        """8 rows, 4 zones, revenue — no time column."""
        df = pd.DataFrame(
            {
                "zone": ["North", "South", "East", "West"] * 2,
                "revenue": [100, 200, 150, 120, 110, 210, 140, 125],
            }
        )
        profile = {"column_types": {"zone": "category", "revenue": "number"}}
        result = can_forecast(ForecastDataset(df=df, profile=profile))
        self.assertFalse(result["canForecast"])
        self.assertIn("no_time_column", result["reasons"])

    def test_can_forecast_rejects_single_period(self) -> None:
        df = pd.DataFrame(
            {
                "order_date": ["2024-01-01"] * 8,
                "zone": ["North", "South", "East", "West"] * 2,
                "revenue": [100, 200, 150, 120, 110, 210, 140, 125],
            }
        )
        profile = {
            "column_types": {
                "order_date": "date",
                "zone": "category",
                "revenue": "number",
            }
        }
        result = can_forecast(ForecastDataset(df=df, profile=profile))
        self.assertFalse(result["canForecast"])
        self.assertIn("insufficient_periods", result["reasons"])

    def test_can_forecast_accepts_multi_period_series(self) -> None:
        df = pd.DataFrame(
            {
                "order_date": ["2024-01-01", "2024-02-01"] * 4,
                "zone": ["North", "South", "East", "West"] * 2,
                "revenue": [100, 200, 150, 120, 110, 210, 140, 125],
            }
        )
        profile = {
            "column_types": {
                "order_date": "date",
                "zone": "category",
                "revenue": "number",
            }
        }
        result = can_forecast(ForecastDataset(df=df, profile=profile))
        self.assertTrue(result["canForecast"])
        self.assertGreaterEqual(int(result["periodCount"]), 2)

    def test_projection_without_time_series(self) -> None:
        payload = assess_forecast_guardrails(
            "Forecast revenue for next year",
            {"column_types": {"zone": "category", "revenue": "number"}},
            df=pd.DataFrame(
                {
                    "zone": ["North", "South", "East", "West"],
                    "revenue": [100, 200, 150, 120],
                }
            ),
        )
        self.assertIsNotNone(payload)
        assert payload is not None
        self.assertFalse(payload["canForecast"])
        self.assertEqual(payload["outputLabel"], "Scenario estimate")
        self.assertEqual(payload["directionalProjectionLabel"], "Directional projection")
        self.assertEqual(payload["forecastConfidenceLevel"], "low")
        self.assertEqual(payload["reliabilityMessage"], UNRELIABLE_FORECAST_MESSAGE)
        self.assertTrue(payload["lacksTimeSeries"])

    def test_forecast_label_with_multi_period_data(self) -> None:
        df = pd.DataFrame(
            {
                "order_date": pd.date_range("2024-01-01", periods=6, freq="ME"),
                "revenue": [10, 12, 11, 13, 14, 15],
            }
        )
        profile = {"column_types": {"order_date": "date", "revenue": "number"}}
        payload = assess_forecast_guardrails(
            "Forecast revenue",
            profile,
            df=df,
        )
        self.assertIsNotNone(payload)
        assert payload is not None
        self.assertTrue(payload["canForecast"])
        self.assertEqual(payload["outputLabel"], "Forecast")
        self.assertFalse(payload["lacksTimeSeries"])


if __name__ == "__main__":
    unittest.main()
