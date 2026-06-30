"""Cross-domain ~1k-row upload, mapping confidence, and Overview validation."""

from __future__ import annotations

import io
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
    r"\btransaction id\b",
)

FIXTURE_EXPECTATIONS: dict[str, dict] = {
    "retail_ecommerce_1k.csv": {
        "exec_domain": "sales",
        "map_domain": "ecommerce",
        "min_aggregate": "high",
        "sales": "sales_amount",
        "product": "product_category",
        "date": "order_date",
        "profit": "profit",
    },
    "banking_financial_1k.csv": {
        "exec_domain": "banking",
        "map_domain": "banking",
        "min_aggregate": "medium",
        "sales": "spend_amount",
        "product": "product_type",
        "date": "report_month",
    },
    "hr_workforce_1k.csv": {
        "exec_domain": "hr",
        "map_domain": "hr",
        "min_aggregate": "high",
        "sales": "salary",
        "product": "department",
        "date": "hire_date",
        "profit": "performance_rating",
        "customer": "employee_status",
    },
    "healthcare_patient_1k.csv": {
        "exec_domain": "healthcare",
        "map_domain": "healthcare",
        "type_label": "Healthcare",
        "min_aggregate": "high",
        "sales": "claim_amount",
        "product": "department",
        "date": "visit_date",
        "profit_alternatives": (
            "readmission_rate",
            "wait_time_minutes",
            "visit_count",
        ),
    },
    "manufacturing_quality_1k.csv": {
        "exec_domain": "operations",
        "map_domain": "manufacturing",
        "min_aggregate": "high",
        "sales": "units_produced",
        "product": "product_line",
        "date": "production_date",
        "profit": "defect_rate",
    },
    "marketing_campaign_1k.csv": {
        "exec_domain": "marketing",
        "map_domain": "marketing",
        "min_aggregate": "high",
        "sales": "revenue",
        "product": "campaign_name",
        "date": "campaign_date",
        "profit_alternatives": (
            "spend",
            "conversion_rate",
            "clicks",
            "impressions",
        ),
    },
    "saas_subscription_1k.csv": {
        "exec_domain": "saas",
        "map_domain": "saas",
        "type_label": "SaaS / Subscription",
        "min_aggregate": "high",
        "sales": "mrr",
        "product": "plan_type",
        "date": "month",
        "profit_alternatives": (
            "churn_rate",
            "active_users",
            "new_signups",
            "expansion_revenue",
        ),
    },
    "supply_chain_logistics_1k.csv": {
        "exec_domain": "generic",
        "map_domain": "supply_chain",
        "min_aggregate": "high",
        "sales": "freight_cost",
        "product": "carrier",
        "date": "ship_date",
        "profit_alternatives": (
            "on_time_rate",
            "delivery_days",
            "shipment_count",
        ),
    },
    "education_student_1k.csv": {
        "exec_domain": "generic",
        "map_domain": "education",
        "min_aggregate": "high",
        "sales": "enrollment_count",
        "product": "grade_level",
        "date": "term_date",
        "profit": "pass_rate",
    },
}


def _aggregate_mapping_confidence(meta: dict) -> str:
    """Mirror backend `_aggregate_mapping_confidence_from_meta` (core roles only)."""
    roles = meta.get("roles") or {}
    rank = {"low": 0, "medium": 1, "high": 2}
    worst = "high"
    for key in ("sales", "product", "date", "profit"):
        conf = str((roles.get(key) or {}).get("confidence") or "low").lower()
        if rank[conf] < rank[worst]:
            worst = conf
    return worst


