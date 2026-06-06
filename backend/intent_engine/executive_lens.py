"""
Executive business lenses — opportunity, risk, summary, driver — schema-driven only.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from intent_engine.insight_card_titles import build_insight_card_title

ExecutiveLens = Optional[str]  # summary | opportunity | risk | driver | explain | strategy | loss | standout

_EXECUTIVE_RISK_PRIORITY_LABELS = (
    "Primary concern",
    "Secondary concern",
    "Watch item",
)


def _apply_executive_risk_prioritization(
    cards: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Label top risk cards for executive prioritization (primary → secondary → watch)."""
    if not cards:
        return cards
    ordered = sorted(cards, key=lambda c: -int(c.get("priority") or 0))
    out: List[Dict[str, Any]] = []
    for idx, card in enumerate(ordered):
        row = dict(card)
        if idx < len(_EXECUTIVE_RISK_PRIORITY_LABELS):
            label = _EXECUTIVE_RISK_PRIORITY_LABELS[idx]
            row["executivePriorityTier"] = label
            base_title = str(row.get("title") or "").strip()
            if base_title and not base_title.lower().startswith(label.lower()):
                row["title"] = f"{label}: {base_title}"
        out.append(row)
    return out

_OPPORTUNITY_RE = re.compile(
    r"\b("
    r"opportunit(?:y|ies)|upside|invest(?:ment)?|where\s+should\s+we\s+(?:grow|invest)|"
    r"growth\s+opportunit|biggest\s+growth|untapped|underperforming\s+segment|"
    r"improvement\s+candidate|expand|potential"
    r")\b",
    re.I,
)
_RISK_RE = re.compile(
    r"\b("
    r"risks?|risky|concentration|depend(?:ence|ent)|vulnerabilit|weak\s+segment|"
    r"declin(?:e|ing)|margin\s+risk|volatil|exposure|underperform"
    r")\b",
    re.I,
)
_SUMMARY_RE = re.compile(
    r"\b("
    r"summarize|summary|business\s+performance|executive\s+summary|key\s+takeaways|"
    r"overall\s+performance|headline|business\s+overview"
    r")\b",
    re.I,
)
_DRIVER_RE = re.compile(
    r"\b("
    r"what\s+drives?|driver|driving|main\s+factor|biggest\s+factor|"
    r"most\s+influential|key\s+driver"
    r")\b",
    re.I,
)


def detect_executive_lens(question: str) -> ExecutiveLens:
    q = (question or "").strip()
    if not q:
        return None
    try:
        from intent_engine.executive_ambiguous_intent import (
            bucket_to_executive_lens,
            classify_executive_ambiguous_bucket,
        )

        bucket = classify_executive_ambiguous_bucket(q)
        if bucket:
            return bucket_to_executive_lens(bucket)  # type: ignore[return-value]
    except Exception:
        pass
    if _DRIVER_RE.search(q) and not _OPPORTUNITY_RE.search(q) and not _RISK_RE.search(q):
        return "driver"
    risk_hit = _RISK_RE.search(q)
    opp_hit = _OPPORTUNITY_RE.search(q)
    if risk_hit and opp_hit:
        return "risk" if risk_hit.start() <= opp_hit.start() else "opportunity"
    if risk_hit:
        return "risk"
    if opp_hit:
        return "opportunity"
    if _SUMMARY_RE.search(q):
        return "summary"
    if re.search(r"\bexplains?\b", q, re.I) and re.search(
        r"\bperformance\b", q, re.I
    ):
        return "explain"
    return None


def question_requests_executive_summary(question: str) -> bool:
    return detect_executive_lens(question) is not None


def _pretty_col(name: str) -> str:
    return str(name).replace("_", " ").strip().title()


def _numeric_cols(df: pd.DataFrame, profile: Dict[str, Any]) -> List[str]:
    ct = profile.get("column_types", {}) if profile else {}
    return [str(c) for c in df.columns if ct.get(c) == "number"]


def _categorical_cols(df: pd.DataFrame, profile: Dict[str, Any]) -> List[str]:
    ct = profile.get("column_types", {}) if profile else {}
    return [str(c) for c in df.columns if ct.get(c) not in ("number", "date")]


