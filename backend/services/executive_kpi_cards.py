"""Executive Auto Dashboard KPI cards — domain-aware selection, labels, and subtitles."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

import pandas as pd

from analytics_metadata import build_metric_label
from services.kpi_subtitles import attach_kpi_subtitles
from services.kpi_polish import (
    average_kpi_title,
    contribution_subtitle,
    is_valid_kpi_dimension_column,
    is_valid_kpi_leader_value,
    pick_valid_leader_from_groups,
    roas_validation_meta,
    top_kpi_title,
)
from services.kpi_title_validation import (
    align_kpi_card_title,
    currency_aggregate_title,
    enrich_kpi_card_meta,
    is_currency_metric_column,
    is_entity_dimension_column,
    resolve_currency_metric_column,
    validate_kpi_cards,
)

ExecutiveDomain = str

HR_FORBIDDEN_SALES_COLUMNS = frozenset(
    {
        "terminations",
        "attrition",
        "attrition_rate",
        "headcount",
        "hires",
        "escalations",
        "readmissions",
        "admissions",
        "tickets_opened",
        "tickets_resolved",
        "patient_volume",
        "personnel_cost",
        "performance_rating",
        "satisfaction_score",
        "defect_rate",
        "downtime_hours",
        "downtime_minutes",
        "units_produced",
        "avg_resolution_hours",
        "credit_utilization",
    }
)


@dataclass
class KpiBuildContext:
    df: pd.DataFrame
    columns: List[str]
    profile: Dict[str, Any]
    kp: Dict[str, Any]
    get_mapped_column: Callable[..., Optional[str]]
    numeric_series: Callable[[str], pd.Series]
    pretty_label: Callable[[str], str]
    region_usable: Callable[[str, Optional[Dict[str, Any]]], bool]
    find_order_id: Callable[[List[str]], Optional[str]]


def _col_blob(columns: List[str]) -> str:
    return " ".join(str(c).lower().replace("_", " ") for c in columns)


def _score(blob: str, patterns: Tuple[str, ...]) -> int:
    return sum(1 for p in patterns if p in blob)


def infer_executive_domain(columns: List[str]) -> ExecutiveDomain:
    """Schema-first executive domain for KPI card selection."""
    blob = _col_blob(columns)

    hr_score = _score(
        blob,
        (
            "employee",
            "employee id",
            "headcount",
            "attrition",
            "personnel cost",
            "job family",
            "hire date",
            "designation",
            "salary",
            "bonus",
            "workforce",
            "performance rating",
        ),
    )
    banking_score = _score(
        blob,
        (
            "loan balance",
            "deposit balance",
            "credit utilization",
            "delinquency",
            "npl",
            "customer segment",
            "interest income",
        ),
    )
    healthcare_score = _score(
        blob,
        (
            "patient_id",
            "patient segment",
            "visit date",
            "claim amount",
            "readmission rate",
            "visit count",
            "wait time",
            "payer type",
            "patient volume",
            "readmissions",
            "admissions",
            "length of stay",
            "ward",
            "new cases",
            "active cases",
            "total cases",
            "variant",
            "vaccination",
            "vaccine",
            "positivity",
            "hospital admissions",
            "icu patients",
            "covid",
            "tests conducted",
            "age group",
            "deaths",
            "report date",
        ),
    )
    saas_score = _score(
        blob,
        (
            "mrr",
            "churn rate",
            "plan type",
            "new signups",
            "expansion revenue",
            "active users",
            "customer segment",
        ),
    )
    support_score = _score(
        blob,
        ("ticket category", "tickets opened", "tickets resolved", "escalations", "avg resolution"),
    )
    ops_score = _score(
        blob,
        (
            "downtime",
            "defect rate",
            "units produced",
            "production line",
            "production loss",
            "incident",
            "severity",
            "root cause",
            "sla score",
            "facility",
            "plant",
        ),
    )
    fpa_score = _score(blob, ("cost center", "variance", "budget", "actual"))
    fpa_score += 2 if "budget" in blob and "actual" in blob else 0
    marketing_score = _score(
        blob, ("campaign", "impression", "ctr", "ad spend", "conversion rate")
    )
    retail_score = _score(blob, ("product category", "order value", "order date"))
    sales_score = _score(
        blob, ("revenue", "product line", "sales rep", "quota", "attainment", "profit")
    )
    geo_score = _score(blob, ("latitude", "longitude", "zone", "market type"))

    has_commercial_cube = "revenue" in blob and "product" in blob and "productivity" not in blob

    if hr_score >= 3 or (hr_score >= 2 and hr_score > sales_score and not has_commercial_cube):
        return "hr"

    # Revenue + product cubes (showcase, retail, sales) before secondary banking/geo columns.
    if has_commercial_cube:
        return "sales"

    if banking_score >= 2 and banking_score >= sales_score:
        return "banking"
    if saas_score >= 3 and saas_score >= sales_score:
        return "saas"
    if healthcare_score >= 2:
        return "healthcare"
    if support_score >= 2 and support_score >= sales_score:
        return "customer_support"
    if ops_score >= 2 and ops_score >= sales_score:
        return "operations"
    if fpa_score >= 3 and "revenue" in blob:
        return "finance_fpa"
    if marketing_score >= 2 and marketing_score >= retail_score:
        return "marketing"
    if retail_score >= 2 and "revenue" in blob:
        return "retail"
    if geo_score >= 2 and "revenue" in blob and "product line" not in blob:
        return "geography"
    if has_commercial_cube or sales_score >= 2:
        return "sales"
    if "sales" in blob or "order value" in blob:
        return "sales"
    if "order value" in blob or "order date" in blob:
        return "retail"
    return "generic"


def executive_domain_to_auto_kind(domain: ExecutiveDomain) -> str:
    return {
        "hr": "hr",
        "banking": "finance",
        "healthcare": "operations",
        "customer_support": "operations",
        "operations": "operations",
        "marketing": "marketing",
        "finance_fpa": "finance",
        "geography": "sales",
        "retail": "sales",
        "sales": "sales",
        "ecommerce": "sales",
        "saas": "finance",
        "generic": "generic",
    }.get(domain, "generic")


def executive_domain_to_kpi_domain(domain: ExecutiveDomain) -> str:
    if domain == "hr":
        return "hr"
    if domain == "operations":
        return "operations"
    if domain in ("retail", "ecommerce"):
        return "ecommerce"
    if domain == "banking":
        return "banking"
    if domain == "finance_fpa":
        return "finance"
    if domain == "marketing":
        return "marketing"
    if domain == "saas":
        return "finance"
    if domain in ("sales", "geography", "healthcare", "customer_support"):
        return "sales"
    return "generic"


def _find_col(columns: List[str], keywords: Tuple[str, ...]) -> Optional[str]:
    normalized = {str(c): str(c).lower().replace("_", " ") for c in columns}
    for kw in keywords:
        kw_lc = kw.lower().replace("_", " ")
        for col, col_lc in normalized.items():
            if col_lc == kw_lc:
                return col
    for kw in keywords:
        kw_lc = kw.lower().replace("_", " ")
        for col, col_lc in normalized.items():
            if kw_lc in col_lc:
                return col
    return None


def _append_card(
    cards: List[Dict[str, Any]],
    title: str,
    value: Any,
    subtitle: Optional[str] = None,
    *,
    subtitle_meta: Optional[Dict[str, str]] = None,
    kpi_meta: Optional[Dict[str, Any]] = None,
) -> None:
    if value is None:
        return
    v = str(value).strip()
    if not v or v.upper() == "N/A" or v == "—":
        return
    payload: Dict[str, Any] = {"title": title, "value": v, "subtitle": subtitle}
    if subtitle_meta:
        payload["subtitle_meta"] = subtitle_meta
    if kpi_meta:
        payload["kpi_meta"] = kpi_meta
    cards.append(payload)


def _dim_label(col: Optional[str], pretty_label: Callable[[str], str]) -> str:
    if not col:
        return "Category"
    phrase = pretty_label(str(col).strip())
    phrase = re.sub(r"\s+(names?|ids?|codes?)$", "", phrase, flags=re.I).strip()
    if not phrase:
        return "Category"
    return " ".join(w[:1].upper() + w[1:].lower() for w in phrase.split())


def _top_contribution_subtitle(
    ctx: KpiBuildContext,
    dim_col: str,
    metric_col: str,
    *,
    agg: str = "sum",
    metric_phrase: Optional[str] = None,
    leader_override: Optional[str] = None,
) -> Optional[Tuple[str, Dict[str, str]]]:
    if dim_col not in ctx.df.columns or metric_col not in ctx.df.columns:
        return None
    try:
        sub = ctx.df[[dim_col, metric_col]].copy()
        sub["_v"] = ctx.numeric_series(metric_col)
        sub = sub.dropna(subset=[dim_col, "_v"])
        if sub.empty:
            return None
        g = sub.groupby(dim_col)["_v"].sum() if agg == "sum" else sub.groupby(dim_col)["_v"].mean()
        g = g.sort_values(ascending=False)
        if g.empty:
            return None
        picked = pick_valid_leader_from_groups(g)
        if leader_override and is_valid_kpi_leader_value(leader_override):
            leader = str(leader_override).strip()[:52]
            part = None
            for idx, val in g.items():
                if str(idx).strip()[:52] == leader:
                    part = float(val)
                    break
            if part is None and picked:
                leader, part = picked
            elif part is None:
                return None
        elif picked:
            leader, part = picked
        else:
            return None
        met = metric_phrase or ctx.pretty_label(metric_col).lower()
        total = float(ctx.numeric_series(metric_col).sum(skipna=True))
        text = contribution_subtitle(leader, part, total, met, agg=agg)
        return text, {"source_dimension": dim_col, "source_metric": metric_col}
    except Exception:
        return None


def _top_group_card(
    ctx: KpiBuildContext,
    cards: List[Dict[str, Any]],
    dim_col: Optional[str],
    metric_col: Optional[str],
    *,
    agg: str = "sum",
    title: Optional[str] = None,
    metric_phrase: Optional[str] = None,
) -> None:
    if not dim_col or not metric_col or dim_col not in ctx.df.columns or metric_col not in ctx.df.columns:
        return
    if not is_valid_kpi_dimension_column(dim_col, ctx.df):
        return
    try:
        sub = ctx.df[[dim_col, metric_col]].copy()
        sub["_v"] = ctx.numeric_series(metric_col)
        sub = sub.dropna(subset=[dim_col, "_v"])
        if sub.empty:
            return
        g = sub.groupby(dim_col)["_v"].sum() if agg == "sum" else sub.groupby(dim_col)["_v"].mean()
        g = g.sort_values(ascending=False)
        if g.empty:
            return
        picked = pick_valid_leader_from_groups(g)
        if not picked:
            return
        leader, _part = picked
        dim_title = top_kpi_title(
            dim_col,
            metric_col,
            dim_label=_dim_label(dim_col, ctx.pretty_label),
            agg=agg,
            metric_phrase=metric_phrase,
            pretty_label=ctx.pretty_label,
            explicit_title=title,
        )
        met = metric_phrase or ctx.pretty_label(metric_col).lower()
        built = _top_contribution_subtitle(
            ctx, dim_col, metric_col, agg=agg, metric_phrase=met, leader_override=leader
        )
        sub_line, meta = built if built else (None, None)
        _append_card(cards, dim_title, leader, sub_line, subtitle_meta=meta)
    except Exception:
        return


def _build_hr_kpi_cards(ctx: KpiBuildContext) -> List[Dict[str, Any]]:
    cards: List[Dict[str, Any]] = []
    cols = ctx.columns
    df = ctx.df

    emp_id = _find_col(cols, ("employee_id", "employee id", "emp_id", "staff_id"))
    headcount_col = _find_col(cols, ("headcount",))
    if emp_id:
        total = int(df[emp_id].nunique(dropna=True))
        _append_card(cards, "Total Employees", f"{total:,}")
    elif headcount_col:
        hc = ctx.numeric_series(headcount_col)
        if hc.notna().any():
            _append_card(cards, "Total Headcount", f"{int(hc.sum(skipna=True)):,}")
    else:
        _append_card(cards, "Total Employees", f"{int(len(df)):,}")

    salary_col = _find_col(cols, ("salary", "compensation", "ctc", "pay", "wage", "personnel cost"))
    if salary_col:
        sv = ctx.numeric_series(salary_col)
        if sv.notna().any():
            title = (
                "Average Personnel Cost"
                if "personnel" in str(salary_col).lower().replace("_", " ")
                else "Average Salary"
            )
            _append_card(
                cards,
                title,
                f"{float(sv.mean(skipna=True)):,.0f}",
            )

    bonus_col = _find_col(cols, ("bonus",))
    if bonus_col:
        bv = ctx.numeric_series(bonus_col)
        if bv.notna().any():
            _append_card(cards, "Average Bonus", f"{float(bv.mean(skipna=True)):,.0f}")

    attrition_col = _find_col(cols, ("attrition_rate", "attrition rate"))
    if attrition_col:
        av = ctx.numeric_series(attrition_col)
        if av.notna().any():
            mean_a = float(av.mean(skipna=True))
            pct = mean_a * 100.0 if mean_a <= 1.0 else mean_a
            _append_card(cards, "Average Attrition Rate", f"{pct:.1f}%")

    dept_col = _find_col(cols, ("department", "dept", "team", "division"))
    if dept_col:
        _append_card(cards, "Department Count", f"{int(df[dept_col].nunique(dropna=True)):,}")
        if emp_id:
            try:
                vc = df.groupby(dept_col)[emp_id].nunique().sort_values(ascending=False)
                if not vc.empty:
                    leader = str(vc.index[0])[:52]
                    _append_card(
                        cards,
                        "Top Department",
                        leader,
                        f"{leader} is the largest department by employee count.",
                    )
            except Exception:
                pass
        elif headcount_col:
            _top_group_card(
                ctx,
                cards,
                dept_col,
                headcount_col,
                metric_phrase="headcount",
                title="Top Department",
            )
        elif salary_col or bonus_col:
            metric_for_top = salary_col or bonus_col
            _top_group_card(
                ctx,
                cards,
                dept_col,
                metric_for_top,
                metric_phrase=ctx.pretty_label(metric_for_top).lower(),
                title="Top Department",
            )
        else:
            vc = df[dept_col].astype(str).value_counts()
            if not vc.empty:
                leader = str(vc.index[0])[:52]
                _append_card(
                    cards,
                    "Top Department",
                    leader,
                    f"{leader} is the largest department by employee count.",
                )

    return cards[:6]


def _build_banking_kpi_cards(ctx: KpiBuildContext) -> List[Dict[str, Any]]:
    cards: List[Dict[str, Any]] = []
    cols = ctx.columns

    loan_col = _find_col(cols, ("loan_balance", "loan balance"))
    spend_col = _find_col(cols, ("spend_amount", "spend amount"))
    util_col = _find_col(cols, ("credit_utilization", "credit utilization"))
    segment_col = _find_col(cols, ("customer_segment", "customer segment"))
    region_col = ctx.get_mapped_column("region", ["region", "state", "city", "branch"])

    if loan_col:
        lv = ctx.numeric_series(loan_col)
        if lv.notna().any():
            _append_card(cards, "Total Loan Balance", f"{float(lv.sum(skipna=True)):,.0f}")

    if spend_col:
        sv = ctx.numeric_series(spend_col)
        if sv.notna().any():
            _append_card(cards, "Total Spend Amount", f"{float(sv.sum(skipna=True)):,.0f}")
            _append_card(cards, "Average Spend Amount", f"{float(sv.mean(skipna=True)):,.0f}")

    if util_col:
        uv = ctx.numeric_series(util_col)
        if uv.notna().any():
            mean_u = float(uv.mean(skipna=True))
            if mean_u <= 1.05:
                mean_u *= 100.0
            _append_card(cards, "Average Credit Utilization", f"{mean_u:.1f}%")

    delinq_col = _find_col(cols, ("delinquency_rate", "delinquency rate"))
    if delinq_col:
        dv = ctx.numeric_series(delinq_col)
        if dv.notna().any():
            mean_d = float(dv.mean(skipna=True))
            if mean_d <= 1.0:
                mean_d *= 100.0
            _append_card(cards, "Average Delinquency Rate", f"{mean_d:.2f}%")

    if segment_col and loan_col:
        _top_group_card(
            ctx,
            cards,
            segment_col,
            loan_col,
            metric_phrase="loan balance",
            title="Top Customer Segment",
        )
    elif segment_col and spend_col:
        _top_group_card(
            ctx,
            cards,
            segment_col,
            spend_col,
            metric_phrase="spend amount",
            title="Top Customer Segment",
        )

    if region_col and spend_col and ctx.region_usable(region_col, ctx.profile):
        _top_group_card(
            ctx,
            cards,
            region_col,
            spend_col,
            metric_phrase="spend amount",
            title="Top Region",
        )

    return cards[:6]


def _build_healthcare_kpi_cards(ctx: KpiBuildContext) -> List[Dict[str, Any]]:
    cards: List[Dict[str, Any]] = []
    cols = ctx.columns

    patient_col = _find_col(cols, ("patient_volume", "patient volume"))
    admit_col = _find_col(cols, ("admissions",))
    readmit_col = _find_col(cols, ("readmissions",))
    los_col = _find_col(cols, ("length_of_stay", "length of stay"))
    sat_col = _find_col(cols, ("satisfaction_score", "satisfaction score"))
    dept_col = _find_col(cols, ("department", "ward", "specialty"))

    for col, titles in (
        (patient_col, ("Total Patient Volume", None)),
        (admit_col, ("Total Admissions", None)),
        (readmit_col, ("Total Readmissions", None)),
    ):
        if col:
            sv = ctx.numeric_series(col)
            if sv.notna().any():
                _append_card(cards, titles[0], f"{float(sv.sum(skipna=True)):,.0f}")

    if readmit_col and admit_col:
        rv = ctx.numeric_series(readmit_col)
        av = ctx.numeric_series(admit_col)
        if rv.notna().any() and av.notna().any() and float(av.sum()) > 0:
            rate = 100.0 * float(rv.sum()) / float(av.sum())
            _append_card(cards, "Readmission Rate", f"{rate:.1f}%")

    if los_col:
        lv = ctx.numeric_series(los_col)
        if lv.notna().any():
            _append_card(cards, "Average Length of Stay", f"{float(lv.mean(skipna=True)):.1f} days")

    if sat_col:
        sv = ctx.numeric_series(sat_col)
        if sv.notna().any():
            _append_card(cards, "Average Satisfaction Score", f"{float(sv.mean(skipna=True)):.2f}")

    if dept_col and patient_col:
        _top_group_card(
            ctx,
            cards,
            dept_col,
            patient_col,
            metric_phrase="patient volume",
            title="Top Department",
        )

    return cards[:6]


def _build_customer_support_kpi_cards(ctx: KpiBuildContext) -> List[Dict[str, Any]]:
    cards: List[Dict[str, Any]] = []
    cols = ctx.columns

    opened_col = _find_col(cols, ("tickets_opened", "tickets opened", "cases_opened"))
    resolved_col = _find_col(cols, ("tickets_resolved", "tickets resolved", "cases_resolved"))
    resolution_col = _find_col(cols, ("avg_resolution_hours", "avg resolution", "resolution time"))
    sat_col = _find_col(cols, ("satisfaction_score", "csat", "satisfaction"))
    esc_col = _find_col(cols, ("escalations",))
    issue_col = _find_col(cols, ("ticket_category", "ticket category", "issue type", "category"))

    if opened_col:
        ov = ctx.numeric_series(opened_col)
        if ov.notna().any():
            _append_card(cards, "Total Tickets Opened", f"{int(ov.sum(skipna=True)):,}")

    if resolved_col:
        rv = ctx.numeric_series(resolved_col)
        if rv.notna().any():
            _append_card(cards, "Total Tickets Resolved", f"{int(rv.sum(skipna=True)):,}")

    if resolution_col:
        hv = ctx.numeric_series(resolution_col)
        if hv.notna().any():
            _append_card(cards, "Average Resolution Time", f"{float(hv.mean(skipna=True)):.1f} hrs")

    if sat_col:
        sv = ctx.numeric_series(sat_col)
        if sv.notna().any():
            _append_card(cards, "Average Satisfaction Score", f"{float(sv.mean(skipna=True)):.2f}")

    if esc_col and opened_col:
        ev = ctx.numeric_series(esc_col)
        ov = ctx.numeric_series(opened_col)
        if ev.notna().any() and ov.notna().any() and float(ov.sum()) > 0:
            rate = 100.0 * float(ev.sum()) / float(ov.sum())
            _append_card(cards, "Escalation Rate", f"{rate:.1f}%")

    if issue_col and opened_col:
        _top_group_card(
            ctx,
            cards,
            issue_col,
            opened_col,
            metric_phrase="ticket volume",
            title="Top Issue Type",
        )

    return cards[:6]


def _build_operations_kpi_cards(ctx: KpiBuildContext) -> List[Dict[str, Any]]:
    cards: List[Dict[str, Any]] = []
    cols = ctx.columns

    units_col = _find_col(cols, ("units_produced", "units produced", "production volume"))
    downtime_col = _find_col(cols, ("downtime_hours", "downtime hours", "downtime_minutes", "downtime minutes"))
    defect_col = _find_col(cols, ("defect_rate", "defect rate"))
    loss_col = _find_col(cols, ("production_loss", "production loss"))
    facility_col = _find_col(cols, ("facility", "plant", "site"))
    line_col = _find_col(cols, ("production_line", "production line", "line"))
    incident_col = _find_col(cols, ("incident",))

    if incident_col or _find_col(cols, ("severity",)):
        count = len(ctx.df)
        _append_card(cards, "Total Incidents", f"{count:,}")

    if units_col:
        uv = ctx.numeric_series(units_col)
        if uv.notna().any():
            _append_card(cards, "Total Units Produced", f"{int(uv.sum(skipna=True)):,}")

    if downtime_col:
        dv = ctx.numeric_series(downtime_col)
        if dv.notna().any():
            title = (
                "Total Downtime Minutes"
                if "minute" in downtime_col.lower()
                else "Total Downtime Hours"
            )
            _append_card(cards, title, f"{float(dv.sum(skipna=True)):,.0f}")

    if loss_col:
        lv = ctx.numeric_series(loss_col)
        if lv.notna().any():
            _append_card(cards, "Total Production Loss Units", f"{float(lv.sum(skipna=True)):,.0f}")

    if defect_col:
        dfv = ctx.numeric_series(defect_col)
        if dfv.notna().any():
            mean_d = float(dfv.mean(skipna=True))
            if mean_d <= 1.05:
                mean_d *= 100.0
            _append_card(cards, "Average Defect Rate", f"{mean_d:.2f}%")

    metric_for_top = downtime_col or units_col or loss_col
    if facility_col and metric_for_top:
        _top_group_card(
            ctx,
            cards,
            facility_col,
            metric_for_top,
            metric_phrase=ctx.pretty_label(metric_for_top).lower(),
            title="Top Plant",
        )
    if line_col and metric_for_top:
        _top_group_card(
            ctx,
            cards,
            line_col,
            metric_for_top,
            metric_phrase=ctx.pretty_label(metric_for_top).lower(),
            title="Top Production Line",
        )

    return cards[:6]


def _build_marketing_kpi_cards(ctx: KpiBuildContext) -> List[Dict[str, Any]]:
    cards: List[Dict[str, Any]] = []
    cols = ctx.columns

    spend_col = _find_col(cols, ("ad_spend", "ad spend", "spend", "cost"))
    revenue_col = _find_col(cols, ("revenue",))
    conv_col = _find_col(cols, ("conversions", "conversion"))
    ctr_col = _find_col(cols, ("ctr",))
    conv_rate_col = _find_col(cols, ("conversion_rate", "conversion rate"))
    campaign_col = _find_col(cols, ("campaign", "campaign name", "channel"))

    if spend_col:
        sv = ctx.numeric_series(spend_col)
        if sv.notna().any():
            _append_card(cards, "Total Spend", f"{float(sv.sum(skipna=True)):,.0f}")

    if revenue_col:
        rv = ctx.numeric_series(revenue_col)
        if rv.notna().any():
            _append_card(cards, "Total Revenue", f"{float(rv.sum(skipna=True)):,.0f}")
            if spend_col:
                sp = ctx.numeric_series(spend_col)
                if sp.notna().any() and float(sp.sum()) > 0:
                    roas = float(rv.sum()) / float(sp.sum())
                    roas_sub, roas_meta = roas_validation_meta(roas)
                    _append_card(
                        cards,
                        "ROAS",
                        f"{roas:.2f}x",
                        roas_sub,
                        kpi_meta=roas_meta,
                    )

    if conv_col:
        cv = ctx.numeric_series(conv_col)
        if cv.notna().any():
            _append_card(cards, "Total Conversions", f"{int(cv.sum(skipna=True)):,}")

    if ctr_col:
        tv = ctx.numeric_series(ctr_col)
        if tv.notna().any():
            avg = float(tv.mean(skipna=True))
            _append_card(cards, "Average CTR", f"{avg:.2%}" if avg <= 1 else f"{avg:.2f}%")

    if conv_rate_col:
        cr = ctx.numeric_series(conv_rate_col)
        if cr.notna().any():
            avg = float(cr.mean(skipna=True))
            if avg <= 1.05:
                avg *= 100.0
            _append_card(cards, "Average Conversion Rate", f"{avg:.2f}%")

    metric_for_top = revenue_col or spend_col or conv_col
    if campaign_col and metric_for_top:
        _top_group_card(
            ctx,
            cards,
            campaign_col,
            metric_for_top,
            metric_phrase=ctx.pretty_label(metric_for_top).lower(),
            title="Top Campaign",
        )

    return cards[:6]


def _build_finance_fpa_kpi_cards(ctx: KpiBuildContext) -> List[Dict[str, Any]]:
    cards: List[Dict[str, Any]] = []
    cols = ctx.columns

    revenue_col = _find_col(cols, ("revenue",))
    cost_col = _find_col(cols, ("cost", "expense"))
    budget_col = _find_col(cols, ("budget",))
    actual_col = _find_col(cols, ("actual",))
    variance_col = _find_col(cols, ("variance",))
    category_col = _find_col(cols, ("category", "line item"))

    if revenue_col:
        rv = ctx.numeric_series(revenue_col)
        if rv.notna().any():
            _append_card(
                cards,
                "Total Revenue",
                f"{float(rv.sum(skipna=True)):,.0f}",
                kpi_meta={"metric_source": revenue_col, "aggregation": "sum", "metric_type": "currency"},
            )

    if cost_col:
        cv = ctx.numeric_series(cost_col)
        if cv.notna().any():
            _append_card(
                cards,
                "Total Cost",
                f"{float(cv.sum(skipna=True)):,.0f}",
                kpi_meta={"metric_source": cost_col, "aggregation": "sum", "metric_type": "currency"},
            )

    if revenue_col and cost_col:
        rv = ctx.numeric_series(revenue_col)
        cv = ctx.numeric_series(cost_col)
        if rv.notna().any() and cv.notna().any():
            net = float(rv.sum()) - float(cv.sum())
            _append_card(
                cards,
                "Net Profit",
                f"{net:,.0f}",
                kpi_meta={"metric_source": revenue_col, "aggregation": "sum", "metric_type": "currency"},
            )
            if float(rv.sum()) > 0:
                margin = 100.0 * net / float(rv.sum())
                _append_card(
                    cards,
                    "Margin",
                    f"{margin:.1f}%",
                    kpi_meta={"metric_source": revenue_col, "aggregation": "mean", "metric_type": "rate"},
                )

    if variance_col:
        vv = ctx.numeric_series(variance_col)
        if vv.notna().any():
            _append_card(
                cards,
                "Total Budget Variance",
                f"{float(vv.sum(skipna=True)):,.0f}",
                kpi_meta={"metric_source": variance_col, "aggregation": "sum", "metric_type": "currency"},
            )
    elif budget_col and actual_col:
        bv = ctx.numeric_series(budget_col)
        av = ctx.numeric_series(actual_col)
        if bv.notna().any() and av.notna().any():
            _append_card(
                cards,
                "Total Budget Variance",
                f"{float(av.sum() - bv.sum()):,.0f}",
                kpi_meta={"metric_source": variance_col or budget_col, "aggregation": "sum", "metric_type": "currency"},
            )

    if category_col and cost_col:
        _top_group_card(
            ctx,
            cards,
            category_col,
            cost_col,
            metric_phrase="cost",
            title="Top Category",
        )

    return cards[:6]


def _revenue_metric_title(sales_col: Optional[str]) -> str:
    return currency_aggregate_title(sales_col, "sum")


def _average_revenue_title(sales_col: Optional[str], domain: ExecutiveDomain = "sales") -> str:
    dom = "retail" if domain in ("retail", "ecommerce") else "sales"
    if domain == "geography":
        dom = "geography"
    return average_kpi_title(sales_col, domain=dom, agg="mean")


def _prefer_schema_column(
    mapped: Optional[str],
    columns: List[str],
    keywords: Tuple[str, ...],
) -> Optional[str]:
    for kw in keywords:
        for c in columns:
            if kw in str(c).lower().replace("_", " "):
                return str(c)
    return mapped


def _is_profit_like_column(col: Optional[str]) -> bool:
    if not col:
        return False
    cl = str(col).lower().replace("_", " ")
    return "profit" in cl or "margin" in cl or "ebitda" in cl


def _build_sales_retail_kpi_cards(
    ctx: KpiBuildContext, *, retail: bool = False, domain: ExecutiveDomain = "sales"
) -> List[Dict[str, Any]]:
    cards: List[Dict[str, Any]] = []
    mapped_sales = ctx.get_mapped_column(
        "sales", ["sales", "revenue", "amount", "order_value", "order value", "total", "value"]
    )
    sales_col = resolve_currency_metric_column(ctx.columns, mapped_sales)
    if not sales_col:
        sales_col = _prefer_schema_column(
            mapped_sales,
            ctx.columns,
            ("revenue", "sales", "order value", "order_value"),
        )
    if sales_col and is_entity_dimension_column(sales_col):
        sales_col = resolve_currency_metric_column(ctx.columns, None)

    profit_col = _prefer_schema_column(
        ctx.get_mapped_column("profit", ["profit", "margin", "net profit", "earnings", "gp"]),
        ctx.columns,
        ("profit", "margin", "net profit"),
    )
    if profit_col and not _is_profit_like_column(profit_col):
        profit_col = _find_col(ctx.columns, ("profit", "margin", "net profit"))
    product_col = ctx.get_mapped_column(
        "product",
        ["product", "product_category", "product category", "item", "sku", "product_line", "product line", "category"],
    )
    region_col = ctx.get_mapped_column("region", ["region", "state", "city", "location", "country", "territory", "zone"])
    order_col = ctx.find_order_id(ctx.columns)

    rev_label = _revenue_metric_title(sales_col)
    avg_label = _average_revenue_title(sales_col, domain if domain in ("geography", "retail", "ecommerce") else ("retail" if retail else "sales"))
    rev_meta = {"metric_source": sales_col, "aggregation": "sum", "metric_type": "currency"} if sales_col else None

    # 1 — Total Sales / Revenue
    if ctx.kp.get("total_sales") is not None and sales_col:
        _append_card(
            cards,
            rev_label,
            f'{float(ctx.kp["total_sales"]):,.0f}',
            kpi_meta=rev_meta,
        )
    elif sales_col and sales_col in ctx.df.columns:
        sv = ctx.numeric_series(sales_col)
        if sv.notna().any():
            _append_card(
                cards,
                rev_label,
                f"{float(sv.sum(skipna=True)):,.0f}",
                kpi_meta=rev_meta,
            )

    # 2 — Total Profit
    if profit_col and _is_profit_like_column(profit_col) and profit_col in ctx.df.columns:
        pv = ctx.numeric_series(profit_col)
        if pv.notna().any():
            _append_card(
                cards,
                "Total Profit",
                f"{float(pv.sum(skipna=True)):,.0f}",
                kpi_meta={"metric_source": profit_col, "aggregation": "sum", "metric_type": "currency"},
            )
    elif sales_col and sales_col in ctx.df.columns:
        cost_col = _find_col(ctx.columns, ("cost", "cogs"))
        if cost_col:
            rv = ctx.numeric_series(sales_col)
            cv = ctx.numeric_series(cost_col)
            if rv.notna().any() and cv.notna().any():
                net = float(rv.sum(skipna=True)) - float(cv.sum(skipna=True))
                _append_card(
                    cards,
                    "Total Profit",
                    f"{net:,.0f}",
                    kpi_meta={
                        "metric_source": sales_col,
                        "aggregation": "sum",
                        "metric_type": "currency",
                    },
                )

    # 3 — Average Order Value (or average revenue / order metric)
    if order_col and sales_col and ctx.kp.get("total_sales") is not None:
        try:
            sub = ctx.df[[order_col]].dropna()
            uniq = int(sub[order_col].nunique(dropna=True))
            if uniq > 1:
                aov = float(ctx.kp["total_sales"]) / float(uniq)
                _append_card(
                    cards,
                    "Average Order Value",
                    f"{aov:,.0f}",
                    f"{uniq:,} orders",
                    kpi_meta={"metric_source": sales_col, "aggregation": "mean", "metric_type": "currency"},
                )
        except Exception:
            pass
    elif sales_col and sales_col in ctx.df.columns:
        sv = ctx.numeric_series(sales_col)
        if sv.notna().any():
            _append_card(
                cards,
                avg_label,
                f"{float(sv.mean(skipna=True)):,.0f}",
                kpi_meta={"metric_source": sales_col, "aggregation": "mean", "metric_type": "currency"},
            )

    # 4 — Top Product / Category
    if ctx.kp.get("top_product") and product_col and sales_col:
        tp = ctx.kp["top_product"]
        met_phrase = (
            "revenue"
            if sales_col and "revenue" in str(sales_col).lower()
            else ctx.pretty_label(sales_col).lower()
        )
        leader = str(tp.get("name", "—"))[:60]
        built = _top_contribution_subtitle(
            ctx,
            product_col,
            sales_col,
            metric_phrase=met_phrase,
            leader_override=leader,
        )
        sub, meta = built if built else (None, None)
        product_title = top_kpi_title(
            product_col,
            sales_col,
            dim_label=_dim_label(product_col, ctx.pretty_label),
            metric_phrase=met_phrase,
            pretty_label=ctx.pretty_label,
        )
        _append_card(
            cards,
            product_title,
            leader,
            sub,
            subtitle_meta=meta,
            kpi_meta={"metric_source": sales_col, "aggregation": "max", "metric_type": "dimension_leader"},
        )
    elif product_col and sales_col:
        _top_group_card(
            ctx,
            cards,
            product_col,
            sales_col,
            metric_phrase="revenue" if "revenue" in str(sales_col).lower() else ctx.pretty_label(sales_col).lower(),
            title=f"Top {_dim_label(product_col, ctx.pretty_label)}",
        )

    # 5 — Top Region
    if region_col and sales_col and ctx.region_usable(region_col, ctx.profile):
        _top_group_card(
            ctx,
            cards,
            region_col,
            sales_col,
            metric_phrase="revenue" if "revenue" in str(sales_col).lower() else ctx.pretty_label(sales_col).lower(),
            title=f"Top {_dim_label(region_col, ctx.pretty_label)}",
        )

    return cards[:6]


def _build_generic_kpi_cards(ctx: KpiBuildContext) -> List[Dict[str, Any]]:
    cards: List[Dict[str, Any]] = []
    _append_card(cards, "Records in view", f"{int(len(ctx.df)):,}")
    money = _find_col(ctx.columns, ("revenue", "sales", "amount", "value", "cost"))
    if money:
        sv = ctx.numeric_series(money)
        if sv.notna().any():
            _append_card(
                cards,
                build_metric_label("sum", "total", money),
                f"{float(sv.sum(skipna=True)):,.0f}",
            )
    return cards[:6]


def _build_saas_kpi_cards(ctx: KpiBuildContext) -> List[Dict[str, Any]]:
    cards: List[Dict[str, Any]] = []
    cols = ctx.columns

    mrr_col = _find_col(cols, ("mrr",))
    churn_col = _find_col(cols, ("churn_rate", "churn rate"))
    users_col = _find_col(cols, ("active_users", "active users"))
    signup_col = _find_col(cols, ("new_signups", "new signups"))
    plan_col = _find_col(cols, ("plan_type", "plan type"))

    if mrr_col:
        sv = ctx.numeric_series(mrr_col)
        if sv.notna().any():
            _append_card(cards, "Total MRR", f"{float(sv.sum(skipna=True)):,.0f}")

    if churn_col:
        cv = ctx.numeric_series(churn_col)
        if cv.notna().any():
            _append_card(cards, "Average Churn Rate", f"{float(cv.mean(skipna=True)) * 100:.2f}%")

    if users_col:
        uv = ctx.numeric_series(users_col)
        if uv.notna().any():
            _append_card(cards, "Total Active Users", f"{float(uv.sum(skipna=True)):,.0f}")

    if signup_col:
        nv = ctx.numeric_series(signup_col)
        if nv.notna().any():
            _append_card(cards, "Total New Signups", f"{float(nv.sum(skipna=True)):,.0f}")

    if plan_col and mrr_col:
        _top_group_card(
            ctx,
            cards,
            plan_col,
            mrr_col,
            metric_phrase="mrr",
            title="Top Plan Type",
        )

    return cards[:6]


def build_executive_kpi_cards(domain: ExecutiveDomain, ctx: KpiBuildContext) -> List[Dict[str, Any]]:
    builders = {
        "hr": _build_hr_kpi_cards,
        "banking": _build_banking_kpi_cards,
        "healthcare": _build_healthcare_kpi_cards,
        "customer_support": _build_customer_support_kpi_cards,
        "operations": _build_operations_kpi_cards,
        "marketing": _build_marketing_kpi_cards,
        "finance_fpa": _build_finance_fpa_kpi_cards,
        "geography": lambda c: _build_sales_retail_kpi_cards(c, retail=False, domain="geography"),
        "retail": lambda c: _build_sales_retail_kpi_cards(c, retail=True, domain="retail"),
        "sales": lambda c: _build_sales_retail_kpi_cards(c, retail=False, domain="sales"),
        "ecommerce": lambda c: _build_sales_retail_kpi_cards(c, retail=True, domain="ecommerce"),
        "saas": _build_saas_kpi_cards,
        "generic": _build_generic_kpi_cards,
    }
    builder = builders.get(domain, _build_generic_kpi_cards)
    cards = builder(ctx)
    cards = attach_kpi_subtitles(
        cards,
        df=ctx.df,
        columns=ctx.columns,
        numeric_series=ctx.numeric_series,
        pretty_label=ctx.pretty_label,
        domain=domain,
    )
    cards = [enrich_kpi_card_meta(c) for c in cards]
    _, audits = validate_kpi_cards(cards)
    bad = [a for a in audits if a.issues]
    if bad:
        fixed: List[Dict[str, Any]] = []
        for card, audit in zip(cards, audits):
            if any("entity title" in i or "currency title" in i for i in audit.issues):
                meta = card.get("kpi_meta") or {}
                mc = meta.get("metric_source")
                agg = str(meta.get("aggregation") or "sum")
                if mc and is_currency_metric_column(str(mc)):
                    card = align_kpi_card_title(card, metric_col=str(mc), aggregation=agg)
            fixed.append(enrich_kpi_card_meta(card))
        cards = fixed
    return cards


def sales_column_allowed_for_domain(col: str, domain: ExecutiveDomain) -> bool:
    """Block HR/ops metrics from being treated as primary revenue when domain is not sales."""
    if domain in ("sales", "retail", "ecommerce", "geography", "banking", "marketing", "finance_fpa"):
        return True
    norm = str(col).lower().replace("_", " ").replace(" ", "_")
    return norm not in HR_FORBIDDEN_SALES_COLUMNS and not any(
        f in norm for f in HR_FORBIDDEN_SALES_COLUMNS
    )
