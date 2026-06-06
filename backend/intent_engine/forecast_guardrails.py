"""
Forecast validation — require historical time-series evidence before model forecasts.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

_FORECAST_RE = re.compile(
    r"\b("
    r"forecast(?:ing|s)?|project(?:ion|ed|ing)|predict(?:ion|ed|ing)?|"
    r"next\s+(?:quarter|month|year|period)|forward[-\s]?looking|"
    r"what\s+will|expected\s+(?:revenue|sales|growth)"
    r")\b",
    re.I,
)

_TIME_COL_HINT_RE = re.compile(
    r"\b(date|time|period|month|year|quarter|week|day|timestamp|fiscal)\b",
    re.I,
)

UNRELIABLE_FORECAST_MESSAGE = (
    "Reliable forecasting cannot be performed because historical "
    "time-series data is unavailable."
)

SCENARIO_ESTIMATE_LABEL = "Scenario estimate"
DIRECTIONAL_PROJECTION_LABEL = "Directional projection"


@dataclass
class ForecastDataset:
    """Cohort + schema context for forecast eligibility."""

    df: Optional[pd.DataFrame] = None
    profile: Optional[Dict[str, Any]] = None
    time_series_analysis: Optional[Dict[str, Any]] = None


def question_requests_forecast_or_projection(question: str) -> bool:
    q = (question or "").strip()
    if not q:
        return False
    return bool(_FORECAST_RE.search(q))


def profile_has_time_series_column(profile: Optional[Dict[str, Any]]) -> bool:
    if not profile or not isinstance(profile, dict):
        return False
    ct = profile.get("column_types") or {}
    if not isinstance(ct, dict):
        return False
    for col, kind in ct.items():
        if str(kind).lower() == "date":
            return True
        if _TIME_COL_HINT_RE.search(str(col)):
            return True
    return False


def _resolve_time_column(
    df: Optional[pd.DataFrame], profile: Optional[Dict[str, Any]]
) -> Optional[str]:
    if df is not None and not df.empty:
        ct = (profile or {}).get("column_types") or {}
        if isinstance(ct, dict):
            for col in df.columns:
                if str(ct.get(col, "")).lower() == "date":
                    return str(col)
        for col in df.columns:
            cl = str(col).lower().replace(" ", "_")
            if any(
                h in cl
                for h in (
                    "order_date",
                    "transaction_date",
                    "date",
                    "period",
                    "month",
                    "timestamp",
                )
            ):
                return str(col)
    if profile_has_time_series_column(profile) and profile:
        ct = profile.get("column_types") or {}
        if isinstance(ct, dict):
            for col, kind in ct.items():
                if str(kind).lower() == "date" or _TIME_COL_HINT_RE.search(str(col)):
                    return str(col)
    return None


def _period_observation_counts(
    df: pd.DataFrame, date_col: str
) -> Tuple[int, List[int], int]:
    """Distinct normalized periods, per-period row counts, valid dated rows."""
    ser = pd.to_datetime(df[date_col], errors="coerce")
    mask = ser.notna()
    n_valid = int(mask.sum())
    if n_valid == 0:
        return 0, [], 0
    periods = ser.loc[mask].dt.normalize()
    counts = periods.groupby(periods).size()
    return int(counts.shape[0]), [int(v) for v in counts.tolist()], n_valid


def _temporal_supports_forecast(
    period_count: int, per_period_counts: List[int], n_valid_observations: int
) -> Tuple[bool, List[str]]:
    """
    Statistical checks (no fixed row-count thresholds):
    - multiple periods (>= 2 distinct time buckets),
    - at least one observation per period on average,
    - observations not entirely concentrated in a single period.
    """
    reasons: List[str] = []
    if period_count < 2:
        reasons.append("insufficient_periods")
        return False, reasons
    if n_valid_observations < period_count:
        reasons.append("insufficient_observations")
        return False, reasons
    total = sum(per_period_counts)
    if total <= 0:
        reasons.append("no_valid_observations")
        return False, reasons
    if max(per_period_counts) >= total:
        reasons.append("single_period_concentration")
        return False, reasons
    return True, reasons


def can_forecast(dataset: ForecastDataset) -> Dict[str, Any]:
    """
    Validate forecast eligibility from cohort time-series structure.

    Returns dict with ``canForecast`` (bool), diagnostics, and ``reasons``.
    """
    df = dataset.df
    profile = dataset.profile
    ts = dataset.time_series_analysis if isinstance(dataset.time_series_analysis, dict) else {}

    reasons: List[str] = []
    time_col = _resolve_time_column(df, profile)
    period_count = 0
    n_valid_observations = 0
    per_period_counts: List[int] = []
    ts_buckets = int(ts.get("uniqueBuckets") or 0) if ts else 0

    if not time_col:
        reasons.append("no_time_column")
        return {
            "canForecast": False,
            "timeColumn": None,
            "periodCount": 0,
            "observationCount": 0,
            "timeSeriesBuckets": ts_buckets,
            "reasons": reasons,
        }

    if df is not None and not df.empty and time_col in df.columns:
        period_count, per_period_counts, n_valid_observations = _period_observation_counts(
            df, time_col
        )

    period_count = max(period_count, ts_buckets)
    if ts_buckets >= 2 and not per_period_counts:
        per_period_counts = [1] * ts_buckets
        n_valid_observations = max(n_valid_observations, ts_buckets)

    ok, stat_reasons = _temporal_supports_forecast(
        period_count, per_period_counts, n_valid_observations
    )
    reasons.extend(stat_reasons)

    return {
        "canForecast": ok,
        "timeColumn": time_col,
        "periodCount": int(period_count),
        "observationCount": int(n_valid_observations),
        "timeSeriesBuckets": int(ts_buckets),
        "meanObservationsPerPeriod": (
            float(n_valid_observations) / float(period_count) if period_count > 0 else 0.0
        ),
        "reasons": reasons,
    }


# CamelCase alias for API / product docs
canForecast = can_forecast


def _forecast_confidence_from_validation(validation: Dict[str, Any]) -> str:
    if not validation.get("canForecast"):
        return "low"
    periods = int(validation.get("periodCount") or 0)
    density = float(validation.get("meanObservationsPerPeriod") or 0.0)
    if periods >= 6 and density >= 2.0:
        return "high"
    if periods >= 3:
        return "medium"
    return "medium"


def assess_forecast_guardrails(
    question: str,
    profile: Optional[Dict[str, Any]],
    *,
    df: Optional[pd.DataFrame] = None,
    time_series_analysis: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """
    When the user asks for a forecast, validate time-series evidence.
    If validation fails, return scenario/directional projection labeling (not forecasts).
    """
    if not question_requests_forecast_or_projection(question):
        return None

    validation = can_forecast(
        ForecastDataset(df=df, profile=profile, time_series_analysis=time_series_analysis)
    )

    if validation.get("canForecast"):
        conf = _forecast_confidence_from_validation(validation)
        return {
            "active": True,
            "canForecast": True,
            "hasTimeSeriesColumn": True,
            "outputLabel": "Forecast",
            "directionalProjectionLabel": None,
            "forecastConfidenceLevel": conf,
            "reliabilityMessage": None,
            "disclaimer": None,
            "lacksTimeSeries": False,
            "validation": validation,
        }

    return {
        "active": True,
        "canForecast": False,
        "hasTimeSeriesColumn": bool(validation.get("timeColumn")),
        "outputLabel": SCENARIO_ESTIMATE_LABEL,
        "directionalProjectionLabel": DIRECTIONAL_PROJECTION_LABEL,
        "forecastConfidenceLevel": "low",
        "reliabilityMessage": UNRELIABLE_FORECAST_MESSAGE,
        "disclaimer": (
            "Present only as a directional scenario estimate; do not state extrapolated "
            "values as statistical forecasts or imply model accuracy."
        ),
        "lacksTimeSeries": True,
        "validation": validation,
    }


def forecast_guardrails_prompt_block(payload: Optional[Dict[str, Any]]) -> str:
    if not payload or not payload.get("active"):
        return ""

    can_fc = bool(payload.get("canForecast"))
    label = str(payload.get("outputLabel") or "Projection").strip()
    dir_label = payload.get("directionalProjectionLabel")
    conf = str(payload.get("forecastConfidenceLevel") or "low").strip().title()

    if not can_fc:
        lines = [
            "Forecast validation (mandatory):",
            f"- Open with this sentence exactly once: {UNRELIABLE_FORECAST_MESSAGE}",
            f"- Label the answer as **{SCENARIO_ESTIMATE_LABEL}** with a "
            f"**{DIRECTIONAL_PROJECTION_LABEL}** (not a forecast).",
            f"- Forecast confidence: **{conf}**.",
            "- Do NOT present extrapolated numeric values as forecasts, "
            "confidence intervals, or model-based predictions.",
            "- You may describe a qualitative directional scenario only "
            "(e.g. growth assumptions), without implying statistical forecast accuracy.",
        ]
        rel = payload.get("reliabilityMessage")
        if isinstance(rel, str) and rel.strip() and rel.strip() != UNRELIABLE_FORECAST_MESSAGE:
            lines.append(f"- Reliability note: {rel.strip()}")
        disc = payload.get("disclaimer")
        if isinstance(disc, str) and disc.strip():
            lines.append(f"- Include once: {disc.strip()}")
        val = payload.get("validation")
        if isinstance(val, dict) and val.get("reasons"):
            lines.append(
                f"- Validation: {', '.join(str(r) for r in val.get('reasons') or [])}."
            )
        return "\n".join(lines)

    lines = [
        "Forecast guardrails (mandatory):",
        f"- Label this answer as a **{label}** backed by multi-period time-series evidence.",
        f"- Forecast confidence: **{conf}**.",
    ]
    if dir_label:
        lines.append(f"- Secondary framing: **{dir_label}**.")
    disc = payload.get("disclaimer")
    if isinstance(disc, str) and disc.strip():
        lines.append(f"- Include once: {disc.strip()}")
    return "\n".join(lines)
