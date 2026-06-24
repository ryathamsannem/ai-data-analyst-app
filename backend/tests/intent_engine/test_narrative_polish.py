"""Regression tests for executive and follow-up narrative polish."""

from __future__ import annotations

import unittest

from intent_engine.narrative_guardrails import assess_unsupported_requested_metric
from intent_engine.narrative_polish import (
    apply_micro_polish,
    dataset_supports_quarter_wording,
    executive_narrative_prompt_block,
    fix_duplicate_requested_phrase,
    fix_limitation_wording,
    follow_up_narrative_prompt_block,
    is_executive_narrative_question,
    normalize_executive_sections,
    polish_narrative_answer,
    sanitize_unsupported_quarter_wording,
)
import pandas as pd


class NarrativePolishTests(unittest.TestCase):
    def test_executive_prompt_requires_takeaway_label(self):
        block = executive_narrative_prompt_block(
            "What are the biggest risks?", {}
        )
        self.assertIn("Executive takeaway:", block)
        self.assertIn("120", block)
        self.assertIn("Do NOT use Key findings", block)

    def test_normalize_key_findings_to_executive_format(self):
        raw = (
            "Key findings:\nDelhi leads revenue.\n\n"
            "What this may indicate:\nConcentration risk.\n\n"
            "Suggested next steps:\nMonitor Delhi."
        )
        out = normalize_executive_sections(raw)
        self.assertTrue(out.startswith("Executive takeaway:"))
        self.assertIn("Evidence:", out)
        self.assertIn("Recommended action:", out)
        self.assertNotIn("Key findings", out)

    def test_executive_polish_stays_concise(self):
        long_body = " ".join(["fact"] * 250)
        raw = f"Key findings:\n{long_body}"
        out = polish_narrative_answer(
            raw,
            question="Biggest marketing risk",
            analysis_ctx={"executiveAmbiguousBucket": "executive_risk"},
            executive=True,
        )
        self.assertLessEqual(len(out.split()), 200)

    def test_follow_up_columns_used_prompt(self):
        block = follow_up_narrative_prompt_block(
            "Which columns were used for this analysis?",
            sidecar={
                "wasFollowUp": True,
                "originalFollowUp": "Which columns were used for this analysis?",
                "rootQuestion": "Which city generates the highest revenue?",
                "previousAnalysisSummary": "Total revenue by city",
            },
            analysis_ctx={"metricColumn": "revenue", "categoryColumn": "city"},
        )
        self.assertIn("prior chart", block.lower())
        self.assertIn("revenue", block)

    def test_follow_up_calculations_opener(self):
        sidecar = {
            "wasFollowUp": True,
            "originalFollowUp": "Show the calculations behind this answer.",
            "previousAnalysisSummary": "Total revenue by city",
        }
        out = polish_narrative_answer(
            "Metric: revenue. Dimension: city. Aggregation: sum.",
            question="Show the calculations behind this answer.",
            analysis_ctx={"metricColumn": "revenue", "categoryColumn": "city"},
            sidecar=sidecar,
        )
        low = out.lower()
        self.assertIn("based on the previous", low)
        self.assertIn("revenue", low)
        self.assertIn("city", low)

    def test_follow_up_columns_opener(self):
        sidecar = {
            "wasFollowUp": True,
            "originalFollowUp": "Which columns were used for this analysis?",
            "previousAnalysisSummary": "Total revenue by city",
        }
        out = polish_narrative_answer(
            "revenue and city columns with sum aggregation.",
            question="Which columns were used for this analysis?",
            analysis_ctx={"metricColumn": "revenue", "categoryColumn": "city"},
            sidecar=sidecar,
        )
        self.assertIn("For the prior chart", out)

    def test_limitation_wording_no_an_the(self):
        bad = "This dataset does not include an the requested NPS column."
        fixed = fix_limitation_wording(bad)
        self.assertNotIn("an the", fixed.lower())

    def test_negative_limitation_lead_grammar(self):
        df = pd.DataFrame({"revenue": [1.0], "city": ["A"]})
        gap = assess_unsupported_requested_metric(
            question="Compare NPS across channels",
            df=df,
            profile={},
            analysis_ctx={},
        )
        lead = gap["leadSentence"] if gap else ""
        self.assertIn("the requested NPS column", lead)
        self.assertNotIn("an the", lead.lower())
        self.assertNotIn("an NPS", lead)

    def test_is_executive_detects_risk_question(self):
        self.assertTrue(
            is_executive_narrative_question("What are the biggest risks?", {})
        )

    def test_no_duplicate_the_requested_phrase(self):
        raw = (
            "This dataset does not include the requested the requested "
            "NPS column, so comparison is unsupported."
        )
        out = fix_duplicate_requested_phrase(raw)
        self.assertNotIn("the requested the requested", out.lower())
        self.assertIn("the requested", out.lower())

    def test_apply_micro_polish_collapses_duplicate_requested(self):
        df = pd.DataFrame({"revenue": [1.0], "city": ["A"]})
        raw = "Missing the requested the requested win-rate column."
        out = apply_micro_polish(raw, df, {}, {})
        self.assertNotIn("the requested the requested", out.lower())

    def test_quarter_removed_when_column_absent(self):
        df = pd.DataFrame(
            {"report_date": ["2024-01-01"], "revenue": [100.0]},
        )
        self.assertFalse(dataset_supports_quarter_wording(df, {}, {}))
        raw = "Data is monthly, not by quarter; quarterly trend unavailable."
        out = sanitize_unsupported_quarter_wording(raw, df, {}, {})
        self.assertNotRegex(out.lower(), r"\bquarter\b")
        self.assertNotIn("quarterly", out.lower())

    def test_fraction_three_quarters_preserved_when_quarter_sanitized(self):
        df = pd.DataFrame({"report_date": ["2024-01-01"], "loan_balance": [100.0]})
        raw = "Corporate holds nearly three-quarters of total loan balance."
        out = sanitize_unsupported_quarter_wording(raw, df, {}, {})
        self.assertIn("three-quarters", out.lower())
        self.assertNotIn("three-time period", out.lower())

    def test_fix_malformed_hedging_could_may(self):
        from intent_engine.narrative_polish import fix_malformed_hedging

        raw = "This could may be consistent with regional concentration."
        out = fix_malformed_hedging(raw)
        self.assertNotIn("could may", out.lower())
        self.assertIn("may be consistent with", out.lower())

    def test_fix_fraction_quarter_corruption(self):
        from intent_engine.narrative_polish import fix_fraction_quarter_corruption

        raw = "Corporate holds nearly three-time period of total loan balance."
        out = fix_fraction_quarter_corruption(raw)
        self.assertIn("three-quarters", out.lower())
        self.assertNotIn("three-time period", out.lower())

    def test_why_followup_trim_stays_concise(self):
        from intent_engine.narrative_polish import trim_why_followup_prose

        long = " ".join(["word"] * 200)
        out = trim_why_followup_prose(long, max_words=130)
        self.assertLessEqual(len(out.split()), 130)

    def test_quarter_kept_when_derived_quarter_bucket(self):
        df = pd.DataFrame({"report_date": ["2024-01-01"], "revenue": [100.0]})
        ctx = {"timeSeriesMeta": {"timeBucket": "Q"}}
        self.assertTrue(dataset_supports_quarter_wording(df, {}, ctx))
        raw = "Revenue rose in Q2 versus Q1."
        out = sanitize_unsupported_quarter_wording(raw, df, {}, ctx)
        self.assertIn("Q2", out)


if __name__ == "__main__":
    unittest.main()