def _pick_metric_col(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
    *,
    prefer: Tuple[str, ...] = ("revenue", "profit", "sales", "customers", "orders"),
) -> Optional[str]:
    ql = (question or "").lower()
    numeric = _numeric_cols(df, profile)
    for hint in prefer:
        if hint in ql:
            for c in numeric:
                if hint in str(c).lower().replace("_", " "):
                    return str(c)
    for hint in prefer:
        for c in numeric:
            if hint in str(c).lower().replace("_", " "):
                return str(c)
    return str(numeric[0]) if numeric else None


def _pick_growth_col(df: pd.DataFrame, profile: Dict[str, Any]) -> Optional[str]:
    for c in _numeric_cols(df, profile):
        cn = str(c).lower().replace("_", " ")
        if "growth" in cn or cn in ("growth_rate", "growth rate", "yoy", "mom"):
            return str(c)
    return None


def _pick_breakdown_col(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    *,
    question: str = "",
) -> Optional[str]:
    try:
        from intent_engine.geographic_scope import resolve_geographic_group_column

        geo = resolve_geographic_group_column(question or "compare region performance", df, profile)
        if geo:
            return str(geo)
    except Exception:
        pass
    cats = _categorical_cols(df, profile)
    scored: List[Tuple[int, str]] = []
    for c in cats:
        try:
            nu = int(df[c].nunique(dropna=True))
        except Exception:
            continue
        if nu < 2 or nu > 40:
            continue
        cn = str(c).lower()
        score = 0
        if any(t in cn for t in ("region", "zone", "city", "product", "category", "segment")):
            score += 20
        score += min(nu, 12)
        scored.append((score, str(c)))
    if not scored:
        return None
    scored.sort(key=lambda t: (-t[0], t[1]))
    return scored[0][1]


def _fmt_pct(pct: float) -> str:
    if pct >= 10:
        return f"{round(pct)}%"
    return f"{pct:.1f}%"


def _summary_trend_narrative(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    metric_col: str,
    met_label: str,
) -> Optional[str]:
    try:
        from intent_engine import legacy

        date_col = legacy.pick_date_column_for_trend(df, profile)
    except Exception:
        date_col = None
    if not date_col or date_col not in df.columns or metric_col not in df.columns:
        return None
    sub = df[[date_col, metric_col]].copy()
    sub[date_col] = pd.to_datetime(sub[date_col], errors="coerce")
    sub[metric_col] = pd.to_numeric(sub[metric_col], errors="coerce")
    sub = sub.dropna()
    if len(sub) < 4:
        return None
    try:
        monthly = (
            sub.groupby(sub[date_col].dt.to_period("M"))[metric_col]
            .sum()
            .sort_index()
        )
    except Exception:
        return None
    if len(monthly) < 2:
        return None
    first = float(monthly.iloc[0])
    last = float(monthly.iloc[-1])
    if first <= 1e-9:
        return None
    chg = 100.0 * (last - first) / first
    if abs(chg) < 3:
        return None
    direction = "up" if chg > 0 else "down"
    return (
        f"In this sample, {met_label.lower()} trends {direction} from the earliest to latest "
        f"period ({_fmt_pct(abs(chg))} change, directional)."
    )


def _group_totals(
    df: pd.DataFrame,
    group_col: str,
    metric_col: str,
    *,
    extra_numeric: Optional[List[str]] = None,
) -> pd.DataFrame:
    use = [group_col, metric_col]
    for c in extra_numeric or []:
        if c in df.columns and c not in use:
            use.append(c)
    sub = df[use].copy()
    for c in use[1:]:
        sub[c] = pd.to_numeric(sub[c], errors="coerce")
    g = sub.groupby(group_col, dropna=False).sum(numeric_only=True).reset_index()
    return g


