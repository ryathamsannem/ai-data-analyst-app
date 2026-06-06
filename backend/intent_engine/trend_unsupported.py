"""
Unsupported trend analysis — trend intent without enough time periods.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Optional

import pandas as pd

from intent_engine import legacy


def _pick_date_column_local(
    df: pd.DataFrame, profile: Optional[Dict[str, Any]]
) -> Optional[str]:
    ct = profile.get("column_types", {}) if profile else {}
    date_cols = [c for c in df.columns if ct.get(c) == "date"]
    if date_cols:
        return str(date_cols[0])
    for c in df.columns:
        cl = str(c).lower().replace(" ", "_")
        if any(h in cl for h in ("order_date", "date", "period", "month", "time")):
            return str(c)
    return None


def _distinct_periods_local(df: pd.DataFrame, date_col: str) -> int:
    try:
        s = pd.to_datetime(df[date_col], errors="coerce")
        valid = s.dropna()
        if valid.empty:
            return 0
        return int(valid.dt.normalize().nunique())
    except Exception:
        return 0


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
    if not legacy.question_requests_trend_intent(question):
        return None

    date_col: Optional[str] = None
    periods = 0
    if df is not None and profile is not None:
        date_col = _pick_date_column_local(df, profile)
        if date_col:
            periods = _distinct_periods_local(df, date_col)

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
