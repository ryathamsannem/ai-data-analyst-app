"""
Reusable trend intent detection and date-column resolution for time-series routing.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

# Preferred date column name tokens (first match wins when equally eligible).
DATE_COLUMN_HINTS: Tuple[str, ...] = (
    "order_date",
    "order date",
    "report_date",
    "report date",
    "transaction_date",
    "transaction date",
    "created_date",
    "created date",
    "created_at",
    "invoice_date",
    "invoice date",
    "timestamp",
    "period",
    "month",
    "year",
    "date",
)

DATE_PHRASE_ALIASES: Dict[str, Tuple[str, ...]] = {
    "report date": ("report_date", "date", "order_date", "period"),
    "report_date": ("report_date", "date", "order_date", "period"),
    "order date": ("order_date", "report_date", "date"),
    "order_date": ("order_date", "report_date", "date"),
    "transaction date": ("transaction_date", "order_date", "report_date", "date"),
    "created date": ("created_date", "created_at", "date"),
    "period": ("report_date", "order_date", "date", "period"),
    "periods": ("report_date", "order_date", "date", "period"),
    "month": ("report_date", "order_date", "date", "month"),
    "date": ("report_date", "order_date", "date"),
}


def _norm_col(name: str) -> str:
    return re.sub(r"[_\s]+", " ", str(name).lower()).strip()


def question_requests_trend_intent(q: str) -> bool:
    """True when the user asks for a time-series view (not a category ranking)."""
    ql = (q or "").lower().strip()
    if not ql:
        return False
    if any(
        k in ql
        for k in (
            "trend",
            "over time",
            "over period",
            "over periods",
            "time series",
            "timeseries",
            "timeline",
            "monthly",
            "month-wise",
            "month wise",
            "by month",
            "each month",
            "every month",
            "per month",
            "weekly",
            "by week",
            "daily",
            "by day",
            "quarterly",
            "by quarter",
            "yearly",
            "by year",
            "show trend",
            "incident trend",
            "momentum",
        )
    ):
        return True
    if re.search(r"\b(change[sd]?|evolv(?:e|ed|ing))\s+over\s+time\b", ql):
        return True
    if re.search(r"\bhow\s+(?:has|did|have)\s+.+\s+change[sd]?\s+over\s+time\b", ql):
        return True
    if re.search(r"\btrack\b.+\bover\s+periods?\b", ql):
        return True
    return bool(
        re.search(
            r"\b(by|per)\s+(day|date|week|month|year|quarter|period|periods|report\s+date|report_date)\b",
            ql,
        )
    )


def _datetime_parse_ratio(s: pd.Series) -> float:
    if s is None or s.empty:
        return 0.0
    non_null = s.dropna()
    if non_null.empty:
        return 0.0
    try:
        dt = pd.to_datetime(non_null, errors="coerce", format="mixed")
    except TypeError:
        dt = pd.to_datetime(non_null.astype(str).str.strip(), errors="coerce")
    return float(dt.notna().mean())


def group_column_is_time_series_eligible(df: pd.DataFrame, group_col: str) -> bool:
    """True when the column mostly parses as datetimes with at least two distinct times."""
    if df is None or df.empty or group_col not in df.columns:
        return False
    s = df[group_col]
    if _datetime_parse_ratio(s) < 0.6:
        return False
    try:
        dt = pd.to_datetime(s, errors="coerce", format="mixed")
    except TypeError:
        dt = pd.to_datetime(s, errors="coerce")
    return int(dt.dropna().nunique()) >= 2


def distinct_time_periods(df: pd.DataFrame, date_col: str) -> int:
    try:
        s = pd.to_datetime(df[date_col], errors="coerce")
        valid = s.dropna()
        if valid.empty:
            return 0
        return int(valid.dt.normalize().nunique())
    except Exception:
        return 0


def _date_columns_from_profile(columns: List[str], profile: Dict[str, Any]) -> List[str]:
    ct = profile.get("column_types", {}) if profile else {}
    out: List[str] = []
    for c in columns:
        if ct.get(c) == "date" and c not in out:
            out.append(str(c))
    return out


def _column_name_looks_temporal(col: str) -> bool:
    cn = _norm_col(str(col))
    tokens = (
        "date",
        "time",
        "period",
        "month",
        "year",
        "timestamp",
        "created",
        "report",
        "order",
        "transaction",
        "invoice",
    )
    return any(tok in cn for tok in tokens)


def _infer_date_like_columns(df: pd.DataFrame, profile: Dict[str, Any]) -> List[str]:
    if df is None or df.empty:
        return []
    ct = profile.get("column_types", {}) if profile else {}
    out: List[str] = []
    for c in df.columns.tolist():
        cs = str(c)
        if ct.get(cs) == "number" and not _column_name_looks_temporal(cs):
            continue
        if group_column_is_time_series_eligible(df, cs):
            out.append(cs)
    return out


def _column_matches_hint(col: str, hint: str) -> bool:
    cn = _norm_col(col).replace(" ", "_")
    h = _norm_col(hint).replace(" ", "_")
    return h == cn or h in cn or cn in h


def date_column_named_in_question(
    question: str,
    columns: List[str],
    profile: Dict[str, Any],
) -> Optional[str]:
    ql = _norm_col(question or "")
    if not ql:
        return None
    for phrase, aliases in DATE_PHRASE_ALIASES.items():
        if re.search(rf"\b{re.escape(phrase.replace('_', ' '))}\b", ql) or phrase.replace(" ", "_") in ql:
            for alias in aliases:
                for col in columns:
                    if _column_matches_hint(str(col), alias):
                        return str(col)
    return None


def find_trend_date_column_candidate(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    question: Optional[str] = None,
) -> Optional[str]:
    """Return the best date column candidate, even when only one period exists."""
    if df is None or df.empty:
        return None

    columns = df.columns.tolist()
    ct = profile.get("column_types", {}) if profile else {}
    if question:
        named = date_column_named_in_question(question, columns, profile)
        if named and named in columns:
            return named

    candidates: List[str] = []
    for hint in DATE_COLUMN_HINTS:
        for col in columns:
            cs = str(col)
            if cs in candidates:
                continue
            if _column_matches_hint(cs, hint):
                candidates.append(cs)

    for col in _date_columns_from_profile(columns, profile):
        if col not in candidates:
            candidates.append(col)

    for col in _infer_date_like_columns(df, profile):
        if col not in candidates:
            candidates.append(col)

    for col in candidates:
        if ct.get(col) == "number" and not _column_name_looks_temporal(str(col)):
            continue
        if _datetime_parse_ratio(df[col]) >= 0.6:
            return col
    return None


def pick_trend_date_column(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    question: Optional[str] = None,
) -> Optional[str]:
    """Best date/datetime column for trend charts (requires 2+ distinct periods)."""
    col = find_trend_date_column_candidate(df, profile, question)
    if col and group_column_is_time_series_eligible(df, col):
        return col
    return None
