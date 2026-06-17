"""
Executive lens → strongest available metric column (schema-driven, cross-domain).
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

import pandas as pd

from intent_engine.column_resolve import column_matches_token, numeric_columns

ExecutiveLensKind = str  # risk | opportunity | strategy | summary | loss | standout

# (token in column name, base weight) — higher = stronger risk signal
_RISK_COLUMN_TOKENS: Tuple[Tuple[str, int], ...] = (
    ("npl", 120),
    ("delinquency", 118),
    ("readmission", 115),
    ("escalation", 114),
    ("defect", 112),
    ("variance", 110),
    ("attrition", 110),
    ("downtime", 108),
    ("utilization", 105),
    ("satisfaction", 100),
    ("resolution", 98),
    ("loss", 95),
    ("cost", 88),
    ("profit", 85),
    ("headcount", 70),
    ("ticket", 75),
    ("patient", 72),
    ("revenue", 40),
)

_OPPORTUNITY_COLUMN_TOKENS: Tuple[Tuple[str, int], ...] = (
    ("profit", 115),
    ("margin", 112),
    ("growth", 110),
    ("attainment", 108),
    ("revenue", 105),
    ("conversion", 102),
    ("interest", 100),
    ("deposit", 98),
    ("units", 95),
    ("satisfaction", 90),
    ("patient_volume", 88),
)

_STRATEGY_COLUMN_TOKENS: Tuple[Tuple[str, int], ...] = (
    ("revenue", 100),
    ("profit", 95),
    ("variance", 92),
    ("spend", 90),
    ("budget", 88),
    ("npl", 85),
    ("delinquency", 85),
    ("interest", 82),
)

_SUMMARY_COLUMN_TOKENS: Tuple[Tuple[str, int], ...] = (
    ("revenue", 95),
    ("units_produced", 92),
    ("tickets_resolved", 92),
    ("personnel_cost", 92),
    ("patient_volume", 90),
    ("deposit", 88),
    ("actual", 85),
    ("downtime", 82),
    ("cost", 80),
    ("headcount", 75),
)

_LOSS_COLUMN_TOKENS: Tuple[Tuple[str, int], ...] = (
    ("profit", 120),
    ("margin", 110),
    ("loss", 108),
    ("cost", 90),
)

_LENS_TOKENS: Dict[str, Tuple[Tuple[str, int], ...]] = {
    "risk": _RISK_COLUMN_TOKENS,
    "opportunity": _OPPORTUNITY_COLUMN_TOKENS,
    "strategy": _STRATEGY_COLUMN_TOKENS,
    "summary": _SUMMARY_COLUMN_TOKENS,
    "loss": _LOSS_COLUMN_TOKENS,
    "standout": _OPPORTUNITY_COLUMN_TOKENS,
}

# Question-domain cues → metric tokens (boost when both domain phrase and column token match)
_DOMAIN_METRIC_BOOSTS: Tuple[Tuple[re.Pattern[str], Tuple[str, ...]], ...] = (
    (
        re.compile(
            r"\b(marketing|campaign|channel|ad\s+spend)\b",
            re.I,
        ),
        ("satisfaction", "conversion", "spend", "cost", "revenue"),
    ),
    (
        re.compile(r"\b(support|ticket|service\s+desk|help\s*desk)\b", re.I),
        ("escalation", "satisfaction", "resolution", "tickets_resolved", "tickets_opened"),
    ),
    (
        re.compile(r"\b(workforce|hr\b|employee|personnel|staff)\b", re.I),
        ("attrition", "personnel_cost", "headcount", "personnel"),
    ),
    (
        re.compile(r"\b(clinical|patient|ward|hospital|healthcare)\b", re.I),
        ("readmission", "length_of_stay", "patient_volume", "cost"),
    ),
    (
        re.compile(r"\b(plant|production|facility|manufacturing|operations)\b", re.I),
        ("units_produced", "downtime", "defect", "oee", "cost"),
    ),
    (
        re.compile(r"\b(fp&a|fpa|finance|budget|cost\s+center)\b", re.I),
        ("variance", "actual", "budget", "cost"),
    ),
    (
        re.compile(r"\b(credit|portfolio|loan|banking|cro\b|npl)\b", re.I),
        ("npl", "delinquency", "loan", "credit_utilization", "interest"),
    ),
    (
        re.compile(r"\b(geographic|region|zone|city|territory)\b", re.I),
        ("revenue", "growth", "profit"),
    ),
    (
        re.compile(r"\b(production\s+loss|loss\s+concentrat|overrun)\b", re.I),
        ("cost", "downtime", "defect", "units_produced"),
    ),
)

_SUMMARY_CONTEXT_BOOSTS: Tuple[Tuple[re.Pattern[str], Tuple[str, ...]], ...] = (
    (re.compile(r"\bplant\s+performance\b|\bproduction\s+performance\b", re.I), ("units_produced", "oee", "downtime")),
    (re.compile(r"\bsupport\s+performance\b", re.I), ("tickets_resolved", "satisfaction", "escalation")),
    (re.compile(r"\bworkforce\s+performance\b", re.I), ("personnel_cost", "headcount", "attrition")),
    (re.compile(r"\bregional\s+performance\b|\bclinical\b", re.I), ("cost", "readmission", "patient_volume")),
    (re.compile(r"\bbranch\s+performance\b", re.I), ("deposit", "loan", "interest")),
    (re.compile(r"\bcampaign\s+performance\b", re.I), ("revenue", "conversion", "spend")),
    (re.compile(r"\bdepartment\s+performance\b", re.I), ("revenue", "variance", "actual", "cost")),
)


def _norm_col(name: str) -> str:
    return re.sub(r"[_\s]+", " ", str(name).lower()).strip()


def _column_token_score(col: str, token: str, weight: int) -> int:
    cn = _norm_col(col)
    tok = token.lower().replace("_", " ")
    if tok == cn or cn.endswith(f" {tok}") or cn.startswith(f"{tok} "):
        return weight + 25
    if tok in cn.split():
        return weight + 15
    if column_matches_token(col, tok):
        return weight + 10
    if len(tok) >= 4 and tok in cn:
        return weight
    return 0


def _active_domain_tokens(question: str) -> List[str]:
    ql = str(question or "").lower()
    tokens: List[str] = []
    for pattern, hints in _DOMAIN_METRIC_BOOSTS:
        if pattern.search(ql):
            tokens.extend(hints)
    return tokens


def _summary_context_tokens(question: str) -> List[str]:
    ql = str(question or "").lower()
    tokens: List[str] = []
    for pattern, hints in _SUMMARY_CONTEXT_BOOSTS:
        if pattern.search(ql):
            tokens.extend(hints)
    return tokens


def _pick_column_by_tokens(
    columns: Sequence[str],
    profile: Dict[str, Any],
    *tokens: str,
) -> Optional[str]:
    nums = numeric_columns(list(columns), profile)
    for token in tokens:
        for col in nums:
            if _column_token_score(str(col), token, 1) > 0:
                return str(col)
    return None


def _try_lens_domain_shortcut(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
    lens: ExecutiveLensKind,
) -> Optional[str]:
    """Ordered domain→metric shortcuts before generic lens scoring."""
    ql = str(question or "").lower()
    lens_key = str(lens or "").lower()
    cols = df.columns.tolist()

    if lens_key == "risk":
        if re.search(r"\b(geographic|region|zone|city|territory)\b", ql):
            return _pick_column_by_tokens(cols, profile, "revenue", "growth", "profit")
        if re.search(r"\b(production\s+loss|loss\s+concentrat)\b", ql):
            return _pick_column_by_tokens(cols, profile, "cost", "downtime", "defect")
        if re.search(r"\boperational\b", ql) and re.search(r"\brisks?\b", ql):
            if not re.search(r"\b(clinical|patient|ward)\b", ql):
                return _pick_column_by_tokens(
                    cols, profile, "downtime", "defect", "sla", "cost"
                )
        if re.search(r"\b(marketing|campaign|channel)\b", ql):
            return _pick_column_by_tokens(
                cols, profile, "satisfaction", "conversion", "cost", "revenue"
            )
        if re.search(r"\b(support|ticket|service\s+desk)\b", ql):
            return _pick_column_by_tokens(
                cols, profile, "escalation", "satisfaction", "tickets_opened"
            )
        if re.search(r"\b(workforce|hr\b|employee|personnel)\b", ql):
            return _pick_column_by_tokens(
                cols, profile, "attrition", "personnel_cost", "headcount"
            )
        if re.search(r"\b(clinical|patient|ward|hospital|healthcare)\b", ql):
            return _pick_column_by_tokens(
                cols, profile, "readmission", "length_of_stay", "cost", "patient_volume"
            )

    if lens_key == "opportunity":
        if re.search(r"\b(geographic|region|zone|city|territory)\b", ql):
            return _pick_column_by_tokens(cols, profile, "revenue", "growth", "profit")
        if re.search(r"\b(hr\b|human\s+resources|workforce)\b", ql):
            return _pick_column_by_tokens(
                cols, profile, "headcount", "personnel_cost", "attrition"
            )
        if re.search(r"\b(support|ticket|service\s+desk)\b", ql):
            return _pick_column_by_tokens(
                cols, profile, "satisfaction", "tickets_resolved", "revenue"
            )
        if re.search(r"\b(marketing|campaign|channel)\b", ql):
            return _pick_column_by_tokens(
                cols, profile, "revenue", "conversion", "growth", "profit"
            )

    if lens_key == "strategy":
        if re.search(r"\b(budget|spend|allocation|allocate)\b", ql):
            return _pick_column_by_tokens(
                cols, profile, "spend", "budget", "variance", "actual", "revenue"
            )

    if lens_key == "summary":
        if re.search(r"\bplant\s+performance\b|\bproduction\s+performance\b", ql):
            return _pick_column_by_tokens(
                cols, profile, "units_produced", "oee", "downtime", "cost"
            )
        if re.search(r"\bsupport\s+performance\b", ql):
            return _pick_column_by_tokens(
                cols, profile, "tickets_resolved", "satisfaction", "escalation"
            )
        if re.search(r"\bworkforce\s+performance\b", ql):
            return _pick_column_by_tokens(
                cols, profile, "personnel_cost", "headcount", "attrition"
            )
        if re.search(r"\bregional\s+performance\b", ql):
            return _pick_column_by_tokens(
                cols, profile, "cost", "readmission", "patient_volume", "revenue"
            )
        if re.search(r"\bbranch\s+performance\b", ql):
            return _pick_column_by_tokens(
                cols, profile, "deposit", "loan", "interest", "revenue"
            )
        if re.search(r"\bcampaign\s+performance\b", ql):
            return _pick_column_by_tokens(
                cols, profile, "revenue", "conversion", "spend"
            )

    return None


def _score_column_for_lens(
    col: str,
    lens: ExecutiveLensKind,
    question: str,
    *,
    domain_tokens: Sequence[str],
) -> int:
    lens_key = str(lens or "").lower()
    token_table = _LENS_TOKENS.get(lens_key, _STRATEGY_COLUMN_TOKENS)
    best = 0
    for token, weight in token_table:
        best = max(best, _column_token_score(col, token, weight))
    for dt in domain_tokens:
        if _column_token_score(col, dt, 0) > 0:
            best = max(best, _column_token_score(col, dt, 95))
    if lens_key == "summary":
        for st in _summary_context_tokens(question):
            sc = _column_token_score(col, st, 0)
            if sc > 0:
                best = max(best, sc + 30)
    ql = str(question or "").lower()
    if lens_key == "risk" and re.search(
        r"\b(geographic|region|zone|city|territory)\b", ql
    ):
        rev_sc = _column_token_score(col, "revenue", 0)
        if rev_sc > 0:
            best = max(best, rev_sc + 45)
    return best


def resolve_executive_lens_metric_column(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
    *,
    lens: ExecutiveLensKind,
) -> Optional[str]:
    """
    Pick the strongest numeric column for an executive / summary question.
 
    Order: explicit question metric → banking resolver → lens/domain scoring.
    """
    if df is None or df.empty or not lens:
        return None

    ql = str(question or "").lower()

    if re.search(r"\b(overrun|over\s+budget|cost\s+overrun)\b", ql):
        for hint in ("actual", "variance"):
            for col in numeric_columns(df.columns.tolist(), profile):
                if hint in _norm_col(str(col)):
                    return str(col)

    try:
        from intent_engine.resolve_explicit_metric import resolve_explicit_metric_column

        explicit = resolve_explicit_metric_column(question, df, profile)
        if explicit:
            return str(explicit)
    except Exception:
        pass

    try:
        from intent_engine.banking_metric_resolve import resolve_banking_metric_column

        bank = resolve_banking_metric_column(question, df, profile)
        if bank:
            return str(bank)
    except Exception:
        pass

    if re.search(r"\b(fp&a|fpa|budget|variance)\b", ql):
        for col in numeric_columns(df.columns.tolist(), profile):
            if "variance" in _norm_col(str(col)):
                return str(col)

    shortcut = _try_lens_domain_shortcut(question, df, profile, lens)
    if shortcut:
        return shortcut

    domain_tokens = _active_domain_tokens(question)
    nums = numeric_columns(df.columns.tolist(), profile)
    if not nums:
        return None

    scored: List[Tuple[int, str]] = []
    for col in nums:
        sc = _score_column_for_lens(col, lens, question, domain_tokens=domain_tokens)
        if sc > 0:
            scored.append((sc, str(col)))

    if not scored:
        return None

    scored.sort(key=lambda t: (-t[0], t[1]))
    return scored[0][1]


def apply_executive_metric_to_intent(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
    intent: Dict[str, Any],
) -> bool:
    """
    Refine value_col for executive / summary questions when a stronger metric exists.
    Does not change intent bucket, chart type, or dimension.
    """
    if df is None or df.empty or not intent:
        return False

    try:
        from intent_engine.narrative_guardrails import detect_missing_requested_metrics

        if detect_missing_requested_metrics(question, df, profile):
            return False
    except Exception:
        pass

    lens: Optional[str] = None
    try:
        from intent_engine.executive_ambiguous_intent import (
            bucket_to_executive_lens,
            classify_executive_ambiguous_bucket,
        )

        bucket = classify_executive_ambiguous_bucket(question)
        if bucket:
            lens = bucket_to_executive_lens(bucket)
    except Exception:
        lens = None

    if not lens:
        try:
            from intent_engine.executive_lens import detect_executive_lens

            lens = detect_executive_lens(question)
        except Exception:
            lens = None

    if lens not in ("risk", "opportunity", "strategy", "summary", "loss", "standout"):
        return False

    resolved = resolve_executive_lens_metric_column(
        question, df, profile, lens=str(lens)
    )
    if not resolved:
        return False

    intent["value_col"] = resolved
    try:
        from intent_engine.legacy import pretty_label_text

        intent["metricColumnDisplay"] = pretty_label_text(str(resolved))
    except Exception:
        pass
    return True