def _parse_fixture(path: Path) -> tuple[pd.DataFrame, dict, dict, dict | None]:
    raw = path.read_bytes()
    df, _ = load_dataframe_from_upload(raw, path.name)
    df = main.clean_dataframe(df)
    for col in df.columns:
        cl = str(col).lower()
        if "date" in cl or cl in ("month", "report_month"):
            df[col] = pd.to_datetime(df[col], errors="coerce")
    profile = main.build_profile(df)
    main.df = df
    main.dataset_profile = profile
    main.column_mapping = {k: None for k in main.column_mapping}
    proposed, meta = main.compute_semantic_column_mapping(df, profile)
    for key, val in proposed.items():
        main.column_mapping[key] = val
    main.column_mapping_metadata = meta
    dash = main.build_auto_dashboard() if not df.empty else None
    return proposed, meta, profile, dash


class TestDomainUpload1kFixturesExist(unittest.TestCase):
    def test_manifest_lists_nine_datasets(self) -> None:
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


class TestDomainUpload1kMapping(unittest.TestCase):
    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping_metadata = None
        main.column_mapping = {k: None for k in main.column_mapping}

    def test_upload_parse_succeeds_for_each_fixture(self) -> None:
        for path in FIXTURE_DIR.glob("*_1k.csv"):
            raw = path.read_bytes()
            df, _ = load_dataframe_from_upload(raw, path.name)
            self.assertFalse(df.empty, msg=path.name)

    def test_mapping_and_confidence_per_domain(self) -> None:
        rank = {"low": 0, "medium": 1, "high": 2}
        for filename, exp in FIXTURE_EXPECTATIONS.items():
            path = FIXTURE_DIR / filename
            self.assertTrue(path.is_file(), msg=filename)
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
                msg=f"{filename} aggregate={agg} expected>={exp['min_aggregate']} mapping={proposed}",
            )
            if exp.get("type_label"):
                self.assertEqual(
                    str(dash.get("type_label") or ""),
                    exp["type_label"],
                    msg=filename,
                )
            for role_key in ("sales", "product", "date", "profit", "customer"):
                if role_key not in exp:
                    continue
                if role_key == "profit" and "profit_alternatives" in exp:
                    continue
                self.assertEqual(
                    proposed.get(role_key),
                    exp[role_key],
                    msg=f"{filename} role={role_key}",
                )
            if "profit_alternatives" in exp:
                self.assertNotEqual(
                    proposed.get("sales"),
                    proposed.get("profit"),
                    msg=f"{filename} duplicate primary/secondary",
                )
                self.assertIn(
                    proposed.get("profit"),
                    exp["profit_alternatives"],
                    msg=f"{filename} profit={proposed.get('profit')}",
                )
            roles = meta.get("roles") or {}
            for core in ("sales", "product", "date", "profit"):
                conf = str((roles.get(core) or {}).get("confidence") or "")
                self.assertIn(conf, ("high", "medium"), msg=f"{filename} {core}={conf}")
            self.assertGreaterEqual(len(dash.get("charts") or []), 3, msg=filename)

    def test_healthcare_distinct_primary_secondary(self) -> None:
        path = FIXTURE_DIR / "healthcare_patient_1k.csv"
        proposed, meta, _profile, dash = _parse_fixture(path)
        self.assertEqual(proposed.get("sales"), "claim_amount")
        self.assertNotEqual(proposed.get("sales"), proposed.get("profit"))
        self.assertIn(
            proposed.get("profit"),
            ("readmission_rate", "wait_time_minutes", "visit_count"),
        )
        self.assertEqual(dash.get("type_label"), "Healthcare")

    def test_saas_distinct_primary_secondary_and_label(self) -> None:
        path = FIXTURE_DIR / "saas_subscription_1k.csv"
        proposed, meta, _profile, dash = _parse_fixture(path)
        self.assertEqual(infer_executive_domain(pd.read_csv(path).columns.tolist()), "saas")
        self.assertEqual(proposed.get("sales"), "mrr")
        self.assertNotEqual(proposed.get("sales"), proposed.get("profit"))
        self.assertIn(
            proposed.get("profit"),
            ("churn_rate", "active_users", "new_signups", "expansion_revenue"),
        )
        self.assertEqual(dash.get("type_label"), "SaaS / Subscription")
        self.assertEqual(_aggregate_mapping_confidence(meta), "high")

    def test_healthcare_high_confidence_with_distinct_roles(self) -> None:
        path = FIXTURE_DIR / "healthcare_patient_1k.csv"
        proposed, meta, _profile, dash = _parse_fixture(path)
        self.assertEqual(proposed.get("sales"), "claim_amount")
        self.assertIn(
            proposed.get("profit"),
            ("readmission_rate", "wait_time_minutes", "visit_count"),
        )
        self.assertEqual(proposed.get("date"), "visit_date")
        self.assertEqual(proposed.get("product"), "department")
        self.assertEqual(dash.get("type_label"), "Healthcare")
        self.assertEqual(_aggregate_mapping_confidence(meta), "high")

    def test_saas_high_confidence_with_distinct_roles(self) -> None:
        path = FIXTURE_DIR / "saas_subscription_1k.csv"
        proposed, meta, _profile, dash = _parse_fixture(path)
        self.assertEqual(proposed.get("sales"), "mrr")
        self.assertIn(
            proposed.get("profit"),
            ("churn_rate", "active_users", "new_signups", "expansion_revenue"),
        )
        self.assertEqual(proposed.get("date"), "month")
        self.assertIn(proposed.get("product"), ("plan_type", "customer_segment"))
        self.assertEqual(dash.get("type_label"), "SaaS / Subscription")
        self.assertEqual(_aggregate_mapping_confidence(meta), "high")

    def test_banking_at_least_medium_not_dragged_by_optional_region(self) -> None:
        path = FIXTURE_DIR / "banking_financial_1k.csv"
        proposed, meta, _profile, _dash = _parse_fixture(path)
        roles = meta.get("roles") or {}
        self.assertIsNone(proposed.get("region"))
        self.assertEqual(_aggregate_mapping_confidence(meta), "medium")
        for core in ("sales", "product", "date"):
            self.assertEqual(
                (roles.get(core) or {}).get("confidence"),
                "high",
                msg=f"banking {core}",
            )

    def test_supply_chain_high_confidence_not_dragged_by_optional_customer(self) -> None:
        path = FIXTURE_DIR / "supply_chain_logistics_1k.csv"
        proposed, meta, _profile, _dash = _parse_fixture(path)
        roles = meta.get("roles") or {}
        self.assertIsNone(proposed.get("customer"))
        self.assertEqual(_aggregate_mapping_confidence(meta), "high")
        for core in ("sales", "date", "product"):
            self.assertEqual(
                (roles.get(core) or {}).get("confidence"),
                "high",
                msg=f"supply_chain {core}",
            )

    def test_optional_customer_medium_does_not_reduce_aggregate(self) -> None:
        path = FIXTURE_DIR / "healthcare_patient_1k.csv"
        _proposed, meta, _profile, _dash = _parse_fixture(path)
        roles = meta.get("roles") or {}
        self.assertEqual((roles.get("customer") or {}).get("confidence"), "medium")
        self.assertEqual(_aggregate_mapping_confidence(meta), "high")

    def test_backend_aggregate_matches_test_helper(self) -> None:
        for filename in FIXTURE_EXPECTATIONS:
            path = FIXTURE_DIR / filename
            _proposed, meta, _profile, _dash = _parse_fixture(path)
            main.column_mapping_metadata = meta
            self.assertEqual(
                main._aggregate_mapping_confidence_from_meta(),
                _aggregate_mapping_confidence(meta),
                msg=filename,
            )

    def test_hr_workforce_not_low_confidence(self) -> None:
        """HR with salary/department/hire_date must not show Low aggregate confidence."""
        path = FIXTURE_DIR / "hr_workforce_1k.csv"
        _proposed, meta, _profile, _dash = _parse_fixture(path)
        self.assertEqual(_aggregate_mapping_confidence(meta), "high")
        roles = meta.get("roles") or {}
        self.assertEqual((roles.get("sales") or {}).get("confidence"), "high")
        self.assertEqual((roles.get("product") or {}).get("confidence"), "high")
        self.assertEqual((roles.get("date") or {}).get("confidence"), "high")

    def test_no_id_like_dimensions_in_chart_titles(self) -> None:
        for filename in FIXTURE_EXPECTATIONS:
            path = FIXTURE_DIR / filename
            _proposed, _meta, _profile, dash = _parse_fixture(path)
            joined = " | ".join(
                str(c.get("title") or "") for c in dash.get("charts") or []
            ).lower()
            for pat in _ID_TITLE_PATTERNS:
                self.assertIsNone(re.search(pat, joined), msg=f"{filename} matched {pat}")

    def test_no_default_scatter_without_relationship_use_case(self) -> None:
        for filename in (
            "retail_ecommerce_1k.csv",
            "banking_financial_1k.csv",
            "hr_workforce_1k.csv",
            "healthcare_patient_1k.csv",
            "marketing_campaign_1k.csv",
        ):
            path = FIXTURE_DIR / filename
            _proposed, _meta, _profile, dash = _parse_fixture(path)
            scatters = [
                c
                for c in dash.get("charts") or []
                if str(c.get("chartType", "")).lower() == "scatter"
            ]
            self.assertEqual(len(scatters), 0, msg=f"{filename} scatters={scatters}")

    def test_charts_are_renderable(self) -> None:
        for filename in FIXTURE_EXPECTATIONS:
            path = FIXTURE_DIR / filename
            _proposed, _meta, _profile, dash = _parse_fixture(path)
            for chart in dash.get("charts") or []:
                ok, reason = validate_chart_renderable(chart)
                self.assertTrue(ok, msg=f"{filename} {chart.get('title')}: {reason}")

    def test_kpi_cards_present(self) -> None:
        path = FIXTURE_DIR / "hr_workforce_1k.csv"
        _proposed, _meta, _profile, dash = _parse_fixture(path)
        cards = dash.get("cards") or []
        self.assertGreaterEqual(len(cards), 3)
        titles = " ".join(str(c.get("title") or "") for c in cards).lower()
        self.assertIn("salary", titles)


