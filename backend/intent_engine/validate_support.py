"""Validate whether the cohort can support the detected intent (facade)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import pandas as pd

from intent_engine import legacy
from intent_engine.decline_intent import assess_decline_time_series_support
from intent_engine.multi_metric_intent import missing_operand_reason_codes


def validate_analysis_support(
    *,
    question: str,
    df: Optional[pd.DataFrame],
    profile: Optional[Dict[str, Any]],
    primary_goal: str,
    intent_debug: Optional[Dict[str, Any]] = None,
    chart_type_internal: str = "bar",
    chart_points: int = 0,
    time_series_analysis: Optional[Dict[str, Any]] = None,
    unsupported_growth_analysis: Optional[Dict[str, Any]] = None,
    dimension_column: Optional[str] = None,
    missing_metric_operands: Optional[List[str]] = None,
) -> Dict[str, Any]:
    reason_codes: List[str] = []
    supported = True
    growth_meta = None
    trend_meta: Dict[str, Any] = {"satisfied": True}
    margin_meta: Dict[str, Any] = {"available": True}
    decline_meta: Optional[Dict[str, Any]] = None
    multi_metric_meta: Optional[Dict[str, Any]] = None

    if primary_goal == "multi_metric_comparison":
        missing = list(missing_metric_operands or [])
        multi_metric_meta = {"missingOperands": missing, "requestedResolved": not missing}
        if missing:
            supported = False
            for code in missing_operand_reason_codes(missing):
                if code not in reason_codes:
                    reason_codes.append(code)

    if primary_goal == "decline" and df is not None and profile is not None:
        dim = dimension_column
        if intent_debug and intent_debug.get("group_col"):
            dim = dim or str(intent_debug.get("group_col"))
        ok, decline_reasons, decline_meta = assess_decline_time_series_support(
            question=question,
            df=df,
            profile=profile,
            dimension_col=dim,
            time_series_analysis=time_series_analysis,
        )
        if not ok:
            supported = False
            for code in decline_reasons:
                if code not in reason_codes:
                    reason_codes.append(code)

    if unsupported_growth_analysis and unsupported_growth_analysis.get("active"):
        supported = False
        reason_codes.append(
            str(unsupported_growth_analysis.get("reasonCode") or "growth_unsupported")
        )
        growth_meta = {
            "active": True,
            "periodsAvailable": int(
                unsupported_growth_analysis.get("periodsAvailable") or 0
            ),
            "status": unsupported_growth_analysis.get("status"),
            "reasonCode": unsupported_growth_analysis.get("reasonCode"),
        }
    elif (
        primary_goal != "decline"
        and df is not None
        and profile is not None
        and legacy.question_requests_growth_intent(question)
    ):
        assessed = legacy.assess_unsupported_growth_analysis(
            question=question,
            df=df,
            profile=profile,
            chart_type_internal=chart_type_internal,
            chart_points=chart_points,
            intent_debug=intent_debug,
            time_series_analysis=time_series_analysis,
        )
        if assessed and assessed.get("active"):
            supported = False
            code = str(assessed.get("reasonCode") or "growth_unsupported")
            if code not in reason_codes:
                reason_codes.append(code)
            growth_meta = {
                "active": True,
                "periodsAvailable": int(assessed.get("periodsAvailable") or 0),
                "status": assessed.get("status"),
                "reasonCode": assessed.get("reasonCode"),
            }

    if legacy.question_requests_profit_margin(question):
        if intent_debug and intent_debug.get("derived_profit_margin"):
            margin_meta = {"available": True}
        elif df is not None and profile is not None:
            profit_c, rev_c = legacy.find_profit_and_revenue_columns(
                df.columns.tolist(),
                [
                    c
                    for c in df.columns
                    if profile.get("column_types", {}).get(c) == "number"
                ],
            )
            if profit_c and not rev_c:
                margin_meta = {
                    "available": False,
                    "unavailableReason": "missing_revenue_column",
                }
                if primary_goal == "derived_metric":
                    supported = False
                    reason_codes.append("margin_no_revenue")
        else:
            margin_meta = {"available": False, "unavailableReason": "no_cohort"}

    if legacy.question_requests_trend_intent(question) and df is not None and profile:
        date_col = legacy.pick_date_column_for_trend(df, profile)
        bucket = legacy.forced_time_bucket_from_question(question)
        trend_meta = {
            "satisfied": bool(date_col),
            "dateColumn": str(date_col) if date_col else None,
            "bucket": bucket,
        }
        if not date_col and primary_goal == "trend":
            supported = False
            reason_codes.append("trend_no_date_column")

    if intent_debug is None and primary_goal not in (
        "unsupported_analysis",
        "kpi",
        "decline",
        "multi_metric_comparison",
        "relationship",
        "driver",
    ):
        if df is None or (df is not None and df.empty):
            supported = False
            reason_codes.append("no_aggregate_intent")

    return {
        "supported": supported,
        "reasonCodes": reason_codes,
        "growth": growth_meta,
        "trend": trend_meta,
        "margin": margin_meta,
        "decline": decline_meta,
        "multiMetric": multi_metric_meta,
    }
