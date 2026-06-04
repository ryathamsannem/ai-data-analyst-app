"""
Align provenance chart labels with the same bar-orientation heuristics as the UI
(`frontend/lib/final-chart-presentation.ts`).
"""

from __future__ import annotations

import re
from typing import List, Optional, Tuple


def _rank_intent_from_text(title: str, question: str) -> bool:
    blob = f"{title} {question}".lower()
    if re.search(
        r"\b(outliers?|anomal(?:y|ies)|ranked\s+by|value\s+distribution)\b",
        blob,
    ):
        return True
    if re.search(
        r"\b(rank|ranking|top\s*\d+|bottom\s*\d+|highest|lowest|leading|trailing|sorted)\b",
        blob,
    ):
        return True
    if re.search(
        r"\b(top|best|highest|lowest|leading|trailing)\s+performing\b",
        blob,
    ):
        return True
    if re.search(r"\bperforming\s+(city|cities|region|regions|zone|zones)\b", blob):
        return True
    if re.search(r"\bgenerates?\s+the\s+(highest|lowest|most|least)\b", blob):
        return True
    return False


def resolve_presented_bar_api_type(
    *,
    question: str,
    title: str,
    category_labels: List[str],
    engine_api_type: str,
) -> Tuple[str, Optional[str]]:
    """
    Return (api chart type, optional chartSelectionReason override) for bar family charts.
    """
    api = (engine_api_type or "bar").strip()
    if api not in ("bar", "horizontalBar"):
        return api, None

    labels = [str(x).strip() for x in category_labels if str(x).strip()]
    n = len(labels)
    if n == 0:
        return api, None

    max_len = max(len(s) for s in labels)
    avg_len = sum(len(s) for s in labels) / float(n)
    rank_intent = _rank_intent_from_text(title, question)
    short_labels = max_len <= 14 and avg_len <= 10
    geo_blob = f"{title} {question}".lower()
    geo_rank_compact = bool(
        rank_intent
        and 2 <= n <= 8
        and short_labels
        and re.search(
            r"\b(city|cities|region|regions|zone|zones|performing)\b",
            geo_blob,
        )
    )

    if (n <= 6 and short_labels and not rank_intent) or geo_rank_compact:
        return (
            "bar",
            "Compact geographic ranking — vertical bars for side-by-side comparison.",
        )

    if rank_intent or n > 6 or max_len > 18 or avg_len > 12:
        return (
            "horizontalBar",
            "Ranking-style layout; horizontal bars for readable ordering.",
        )

    return "bar", "Standard comparison — vertical bar chart."


def humanize_api_chart_type(api_type: str) -> str:
    return {
        "bar": "Vertical bar chart",
        "horizontalBar": "Horizontal bar chart",
        "line": "Line chart",
        "area": "Area chart",
        "pie": "Pie chart",
        "donut": "Donut chart",
        "scatter": "Scatter plot",
        "histogram": "Histogram",
    }.get((api_type or "bar").strip(), api_type)
