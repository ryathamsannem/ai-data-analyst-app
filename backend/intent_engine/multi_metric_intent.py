"""Multi-metric comparison intent (compare X vs Y)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import pandas as pd

from intent_engine.column_resolve import resolve_metric_columns_for_ids
from intent_engine.question_patterns import parse_requested_metric_ids


def build_multi_metric_comparison(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
) -> Dict[str, Any]:
    requested_ids = parse_requested_metric_ids(question)
    if len(requested_ids) < 2:
        if "revenue" not in requested_ids:
            requested_ids.insert(0, "revenue")
        if "ad_spend" not in requested_ids and len(requested_ids) < 2:
            requested_ids.append("ad_spend")

    column_map = resolve_metric_columns_for_ids(requested_ids, df, profile)
    missing = [mid for mid, col in column_map.items() if not col]

    primary_col = None
    for mid in requested_ids:
        if column_map.get(mid):
            primary_col = column_map[mid]
            break

    metric: Dict[str, Any] = {
        "kind": "multi",
        "columnKey": primary_col,
        "displayLabel": "Multiple metrics",
        "aggregation": {"key": None, "label": None},
        "requestedMetrics": requested_ids,
        "requestedMetricColumns": column_map,
    }

    return {
        "metric": metric,
        "dimension": {
            "columnKey": None,
            "displayLabel": "—",
            "secondaryColumnKey": None,
        },
        "missingOperands": missing,
        "requestedMetrics": requested_ids,
        "requestedMetricColumns": column_map,
    }


def missing_operand_reason_codes(missing: List[str]) -> List[str]:
    codes = ["missing_metric_operand"]
    if any(m in ("ad_spend", "spend") for m in missing):
        codes.append("missing_ad_spend_column")
    return codes


_METRIC_ID_LABELS: Dict[str, str] = {
    "revenue": "Revenue",
    "ad_spend": "Ad spend",
    "profit": "Profit",
    "spend": "Spend",
    "margin": "Margin",
}


def metric_id_display_label(metric_id: str) -> str:
    mid = str(metric_id or "").strip()
    if not mid:
        return "—"
    if mid in _METRIC_ID_LABELS:
        return _METRIC_ID_LABELS[mid]
    return mid.replace("_", " ").strip().title()


def metric_id_display_label(metric_id: str) -> str:
    mid = str(metric_id or "").strip()
    if not mid:
        return "—"
    if mid in _METRIC_ID_LABELS:
        return _METRIC_ID_LABELS[mid]
    return mid.replace("_", " ").strip().title()


def _column_phrase_for_missing(metric_id: str) -> str:
    mid = str(metric_id or "").strip()
    if not mid:
        return "a required metric column"
    article = "an" if mid[0] in "aeiou" else "a"
    return f"{article} {mid} column"


def collect_available_related_columns(
    df: pd.DataFrame, profile: Dict[str, Any]
) -> List[str]:
    """Numeric columns present in the cohort (for unsupported-comparison context)."""
    col_types = profile.get("column_types") if isinstance(profile, dict) else {}
    out: List[str] = []
    for c in df.columns:
        if str(c).strip().lower() in ("", "unnamed"):
            continue
        if isinstance(col_types, dict) and col_types.get(c) == "number":
            out.append(str(c))
        elif not col_types:
            try:
                if pd.api.types.is_numeric_dtype(df[c]):
                    out.append(str(c))
            except Exception:
                pass
    return sorted(set(out))


def build_unsupported_multi_metric_payload(
    *,
    requested_metrics: List[str],
    missing_metrics: List[str],
    reason_codes: List[str],
    recommended_action: str,
    available_related_columns: Optional[List[str]] = None,
) -> Dict[str, Any]:
    req_labels = [metric_id_display_label(m) for m in requested_metrics]
    missing_labels = [metric_id_display_label(m) for m in missing_metrics]
    requested_text = " vs ".join(req_labels) if len(req_labels) >= 2 else ", ".join(req_labels)

    if len(missing_metrics) == 1:
        lead = (
            f"{requested_text} cannot be compared because the dataset does not include "
            f"{_column_phrase_for_missing(missing_metrics[0])}."
        )
    elif missing_metrics:
        cols = ", ".join(_column_phrase_for_missing(m) for m in missing_metrics)
        lead = (
            f"{requested_text} cannot be compared because the dataset does not include "
            f"{cols}."
        )
    else:
        lead = "Requested metrics cannot be compared with the available columns."

    primary_reason = (
        "missing_ad_spend_column"
        if "missing_ad_spend_column" in reason_codes
        else (reason_codes[0] if reason_codes else "missing_metric_operand")
    )
    avail = list(available_related_columns or [])
    return {
        "active": True,
        "requestedMetrics": list(requested_metrics),
        "missingMetrics": list(missing_metrics),
        "missingMetricLabels": missing_labels,
        "requestedMetricLabels": req_labels,
        "availableRelatedColumns": avail,
        "status": "Missing Required Metric Column",
        "leadSentence": lead,
        "recommendedAction": recommended_action,
        "reasonCode": primary_reason,
        "reasonCodes": list(reason_codes),
    }


def build_unsupported_multi_metric_exact_context(payload: Dict[str, Any]) -> str:
    """Ground-truth block for /ask — no category ranking fallbacks."""
    avail = payload.get("availableRelatedColumns") or []
    avail_text = ", ".join(str(c) for c in avail) if avail else "—"
    return "\n".join(
        [
            str(payload.get("leadSentence") or "").strip(),
            "",
            f"Requested metrics: {', '.join(payload.get('requestedMetrics') or [])}",
            f"Missing metric: {', '.join(payload.get('missingMetrics') or [])}",
            f"Available related columns: {avail_text}",
            f"Recommended action: {str(payload.get('recommendedAction') or '').strip()}",
            "",
            "IMPORTANT: This comparison is unsupported. Do NOT report product/category "
            "rankings, highest/lowest entities, revenue-by-product totals, or unrelated "
            "single-metric summaries. Answer ONLY about the missing metric and next steps.",
        ]
    ).strip()


def _recommended_action_for_missing(missing: List[str]) -> str:
    if any(m in ("ad_spend", "spend") for m in missing):
        return (
            "Add ad_spend or map advertising spend to an existing spend/cost column"
        )
    labels = [metric_id_display_label(m) for m in missing]
    if labels:
        return f"Add {', '.join(labels)} column(s) to your dataset"
    return "Add the missing metric columns to your dataset"


def assess_unsupported_multi_metric_for_api(
    *,
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """
    Multi-metric compare (X vs Y) when an operand column is absent — no category fallback.
    """
    from intent_engine.question_patterns import question_requests_multi_metric_comparison

    if not question_requests_multi_metric_comparison(question):
        return None

    payload = build_multi_metric_comparison(question, df, profile)
    missing = list(payload.get("missingOperands") or [])
    if not missing:
        return None

    requested = list(payload.get("requestedMetrics") or [])
    reason_codes = missing_operand_reason_codes(missing)
    available = collect_available_related_columns(df, profile)
    return build_unsupported_multi_metric_payload(
        requested_metrics=requested,
        missing_metrics=missing,
        reason_codes=reason_codes,
        recommended_action=_recommended_action_for_missing(missing),
        available_related_columns=available,
    )
