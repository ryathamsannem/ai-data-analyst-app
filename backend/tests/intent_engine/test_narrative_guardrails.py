"""Regression tests for narrative guardrails (unsupported metrics, phrase bans)."""

from __future__ import annotations

import unittest
from pathlib import Path

import pandas as pd

from intent_engine.narrative_guardrails import (
    assess_unsupported_requested_metric,
    detect_missing_requested_metrics,
    forbidden_narrative_phrases,
    narrative_guardrails_prompt_block,
    sanitize_narrative_answer,
)


def _retail_df() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "city": ["Delhi", "Mumbai"],
            "revenue": [100.0, 80.0],
            "profit": [10.0, 8.0],
        }
    )


def _marketing_df() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "channel": ["Paid Search", "Paid Social"],
            "revenue": [100.0, 90.0],
            "conversions": [50, 40],
        }
    )


def _geography_df() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "city": ["Delhi", "Mumbai"],
            "revenue": [100.0, 80.0],
        }
    )


def _banking_df() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "region": ["North", "South"],
            "deposit_balance": [1000.0, 900.0],
            "report_date": ["2024-01-01", "2024-02-01"],
        }
    )


class NarrativeGuardrailsTests(unittest.TestCase):
    def test_retail_conversion_rate_missing(self):
        df = _retail_df()
        q = "Compare conversion rate across cities"
        missing = detect_missing_requested_metrics(q, df, {})
        self.assertTrue(any(m["id"] == "conversion_rate" for m in missing))
        block = narrative_guardrails_prompt_block(
            question=q, df=df, profile={}, analysis_ctx={}
        )
        self.assertIn("limitation-first", block.lower())
        self.assertIn("conversion rate", block.lower())

    def test_marketing_nps_missing(self):
        df = _marketing_df()
        q = "Compare NPS across channels"
        missing = detect_missing_requested_metrics(q, df, {})
        self.assertTrue(any(m["id"] == "nps" for m in missing))
        sanitized = sanitize_narrative_answer(
            "NPS is not available but Paid Search leads revenue.", df, {}, q
        )
        self.assertNotIn("nps", sanitized.lower())

    def test_geography_salesperson_missing(self):
        df = _geography_df()
        q = "Compare sales by salesperson across cities"
        missing = detect_missing_requested_metrics(q, df, {})
        self.assertTrue(any(m["id"] == "salesperson" for m in missing))
        sanitized = sanitize_narrative_answer(
            "The salesperson dimension is missing from this dataset.", df, {}, q
        )
        self.assertNotIn("salesperson", sanitized.lower())

    def test_banking_nim_missing(self):
        df = _banking_df()
        q = "Compare net interest margin trend by quarter"
        missing = detect_missing_requested_metrics(q, df, {})
        ids = {m["id"] for m in missing}
        self.assertIn("nim", ids)
        self.assertIn("quarter", ids)

    def test_finance_ebitda_margin_missing(self):
        path = (
            Path(__file__).resolve().parents[3]
            / "test-fixtures"
            / "domains"
            / "finance_fpa.csv"
        )
        df = pd.read_csv(path)
        q = "Compare EBITDA margin trend by quarter"
        missing = detect_missing_requested_metrics(q, df, {})
        ids = {m["id"] for m in missing}
        self.assertIn("ebitda_margin", ids)
        gap = assess_unsupported_requested_metric(
            question=q, df=df, profile={}, analysis_ctx={"metricColumn": "deposit_balance"}
        )
        self.assertTrue(gap and gap.get("active"))

    def test_executive_risk_no_market_penetration_after_sanitize(self):
        df = _retail_df()
        raw = (
            "Executive takeaway: Market penetration is concentrated in Delhi. "
            "Top evidence: Delhi revenue leads."
        )
        out = sanitize_narrative_answer(raw, df, {}, "What are the biggest risks?")
        self.assertNotIn("market penetration", out.lower())
        self.assertIn("revenue concentration", out.lower())

    def test_marketing_ranking_no_clv_after_sanitize(self):
        df = _marketing_df()
        raw = "Paid Search leads; consider improving customer lifetime value."
        out = sanitize_narrative_answer(raw, df, {}, "Rank channels by revenue")
        self.assertNotIn("customer lifetime value", out.lower())
        self.assertNotIn("clv", out.lower())

    def test_forbidden_phrases_include_market_penetration_for_retail(self):
        df = _retail_df()
        forbidden = forbidden_narrative_phrases(df, {})
        self.assertIn("market penetration", forbidden)

    def test_limitation_lead_for_missing_conversion_rate(self):
        df = _retail_df()
        gap = assess_unsupported_requested_metric(
            question="Compare conversion rate across cities",
            df=df,
            profile={},
            analysis_ctx={"metricColumn": "revenue"},
        )
        self.assertIn("the requested conversion-rate column", gap["leadSentence"])
        self.assertNotIn("an the", gap["leadSentence"].lower())
        raw = "Delhi leads on revenue in the fallback chart."
        out = sanitize_narrative_answer(
            raw, df, {}, "Compare conversion rate across cities", gap
        )
        self.assertIn("does not include", out.lower())
        self.assertNotIn("conversion rate", out.lower())
        self.assertNotIn("an the", out.lower())


if __name__ == "__main__":
    unittest.main()
