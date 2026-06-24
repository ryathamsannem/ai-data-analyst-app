"""
Deterministic structured reasoning blocks for AI Insights (Phase A).

Rule-based evidence objects attached to analysis payloads — not LLM-generated.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

ReasoningBlockType = str  # contribution | leader_laggard_gap | trend_movement | evidence
ConfidenceBand = str  # high | medium | low

MIN_CONTRIBUTION_SHARE_PCT = 15.0
MIN_TOP3_CONCENTRATION_PCT = 40.0
MIN_GAP_RATIO = 1.5
MIN_TREND_CHANGE_PCT = 5.0
MIN_GROUPS_FOR_GAP = 2
MAX_REASONING_BLOCKS = 3

REASON_TOP_SHARE = "Shows how much of the total this group represents."
REASON_TOP3_CONCENTRATION = "Shows how concentrated the metric is among the top groups."
REASON_LEADER_LAGGARD = "Shows the spread between the strongest and weakest group."
REASON_TREND_MOVEMENT = "Compares the latest period to the one before it."
REASON_DEFAULT = "Based on the current grouped analysis."


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


def _parse_pairs(rows: List[Dict[str, Any]]) -> List[Tuple[str, float]]:
    pairs: List[Tuple[str, float]] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        name = str(r.get("name", "")).strip()
        try:
            val = float(r.get("value"))
        except (TypeError, ValueError):
            continue
        if name and val == val and math.isfinite(val):
            pairs.append((name, val))
    return pairs


def _block_confidence(
    cohort_n: Optional[int],
    *,
    base_level: Optional[str] = None,
    sparse: bool = False,
) -> ConfidenceBand:
    if sparse:
        return "low"
    bl = (base_level or "").strip().lower()
    if bl in ("high", "medium", "low"):
        if bl == "high" and cohort_n is not None and cohort_n < 30:
            return "medium"
        return bl  # type: ignore[return-value]
    n = int(cohort_n or 0)
    if n >= 100:
        return "high"
    if n >= 30:
        return "medium"
    return "low"


def _make_block(
    *,
    block_type: ReasoningBlockType,
    claim: str,
    metric: Optional[str],
    dimension: Optional[str],
    entity: Optional[str],
    value: Optional[float],
    comparison_value: Optional[float],
    share_pct: Optional[float],
    gap_ratio: Optional[float],
    cohort_n: Optional[int],
    confidence: ConfidenceBand,
    reason: str,
) -> Dict[str, Any]:
    return {
        "type": block_type,
        "claim": claim,
        "metric": metric,
        "dimension": dimension,
        "entity": entity,
        "value": value,
        "comparisonValue": comparison_value,
        "sharePct": share_pct,
        "gapRatio": gap_ratio,
        "cohortN": cohort_n,
        "confidence": confidence,
        "reason": reason,
    }


def build_contribution_blocks(
    pairs: List[Tuple[str, float]],
    *,
    metric_label: str,
    dimension_label: str,
    cohort_n: Optional[int],
    confidence_level: Optional[str] = None,
) -> List[Dict[str, Any]]:
    if len(pairs) < 2:
        return []
    total = sum(v for _, v in pairs)
    if total <= 1e-12:
        return []

    sorted_pairs = sorted(pairs, key=lambda x: x[1], reverse=True)
    top_name, top_val = sorted_pairs[0]
    share = 100.0 * top_val / total
    if share < MIN_CONTRIBUTION_SHARE_PCT:
        return []

    dim = dimension_label.strip() or "category"
    met = metric_label.strip() or "value"
    conf = _block_confidence(cohort_n, base_level=confidence_level)

    blocks: List[Dict[str, Any]] = [
        _make_block(
            block_type="contribution",
            claim=f"{top_name} contributes {_fmt_pct(share)} of total {met.lower()}.",
            metric=met,
            dimension=dim,
            entity=top_name,
            value=top_val,
            comparison_value=total,
            share_pct=round(share, 2),
            gap_ratio=None,
            cohort_n=cohort_n,
            confidence=conf,
            reason=REASON_TOP_SHARE,
        )
    ]

    if len(sorted_pairs) >= 3:
        top3_share = 100.0 * sum(v for _, v in sorted_pairs[:3]) / total
        if top3_share >= MIN_TOP3_CONCENTRATION_PCT and top3_share > share + 5:
            blocks.append(
                _make_block(
                    block_type="contribution",
                    claim=(
                        f"Top 3 {dim.lower()}s account for {_fmt_pct(top3_share)} "
                        f"of total {met.lower()}."
                    ),
                    metric=met,
                    dimension=dim,
                    entity=None,
                    value=sum(v for _, v in sorted_pairs[:3]),
                    comparison_value=total,
                    share_pct=round(top3_share, 2),
                    gap_ratio=None,
                    cohort_n=cohort_n,
                    confidence=conf,
                    reason=REASON_TOP3_CONCENTRATION,
                )
            )

    return blocks


def build_leader_laggard_gap_blocks(
    pairs: List[Tuple[str, float]],
    *,
    metric_label: str,
    dimension_label: str,
    cohort_n: Optional[int],
    confidence_level: Optional[str] = None,
) -> List[Dict[str, Any]]:
    if len(pairs) < MIN_GROUPS_FOR_GAP:
        return []

    sorted_pairs = sorted(pairs, key=lambda x: x[1], reverse=True)
    leader_name, leader_val = sorted_pairs[0]
    laggard_name, laggard_val = sorted_pairs[-1]
    if leader_name == laggard_name:
        return []

    gap = leader_val - laggard_val
    if gap <= 1e-12:
        return []

    dim = dimension_label.strip() or "category"
    met = metric_label.strip() or "value"
    conf = _block_confidence(cohort_n, base_level=confidence_level)

    ratio_block: Optional[Dict[str, Any]] = None
    absolute_block: Optional[Dict[str, Any]] = None

    if laggard_val > 1e-12 and leader_val > 0:
        ratio = leader_val / laggard_val
        if ratio >= MIN_GAP_RATIO:
            ratio_block = _make_block(
                block_type="leader_laggard_gap",
                claim=(
                    f"{leader_name} is {ratio:.1f}x higher than {laggard_name} "
                    f"on {met.lower()}."
                ),
                metric=met,
                dimension=dim,
                entity=leader_name,
                value=leader_val,
                comparison_value=laggard_val,
                share_pct=None,
                gap_ratio=round(ratio, 2),
                cohort_n=cohort_n,
                confidence=conf,
                reason=REASON_LEADER_LAGGARD,
            )

    if gap >= max(abs(leader_val) * 0.05, 1.0):
        absolute_block = _make_block(
            block_type="leader_laggard_gap",
            claim=(
                f"{leader_name} exceeds {laggard_name} by {_fmt_amount(gap)} "
                f"{met.lower()}."
            ),
            metric=met,
            dimension=dim,
            entity=leader_name,
            value=leader_val,
            comparison_value=laggard_val,
            share_pct=None,
            gap_ratio=(
                round(leader_val / laggard_val, 2)
                if laggard_val > 1e-12
                else None
            ),
            cohort_n=cohort_n,
            confidence=conf,
            reason=REASON_LEADER_LAGGARD,
        )

    # Prefer one readable gap: ratio when meaningful, otherwise absolute.
    if ratio_block is not None:
        return [ratio_block]
    if absolute_block is not None:
        return [absolute_block]
    return []


def build_trend_movement_blocks(
    pairs: List[Tuple[str, float]],
    *,
    metric_label: str,
    cohort_n: Optional[int],
    confidence_level: Optional[str] = None,
) -> List[Dict[str, Any]]:
    if len(pairs) < 2:
        return []

    prev_name, prev_val = pairs[-2]
    last_name, last_val = pairs[-1]
    if abs(prev_val) <= 1e-12:
        return []

    chg_pct = 100.0 * (last_val - prev_val) / abs(prev_val)
    if abs(chg_pct) < MIN_TREND_CHANGE_PCT:
        return []

    met = metric_label.strip() or "value"
    direction = "increased" if chg_pct > 0 else "decreased"
    conf = _block_confidence(cohort_n, base_level=confidence_level)

    return [
        _make_block(
            block_type="trend_movement",
            claim=(
                f"{met} {direction} {_fmt_pct(abs(chg_pct))} in the latest period "
                f"({last_name}) vs the prior period ({prev_name})."
            ),
            metric=met,
            dimension="time",
            entity=last_name,
            value=last_val,
            comparison_value=prev_val,
            share_pct=round(chg_pct, 2),
            gap_ratio=None,
            cohort_n=cohort_n,
            confidence=conf,
            reason=REASON_TREND_MOVEMENT,
        )
    ]


def _assemble_ranking_blocks(
    contribution: List[Dict[str, Any]],
    gap: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Up to 3 blocks: top share, optional top-3 concentration, one gap."""
    out: List[Dict[str, Any]] = []
    for b in contribution:
        out.append(b)
        if len(out) >= 2:
            break
    if gap:
        out.append(gap[0])
    return out[:MAX_REASONING_BLOCKS]


