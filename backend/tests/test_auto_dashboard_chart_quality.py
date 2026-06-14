"""Auto Dashboard chart quality audit across domain fixtures."""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
FIX_DIR = REPO_ROOT / "test-fixtures" / "domains"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
from services.auto_dashboard_opportunities import (  # noqa: E402
    DashboardDeps,
    MAX_DONUT_CHARTS,
    _chart_story_signature,
    _is_generic_records_chart,
    _metric_semantic_strength,
    audit_dashboard_charts,
    normalize_canonical_chart_title,
    validate_chart_renderable,
)
from services.kpi_polish import is_valid_kpi_leader_value  # noqa: E402

DOMAIN_FIXTURES = (
    "sales.csv",
    "sales_test.csv",
    "retail.csv",
    "retail_orders_chart_test.csv",
    "marketing.csv",
    "banking_financial_services.csv",
    "hr.csv",
    "operations.csv",
    "operations_incidents_chart_test.csv",
    "healthcare.csv",
    "geography.csv",
    "customer_support.csv",
    "dashboard_showcase_dataset.csv",
    "monthly_sales.csv",
    "employee_test.csv",
    "screenshot-fixture.csv",
    "manufacturing_test.csv",
)

WEAK_TITLE_PATTERNS = (
    r"trend \(",
    r" share by ",
    r"category distribution",
    r"\(correlation\)",
    r"top .+ by .+",
)

_DUP_WORD_RE = re.compile(
    r"\b(monthly|weekly|daily|quarterly|yearly|trend|total|average)\s+\1\b",
    re.I,
)


def _deps() -> DashboardDeps:
    return DashboardDeps(
        numeric_series=main.numeric_series,
        time_series_grouped=main._adaptive_time_series_grouped,
        series_payload=main._dash_series_payload,
        pretty_label=main._pretty_label_text,
        chart_title_by_dimension=main._dash_chart_title_by_dimension,
        freq_human_label=main._freq_human_label,
        id_like_column=main._id_like_column_name,
        priority_metrics=main._dash_priority_metric_columns,
        record_metric_key=main._DASH_RECORD_METRIC_KEY,
    )


def _bind(name: str) -> tuple[list[dict], str]:
    path = FIX_DIR / name
    if not path.is_file():
        return [], "generic"
    df = pd.read_csv(path)
    for col in df.columns:
        if "date" in str(col).lower():
            try:
                df[col] = pd.to_datetime(df[col], errors="coerce")
            except Exception:
                pass
    profile = main.build_profile(df)
    main.df = df
    main.dataset_profile = profile
    main.column_mapping = {k: None for k in main.column_mapping}
    proposed, _ = main.compute_semantic_column_mapping(df, profile)
    for key, val in proposed.items():
        main.column_mapping[key] = val
    dash = main.build_auto_dashboard()
    return dash.get("charts") or [], str(dash.get("kind") or "generic")


def _title_has_duplicate_semantic_tokens(title: str) -> bool:
    if _DUP_WORD_RE.search(title):
        return True
    words = title.lower().split()
    return any(words[i] == words[i + 1] for i in range(len(words) - 1))


class TestCanonicalChartTitles(unittest.TestCase):
    def test_dedupes_monthly_and_trend(self) -> None:
        self.assertEqual(
            normalize_canonical_chart_title("Monthly Monthly Revenue Trend Trend"),
            "Monthly Revenue Trend",
        )

    def test_dedupes_total_and_by_clause(self) -> None:
        self.assertEqual(
            normalize_canonical_chart_title("Total Total Revenue by Region by Region"),
            "Total Revenue by Region",
        )

    def test_weekly_order_value_trend(self) -> None:
        self.assertEqual(
            normalize_canonical_chart_title("Weekly Weekly Order Value Trend Trend"),
            "Weekly Order Value Trend",
        )


