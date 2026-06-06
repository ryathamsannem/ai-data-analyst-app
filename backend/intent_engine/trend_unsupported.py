"""
Unsupported trend analysis — trend intent without enough time periods.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Optional

import pandas as pd

from intent_engine import legacy
from intent_engine.trend_date_resolve import (
    distinct_time_periods,
    pick_trend_date_column,
    question_requests_trend_intent,
)


def _recommended_action(question: str) -> str:
    ql = (question or "").lower()
    if re.search(r"\b(region|regions|zone|zones|territory)\b", ql):
        return "Add multiple periods per region/zone."
    if re.search(r"\bproduct\b", ql):
        return "Add multiple periods per product."
    return "Add multiple time periods per entity in your dataset."


def assess_unsupported_trend_for_api(
    *,
    question: str,
    df: Optional[pd.DataFrame],
    profile: Optional[Dict[str, Any]],
    trend_request_unsatisfied: bool,
    time_series_analysis: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """
    When the user asks for a trend but the cohort cannot support a time-series chart.
    """
    if not question_requests_trend_intent(question):
        return None

    date_col: Optional[str] = None
    periods = 0
    if df is not None and profile is not None:
        from intent_engine.trend_date_resolve import find_trend_date_column_candidate

        date_col = find_trend_date_column_candidate(df, profile, question)
        if date_col:
            periods = distinct_time_periods(df, date_col)

    ts = time_series_analysis if isinstance(time_series_analysis, dict) else {}
    ts_buckets = int(ts.get("uniqueBuckets") or 0) if ts else 0
    effective_periods = max(periods, ts_buckets)

    if effective_periods >= 2 and not trend_request_unsatisfied:
        return None
    if not date_col:
        reason = "No date column is available for trend analysis."
        reason_code = "no_date_column"
    elif effective_periods <= 1:
        reason = "Only one distinct time period exists."
        reason_code = "single_period"
    elif not trend_request_unsatisfied:
        return None
    else:
        reason = (
            "Time-series visualization could not be built from the available date column."
        )
        reason_code = "trend_unavailable"

    return {
        "active": True,
        "title": "Trend Analysis Not Available",
        "reason": reason,
        "requiredAction": _recommended_action(question),
        "periodsAvailable": int(max(0, effective_periods)),
        "status": "Insufficient Time-Series Data",
        "leadSentence": (
            "Trend analysis cannot be determined from the available data."
        ),
        "reasonCode": reason_code,
    }
