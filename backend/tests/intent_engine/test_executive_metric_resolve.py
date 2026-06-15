"""Executive lens metric resolution — schema-driven, cross-domain."""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = BACKEND_ROOT.parent / "test-fixtures" / "domains"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main as main_mod  # noqa: E402

from intent_engine.executive_metric_resolve import (  # noqa: E402
    apply_executive_metric_to_intent,
    resolve_executive_lens_metric_column,
)


def _profile(df: pd.DataFrame) -> dict:
    return main_mod.build_profile(df)


def _load_fixture(name: str) -> pd.DataFrame:
    return pd.read_csv(FIXTURES / name)


@pytest.mark.parametrize(
    "csv,question,lens,expected_substr",
    [
        ("marketing.csv", "Biggest marketing risk", "risk", "satisfaction"),
        ("geography.csv", "Biggest geographic risk", "risk", "revenue"),
        (
            "operations.csv",
            "Where is production loss concentrated?",
            "risk",
            "cost",
        ),
        (
            "operations.csv",
            "Executive summary of plant performance",
            "summary",
            "units_produced",
        ),
        (
            "customer_support.csv",
            "What are the biggest support risks?",
            "risk",
            "escalation",
        ),
        (
            "customer_support.csv",
            "Biggest support opportunity for leadership",
            "opportunity",
            "satisfaction",
        ),
        (
            "customer_support.csv",
            "Executive summary of support performance",
            "summary",
            "tickets_resolved",
        ),
        ("hr.csv", "What are the biggest workforce risks?", "risk", "attrition"),
        (
            "hr.csv",
            "Executive summary of workforce performance",
            "summary",
            "personnel_cost",
        ),
        (
            "healthcare.csv",
            "What are the biggest clinical operational risks?",
            "risk",
            "readmission",
        ),
        (
            "healthcare.csv",
            "Executive summary of regional performance",
            "summary",
            "cost",
        ),
    ],
)
def test_resolve_executive_lens_metric_column(
    csv: str, question: str, lens: str, expected_substr: str
) -> None:
    df = _load_fixture(csv)
    profile = _profile(df)
    col = resolve_executive_lens_metric_column(question, df, profile, lens=lens)
    assert col is not None
    assert expected_substr in str(col).lower()


def test_apply_executive_metric_to_intent_summary_bypasses_ambiguous_block() -> None:
    df = _load_fixture("operations.csv")
    profile = _profile(df)
    intent: dict = {"value_col": "downtime_hours", "group_col": "production_line"}
    assert apply_executive_metric_to_intent(
        "Executive summary of plant performance", df, profile, intent
    )
    assert "units_produced" in str(intent["value_col"]).lower()
