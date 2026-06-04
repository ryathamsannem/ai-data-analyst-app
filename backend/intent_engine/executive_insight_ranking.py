"""
Rank executive-style insights by business signal (concentration, outlier, opportunity, …).
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from intent_engine.insight_card_titles import (
    build_insight_card_title,
    build_insight_dimension_card_title,
    insight_card_type_from_ranked_kind,
    resolve_executive_dimension_label,
    resolve_executive_measure_label,
    sanitize_measure_for_card_title,
)

_WEAK_RAW_AMOUNT_RE = re.compile(
    r"^[A-Za-z][\w\s\-]{0,40}\s+contributes\s+[\d,]+[kKmM]?\s*\.?$",
    re.I,
)


def _fmt_amount(v: float) -> str:
    if abs(v) >= 1_000_000:
        return f"{v / 1_000_000:.1f}M".replace(".0M", "M")
    if abs(v) >= 1000:
        return f"{v:,.0f}"
    if abs(v) >= 10:
        return f"{v:,.1f}"
    return f"{v:g}"


def _fmt_pct(pct: float) -> str:
    if pct >= 10:
        return f"{round(pct)}%"
    return f"{pct:.1f}%"


def is_weak_executive_line(text: str) -> bool:
    t = (text or "").strip()
    if not t or len(t) < 12:
        return True
    if _WEAK_RAW_AMOUNT_RE.match(t):
        return True
    if re.search(r"\bcontributes\s+[\d,]+[kKmM]?\s*\.?$", t, re.I) and "%" not in t:
        if not re.search(r"\b(dominate|share|percent|%|of total)\b", t, re.I):
            return True
    return False


def _metric_phrase(metric_label: str) -> str:
    m = sanitize_measure_for_card_title(metric_label) or "Value"
    return m.lower()


def _dim_phrase(dimension_label: str) -> str:
    return resolve_executive_dimension_label(category_axis=dimension_label).lower()


def _cohort_context_suffix(cohort_row_count: Optional[int], group_count: int) -> str:
    n = int(cohort_row_count or 0)
    if n <= 0:
        return ""
    if n < 100 or group_count <= 6:
        return f" (filtered cohort: {n:,} row(s), {group_count} group(s))"
    return ""


def rank_category_executive_insights(
    rows: List[Dict[str, Any]],
    *,
    metric_label: str = "value",
    dimension_label: str = "category",
    outlier_insights: Optional[Dict[str, Any]] = None,
    chart_kind: str = "bar",
    cohort_row_count: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Return ranked insight dicts: kind, priority, title, value, hint, narrativeLine.
    Higher priority = show first in executive cards / brief.
    """
    pairs: List[Tuple[str, float]] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        name = str(r.get("name", "")).strip()
        try:
            val = float(r.get("value"))
        except (TypeError, ValueError):
            continue
        if name and val == val:
            pairs.append((name, val))

    if len(pairs) < 2:
        return []

    pairs.sort(key=lambda x: x[1], reverse=True)
    total = sum(v for _, v in pairs)
    if total <= 1e-12:
        return []

    top_name, top_val = pairs[0]
    bot_name, bot_val = pairs[-1]
    share = 100.0 * top_val / total
    spread = top_val - bot_val
    cohort_suffix = _cohort_context_suffix(cohort_row_count, len(pairs))
    measure = resolve_executive_measure_label(
        metric_column_display=metric_label,
        value_axis=metric_label,
    )
    met = _metric_phrase(measure)
    dim = _dim_phrase(dimension_label)
    dim_plural = dim if dim.endswith("s") else f"{dim}s"

    candidates: List[Dict[str, Any]] = []

    if share >= 28:
        narrative = (
            f"{top_name} contributes {_fmt_pct(share)} of {met} "
            f"and dominates performance{cohort_suffix}."
        )
        pri = 95 if share >= 40 else 82
        card_type = insight_card_type_from_ranked_kind("concentration", pri)
        candidates.append(
            {
                "kind": "concentration",
                "priority": pri,
                "title": build_insight_card_title(measure, card_type),
                "value": _fmt_pct(share),
                "hint": narrative,
                "narrativeLine": narrative,
            }
        )
    elif share >= 18:
        narrative = (
            f"{top_name} leads with {_fmt_pct(share)} of {met} — "
            f"meaningful concentration across {dim_plural}."
        )
        candidates.append(
            {
                "kind": "concentration",
                "priority": 70,
                "title": build_insight_card_title(measure, "share"),
                "value": _fmt_pct(share),
                "hint": narrative,
                "narrativeLine": narrative,
            }
        )

    if outlier_insights and isinstance(outlier_insights, dict):
        for bucket, kind in (("highOutliers", "outlier"), ("lowOutliers", "risk")):
            items = outlier_insights.get(bucket) or []
            if not isinstance(items, list):
                continue
            for item in items[:1]:
                if not isinstance(item, dict):
                    continue
                phrase = str(item.get("phrase") or "").strip()
                name = str(item.get("name") or "").strip()
                if not phrase and not name:
                    continue
                narrative = phrase or f"{name} is an outlier vs peer {dim_plural}."
                if is_weak_executive_line(narrative):
                    continue
                card_t = "outlier" if kind == "outlier" else "risk"
                candidates.append(
                    {
                        "kind": kind,
                        "priority": 88 if kind == "outlier" else 75,
                        "title": build_insight_card_title(measure, card_t),
                        "value": name or "—",
                        "hint": narrative,
                        "narrativeLine": narrative,
                    }
                )

    gap_pct = (spread / top_val * 100.0) if top_val > 1e-9 else None
    if gap_pct is not None and gap_pct >= 15:
        narrative = (
            f"{top_name} leads {bot_name} by {_fmt_amount(spread)} "
            f"({_fmt_pct(gap_pct)} spread) on {met}."
        )
        candidates.append(
            {
                "kind": "opportunity",
                "priority": 65,
                "title": build_insight_card_title(measure, "gap"),
                "value": _fmt_amount(spread),
                "hint": narrative,
                "narrativeLine": narrative,
            }
        )

    if chart_kind in ("line", "area") and len(pairs) >= 3:
        last = pairs[-1][1]
        prev = pairs[-2][1]
        if prev > 1e-9:
            chg = 100.0 * (last - prev) / prev
            if abs(chg) >= 8:
                direction = "up" if chg > 0 else "down"
                narrative = (
                    f"Latest period moved {direction} {_fmt_pct(abs(chg))} vs prior bucket on {met}."
                )
                candidates.append(
                    {
                        "kind": "trend",
                        "priority": 72,
                        "title": build_insight_card_title(measure, "trend"),
                        "value": _fmt_pct(abs(chg)),
                        "hint": narrative,
                        "narrativeLine": narrative,
                    }
                )

    # Fallback leader line (lower priority than concentration %).
    if not any(c["kind"] == "concentration" for c in candidates):
        narrative = (
            f"{top_name} ranks highest on {met} at {_fmt_amount(top_val)}{cohort_suffix}."
        )
        if not is_weak_executive_line(narrative):
            candidates.append(
                {
                    "kind": "ranking",
                    "priority": 45,
                    "title": build_insight_dimension_card_title(
                        dimension_label, "leader"
                    ),
                    "value": top_name[:44],
                    "hint": narrative,
                    "narrativeLine": narrative,
                }
            )

    seen: set = set()
    out: List[Dict[str, Any]] = []
    for c in sorted(candidates, key=lambda x: -int(x.get("priority") or 0)):
        line = str(c.get("narrativeLine") or "").strip()
        if not line or is_weak_executive_line(line):
            continue
        key = line.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out[:5]


def executive_insight_prompt_block(
    ranked: List[Dict[str, Any]],
    *,
    cohort_row_count: Optional[int] = None,
) -> str:
    if not ranked:
        return ""
    lines = [
        "Ranked executive insights (prefer these phrasings in Key findings):",
    ]
    n = int(cohort_row_count or 0)
    if n > 0 and n < 100:
        lines.append(
            f"- Cohort size: **{n:,} filtered row(s)** — mention sample size once; "
            "avoid generic \"performance varies\" without citing the chart leader."
        )
    for i, item in enumerate(ranked[:4], 1):
        nl = str(item.get("narrativeLine") or "").strip()
        if nl:
            lines.append(f"{i}. {nl}")
    lines.append(
        "- Avoid weak lines that only state a raw amount without share-of-total "
        "or peer context (e.g. \"East contributes 116k\")."
    )
    return "\n".join(lines)
