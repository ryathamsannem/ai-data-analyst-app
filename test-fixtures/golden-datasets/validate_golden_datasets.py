#!/usr/bin/env python3
"""Validate golden regression datasets against backend analytics pipeline."""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2] / "backend"
REPO_ROOT = BACKEND_ROOT.parent
GOLD_DIR = REPO_ROOT / "test-fixtures" / "golden-datasets"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main as main_mod  # noqa: E402
from services.auto_dashboard_opportunities import (  # noqa: E402
    DashboardDeps,
    _bind_deps_to_dataframe,
    classify_columns,
    discover_chart_opportunities,
)

GOLDEN_FILES = [
    "retail_gold_10000.csv",
    "hr_gold_5000.csv",
    "banking_gold_10000.csv",
]

HISTOGRAM_QUESTIONS: dict[str, str] = {
    "retail_gold_10000.csv": "Show distribution of delivery days",
    "hr_gold_5000.csv": "Show salary distribution",
    "banking_gold_10000.csv": "Show utilization rate distribution",
}

EXAMPLE_QUESTIONS: dict[str, list[str]] = {
    "retail_gold_10000.csv": [
        "What is total revenue by region?",
        "Which product category has the highest profit margin?",
        "Show revenue trend over time",
        "Compare sales across customer segments",
        "Which marketing channel drives the most sales?",
        "What is the average delivery time by region?",
        "Show profit vs sales amount correlation",
        "Which categories are loss-making?",
        "What is the discount impact on profit?",
        "Show seasonal revenue patterns",
        "Top 10 cities by revenue",
        "How does customer rating vary by product category?",
        "Compare Q4 vs Q1 sales performance",
        "Which campaign generated the most revenue?",
        "Show distribution of delivery days",
        "What share of revenue comes from Electronics?",
        "Compare Enterprise vs Consumer segment profitability",
        "Which sub-category has the highest average order value?",
        "Show shipping cost trends by month",
        "Identify outliers in sales amount",
        "What is average profit by marketing channel?",
        "Compare shipping cost across regions",
        "Which age group spends the most?",
        "Show quantity distribution by product category",
        "What is profit margin by sub-category?",
        "How many orders per campaign?",
        "Compare Paid Search vs Email channel ROI",
        "Which state has fastest delivery?",
        "Show customer rating histogram",
        "What is revenue share by quarter?",
        "Compare discount levels across segments",
        "Which products have negative profit?",
        "Show monthly order volume trend",
        "What is average order value by region?",
        "Compare Electronics vs Clothing revenue",
        "Which city has highest customer ratings?",
        "Show profit concentration by top categories",
        "What is delivery time vs customer rating relationship?",
        "Compare campaign performance by quarter",
        "Which sub-category drives most volume?",
        "Show revenue per employee equivalent by segment",
        "What are top 5 loss-making product lines?",
        "Compare West vs East region profitability",
        "Show discount_pct vs profit scatter",
        "Which marketing channel has best ratings?",
        "What is seasonal pattern in shipping costs?",
        "Compare Enterprise order sizes vs Consumer",
        "Show geographic revenue heatmap by state",
        "Which campaigns correlate with high discounts?",
        "What is profit trend by product category?",
        "Compare delivery days across customer segments",
        "Show sales_amount distribution histogram",
        "Which region has highest discount rates?",
        "What is average quantity per order by category?",
    ],
    "hr_gold_5000.csv": [
        "What is the attrition rate by department?",
        "Show salary distribution across the workforce",
        "Which department has the highest average salary?",
        "Compare engagement score vs performance rating",
        "What is the headcount by location?",
        "Show hiring trends over time",
        "Which job levels have the highest attrition?",
        "Compare bonus amounts by department",
        "What is average training hours by department?",
        "Show attrition patterns by age band",
        "Which departments have the most managers?",
        "Compare salary by gender",
        "What is promotion rate by job level?",
        "Show performance rating distribution",
        "Which location has highest engagement scores?",
        "Compare attrition in Sales vs Engineering",
        "Show salary vs performance scatter",
        "What is average tenure by department?",
        "Which job family has lowest engagement?",
        "Show workforce composition by department",
        "What is attrition rate by job level?",
        "Compare training hours across departments",
        "Which gender has higher average bonus?",
        "Show engagement score distribution",
        "What is salary range by job family?",
        "Compare manager vs IC compensation",
        "Which departments promote most frequently?",
        "Show hiring volume by year",
        "What is bonus vs performance correlation?",
        "Compare attrition by location",
        "Which age band has highest salaries?",
        "Show performance rating by department",
        "What is average tenure for attrited employees?",
        "Compare engagement in remote vs HQ locations",
        "Which job level has most training hours?",
        "Show attrition_flag rate by gender",
        "What is salary trend over hire cohorts?",
        "Compare Sales vs Support attrition rates",
        "Which department has lowest engagement?",
        "Show promotion rate by performance band",
        "What is headcount by job family?",
        "Compare bonus distribution across levels",
        "Which location hires the most?",
        "Show salary histogram by department",
        "What is training investment by job level?",
        "Compare VP vs IC1 salary gaps",
        "Which departments are over-indexed on managers?",
        "Show attrition trend by hire year",
        "What is engagement vs training hours relationship?",
        "Compare performance ratings by gender",
        "Which job family pays highest bonuses?",
        "Show workforce age distribution",
        "What is attrition risk in first 2 years?",
        "Compare Engineering headcount vs Sales",
        "Which locations have promotion hotspots?",
    ],
    "banking_gold_10000.csv": [
        "What is total loan balance by customer segment?",
        "Show credit score vs delinquency relationship",
        "Which product type has highest deposit balance?",
        "Compare spend trends over time",
        "What is utilization rate distribution?",
        "Which region has highest delinquency rate?",
        "Show segment contribution to loan portfolio",
        "Compare monthly income by segment",
        "What is average transaction count by product?",
        "Show spend amount trends by month",
        "Which segment has highest credit scores?",
        "Compare loan vs deposit balance by region",
        "What share of customers are delinquent?",
        "Show utilization vs credit score correlation",
        "Which city has highest spend amounts?",
        "Compare Corporate vs Retail segment behavior",
        "Show account age distribution",
        "What is delinquency rate by credit score band?",
        "Which product has highest utilization?",
        "Show regional spend concentration",
        "What is loan balance by region?",
        "Compare deposit balance across segments",
        "Which product has highest delinquency?",
        "Show credit score distribution",
        "What is spend vs income correlation?",
        "Compare transaction counts by segment",
        "Which region has highest loan balances?",
        "Show monthly delinquency rate trend",
        "What is utilization by product type?",
        "Compare Premium vs Mass Affluent spend",
        "Which city has lowest credit scores?",
        "Show loan balance histogram",
        "What is deposit to loan ratio by segment?",
        "Compare Corporate vs SME utilization",
        "Which month has peak spending?",
        "Show delinquency rate by credit band",
        "What is average account age by product?",
        "Compare North vs South spend patterns",
        "Which segment over-utilizes credit?",
        "Show transaction_count distribution",
        "What is income vs loan balance scatter?",
        "Compare product mix by region",
        "Which customers are high-risk delinquent?",
        "Show spend_amount seasonal patterns",
        "What is credit score by customer segment?",
        "Compare loan balance share by product",
        "Which region has best credit quality?",
        "Show utilization_pct histogram",
        "What is monthly spend trend by segment?",
        "Compare deposit balance vs spend",
        "Which product drives most transactions?",
        "Show delinquency concentration by region",
        "What is spend per transaction by segment?",
        "Compare account age across products",
        "Which cities have highest loan exposure?",
    ],
}


