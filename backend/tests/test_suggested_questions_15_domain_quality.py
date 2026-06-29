"""15-domain suggested question quality regression (Phase 1 backend)."""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
FIXTURE_DIR = REPO_ROOT / "test-fixtures" / "domain_upload_1k"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
from intent_engine.suggested_questions_engine import _normalize_question_key  # noqa: E402
from services.file_parsers import load_dataframe_from_upload  # noqa: E402

DOMAIN_FIXTURES = [
    "retail_ecommerce_1k.csv",
    "banking_financial_1k.csv",
    "hr_workforce_1k.csv",
    "healthcare_patient_1k.csv",
    "manufacturing_quality_1k.csv",
    "marketing_campaign_1k.csv",
    "saas_subscription_1k.csv",
    "supply_chain_logistics_1k.csv",
    "education_student_1k.csv",
    "insurance_claims_1k.csv",
    "real_estate_property_1k.csv",
    "telecom_usage_1k.csv",
    "hospitality_bookings_1k.csv",
    "energy_utilization_1k.csv",
    "support_tickets_1k.csv",
]

GENERIC_BUSINESS_RE = re.compile(
    r"\bbiggest business (risks|opportunity)\b", re.I
)
FLAG_METRIC_RE = re.compile(
    r"\b(attrition flag|fraud flag|churn flag|delinquency flag|escalation flag)\b", re.I
)
TEMPORAL_COMPARE_RE = re.compile(
    r"\bcompare\b.+\bacross months\b|\bacross report month\b|\bacross billing month\b",
    re.I,
)
ID_DIM_RE = re.compile(
    r"\b(order id|employee id|account id|patient id|ticket id|subscriber id|property id|claim id)\b",
    re.I,
)
WEAK_CORRELATION_RE = re.compile(
    r"\bcorrelat\w*\s+with\s+(attrition flag|fraud flag|churn flag|flag)\b", re.I
)

DOMAIN_NOUN_HINTS: dict[str, tuple[str, ...]] = {
    "retail_ecommerce_1k.csv": ("retail",),
    "banking_financial_1k.csv": ("portfolio", "banking"),
    "hr_workforce_1k.csv": ("workforce",),
    "healthcare_patient_1k.csv": ("patient care", "clinical"),
    "manufacturing_quality_1k.csv": ("operations",),
    "marketing_campaign_1k.csv": ("marketing",),
    "saas_subscription_1k.csv": ("subscription", "saas"),
    "supply_chain_logistics_1k.csv": ("logistics",),
    "education_student_1k.csv": ("student outcomes", "education"),
    "insurance_claims_1k.csv": ("claims",),
    "real_estate_property_1k.csv": ("property",),
    "telecom_usage_1k.csv": ("subscriber", "telecom"),
    "hospitality_bookings_1k.csv": ("hospitality",),
    "energy_utilization_1k.csv": ("energy",),
    "support_tickets_1k.csv": ("customer support", "support", "csat"),
}


def _bind_fixture(filename: str) -> list[str]:
    raw = (FIXTURE_DIR / filename).read_bytes()
    df, _ = load_dataframe_from_upload(raw, filename)
    df = main.clean_dataframe(df)
    for col in df.columns:
        cl = str(col).lower()
        if "date" in cl or cl in ("month", "report_month", "billing_month"):
            df[col] = pd.to_datetime(df[col], errors="coerce")
    main.df = df
    main.dataset_profile = main.build_profile(df)
    main.column_mapping.clear()
    prop, _meta = main.compute_semantic_column_mapping(df, main.dataset_profile)
    for k, v in prop.items():
        main.column_mapping[k] = v
    try:
        return main.build_suggested_questions()
    finally:
        main.df = None
        main.dataset_profile = None


