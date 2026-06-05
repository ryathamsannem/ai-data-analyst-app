"""
Peer-based outlier narrative for category charts (region / zone / city) — not histogram bins.
"""

from __future__ import annotations

import statistics
from typing import Any, Dict, List, Optional, Tuple

# Minimum |deviation from median| to call a category "material" (share of median).
_MATERIAL_PCT = 0.22
# Also flag when |z vs peer mean| exceeds this (when stdev is defined).
_MATERIAL_Z = 1.0


def _fmt_amount(v: float) -> str:
    if abs(v) >= 1000:
        return f"{v:,.0f}"
    if abs(v) >= 10:
        return f"{v:,.1f}"
    return f"{v:g}"


def _median(vals: List[float]) -> float:
    if not vals:
        return 0.0
    return float(statistics.median(vals))


def _peer_phrase(dimension_label: str) -> str:
    dim = (dimension_label or "category").strip().lower()
    if not dim:
        return "peers"
    irregular = {"city": "cities", "country": "countries", "category": "categories"}
    if dim in irregular:
        plural = irregular[dim]
    elif dim.endswith("s"):
        plural = dim
    else:
        plural = f"{dim}s"
    return f"peer {plural}"


def _refine_outlier_highlights(
    pairs: List[Tuple[str, float]],
    high_out: List[Dict[str, str]],
    low_out: List[Dict[str, str]],
    *,
    peer_phrase: str,
) -> Tuple[List[Dict[str, str]], List[Dict[str, str]]]:
    """Prefer rank extremes (highest / lowest) for executive cards and narrative."""
    if not pairs:
        return high_out, low_out
    value_by_name = {name: val for name, val in pairs}
    sorted_pairs = sorted(pairs, key=lambda x: x[1], reverse=True)
    top_name, _ = sorted_pairs[0]
    bot_name, _ = sorted_pairs[-1]

    def _pick_primary(
        bucket: List[Dict[str, str]], preferred: str
    ) -> List[Dict[str, str]]:
        if not bucket:
            return []
        names = {str(item.get("name") or "") for item in bucket}
        if preferred in names:
            chosen = preferred
        elif bucket:
            if preferred == top_name:
                chosen = max(
                    bucket,
                    key=lambda item: value_by_name.get(str(item.get("name") or ""), float("-inf")),
                ).get("name", "")
            else:
                chosen = min(
                    bucket,
                    key=lambda item: value_by_name.get(str(item.get("name") or ""), float("inf")),
                ).get("name", "")
        else:
            return []
        chosen = str(chosen or "").strip()
        if not chosen:
            return []
        val = value_by_name.get(chosen)
        if val is None:
            return [item for item in bucket if str(item.get("name") or "") == chosen][:1]
        if chosen == top_name:
            phrase = f"{chosen} is the positive outlier — materially above {peer_phrase}"
        elif chosen == bot_name:
            phrase = f"{chosen} is the negative outlier — materially below {peer_phrase}"
        elif preferred == top_name:
            phrase = f"{chosen} appears materially above {peer_phrase}"
        else:
            phrase = f"{chosen} appears materially below {peer_phrase}"
        return [{"name": chosen, "phrase": phrase}]

    return (
        _pick_primary(high_out, top_name),
        _pick_primary(low_out, bot_name),
    )


