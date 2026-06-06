"""Column resolution helpers for intent engine."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd


def _norm_col(name: str) -> str:
    return re.sub(r"[_\s]+", " ", str(name).lower()).strip()


def _singularize_dimension_phrase(phrase: str) -> str:
    p = _norm_col(phrase)
    if not p:
        return p
    if p.endswith("ies") and len(p) > 4:
        return p[:-3] + "y"
    if p.endswith("s") and not p.endswith("ss") and len(p) > 3:
        return p[:-1]
    return p


# Normalized phrase -> ordered column tokens (reusable across domains).
DIMENSION_PHRASE_ALIASES: Dict[str, Tuple[str, ...]] = {
    "category": ("category",),
    "categories": ("category",),
    "campaign": ("category", "campaign"),
    "campaigns": ("category", "campaign"),
    "department": ("department",),
    "departments": ("department",),
    "region": ("region", "zone", "territory"),
    "regions": ("region", "zone", "territory"),
    "product": ("product", "category"),
    "products": ("product", "category"),
    "ward": ("category", "department"),
    "wards": ("category", "department"),
    "team": ("department",),
    "teams": ("department",),
    "division": ("department",),
    "divisions": ("department",),
    "ticket": ("department", "category"),
    "tickets": ("department", "category"),
    "incident": ("department", "category"),
    "incidents": ("department", "category"),
    "clinical": ("department",),
    "support": ("department",),
}


def dimension_tokens_for_phrase(phrase: str) -> List[str]:
    """Expand a user phrase into ordered column tokens to try."""
    raw = _norm_col(phrase)
    singular = _singularize_dimension_phrase(raw)
    tokens: List[str] = []
    seen: set[str] = set()

    def _add(token: str) -> None:
        t = _singularize_dimension_phrase(_norm_col(token))
        if not t or t in seen:
            return
        seen.add(t)
        tokens.append(t)

    for key in (raw, singular):
        if key in DIMENSION_PHRASE_ALIASES:
            for alias in DIMENSION_PHRASE_ALIASES[key]:
                _add(alias)
        _add(key)

    return tokens


def resolve_dimension_phrase_to_column(
    phrase: str,
    columns: List[str],
    profile: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """Map a breakdown phrase (across/by/per X) to a categorical column."""
    if not phrase or not columns:
        return None

    pool = categorical_columns(columns, profile or {})
    if not pool:
        pool = list(columns)

    for token in dimension_tokens_for_phrase(phrase):
        hit = find_column_for_token(token, pool, profile=profile)
        if hit and hit in columns:
            return str(hit)

    norm = _singularize_dimension_phrase(_norm_col(phrase))
    best: Optional[str] = None
    best_score = 0
    for col in pool:
        cn = _norm_col(str(col))
        score = 0
        if norm and norm == cn:
            score = 100
        elif norm and len(norm) >= 4 and (norm in cn or cn in norm):
            score = 75
        if score > best_score:
            best_score = score
            best = str(col)
    return best if best_score >= 50 else None


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

    if token_l in ("region", "regions"):
        for prefer in ("zone", "region", "territory", "area"):
            for c in pool:
                if prefer in _norm_col(c):
                    return str(c)

    if re.search(r"customer", token_l):
        for c in pool:
            if "customer" in _norm_col(c):
                return str(c)

    if re.search(r"growth\s*rate|growth_rate", token_l.replace("_", " ")):
        for c in pool:
            cn = _norm_col(c)
            if "growth" in cn and "rate" in cn:
                return str(c)
            if cn in ("growth rate", "growth_rate"):
                return str(c)

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

    if token_l in ("satisfaction", "satisfaction score", "csat", "resolution", "resolution rate"):
        for c in pool:
            if "satisfaction" in _norm_col(c):
                return str(c)

    if token_l in (
        "headcount",
        "fte",
        "staff",
        "employee count",
        "patient volume",
        "patient volumes",
        "volume",
        "ticket",
        "tickets",
        "ticket count",
        "ticket volume",
    ):
        for prefer in ("units", "headcount", "employee", "ticket", "patient", "volume"):
            for c in pool:
                if prefer in _norm_col(c):
                    return str(c)

    if token_l in ("downtime", "outage", "incident cost", "incidents"):
        for c in pool:
            cn = _norm_col(c)
            if "downtime" in cn or ("cost" in cn and "ad" not in cn):
                return str(c)

    if token_l in ("product", "products"):
        for c in pool:
            if "product" in _norm_col(c):
                return str(c)

    if token_l in ("roi", "return on investment"):
        for prefer in ("roi", "revenue", "profit"):
            for c in pool:
                if prefer in _norm_col(c):
                    return str(c)

    for c in pool:
        if column_matches_token(str(c), token_l):
            return str(c)
    return None


_METRIC_SYNONYM_PATTERNS: Tuple[Tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bheadcount\b", re.I), "headcount"),
    (re.compile(r"\bpatient\s+volumes?\b", re.I), "patient volume"),
    (re.compile(r"\bfte\b", re.I), "headcount"),
)

_SCORE_RATING_SUBSTRINGS: Tuple[str, ...] = (
    "score",
    "rating",
    "satisfaction",
    "nps",
    "csat",
)


def resolve_synonym_metric_column(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
) -> Optional[str]:
    """Map domain metric vocabulary (headcount, patient volume, …) to a numeric column."""
    if df is None or df.empty:
        return None
    ql = str(question or "")
    if not ql.strip():
        return None
    cols = df.columns.tolist()
    for pat, token in _METRIC_SYNONYM_PATTERNS:
        if pat.search(ql):
            hit = find_column_for_token(
                token,
                cols,
                numeric_only=True,
                profile=profile,
            )
            if hit:
                return str(hit)
    return None


def column_prefers_mean_aggregation(col_name: Optional[str]) -> bool:
    """Score/rating-style columns should aggregate with mean, not sum."""
    if not col_name:
        return False
    cn = _norm_col(str(col_name))
    if any(k in cn for k in ("revenue", "sales", "cost", "spend", "profit", "units")):
        return False
    return any(sub in cn for sub in _SCORE_RATING_SUBSTRINGS)


def dimension_vocabulary_provenance_note(
    question: str,
    resolved_dim_col: Optional[str],
    df: pd.DataFrame,
) -> Optional[str]:
    """Explain when domain vocabulary (e.g. ward) maps to a proxy column (e.g. category)."""
    if df is None or df.empty or not resolved_dim_col:
        return None
    ql = str(question or "").lower()
    if not re.search(r"\bwards?\b", ql):
        return None
    has_ward_col = any("ward" in _norm_col(str(c)) for c in df.columns.tolist())
    if has_ward_col:
        return None
    if _norm_col(str(resolved_dim_col)) == "category":
        return (
            "Question refers to wards; breakdown uses the category column "
            "(ward labels such as Ward-A appear as category values)."
        )
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
            hit = resolve_dimension_phrase_to_column(token, columns, profile)
            if not hit:
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