def build_reasoning_blocks(
    rows: List[Dict[str, Any]],
    *,
    chart_kind: str,
    metric_label: str = "value",
    dimension_label: str = "category",
    cohort_row_count: Optional[int] = None,
    confidence_level: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Build deterministic reasoning blocks from chart series rows.
    """
    pairs = _parse_pairs(rows)
    if len(pairs) < 2:
        return []

    kind = (chart_kind or "bar").strip().lower().replace("-", "_")
    is_trend = kind in ("line", "area")

    if is_trend:
        trend_blocks = build_trend_movement_blocks(
            pairs,
            metric_label=metric_label,
            cohort_n=cohort_row_count,
            confidence_level=confidence_level,
        )
        return trend_blocks[:1]

    contrib = build_contribution_blocks(
        pairs,
        metric_label=metric_label,
        dimension_label=dimension_label,
        cohort_n=cohort_row_count,
        confidence_level=confidence_level,
    )
    gap = build_leader_laggard_gap_blocks(
        pairs,
        metric_label=metric_label,
        dimension_label=dimension_label,
        cohort_n=cohort_row_count,
        confidence_level=confidence_level,
    )
    return _assemble_ranking_blocks(contrib, gap)


def attach_reasoning_blocks_to_analysis(
    analysis: Dict[str, Any],
    *,
    labels: List[Any],
    values: List[Any],
) -> None:
    """Mutates analysis dict — adds reasoningBlocks when evidence is available."""
    if not analysis or not isinstance(analysis, dict):
        return
    ct = str(
        analysis.get("chartTypeInternal") or analysis.get("chartType") or "bar"
    ).lower()
    if ct == "scatter":
        return

    rows: List[Dict[str, Any]] = []
    for i, lab in enumerate(labels or []):
        if i >= len(values or []):
            break
        try:
            val = float(values[i])
        except (TypeError, ValueError):
            continue
        name = str(lab).strip()
        if name:
            rows.append({"name": name, "value": val})

    metric = (
        str(analysis.get("metricColumnDisplay") or "").strip()
        or str(analysis.get("metricColumn") or "").strip()
        or "value"
    )
    dimension = (
        str(analysis.get("categoryColumnDisplay") or "").strip()
        or str(analysis.get("categoryColumn") or "").strip()
        or "category"
    )
    cohort = analysis.get("analysisRowCount")
    try:
        cohort_n = int(cohort) if cohort is not None else None
    except (TypeError, ValueError):
        cohort_n = None

    blocks = build_reasoning_blocks(
        rows,
        chart_kind=ct,
        metric_label=metric,
        dimension_label=dimension,
        cohort_row_count=cohort_n,
        confidence_level=str(analysis.get("insightConfidenceLevel") or ""),
    )
    if blocks:
        analysis["reasoningBlocks"] = blocks


def reasoning_blocks_prompt_block(blocks: List[Dict[str, Any]]) -> str:
    """Structured evidence for Claude narrative — observations only, no causation."""
    if not blocks:
        return ""
    lines = [
        "Structured reasoning evidence (authoritative — use as factual support only):",
        "- Treat each item as an observation backed by pre-computed chart aggregates.",
        "- Do not invent causes, drivers, or external explanations beyond this list.",
        "- Distinguish: (1) what the numbers show, (2) cautious interpretation, "
        "(3) a sensible next question — not proven root cause.",
    ]
    for i, b in enumerate(blocks[:MAX_REASONING_BLOCKS], start=1):
        if not isinstance(b, dict):
            continue
        claim = str(b.get("claim") or "").strip()
        if not claim:
            continue
        conf = str(b.get("confidence") or "medium").strip()
        reason = str(b.get("reason") or "").strip()
        lines.append(f"{i}. [{conf}] {claim}")
        if reason:
            lines.append(f"   Basis: {reason}")
    return "\n".join(lines)
