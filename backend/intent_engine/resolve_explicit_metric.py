"""
Resolve explicit metrics named in natural-language questions (dynamic, column-driven).
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from intent_engine.column_resolve import (
    column_matches_token,
    find_column_for_token,
    numeric_columns,
    resolve_synonym_metric_column,
)

_COMPARE_METRIC_PATTERNS: Tuple[re.Pattern[str], ...] = (
    re.compile(r"\bcompare\s+(.+?)\s+across\b", re.I),
    re.compile(r"\bcompare\s+(.+?)\s+(?:by|per|between|over|among)\b", re.I),
    re.compile(r"\bcompare\s+(.+?)\s+vs\.?\s+", re.I),
    re.compile(r"\b(?:average|mean|total|sum)\s+(.+?)\s+(?:by|across|per|over)\b", re.I),
    re.compile(r"\b(?:rank|ranking)\s+(.+?)\s+(?:by|across|per|over)\b", re.I),
)

_METRIC_COUNT_PHRASE_RE = re.compile(
    r"\b([\w][\w\s/-]{0,28}?)\s+count\b",
    re.I,
)

_RECORD_COUNT_RE = re.compile(
    r"\b(?:how\s+many|number\s+of|count\s+of|total\s+number\s+of)\s+"
    r"(?:records?|rows?|entries|transactions?|orders?|incidents?|employees?|people|staff)\b",
    re.I,
)

_FREQUENCY_RE = re.compile(r"\b(?:frequency|occurrences?)\b", re.I)

_HEADCOUNT_RE = re.compile(r"\bheadcount\b", re.I)

_TIME_METRIC_PHRASE_RE = re.compile(
    r"\b("
    r"resolution\s+time|resolution\s+hours?|response\s+time|handling\s+time|"
    r"wait\s+time|average\s+resolution|avg\s+resolution|"
    r"time\s+to\s+resolve|time\s+to\s+resolution"
    r")\b",
    re.I,
)

_SUPERLATIVE_METRIC_RE = re.compile(
    r"\b(?:longest|shortest|highest|lowest|slowest|fastest)\s+(.+?)"
    r"(?:\s+time)?(?=\s+(?:by|across|for|among|per)\b|[?.!]|$)",
    re.I,
)

_BY_METRIC_SUFFIX_RE = re.compile(
    r"\bby\s+(headcount|patient\s+volumes?|fte)\b",
    re.I,
)
_HIGHEST_METRIC_RE = re.compile(
    r"\bhighest\s+(headcount|patient\s+volumes?)\b",
    re.I,
)


def _clean_metric_phrase(raw: str) -> str:
    p = re.sub(r"\s+", " ", str(raw or "").strip().lower())
    p = re.sub(
        r"^(the|total|overall|aggregate|compare|comparing|rank|ranking|average|mean|sum)\s+",
        "",
        p,
    )
    p = re.sub(r"\s+(please|today|overall)$", "", p)
    return p.strip()


def _phrase_variants(phrase: str) -> List[str]:
    p = _clean_metric_phrase(phrase)
    if not p:
        return []
    out: List[str] = [p]
    if p.endswith(" count"):
        stem = p[: -len(" count")].strip()
        if stem:
            out.append(stem)
    if p.endswith("s") and len(p) > 3:
        out.append(p[:-1])
    elif not p.endswith("s"):
        out.append(f"{p}s")
    seen: set[str] = set()
    uniq: List[str] = []
    for v in out:
        if v and v not in seen:
            seen.add(v)
            uniq.append(v)
    return uniq


def extract_explicit_metric_phrases(question: str) -> List[str]:
    """Ordered metric phrases from compare / {noun} count / column token mentions."""
    ql = str(question or "").strip()
    if not ql:
        return []
    phrases: List[str] = []
    seen: set[str] = set()

    def _add(raw: str) -> None:
        p = _clean_metric_phrase(raw)
        if not p or p in seen:
            return
        seen.add(p)
        phrases.append(p)

    for pat in _COMPARE_METRIC_PATTERNS:
        m = pat.search(ql)
        if m:
            _add(m.group(1))

    for m in _METRIC_COUNT_PHRASE_RE.finditer(ql):
        noun = _clean_metric_phrase(m.group(1))
        if noun:
            _add(f"{noun} count")
            _add(noun)

    for m in _BY_METRIC_SUFFIX_RE.finditer(ql):
        _add(m.group(1))
    for m in _HIGHEST_METRIC_RE.finditer(ql):
        _add(m.group(1))
    if _HEADCOUNT_RE.search(ql):
        _add("headcount")

    for m in _TIME_METRIC_PHRASE_RE.finditer(ql):
        _add(m.group(1))

    for m in _SUPERLATIVE_METRIC_RE.finditer(ql):
        _add(m.group(1))

    return sorted(phrases, key=lambda x: (-len(x), x))


def _norm_col(name: str) -> str:
    return re.sub(r"[_\s]+", " ", str(name).lower()).strip()


def _score_column_for_phrase(col: str, phrase: str) -> int:
    score = 0
    for variant in _phrase_variants(phrase):
        if column_matches_token(col, variant):
            score = max(score, 120 + len(variant))
        cn = str(col).lower().replace("_", " ")
        if variant == cn or variant.replace(" ", "_") == str(col).lower():
            score = max(score, 200 + len(variant))
        if len(variant) >= 4 and variant in cn:
            score = max(score, 90 + len(variant))
    return score


def resolve_explicit_metric_column(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
) -> Optional[str]:
    """Map an explicit metric phrase in the question to a numeric column."""
    if df is None or df.empty:
        return None
    cols = df.columns.tolist()
    nums = numeric_columns(cols, profile)
    if not nums:
        return None

    synonym = resolve_synonym_metric_column(question, df, profile)
    if synonym:
        return synonym

    best: Optional[str] = None
    best_score = 0

    for phrase in extract_explicit_metric_phrases(question):
        for variant in _phrase_variants(phrase):
            hit = find_column_for_token(
                variant,
                cols,
                numeric_only=True,
                profile=profile,
            )
            if hit:
                sc = 180 + len(variant)
                if sc > best_score:
                    best_score = sc
                    best = str(hit)
        for col in nums:
            sc = _score_column_for_phrase(str(col), phrase)
            if sc > best_score:
                best_score = sc
                best = str(col)

    ql = str(question or "").lower()
    for col in sorted(nums, key=lambda c: len(str(c)), reverse=True):
        cn = str(col).lower().replace("_", " ")
        if len(cn) < 3:
            continue
        if re.search(rf"(?<!\w){re.escape(cn)}(?!\w)", ql):
            sc = 80 + len(cn)
            if sc > best_score:
                best_score = sc
                best = str(col)
        stem = cn.rstrip("s")
        if stem and len(stem) >= 4 and re.search(rf"(?<!\w){re.escape(stem)}(?!\w)", ql):
            sc = 70 + len(stem)
            if sc > best_score:
                best_score = sc
                best = str(col)

    return best if best_score >= 70 else None


def question_names_metric_quantity(
    question: str,
    metric_col: Optional[str],
) -> bool:
    """
    True when the question names a quantity metric (e.g. customer count)
    rather than asking to count rows/records.
    """
    if not metric_col:
        return False
    ql = str(question or "").lower()
    for m in _METRIC_COUNT_PHRASE_RE.finditer(ql):
        noun = _clean_metric_phrase(m.group(1))
        if noun and column_matches_token(str(metric_col), noun):
            return True
    for phrase in extract_explicit_metric_phrases(ql):
        if column_matches_token(str(metric_col), phrase):
            return True
        if phrase.endswith(" count"):
            stem = phrase[: -len(" count")].strip()
            if stem and column_matches_token(str(metric_col), stem):
                return True
    return False


def question_requests_record_count(
    question: str,
    *,
    resolved_metric_col: Optional[str] = None,
) -> bool:
    """True only when the user asks to count records/rows/frequency — not metric quantities."""
    ql = str(question or "").lower().strip()
    if not ql:
        return False

    if resolved_metric_col and question_names_metric_quantity(ql, resolved_metric_col):
        return False

    if _RECORD_COUNT_RE.search(ql):
        return True
    if _FREQUENCY_RE.search(ql):
        return True
    if _HEADCOUNT_RE.search(ql):
        if resolved_metric_col and column_matches_token(str(resolved_metric_col), "units"):
            return False
        return not resolved_metric_col

    if re.search(r"\bcount\b", ql) and not resolved_metric_col:
        if _METRIC_COUNT_PHRASE_RE.search(ql):
            return False
        if re.search(r"\bcount\s+of\s+(?:records?|rows?|entries)\b", ql):
            return True
        return False

    if re.search(r"\bhow many\b", ql) and not resolved_metric_col:
        if re.search(r"\bhow many\s+(?:records?|rows?|entries|transactions?)\b", ql):
            return True
        return False

    return False


def _id_column_for_entity_noun(
    noun: str,
    df: pd.DataFrame,
    *,
    group_col: Optional[str] = None,
) -> Optional[str]:
    """Find an identifier column suitable for counting entities (employee_id, …)."""
    if df is None or df.empty or not noun:
        return None
    best: Optional[str] = None
    best_score = 0
    for c in df.columns.tolist():
        if group_col and str(c) == str(group_col):
            continue
        cn = _norm_col(str(c))
        if "id" not in cn and not cn.endswith("_no") and "number" not in cn:
            continue
        sc = 0
        if column_matches_token(str(c), noun):
            sc += 120
        if noun in cn:
            sc += 80
        if sc > best_score:
            best_score = sc
            best = str(c)
    return best if best_score >= 80 else None


def resolve_entity_count_metric_column(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
    *,
    group_col: Optional[str] = None,
) -> Optional[str]:
    """
    When the question asks '{entity} count' but no numeric measure column exists,
    return an entity id column to count rows per group.
    """
    if df is None or df.empty:
        return None
    cols = df.columns.tolist()
    nums = numeric_columns(cols, profile)
    for m in _METRIC_COUNT_PHRASE_RE.finditer(str(question or "")):
        noun = _clean_metric_phrase(m.group(1))
        if not noun:
            continue
        numeric_hit = None
        for variant in _phrase_variants(f"{noun} count"):
            hit = find_column_for_token(
                variant,
                cols,
                numeric_only=True,
                profile=profile,
            )
            if hit and str(hit) in nums:
                numeric_hit = str(hit)
                break
        if numeric_hit:
            continue
        id_col = _id_column_for_entity_noun(noun, df, group_col=group_col)
        if id_col:
            return id_col
    return None


def resolve_explicit_metric_spec(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
    *,
    group_col: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Build metric spec when the question explicitly names a measurable column.
    """
    col = resolve_explicit_metric_column(question, df, profile)
    entity_count_col = None
    if not col:
        entity_count_col = resolve_entity_count_metric_column(
            question, df, profile, group_col=group_col
        )
        if not entity_count_col:
            return None
        col = entity_count_col

    from intent_engine.legacy import pretty_label_text

    display = pretty_label_text(col)
    phrases = extract_explicit_metric_phrases(question)
    token = _clean_metric_phrase(phrases[0] if phrases else str(col))
    spec: Dict[str, Any] = {
        "value_col": col,
        "metric_display": display,
        "requested_metric_token": token or str(col).lower(),
        "explicit_metric": True,
    }
    if entity_count_col:
        spec["entity_record_count"] = True
    return spec
