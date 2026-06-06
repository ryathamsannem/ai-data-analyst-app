"""
Geographic analysis scope — keep executive answers at the hierarchy the user asked for.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

# Coarse → fine (lower index = coarser). Used when the question names "region" but
# the dataset uses zone / territory / state / city columns.
_GEO_LEVEL_ORDER = ("region", "state", "city")

_LEVEL_COLUMN_HINTS: Dict[str, List[Tuple[str, int]]] = {
    "region": [
        ("zone", 42),
        ("region", 40),
        ("territory", 38),
        ("geography", 36),
        ("geo", 28),
        ("area", 22),
        ("market", 18),
        ("division", 16),
        ("country", 30),
    ],
    "state": [
        ("state", 40),
        ("province", 36),
        ("region", 28),
        ("zone", 20),
    ],
    "city": [
        ("city", 42),
        ("metro", 36),
        ("location", 28),
        ("office", 22),
        ("site", 20),
        ("branch", 18),
        ("store", 18),
    ],
}

_CITY_EXPLICIT_RE = re.compile(
    r"\b(?:top|best|highest|lowest|leading|worst|top[- ]performing|best[- ]performing|"
    r"highest[- ]performing|lowest[- ]performing)\s+(?:\w+\s+){0,4}city\b|"
    r"\bcity\s+ranking\b|"
    r"\branking\s+(?:of\s+)?cities\b|"
    r"\brank(?:ing)?\s+(?:\w+\s+){0,4}cit(?:y|ies)\b|"
    r"\b(?:top|best|highest|lowest)\s+cit(?:y|ies)\b|"
    r"\b(?:highest|lowest|best|top)\s+(?:revenue|profit|sales|performance)\s+city\b",
    re.I,
)

_QUESTION_LEVEL_PATTERNS: List[Tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(city|cities|metro|metros|town|towns)\b", re.I), "city"),
    (
        re.compile(
            r"\b(region|regions|zone|zones|territory|territories|geograph(?:y|ic)|"
            r"geography|geo\s*performance)\b",
            re.I,
        ),
        "region",
    ),
    (re.compile(r"\b(state|states|province|provinces)\b", re.I), "state"),
    (
        re.compile(
            r"\b(across|by|per|compare|comparing|between)\s+regions?\b", re.I
        ),
        "region",
    ),
    (
        re.compile(
            r"\bwhich\s+region\b|\bunderperforming\s+region\b|\bbest\s+performing\s+region\b",
            re.I,
        ),
        "region",
    ),
]


def _norm_col(name: str) -> str:
    return re.sub(r"[_\s]+", " ", str(name).lower()).strip()


def question_geographic_scope_level(question: str) -> Optional[str]:
    """Primary geographic grain requested in the question, if any."""
    q = (question or "").strip()
    if not q:
        return None
    if _CITY_EXPLICIT_RE.search(q):
        return "city"
    for pat, level in _QUESTION_LEVEL_PATTERNS:
        if pat.search(q):
            return level
    if re.search(r"\bunderperform(?:ing)?\b", q, re.I) and re.search(
        r"\b(region|zone|territory|geograph)\b", q, re.I
    ):
        return "region"
    if re.search(r"\bacross\s+regions?\b", q, re.I):
        return "region"
    return None


def _categorical_columns(columns: List[str], profile: Dict[str, Any]) -> List[str]:
    ct = profile.get("column_types", {}) if profile else {}
    return [c for c in columns if ct.get(c) not in ("number", "date")]


def _score_column_for_level(col: str, level: str) -> int:
    cn = _norm_col(col).replace(" ", "_")
    hints = _LEVEL_COLUMN_HINTS.get(level) or []
    score = 0
    for hint, w in hints:
        if hint in cn or cn == hint:
            score = max(score, w)
    if level == "region" and cn in ("zone", "region", "territory"):
        score = max(score, 40)
    return score


def _finer_levels(level: str) -> set[str]:
    try:
        idx = _GEO_LEVEL_ORDER.index(level)
    except ValueError:
        return set()
    return set(_GEO_LEVEL_ORDER[idx + 1 :])


def resolve_geographic_group_column(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
) -> Optional[str]:
    """
    Pick a grouping column aligned with the question's geographic scope.
    Region-level questions prefer zone/region/territory over city.
    """
    if df is None or df.empty:
        return None
    level = question_geographic_scope_level(question)
    if not level:
        return None

    cols = _categorical_columns(df.columns.tolist(), profile)
    if not cols:
        return None

    scored: List[Tuple[int, str, int]] = []
    n_rows = max(int(len(df)), 1)
    for c in cols:
        base = _score_column_for_level(str(c), level)
        if base <= 0:
            continue
        try:
            nu = int(df[c].nunique(dropna=True))
        except Exception:
            nu = 0
        if nu < 2:
            continue
        uniq_ratio = nu / n_rows
        bonus = 0
        if level == "region" and 2 <= nu <= 12:
            bonus += 8
        elif level == "city" and nu >= 3:
            bonus += 8
        elif level == "state" and 2 <= nu <= 20:
            bonus += 5
        if level == "city":
            coarse = max(
                _score_column_for_level(str(c), "region"),
                _score_column_for_level(str(c), "state"),
            )
            if coarse >= 30 and base < coarse:
                base = max(0, base - 40)
        if level == "region" and _finer_levels(level) and any(
            _score_column_for_level(str(c), finer) >= 35 for finer in _finer_levels(level)
        ):
            if _score_column_for_level(str(c), "city") >= 35 and _score_column_for_level(
                str(c), "region"
            ) < 35:
                base = max(0, base - 25)
        scored.append((base + bonus, str(c), nu))

    if not scored:
        return None
    scored.sort(key=lambda t: (-t[0], t[2], t[1]))
    return scored[0][1]


def geographic_scope_display_label(level: str, column: Optional[str]) -> str:
    if column:
        lab = str(column).replace("_", " ").strip().title()
        if level == "region" and lab.lower() in ("zone", "territory", "area"):
            return "region"
        return lab
    return {"region": "region", "state": "state", "city": "city"}.get(level, level)


def geographic_scope_prompt_block(
    question: str,
    group_col: Optional[str],
    profile: Optional[Dict[str, Any]] = None,
) -> str:
    """Instructions appended to the LLM user prompt for geographic cohort questions."""
    level = question_geographic_scope_level(question)
    if not level:
        return ""

    dim_label = geographic_scope_display_label(level, group_col)
    finer = _finer_levels(level)
    finer_names = ", ".join(finer) if finer else "finer geography"

    lines = [
        "Geographic analysis scope (mandatory):",
        f"- The user asked for {dim_label}-level analysis — keep Key findings at that level only.",
        f"- Primary breakdown column for this answer: "
        f"{group_col or '(inferred from cohort)'}.",
        f"- Do not introduce {finer_names}-level leaders (e.g. individual cities) in Key findings "
        f"unless the user explicitly asked for city-level detail or a drill-down.",
    ]
    if level == "region":
        lines.append(
            "- Example (good): \"East is the lowest-performing region with revenue of 116,000.\""
        )
        lines.append(
            "- Example (bad): \"East is lowest; Jaipur is the weakest city.\" — omit city unless asked."
        )
        lines.append(
            "- You may mention city-level detail only under \"What this may indicate\" as optional "
            "hypothesis, clearly labeled as drill-down, not as the headline finding."
        )
    if profile and group_col:
        lines.append(
            "- Ignore row-level sample cities in the dataset preview when they conflict with "
            f"aggregated {dim_label}-level chart values."
        )
    return "\n".join(lines)


def geographic_context_sample_rows(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    question: str,
    *,
    max_rows: int = 8,
) -> List[Dict[str, Any]]:
    """
    Context sample rows for the LLM — aggregated at the question's geographic level
    when possible (avoids city names leaking into region answers).
    """
    level = question_geographic_scope_level(question)
    if not level or df is None or df.empty:
        return df.head(max_rows).to_dict(orient="records")

    group_col = resolve_geographic_group_column(question, df, profile)
    if not group_col or group_col not in df.columns:
        return df.head(max_rows).to_dict(orient="records")

    ct = profile.get("column_types", {})
    num_cols = [c for c in df.columns if ct.get(c) == "number"][:4]
    use_cols = [group_col] + [c for c in num_cols if c != group_col]
    try:
        sub = df[use_cols].copy()
        g = sub.groupby(group_col, dropna=False).sum(numeric_only=True).reset_index()
        return g.head(max_rows).to_dict(orient="records")
    except Exception:
        return df.head(max_rows).to_dict(orient="records")


_OUTLIER_RE = re.compile(
    r"\b(outliers?|anomal(?:y|ies)|unusually\s+(?:high|low)|extreme)\b",
    re.I,
)


def question_asks_geographic_outliers(question: str) -> bool:
    """Outlier intent scoped to geography (region/zone/city), not value histograms."""
    q = (question or "").strip()
    if not q or not _OUTLIER_RE.search(q):
        return False
    ql = q.lower()
    if re.search(
        r"\b(?:geographic|geography|geo)\b.*\boutliers?\b|\boutliers?\b.*\b(?:geographic|geography|geo)\b",
        ql,
    ):
        return True
    if re.search(
        r"\boutliers?\b.*\b(?:region|regions|zone|zones|territory|territories|city|cities)\b",
        ql,
    ):
        return True
    if re.search(
        r"\b(?:region|regions|zone|zones|territory|territories|city|cities)\b.*\boutliers?\b",
        ql,
    ):
        return True
    if question_geographic_scope_level(q) and _OUTLIER_RE.search(q):
        return True
    return False


def _resolve_geo_group_for_outliers(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
) -> Optional[str]:
    gcol = resolve_geographic_group_column(question, df, profile)
    if gcol:
        return gcol
    for hint in (
        "compare across regions",
        "by zone",
        "by city",
    ):
        gcol = resolve_geographic_group_column(hint, df, profile)
        if gcol:
            return gcol
    return None


def _pick_metric_for_geographic_outliers(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
) -> Optional[str]:
    ql = (question or "").lower()
    ct = profile.get("column_types", {}) if profile else {}
    numeric = [c for c in df.columns if ct.get(c) == "number"]
    if not numeric:
        return None
    for hint in ("revenue", "profit", "sales", "amount", "customers"):
        if hint in ql:
            for c in numeric:
                if hint in str(c).lower().replace(" ", "_"):
                    return str(c)
    for pref in ("revenue", "profit", "sales", "amount"):
        for c in numeric:
            if pref in str(c).lower().replace(" ", "_"):
                return str(c)
    return str(numeric[0])


def build_geographic_outlier_chart(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
) -> Optional[Tuple[List[Dict[str, Any]], str, str, str, str, str]]:
    """
    Rank geographic units (zone/region/city) by metric — category labels, not histogram bins.
    Returns (chart_rows, chart_type, title, subtitle) or None.
    """
    if df is None or df.empty or not question_asks_geographic_outliers(question):
        return None

    group_col = _resolve_geo_group_for_outliers(question, df, profile)
    if not group_col or group_col not in df.columns:
        return None

    metric_col = _pick_metric_for_geographic_outliers(question, df, profile)
    if not metric_col or metric_col not in df.columns:
        return None

    try:
        sub = df[[group_col, metric_col]].copy()
        sub["_v"] = pd.to_numeric(sub[metric_col], errors="coerce")
        sub = sub.dropna(subset=["_v"])
        if len(sub) < 2:
            return None
        g = sub.groupby(group_col, dropna=False)["_v"].sum().sort_values(ascending=False)
        if g.nunique() < 2:
            return None
        chart_data = [
            {"name": str(idx).strip(), "value": float(val)}
            for idx, val in g.items()
            if str(idx).strip()
        ]
        if len(chart_data) < 2:
            return None
        dim_label = geographic_scope_display_label(
            question_geographic_scope_level(question) or "region",
            group_col,
        )
        met_label = str(metric_col).replace("_", " ").strip().title()
        title = f"Geographic outliers — {met_label} by {dim_label}"
        ctype = "bar_horizontal" if len(chart_data) > 5 else "bar"
        subtitle = (
            f"Compare {dim_label} units by {met_label.lower()} to spot unusually high or low areas."
        )
        return chart_data, ctype, title, subtitle, str(group_col), str(metric_col)
    except Exception:
        return None
