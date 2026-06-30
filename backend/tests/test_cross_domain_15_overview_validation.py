"""Lightweight 15-domain Overview validation — upload, mapping, dashboard, summary inputs."""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
FIXTURE_DIR = REPO_ROOT / "test-fixtures" / "domain_upload_1k"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
from services.auto_dashboard_opportunities import validate_chart_renderable  # noqa: E402
from services.executive_kpi_cards import infer_executive_domain  # noqa: E402
from services.file_parsers import load_dataframe_from_upload  # noqa: E402

_ID_TITLE_PATTERNS = (
    r"\bemployee id\b",
    r"\border id\b",
    r"\baccount id\b",
    r"\bpatient id\b",
    r"\bshipment id\b",
    r"\bstudent id\b",
    r"\bbatch id\b",
    r"\bclaim id\b",
    r"\bproperty id\b",
    r"\bsubscriber id\b",
    r"\bbooking id\b",
    r"\bmeter id\b",
    r"\bticket id\b",
)

DOMAIN_15_EXPECTATIONS: dict[str, dict] = {
    "retail_ecommerce_1k.csv": {
        "exec_domain": "sales",
        "map_domain": "ecommerce",
        "min_aggregate": "high",
        "sales": "sales_amount",
        "product": "product_category",
        "date": "order_date",
        "profit": "profit",
        "summary_keywords": ("sales", "revenue", "profit", "category", "region"),
        "wrong_label_leaks": ("hr / employee", "healthcare"),
    },
    "banking_financial_1k.csv": {
        "exec_domain": "banking",
        "map_domain": "banking",
        "min_aggregate": "medium",
        "sales": "spend_amount",
        "product": "product_type",
        "date": "report_month",
        "summary_keywords": ("spend", "loan", "deposit", "utilization", "product"),
        "wrong_label_leaks": ("hr / employee", "marketing"),
    },
    "hr_workforce_1k.csv": {
        "exec_domain": "hr",
        "map_domain": "hr",
        "type_label": "HR / Employee",
        "min_aggregate": "high",
        "sales": "salary",
        "product": "department",
        "date": "hire_date",
        "profit": "performance_rating",
        "summary_keywords": ("salary", "department", "workforce", "performance"),
        "wrong_label_leaks": ("sales", "marketing", "healthcare"),
    },
    "healthcare_patient_1k.csv": {
        "exec_domain": "healthcare",
        "map_domain": "healthcare",
        "type_label": "Healthcare",
        "min_aggregate": "high",
        "sales": "claim_amount",
        "product": "department",
        "date": "visit_date",
        "profit_alternatives": ("readmission_rate", "wait_time_minutes", "visit_count"),
        "summary_keywords": ("claim", "visit", "department", "patient"),
        "wrong_label_leaks": ("hr / employee", "marketing"),
    },
    "manufacturing_quality_1k.csv": {
        "exec_domain": "operations",
        "map_domain": "manufacturing",
        "min_aggregate": "high",
        "sales": "units_produced",
        "product": "product_line",
        "date": "production_date",
        "profit": "defect_rate",
        "summary_keywords": ("units", "defect", "production", "plant", "scrap"),
        "wrong_label_leaks": ("hr / employee",),
    },
    "marketing_campaign_1k.csv": {
        "exec_domain": "marketing",
        "map_domain": "marketing",
        "type_label": "Marketing",
        "min_aggregate": "high",
        "sales": "revenue",
        "product": "campaign_name",
        "date": "campaign_date",
        "profit_alternatives": ("spend", "conversion_rate", "clicks", "impressions"),
        "summary_keywords": ("revenue", "campaign", "channel", "spend", "conversion"),
        "wrong_label_leaks": ("hr / employee", "healthcare"),
    },
    "saas_subscription_1k.csv": {
        "exec_domain": "saas",
        "map_domain": "saas",
        "type_label": "SaaS / Subscription",
        "min_aggregate": "high",
        "sales": "mrr",
        "product": "plan_type",
        "date": "month",
        "profit_alternatives": ("churn_rate", "active_users", "new_signups", "expansion_revenue"),
        "summary_keywords": ("mrr", "churn", "plan", "subscription", "users"),
        "wrong_label_leaks": ("hr / employee", "retail"),
    },
    "supply_chain_logistics_1k.csv": {
        "exec_domain": "generic",
        "map_domain": "supply_chain",
        "min_aggregate": "high",
        "sales": "freight_cost",
        "product": "carrier",
        "date": "ship_date",
        "profit_alternatives": ("on_time_rate", "delivery_days", "shipment_count"),
        "summary_keywords": ("freight", "shipment", "delivery", "carrier", "on-time"),
        "wrong_label_leaks": ("hr / employee",),
    },
    "education_student_1k.csv": {
        "exec_domain": "generic",
        "map_domain": "education",
        "min_aggregate": "high",
        "sales": "enrollment_count",
        "product": "grade_level",
        "date": "term_date",
        "profit": "pass_rate",
        "summary_keywords": ("enrollment", "grade", "attendance", "pass", "test"),
        "wrong_label_leaks": ("hr / employee", "marketing"),
    },
    "insurance_claims_1k.csv": {
        "exec_domain": "generic",
        "map_domain": "insurance",
        "min_aggregate": "high",
        "sales": "claim_amount",
        "product": "policy_type",
        "date": "claim_date",
        "profit": "loss_ratio",
        "summary_keywords": ("claim", "policy", "loss", "settlement"),
        "wrong_label_leaks": ("hr / employee", "healthcare"),
    },
    "real_estate_property_1k.csv": {
        "exec_domain": "generic",
        "map_domain": "real_estate",
        "min_aggregate": "high",
        "sales": "sale_price",
        "product": "property_type",
        "date": "list_date",
        "profit": "cap_rate",
        "summary_keywords": ("sale", "price", "property", "market", "cap"),
        "wrong_label_leaks": ("hr / employee", "healthcare"),
    },
    "telecom_usage_1k.csv": {
        "exec_domain": "generic",
        "map_domain": "telecom",
        "min_aggregate": "high",
        "sales": "monthly_revenue",
        "product": "plan_tier",
        "date": "billing_month",
        "profit": "churn_rate",
        "summary_keywords": ("revenue", "plan", "churn", "usage", "subscriber"),
        "wrong_label_leaks": ("hr / employee", "healthcare"),
    },
    "hospitality_bookings_1k.csv": {
        "exec_domain": "generic",
        "map_domain": "hospitality",
        "min_aggregate": "high",
        "sales": "room_revenue",
        "product": "hotel_brand",
        "date": "check_in_date",
        "profit": "occupancy_rate",
        "summary_keywords": ("room", "revenue", "occupancy", "hotel", "booking"),
        "wrong_label_leaks": ("hr / employee", "healthcare"),
    },
    "energy_utilization_1k.csv": {
        "exec_domain": "generic",
        "map_domain": "energy",
        "min_aggregate": "high",
        "sales": "energy_kwh",
        "product": "facility_type",
        "date": "reading_date",
        "profit": "efficiency_score",
        "summary_keywords": ("energy", "kwh", "utility", "facility", "efficiency"),
        "wrong_label_leaks": ("hr / employee",),
    },
    "support_tickets_1k.csv": {
        "exec_domain": "customer_support",
        "map_domain": "customer_support",
        "type_label": "Customer Support",
        "min_aggregate": "high",
        "sales": "tickets_opened",
        "product": "ticket_category",
        "date": "opened_date",
        "profit": "csat_score",
        "summary_keywords": ("ticket", "resolution", "csat", "escalation", "support"),
        "wrong_label_leaks": ("hr / employee", "marketing"),
    },
}


