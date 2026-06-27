"""
Deterministic narrative quality checks for AI Insights Phase A.2.

Validates LLM prose (or synthetic fixtures) against analysis context and
reasoningBlocks without calling the model.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

import pandas as pd

# Strong causal / definitive phrasing — flag unless hedging appears nearby.
_STRONG_CAUSAL_RE = re.compile(
    r"\b("
    r"caused by|because of|due to the fact|proves that|proven that|"
    r"root cause is|is driven by|is the reason for|resulted from|"
    r"clearly indicates|definitively|must be caused|always caused|"
    r"\bdrove\b|\bdrives\b|caused\s+\d+"
    r")\b",
    re.I,
)

_HEDGING_RE = re.compile(
    r"\b(may indicate|could suggest|might reflect|potentially|appears to|"
    r"is consistent with|cannot confirm|not proven|tentative)\b",
    re.I,
)

_SCATTER_CAUSAL_RE = re.compile(
    r"\b(causes|caused|drives|driving factor|leads to|is responsible for)\b",
    re.I,
)

_FORECAST_RE = re.compile(
    r"\b("
    r"will (?:increase|decrease|grow|decline|rise|fall|reach)|"
    r"forecast(?:s|ed)? to|predict(?:s|ed)? to|expected to (?:hit|reach)"
    r")\b",
    re.I,
)

_SECTION_LABELS = (
    "key findings",
    "what this may indicate",
    "suggested next steps",
    "executive takeaway",
    "evidence",
    "recommended action",
)

_BANKING_CONFLICT_PAIRS: Tuple[Tuple[str, str], ...] = (
    ("utilization", "spend"),
    ("loan balance", "spend"),
    ("deposit", "spend amount"),
)


@dataclass
class NarrativeQualityIssue:
    code: str
    message: str
    severity: str = "error"  # error | warning


@dataclass
class NarrativeQualityReport:
    ok: bool
    issues: List[NarrativeQualityIssue] = field(default_factory=list)

    def add(self, code: str, message: str, *, severity: str = "error") -> None:
        self.issues.append(NarrativeQualityIssue(code, message, severity))


def _norm_text(s: str) -> str:
    return re.sub(r"\s+", " ", str(s or "").lower()).strip()


def _metric_tokens(analysis_ctx: Optional[Dict[str, Any]]) -> List[str]:
    if not isinstance(analysis_ctx, dict):
        return []
    tokens: List[str] = []
    for key in ("metricColumn", "metricColumnDisplay", "aggregation"):
        raw = analysis_ctx.get(key)
        if isinstance(raw, str) and raw.strip():
            tokens.append(_norm_text(raw.replace("_", " ")))
    return [t for t in tokens if t]


def _claim_snippets(blocks: Sequence[Dict[str, Any]]) -> List[str]:
    out: List[str] = []
    for b in blocks:
        if not isinstance(b, dict):
            continue
        claim = str(b.get("claim") or "").strip()
        if len(claim) >= 12:
            out.append(claim.lower())
    return out


def _share_pct_tokens(blocks: Sequence[Dict[str, Any]]) -> List[str]:
    pcts: List[str] = []
    for b in blocks:
        if not isinstance(b, dict):
            continue
        sp = b.get("sharePct")
        if sp is not None:
            try:
                pcts.append(f"{float(sp):.0f}%")
                pcts.append(f"{float(sp):.1f}%")
            except (TypeError, ValueError):
                pass
        claim = str(b.get("claim") or "")
        for m in re.findall(r"\d+(?:\.\d+)?%", claim):
            pcts.append(m.lower())
    return pcts


def check_causal_overclaim(answer: str) -> List[NarrativeQualityIssue]:
    issues: List[NarrativeQualityIssue] = []
    if not answer:
        return issues
    for m in _STRONG_CAUSAL_RE.finditer(answer):
        start = max(0, m.start() - 50)
        end = min(len(answer), m.end() + 20)
        window = answer[start:end]
        if not _HEDGING_RE.search(window):
            issues.append(
                NarrativeQualityIssue(
                    "causal_overclaim",
                    f"Unsupported causal/definitive phrasing near: {m.group(0)!r}",
                )
            )
    return issues


def check_scatter_causal(answer: str, analysis_ctx: Optional[Dict[str, Any]]) -> List[NarrativeQualityIssue]:
    if not answer or not isinstance(analysis_ctx, dict):
        return []
    ct = str(analysis_ctx.get("chartTypeInternal") or "").lower()
    intent = analysis_ctx.get("intent") or {}
    is_scatter = ct == "scatter" or (
        isinstance(intent, dict) and intent.get("primaryGoal") == "relationship"
    )
    if not is_scatter:
        return []
    issues: List[NarrativeQualityIssue] = []
    for m in _SCATTER_CAUSAL_RE.finditer(answer):
        start = max(0, m.start() - 60)
        window = answer[start : m.end() + 30]
        if not _HEDGING_RE.search(window):
            issues.append(
                NarrativeQualityIssue(
                    "scatter_causal",
                    f"Correlation narrative uses causal language: {m.group(0)!r}",
                )
            )
    return issues


def check_forecast_without_support(
    answer: str,
    analysis_ctx: Optional[Dict[str, Any]],
    question: str = "",
) -> List[NarrativeQualityIssue]:
    if not answer:
        return []
    fg = {}
    if isinstance(analysis_ctx, dict):
        fg = analysis_ctx.get("forecastGuardrails") or {}
    can_forecast = fg.get("canForecast") if isinstance(fg, dict) else None
    lacks_ts = bool(fg.get("lacksTimeSeries")) if isinstance(fg, dict) else False
    if can_forecast is True:
        return []
    issues: List[NarrativeQualityIssue] = []
    if _FORECAST_RE.search(answer):
        issues.append(
            NarrativeQualityIssue(
                "forecast_overclaim",
                "Narrative forecasts future values without forecast guardrail support.",
            )
        )
    ql = _norm_text(question)
    if lacks_ts and re.search(r"\bforecast\b|\bpredict\b|\bproject(?:ion)?\b", ql):
        if not re.search(r"\b(cannot|not available|directional|insufficient)\b", answer, re.I):
            issues.append(
                NarrativeQualityIssue(
                    "forecast_missing_disclaimer",
                    "Forecast question lacks limitation/disclaimer language in answer.",
                    severity="warning",
                )
            )
    return issues


def check_metric_mismatch(
    answer: str,
    analysis_ctx: Optional[Dict[str, Any]],
) -> List[NarrativeQualityIssue]:
    if not answer or not isinstance(analysis_ctx, dict):
        return []
    chart_metric = _norm_text(
        str(analysis_ctx.get("metricColumnDisplay") or analysis_ctx.get("metricColumn") or "")
        .replace("_", " ")
    )
    if not chart_metric:
        return []
    low = _norm_text(answer)
    issues: List[NarrativeQualityIssue] = []

    if "utilization" in chart_metric:
        if re.search(r"\bspend(?:ing)?\s+amount\b|\btotal spend\b", low):
            issues.append(
                NarrativeQualityIssue(
                    "metric_mismatch",
                    "Chart uses utilization but narrative mentions spend amount.",
                )
            )
    if "spend" in chart_metric and "utilization" in low and "utilization" not in chart_metric:
        issues.append(
            NarrativeQualityIssue(
                "metric_mismatch",
                "Chart uses spend but narrative emphasizes utilization.",
            )
        )

    for primary, conflicting in _BANKING_CONFLICT_PAIRS:
        if primary in chart_metric and conflicting in low and primary not in low:
            issues.append(
                NarrativeQualityIssue(
                    "metric_mismatch",
                    f"Chart metric {primary!r} but narrative highlights {conflicting!r}.",
                )
            )
    return issues


def check_reasoning_block_usage(
    answer: str,
    reasoning_blocks: Sequence[Dict[str, Any]],
) -> List[NarrativeQualityIssue]:
    """When blocks exist, narrative should reflect at least one claim or share safely."""
    if not answer or not reasoning_blocks:
        return []
    issues: List[NarrativeQualityIssue] = []
    low = answer.lower()
    claims = _claim_snippets(reasoning_blocks)
    pcts = _share_pct_tokens(reasoning_blocks)

    matched = 0
    for claim in claims:
        # Match on a meaningful substring (first 24 chars or entity + %)
        snippet = claim[: min(32, len(claim))]
        if snippet in low:
            matched += 1
            continue
        entity_match = re.search(r"^(\w+(?:\s+\w+)?)\s", claim)
        if entity_match and entity_match.group(1) in low:
            if any(p.replace("%", "") in low for p in pcts):
                matched += 1

    if matched == 0 and claims:
        issues.append(
            NarrativeQualityIssue(
                "reasoning_unused",
                "reasoningBlocks present but narrative does not reflect any evidence claim.",
                severity="warning",
            )
        )
    return issues


def check_reasoning_ui_duplication(
    answer: str,
    reasoning_blocks: Sequence[Dict[str, Any]],
) -> List[NarrativeQualityIssue]:
    """Flag when narrative copies most Why-this-matters bullets verbatim."""
    if not answer or len(reasoning_blocks) < 2:
        return []
    claims = _claim_snippets(reasoning_blocks)
    if not claims:
        return []
    low = answer.lower()
    verbatim = sum(1 for c in claims if c in low)
    if verbatim >= len(claims) and len(claims) >= 2:
        return [
            NarrativeQualityIssue(
                "reasoning_ui_duplication",
                "Narrative repeats all reasoning block claims verbatim (duplicates UI panel).",
                severity="warning",
            )
        ]
    if verbatim >= 2 and len(claims) >= 3:
        return [
            NarrativeQualityIssue(
                "reasoning_ui_duplication",
                "Narrative copies multiple reasoning block claims verbatim.",
                severity="warning",
            )
        ]
    return []


def check_section_structure(answer: str, *, executive: bool = False) -> List[NarrativeQualityIssue]:
    if not answer:
        return []
    low = _norm_text(answer)
    if executive:
        required = ("executive takeaway", "evidence", "recommended action")
    else:
        required = ("key findings", "what this may indicate")
    missing = [lbl for lbl in required if lbl not in low]
    if missing:
        return [
            NarrativeQualityIssue(
                "section_structure",
                f"Missing expected section label(s): {', '.join(missing)}",
                severity="warning",
            )
        ]
    return []


def validate_narrative_quality(
    answer: str,
    *,
    question: str = "",
    analysis_ctx: Optional[Dict[str, Any]] = None,
    reasoning_blocks: Optional[Sequence[Dict[str, Any]]] = None,
    executive: bool = False,
) -> NarrativeQualityReport:
    report = NarrativeQualityReport(ok=True)
    blocks = list(reasoning_blocks or [])
    if not blocks and isinstance(analysis_ctx, dict):
        raw = analysis_ctx.get("reasoningBlocks")
        if isinstance(raw, list):
            blocks = [b for b in raw if isinstance(b, dict)]

    for issue in (
        check_causal_overclaim(answer)
        + check_scatter_causal(answer, analysis_ctx)
        + check_forecast_without_support(answer, analysis_ctx, question)
        + check_metric_mismatch(answer, analysis_ctx)
        + check_reasoning_block_usage(answer, blocks)
        + check_reasoning_ui_duplication(answer, blocks)
        + check_section_structure(answer, executive=executive)
    ):
        report.issues.append(issue)
        if issue.severity == "error":
            report.ok = False
    return report


def validate_narrative_prompt_assembly(
    prompt: str,
    analysis_ctx: Optional[Dict[str, Any]],
) -> NarrativeQualityReport:
    """Ensure narrative prompt carries reasoning evidence and guardrails."""
    report = NarrativeQualityReport(ok=True)
    if not prompt:
        report.add("empty_prompt", "Narrative prompt is empty.")
        return report

    low = prompt.lower()
    blocks: List[Dict[str, Any]] = []
    if isinstance(analysis_ctx, dict):
        raw = analysis_ctx.get("reasoningBlocks")
        if isinstance(raw, list):
            blocks = [b for b in raw if isinstance(b, dict)]

    if blocks:
        for needle, code in (
            ("structured reasoning evidence", "reasoning_prompt_missing"),
            ("do not invent causes", "causation_guard_missing"),
            ("what the numbers show", "observation_guidance_missing"),
        ):
            if needle not in low:
                report.add(code, f"Prompt missing: {needle}")

    if isinstance(analysis_ctx, dict):
        metric = str(analysis_ctx.get("metricColumn") or "").strip()
        if metric and metric.lower() not in low:
            report.add(
                "metric_focus_missing",
                f"Prompt may omit metric focus for {metric}.",
                severity="warning",
            )

    if "confidence-aware reasoning" not in low:
        report.add(
            "confidence_prompt_missing",
            "Prompt missing confidence-aware reasoning block.",
            severity="warning",
        )

    ct = str((analysis_ctx or {}).get("chartTypeInternal") or "").lower()
    if ct in ("line", "area") and "trajectory" not in low and "trend" not in low:
        report.add(
            "trend_guidance_missing",
            "Trend chart prompt may lack trajectory guidance.",
            severity="warning",
        )

    if any(i.severity == "error" for i in report.issues):
        report.ok = False
    return report


def build_compliant_fixture_narrative(
    *,
    analysis_ctx: Dict[str, Any],
    reasoning_blocks: Sequence[Dict[str, Any]],
) -> str:
    """Synthetic compliant narrative for regression tests."""
    metric = str(
        analysis_ctx.get("metricColumnDisplay")
        or analysis_ctx.get("metricColumn")
        or "the metric"
    ).replace("_", " ")
    blocks = [b for b in reasoning_blocks if isinstance(b, dict) and b.get("claim")]
    top_claim = str(blocks[0]["claim"]) if blocks else f"{metric} varies across groups."
    extra = ""
    if len(blocks) > 1:
        extra = f" {blocks[1]['claim']}"
    return (
        "Key findings:\n"
        f"- {top_claim}{extra}\n\n"
        "What this may indicate:\n"
        "- This pattern may indicate concentration among leading groups in the current "
        "filtered sample; it is not proven root cause.\n\n"
        "Suggested next steps:\n"
        "- Compare the same metric across an additional dimension or time window to validate."
    )