def _auxiliary_metric_in_analysis_scope(
    col: Optional[str],
    metric_col: str,
    question: str,
) -> bool:
    """
    Secondary metrics may appear in lens cards only when they are the chart metric
    or explicitly referenced in the question (schema-driven, no hardcoded columns).
    """
    if not col:
        return False
    if str(col).lower() == str(metric_col).lower():
        return True
    ql = (question or "").lower()
    cl = str(col).lower().replace("_", " ")
    if cl in ql or f"{cl.rstrip('s')}s" in ql:
        return True
    try:
        from intent_engine.column_resolve import column_matches_token

        if column_matches_token(str(col), question):
            return True
    except Exception:
        pass
    return False


def build_lens_specific_insights(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    *,
    question: str,
    lens: ExecutiveLens,
    metric_col: Optional[str] = None,
    dimension_col: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Schema-driven opportunity/risk cards beyond simple ranking."""
    if df is None or df.empty or not lens:
        return []

    metric = metric_col or _pick_metric_col(question, df, profile)
    dim = dimension_col or _pick_breakdown_col(df, profile, question=question)
    if not metric or not dim or metric not in df.columns or dim not in df.columns:
        return []

    growth_col = _pick_growth_col(df, profile)
    profit_col = next(
        (c for c in _numeric_cols(df, profile) if "profit" in str(c).lower()),
        None,
    )
    revenue_col = next(
        (
            c
            for c in _numeric_cols(df, profile)
            if any(h in str(c).lower() for h in ("revenue", "sales"))
        ),
        None,
    )
    customer_col = next(
        (c for c in _numeric_cols(df, profile) if "customer" in str(c).lower()),
        None,
    )

    extra = [c for c in (growth_col, profit_col, customer_col) if c]
    g = _group_totals(df, dim, metric, extra_numeric=extra)
    if len(g) < 2:
        return []

    g = g.sort_values(metric, ascending=False)
    total_metric = float(g[metric].sum()) or 0.0
    if total_metric <= 0:
        return []

    dim_label = _pretty_col(dim)
    met_label = _pretty_col(metric)
    out: List[Dict[str, Any]] = []

    def _card(kind: str, priority: int, title: str, value: str, narrative: str) -> Dict[str, Any]:
        return {
            "kind": kind,
            "priority": priority,
            "title": title,
            "value": value,
            "hint": narrative,
            "narrativeLine": narrative,
            "executiveLens": lens,
        }

    top_share = 100.0 * float(g[metric].iloc[0]) / total_metric
    top_name = str(g[dim].iloc[0])
    bot_name = str(g[dim].iloc[-1])

    if lens == "risk":
        if top_share >= 30:
            out.append(
                _card(
                    "concentration",
                    92,
                    build_insight_card_title(met_label, "concentration"),
                    f"{top_share:.0f}%",
                    f"In this sample, {top_name} accounts for {top_share:.0f}% of total {met_label.lower()} "
                    f"— concentration risk if performance depends on one {dim_label.lower()}.",
                )
            )
        weak_risk_entity: Optional[str] = None
        if growth_col and growth_col in g.columns:
            g_g = g.sort_values(growth_col, ascending=True)
            low_g = g_g.iloc[0]
            if float(low_g[growth_col]) < float(g[growth_col].median()):
                weak_risk_entity = str(low_g[dim])
                out.append(
                    _card(
                        "risk",
                        80,
                        "Growth Risk",
                        weak_risk_entity,
                        f"The data suggests {low_g[dim]} has the weakest { _pretty_col(growth_col).lower() } "
                        f"among {dim_label.lower()}s — a potential decline or stagnation risk.",
                    )
                )
        if profit_col and profit_col in g.columns and metric != profit_col:
            g["margin"] = g[profit_col] / g[metric].replace(0, pd.NA)
            weak = g.sort_values("margin", ascending=True).iloc[0]
            if pd.notna(weak["margin"]) and str(weak[dim]) != weak_risk_entity:
                out.append(
                    _card(
                        "risk",
                        74,
                        "Margin Risk",
                        str(weak[dim]),
                        f"{weak[dim]} shows the lowest profit-to-{met_label.lower()} ratio in this sample — "
                        "margin risk may be elevated there.",
                    )
                )
        if str(bot_name) != weak_risk_entity:
            out.append(
                _card(
                    "risk",
                    68,
                    build_insight_card_title(met_label, "risk"),
                    bot_name,
                    f"{bot_name} ranks lowest on {met_label.lower()} across {dim_label.lower()}s in this cohort.",
                )
            )
        out = _apply_executive_risk_prioritization(out)

    elif lens == "opportunity":
        did_monetization_gap = False
        if (
            growth_col
            and growth_col in g.columns
            and _auxiliary_metric_in_analysis_scope(growth_col, metric, question)
        ):
            g_o = g.copy()
            g_o["_rev_rank"] = g_o[metric].rank(pct=True)
            g_o["_gro_rank"] = g_o[growth_col].rank(pct=True)
            g_o["_upside"] = g_o["_gro_rank"] - g_o["_rev_rank"]
            upside = g_o.sort_values("_upside", ascending=False).iloc[0]
            if float(upside["_upside"]) > 0.15:
                out.append(
                    _card(
                        "opportunity",
                        88,
                        "Opportunity Region",
                        str(upside[dim]),
                        f"{upside[dim]} combines relatively strong {_pretty_col(growth_col).lower()} "
                        f"with below-median {met_label.lower()} — possible expansion candidate in this sample.",
                    )
                )
        if (
            customer_col
            and customer_col in g.columns
            and _auxiliary_metric_in_analysis_scope(customer_col, metric, question)
        ):
            g_c = g.copy()
            g_c["_cust_rank"] = g_c[customer_col].rank(pct=True)
            g_c["_rev_rank"] = g_c[metric].rank(pct=True)
            g_c["_gap"] = g_c["_cust_rank"] - g_c["_rev_rank"]
            gap_row = g_c.sort_values("_gap", ascending=False).iloc[0]
            if float(gap_row["_gap"]) > 0.2:
                cust_lbl = _pretty_col(customer_col).lower()
                out.append(
                    _card(
                        "opportunity",
                        84,
                        build_insight_card_title(met_label, "gap"),
                        str(gap_row[dim]),
                        f"{gap_row[dim]} ranks higher on {cust_lbl} than on {met_label.lower()} "
                        "among peers — uplift may be available in this sample.",
                    )
                )
                did_monetization_gap = True
        spread = float(g[metric].iloc[0]) - float(g[metric].iloc[-1])
        if spread > 0 and float(g[metric].iloc[0]) > 0:
            pct = 100.0 * spread / float(g[metric].iloc[0])
            if pct >= 15:
                # Avoid duplicate “gap” style cards when we already emitted a monetization gap.
                if not did_monetization_gap:
                    out.append(
                        _card(
                            "opportunity",
                            72,
                            build_insight_card_title(met_label, "gap"),
                            f"{spread:,.0f}",
                            f"{bot_name} may represent an uplift opportunity based on "
                            f"{met_label.lower()} gap in this sample; additional measures "
                            "from your schema would strengthen the read.",
                        )
                    )

    elif lens == "explain":
        out.append(
            _card(
                "ranking",
                70,
                f"Top {dim_label}",
                top_name,
                f"In this sample, {top_name} leads on {met_label.lower()} across {dim_label.lower()}s.",
            )
        )
        if top_share >= 25:
            out.append(
                _card(
                    "concentration",
                    65,
                    "Share of total",
                    f"{top_share:.0f}%",
                    f"The data suggests {top_name} contributes {top_share:.0f}% of total {met_label.lower()}.",
                )
            )

    elif lens == "strategy":
        risk_slice = build_lens_specific_insights(
            df, profile, question=question, lens="risk", metric_col=metric, dimension_col=dim
        )
        opp_slice = build_lens_specific_insights(
            df,
            profile,
            question=question,
            lens="opportunity",
            metric_col=metric,
            dimension_col=dim,
        )
        for card in (risk_slice[:2] + opp_slice[:1]):
            c = dict(card)
            c["executiveLens"] = "strategy"
            c["priority"] = int(c.get("priority") or 0) + 4
            out.append(c)
        if top_share >= 28:
            out.append(
                _card(
                    "concentration",
                    68,
                    build_insight_card_title(met_label, "concentration"),
                    f"{top_share:.0f}%",
                    f"Priority signal: {top_name} contributes {top_share:.0f}% of total "
                    f"{met_label.lower()} — consider diversification alongside growth bets.",
                )
            )
        if not out:
            out.append(
                _card(
                    "ranking",
                    66,
                    "Management focus",
                    top_name,
                    f"Lead with {top_name} performance and weakest peer {bot_name} "
                    f"when setting near-term priorities across {dim_label.lower()}s.",
                )
            )

    elif lens == "loss":
        g_loss = g.sort_values(metric, ascending=True)
        low_row = g_loss.iloc[0]
        low_val = float(low_row[metric])
        if low_val < 0:
            out.append(
                _card(
                    "risk",
                    90,
                    "Loss segment",
                    str(low_row[dim]),
                    f"{low_row[dim]} shows negative grouped {met_label.lower()} "
                    f"({low_val:,.0f}) in this sample.",
                )
            )
        else:
            out.append(
                _card(
                    "ranking",
                    88,
                    "No loss rows",
                    "None",
                    f"No loss-making groups in this cohort — lowest profit is "
                    f"{low_row[dim]} at {low_val:,.0f} (still >= 0).",
                )
            )
        if (
            profit_col
            and revenue_col
            and metric == profit_col
            and profit_col in df.columns
            and revenue_col in df.columns
        ):
            g2 = _group_totals(df, dim, profit_col, extra_numeric=[revenue_col])
            if len(g2) >= 2 and revenue_col in g2.columns:
                g2["margin"] = g2[profit_col] / g2[revenue_col].replace(0, pd.NA)
                weak_m = g2.sort_values("margin", ascending=True).iloc[0]
                if pd.notna(weak_m["margin"]):
                    out.append(
                        _card(
                            "risk",
                            78,
                            "Margin pressure",
                            str(weak_m[dim]),
                            f"{weak_m[dim]} has the lowest profit-to-revenue ratio "
                            "in this sample.",
                        )
                    )

    elif lens == "standout":
        spread = float(g[metric].iloc[0]) - float(g[metric].iloc[-1])
        if spread > 0 and float(g[metric].iloc[0]) > 0:
            gap_pct = 100.0 * spread / float(g[metric].iloc[0])
            if gap_pct >= 12:
                out.append(
                    _card(
                        "outlier",
                        86,
                        "Largest gap",
                        _fmt_pct(gap_pct),
                        f"Largest standout gap: {top_name} vs {bot_name} "
                        f"({ _fmt_pct(gap_pct) } spread on {met_label.lower()}).",
                    )
                )
        if top_share >= 30:
            out.append(
                _card(
                    "concentration",
                    82,
                    build_insight_card_title(met_label, "concentration"),
                    f"{top_share:.0f}%",
                    f"Unusual concentration: {top_name} accounts for {top_share:.0f}% of "
                    f"total {met_label.lower()} in this cohort.",
                )
            )
        out.append(
            _card(
                "outlier",
                74,
                "High outlier",
                top_name,
                f"{top_name} is the strongest standout on {met_label.lower()} "
                f"at {float(g[metric].iloc[0]):,.0f}.",
            )
        )
        out.append(
            _card(
                "outlier",
                70,
                "Low outlier",
                bot_name,
                f"{bot_name} is the weakest standout on {met_label.lower()} "
                f"at {float(g[metric].iloc[-1]):,.0f}.",
            )
        )

    elif lens == "summary":
        out.append(
            _card(
                "ranking",
                72,
                f"Top {dim_label}",
                top_name,
                f"In this sample, {top_name} leads on {met_label.lower()} across {dim_label.lower()}s.",
            )
        )
        if top_share >= 25:
            out.append(
                _card(
                    "concentration",
                    70,
                    build_insight_card_title(met_label, "concentration"),
                    f"{top_share:.0f}%",
                    f"The data suggests {top_name} contributes {top_share:.0f}% of total {met_label.lower()}.",
                )
            )
        spread = float(g[metric].iloc[0]) - float(g[metric].iloc[-1])
        if spread > 0 and float(g[metric].iloc[0]) > 0:
            gap_pct = 100.0 * spread / float(g[metric].iloc[0])
            if gap_pct >= 12:
                out.append(
                    _card(
                        "gap",
                        66,
                        build_insight_card_title(met_label, "gap"),
                        _fmt_pct(gap_pct),
                        f"{top_name} leads {bot_name} by {_fmt_pct(gap_pct)} on {met_label.lower()} "
                        f"across {dim_label.lower()}s in this sample.",
                    )
                )
        trend_line = _summary_trend_narrative(df, profile, metric, met_label)
        if trend_line:
            out.append(
                _card(
                    "trend",
                    64,
                    "Trend direction",
                    "Directional",
                    trend_line,
                )
            )
        if profit_col and profit_col in g.columns and metric != profit_col:
            g_m = g.copy()
            g_m["margin"] = g_m[profit_col] / g_m[metric].replace(0, pd.NA)
            best = g_m.sort_values("margin", ascending=False).iloc[0]
            if pd.notna(best["margin"]):
                margin_pct = 100.0 * float(best["margin"])
                out.append(
                    _card(
                        "ranking",
                        60,
                        "Profitability",
                        str(best[dim]),
                        f"{best[dim]} shows the strongest profit-to-{met_label.lower()} ratio "
                        f"in this sample ({_fmt_pct(margin_pct)} margin, directional).",
                    )
                )
        if growth_col and growth_col in g.columns:
            high_g = g.sort_values(growth_col, ascending=False).iloc[0]
            low_g = g.sort_values(growth_col, ascending=True).iloc[0]
            gro_lbl = _pretty_col(growth_col).lower()
            if float(high_g[growth_col]) > float(g[growth_col].median()):
                out.append(
                    _card(
                        "ranking",
                        58,
                        f"Strong { _pretty_col(growth_col) }",
                        str(high_g[dim]),
                        f"In this sample, {high_g[dim]} shows the strongest {gro_lbl} among "
                        f"{dim_label.lower()}s.",
                    )
                )
            if float(low_g[growth_col]) < float(g[growth_col].median()) and str(
                low_g[dim]
            ) != str(high_g[dim]):
                out.append(
                    _card(
                        "risk",
                        56,
                        "Growth watch",
                        str(low_g[dim]),
                        f"{low_g[dim]} has the weakest {gro_lbl} among {dim_label.lower()}s — "
                        "a possible stagnation signal in this sample.",
                    )
                )

    return out


def merge_lens_insights(
    base: List[Dict[str, Any]],
    lens_insights: List[Dict[str, Any]],
    *,
    lens: ExecutiveLens,
) -> List[Dict[str, Any]]:
    """Boost lens-relevant kinds; deprioritize mismatched cards."""
    if not lens:
        return base

    prefer: Dict[str, int] = {
        "opportunity": {"opportunity": 18, "gap": 12, "ranking": 4, "concentration": -6, "risk": -20},
        "risk": {"risk": 18, "concentration": 14, "outlier": 10, "opportunity": -12, "gap": -8},
        # Summary: multi-signal synthesis; deprioritize opportunity-style cards from base ranker.
        "summary": {
            "concentration": 12,
            "ranking": 10,
            "gap": 10,
            "trend": 9,
            "opportunity": -18,
            "risk": -6,
        },
        "driver": {"ranking": -4, "concentration": -4},
        "explain": {"ranking": 6, "opportunity": 4, "concentration": 2},
        "strategy": {"concentration": 12, "risk": 10, "opportunity": 8, "gap": 6, "ranking": -8},
        "loss": {"risk": 14, "ranking": 8, "concentration": -10, "opportunity": -20},
        "standout": {"outlier": 16, "gap": 12, "concentration": 10, "ranking": -6},
    }.get(lens, {})

    merged = list(lens_insights) + list(base)
    if lens == "risk" and lens_insights:
        lens_risk_vals = {
            str(x.get("value") or "").strip().lower()
            for x in lens_insights
            if str(x.get("kind") or "").strip().lower() == "risk"
        }
        if lens_risk_vals:
            merged = list(lens_insights) + [
                b
                for b in base
                if not (
                    str(b.get("kind") or "").strip().lower() == "risk"
                    and str(b.get("value") or "").strip().lower() in lens_risk_vals
                )
            ]
    best_by_key: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
    disallowed_kinds: set[str] = set()
    if lens == "summary":
        disallowed_kinds = {"opportunity"}
    elif lens == "risk":
        disallowed_kinds = {"opportunity"}
    elif lens == "loss":
        disallowed_kinds = {"opportunity", "concentration"}
    elif lens == "standout":
        disallowed_kinds = {"opportunity", "risk"}

    for item in merged:
        kind = str(item.get("kind") or "").strip().lower()
        if kind in disallowed_kinds:
            continue
        title = str(item.get("title") or item.get("narrativeLine") or kind or "").strip()
        value = str(item.get("value") or "").strip()
        if not title:
            continue
        key = (kind, title.lower(), value.lower())
        pri = int(item.get("priority") or 0) + int(prefer.get(kind, 0))
        row = dict(item)
        row["priority"] = pri
        row["executiveLens"] = lens
        if key not in best_by_key or pri > int(best_by_key[key].get("priority") or 0):
            best_by_key[key] = row

    out = list(best_by_key.values())
    out.sort(key=lambda x: -int(x.get("priority") or 0))

    if lens == "risk":
        pruned: List[Dict[str, Any]] = []
        risk_entity_seen: set = set()
        for item in out:
            kind = str(item.get("kind") or "").strip().lower()
            val = str(item.get("value") or "").strip().lower()
            if kind == "risk" and val:
                if val in risk_entity_seen:
                    continue
                risk_entity_seen.add(val)
            pruned.append(item)
        out = pruned

    return out[:5]


def executive_lens_prompt_block(lens: ExecutiveLens) -> str:
    if not lens:
        return ""
    tone = (
        "Use hedged executive language: \"In this sample\", \"The data suggests\", "
        "\"This may indicate\", \"Directional, not definitive\". "
        "Avoid causal claims unless the chart directly supports them."
    )
    blocks = {
        "opportunity": (
            "Executive lens: GROWTH OPPORTUNITY.\n"
            "- Emphasize underperforming segments with upside, high growth with low revenue, "
            "high customers with low revenue, and peer gaps.\n"
            "- Do not frame the answer as a simple revenue ranking.\n"
            f"- {tone}"
        ),
        "risk": (
            "Executive lens: BUSINESS RISK.\n"
            "- Emphasize concentration, dependence on top products/regions, weak segments, "
            "low growth areas, and margin pressure when profit data exists.\n"
            "- Do not frame the answer as a simple revenue ranking.\n"
            f"- {tone}"
        ),
        "summary": (
            "Executive lens: BUSINESS SUMMARY.\n"
            "- Synthesize revenue, profit, customers, and growth signals when columns exist.\n"
            "- Lead with concentration and leader/laggard context, not a bare top-N list.\n"
            f"- {tone}"
        ),
        "driver": (
            "Executive lens: DRIVER ANALYSIS.\n"
            "- Discuss which factors correlate with the outcome; avoid claiming causation.\n"
            f"- {tone}"
        ),
        "explain": (
            "Executive lens: ENTITY PERFORMANCE EXPLANATION.\n"
            "- Explain the filtered entity's performance vs peers using available breakdown columns.\n"
            f"- {tone}"
        ),
        "strategy": (
            "Executive lens: MANAGEMENT PRIORITIES.\n"
            "- Combine concentration, risk, opportunity, and growth/margin signals — not a single ranking.\n"
            f"- {tone}"
        ),
        "loss": (
            "Executive lens: LOSS / PROFITABILITY.\n"
            "- Use profit totals; state if no loss-making groups exist.\n"
            "- Never describe revenue ranking as loss analysis.\n"
            f"- {tone}"
        ),
        "standout": (
            "Executive lens: STANDOUT / OUTLIER.\n"
            "- Highlight unusual highs, lows, gaps, and concentration.\n"
            f"- {tone}"
        ),
    }
    return blocks.get(lens, "")
