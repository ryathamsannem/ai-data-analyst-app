"""Column resolution helpers for intent engine."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

import pandas as pd


def _norm_col(name: str) -> str:
    return re.sub(r"[_\s]+", " ", str(name).lower()).strip()


def categorical_columns(columns: List[str], profile: Dict[str, Any]) -> List[str]:
    ct = profile.get("column_types", {}) if profile else {}
    out: List[str] = []
    for c in columns:
        t = ct.get(c)
        if t in ("date", "number"):
            continue
        out.append(c)
    return out


def numeric_columns(columns: List[str], profile: Dict[str, Any]) -> List[str]:
    ct = profile.get("column_types", {}) if profile else {}
    return [c for c in columns if ct.get(c) == "number"]


def column_matches_token(col: str, token: str) -> bool:
    cn = _norm_col(col)
    tok = token.replace("_", " ")
    if tok in cn or cn in tok:
        return True
    parts = tok.split()
    return all(p in cn for p in parts if len(p) > 2)


def find_column_for_token(
    token: str,
    columns: List[str],
    *,
    numeric_only: bool = False,
    profile: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    pool = columns
    if numeric_only and profile:
        pool = numeric_columns(columns, profile)

    token_l = token.lower().replace("_", " ")

    if token == "ad_spend":
        for c in pool:
            cn = _norm_col(c)
            if any(
                k in cn
                for k in (
                    "ad spend",
                    "adspend",
                    "advertising spend",
                    "ad cost",
                    "media spend",
                )
            ):
                return str(c)
            if cn in ("spend", "ad spend"):
                return str(c)
        return None

    if token == "revenue":
        for prefer in ("revenue", "sales", "gross sales", "total revenue"):
            for c in pool:
                if prefer in _norm_col(c):
                    return str(c)
        return None

    if token == "profit":
        for c in pool:
            cn = _norm_col(c)
            if "profit" in cn and "margin" not in cn:
                return str(c)
        return None

    if token == "spend":
        for c in pool:
            cn = _norm_col(c)
            if any(k in cn for k in ("spend", "cost", "budget")) and "ad" not in cn:
                return str(c)
        return None

    for c in pool:
        if column_matches_token(str(c), token_l):
            return str(c)
    return None


def resolve_decline_dimension_column(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
) -> Optional[str]:
    """category → product → best business categorical dimension."""
    columns = df.columns.tolist()
    ql = (question or "").lower()

    mention_order = [
        "category",
        "product",
        "region",
        "department",
        "channel",
        "segment",
        "campaign",
    ]
    for token in mention_order:
        if re.search(rf"\b{token}s?\b", ql):
            hit = find_column_for_token(token, columns, profile=profile)
            if hit:
                return hit

    fallback_order = ["category", "product", "region", "department", "channel", "segment"]
    for token in fallback_order:
        hit = find_column_for_token(token, columns, profile=profile)
        if hit:
            return hit

    cats = categorical_columns(columns, profile)
    if cats:
        scored: List[tuple[int, str]] = []
        for c in cats:
            score = 0
            cn = _norm_col(c)
            for i, pref in enumerate(reversed(fallback_order)):
                if pref in cn:
                    score += (i + 1) * 10
            scored.append((score, str(c)))
        scored.sort(reverse=True)
        if scored and scored[0][0] > 0:
            return scored[0][1]
        return str(cats[0])
    return None


def resolve_decline_metric_column(
    df: pd.DataFrame,
    profile: Dict[str, Any],
) -> Optional[str]:
    """Prefer revenue, then other core business numerics."""
    nums = numeric_columns(df.columns.tolist(), profile)
    for token in ("revenue", "sales", "profit", "amount", "orders"):
        hit = find_column_for_token(token, nums, numeric_only=True, profile=profile)
        if hit:
            return hit
    return str(nums[0]) if nums else None


def resolve_metric_columns_for_ids(
    metric_ids: List[str],
    df: pd.DataFrame,
    profile: Dict[str, Any],
) -> Dict[str, Optional[str]]:
    columns = df.columns.tolist()
    out: Dict[str, Optional[str]] = {}
    for mid in metric_ids:
        out[mid] = find_column_for_token(
            mid, columns, numeric_only=True, profile=profile
        )
    return out
