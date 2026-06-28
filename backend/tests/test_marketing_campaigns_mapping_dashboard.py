"""Marketing campaign upload: mapping confidence + default Overview chart policy."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
FIXTURE = REPO_ROOT / "test-fixtures" / "marketing_campaigns_chart_test.csv"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
from services.file_parsers import load_dataframe_from_upload  # noqa: E402


def _aggregate_mapping_confidence(meta: dict) -> str:
    roles = meta.get("roles") or {}
    rank = {"low": 0, "medium": 1, "high": 2}
    worst = "high"
    for key in ("sales", "product", "date", "profit"):
        conf = str((roles.get(key) or {}).get("confidence") or "low").lower()
        if rank[conf] < rank[worst]:
            worst = conf
    return worst


def _parse_fixture() -> tuple[dict, dict, dict]:
    raw = FIXTURE.read_bytes()
    df, _ = load_dataframe_from_upload(raw, FIXTURE.name)
    df = main.clean_dataframe(df)
    for col in df.columns:
        if "date" in str(col).lower():
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
    return proposed, meta, dash


class TestMarketingCampaignsMapping(unittest.TestCase):
    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping_metadata = None
        main.column_mapping = {k: None for k in main.column_mapping}

    def test_fixture_exists(self) -> None:
        self.assertTrue(FIXTURE.is_file())

    def test_revenue_primary_not_low_confidence(self) -> None:
        proposed, meta, _dash = _parse_fixture()
        self.assertEqual(proposed.get("sales"), "revenue")
        agg = _aggregate_mapping_confidence(meta)
        main.column_mapping_metadata = meta
        self.assertIn(agg, ("high", "medium"), msg=f"aggregate={agg} roles={meta.get('roles')}")
        self.assertNotEqual(agg, "low")
        self.assertEqual((meta["roles"]["sales"] or {}).get("confidence"), "high")

    def test_core_role_mappings(self) -> None:
        proposed, meta, dash = _parse_fixture()
        self.assertEqual(proposed.get("date"), "campaign_date")
        self.assertIn(proposed.get("product"), ("campaign_name", "channel"))
        self.assertNotEqual(proposed.get("product"), "campaign_id")
        self.assertNotEqual(proposed.get("sales"), proposed.get("profit"))
        self.assertIn(
            proposed.get("profit"),
            ("roi", "spend", "conversions", "clicks", "impressions"),
        )
        self.assertEqual(dash.get("type_label"), "Marketing")
        roles = meta.get("roles") or {}
        self.assertIn((roles.get("profit") or {}).get("confidence"), ("high", "medium"))

    def test_upload_payload_mapping_confidence(self) -> None:
        _proposed, meta, _dash = _parse_fixture()
        payload = main.build_upload_response([])
        self.assertIn(payload["mapping_confidence"], ("high", "medium"))
        self.assertEqual(
            payload["mapping_confidence"],
            main._aggregate_mapping_confidence_from_meta(),
        )


class TestMarketingCampaignsDefaultOverview(unittest.TestCase):
    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping_metadata = None
        main.column_mapping = {k: None for k in main.column_mapping}

    def test_no_default_scatter_when_business_charts_exist(self) -> None:
        _proposed, _meta, dash = _parse_fixture()
        charts = dash.get("charts") or []
        scatters = [
            c for c in charts if str(c.get("chartType", "")).lower() == "scatter"
        ]
        self.assertEqual(len(scatters), 0, msg=[c.get("title") for c in charts])
        titles = " | ".join(str(c.get("title") or "") for c in charts).lower()
        self.assertNotIn("revenue vs clicks", titles)
        self.assertNotIn("revenue vs spend", titles)

    def test_includes_business_friendly_charts(self) -> None:
        _proposed, _meta, dash = _parse_fixture()
        charts = dash.get("charts") or []
        self.assertGreaterEqual(len(charts), 3)
        titles = " | ".join(str(c.get("title") or "") for c in charts).lower()
        self.assertTrue(
            "revenue" in titles and ("trend" in titles or "channel" in titles or "share" in titles),
            msg=titles,
        )

    def test_explicit_relationship_question_still_allows_scatter(self) -> None:
        _proposed, _meta, _dash = _parse_fixture()
        _viz, visualization, analysis = main.compute_visualization_for_question(
            "How does revenue correlate with spend?"
        )
        intent = (analysis or {}).get("intent") or {}
        self.assertEqual(intent.get("primaryGoal"), "relationship")
        self.assertIsNotNone(visualization)
        self.assertEqual(str(visualization.get("chartType")).lower(), "scatter")


if __name__ == "__main__":
    unittest.main()
