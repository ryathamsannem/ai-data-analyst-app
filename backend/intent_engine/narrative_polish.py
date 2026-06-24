"""
Executive and follow-up narrative polish for /ask Claude prose.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Optional

import pandas as pd

from intent_engine.narrative_guardrails import (
    _EXECUTIVE_RE,
    _column_contains,
    _is_executive_question,
)

_EXECUTIVE_SUMMARY_RE = re.compile(
    r"\b("
    r"executive\s+summary|summarize\s+business|business\s+performance|"
    r"biggest\s+risks?|biggest\s+opportunit(?:y|ies)|biggest\s+marketing|"
    r"concentration\s+risk|portfolio\s+opportunit(?:y|ies)|credit\s+risk|"
    r"overly\s+concentrat|management\s+priority|what\s+are\s+the\s+biggest"
    r")\b",
    re.I,
)

_WHY_FOLLOW_UP_RE = re.compile(
    r"^\s*(?:why|explain)\b|^\s*what\s+explains\b",
    re.I,
)
_COLUMNS_USED_RE = re.compile(
    r"\bwhich\s+columns?\s+(?:were\s+)?(?:used|involved)\b|"
    r"\bwhat\s+columns?\s+(?:did\s+you\s+use|were\s+used)\b",
    re.I,
)
_CALCULATIONS_RE = re.compile(
    r"\bshow\s+(?:the\s+)?calculations?\s+behind\b|"
    r"\bhow\s+(?:was|were)\s+(?:this|these)\s+(?:calculated|computed)\b",
    re.I,
)
_EVIDENCE_RE = re.compile(r"\bwhat\s+evidence\s+supports\b", re.I)

_GRAMMAR_FIX_RE = re.compile(
    r"\b(?:an|a)\s+the\s+requested\b",
    re.I,
)
_DUPLICATE_REQUESTED_RE = re.compile(
    r"\bthe requested(?:\s+the requested)+\b",
    re.I,
)
_QUARTER_LABEL_RE = re.compile(r"^Q[1-4]\b", re.I)
_FRACTION_QUARTER_RE = re.compile(
    r"\b(?:one|two|three|four|five|\d+)\s*-\s*quarters?\b",
    re.I,
)
_MALFORMED_HEDGING_RE = re.compile(
    r"\b(?:could\s+may|may\s+could|could\s+could|may\s+may)\b",
    re.I,
)
_THREE_TIME_PERIOD_RE = re.compile(
    r"\bthree-time\s+period\b",
    re.I,
)

_KEY_FINDINGS_RE = re.compile(r"^\s*Key findings\s*:?\s*", re.I | re.M)
_MAY_INDICATE_RE = re.compile(r"^\s*What this may indicate\s*:?\s*", re.I | re.M)
_NEXT_STEPS_RE = re.compile(
    r"^\s*(?:Suggested next steps|Next steps)\s*:?\s*",
    re.I | re.M,
)
_TOP_EVIDENCE_RE = re.compile(r"^\s*Top evidence\s*:?\s*", re.I | re.M)


def is_executive_narrative_question(
    question: str, analysis_ctx: Optional[Dict[str, Any]]
) -> bool:
    if _is_executive_question(question, analysis_ctx):
        return True
    if isinstance(analysis_ctx, dict):
        intent = analysis_ctx.get("intent") or {}
        if isinstance(intent, dict):
            goal = str(intent.get("primaryGoal") or "").lower()
            if goal in ("executive", "summary", "executive_summary"):
                return True
        bucket = str(analysis_ctx.get("executiveAmbiguousBucket") or "")
        if bucket:
            return True
    return bool(_EXECUTIVE_SUMMARY_RE.search(str(question or "")))


def executive_narrative_prompt_block(
    question: str,
    analysis_ctx: Optional[Dict[str, Any]],
) -> str:
    if not is_executive_narrative_question(question, analysis_ctx):
        return ""
    return "\n".join(
        [
            "Executive answer format (mandatory — replace Key findings / What this may indicate):",
            "Executive takeaway:",
            "<one direct sentence answering the question>",
            "",
            "Evidence:",
            "- <top metric/dimension fact from chart values>",
            "- <second supporting fact>",
            "",
            "Recommended action:",
            "<one grounded action based only on available data; use hedging>",
            "",
            "Rules:",
            "- Total length 120–180 words; omit extra sections.",
            "- Do NOT use Key findings, What this may indicate, or Suggested next steps labels.",
            "- No generic strategy language; cite chart numbers, not repeated label lists.",
            "- Lead with Executive takeaway in the first line.",
        ]
    )


def _pretty_col(name: str) -> str:
    return str(name or "").replace("_", " ").strip() or "value"


def follow_up_narrative_prompt_block(
    question: str,
    *,
    sidecar: Optional[Dict[str, Any]],
    analysis_ctx: Optional[Dict[str, Any]],
) -> str:
    if not sidecar or not sidecar.get("wasFollowUp"):
        return ""
    rq = str(sidecar.get("originalFollowUp") or question or "").strip()
    if not rq:
        return ""

    metric = _pretty_col(
        (analysis_ctx or {}).get("metricColumn")
        or (analysis_ctx or {}).get("metricColumnDisplay")
    )
    cat = _pretty_col(
        (analysis_ctx or {}).get("categoryColumn")
        or (analysis_ctx or {}).get("categoryColumnDisplay")
    )
    chart_ref = str(sidecar.get("previousAnalysisSummary") or "").strip()
    root_q = str(sidecar.get("rootQuestion") or "").strip()

    lines = [
        "Follow-up continuity (mandatory):",
        f"- This is a follow-up to: {root_q or chart_ref or 'the prior analysis'}.",
        "- Do NOT answer as a brand-new standalone question.",
    ]

    if sidecar.get("whyFollowUp"):
        return ""
    if _WHY_FOLLOW_UP_RE.search(rq):
        lines.append(
            f'- Open with: "Based on the previous {metric}-by-{cat} result, …" '
            "then explain why the highlighted entity leads."
        )
    elif _EVIDENCE_RE.search(rq):
        lines.append(
            '- Open with: "For the prior chart, the evidence is: …" '
            "and cite only numbers from the authoritative chart-values block."
        )
    elif _COLUMNS_USED_RE.search(rq):
        lines.append(
            "- Answer briefly and directly: list metric column, breakdown column, "
            f"and aggregation ({metric}, {cat}, sum/mean as applicable). "
            'Open with: "For the prior chart, the calculation used …"'
        )
    elif _CALCULATIONS_RE.search(rq):
        lines.append(
            f"- State metric ({metric}), dimension ({cat}), aggregation, and top result. "
            'Open with: "For the prior chart, the calculation used …"'
        )
    else:
        lines.append(
            '- Reference the prior insight explicitly (e.g. "Based on the previous result …").'
        )

    lines.append("- Keep follow-up answers shorter than a fresh executive summary.")
    return "\n".join(lines)


def normalize_executive_sections(answer: str) -> str:
    if not answer or re.search(r"^\s*Executive takeaway\s*:", answer, re.I | re.M):
        return answer
    text = answer
    if _KEY_FINDINGS_RE.search(text):
        text = _KEY_FINDINGS_RE.sub("Executive takeaway:\n", text, count=1)
    if _MAY_INDICATE_RE.search(text):
        text = _MAY_INDICATE_RE.sub("Evidence:\n", text, count=1)
    elif _TOP_EVIDENCE_RE.search(text):
        text = _TOP_EVIDENCE_RE.sub("Evidence:\n", text, count=1)
    if _NEXT_STEPS_RE.search(text):
        text = _NEXT_STEPS_RE.sub("Recommended action:\n", text, count=1)
    return text.strip()


def fix_duplicate_requested_phrase(answer: str) -> str:
    if not answer:
        return answer
    return _DUPLICATE_REQUESTED_RE.sub("the requested", answer)


def dataset_supports_quarter_wording(
    df: pd.DataFrame,
    profile: Optional[Dict[str, Any]] = None,
    analysis_ctx: Optional[Dict[str, Any]] = None,
) -> bool:
    _ = profile
    if df is not None and not df.empty and _column_contains(df, "quarter"):
        return True
    if not isinstance(analysis_ctx, dict):
        return False
    for key in ("timeSeriesMeta", "time_series_meta", "timeSeriesAnalysis"):
        block = analysis_ctx.get(key)
        if isinstance(block, dict) and str(block.get("timeBucket") or "").upper() == "Q":
            return True
    if str(analysis_ctx.get("timeBucket") or "").upper() == "Q":
        return True
    cat = str(analysis_ctx.get("categoryColumn") or "").lower()
    if "quarter" in cat:
        return True
    agg = str(
        analysis_ctx.get("aggregation")
        or analysis_ctx.get("aggregationLabel")
        or ""
    ).lower()
    if "quarter" in agg:
        return True
    for lab in analysis_ctx.get("chartLabels") or []:
        s = str(lab).strip()
        if _QUARTER_LABEL_RE.search(s) or "quarter" in s.lower():
            return True
    return False


def fix_malformed_hedging(answer: str) -> str:
    """Collapse double-modal phrases like 'could may be consistent with'."""
    if not answer:
        return answer
    text = _MALFORMED_HEDGING_RE.sub("may", answer)
    text = re.sub(r"\bcould\s+be\s+may\b", "may be", text, flags=re.I)
    text = re.sub(r"\bmay\s+be\s+could\b", "may be", text, flags=re.I)
    return text


def fix_fraction_quarter_corruption(answer: str) -> str:
    """Repair 'three-time period' artifacts from quarter sanitization."""
    if not answer:
        return answer
    text = _THREE_TIME_PERIOD_RE.sub("three-quarters", answer)
    text = re.sub(
        r"\b(?:one|two|four|five|\d+)-time\s+period\b",
        lambda m: m.group(0).replace("-time period", "-quarters"),
        text,
        flags=re.I,
    )
    return text


def sanitize_unsupported_quarter_wording(
    answer: str,
    df: pd.DataFrame,
    profile: Optional[Dict[str, Any]] = None,
    analysis_ctx: Optional[Dict[str, Any]] = None,
) -> str:
    if not answer or dataset_supports_quarter_wording(df, profile, analysis_ctx):
        return answer
    if not re.search(r"\bquarters?\b|\bquarterly\b", answer, re.I):
        return answer
    protected: Dict[str, str] = {}

    def _protect_fraction(match: re.Match[str]) -> str:
        key = f"__FRACQ_{len(protected)}__"
        protected[key] = match.group(0)
        return key

    text = _FRACTION_QUARTER_RE.sub(_protect_fraction, answer)
    text = re.sub(r"\bquarterly\b", "over time", text, flags=re.I)
    text = re.sub(r"\bquarters?\b", "time period", text, flags=re.I)
    for key, original in protected.items():
        text = text.replace(key, original)
    return fix_fraction_quarter_corruption(text)


def fix_limitation_wording(answer: str) -> str:
    if not answer:
        return answer
    text = _GRAMMAR_FIX_RE.sub("the requested", answer)
    text = re.sub(
        r"does not include\s+or\s+the requested",
        "does not include the requested",
        text,
        flags=re.I,
    )
    text = fix_duplicate_requested_phrase(text)
    return text


def apply_micro_polish(
    answer: str,
    df: pd.DataFrame,
    profile: Optional[Dict[str, Any]] = None,
    analysis_ctx: Optional[Dict[str, Any]] = None,
) -> str:
    if not answer:
        return answer
    text = fix_limitation_wording(answer)
    text = fix_malformed_hedging(text)
    text = sanitize_unsupported_quarter_wording(text, df, profile, analysis_ctx)
    text = fix_fraction_quarter_corruption(text)
    return text.strip()


def _follow_up_opener(
    question: str,
    sidecar: Dict[str, Any],
    analysis_ctx: Optional[Dict[str, Any]],
) -> str:
    metric = _pretty_col((analysis_ctx or {}).get("metricColumn"))
    cat = _pretty_col((analysis_ctx or {}).get("categoryColumn"))
    chart_ref = str(sidecar.get("previousAnalysisSummary") or "").strip()

    if _COLUMNS_USED_RE.search(question):
        ref = chart_ref or f"{metric} by {cat}"
        return f"For the prior chart ({ref}), the calculation used:"
    if _CALCULATIONS_RE.search(question):
        return (
            f"Based on the previous {metric}-by-{cat} result, "
            "the calculation used:"
        )
    if _WHY_FOLLOW_UP_RE.search(question) or _EVIDENCE_RE.search(question):
        return f"Based on the previous {metric}-by-{cat} result,"
    return f"Based on the previous {metric}-by-{cat} result,"


def ensure_follow_up_opener(
    answer: str,
    question: str,
    sidecar: Optional[Dict[str, Any]],
    analysis_ctx: Optional[Dict[str, Any]],
) -> str:
    if not answer or not sidecar or not sidecar.get("wasFollowUp"):
        return answer
    rq = str(sidecar.get("originalFollowUp") or question or "")
    head = answer[:280].lower()
    if re.search(r"\b(based on the previous|for the prior|prior chart|previous analysis)\b", head):
        return answer
    opener = _follow_up_opener(rq, sidecar, analysis_ctx)
    if answer.lstrip().lower().startswith(opener.lower().rstrip(",")):
        return answer
    return f"{opener} {answer.lstrip()}".strip()


def trim_why_followup_prose(answer: str, *, max_words: int = 130) -> str:
    """Keep why follow-ups concise — evidence also appears in the UI panel."""
    if not answer:
        return answer
    words = answer.split()
    if len(words) <= max_words:
        return answer
    return " ".join(words[:max_words]).strip()


def trim_executive_prose(answer: str, *, max_words: int = 200) -> str:
    if not answer:
        return answer
    words = answer.split()
    if len(words) <= max_words:
        return answer
    # Prefer keeping through Recommended action section
    m = re.search(r"Recommended action\s*:", answer, re.I)
    if m:
        tail = answer[m.start() :]
        tail_words = tail.split()
        if len(tail_words) <= 60:
            head_budget = max_words - len(tail_words)
            head = " ".join(words[: max(head_budget, 80)])
            return f"{head}\n\n{tail}".strip()
    return " ".join(words[:max_words]).strip()


def polish_narrative_answer(
    answer: str,
    *,
    question: str,
    analysis_ctx: Optional[Dict[str, Any]],
    sidecar: Optional[Dict[str, Any]] = None,
    executive: bool = False,
    df: Optional[pd.DataFrame] = None,
    profile: Optional[Dict[str, Any]] = None,
) -> str:
    if not answer:
        return answer
    text = answer
    if sidecar and sidecar.get("wasFollowUp"):
        text = ensure_follow_up_opener(text, question, sidecar, analysis_ctx)
    if sidecar and sidecar.get("whyFollowUp"):
        text = trim_why_followup_prose(text)
    if executive or is_executive_narrative_question(question, analysis_ctx):
        text = normalize_executive_sections(text)
        text = trim_executive_prose(text)
    if df is not None and not df.empty:
        text = apply_micro_polish(text, df, profile, analysis_ctx)
    else:
        text = fix_limitation_wording(text)
        text = fix_malformed_hedging(text)
        text = fix_fraction_quarter_corruption(text)
    return text.strip()
