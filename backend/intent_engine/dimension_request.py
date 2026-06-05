"""
Resolve dimension phrases named in questions against dataset columns — no hardcoded mappings.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd


def _phrase_refers_to_metric_column(
    phrase: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
    *,
    match_column,
) -> bool:
    if not phrase or df is None or df.empty:
        return False
    ct = profile.get("column_types", {}) if profile else {}
    numeric_cols = [str(c) for c in df.columns if ct.get(c) == "number"]
    if not numeric_cols:
        return False
    hit = match_column(phrase, numeric_cols, profile)
    if hit:
        return True
    alt = phrase.lower().replace(" ", "_")
    return bool(match_column(alt, numeric_cols, profile))


def extract_dimension_request_phrases(ql: str) -> List[str]:
    """Natural-language dimension tokens the user asked to break down by."""
    q = (ql or "").lower().strip()
    if not q:
        return []

    seen: set[str] = set()
    out: List[str] = []

    def _add(raw: str) -> None:
        phrase = re.sub(r"\s+", " ", (raw or "").strip().strip(".,;:?"))
        if not phrase or phrase in seen:
            return
        seen.add(phrase)
        out.append(phrase)

    m = re.search(
        r"\bwhich\s+([a-z0-9][a-z0-9_\s]{0,48}?)\s+(?:has|have|had|was|is|are|shows?)\b",
        q,
        re.I,
    )
    if m:
        _add(m.group(1).strip())

    for m in re.finditer(
        r"\bby\s+([a-z0-9][a-z0-9_\s%/\-]*?)(?=\s*(?:,|\.|;|\?|\)|$)|\s+vs\b|\s+versus\b|\s+compared\b)",
        q,
        re.I,
    ):
        chunk = m.group(1).strip()
        for part in re.split(r"\s+and\s+", chunk, flags=re.I):
            _add(part.strip().strip(",").strip())

    for m in re.finditer(
        r"\bacross\s+([a-z0-9][a-z0-9_\s]{0,32}?)(?=\s*(?:,|\.|;|\?|$|\bby\b|\bfor\b|\bin\b))",
        q,
        re.I,
    ):
        _add(m.group(1).strip())

    for m in re.finditer(
        r"\bper\s+([a-z0-9][a-z0-9_\s]{0,32}?)(?=\s*(?:,|\.|;|\?|$|\bby\b|\bfor\b|\bin\b))",
        q,
        re.I,
    ):
        _add(m.group(1).strip())

    return out


def phrase_is_time_bucket(phrase: str) -> bool:
    p = (phrase or "").lower().strip().replace("-", " ")
    if not p:
        return False
    if p in {
        "month",
        "monthly",
        "week",
        "weekly",
        "day",
        "daily",
        "quarter",
        "quarterly",
        "year",
        "yearly",
        "date",
        "time",
        "period",
        "timeline",
    }:
        return True
    return bool(re.search(r"\b(month[- ]wise|time series|over time)\b", p))


def resolve_phrase_to_column(
    phrase: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
    *,
    match_column,
    pick_date_column,
    dimension_pool,
) -> Optional[str]:
    if phrase_is_time_bucket(phrase):
        return pick_date_column(df, profile)
    cols = dimension_pool(df, profile)
    hit = match_column(phrase, cols or df.columns.tolist(), profile)
    if hit:
        return str(hit)
    alt = phrase.lower().replace(" ", "_")
    hit = match_column(alt, cols or df.columns.tolist(), profile)
    return str(hit) if hit else None


def first_unresolved_dimension_phrase(
    phrases: List[str],
    df: pd.DataFrame,
    profile: Dict[str, Any],
    *,
    match_column,
    pick_date_column,
    dimension_pool,
) -> Optional[str]:
    for phrase in phrases:
        if phrase_is_time_bucket(phrase):
            if not pick_date_column(df, profile):
                return phrase
            continue
        if not resolve_phrase_to_column(
            phrase,
            df,
            profile,
            match_column=match_column,
            pick_date_column=pick_date_column,
            dimension_pool=dimension_pool,
        ):
            return phrase
    return None


def question_requests_entity_performance_explanation(question: str) -> bool:
    q = (question or "").strip()
    if not q:
        return False
    return bool(
        re.search(r"\bexplain\b", q, re.I)
        and re.search(r"\bperformance\b", q, re.I)
    )


def find_categorical_entity_filter(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
) -> Optional[Tuple[str, str]]:
    """
    When the question names a categorical value present in the dataset (e.g. a city name),
    return (column, value) for cohort filtering.
    """
    if df is None or df.empty:
        return None
    ql = (question or "").lower()
    if not ql:
        return None

    ct = profile.get("column_types", {}) if profile else {}
    candidates: List[Tuple[int, str, str]] = []

    for col in df.columns.tolist():
        if ct.get(col) in ("number", "date"):
            continue
        try:
            values = df[col].dropna().astype(str).str.strip()
            values = values[values != ""].unique()
        except Exception:
            continue
        for val in values:
            token = str(val).strip()
            if len(token) < 3:
                continue
            if re.search(rf"\b{re.escape(token.lower())}\b", ql):
                candidates.append((len(token), str(col), token))

    if not candidates:
        return None
    candidates.sort(key=lambda t: (-t[0], t[1], t[2]))
    _, col, val = candidates[0]
    return col, val


def question_requests_executive_summary(question: str) -> bool:
    ql = (question or "").lower().strip()
    if not ql:
        return False
    patterns = (
        r"\bsummarize\b.*\b(?:business\s+)?performance\b",
        r"\bbusiness performance\b",
        r"\bbiggest growth opportunities\b",
        r"\bgrowth opportunities\b",
        r"\bwhat risks\b",
        r"\brisks do you see\b",
        r"\bexecutive summary\b",
    )
    return any(re.search(p, ql) for p in patterns)
