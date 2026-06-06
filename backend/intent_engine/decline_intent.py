"""Decline intent metric/dimension plane and support assessment."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from intent_engine import legacy
from intent_engine.column_resolve import (
    resolve_decline_dimension_column,
    resolve_decline_metric_column,
)
from intent_engine.question_patterns import question_requests_entity_decline


def build_decline_metric_dimension(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
) -> Dict[str, Any]:
    dim_col = resolve_decline_dimension_column(question, df, profile)
    metric_col = resolve_decline_metric_column(df, profile)

    metric: Dict[str, Any] = {
        "kind": "column",
        "columnKey": metric_col,
        "displayLabel": legacy.pretty_label_text(metric_col) if metric_col else "—",
        "aggregation": {"key": "sum", "label": "Total"},
    }
    dimension = {
        "columnKey": dim_col,
        "displayLabel": legacy.pretty_label_text(dim_col) if dim_col else "—",
        "secondaryColumnKey": None,
        "resolvedVia": _dimension_resolution_note(question, dim_col),
    }
    return {"metric": metric, "dimension": dimension}


def _dimension_resolution_note(question: str, dim_col: Optional[str]) -> Optional[str]:
    if not dim_col:
        return None
    ql = (question or "").lower()
    if "category" in ql and "category" not in dim_col.lower():
        return "category_column_missing_used_product_fallback"
    return None


def assess_decline_time_series_support(
    *,
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
    dimension_col: Optional[str],
    time_series_analysis: Optional[Dict[str, Any]] = None,
) -> Tuple[bool, List[str], Dict[str, Any]]:
    """
    Decline ranking requires multi-period evidence per entity — not a static snapshot.
    """
    meta: Dict[str, Any] = {"satisfied": False}
    reasons: List[str] = []

    if not question_requests_entity_decline(question):
        return True, reasons, {"satisfied": True, "skipped": True}

    if df is None or df.empty:
        return False, ["insufficient_time_series"], meta

    ts = time_series_analysis if isinstance(time_series_analysis, dict) else {}
    ts_buckets = int(ts.get("uniqueBuckets") or 0) if ts else 0
    if ts_buckets >= 2 and ts.get("grain"):
        meta["satisfied"] = True
        meta["periodsAvailable"] = ts_buckets
        meta["source"] = "time_series_analysis"
        return True, reasons, meta

    date_col = legacy.pick_date_column_for_trend(df, profile)
    meta["dateColumn"] = str(date_col) if date_col else None

    if date_col:
        try:
            ser = pd.to_datetime(df[date_col], errors="coerce")
            meta["periodsAvailable"] = int(ser.dropna().dt.normalize().nunique())
        except Exception:
            meta["periodsAvailable"] = 0

    if dimension_col and dimension_col in df.columns and date_col:
        try:
            per_entity = df.groupby(dimension_col)[date_col].apply(
                lambda s: pd.to_datetime(s, errors="coerce")
                .dropna()
                .dt.normalize()
                .nunique()
            )
            meta["maxPeriodsPerEntity"] = int(per_entity.max()) if len(per_entity) else 0
        except Exception:
            meta["maxPeriodsPerEntity"] = 0

    reasons.append("insufficient_time_series")
    return False, reasons, meta


def build_decline_unsupported_payload(
    *,
    periods_available: int,
    reason_code: str,
    recommended_action: str,
) -> Dict[str, Any]:
    return {
        "active": True,
        "periodsAvailable": int(max(0, periods_available)),
        "status": "Insufficient Time-Series Data",
        "leadSentence": "Decline cannot be determined from the available data.",
        "recommendedAction": recommended_action,
        "reasonCode": reason_code,
    }


def _decline_recommended_action(
    question: str, dim_col: Optional[str]
) -> str:
    ql = (question or "").lower()
    dim = str(dim_col or "").lower()
    if "category" in ql or "category" in dim:
        return "Add multiple periods per category"
    if "region" in ql or "region" in dim:
        return "Add multiple periods per region"
    if "product" in ql or "product" in dim:
        return "Add multiple periods per product"
    return (
        "Add multiple order dates per entity to compare period-over-period decline"
    )


def assess_unsupported_decline_for_api(
    *,
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
    chart_type_internal: str = "bar",
    intent_debug: Optional[Dict[str, Any]] = None,
    time_series_analysis: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Entity-decline questions must not fall back to static category ranking charts.
    """
    if not question_requests_entity_decline(question):
        return None

    dim_col = resolve_decline_dimension_column(question, df, profile)
    if intent_debug and intent_debug.get("group_col"):
        dim_col = dim_col or str(intent_debug.get("group_col"))

    ok, reasons, meta = assess_decline_time_series_support(
        question=question,
        df=df,
        profile=profile,
        dimension_col=dim_col,
        time_series_analysis=time_series_analysis,
    )
    recommended = _decline_recommended_action(question, dim_col)

    if not ok:
        return build_decline_unsupported_payload(
            periods_available=int(meta.get("periodsAvailable") or 0),
            reason_code=reasons[0] if reasons else "insufficient_time_series",
            recommended_action=recommended,
        )

    ct = str(chart_type_internal or "").strip().lower()
    if ct in ("bar", "bar_horizontal", "horizontalbar", "pie", "donut", ""):
        periods = int(
            meta.get("periodsAvailable") or meta.get("maxPeriodsPerEntity") or 0
        )
        return build_decline_unsupported_payload(
            periods_available=periods,
            reason_code="category_snapshot",
            recommended_action=recommended,
        )

    return None