class TestSuggestedQuestions15DomainQuality(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.by_fixture: dict[str, list[str]] = {
            fn: _bind_fixture(fn) for fn in DOMAIN_FIXTURES
        }

    def test_all_fixtures_produce_six_questions(self) -> None:
        for fn, qs in self.by_fixture.items():
            with self.subTest(fixture=fn):
                self.assertEqual(len(qs), 6, qs)

    def test_no_duplicate_normalized_questions(self) -> None:
        for fn, qs in self.by_fixture.items():
            with self.subTest(fixture=fn):
                keys = [_normalize_question_key(q) for q in qs]
                self.assertEqual(len(keys), len(set(keys)), qs)

    def test_no_generic_business_executive_wording(self) -> None:
        for fn, qs in self.by_fixture.items():
            with self.subTest(fixture=fn):
                joined = " ".join(qs)
                self.assertIsNone(
                    GENERIC_BUSINESS_RE.search(joined),
                    joined,
                )

    def test_no_flag_metric_wording(self) -> None:
        for fn, qs in self.by_fixture.items():
            with self.subTest(fixture=fn):
                joined = " ".join(qs)
                self.assertIsNone(FLAG_METRIC_RE.search(joined), joined)

    def test_no_temporal_breakdown_compare(self) -> None:
        for fn, qs in self.by_fixture.items():
            with self.subTest(fixture=fn):
                for q in qs:
                    self.assertIsNone(
                        TEMPORAL_COMPARE_RE.search(q),
                        q,
                    )

    def test_no_id_columns_as_business_dimensions(self) -> None:
        for fn, qs in self.by_fixture.items():
            with self.subTest(fixture=fn):
                joined = " ".join(qs)
                self.assertIsNone(ID_DIM_RE.search(joined), joined)

    def test_no_weak_flag_correlation(self) -> None:
        for fn, qs in self.by_fixture.items():
            with self.subTest(fixture=fn):
                for q in qs:
                    self.assertIsNone(WEAK_CORRELATION_RE.search(q), q)

    def test_domain_aware_executive_nouns(self) -> None:
        for fn, hints in DOMAIN_NOUN_HINTS.items():
            qs = self.by_fixture[fn]
            joined = " ".join(qs).lower()
            with self.subTest(fixture=fn):
                self.assertTrue(
                    any(h in joined for h in hints),
                    f"expected one of {hints} in {joined}",
                )

    def test_banking_keeps_portfolio_and_utilization(self) -> None:
        qs = self.by_fixture["banking_financial_1k.csv"]
        joined = " ".join(qs).lower()
        self.assertIn("portfolio", joined)
        self.assertTrue(
            "utilization" in joined or "credit utilization" in joined,
            joined,
        )

    def test_marketing_keeps_marketing_wording(self) -> None:
        qs = self.by_fixture["marketing_campaign_1k.csv"]
        joined = " ".join(qs).lower()
        self.assertIn("marketing", joined)

    def test_manufacturing_keeps_operations_wording(self) -> None:
        qs = self.by_fixture["manufacturing_quality_1k.csv"]
        joined = " ".join(qs).lower()
        self.assertIn("operations", joined)

    def test_hr_avoids_attrition_flag(self) -> None:
        qs = self.by_fixture["hr_workforce_1k.csv"]
        joined = " ".join(qs).lower()
        self.assertNotIn("attrition flag", joined)
        self.assertTrue(
            "salary" in joined or "department" in joined,
            joined,
        )

    def test_support_uses_natural_csat_wording(self) -> None:
        qs = self.by_fixture["support_tickets_1k.csv"]
        joined = " ".join(qs).lower()
        self.assertNotIn("which priority has the highest csat score", joined)
        self.assertTrue(
            "csat" in joined or "resolution" in joined or "customer support" in joined,
            joined,
        )

    def test_retail_prefers_profit_over_quantity_leakage(self) -> None:
        qs = self.by_fixture["retail_ecommerce_1k.csv"]
        joined = " ".join(qs).lower()
        self.assertNotIn("compare quantity across", joined)
        self.assertNotIn("discount percentage trend", joined)


if __name__ == "__main__":
    unittest.main()
