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
        "periods",
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
    pool = cols or df.columns.tolist()
    try:
        from intent_engine.column_resolve import resolve_dimension_phrase_to_column

        hit = resolve_dimension_phrase_to_column(phrase, pool, profile)
        if hit:
            return str(hit)
    except Exception:
        pass
    hit = match_column(phrase, pool, profile)
    if hit:
        return str(hit)
    alt = phrase.lower().replace(" ", "_")
    hit = match_column(alt, pool, profile)
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
        re.search(r"\bexplains?\b", q, re.I)
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
    try:
        from intent_engine.executive_lens import question_requests_executive_summary as _exec

        return _exec(question)
    except Exception:
        return False


def _column_name_is_entity_peer_level(col: str) -> bool:
    cn = str(col).lower().replace("_", " ")
    return any(t in cn for t in ("city", "metro", "market", "store", "branch"))


def resolve_entity_explain_chart_plan(
    entity_col: str,
    entity_val: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Entity explain routing:
    - peer_compare: benchmark entity against peers on its own column (e.g. city vs cities)
    - cohort_breakdown: filter to entity rows, break down by another dimension
    """
    if df is None or df.empty or not entity_col or entity_col not in df.columns:
        return {"mode": "cohort_breakdown", "group_col": None, "use_full_cohort": False}

    try:
        peer_n = int(df[entity_col].nunique(dropna=True))
    except Exception:
        peer_n = 0

    if _column_name_is_entity_peer_level(entity_col) and peer_n >= 2:
        return {
            "mode": "peer_compare",
            "group_col": str(entity_col),
            "use_full_cohort": True,
            "entity_column": str(entity_col),
            "entity_value": str(entity_val),
        }

    breakdown = pick_entity_cohort_breakdown_column(
        df[df[entity_col].astype(str).str.strip() == str(entity_val).strip()],
        profile,
        exclude_columns=[entity_col],
    )
    return {
        "mode": "cohort_breakdown",
        "group_col": breakdown,
        "use_full_cohort": False,
        "entity_column": str(entity_col),
        "entity_value": str(entity_val),
    }


def pick_entity_cohort_breakdown_column(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    *,
    exclude_columns: Optional[List[str]] = None,
    min_unique: int = 2,
) -> Optional[str]:
    """
    Pick a categorical breakdown within a filtered entity cohort (e.g. products within a city).
    """
    if df is None or df.empty:
        return None
    ct = profile.get("column_types", {}) if profile else {}
    skip = {str(c).lower() for c in (exclude_columns or [])}
    scored: List[Tuple[int, str]] = []
    for col in df.columns.tolist():
        if str(col).lower() in skip:
            continue
        if ct.get(col) in ("number", "date"):
            continue
        try:
            nu = int(df[col].nunique(dropna=True))
        except Exception:
            continue
        if nu < min_unique or nu > 40:
            continue
        cn = str(col).lower().replace("_", " ")
        score = min(nu, 12)
        if any(t in cn for t in ("product", "category", "segment", "channel")):
            score += 24
        elif any(t in cn for t in ("region", "zone", "city")):
            score += 12
        scored.append((score, str(col)))
    if not scored:
        return None
    scored.sort(key=lambda t: (-t[0], t[1]))
    return scored[0][1]


_METRIC_TAIL_RE = re.compile(
    r"\s+(?:"
    r"revenue|sales|profit|spend|spending|cost|units|customers?|deposits?|"
    r"balance|income|growth(?:\s+rate)?|utilization|conversions?|impressions?"
    r")\s*$",
    re.I,
)

_CONCENTRATION_RE = re.compile(
    r"\b("
    r"concentrat(?:ed|ion)?|overly\s+concentrat|dominat(?:e|ion)?|"
    r"dependency|revenue\s+share|share\s+by"
    r")\b",
    re.I,
)

_RANK_DIM_RE = re.compile(
    r"\brank(?:ing)?\s+([a-z0-9][a-z0-9_\s]{0,32}?)\s+by\b",
    re.I,
)


def extract_rank_dimension_phrase(question: str) -> Optional[str]:
    """Dimension token from 'rank {dim} by {metric}' phrasing."""
    m = _RANK_DIM_RE.search(str(question or ""))
    return m.group(1).strip() if m else None


def question_requests_concentration_analysis(question: str) -> bool:
    return bool(_CONCENTRATION_RE.search(str(question or "")))


def phrase_is_metric_not_dimension(
    phrase: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
    *,
    match_column,
) -> bool:
    """True when a breakdown phrase names a numeric metric column, not a grouping dimension."""
    return _phrase_refers_to_metric_column(phrase, df, profile, match_column=match_column)


def filter_dimension_request_phrases(
    phrases: List[str],
    df: pd.DataFrame,
    profile: Dict[str, Any],
    *,
    match_column,
) -> List[str]:
    """Drop metric-only phrases extracted from 'by revenue' style tails."""
    out: List[str] = []
    for phrase in phrases:
        if phrase_is_metric_not_dimension(phrase, df, profile, match_column=match_column):
            continue
        out.append(phrase)
    return out


def _strip_trailing_metric_phrase(text: str) -> str:
    return _METRIC_TAIL_RE.sub("", str(text or "").strip()).strip()


_METRIC_SIDE_RE = re.compile(
    r"\b("
    r"revenue|sales|profit|spend(?:ing)?|cost|margin|balance|deposit|loan|"
    r"income|utilization|conversion|impression|customer|unit|ad\s+spend|adspend"
    r")\b",
    re.I,
)


def _phrase_looks_like_metric_side(text: str) -> bool:
    """True when a vs-clause side names a metric rather than a dimension value."""
    t = str(text or "").strip()
    if not t:
        return True
    return bool(_METRIC_SIDE_RE.search(t))


def _value_in_column(df: pd.DataFrame, col: str, token: str) -> Optional[str]:
    if df is None or df.empty or col not in df.columns or not token:
        return None
    want = str(token).strip().lower()
    if len(want) < 2:
        return None
    try:
        values = df[col].dropna().astype(str).str.strip()
    except Exception:
        return None
    for val in values.unique():
        if str(val).strip().lower() == want:
            return str(val).strip()
    return None


def find_dimension_value_compare(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """
    When the user compares two categorical values (e.g. Mumbai vs Bengaluru),
    return the shared dimension column and the matched values.
    """
    if df is None or df.empty:
        return None
    ql = str(question or "").strip()
    if not ql:
        return None
    if not re.search(r"\bvs\.?\b|\bversus\b", ql, re.I):
        return None

    m = re.search(
        r"\b(?:compare\s+)?(.+?)\s+vs\.?\s+(.+?)(?:\s*[\?\.]|$)",
        ql,
        re.I,
    )
    if not m:
        return None

    left = _strip_trailing_metric_phrase(m.group(1).strip())
    right = _strip_trailing_metric_phrase(m.group(2).strip())
    if not left or not right:
        return None

    if _phrase_looks_like_metric_side(left) or _phrase_looks_like_metric_side(right):
        return None

    ct = profile.get("column_types", {}) if profile else {}
    best: Optional[Tuple[int, str, List[str]]] = None

    for col in df.columns.tolist():
        if ct.get(col) in ("number", "date"):
            continue
        v1 = _value_in_column(df, str(col), left)
        v2 = _value_in_column(df, str(col), right)
        if v1 and v2:
            score = len(v1) + len(v2)
            if best is None or score > best[0]:
                best = (score, str(col), [v1, v2])

    if not best:
        return None
    _, group_col, values = best
    return {"group_col": group_col, "values": values}


def question_requests_dimension_value_compare(
    question: str,
    df: Optional[pd.DataFrame] = None,
    profile: Optional[Dict[str, Any]] = None,
) -> bool:
    if df is not None and profile is not None:
        return find_dimension_value_compare(question, df, profile) is not None
    ql = str(question or "").lower()
    if not re.search(r"\bvs\.?\b|\bversus\b", ql):
        return False
    m = re.search(
        r"\b(?:compare\s+)?(.+?)\s+vs\.?\s+(.+?)(?:\s*[\?\.]|$)",
        ql,
        re.I,
    )
    if not m:
        return False
    left = _strip_trailing_metric_phrase(m.group(1).strip()).lower()
    right = _strip_trailing_metric_phrase(m.group(2).strip()).lower()
    if not left or not right or len(left) < 2 or len(right) < 2:
        return False
    if _phrase_looks_like_metric_side(left) or _phrase_looks_like_metric_side(right):
        return False
    return True
