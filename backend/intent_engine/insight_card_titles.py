"""
Executive insight card titles — measure + insight type (never raw user questions).
"""

from __future__ import annotations

import re
from typing import List, Optional

_QUESTION_START_RE = re.compile(
    r"^(?:is|are|what|which|how|does|do|can|could|will|would|should)\b",
    re.I,
)
_RELATIONSHIP_QUESTION_RE = re.compile(
    r"\b(correlat(?:e|ed|ion)?|relationship|associated|association|versus|vs\.?|"
    r"impact\s+of|between)\b",
    re.I,
)
_AGG_PREFIX_RE = re.compile(
    r"^(?:total|average|avg|mean|sum|count|median|min|max)\s+",
    re.I,
)


def _pretty_column(col: str) -> str:
    s = str(col or "").strip().replace("_", " ")
    if not s:
        return "Value"
    return " ".join(w.capitalize() for w in s.split())


def is_question_like_label(text: str) -> bool:
    t = re.sub(r"\s+", " ", (text or "").strip())
    if not t or len(t) < 3:
        return True
    if "?" in t:
        return True
    if _QUESTION_START_RE.search(t):
        return True
    if _RELATIONSHIP_QUESTION_RE.search(t) and len(t.split()) >= 4:
        return True
    if len(t.split()) >= 9 or len(t) > 56:
        return True
    return False


def sanitize_measure_for_card_title(raw: str) -> str:
    s = re.sub(r"\s+", " ", (raw or "").strip())
    if not s or is_question_like_label(s):
        return ""
    s = _AGG_PREFIX_RE.sub("", s).strip()
    s = re.sub(
        r"\b(geographic\s+)?outliers?\b",
        "",
        s,
        flags=re.I,
    ).strip()
    s = re.sub(r"\s+by\s+[\w\s]+$", "", s, flags=re.I).strip()
    if not s or is_question_like_label(s):
        return ""
    if len(s) > 40:
        s = s[:40].strip()
    return " ".join(w.capitalize() for w in s.split())


def sanitize_dimension_for_card_title(raw: str) -> str:
    d = re.sub(r"\s+", " ", (raw or "").strip())
    if not d or is_question_like_label(d):
        return "Category"
    d = re.sub(r"\s+name$", "", d, flags=re.I).strip()
    if not d or is_question_like_label(d):
        return "Category"
    return " ".join(w.capitalize() for w in d.split())


def _match_measure_from_columns(text: str, columns: List[str]) -> Optional[str]:
    t = text.lower().replace("?", " ")
    if not t.strip():
        return None
    best: Optional[tuple[int, str]] = None
    for col in columns:
        raw = str(col).strip()
        if not raw:
            continue
        human = _pretty_column(raw)
        for tok in (raw.lower(), raw.lower().replace("_", " "), human.lower()):
            if len(tok) < 3:
                continue
            idx = t.find(tok)
            if idx < 0:
                continue
            score = len(tok) * 10 - idx
            label = sanitize_measure_for_card_title(human)
            if not label:
                continue
            if best is None or score > best[0]:
                best = (score, label)
    return best[1] if best else None


def resolve_executive_measure_label(
    *,
    metric_column_display: Optional[str] = None,
    metric_column: Optional[str] = None,
    value_axis: Optional[str] = None,
    chart_title: Optional[str] = None,
    dataset_columns: Optional[List[str]] = None,
) -> str:
    for cand in (
        metric_column_display,
        _pretty_column(metric_column) if metric_column else None,
        value_axis,
    ):
        s = sanitize_measure_for_card_title(str(cand or ""))
        if s:
            return s
    cols = dataset_columns or []
    for source in (chart_title, value_axis, metric_column_display):
        if not source or not cols:
            continue
        matched = _match_measure_from_columns(str(source), cols)
        if matched:
            return matched
    return "Value"


def resolve_executive_dimension_label(
    *,
    category_column_display: Optional[str] = None,
    category_column: Optional[str] = None,
    category_axis: Optional[str] = None,
) -> str:
    for cand in (
        category_column_display,
        _pretty_column(category_column) if category_column else None,
        category_axis,
    ):
        d = sanitize_dimension_for_card_title(str(cand or ""))
        if d and d != "Category":
            return d
    for cand in (
        category_column_display,
        _pretty_column(category_column) if category_column else None,
        category_axis,
    ):
        d = sanitize_dimension_for_card_title(str(cand or ""))
        if d:
            return d
    return "Category"


def build_insight_card_title(measure: str, insight_type: str) -> str:
    """
    measure + insight type → e.g. Revenue Gap, Customer Share.
    insight_type: share | gap | concentration | average | outlier | risk | trend | ...
    """
    fixed = {
        "correlation": "Correlation",
        "outlier": "Outlier Signal",
        "risk": "Underperformer",
        "trend": "Recent Change",
        "sample": "Sample Size",
        "points": "Data Points",
        "segments": "Segments",
        "roas": "Best ROAS",
    }
    t = (insight_type or "").strip().lower()
    if t in fixed:
        return fixed[t]

    m = sanitize_measure_for_card_title(measure) or "Value"
    if t == "share":
        return f"{m} Share"
    if t == "gap":
        return f"{m} Gap"
    if t == "concentration":
        return f"{m} Concentration"
    if t == "average":
        return f"{m} Average"
    if t == "highest":
        return f"Highest {m}"
    if t == "lowest":
        return f"Lowest {m}"
    if t == "peak":
        return f"Peak {m}"
    if t == "leader":
        return f"Top {m}"
    if t == "largest":
        return "Largest Segment"
    if t == "smallest":
        return "Smallest Segment"
    return m


def build_insight_dimension_card_title(dimension: str, insight_type: str) -> str:
    d = sanitize_dimension_for_card_title(dimension)
    t = (insight_type or "").strip().lower()
    if t == "highest":
        return f"Highest {d}"
    if t == "lowest":
        return f"Lowest {d}"
    if t == "leader":
        return f"Top {d}"
    if t == "share":
        return f"{d} Share"
    return d


def insight_card_type_from_ranked_kind(kind: str, priority: int = 0) -> str:
    k = (kind or "").strip().lower()
    if k == "concentration":
        return "concentration" if priority >= 90 else "share"
    if k == "opportunity":
        return "gap"
    if k == "outlier":
        return "outlier"
    if k == "risk":
        return "risk"
    if k == "trend":
        return "trend"
    if k == "ranking":
        return "leader"
    return "share"
