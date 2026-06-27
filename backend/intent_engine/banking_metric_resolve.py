"""Banking / financial-services metric resolution — avoid spend_amount fallback."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from intent_engine.column_resolve import (
    column_matches_token,
    find_column_for_token,
    numeric_columns,
)

_BANKING_METRIC_HINTS: Tuple[Tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bloan\s+balance\b|\bloan\s+portfolio\b", re.I), "loan balance"),
    (re.compile(r"\bdeposits?\b", re.I), "deposit balance"),
    (re.compile(r"\bdelinquency\b|\bdelinq\b", re.I), "delinquency rate"),
    (re.compile(r"\bnpl\b|non[- ]performing", re.I), "npl amount"),
    (
        re.compile(
            r"\b(?:credit\s+)?utilization\b|\butilization\s+(?:rate|pct|percentage|trend)\b",
            re.I,
        ),
        "utilization",
    ),
    (re.compile(r"\bcredit\s+utilization\b|\butilization\s+rate\b", re.I), "credit utilization"),
    (re.compile(r"\binterest\s+income\b", re.I), "interest income"),
    (re.compile(r"\bcredit\s+risk\b|\bportfolio\s+risk\b", re.I), "npl amount"),
    (re.compile(r"\bportfolio\s+opportunity\b|\bbiggest\s+portfolio\b", re.I), "interest income"),
    (re.compile(r"\bbranch\s+performance\b", re.I), "deposit balance"),
    (re.compile(r"\bwhat\s+should\s+the\s+cro\b|\bcro\s+focus\b", re.I), "npl amount"),
    (re.compile(r"\bspend\s+category\b|\bspending\s+breakdown\b", re.I), "spend amount"),
)

_SPEND_AMOUNT_COL = "spend_amount"


def question_mentions_spend(q: str) -> bool:
    ql = str(q or "").lower()
    return bool(
        re.search(r"\bspend(?:ing)?\b", ql)
        or re.search(r"\bspend\s+amount\b", ql)
        or re.search(r"\bspend\s+category\b", ql)
    )


def resolve_banking_metric_column(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
) -> Optional[str]:
    """Map banking vocabulary in the question to the correct numeric column."""
    if df is None or df.empty:
        return None
    ql = str(question or "").strip()
    if not ql:
        return None

    cols = df.columns.tolist()
    nums = numeric_columns(cols, profile)
    if not nums:
        return None

    has_banking_cols = any(
        any(k in str(c).lower() for k in ("loan_balance", "npl", "delinquency", "deposit"))
        for c in nums
    )
    if not has_banking_cols:
        return None

    for pattern, token in _BANKING_METRIC_HINTS:
        if not pattern.search(ql):
            continue
        hit = find_column_for_token(token, cols, numeric_only=True, profile=profile)
        if hit and str(hit) in nums:
            return str(hit)

    return None


def penalize_spend_amount_fallback(question: str, column: str) -> bool:
    """True when spend_amount should not be chosen for this question."""
    if str(column).lower() != _SPEND_AMOUNT_COL:
        return False
    if question_mentions_spend(question):
        return False
    ql = str(question or "").lower()
    return bool(
        re.search(
            r"\b(loan|deposit|delinquency|npl|credit\s+utilization|interest\s+income|portfolio)\b",
            ql,
        )
    )