class TestHrGoldMappingConfidenceRegression(unittest.TestCase):
    """Ensure HR gold fixture benefits from the same confidence fixes."""

    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping_metadata = None
        main.column_mapping = {k: None for k in main.column_mapping}

    def test_hr_gold_aggregate_not_low(self) -> None:
        path = REPO_ROOT / "test-fixtures" / "golden-datasets" / "hr_gold_5000.csv"
        df = pd.read_csv(path)
        for col in df.columns:
            if "date" in col.lower():
                df[col] = pd.to_datetime(df[col], errors="coerce")
        df = main.clean_dataframe(df)
        profile = main.build_profile(df)
        _proposed, meta = main.compute_semantic_column_mapping(df, profile)
        agg = _aggregate_mapping_confidence(meta)
        self.assertIn(agg, ("high", "medium"), msg=f"aggregate={agg} roles={meta.get('roles')}")


class TestUploadPayloadMappingConfidence(unittest.TestCase):
    """Upload payload exposes aggregate mapping_confidence aligned with role metadata."""

    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping_metadata = None
        main.column_mapping = {k: None for k in main.column_mapping}

    def test_compose_upload_payload_includes_mapping_confidence(self) -> None:
        path = FIXTURE_DIR / "hr_workforce_1k.csv"
        _proposed, meta, _profile, _dash = _parse_fixture(path)
        payload = main.build_upload_response([])
        self.assertIn("mapping_confidence", payload)
        self.assertEqual(payload["mapping_confidence"], _aggregate_mapping_confidence(meta))
        self.assertIn(payload["mapping_confidence"], ("high", "medium"))


if __name__ == "__main__":
    unittest.main()