def _load_frame(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    for col in df.columns:
        cl = str(col).lower()
        if "date" in cl or cl == "month":
            if cl == "month":
                continue
            try:
                df[col] = pd.to_datetime(df[col], errors="coerce")
            except Exception:
                pass
    return df


def _quality_checks(df: pd.DataFrame) -> dict[str, Any]:
    empty_cols = [c for c in df.columns if df[c].isna().all()]
    dup_cols = [c for c in df.columns if df.columns.tolist().count(c) > 1]
    null_pct = {c: round(float(df[c].isna().mean()) * 100, 2) for c in df.columns}
    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    skew_notes = []
    for c in numeric_cols[:8]:
        s = df[c].dropna()
        if len(s) > 10:
            skew_notes.append(f"{c}: mean={s.mean():.2f}, std={s.std():.2f}, min={s.min():.2f}, max={s.max():.2f}")
    return {
        "empty_columns": empty_cols,
        "duplicate_columns": dup_cols,
        "null_pct_by_column": null_pct,
        "numeric_summary": skew_notes,
    }


def _bind_and_analyze(path: Path) -> dict[str, Any]:
    df = _load_frame(path)
    profile = main_mod.build_profile(df)
    main_mod.df = df
    main_mod.dataset_profile = profile
    main_mod.column_mapping = {k: None for k in main_mod.column_mapping}
    proposed, _ = main_mod.compute_semantic_column_mapping(df, profile)
    for key, val in proposed.items():
        main_mod.column_mapping[key] = val

    dash = main_mod.build_auto_dashboard()
    kpis = main_mod.calculate_kpis()

    exec_domain = main_mod.infer_executive_domain(df.columns.tolist())
    kind = main_mod.executive_domain_to_auto_kind(exec_domain)

    deps = DashboardDeps(
        numeric_series=main_mod.numeric_series,
        time_series_grouped=main_mod._adaptive_time_series_grouped,
        series_payload=main_mod._dash_series_payload,
        pretty_label=main_mod._pretty_label_text,
        chart_title_by_dimension=main_mod._dash_chart_title_by_dimension,
        freq_human_label=main_mod._freq_human_label,
        id_like_column=main_mod._id_like_column_name,
        priority_metrics=main_mod._dash_priority_metric_columns,
        record_metric_key=main_mod._DASH_RECORD_METRIC_KEY,
    )
    bound = _bind_deps_to_dataframe(df, deps)
    inv = classify_columns(df, profile, id_like_fn=bound.id_like_column)
    opportunities = discover_chart_opportunities(df, profile, kind, bound, inv=inv)

    hist_q = HISTOGRAM_QUESTIONS.get(path.name, "")
    histogram_routing: dict[str, Any] = {"question": hist_q, "routed": False}
    if hist_q:
        try:
            hist_result = main_mod._try_build_histogram_visualization(hist_q, df, profile)
            if hist_result:
                h_rows, h_ct, h_title, _, h_trace = hist_result
                histogram_routing = {
                    "question": hist_q,
                    "routed": True,
                    "chart_type": h_ct,
                    "title": h_title,
                    "bucket_count": len(h_rows),
                    "column": h_trace.get("numeric_column"),
                }
        except Exception as exc:
            histogram_routing["error"] = str(exc)

    opp_by_type: dict[str, list[str]] = defaultdict(list)
    chart_types: Counter[str] = Counter()
    for opp in opportunities:
        ot = str(opp.get("_opportunityType") or "unknown")
        title = str(opp.get("title") or "")
        ct = str(opp.get("chartType") or "").lower()
        opp_by_type[ot].append(title)
        if ct:
            chart_types[ct] += 1

    dash_chart_types = Counter(
        str(c.get("chartType") or "").lower() for c in (dash.get("charts") or [])
    )

    return {
        "file": path.name,
        "rows": int(len(df)),
        "columns": [str(c) for c in df.columns.tolist()],
        "column_count": len(df.columns),
        "quality": _quality_checks(df),
        "semantic_mapping": {k: v for k, v in main_mod.column_mapping.items() if v},
        "executive_domain": exec_domain,
        "auto_dashboard_kind": dash.get("kind"),
        "kpi_cards": [{"title": c.get("title"), "value": c.get("value")} for c in (dash.get("cards") or [])],
        "kpi_count": len(dash.get("cards") or []),
        "auto_charts": [
            {"title": c.get("title"), "chartType": c.get("chartType")}
            for c in (dash.get("charts") or [])
        ],
        "auto_chart_count": len(dash.get("charts") or []),
        "auto_chart_types": dict(dash_chart_types),
        "opportunity_inventory": {k: v[:8] for k, v in opp_by_type.items()},
        "opportunity_counts": {k: len(v) for k, v in opp_by_type.items()},
        "discovered_chart_types": dict(chart_types),
        "coverage_telemetry": dash.get("coverage_telemetry") or {},
        "histogram_routing": histogram_routing,
        "raw_kpis": kpis,
    }


def _expected_insights(filename: str) -> list[str]:
    insights = {
        "retail_gold_10000.csv": [
            "North region likely concentrates revenue share",
            "Electronics drives high revenue with strong margins",
            "Clearance/Home & Kitchen sub-category shows loss-making lines",
            "Q4 seasonal peaks in sales with Holiday Mega Sale campaign alignment",
            "Higher discounts correlate with lower profit margins",
            "Delivery days skew toward fast fulfillment with long-tail outliers",
            "Enterprise segment commands premium average order values",
            "Paid Search and Organic channels dominate acquisition mix",
        ],
        "hr_gold_5000.csv": [
            "Sales and Support departments show elevated attrition rates",
            "Engineering commands premium salaries with lower attrition",
            "Performance rating correlates with engagement scores and bonus levels",
            "HQ locations (New York, London) pay above remote averages",
            "Promotion flags concentrate among high performers (4.0+ ratings)",
            "Salary distribution is right-skewed with executive outliers",
            "Hiring spans 2015–2024 with department concentration in Engineering",
            "Training hours vary meaningfully by department and role level",
        ],
        "banking_gold_10000.csv": [
            "Corporate and SME segments dominate loan balance concentration",
            "Credit scores below 620 strongly associate with delinquency flags",
            "Utilization rates cluster mid-range with high-utilization risk pockets",
            "Spend trends show gradual growth with seasonal oscillation",
            "Regional differences in spend and delinquency patterns",
            "Premium segment shows higher transaction counts and income",
            "Product mix skews toward Personal Loan and Credit Card",
            "Deposit balances complement loan portfolio for segment analysis",
        ],
    }
    return insights.get(filename, [])


def _suite_passes(caps: dict[str, bool]) -> bool:
    """Pass when core capabilities hold; category distribution optional if histogram + composition exist."""
    optional = "Distribution (category)"
    required = {k: v for k, v in caps.items() if k != optional}
    distribution_ok = caps.get(optional) or (
        caps.get("Histogram (AI Insights)") and caps.get("Composition (donut/pie)")
    )
    return all(required.values()) and bool(distribution_ok)


def _capability_matrix(result: dict[str, Any]) -> dict[str, bool]:
    opp = result.get("opportunity_counts") or {}
    charts = result.get("auto_chart_types") or {}
    discovered = result.get("discovered_chart_types") or {}
    all_types = set(charts.keys()) | set(discovered.keys())
    hist = result.get("histogram_routing") or {}

    return {
        "KPI cards": result.get("kpi_count", 0) >= 3,
        "Auto Dashboard charts": result.get("auto_chart_count", 0) >= 3,
        "Trend (line/area)": opp.get("trend", 0) >= 1 or bool({"line", "area"} & all_types),
        "Ranking (bar)": opp.get("ranking", 0) >= 1 or bool({"bar", "horizontalbar"} & all_types),
        "Composition (donut/pie)": opp.get("composition", 0) >= 1 or bool({"donut", "pie"} & all_types),
        "Distribution (category)": opp.get("distribution", 0) >= 1,
        "Histogram (AI Insights)": bool(hist.get("routed")),
        "Correlation (scatter)": opp.get("correlation", 0) >= 1 or "scatter" in all_types,
        "Geographic": opp.get("geographic", 0) >= 1,
        "Compare intent": opp.get("compare", 0) >= 1,
        "Semantic column mapping": len(result.get("semantic_mapping") or {}) >= 2,
    }


def render_report(results: list[dict[str, Any]]) -> str:
    lines: list[str] = [
        "# Golden Dataset Validation Report",
        "",
        f"Generated from pipeline validation against backend `build_auto_dashboard()` and `discover_chart_opportunities()`.",
        "",
        "## Summary",
        "",
        "| Dataset | Rows | Columns | KPI Cards | Auto Charts | Opportunities | All Capabilities |",
        "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ]

    all_pass = True
    for r in results:
        caps = _capability_matrix(r)
        cap_pass = _suite_passes(caps)
        all_pass = all_pass and cap_pass
        opp_total = sum((r.get("opportunity_counts") or {}).values())
        status = "PASS" if cap_pass else "PARTIAL"
        lines.append(
            f"| {r['file']} | {r['rows']:,} | {r['column_count']} | {r['kpi_count']} | "
            f"{r['auto_chart_count']} | {opp_total} | {status} |"
        )

    lines.extend(["", f"**Overall suite status:** {'PASS' if all_pass else 'PARTIAL — review gaps below'}", ""])

    for r in results:
        fname = r["file"]
        caps = _capability_matrix(r)
        lines.extend(
            [
                f"## {fname}",
                "",
                f"- **Rows:** {r['rows']:,}",
                f"- **Columns:** {r['column_count']}",
                f"- **Executive domain:** `{r['executive_domain']}` → auto kind `{r['auto_dashboard_kind']}`",
                "",
                "### Data quality",
                "",
            ]
        )
        q = r["quality"]
        lines.append(f"- Empty columns: {q['empty_columns'] or 'none'}")
        lines.append(f"- Duplicate columns: {q['duplicate_columns'] or 'none'}")
        lines.append("- Numeric skew samples:")
        for note in q["numeric_summary"]:
            lines.append(f"  - {note}")
        lines.extend(["", "### Semantic mapping", ""])
        for k, v in sorted((r.get("semantic_mapping") or {}).items()):
            lines.append(f"- `{k}` → `{v}`")

        lines.extend(["", "### Capability coverage", ""])
        for cap, ok in caps.items():
            lines.append(f"- {'✅' if ok else '❌'} {cap}")

        lines.extend(["", "### KPI opportunities", ""])
        for card in r.get("kpi_cards") or []:
            lines.append(f"- **{card['title']}:** {card['value']}")

        lines.extend(["", "### Auto Dashboard charts", ""])
        for ch in r.get("auto_charts") or []:
            lines.append(f"- [{ch['chartType']}] {ch['title']}")

        lines.extend(["", "### Opportunity inventory", ""])
        for ot, titles in sorted((r.get("opportunity_inventory") or {}).items()):
            lines.append(f"- **{ot}** ({r['opportunity_counts'].get(ot, 0)}): {', '.join(titles[:5])}")

        lines.extend(["", "### Chart type coverage", ""])
        lines.append(f"- Auto dashboard: `{json.dumps(r.get('auto_chart_types') or {})}`")
        lines.append(f"- Discovered: `{json.dumps(r.get('discovered_chart_types') or {})}`")

        lines.extend(["", "### Histogram routing (AI Insights)", ""])
        hr = r.get("histogram_routing") or {}
        if hr.get("routed"):
            lines.append(
                f"- ✅ `{hr.get('question')}` → [{hr.get('chart_type')}] "
                f"{hr.get('title')} ({hr.get('bucket_count')} buckets on `{hr.get('column')}`)"
            )
        else:
            lines.append(f"- ❌ Histogram routing failed for: `{hr.get('question')}`")

        lines.extend(["", "### Expected AI Summary insights", ""])
        for ins in _expected_insights(fname):
            lines.append(f"- {ins}")

        lines.extend(["", f"### Example AI questions ({len(EXAMPLE_QUESTIONS.get(fname, []))} curated)", ""])
        for q in EXAMPLE_QUESTIONS.get(fname, []):
            lines.append(f"- {q}")

        lines.append("")

    lines.extend(
        [
            "## Application capability matrix",
            "",
            "These datasets are designed to exercise:",
            "",
            "| Capability | Retail | HR | Banking |",
            "| --- | --- | --- | --- |",
        ]
    )
    retail_caps = _capability_matrix(results[0]) if results else {}
    hr_caps = _capability_matrix(results[1]) if len(results) > 1 else {}
    bank_caps = _capability_matrix(results[2]) if len(results) > 2 else {}
    for cap in retail_caps:
        lines.append(
            f"| {cap} | {'✅' if retail_caps.get(cap) else '❌'} | "
            f"{'✅' if hr_caps.get(cap) else '❌'} | {'✅' if bank_caps.get(cap) else '❌'} |"
        )

    lines.extend(
        [
            "",
            "## Export & regression usage",
            "",
            "- **Overview Dashboard:** KPI cards + auto charts from semantic mapping",
            "- **AI Summary:** ranked insight bullets from KPI + chart breakdowns",
            "- **Charts tab:** timeline + session charts from uploaded dataset",
            "- **AI Insights:** trend, compare, correlation, geographic, histogram routing",
            "- **PNG/PDF export:** chart capture at insight viewport widths",
            "",
            "Re-run validation: `python test-fixtures/golden-datasets/validate_golden_datasets.py`",
            "Regenerate data: `python test-fixtures/golden-datasets/generate_golden_datasets.py`",
            "",
        ]
    )
    return "\n".join(lines)


def main_cli() -> None:
    results: list[dict[str, Any]] = []
    for name in GOLDEN_FILES:
        path = GOLD_DIR / name
        if not path.is_file():
            raise FileNotFoundError(f"Missing golden dataset: {path}")
        print(f"Validating {name}...")
        results.append(_bind_and_analyze(path))

    main_mod.df = None
    main_mod.dataset_profile = None

    report = render_report(results)
    out_path = GOLD_DIR / "validation_report.md"
    out_path.write_text(report, encoding="utf-8")
    print(f"Wrote {out_path}")

    json_path = GOLD_DIR / "validation_results.json"
    json_path.write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")
    print(f"Wrote {json_path}")


if __name__ == "__main__":
    main_cli()
