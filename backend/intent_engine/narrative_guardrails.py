"""
Narrative guardrails for /ask Claude prose — unsupported metrics, phrase bans, executive structure.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

import pandas as pd

from intent_engine.column_resolve import (
    _norm_col,
    find_column_for_token,
    numeric_columns,
)

# Phrase -> column substrings that must appear (all parts) to allow the phrase in prose.
PHRASE_COLUMN_ALLOWLIST: Tuple[Tuple[str, Tuple[str, ...]], ...] = (
    ("conversion rate", ("conversion", "rate")),
    ("net promoter", ("nps",)),
    ("nps", ("nps",)),
    ("customer lifetime value", ("lifetime",)),
    ("clv", ("clv", "lifetime")),
    ("market penetration", ("penetration",)),
    ("churn rate", ("churn",)),
    ("salesperson", ("sales_rep", "salesperson")),
    ("sales person", ("sales_rep", "salesperson")),
    ("net interest margin", ("nim", "interest_margin", "net_interest")),
)

_SAFE_REPLACEMENTS: Dict[str, str] = {
    "conversion rate": "the requested rate metric",
    "net promoter": "the requested satisfaction index",
    "nps": "the requested satisfaction index",
    "customer lifetime value": "the requested lifetime metric",
    "clv": "the requested lifetime metric",
    "market penetration": "revenue concentration",
    "churn rate": "the requested retention metric",
    "salesperson": "the requested sales-rep field",
    "sales person": "the requested sales-rep field",
    "net interest margin": "the requested margin metric",
}

_REQUESTED_METRIC_CHECKS: Tuple[Dict[str, Any], ...] = (
    {
        "id": "conversion_rate",
        "pattern": re.compile(r"conversion\s+rate", re.I),
        "supported": lambda df, _profile: _has_conversion_rate_column(df),
        "label": "a conversion-rate column",
    },
    {
        "id": "nps",
        "pattern": re.compile(r"\bnps\b|net\s+promoter", re.I),
        "supported": lambda df, _profile: _column_contains(df, "nps"),
        "label": "an NPS column",
    },
    {
        "id": "clv",
        "pattern": re.compile(r"customer\s+lifetime\s+value|\bclv\b", re.I),
        "supported": lambda df, _profile: _column_contains_any(
            df, ("lifetime", "clv")
        ),
        "label": "a customer-lifetime-value column",
    },
    {
        "id": "churn",
        "pattern": re.compile(r"\bchurn(?:\s+rate)?\b", re.I),
        "supported": lambda df, _profile: _column_contains(df, "churn"),
        "label": "a churn column",
    },
    {
        "id": "salesperson",
        "pattern": re.compile(r"\bsalesperson\b|\bsales\s+person\b|\bsales\s+by\s+sales", re.I),
        "supported": lambda df, profile: _has_salesperson_dimension(df, profile),
        "label": "a salesperson / sales-rep column",
    },
    {
        "id": "nim",
        "pattern": re.compile(r"net\s+interest\s+margin|\bnim\b", re.I),
        "supported": lambda df, _profile: _has_nim_column(df),
        "label": "a net-interest-margin column",
    },
    {
        "id": "win_rate",
        "pattern": re.compile(r"win\s+rate", re.I),
        "supported": lambda df, _profile: _has_win_rate_column(df),
        "label": "a win-rate column",
    },
    {
        "id": "quarter",
        "pattern": re.compile(r"\bquarter\b", re.I),
        "supported": lambda df, _profile: _column_contains(df, "quarter"),
        "label": "a quarter column",
    },
    {
        "id": "market_penetration",
        "pattern": re.compile(r"market\s+penetration", re.I),
        "supported": lambda df, _profile: _column_contains(df, "penetration"),
        "label": "a market-penetration column",
    },
)

_CONCENTRATION_RISK_RE = re.compile(
    r"\b("
    r"risk|concentrat|dependency|overly\s+concentrat|portfolio|exposure|"
    r"biggest\s+risk|credit\s+risk"
    r")\b",
    re.I,
)

_EXECUTIVE_RE = re.compile(
    r"\b("
    r"executive\s+summary|biggest\s+(?:risk|opportunit|marketing)|"
    r"summarize\s+business|management\s+priority|concentration\s+risk|"
    r"portfolio\s+opportunity|credit\s+risk"
    r")\b",
    re.I,
)


def _column_contains(df: pd.DataFrame, needle: str) -> bool:
    n = _norm_col(needle)
    return any(n in _norm_col(str(c)) for c in df.columns)


def _column_contains_any(df: pd.DataFrame, needles: Sequence[str]) -> bool:
    return any(_column_contains(df, n) for n in needles)


def _has_conversion_rate_column(df: pd.DataFrame) -> bool:
    for c in df.columns:
        cn = _norm_col(str(c))
        if cn in ("conversion rate", "conversion_rate"):
            return True
        if "conversion" in cn and "rate" in cn:
            return True
    return False


def _has_win_rate_column(df: pd.DataFrame) -> bool:
    for c in df.columns:
        cn = _norm_col(str(c))
        if "win" in cn and "rate" in cn:
            return True
    return False


def _has_nim_column(df: pd.DataFrame) -> bool:
    for c in df.columns:
        cn = _norm_col(str(c))
        if cn == "nim" or "net interest margin" in cn:
            return True
        if "interest" in cn and "margin" in cn:
            return True
        if "net_interest" in cn.replace(" ", "_"):
            return True
    return False


def _has_salesperson_dimension(
    df: pd.DataFrame, profile: Optional[Dict[str, Any]]
) -> bool:
    cols = df.columns.tolist()
    hit = find_column_for_token(
        "salesperson", cols, numeric_only=False, profile=profile or {}
    )
    if hit:
        return True
    return find_column_for_token(
        "sales_rep", cols, numeric_only=False, profile=profile or {}
    ) is not None


def phrase_allowed_in_dataset(phrase: str, df: pd.DataFrame) -> bool:
    low = phrase.lower().strip()
    for banned, allow_parts in PHRASE_COLUMN_ALLOWLIST:
        if banned != low:
            continue
        if len(allow_parts) == 1:
            return _column_contains(df, allow_parts[0])
        return all(_column_contains(df, part) for part in allow_parts)
    return True


def forbidden_narrative_phrases(
    df: pd.DataFrame, profile: Optional[Dict[str, Any]] = None
) -> List[str]:
    _ = profile
    return [
        phrase
        for phrase, _ in PHRASE_COLUMN_ALLOWLIST
        if not phrase_allowed_in_dataset(phrase, df)
    ]


def detect_missing_requested_metrics(
    question: str,
    df: pd.DataFrame,
    profile: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, str]]:
    if df is None or df.empty:
        return []
    q = str(question or "").strip()
    if not q:
        return []
    missing: List[Dict[str, str]] = []
    for chk in _REQUESTED_METRIC_CHECKS:
        if not chk["pattern"].search(q):
            continue
        if chk["supported"](df, profile):
            continue
        missing.append({"id": chk["id"], "label": chk["label"]})
    return missing


def assess_unsupported_requested_metric(
    *,
    question: str,
    df: pd.DataFrame,
    profile: Optional[Dict[str, Any]],
    analysis_ctx: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    missing = detect_missing_requested_metrics(question, df, profile)
    if not missing:
        return None

    chart_metric = ""
    if isinstance(analysis_ctx, dict):
        chart_metric = str(analysis_ctx.get("metricColumn") or "").strip()

    labels = [m["label"] for m in missing]
    if len(labels) == 1:
        lead = (
            f"This dataset does not include {labels[0]}, so the requested "
            "comparison cannot be answered directly."
        )
    else:
        lead = (
            "This dataset does not include "
            + ", ".join(labels[:-1])
            + f", or {labels[-1]}, so the requested comparison cannot be answered directly."
        )

    forbidden = forbidden_narrative_phrases(df, profile)
    return {
        "active": True,
        "missingRequests": missing,
        "missingLabels": labels,
        "leadSentence": lead,
        "substituteMetricColumn": chart_metric or None,
        "forbiddenPhrases": forbidden,
    }


def _is_executive_question(question: str, analysis_ctx: Optional[Dict[str, Any]]) -> bool:
    if isinstance(analysis_ctx, dict) and analysis_ctx.get("executiveAmbiguousBucket"):
        return True
    if isinstance(analysis_ctx, dict) and analysis_ctx.get("executiveLens"):
        return True
    return bool(_EXECUTIVE_RE.search(str(question or "")))


def _is_concentration_risk_question(question: str, analysis_ctx: Optional[Dict[str, Any]]) -> bool:
    if isinstance(analysis_ctx, dict):
        bucket = str(analysis_ctx.get("executiveAmbiguousBucket") or "")
        if bucket in ("executive_risk", "executive_strategy"):
            return True
    return bool(_CONCENTRATION_RISK_RE.search(str(question or "")))


def narrative_guardrails_prompt_block(
    *,
    question: str,
    df: pd.DataFrame,
    profile: Optional[Dict[str, Any]],
    analysis_ctx: Optional[Dict[str, Any]],
    unsupported_requested: Optional[Dict[str, Any]] = None,
) -> str:
    lines: List[str] = []
    forbidden = forbidden_narrative_phrases(df, profile)

    if forbidden:
        joined = "; ".join(f'"{p}"' for p in forbidden)
        lines.extend(
            [
                "Phrase guardrails (mandatory):",
                f"- Do NOT use these phrases anywhere in your answer: {joined}.",
                "- Use dataset column names and generic wording (e.g. revenue concentration, "
                "geographic dependency) instead of absent business concepts.",
                "- Recommendations must cite only metrics/dimensions present in the "
                "calculated result or chart-values block.",
            ]
        )

    gap = unsupported_requested or assess_unsupported_requested_metric(
        question=question,
        df=df,
        profile=profile,
        analysis_ctx=analysis_ctx,
    )
    if gap and gap.get("active"):
        sub = gap.get("substituteMetricColumn")
        lines.extend(
            [
                "",
                "Unsupported requested metric (limitation-first — mandatory):",
                f"- Open with: {gap.get('leadSentence')}",
                "- Do NOT substitute another metric as if it answers the question.",
            ]
        )
        if sub:
            lines.append(
                f"- A fallback chart uses {sub} — if you mention it, label it "
                '"Available-data context (fallback only):" and keep it to one short sentence.'
            )
        else:
            lines.append(
                "- Do not present revenue/spend/ranking charts as answering the missing metric."
            )
        lines.append(
            "- Do not make confident recommendations based on the substitute metric."
        )
        if forbidden:
            lines.append(
                f"- Never repeat forbidden phrases even when explaining the limitation: {joined}."
            )

    if _is_executive_question(question, analysis_ctx):
        lines.extend(
            [
                "",
                "Executive narrative structure (mandatory):",
                "1) Executive takeaway — one direct sentence.",
                "2) Top evidence — up to 3 bullets with chart numbers only.",
                "3) Recommended action — one hedged next step.",
                "4) Details — optional, brief.",
                "- Lead with the takeaway; avoid process narration (do not open with "
                '"I will" or "Let me").',
                "- Keep sections 1–3 under ~180 words.",
            ]
        )

    if _is_concentration_risk_question(question, analysis_ctx):
        lines.extend(
            [
                "",
                "Concentration / risk wording:",
                "- Use only available dimensions/metrics from the chart.",
                "- Prefer: revenue concentration, geographic dependency, portfolio concentration, "
                "channel dependency.",
            ]
        )
        if not phrase_allowed_in_dataset("market penetration", df):
            lines.append(
                '- Do NOT use "market penetration" — that metric is not in this dataset.'
            )

    rel = False
    if isinstance(analysis_ctx, dict):
        rel = str(analysis_ctx.get("chartTypeInternal") or "").lower() == "scatter"
        intent = analysis_ctx.get("intent") or {}
        rel = rel or (
            isinstance(intent, dict) and intent.get("primaryGoal") == "relationship"
        )
    if rel:
        lines.extend(
            [
                "",
                "Correlation guard:",
                "- Base recommendations only on Pearson/Spearman r, sample size, and chart fields.",
                "- Do not recommend generic marketing KPIs unless they appear in the result.",
            ]
        )

    return "\n".join(lines).strip()


_LIMITATION_LEAD_RE = re.compile(
    r"cannot|not available|no column|unsupported|don't have|do not have|"
    r"not in (?:the|this) (?:data|dataset)|limitation|missing metric|"
    r"does not include",
    re.I,
)


def ensure_limitation_first_lead(
    answer: str,
    unsupported_requested: Optional[Dict[str, Any]],
) -> str:
    if not answer or not unsupported_requested or not unsupported_requested.get("active"):
        return answer
    if _LIMITATION_LEAD_RE.search(answer):
        return answer
    lead = str(unsupported_requested.get("leadSentence") or "").strip()
    if not lead:
        return answer
    return f"{lead}\n\n{answer}".strip()


def sanitize_narrative_answer(
    answer: str,
    df: pd.DataFrame,
    profile: Optional[Dict[str, Any]] = None,
    question: str = "",
    unsupported_requested: Optional[Dict[str, Any]] = None,
) -> str:
    if not answer or df is None or df.empty:
        return answer

    text = ensure_limitation_first_lead(answer, unsupported_requested)
    for phrase in forbidden_narrative_phrases(df, profile):
        replacement = _SAFE_REPLACEMENTS.get(phrase, "the requested metric")
        text = re.sub(
            re.escape(phrase),
            replacement,
            text,
            flags=re.IGNORECASE,
        )

    # Standalone NPS token (word boundary).
    if not phrase_allowed_in_dataset("nps", df):
        text = re.sub(r"\bnps\b", _SAFE_REPLACEMENTS["nps"], text, flags=re.IGNORECASE)

    # Quarter mention without quarter column.
    if "quarter" in text.lower() and not _column_contains(df, "quarter"):
        text = re.sub(r"\bquarter\b", "time period", text, flags=re.IGNORECASE)

    return text.strip()


def build_unsupported_requested_metric_context(payload: Dict[str, Any]) -> str:
    """Ground-truth block when a requested metric is absent."""
    labels = ", ".join(payload.get("missingLabels") or [])
    forbidden = ", ".join(payload.get("forbiddenPhrases") or [])
    return "\n".join(
        [
            str(payload.get("leadSentence") or "").strip(),
            "",
            f"Missing requested metric(s): {labels or '—'}",
            f"Forbidden phrases in prose: {forbidden or '—'}",
            "",
            "IMPORTANT: Answer limitation-first. Do NOT substitute revenue/spend/rankings "
            "as if they answer the missing metric. Do not use forbidden phrases.",
        ]
    ).strip()