class TestAutoDashboardChartQuality(unittest.TestCase):
    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping = {k: None for k in main.column_mapping}

    def test_all_fixture_charts_renderable(self) -> None:
        for name in DOMAIN_FIXTURES:
            path = FIX_DIR / name
            if not path.is_file():
                continue
            charts, _ = _bind(name)
            self.assertGreater(len(charts), 0, msg=f"{name} produced no charts")
            for chart in charts:
                ok, reason = validate_chart_renderable(chart)
                self.assertTrue(ok, msg=f"{name} {chart.get('title')}: {reason}")

    def test_no_duplicate_semantic_title_tokens(self) -> None:
        for name in DOMAIN_FIXTURES:
            path = FIX_DIR / name
            if not path.is_file():
                continue
            charts, _ = _bind(name)
            for chart in charts:
                title = str(chart.get("title") or "")
                self.assertFalse(
                    _title_has_duplicate_semantic_tokens(title),
                    msg=f"{name} duplicate tokens in {title}",
                )

    def test_no_weak_chart_titles(self) -> None:
        for name in DOMAIN_FIXTURES:
            path = FIX_DIR / name
            if not path.is_file():
                continue
            charts, _ = _bind(name)
            for chart in charts:
                title = str(chart.get("title") or "").lower()
                for pat in WEAK_TITLE_PATTERNS:
                    self.assertIsNone(
                        re.search(pat, title),
                        msg=f"{name} weak title {chart.get('title')} matched {pat}",
                    )

    def test_no_redundant_records_when_strong_metric_exists(self) -> None:
        charts, _ = _bind("retail.csv")
        titles = {str(c.get("title") or "") for c in charts}
        self.assertNotIn("Records by Product Category", titles)
        if any("Revenue by Product Category" in t for t in titles):
            self.assertTrue(True)
        charts_retail, _ = _bind("retail_orders_chart_test.csv")
        if charts_retail:
            for chart in charts_retail:
                if not _is_generic_records_chart(chart, main._DASH_RECORD_METRIC_KEY):
                    continue
                dim = str(chart.get("dimensionColumn") or "").lower()
                for other in charts_retail:
                    if other is chart or _is_generic_records_chart(
                        other, main._DASH_RECORD_METRIC_KEY
                    ):
                        continue
                    if str(other.get("dimensionColumn") or "").lower() != dim:
                        continue
                    self.assertLess(
                        _metric_semantic_strength(
                            str(other.get("metricColumn") or ""),
                            str(other.get("title") or ""),
                        ),
                        40,
                        msg=f"records chart redundant with {other.get('title')}",
                    )

    def test_no_duplicate_ranking_stories_on_retail(self) -> None:
        charts, _ = _bind("retail.csv")
        record_key = main._DASH_RECORD_METRIC_KEY
        sigs: dict[tuple, str] = {}
        for chart in charts:
            sig = _chart_story_signature(chart, record_key)
            if not sig:
                continue
            title = str(chart.get("title") or "")
            if sig in sigs:
                self.fail(
                    f"duplicate story {sigs[sig]} and {title} share signature {sig}"
                )
            sigs[sig] = title
        titles = " ".join(str(c.get("title") or "") for c in charts).lower()
        self.assertNotIn("quantity by city", titles)

    def test_no_invalid_leaders_on_breakdown_charts(self) -> None:
        for name in DOMAIN_FIXTURES:
            path = FIX_DIR / name
            if not path.is_file():
                continue
            charts, _ = _bind(name)
            for chart in charts:
                ct = str(chart.get("chartType") or "").lower()
                if ct in ("line", "area", "scatter"):
                    continue
                labels = chart.get("labels") or []
                for lab in labels[:5]:
                    self.assertTrue(
                        is_valid_kpi_leader_value(str(lab)),
                        msg=f"{name} {chart.get('title')} bad leader {lab}",
                    )

    def test_scatter_has_finite_xy_and_metric_labels(self) -> None:
        for name in DOMAIN_FIXTURES:
            path = FIX_DIR / name
            if not path.is_file():
                continue
            charts, _ = _bind(name)
            for chart in charts:
                if str(chart.get("chartType") or "").lower() != "scatter":
                    continue
                sx = chart.get("scatterX") or []
                vals = chart.get("values") or []
                self.assertGreaterEqual(len(sx), 2)
                self.assertEqual(len(sx), len(vals))
                for x in sx:
                    self.assertTrue(float(x) == float(x))
                x_lab = str(
                    chart.get("xMetricLabel") or chart.get("scatterXLabel") or ""
                ).lower()
                self.assertNotIn(x_lab, ("", "category", "x"))
                self.assertTrue(str(chart.get("xColumn") or "").strip())

    def test_donut_cap_and_no_rate_donuts(self) -> None:
        for name in DOMAIN_FIXTURES:
            path = FIX_DIR / name
            if not path.is_file():
                continue
            charts, _ = _bind(name)
            donuts = [
                c
                for c in charts
                if str(c.get("chartType") or "").lower() in ("donut", "pie")
            ]
            self.assertLessEqual(len(donuts), MAX_DONUT_CHARTS, msg=name)
            for chart in donuts:
                met = str(chart.get("metricColumn") or "").lower()
                title = str(chart.get("title") or "").lower()
                self.assertFalse(
                    any(
                        tok in met or tok in title
                        for tok in (
                            "rate",
                            "score",
                            "rating",
                            "satisfaction",
                            "utilization",
                            "resolution",
                            "attainment",
                        )
                    ),
                    msg=f"{name} rate/score donut: {chart.get('title')}",
                )

    def test_no_scientific_notation_in_displays(self) -> None:
        sci = re.compile(r"\d+\.\d+e[+-]\d+", re.I)
        for name in DOMAIN_FIXTURES:
            path = FIX_DIR / name
            if not path.is_file():
                continue
            charts, _ = _bind(name)
            for chart in charts:
                for key in ("valueDisplay", "scatterXDisplay"):
                    disp = chart.get(key) or []
                    for item in disp:
                        self.assertIsNone(
                            sci.search(str(item)),
                            msg=f"{name} {chart.get('title')} sci in {key}: {item}",
                        )

    def test_screenshot_fixture_titles_clean(self) -> None:
        charts, _ = _bind("screenshot-fixture.csv")
        self.assertGreater(len(charts), 0)
        for chart in charts:
            title = str(chart.get("title") or "")
            self.assertFalse(
                _title_has_duplicate_semantic_tokens(title),
                msg=f"duplicate tokens in {title}",
            )
            self.assertNotIn("monthly monthly", title.lower())
            self.assertNotIn("trend trend", title.lower())

    def test_audit_report_all_ok(self) -> None:
        for name in ("sales.csv", "retail.csv", "operations.csv"):
            path = FIX_DIR / name
            df = pd.read_csv(path)
            for col in df.columns:
                if "date" in str(col).lower():
                    df[col] = pd.to_datetime(df[col], errors="coerce")
            profile = main.build_profile(df)
            rows = audit_dashboard_charts(df, profile, "sales", _deps())
            self.assertTrue(rows)
            bad = [r for r in rows if not r.get("renderable")]
            self.assertFalse(bad, msg=f"{name} audit failures: {bad}")


if __name__ == "__main__":
    unittest.main()
