"""
Bivariate correlation (Pearson + Spearman) for relationship / scatter analysis.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from intent_engine.column_resolve import (
    column_matches_token,
    find_column_for_token,
    numeric_columns,
)

# Minimum joint pairs for a stable coefficient read in confidence scoring.
MIN_PEARSON_SAMPLE = 8

_BETWEEN_RE = re.compile(
    r"\bbetween\s+(.+?)\s+and\s+(.+?)(?:\s*[\?\.]|$)",
    re.I,
)
_CORRELATED_WITH_RE = re.compile(
    r"(?:is|are|what\s+is|how)\s+(.+?)\s+correlat(?:ed|ion|ing)?\s+with\s+(.+?)(?:\s*[\?\.]|$)",
    re.I,
)
_CORRELATION_BETWEEN_RE = re.compile(
    r"\bcorrelat(?:e|ion|ing)\s+between\s+(.+?)\s+and\s+(.+?)(?:\s*[\?\.]|$)",
    re.I,
)
_RELATIONSHIP_BETWEEN_RE = re.compile(
    r"\brelationship\s+between\s+(.+?)\s+and\s+(.+?)(?:\s*[\?\.]|$)",
    re.I,
)


def _norm_phrase(text: str) -> str:
    return re.sub(r"[_\s]+", " ", str(text).lower()).strip()


def interpret_correlation_magnitude(abs_r: float) -> str:
    """
    Strength from |r| (product bands):
      0.0–0.2 Very Weak, 0.2–0.4 Weak, 0.4–0.6 Moderate,
      0.6–0.8 Strong, 0.8–1.0 Very Strong
    """
    a = abs(float(abs_r))
    if a != a or a > 1.0:
        return "Unknown"
    if a < 0.2:
        return "Very Weak"
    if a < 0.4:
        return "Weak"
    if a < 0.6:
        return "Moderate"
    if a < 0.8:
        return "Strong"
    return "Very Strong"


def classify_pearson_r(r: float) -> Dict[str, str]:
    """Signed strength label from Pearson r."""
    if r != r:
        return {
            "correlationClass": "unknown",
            "correlationLabel": "Correlation unavailable",
            "correlationStrength": "Unknown",
            "direction": "unknown",
        }
    strength = interpret_correlation_magnitude(abs(r))
    if strength == "Unknown":
        return {
            "correlationClass": "unknown",
            "correlationLabel": "Correlation unavailable",
            "correlationStrength": strength,
            "direction": "unknown",
        }
    if r > 0.05:
        direction = "positive"
        signed = f"{strength} Positive"
        corr_class = f"{strength.lower().replace(' ', '_')}_positive"
    elif r < -0.05:
        direction = "negative"
        signed = f"{strength} Negative"
        corr_class = f"{strength.lower().replace(' ', '_')}_negative"
    else:
        direction = "neutral"
        signed = strength
        corr_class = f"{strength.lower().replace(' ', '_')}_neutral"
    return {
        "correlationClass": corr_class,
        "correlationLabel": signed,
        "correlationStrength": strength,
        "direction": direction,
    }


def pearson_sample_adequate(n: int) -> bool:
    return int(n) >= MIN_PEARSON_SAMPLE


def _to_numeric_series(df: pd.DataFrame, col: str) -> pd.Series:
    if col not in df.columns:
        return pd.Series(dtype=float)
    return pd.to_numeric(df[col], errors="coerce")


def _joint_non_null_count(df: pd.DataFrame, col_x: str, col_y: str) -> int:
    if df is None or df.empty:
        return 0
    if col_x not in df.columns or col_y not in df.columns:
        return 0
    x = _to_numeric_series(df, col_x)
    y = _to_numeric_series(df, col_y)
    return int((x.notna() & y.notna()).sum())


def compute_bivariate_correlations(
    x: pd.Series, y: pd.Series
) -> Dict[str, Any]:
    """
    Pearson + Spearman on aligned non-null pairs.
    Returns canCompute=False when fewer than two joint observations.
    """
    frame = pd.DataFrame({"_x": x, "_y": y}).dropna()
    n = int(len(frame))
    out: Dict[str, Any] = {
        "pearson": None,
        "spearman": None,
        "sampleSize": n,
        "canCompute": False,
        "correlationClass": "unknown",
        "correlationLabel": "Correlation unavailable",
        "correlationStrength": "Unknown",
        "direction": "unknown",
    }
    if n < 2:
        return out

    pearson_raw = frame["_x"].corr(frame["_y"])
    spearman_raw = frame["_x"].corr(frame["_y"], method="spearman")

    pearson = float(pearson_raw) if pearson_raw == pearson_raw else float("nan")
    spearman = float(spearman_raw) if spearman_raw == spearman_raw else float("nan")

    if pearson == pearson:
        out["pearson"] = round(pearson, 2)
        out["canCompute"] = True
        cls = classify_pearson_r(pearson)
        out.update(cls)
    if spearman == spearman:
        out["spearman"] = round(spearman, 2)
        if not out["canCompute"]:
            cls = classify_pearson_r(spearman)
            out.update(cls)
            out["canCompute"] = True

    return out


def _phrase_alias_tokens(phrase: str) -> List[str]:
    """Schema-driven synonyms for natural-language metric phrases (no dataset literals)."""
    p = _norm_phrase(phrase.strip().strip("?.,"))
    if not p:
        return []
    tokens: List[str] = [p.replace(" ", "_"), p]
    if re.search(r"customer\s*count", p):
        tokens.extend(
            ["customer_count", "customers", "customer", "num_customers", "n_customers"]
        )
    elif p in ("customers", "customer"):
        tokens.extend(["customer_count", "customers", "customer", "num_customers"])
    if p in ("sales", "sale"):
        tokens.extend(["revenue", "sales", "gross sales", "total revenue"])
    if re.search(r"growth\s*rate", p):
        tokens.extend(["growth_rate", "growth rate", "growth"])
    if p in ("profit",):
        tokens.append("profit")
    if p in ("revenue",):
        tokens.extend(["revenue", "sales", "gross sales"])
    seen: set = set()
    out: List[str] = []
    for t in tokens:
        key = t.lower()
        if key not in seen:
            seen.add(key)
            out.append(t)
    return out


def _phrase_to_column(phrase: str, numeric_cols: List[str], profile: Dict[str, Any]) -> Optional[str]:
    p = phrase.strip().strip("?.,")
    if not p:
        return None
    for tok in _phrase_alias_tokens(p):
        hit = find_column_for_token(
            tok, numeric_cols, numeric_only=True, profile=profile
        )
        if hit:
            return hit
    for c in numeric_cols:
        if column_matches_token(str(c), p):
            return str(c)
    return None


def _explicit_bivariate_phrase_present(question: str) -> bool:
    q = (question or "").strip()
    if not q:
        return False
    for pat in (
        _RELATIONSHIP_BETWEEN_RE,
        _CORRELATION_BETWEEN_RE,
        _BETWEEN_RE,
        _CORRELATED_WITH_RE,
    ):
        if pat.search(q):
            return True
    return False


def _pair_from_between_patterns(
    question: str, numeric_cols: List[str], profile: Dict[str, Any]
) -> Optional[Tuple[str, str]]:
    q = (question or "").strip()
    for pat in (
        _RELATIONSHIP_BETWEEN_RE,
        _CORRELATION_BETWEEN_RE,
        _BETWEEN_RE,
        _CORRELATED_WITH_RE,
    ):
        m = pat.search(q)
        if not m:
            continue
        left = _phrase_to_column(m.group(1).strip(), numeric_cols, profile)
        right = _phrase_to_column(m.group(2).strip(), numeric_cols, profile)
        if left and right and left != right:
            return left, right
    return None


def _columns_ordered_in_question(
    question: str, numeric_cols: List[str]
) -> List[str]:
    ql = _norm_phrase(question)
    ranked = sorted(numeric_cols, key=lambda c: len(_norm_phrase(c)), reverse=True)
    hits: List[Tuple[int, int, str]] = []
    seen: set = set()
    for c in ranked:
        if c in seen:
            continue
        phrase = _norm_phrase(c)
        if not phrase:
            continue
        pos = ql.find(phrase)
        if pos < 0 and len(phrase.split()) > 1:
            pat = r"(?<!\w)" + r"\s+".join(re.escape(p) for p in phrase.split()) + r"(?!\w)"
            m = re.search(pat, ql)
            pos = m.start() if m else -1
        if pos >= 0:
            seen.add(c)
            hits.append((pos, -len(str(c)), str(c)))
    hits.sort(key=lambda t: (t[0], t[1]))
    return [t[2] for t in hits]


def _best_pair_by_joint_observations(
    df: pd.DataFrame, numeric_cols: List[str]
) -> Optional[Tuple[str, str]]:
    best: Optional[Tuple[str, str]] = None
    best_n = 0
    cols = [c for c in numeric_cols if c in df.columns]
    for i, c1 in enumerate(cols):
        for c2 in cols[i + 1 :]:
            n = _joint_non_null_count(df, c1, c2)
            if n > best_n:
                best_n = n
                best = (c1, c2)
    if best and best_n >= 2:
        return best
    return None


def resolve_relationship_numeric_pair(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
) -> Optional[Tuple[str, str]]:
    """
    Resolve two numeric columns for correlation (no hardcoded metric names).
    """
    if df is None or df.empty:
        return None
    nums = numeric_columns(df.columns.tolist(), profile)
    if len(nums) < 2:
        return None

    from_pat = _pair_from_between_patterns(question, nums, profile)
    if from_pat:
        return from_pat

    if _explicit_bivariate_phrase_present(question):
        return None

    ordered = _columns_ordered_in_question(question, nums)
    if len(ordered) >= 2:
        return ordered[0], ordered[1]

    return _best_pair_by_joint_observations(df, nums)


def can_compute_correlation(df: pd.DataFrame, col_x: str, col_y: str) -> bool:
    """True when at least two joint numeric observations exist."""
    return _joint_non_null_count(df, col_x, col_y) >= 2


def compute_relationship_correlations(
    df: pd.DataFrame,
    col_x: str,
    col_y: str,
    *,
    x_label: str = "",
    y_label: str = "",
    include_outliers: bool = True,
) -> Dict[str, Any]:
    """
    Full relationship insights: Pearson, Spearman, strength, sample size, optional outliers.
    """
    out: Dict[str, Any] = {
        "pearson": None,
        "spearman": None,
        "direction": None,
        "summaryLine": None,
        "strongestOutliers": [],
        "qualitativeOnly": True,
    }
    if df is None or df.empty or col_x not in df.columns or col_y not in df.columns:
        return enrich_relationship_insights(
            out, x_label=x_label or col_x, y_label=y_label or col_y, n=0
        )

    sub = df[[col_x, col_y]].copy()
    sub["_x"] = _to_numeric_series(sub, col_x)
    sub["_y"] = _to_numeric_series(sub, col_y)
    sub = sub.dropna(subset=["_x", "_y"]).reset_index(drop=True)
    n = int(len(sub))

    stats = compute_bivariate_correlations(sub["_x"], sub["_y"])
    out.update(stats)
    out["qualitativeOnly"] = not bool(stats.get("canCompute"))

    xn = (x_label or col_x).strip()
    yn = (y_label or col_y).strip()

    if include_outliers and n >= 3:
        std_x = float(sub["_x"].std(ddof=0) or 0.0)
        std_y = float(sub["_y"].std(ddof=0) or 0.0)
        if std_x > 1e-12 and std_y > 1e-12:
            zx = (sub["_x"] - sub["_x"].mean()) / std_x
            zy = (sub["_y"] - sub["_y"].mean()) / std_y
            dist = (zx * zx + zy * zy) ** 0.5
            sub["_d"] = dist
            top_idx = sub["_d"].nlargest(min(2, n)).index.astype(int).tolist()
            olist = []
            for j in top_idx:
                try:
                    xv = float(sub.loc[j, "_x"])
                    yv = float(sub.loc[j, "_y"])
                except Exception:
                    xv, yv = None, None
                olist.append(
                    {
                        "x": xv,
                        "y": yv,
                        "xLabel": xn,
                        "yLabel": yn,
                        "note": "Largest joint z-score distance from the series center.",
                    }
                )
            out["strongestOutliers"] = olist

    return enrich_relationship_insights(out, x_label=xn, y_label=yn, n=n)


def enrich_relationship_insights(
    insights: Dict[str, Any],
    *,
    x_label: str,
    y_label: str,
    n: int,
) -> Dict[str, Any]:
    """Add classification fields and a business-safe summary line."""
    out = dict(insights)
    out["sampleSize"] = int(n)
    can = bool(out.get("canCompute"))
    pearson = out.get("pearson")
    spearman = out.get("spearman")

    if can and pearson is not None and not out.get("correlationStrength"):
        try:
            out.update(classify_pearson_r(float(pearson)))
        except (TypeError, ValueError):
            pass

    if not can:
        out["correlationClass"] = "unknown"
        out["correlationLabel"] = "Correlation unavailable"
        out["correlationStrength"] = "Unknown"
        out["direction"] = "unknown"
        out["qualitativeOnly"] = True
        if n < 2:
            out["summaryLine"] = (
                f"Insufficient joint observations (n={n}) to compute correlation "
                f"between {y_label or 'Y'} and {x_label or 'X'}."
            )
        return out

    out["qualitativeOnly"] = False
    xn = (x_label or "X").strip()
    yn = (y_label or "Y").strip()
    label = str(out.get("correlationLabel") or "Correlation")
    p_str = ""
    if pearson is not None:
        try:
            p_str = f"Pearson r = {float(pearson):+.2f}"
        except (TypeError, ValueError):
            p_str = ""
    s_str = ""
    if spearman is not None:
        try:
            s_str = f"Spearman ρ = {float(spearman):+.2f}"
        except (TypeError, ValueError):
            s_str = ""
    coeff_parts = [p for p in (p_str, s_str) if p]
    coeff_txt = "; ".join(coeff_parts) if coeff_parts else "coefficients computed"
    out["summaryLine"] = (
        f"{label} correlation ({coeff_txt}; n={n}) between {xn} and {yn}."
    )
    if not pearson_sample_adequate(n):
        out["correlationSampleWarning"] = (
            f"Only {n} joint observation(s) — treat coefficients as directional."
        )
    return out


def build_unsupported_relationship_missing_columns(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Payload when correlation routing applies but required numeric columns cannot be resolved.
    """
    nums = numeric_columns(df.columns.tolist(), profile) if df is not None else []
    available = ", ".join(_norm_phrase(str(c)) for c in nums[:12])
    if len(nums) > 12:
        available = f"{available}, …"
    return {
        "active": True,
        "reasonCode": "relationship_columns_missing",
        "leadSentence": (
            "Required columns not found — this correlation question needs two numeric "
            "columns present in the dataset."
        ),
        "detailLines": [
            f"Question: {question.strip()}",
            f"Numeric columns available: {available or 'none'}",
            "No unrelated category bar chart was generated.",
        ],
        "recommendedAction": (
            "Upload or map numeric columns that match the metrics in your question "
            "(e.g. customer count, revenue, profit, growth rate)."
        ),
    }