def _aggregate_mapping_confidence(meta: dict) -> str:
    roles = meta.get("roles") or {}
    rank = {"low": 0, "medium": 1, "high": 2}
    worst = "high"
    for key in ("sales", "product", "date", "profit"):
        conf = str((roles.get(key) or {}).get("confidence") or "low").lower()
        if rank[conf] < rank[worst]:
            worst = conf
    return worst


def _parse_fixture(path: Path) -> tuple[dict, dict, dict, dict]:
    raw = path.read_bytes()
    df, _ = load_dataframe_from_upload(raw, path.name)
    df = main.clean_dataframe(df)
    for col in df.columns:
        cl = str(col).lower()
        if "date" in cl or cl in ("month", "report_month", "billing_month"):
            df[col] = pd.to_datetime(df[col], errors="coerce")
    profile = main.build_profile(df)
    main.df = df
    main.dataset_profile = profile
    main.column_mapping = {k: None for k in main.column_mapping}
    proposed, meta = main.compute_semantic_column_mapping(df, profile)
    for key, val in proposed.items():
        main.column_mapping[key] = val
    main.column_mapping_metadata = meta
    dash = main.build_auto_dashboard()
    return proposed, meta, profile, dash


def _summary_candidate_sanity(
    filename: str,
    dash: dict,
    proposed: dict,
    exp: dict,
) -> None:
    """Deterministic local checks for Overview AI summary inputs (no LLM)."""
    cards = dash.get("cards") or []
    charts = dash.get("charts") or []
    assert len(cards) >= 1, f"{filename}: KPI summary candidates missing"
    assert len(charts) >= 3, f"{filename}: chart summary candidates missing"

    type_label = str(dash.get("type_label") or "")
    for leak in exp.get("wrong_label_leaks", ()):
        assert leak.lower() not in type_label.lower(), f"{filename}: label leak {leak}"

    if exp.get("type_label"):
        assert type_label == exp["type_label"], f"{filename}: label={type_label}"

    corpus = " ".join(
        str(c.get("title") or "") for c in [*cards, *charts]
    ).lower()
    keywords = tuple(k.lower() for k in exp.get("summary_keywords", ()))
    assert any(k in corpus for k in keywords), (
        f"{filename}: no domain-relevant metric in titles corpus={corpus[:200]}"
    )
    assert not all(
        token in corpus for token in ("generic dataset", "unnamed metric")
    ), f"{filename}: generic-only summary inputs"

    primary = str(proposed.get("sales") or "").replace("_", " ")
    if primary:
        assert primary in corpus or any(k in corpus for k in keywords), (
            f"{filename}: primary metric not reflected in summary candidates"
        )


