"""
Correlation / relationship routing guardrails.

When a question requires row-level scatter/correlation routing, generic chart
fallbacks (analyze_data, build_smart_chart, aggregate rebuilds) must not run.
Detection is schema-agnostic — driven by question_patterns only.
"""

from __future__ import annotations

from typing import Optional

from intent_engine.question_patterns import question_requests_correlation_routing


def blocks_generic_viz_fallbacks(question: str) -> bool:
    """
    True when the viz pipeline must not call generic fallback chart builders.
    """
    return question_requests_correlation_routing(question)


def chart_selection_bucket_override(question: str) -> Optional[str]:
    """
    Legacy chart-selection bucket aligned with correlation routing.
    Returns ``relationship`` when correlation routing applies; otherwise None.
    """
    if question_requests_correlation_routing(question):
        return "relationship"
    return None


def must_use_scatter_visualization(question: str) -> bool:
    """True when bar/line rebuilds must not replace correlation scatter."""
    return question_requests_correlation_routing(question)