def format_correlation_exact_result_lines(
    *,
    x_col: str,
    y_col: str,
    rel_ins: Dict[str, Any],
    x_pretty: str,
    y_pretty: str,
) -> List[str]:
    """Deterministic lines for LLM anchor / exact result."""
    lines = [
        f"Relationship analysis: {y_pretty} vs {x_pretty} (each point is one row in the filtered cohort).",
    ]
    n = rel_ins.get("sampleSize")
    if n is not None:
        lines.append(f"Sample size: {int(n)} row(s) with both metrics populated.")

    if rel_ins.get("qualitativeOnly"):
        lines.append(
            "Numeric correlation could not be calculated — use qualitative discussion only."
        )
        if rel_ins.get("summaryLine"):
            lines.append(str(rel_ins["summaryLine"]))
        return lines

    if rel_ins.get("pearson") is not None:
        try:
            lines.append(
                f"Pearson correlation coefficient: {float(rel_ins['pearson']):+.2f}"
            )
        except (TypeError, ValueError):
            pass
    if rel_ins.get("spearman") is not None:
        try:
            lines.append(
                f"Spearman correlation coefficient: {float(rel_ins['spearman']):+.2f}"
            )
        except (TypeError, ValueError):
            pass
    if rel_ins.get("correlationStrength"):
        lines.append(f"Interpretation: {rel_ins.get('correlationStrength')}")
    if rel_ins.get("correlationLabel"):
        lines.append(f"Signed strength: {rel_ins.get('correlationLabel')}")
    if rel_ins.get("summaryLine"):
        lines.append(str(rel_ins["summaryLine"]))
    warn = rel_ins.get("correlationSampleWarning")
    if isinstance(warn, str) and warn.strip():
        lines.append(warn.strip())
    return lines