class TestDomain15FixturesExist(unittest.TestCase):
    def test_manifest_lists_fifteen_datasets(self) -> None:
        manifest = FIXTURE_DIR / "manifest.json"
        self.assertTrue(manifest.is_file())
        import json

        data = json.loads(manifest.read_text(encoding="utf-8"))
        self.assertEqual(len(data.get("datasets") or []), 15)

    def test_each_fixture_has_about_1000_rows(self) -> None:
        for path in FIXTURE_DIR.glob("*_1k.csv"):
            df = pd.read_csv(path)
            self.assertGreaterEqual(len(df), 950, msg=path.name)
            self.assertLessEqual(len(df), 1050, msg=path.name)


class TestDomain15OverviewValidation(unittest.TestCase):
    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping_metadata = None
        main.column_mapping = {k: None for k in main.column_mapping}

    def test_upload_probe_succeeds_for_all_fifteen(self) -> None:
        for filename in DOMAIN_15_EXPECTATIONS:
            path = FIXTURE_DIR / filename
            raw = path.read_bytes()
            df, _ = load_dataframe_from_upload(raw, path.name)
            self.assertFalse(df.empty, msg=filename)

    def test_mapping_dashboard_and_summary_inputs_per_domain(self) -> None:
        rank = {"low": 0, "medium": 1, "high": 2}
        for filename, exp in DOMAIN_15_EXPECTATIONS.items():
            path = FIXTURE_DIR / filename
            proposed, meta, _profile, dash = _parse_fixture(path)

            self.assertEqual(
                infer_executive_domain(pd.read_csv(path).columns.tolist()),
                exp["exec_domain"],
                msg=filename,
            )
            self.assertEqual(meta.get("domain"), exp["map_domain"], msg=filename)

            agg = _aggregate_mapping_confidence(meta)
            self.assertGreaterEqual(
                rank[agg],
                rank[exp["min_aggregate"]],
                msg=f"{filename} aggregate={agg}",
            )

            for role_key in ("sales", "product", "date", "profit"):
                if role_key not in exp or role_key == "profit" and "profit_alternatives" in exp:
                    continue
                self.assertEqual(proposed.get(role_key), exp[role_key], msg=filename)

            if "profit_alternatives" in exp:
                self.assertNotEqual(proposed.get("sales"), proposed.get("profit"), msg=filename)
                self.assertIn(proposed.get("profit"), exp["profit_alternatives"], msg=filename)
            elif "profit" in exp:
                self.assertNotEqual(proposed.get("sales"), proposed.get("profit"), msg=filename)

            roles = meta.get("roles") or {}
            for core in ("sales", "product", "date", "profit"):
                conf = str((roles.get(core) or {}).get("confidence") or "")
                self.assertIn(conf, ("high", "medium"), msg=f"{filename} {core}={conf}")

            _summary_candidate_sanity(filename, dash, proposed, exp)

    def test_no_id_like_dimensions_in_chart_titles(self) -> None:
        for filename in DOMAIN_15_EXPECTATIONS:
            path = FIXTURE_DIR / filename
            _proposed, _meta, _profile, dash = _parse_fixture(path)
            joined = " | ".join(
                str(c.get("title") or "") for c in dash.get("charts") or []
            ).lower()
            for pat in _ID_TITLE_PATTERNS:
                self.assertIsNone(re.search(pat, joined), msg=f"{filename} matched {pat}")

    def test_no_default_scatter_when_business_rich(self) -> None:
        for filename in DOMAIN_15_EXPECTATIONS:
            path = FIXTURE_DIR / filename
            _proposed, _meta, _profile, dash = _parse_fixture(path)
            charts = dash.get("charts") or []
            non_scatter = [
                c for c in charts if str(c.get("chartType", "")).lower() != "scatter"
            ]
            scatters = [c for c in charts if str(c.get("chartType", "")).lower() == "scatter"]
            if len(non_scatter) >= 4:
                self.assertEqual(len(scatters), 0, msg=f"{filename} {scatters}")

    def test_default_charts_are_renderable_and_business_facing(self) -> None:
        for filename in DOMAIN_15_EXPECTATIONS:
            path = FIXTURE_DIR / filename
            _proposed, _meta, _profile, dash = _parse_fixture(path)
            charts = dash.get("charts") or []
            self.assertGreaterEqual(len(charts), 3, msg=filename)
            titles = " | ".join(str(c.get("title") or "") for c in charts).lower()
            self.assertNotIn(" vs ", titles, msg=f"{filename}: correlation scatter title")
            for chart in charts:
                ok, reason = validate_chart_renderable(chart)
                self.assertTrue(ok, msg=f"{filename} {chart.get('title')}: {reason}")


if __name__ == "__main__":
    unittest.main()