def compute_categorical_outlier_insights(
    rows: List[Dict[str, Any]],
    *,
    dimension_label: str = "category",
    metric_label: str = "value",
    material_pct: float = _MATERIAL_PCT,
    material_z: float = _MATERIAL_Z,
) -> Optional[Dict[str, Any]]:
    """
    Distance-from-median / z-score outlier flags for named categories (not histogram bins).
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
        if not name or val != val:
            continue
        pairs.append((name, val))

    if len(pairs) < 3:
        return None

    names = [p[0] for p in pairs]
    vals = [p[1] for p in pairs]
    mean_v = float(statistics.mean(vals))
    med_v = _median(vals)
    stdev_v = float(statistics.stdev(vals)) if len(vals) >= 2 else 0.0

    peer_phrase = _peer_phrase(dimension_label)

    per_category: List[Dict[str, Any]] = []
    high_out: List[Dict[str, str]] = []
    low_out: List[Dict[str, str]] = []

    for name, val in pairs:
        dev_abs = val - med_v
        dev_pct: Optional[float] = None
        if abs(med_v) > 1e-9:
            dev_pct = 100.0 * dev_abs / med_v
        z: Optional[float] = None
        if stdev_v > 1e-9:
            z = (val - mean_v) / stdev_v

        materially_high = False
        materially_low = False
        if dev_pct is not None:
            if dev_pct >= 100.0 * material_pct:
                materially_high = True
            elif dev_pct <= -100.0 * material_pct:
                materially_low = True
        if z is not None:
            if z >= material_z:
                materially_high = True
            elif z <= -material_z:
                materially_low = True

        status = "within_range"
        if materially_high and (not materially_low or dev_abs > 0):
            status = "materially_above"
            phrase = f"{name} appears materially above {peer_phrase}"
            high_out.append({"name": name, "phrase": phrase})
        elif materially_low and (not materially_high or dev_abs < 0):
            status = "materially_below"
            phrase = f"{name} appears materially below {peer_phrase}"
            low_out.append({"name": name, "phrase": phrase})

        per_category.append(
            {
                "name": name,
                "value": val,
                "valueFormatted": _fmt_amount(val),
                "deviationFromMedian": dev_abs,
                "deviationFromMedianPct": dev_pct,
                "zScoreVsMean": z,
                "status": status,
            }
        )

    if not high_out and not low_out:
        return None

    high_out, low_out = _refine_outlier_highlights(
        pairs, high_out, low_out, peer_phrase=peer_phrase
    )

    return {
        "dimensionLabel": dimension_label,
        "metricLabel": metric_label,
        "peerPhrase": peer_phrase,
        "peerCount": len(names),
        "mean": mean_v,
        "median": med_v,
        "meanFormatted": _fmt_amount(mean_v),
        "medianFormatted": _fmt_amount(med_v),
        "stdev": stdev_v,
        "perCategory": per_category,
        "highOutliers": high_out,
        "lowOutliers": low_out,
        "suggestedPhrases": [h["phrase"] for h in high_out] + [l["phrase"] for l in low_out],
    }


def format_categorical_outlier_context(insights: Dict[str, Any]) -> str:
    """Ground-truth block for exact_result / LLM anchor."""
    if not insights:
        return ""
    lines = [
        "Categorical outlier analysis (authoritative — use for Key findings):",
        f"Metric: {insights.get('metricLabel', 'value')}",
        f"Dimension: {insights.get('dimensionLabel', 'category')} "
        f"({int(insights.get('peerCount') or 0)} peers)",
        f"Median: {insights.get('medianFormatted')} | "
        f"Mean: {insights.get('meanFormatted')}",
        "",
        "Per category vs peer median:",
    ]
    for row in insights.get("perCategory") or []:
        if not isinstance(row, dict):
            continue
        nm = row.get("name", "")
        vf = row.get("valueFormatted", "")
        pct = row.get("deviationFromMedianPct")
        z = row.get("zScoreVsMean")
        status = row.get("status", "within_range")
        pct_s = f"{pct:+.1f}% vs median" if pct is not None else "vs median n/a"
        z_s = f", z={z:+.2f}" if z is not None else ""
        tag = ""
        if status == "materially_above":
            tag = " — materially above peers"
        elif status == "materially_below":
            tag = " — materially below peers"
        lines.append(f"  • {nm}: {vf} ({pct_s}{z_s}){tag}")

    highs = insights.get("highOutliers") or []
    lows = insights.get("lowOutliers") or []
    if highs:
        lines.append("")
        lines.append("High outliers (prefer this wording in prose):")
        for h in highs:
            if isinstance(h, dict) and h.get("phrase"):
                lines.append(f"  • {h['phrase']}")
    if lows:
        lines.append("")
        lines.append("Low outliers (prefer this wording in prose):")
        for l in lows:
            if isinstance(l, dict) and l.get("phrase"):
                lines.append(f"  • {l['phrase']}")

    lines.extend(
        [
            "",
            "Narrative rules:",
            "- Do NOT only restate which category is highest or lowest.",
            "- Explain outlier status using distance from the peer median/mean.",
            "- Use the suggested phrases above when they apply (e.g. "
            '"South appears materially above peer regions").',
            "- Keep real category names (region, zone, city) — never histogram bin ranges.",
        ]
    )
    return "\n".join(lines)


def categorical_outlier_prompt_block(insights: Optional[Dict[str, Any]]) -> str:
    if not insights or not (insights.get("highOutliers") or insights.get("lowOutliers")):
        return ""
    phrases = insights.get("suggestedPhrases") or []
    sample = "; ".join(phrases[:4]) if phrases else ""
    return (
        "Categorical outlier narrative (mandatory):\n"
        "- Compare each category to peer median/mean — do not only name the top and bottom value.\n"
        f"- Example phrasing to mirror: {sample}\n"
        "- Explain *why* a category is an outlier (material gap vs peers), not just its rank.\n"
        "- Never describe histogram bins or numeric ranges like [89830,124000].\n"
    )
