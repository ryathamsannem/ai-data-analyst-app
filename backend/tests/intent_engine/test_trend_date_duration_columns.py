"""Trend date resolution — exclude duration columns from calendar hints."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from intent_engine.trend_date_resolve import (  # noqa: E402
    date_column_named_in_question,
    find_trend_date_column_candidate,
)


class TestTrendDateDurationColumns(unittest.TestCase):
    def test_month_hint_prefers_calendar_month_not_account_age(self) -> None:
        df = pd.read_csv(
            Path(BACKEND_ROOT).parent
            / "test-fixtures"
            / "golden-datasets"
            / "banking_gold_10000.csv"
        )
        import main as m

        profile = m.build_profile(df)
        cols = df.columns.tolist()
        named = date_column_named_in_question(
            "Show utilization trend by month", cols, profile
        )
        self.assertEqual(named, "month")
        picked = find_trend_date_column_candidate(
            df, profile, "How does utilization trend over month?"
        )
        self.assertEqual(picked, "month")


if __name__ == "__main__":
    unittest.main()
