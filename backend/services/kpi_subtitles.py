"""KPI-specific subtitle generation — separate from chart/insight fallbacks."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

import pandas as pd

from services.kpi_polish import contribution_subtitle, is_valid_subtitle_dimension, subtitle_looks_weak

_FORBIDDEN_DIM_TOKENS = (
    "date",
    "time",
    "timestamp",
    "period",
    "month",
    "year",
    "hire",
    "name",
    "employee_name",
    "full_name",
    "operator",
    "sales_rep",
    "rep",
    "manager",
    "email",
    "uuid",
    "guid",
)

_FORBIDDEN_DIM_SUFFIXES = ("_id", "_key", "_code", "_no", "_number")


@dataclass
class SubtitleResult:
    text: str
    source_dimension: str
    source_metric: str


def _col_tokens(col: str) -> List[str]:
    return [t for t in re.split(r"[_\s]+", str(col).lower()) if t]


def _dim_phrase(col: str, pretty_label: Callable[[str], str]) -> str:
    phrase = pretty_label(str(col).strip())
    phrase = re.sub(r"\s+(names?|ids?|codes?)$", "", phrase, flags=re.I).strip()
    return phrase.lower() if phrase else "group"


def _metric_phrase(col: str, pretty_label: Callable[[str], str]) -> str:
    return pretty_label(str(col)).lower()


def _group_leader(
    df: pd.DataFrame,
    dim_col: str,
    metric_col: str,
    numeric_series: Callable[[str], pd.Series],
    *,
    agg: str = "sum",
) -> Optional[Tuple[str, float]]:
    if dim_col not in df.columns or metric_col not in df.columns:
        return None
    try:
        sub = df[[dim_col, metric_col]].copy()
        sub["_v"] = numeric_series(metric_col)
        sub = sub.dropna(subset=[dim_col, "_v"])
        if sub.empty:
            return None
        if agg == "mean":
            g = sub.groupby(dim_col)["_v"].mean()
        else:
            g = sub.groupby(dim_col)["_v"].sum()
        g = g.sort_values(ascending=False)
        if g.empty:
            return None
        from services.kpi_polish import pick_valid_leader_from_groups

        return pick_valid_leader_from_groups(g)
    except Exception:
        return None


def _share_pct(part: float, whole: float) -> Optional[float]:
    if whole <= 0:
        return None
    return 100.0 * part / whole


def _pick_first_valid_dim(columns: List[str], candidates: Tuple[str, ...]) -> Optional[str]:
    normalized = {str(c).lower().replace("_", " "): str(c) for c in columns}
    for kw in candidates:
        kw_lc = kw.lower().replace("_", " ")
        for col_lc, col in normalized.items():
            if col_lc == kw_lc and is_valid_subtitle_dimension(col):
                return col
    for kw in candidates:
        kw_lc = kw.lower().replace("_", " ")
        for col_lc, col in normalized.items():
            if kw_lc in col_lc and is_valid_subtitle_dimension(col):
                return col
    return None


def build_kpi_subtitle(
    *,
    title: str,
    df: pd.DataFrame,
    columns: List[str],
    numeric_series: Callable[[str], pd.Series],
    pretty_label: Callable[[str], str],
    domain: str,
) -> Optional[SubtitleResult]:
    """Return KPI-specific supporting subtitle for a card title."""
    t = title.strip().lower()
    category = _pick_first_valid_dim(
        columns, ("category", "line item", "line_item", "cost_center", "cost center")
    )
    dept = _pick_first_valid_dim(columns, ("department", "dept", "team", "division"))
    cost = _pick_first_valid_dim(columns, ("cost", "expense", "cogs"))
    budget = _pick_first_valid_dim(columns, ("budget",))
    variance = _pick_first_valid_dim(columns, ("variance",))
    region = _pick_first_valid_dim(
        columns, ("region", "zone", "territory", "market", "country", "state")
    )
    city = _pick_first_valid_dim(columns, ("city",))
    product = _pick_first_valid_dim(
        columns,
        ("product", "product_category", "product category", "product_line", "product line", "category", "sku"),
    )
    plant = _pick_first_valid_dim(columns, ("facility", "plant", "site"))
    line = _pick_first_valid_dim(columns, ("production_line", "production line", "line"))
    salary = _pick_first_valid_dim(columns, ("salary", "compensation", "ctc", "pay", "wage", "personnel cost"))
    bonus = _pick_first_valid_dim(columns, ("bonus",))
    headcount = _pick_first_valid_dim(columns, ("headcount",))
    revenue = _pick_first_valid_dim(columns, ("revenue", "sales", "order_value", "order value", "spend_amount"))
    profit = _pick_first_valid_dim(columns, ("profit", "margin"))
    downtime = _pick_first_valid_dim(columns, ("downtime_hours", "downtime hours", "downtime_minutes", "downtime minutes"))
    defect = _pick_first_valid_dim(columns, ("defect_rate", "defect rate"))
    attrition = _pick_first_valid_dim(columns, ("attrition_rate", "attrition rate"))
    emp_id = _pick_first_valid_dim(columns, ("employee_id", "employee id", "emp_id"))

    # --- HR ---
    if t in ("total employees", "total headcount"):
        if dept:
            if emp_id:
                vc = df.groupby(dept)[emp_id].nunique().sort_values(ascending=False)
                if not vc.empty:
                    leader = str(vc.index[0])[:52]
                    n_dept = int(df[dept].nunique(dropna=True))
                    return SubtitleResult(
                        f"{n_dept} departments · Largest: {leader}",
                        dept,
                        emp_id,
                    )
            if headcount:
                lead = _group_leader(df, dept, headcount, numeric_series, agg="sum")
                if lead:
                    n_dept = int(df[dept].nunique(dropna=True))
                    return SubtitleResult(
                        f"{n_dept} departments · Largest: {lead[0]}",
                        dept,
                        headcount,
                    )
            n_dept = int(df[dept].nunique(dropna=True))
            vc = df[dept].astype(str).value_counts()
            if not vc.empty:
                return SubtitleResult(
                    f"{n_dept} departments · Largest: {str(vc.index[0])[:52]}",
                    dept,
                    "row_count",
                )

    if "average" in t and "salary" in t and dept and salary:
        lead = _group_leader(df, dept, salary, numeric_series, agg="mean")
        if lead:
            return SubtitleResult(
                f"Highest-paying department: {lead[0]}",
                dept,
                salary,
            )

    if "average" in t and "bonus" in t and dept and bonus:
        lead = _group_leader(df, dept, bonus, numeric_series, agg="mean")
        if lead:
            return SubtitleResult(
                f"Highest bonus department: {lead[0]}",
                dept,
                bonus,
            )

    if t == "department count" and dept:
        metric = headcount or salary or emp_id or "row_count"
        if headcount:
            lead = _group_leader(df, dept, headcount, numeric_series, agg="sum")
        elif emp_id:
            vc = df.groupby(dept)[emp_id].nunique().sort_values(ascending=False)
            lead = (str(vc.index[0]), float(vc.iloc[0])) if not vc.empty else None
        else:
            vc = df[dept].astype(str).value_counts()
            lead = (str(vc.index[0]), float(vc.iloc[0])) if not vc.empty else None
        if lead:
            return SubtitleResult(
                f"Largest department: {lead[0]}",
                dept,
                str(metric),
            )

    if "attrition" in t and dept and attrition:
        lead = _group_leader(df, dept, attrition, numeric_series, agg="mean")
        if lead:
            return SubtitleResult(
                f"Highest attrition department: {lead[0]}",
                dept,
                attrition,
            )

    if t.startswith("average") and "personnel" in t and dept and salary:
        lead = _group_leader(df, dept, salary, numeric_series, agg="mean")
        if lead:
            return SubtitleResult(
                f"Highest personnel cost department: {lead[0]}",
                dept,
                salary,
            )

    # --- Sales / retail ---
    if t in ("total revenue", "total sales", "total order value"):
        if region and revenue:
            lead = _group_leader(df, region, revenue, numeric_series, agg="sum")
            if lead:
                total = float(numeric_series(revenue).sum(skipna=True))
                return SubtitleResult(
                    contribution_subtitle(lead[0], lead[1], total, "revenue"),
                    region,
                    revenue,
                )
        if product and revenue:
            lead = _group_leader(df, product, revenue, numeric_series, agg="sum")
            if lead:
                total = float(numeric_series(revenue).sum(skipna=True))
                return SubtitleResult(
                    contribution_subtitle(lead[0], lead[1], total, "revenue"),
                    product,
                    revenue,
                )

    if t in (
        "average revenue",
        "average revenue per record",
        "average sales",
        "average order value",
    ):
        if product and revenue:
            lead = _group_leader(df, product, revenue, numeric_series, agg="mean")
            if lead:
                return SubtitleResult(
                    contribution_subtitle(
                        lead[0], lead[1], float(numeric_series(revenue).sum(skipna=True)), "revenue", agg="mean"
                    ),
                    product,
                    revenue,
                )
        if region and revenue:
            lead = _group_leader(df, region, revenue, numeric_series, agg="mean")
            if lead:
                return SubtitleResult(
                    contribution_subtitle(
                        lead[0], lead[1], float(numeric_series(revenue).sum(skipna=True)), "revenue", agg="mean"
                    ),
                    region,
                    revenue,
                )

    if t == "total profit":
        cost = _pick_first_valid_dim(columns, ("cost", "cogs", "expense"))
        if profit:
            if product:
                lead = _group_leader(df, product, profit, numeric_series, agg="sum")
                if lead:
                    return SubtitleResult(
                        f"Top product by profit: {lead[0]}",
                        product,
                        profit,
                    )
            if region:
                lead = _group_leader(df, region, profit, numeric_series, agg="sum")
                if lead:
                    return SubtitleResult(
                        f"Top region by profit: {lead[0]}",
                        region,
                        profit,
                    )
        if revenue and cost:
            dim_col = product or region
            if dim_col:
                try:
                    sub = df[[dim_col, revenue, cost]].copy()
                    sub["_p"] = numeric_series(revenue) - numeric_series(cost)
                    sub = sub.dropna(subset=[dim_col, "_p"])
                    if not sub.empty:
                        g = sub.groupby(dim_col)["_p"].sum().sort_values(ascending=False)
                        if not g.empty:
                            return SubtitleResult(
                                f"Top {_dim_phrase(dim_col, pretty_label)} by profit: {str(g.index[0])[:52]}",
                                dim_col,
                                "revenue_minus_cost",
                            )
                except Exception:
                    pass

    # --- Finance / FP&A ---
    if t == "total cost" and cost:
        dim_col = category or dept
        if dim_col:
            lead = _group_leader(df, dim_col, cost, numeric_series, agg="sum")
            if lead:
                dim_p = _dim_phrase(dim_col, pretty_label)
                return SubtitleResult(
                    f"Highest spend by {dim_p}: {lead[0]}",
                    dim_col,
                    cost,
                )

    if t == "net profit" and revenue and cost:
        dim_col = category or dept
        if dim_col:
            try:
                sub = df[[dim_col, revenue, cost]].copy()
                sub["_p"] = numeric_series(revenue) - numeric_series(cost)
                sub = sub.dropna(subset=[dim_col, "_p"])
                if not sub.empty:
                    g = sub.groupby(dim_col)["_p"].sum().sort_values(ascending=False)
                    if not g.empty:
                        return SubtitleResult(
                            f"Top {_dim_phrase(dim_col, pretty_label)} by profit: {str(g.index[0])[:52]}",
                            dim_col,
                            "revenue_minus_cost",
                        )
            except Exception:
                pass

    if t == "margin" and category and revenue and cost:
        try:
            sub = df[[category, revenue, cost]].copy()
            sub["_r"] = numeric_series(revenue)
            sub["_c"] = numeric_series(cost)
            sub = sub.dropna(subset=[category, "_r"])
            sub["_m"] = (sub["_r"] - sub["_c"]) / sub["_r"].replace(0, pd.NA) * 100.0
            g = sub.groupby(category)["_m"].mean().sort_values(ascending=False)
            if not g.empty:
                return SubtitleResult(
                    f"Highest margin category: {str(g.index[0])[:52]}",
                    category,
                    "margin_pct",
                )
        except Exception:
            pass

    actual = _pick_first_valid_dim(columns, ("actual",))

    if t == "total budget variance" and variance:
        dim_col = category or dept
        if dim_col:
            lead = _group_leader(df, dim_col, variance, numeric_series, agg="sum")
            if lead:
                return SubtitleResult(
                    f"Largest budget variance in {_dim_phrase(dim_col, pretty_label)}: {lead[0]}",
                    dim_col,
                    variance,
                )
    elif t == "total budget variance" and budget and actual:
        dim_col = category or dept
        if dim_col:
            try:
                sub = df[[dim_col, budget, actual]].copy()
                sub["_v"] = numeric_series(actual) - numeric_series(budget)
                sub = sub.dropna(subset=[dim_col, "_v"])
                if not sub.empty:
                    g = sub.groupby(dim_col)["_v"].sum().sort_values(ascending=False, key=abs)
                    if not g.empty:
                        return SubtitleResult(
                            f"Largest budget variance in {_dim_phrase(dim_col, pretty_label)}: {str(g.index[0])[:52]}",
                            dim_col,
                            "actual_minus_budget",
                        )
            except Exception:
                pass

    # Top dimension cards — contribution share
    if t.startswith("top "):
        dim_col = None
        metric_col = revenue or profit or downtime or headcount or salary
        tl = t.replace("top ", "")
        if "region" in tl or "zone" in tl:
            dim_col = region or _pick_first_valid_dim(columns, ("zone",))
        elif "city" in tl:
            dim_col = city
        elif "product" in tl or "category" in tl or "line" in tl:
            dim_col = product
        elif "department" in tl:
            dim_col = dept
        elif "plant" in tl or "facility" in tl:
            dim_col = plant
        elif "production line" in tl or tl.strip() == "line":
            dim_col = line
        if dim_col and metric_col:
            lead = _group_leader(df, dim_col, metric_col, numeric_series, agg="sum")
            if lead:
                total = float(numeric_series(metric_col).sum(skipna=True))
                pct = _share_pct(lead[1], total)
                dim_p = _dim_phrase(dim_col, pretty_label)
                met_p = _metric_phrase(metric_col, pretty_label)
                if pct is not None and pct >= 1:
                    return SubtitleResult(
                        f"{lead[0]} contributes {pct:.0f}% of total {met_p}",
                        dim_col,
                        metric_col,
                    )
                return SubtitleResult(
                    f"Leading {dim_p} by {met_p}",
                    dim_col,
                    metric_col,
                )

    # --- Operations ---
    if "downtime" in t and plant and downtime:
        lead = _group_leader(df, plant, downtime, numeric_series, agg="sum")
        if lead:
            total = float(numeric_series(downtime).sum(skipna=True))
            pct = _share_pct(lead[1], total)
            if pct is not None:
                return SubtitleResult(
                    f"Highest downtime plant: {lead[0]} ({pct:.0f}% of total)",
                    plant,
                    downtime,
                )
            return SubtitleResult(
                f"Highest downtime plant: {lead[0]}",
                plant,
                downtime,
            )

    if "defect" in t:
        dim_col = line or plant or region
        if dim_col and defect:
            lead = _group_leader(df, dim_col, defect, numeric_series, agg="mean")
            if lead:
                return SubtitleResult(
                    f"{lead[0]} has the highest defect rate",
                    dim_col,
                    defect,
                )

    if "units produced" in t and plant:
        units = _pick_first_valid_dim(columns, ("units_produced", "units produced"))
        if units:
            lead = _group_leader(df, plant, units, numeric_series, agg="sum")
            if lead:
                total = float(numeric_series(units).sum(skipna=True))
                return SubtitleResult(
                    contribution_subtitle(lead[0], lead[1], total, "units produced"),
                    plant,
                    units,
                )

    # --- Marketing ---
    spend = _pick_first_valid_dim(columns, ("spend", "ad spend", "ad_spend"))
    campaign = _pick_first_valid_dim(columns, ("campaign", "campaign name", "channel"))
    conversions = _pick_first_valid_dim(columns, ("conversions", "conversion"))
    if t == "total spend" and campaign and spend:
        lead = _group_leader(df, campaign, spend, numeric_series, agg="sum")
        if lead:
            total = float(numeric_series(spend).sum(skipna=True))
            return SubtitleResult(
                contribution_subtitle(lead[0], lead[1], total, "spend"),
                campaign,
                spend,
            )
    if t == "total conversions" and campaign and conversions:
        lead = _group_leader(df, campaign, conversions, numeric_series, agg="sum")
        if lead:
            total = float(numeric_series(conversions).sum(skipna=True))
            return SubtitleResult(
                contribution_subtitle(lead[0], lead[1], total, "conversions"),
                campaign,
                conversions,
            )

    # --- Banking ---
    loan = _pick_first_valid_dim(columns, ("loan_balance", "loan balance"))
    segment = _pick_first_valid_dim(columns, ("customer_segment", "customer segment"))
    spend_amt = _pick_first_valid_dim(columns, ("spend_amount", "spend amount"))
    if t == "total loan balance" and segment and loan:
        lead = _group_leader(df, segment, loan, numeric_series, agg="sum")
        if lead:
            total = float(numeric_series(loan).sum(skipna=True))
            return SubtitleResult(
                contribution_subtitle(lead[0], lead[1], total, "loan balance"),
                segment,
                loan,
            )
    if t == "total spend amount" and segment and spend_amt:
        lead = _group_leader(df, segment, spend_amt, numeric_series, agg="sum")
        if lead:
            total = float(numeric_series(spend_amt).sum(skipna=True))
            return SubtitleResult(
                contribution_subtitle(lead[0], lead[1], total, "spend"),
                segment,
                spend_amt,
            )

    # --- Healthcare ---
    patient_vol = _pick_first_valid_dim(columns, ("patient_volume", "patient volume"))
    admissions = _pick_first_valid_dim(columns, ("admissions",))
    readmissions = _pick_first_valid_dim(columns, ("readmissions",))
    ward = _pick_first_valid_dim(columns, ("department", "ward", "specialty"))
    if t == "total patient volume" and ward and patient_vol:
        lead = _group_leader(df, ward, patient_vol, numeric_series, agg="sum")
        if lead:
            total = float(numeric_series(patient_vol).sum(skipna=True))
            return SubtitleResult(
                contribution_subtitle(lead[0], lead[1], total, "patient volume"),
                ward,
                patient_vol,
            )
    if t == "total admissions" and ward and admissions:
        lead = _group_leader(df, ward, admissions, numeric_series, agg="sum")
        if lead:
            total = float(numeric_series(admissions).sum(skipna=True))
            return SubtitleResult(
                contribution_subtitle(lead[0], lead[1], total, "admissions"),
                ward,
                admissions,
            )
    if t == "total readmissions" and ward and readmissions:
        lead = _group_leader(df, ward, readmissions, numeric_series, agg="sum")
        if lead:
            total = float(numeric_series(readmissions).sum(skipna=True))
            return SubtitleResult(
                contribution_subtitle(lead[0], lead[1], total, "readmissions"),
                ward,
                readmissions,
            )

    # --- Customer support ---
    tickets_open = _pick_first_valid_dim(columns, ("tickets_opened", "tickets opened"))
    tickets_res = _pick_first_valid_dim(columns, ("tickets_resolved", "tickets resolved"))
    issue_type = _pick_first_valid_dim(columns, ("issue_type", "issue type", "category"))
    if t == "total tickets opened" and issue_type and tickets_open:
        lead = _group_leader(df, issue_type, tickets_open, numeric_series, agg="sum")
        if lead:
            total = float(numeric_series(tickets_open).sum(skipna=True))
            return SubtitleResult(
                contribution_subtitle(lead[0], lead[1], total, "ticket volume"),
                issue_type,
                tickets_open,
            )
    if t == "total tickets resolved" and issue_type and tickets_res:
        lead = _group_leader(df, issue_type, tickets_res, numeric_series, agg="sum")
        if lead:
            total = float(numeric_series(tickets_res).sum(skipna=True))
            return SubtitleResult(
                contribution_subtitle(lead[0], lead[1], total, "resolved tickets"),
                issue_type,
                tickets_res,
            )

    return None


def attach_kpi_subtitles(
    cards: List[Dict[str, Any]],
    *,
    df: pd.DataFrame,
    columns: List[str],
    numeric_series: Callable[[str], pd.Series],
    pretty_label: Callable[[str], str],
    domain: str,
) -> List[Dict[str, Any]]:
    """Ensure every card has a KPI-specific subtitle; never leave generic chart fallbacks."""
    out: List[Dict[str, Any]] = []
    for card in cards:
        c = dict(card)
        title = str(c.get("title") or "").strip()
        if not title:
            continue
        existing = str(c.get("subtitle") or "").strip()
        meta = c.get("subtitle_meta") or {}
        if existing and not _subtitle_looks_generic(existing) and not subtitle_looks_weak(existing):
            if title.lower().startswith("top "):
                if meta.get("source_dimension") and not _subtitle_looks_legacy_top(existing):
                    out.append(c)
                    continue
            elif meta.get("source_dimension"):
                out.append(c)
                continue
        built = build_kpi_subtitle(
            title=title,
            df=df,
            columns=columns,
            numeric_series=numeric_series,
            pretty_label=pretty_label,
            domain=domain,
        )
        if built:
            c["subtitle"] = built.text
            c["subtitle_meta"] = {
                "source_dimension": built.source_dimension,
                "source_metric": built.source_metric,
            }
        elif meta.get("source_dimension"):
            c["subtitle_meta"] = meta
        out.append(c)
    return out


def _subtitle_looks_legacy_top(subtitle: str) -> bool:
    s = subtitle.lower()
    return " is the top " in s and " by " in s


def _subtitle_looks_generic(subtitle: str) -> bool:
    s = subtitle.lower()
    if re.search(r"\b20\d{2}\b", s):
        return True
    if "→" in subtitle or " across the window" in s:
        return True
    if "ahead on" in s or "category ahead" in s:
        return True
    if "missing values" in s or "blanks on" in s:
        return True
    if "time bucket" in s or "date range" in s:
        return True
    if re.search(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b", s):
        return True
    if subtitle_looks_weak(subtitle):
        return True
    return False


def audit_subtitle(
    subtitle: str,
    source_dimension: str,
    columns: List[str],
) -> List[str]:
    """Return validation issues for a subtitle."""
    issues: List[str] = []
    if not subtitle.strip():
        issues.append("empty subtitle")
        return issues
    if _subtitle_looks_generic(subtitle):
        issues.append("generic or date-based fallback wording")
    if _subtitle_looks_legacy_top(subtitle):
        issues.append("legacy top-card subtitle (not contribution-style)")
    if source_dimension and not is_valid_subtitle_dimension(source_dimension):
        issues.append(f"forbidden subtitle dimension: {source_dimension}")
    sl = subtitle.lower()
    if re.search(r"\b20\d{2}-\d{2}", sl):
        issues.append("date appears in subtitle")
    for col in columns:
        cl = str(col).lower()
        if "name" in cl and cl.replace("_", " ") in sl:
            issues.append(f"possible name column referenced: {col}")
    return issues
