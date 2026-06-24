"""
Deterministic evidence-backed "why" follow-up reasoning (Phase B).

Reuses parent chart context and reasoningBlocks — not full root-cause analysis.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Sequence

import pandas as pd

WhyFollowupContext = Dict[str, Any]

_WHY_BARE_RE = re.compile(r"^\s*why\s*\??\s*$", re.I)
_WHY_EXPLAIN_BARE_RE = re.compile(
    r"^\s*(why|explain)(\s+that|\s+this|\s+it)?\s*\??\s*$", re.I
)
_WHY_ENTITY_RANK_RE = re.compile(
    r"\bwhy\s+is\b.+\b(highest|lowest|top|leading|largest|best|worst|most|high|low)\b",
    re.I,
)
_WHY_TREND_RE = re.compile(
    r"\bwhy\s+did\b.+\b(increase|decrease|rise|fall|grow|decline|improve|drop)\b",
    re.I,
)
_WHY_UNDERPERFORM_RE = re.compile(
    r"\bwhy\s+is\b.+\b(underperform(?:ing)?|overperform(?:ing)?)\b",
    re.I,
)
_WHY_SEGMENT_LEADING_RE = re.compile(
    r"\bwhy\s+is\b.+\b(segment|category|region|department|product)\b.+\b(leading|highest|top)\b",
    re.I,
)
_WHY_EXPLAINS_RE = re.compile(
    r"\bwhat\s+explains\b.+\b(highest|lowest|being|increase|decrease)\b",
    re.I,
)
_WHY_ATTRITION_RE = re.compile(
    r"\bwhy\s+is\b.+\battrition\b", re.I
)

_ENTITY_FROM_QUESTION_RE = re.compile(
    r"\bwhy\s+is\s+([A-Za-z][A-Za-z0-9\s&'\-/]{1,40}?)\s+"
    r"(?:highest|lowest|top|leading|largest|best|worst|most|high|low|underperform)",
    re.I,
)


def is_why_followup_question(q: str) -> bool:
    """True for short why/explain follow-ups and entity/trend why questions."""
    s = (q or "").strip()
    if not s:
        return False
    if _WHY_BARE_RE.match(s) or _WHY_EXPLAIN_BARE_RE.match(s):
        return True
    if len(s) > 140:
        return False
    return bool(
        _WHY_ENTITY_RANK_RE.search(s)
        or _WHY_TREND_RE.search(s)
        or _WHY_UNDERPERFORM_RE.search(s)
        or _WHY_SEGMENT_LEADING_RE.search(s)
        or _WHY_EXPLAINS_RE.search(s)
        or _WHY_ATTRITION_RE.search(s)
        or re.search(r"^\s*why\s+(?:is|are|does|did|was|were)\b", s, re.I)
    )


def _pretty_label(col_or_phrase: str) -> str:
    return re.sub(r"\s+", " ", str(col_or_phrase or "").replace("_", " ")).strip()


def _norm_col(name: str) -> str:
    return re.sub(r"[_\s]+", " ", str(name).lower()).strip()


def _extract_entity_from_question(q: str) -> Optional[str]:
    m = _ENTITY_FROM_QUESTION_RE.search(q or "")
    if not m:
        return None
    ent = m.group(1).strip()
    if len(ent) < 2:
        return None
    return ent.title() if ent.islower() else ent


def _leader_from_evidence(
    reasoning_blocks: Sequence[Dict[str, Any]],
    labels: Sequence[Any],
) -> Optional[str]:
    for b in reasoning_blocks:
        if not isinstance(b, dict):
            continue
        ent = b.get("entity")
        if isinstance(ent, str) and ent.strip():
            return ent.strip()
    if labels:
        return str(labels[0]).strip() or None
    return None


def _build_observation(
    *,
    entity: Optional[str],
    metric_label: str,
    dimension_label: str,
    parent_question: str,
    is_trend: bool,
) -> str:
    met = metric_label or "the metric"
    dim = dimension_label or "category"
    if is_trend:
        return (
            f"The trend analysis for {met} over {dim} shows how the latest periods "
            f"compare to earlier ones."
        )
    if entity:
        return (
            f"{entity} stands out in the prior analysis of {met} by {dim} "
            f"(scope: {parent_question.strip()[:120]})."
        )
    return (
        f"The prior analysis highlights how {met} varies across {dim} "
        f"(scope: {parent_question.strip()[:120]})."
    )


def _build_interpretation(
    reasoning_blocks: Sequence[Dict[str, Any]],
    *,
    is_trend: bool,
) -> str:
    if not reasoning_blocks:
        return (
            "The available evidence describes what the prior chart shows; "
            "it may indicate patterns worth exploring but does not prove operational drivers."
        )
    types = {str(b.get("type") or "") for b in reasoning_blocks if isinstance(b, dict)}
    parts: List[str] = []
    if "contribution" in types:
        parts.append("the metric appears concentrated among leading groups")
    if "leader_laggard_gap" in types:
        parts.append("there is a meaningful spread between the strongest and weakest groups")
    if "trend_movement" in types or is_trend:
        parts.append("recent periods moved relative to the prior period")
    joined = ", and ".join(parts) if parts else "the prior aggregates show a standout pattern"
    return (
        f"Taken together, {joined}. "
        "This may indicate where to investigate next, but it is not proven causation."
    )


_LIMITATIONS = (
    "These points describe observed aggregates from the prior chart — not verified root causes, "
    "external drivers, or recommendations."
)


def _id_like_column(name: str) -> bool:
    n = _norm_col(name)
    return n.endswith(" id") or n == "id" or "customer id" in n


def suggest_next_drilldowns(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    *,
    metric_col: Optional[str],
    category_col: Optional[str],
    entity: Optional[str],
    parent_question: str = "",
) -> List[str]:
    """Practical next questions from available schema columns."""
    if df is None or df.empty:
        return []

    ct = profile.get("column_types", {}) if profile else {}
    cols = [str(c) for c in df.columns.tolist()]
    cats = [
        c
        for c in cols
        if ct.get(c) in ("category", "text") and not _id_like_column(c)
    ]
    dates = [
        c
        for c in cols
        if ct.get(c) == "date" or _norm_col(c) in ("month", "order date", "hire date")
    ]
    nums = [c for c in cols if ct.get(c) == "number"]

    metric_col = (metric_col or "").strip() or None
    category_col = (category_col or "").strip() or None
    ql = _norm_col(parent_question)

    out: List[str] = []
    seen: set[str] = set()

    def _add(text: str) -> None:
        t = re.sub(r"\s+", " ", text.strip())
        key = t.lower()
        if not t or key in seen:
            return
        seen.add(key)
        out.append(t)

    # Secondary breakdown within entity or across dimension
    for c in cats:
        if c == category_col:
            continue
        lab = _pretty_label(c)
        if entity and category_col:
            _add(f"Compare {entity} by {lab.lower()}.")
        elif category_col:
            _add(f"Compare {_pretty_label(category_col).lower()} by {lab.lower()}.")
        if len(out) >= 2:
            break

    # Trend drill for entity or overall
    date_col = dates[0] if dates else None
    if date_col and metric_col:
        mlab = _pretty_label(metric_col).lower()
        dlab = _pretty_label(date_col).lower()
        if entity:
            _add(f"Show {mlab} trend for {entity} by {dlab}.")
        else:
            _add(f"Show {mlab} trend by {dlab}.")

    # Domain-flavoured extras from column tokens
    if "utilization" in _norm_col(metric_col or "") or "utilization" in ql:
        for c in cats:
            if "segment" in _norm_col(c):
                _add(f"Compare utilization_pct by {_pretty_label(c).lower()}.")
                break
    if "attrition" in ql or (metric_col and "attrition" in _norm_col(metric_col)):
        for c in nums + cats:
            if any(t in _norm_col(c) for t in ("tenure", "engagement", "job", "level")):
                _add(f"Compare attrition by {_pretty_label(c).lower()}.")
                break
    if "loan" in ql or (metric_col and "loan" in _norm_col(metric_col)):
        for c in cats:
            if any(t in _norm_col(c) for t in ("product", "segment", "type")):
                _add(
                    f"Compare {_pretty_label(metric_col or 'loan balance').lower()} "
                    f"by {_pretty_label(c).lower()}."
                )
                break
        for c in cats:
            if "delinquency" in _norm_col(c) or c == "delinquency_flag":
                _add(f"Show delinquency by {_pretty_label(c).lower()}.")
                break

    if entity and category_col and len(out) < 3:
        _add(
            f"Compare {entity} against other {_pretty_label(category_col).lower()}s "
            f"on {_pretty_label(metric_col or 'the same metric').lower()}."
        )

    return out[:4]


def build_why_followup_context(
    *,
    follow_up_question: str,
    parent_question: str,
    analysis_ctx: Dict[str, Any],
    reasoning_blocks: Sequence[Dict[str, Any]],
    visualization: Optional[Dict[str, Any]],
    exact_result: str = "",
    df: Optional[pd.DataFrame] = None,
    profile: Optional[Dict[str, Any]] = None,
) -> WhyFollowupContext:
    labels = list((visualization or {}).get("labels") or [])
    metric_col = str(analysis_ctx.get("metricColumn") or "").strip() or None
    category_col = str(analysis_ctx.get("categoryColumn") or "").strip() or None
    metric_label = str(
        analysis_ctx.get("metricColumnDisplay")
        or analysis_ctx.get("metricColumn")
        or "value"
    ).replace("_", " ")
    dimension_label = str(
        analysis_ctx.get("categoryColumnDisplay")
        or analysis_ctx.get("categoryColumn")
        or "category"
    ).replace("_", " ")

    ct = str(analysis_ctx.get("chartTypeInternal") or "").lower()
    is_trend = ct in ("line", "area") or bool(
        analysis_ctx.get("intent")
        and isinstance(analysis_ctx.get("intent"), dict)
        and (analysis_ctx.get("intent") or {}).get("primaryGoal") == "trend"
    )

    entity = _extract_entity_from_question(follow_up_question)
    if not entity:
        entity = _leader_from_evidence(reasoning_blocks, labels)

    evidence = [
        dict(b)
        for b in reasoning_blocks
        if isinstance(b, dict) and str(b.get("claim") or "").strip()
    ][:3]

    next_qs: List[str] = []
    if df is not None and profile is not None:
        next_qs = suggest_next_drilldowns(
            df,
            profile,
            metric_col=metric_col,
            category_col=category_col,
            entity=entity,
            parent_question=parent_question,
        )

    return {
        "type": "why_followup",
        "followUpQuestion": follow_up_question.strip(),
        "parentQuestion": parent_question.strip(),
        "entity": entity,
        "metric": metric_label,
        "metricColumn": metric_col,
        "dimension": dimension_label,
        "dimensionColumn": category_col,
        "observation": _build_observation(
            entity=entity,
            metric_label=metric_label,
            dimension_label=dimension_label,
            parent_question=parent_question,
            is_trend=is_trend,
        ),
        "evidence": evidence,
        "interpretation": _build_interpretation(evidence, is_trend=is_trend),
        "limitations": _LIMITATIONS,
        "nextQuestions": next_qs,
        "exactResultExcerpt": (exact_result or "")[:1200],
    }


def attach_why_followup_to_analysis(
    analysis_ctx: Dict[str, Any],
    *,
    follow_up_question: str,
    parent_question: str,
    visualization: Optional[Dict[str, Any]],
    exact_result: str = "",
    df: Optional[pd.DataFrame] = None,
    profile: Optional[Dict[str, Any]] = None,
    parent_reasoning_blocks: Optional[Sequence[Dict[str, Any]]] = None,
) -> None:
    """Mutates analysis_ctx — adds whyFollowupContext when evidence is available."""
    if not analysis_ctx or not isinstance(analysis_ctx, dict):
        return
    if not is_why_followup_question(follow_up_question):
        return

    blocks: List[Dict[str, Any]] = []
    raw = analysis_ctx.get("reasoningBlocks")
    if isinstance(raw, list) and raw:
        blocks = [b for b in raw if isinstance(b, dict)]
    elif parent_reasoning_blocks:
        blocks = [b for b in parent_reasoning_blocks if isinstance(b, dict)]

    ctx = build_why_followup_context(
        follow_up_question=follow_up_question,
        parent_question=parent_question,
        analysis_ctx=analysis_ctx,
        reasoning_blocks=blocks,
        visualization=visualization,
        exact_result=exact_result,
        df=df,
        profile=profile,
    )
    analysis_ctx["whyFollowupContext"] = ctx
    analysis_ctx["whyFollowup"] = True


def why_followup_prompt_block(ctx: WhyFollowupContext) -> str:
    """Structured why context for Claude — observation only, explicit limitations."""
    if not ctx or ctx.get("type") != "why_followup":
        return ""

    lines = [
        "Why follow-up context (mandatory — answer the user's why using ONLY this evidence):",
        f"- Parent analysis scope: {ctx.get('parentQuestion') or '—'}",
        f"- Observation: {ctx.get('observation') or '—'}",
        f"- Limitations: {ctx.get('limitations') or '—'}",
        "- Do NOT use caused by, because of, or root cause is unless decomposition logic exists.",
        "- Allowed phrasing: appears concentrated in, may indicate, is associated with, "
        "stands out because, the evidence shows.",
        "- Keep the answer concise (about 90–130 words). Do NOT repeat the same percentages "
        "or values more than once — the app shows evidence bullets separately under "
        "\"Why this matters\".",
        "- Do NOT use Key findings / What this may indicate / Suggested next steps labels.",
        "- Use this plain-text format (blank lines between blocks, no section headings):",
        "  Line 1: Based on the previous {metric}-by-{dimension} result, {entity} stands out because …",
        "  Lines 2–4: Numbered evidence (1. … 2. … 3. …) OR two short sentences.",
        "  Line 5: One limitation sentence (does not prove root cause / not proven causation).",
        "  Line 6: Next, … (one drill-down sentence from suggested questions).",
    ]

    ent = ctx.get("entity")
    if ent:
        lines.append(f"- Focus entity: {ent}")

    evidence = ctx.get("evidence") or []
    if evidence:
        lines.append("- Evidence (authoritative):")
        for i, b in enumerate(evidence[:3], start=1):
            if not isinstance(b, dict):
                continue
            claim = str(b.get("claim") or "").strip()
            if claim:
                lines.append(f"  {i}. {claim}")

    interp = str(ctx.get("interpretation") or "").strip()
    if interp:
        lines.append(f"- Interpretation hint (deterministic): {interp}")

    next_qs = ctx.get("nextQuestions") or []
    if next_qs:
        lines.append("- Suggested next drill-down questions:")
        for nq in next_qs[:4]:
            lines.append(f"  • {nq}")

    return "\n".join(lines)


def merge_parent_reasoning_blocks(
    analysis_ctx: Dict[str, Any],
    parent_blocks: Optional[Sequence[Dict[str, Any]]],
) -> None:
    """Prefer current reasoningBlocks; fall back to parent snapshot."""
    if not isinstance(analysis_ctx, dict):
        return
    current = analysis_ctx.get("reasoningBlocks")
    if isinstance(current, list) and current:
        return
    if parent_blocks:
        analysis_ctx["reasoningBlocks"] = [
            dict(b) for b in parent_blocks if isinstance(b, dict)
        ]
