"""Question-pattern detection for the intent engine (no chart pipeline side effects)."""

from __future__ import annotations

import re

_DECLINE_RE = re.compile(
    r"\b("
    r"declin(?:e|ing|ed)|decreas(?:e|ing|ed)|shrinking|falling|dropping|"
    r"downturn|contracting|slump(?:ing)?|worst(?:\s+performing)?"
    r")\b",
    re.I,
)

_RELATIONSHIP_EXPLICIT_RE = re.compile(
    r"\b("
    r"relationship\s+between|correlation\s+between|correlat(?:e|ed|ion|ing)\s+between|"
    r"correlat(?:ed|ing)\s+with|associated\s+with|association\s+between|impact\s+of|"
    r"dependency|depend(?:s|ency)?\s+on|scatter\s+plot|scatter\s+chart|"
    r"relationship|correlation|correlat(?:e|ed|ing)"
    r")\b",
    re.I,
)

_CORRELATION_ROUTING_RE = re.compile(
    r"\b("
    r"correlat(?:e|ed|ion|ing)|relationship\s+between|correlation\s+between|"
    r"associated\s+with|association\s+between|scatter\s+plot|scatter\s+chart"
    r")\b",
    re.I,
)

_ENTITY_DECLINE_RE = re.compile(
    r"\b(which|what)\s+\w+.*\b("
    r"declin(?:e|ing|ed)|decreas(?:e|ing|ed)|falling|dropping|shrinking"
    r")\b",
    re.I,
)

_DIMENSION_MENTION_RE = re.compile(
    r"\b(category|categories|product|products|region|regions|department|departments|"
    r"channel|channels|segment|segments|campaign|campaigns)\b",
    re.I,
)

_BY_DIMENSION_RE = re.compile(
    r"\bby\s+(region|product|category|department|channel|campaign|segment)\b",
    re.I,
)

_METRIC_WORD_RE = re.compile(
    r"\b(revenue|sales|profit|spend|cost|margin|ad\s*spend|adspend|budget)\b",
    re.I,
)


def question_requests_decline_intent(question: str) -> bool:
    q = (question or "").strip()
    if not q:
        return False
    return bool(_DECLINE_RE.search(q))


def question_requests_entity_decline(question: str) -> bool:
    q = (question or "").strip()
    if not q:
        return False
    if _ENTITY_DECLINE_RE.search(q):
        return True
    return question_requests_decline_intent(q) and bool(
        _DIMENSION_MENTION_RE.search(q)
    )


def question_requests_correlation_routing(question: str) -> bool:
    """
    True when the question should use row-level scatter/correlation routing
    (not category bar aggregation).
    """
    q = (question or "").strip()
    if not q:
        return False
    if question_requests_relationship_intent(q):
        return True
    ql = q.lower()
    if not _CORRELATION_ROUTING_RE.search(ql):
        return False
    if re.search(r"\b(with|between|and|versus|vs\.?)\b", ql):
        return True
    return bool(re.search(r"\bimpact\b", ql) and _METRIC_WORD_RE.search(ql))


def question_requests_relationship_intent(question: str) -> bool:
    q = (question or "").strip()
    if not q:
        return False
    ql = q.lower()
    if "relationship between" in ql or "correlation between" in ql:
        return True
    if re.search(r"\bcorrelat(?:ed|ing)\s+with\b", ql):
        return True
    if _RELATIONSHIP_EXPLICIT_RE.search(q):
        if re.search(r"\bcompare\b", ql) and not re.search(
            r"\brelationship\s+between\b", ql
        ):
            return False
        return True
    if _BY_DIMENSION_RE.search(ql) and re.search(
        r"\b(compare|versus|vs\.?)\b", ql
    ):
        return False
    if re.search(r"\b(vs\.?|versus)\b", ql) and _METRIC_WORD_RE.search(ql):
        if re.search(r"\bcompare\b", ql) and not re.search(
            r"\b(relationship|correlation|correlat|association|impact)\b", ql
        ):
            return False
        return True
    if re.search(r"\bimpact\b", ql) and _METRIC_WORD_RE.search(ql):
        return True
    return False


def question_requests_multi_metric_comparison(question: str) -> bool:
    """
    Compare X vs Y / compare X and Y — not grouped dual-metric-by-dimension
    (that stays legacy ``compare`` + dualMetricCompare).
    """
    q = (question or "").strip()
    if not q:
        return False
    ql = q.lower()

    if question_requests_relationship_intent(q):
        return False
    if question_requests_decline_intent(q):
        return False

    has_compare = bool(re.search(r"\bcompare\b", ql))
    has_vs = bool(re.search(r"\bvs\.?\b|\bversus\b", ql))
    has_and_metric = bool(
        re.search(r"\band\b", ql) and _METRIC_WORD_RE.search(ql)
    )
    has_by = bool(_BY_DIMENSION_RE.search(ql))

    if has_compare and has_by and has_and_metric and not has_vs:
        return False

    if has_compare and (has_vs or (has_and_metric and not has_by)):
        return True

    if has_vs and _METRIC_WORD_RE.search(ql) and not question_requests_relationship_intent(q):
        return True

    return False


def parse_requested_metric_ids(question: str) -> list[str]:
    """Logical metric ids in question order."""
    ql = (question or "").lower()
    if not ql:
        return []

    patterns: list[tuple[str, re.Pattern[str]]] = [
        ("ad_spend", re.compile(r"\bad\s*spend\b|\badspend\b|\badvertising\s+spend\b", re.I)),
        ("revenue", re.compile(r"\brevenue\b|\bsales\b|\bgross\s+sales\b", re.I)),
        ("profit", re.compile(r"\bprofit\b|\bnet\s+profit\b", re.I)),
        ("spend", re.compile(r"\bspend\b|\bspending\b|\bcost\b|\bbudget\b", re.I)),
        ("margin", re.compile(r"\bmargin\b|\bprofit\s+margin\b", re.I)),
    ]

    hits: list[tuple[int, str]] = []
    seen: set[str] = set()
    for mid, pat in patterns:
        m = pat.search(ql)
        if not m:
            continue
        if mid == "spend" and "ad_spend" in seen:
            continue
        if mid not in seen:
            hits.append((m.start(), mid))
            seen.add(mid)

    hits.sort(key=lambda x: x[0])
    return [h[1] for h in hits]
