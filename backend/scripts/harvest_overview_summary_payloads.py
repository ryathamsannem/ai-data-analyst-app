"""Emit overview AI-summary test payloads from test-fixtures/domains/*.csv."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
FIX_DIR = REPO_ROOT / "test-fixtures" / "domains"
OUT = REPO_ROOT / "frontend" / "lib" / "__fixtures__" / "overview-summary-domains.json"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402


def _fixture_paths() -> list[Path]:
    names = [
        "banking_financial_services.csv",
        "customer_support.csv",
        "dashboard_showcase_dataset.csv",
        "employee_test.csv",
        "finance_fpa.csv",
        "geography.csv",
        "healthcare.csv",
        "hr.csv",
        "marketing.csv",
        "monthly_sales.csv",
        "operations.csv",
        "operations_incidents_chart_test.csv",
        "retail.csv",
        "retail_orders_chart_test.csv",
        "sales.csv",
        "screenshot-fixture.csv",
    ]
    paths: list[Path] = []
    for name in names:
        p = FIX_DIR / name
        if p.is_file():
            paths.append(p)
    return paths


def _load_frame(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    for col in df.columns:
        if "date" in str(col).lower():
            try:
                df[col] = pd.to_datetime(df[col], errors="coerce")
            except Exception:
                pass
            break
    return df


def harvest() -> list[dict]:
    payloads: list[dict] = []
    for path in _fixture_paths():
        df = _load_frame(path)
        profile = main.build_profile(df)
        main.df = df
        main.dataset_profile = profile
        main.column_mapping = {k: None for k in main.column_mapping}
        proposed, _ = main.compute_semantic_column_mapping(df, profile)
        for key, val in proposed.items():
            main.column_mapping[key] = val

        dash = main.build_auto_dashboard()
        domain_key = path.stem
        payloads.append(
            {
                "domain": domain_key,
                "file": path.name,
                "rows": int(len(df)),
                "columns": [str(c) for c in df.columns.tolist()],
                "auto_dashboard": {
                    "kind": dash.get("kind"),
                    "type_label": dash.get("type_label"),
                    "cards": dash.get("cards") or [],
                    "charts": [
                        {
                            "title": c.get("title"),
                            "chartType": c.get("chartType"),
                            "labels": c.get("labels") or [],
                            "values": c.get("values") or [],
                        }
                        for c in (dash.get("charts") or [])
                    ],
                },
                "primaryMetricColumn": main.column_mapping.get("sales"),
                "groupingColumn": main.column_mapping.get("product"),
                "dateColumn": main.column_mapping.get("date"),
                "profile": profile,
            }
        )
    main.df = None
    main.dataset_profile = None
    return payloads


def main_cli() -> None:
    data = harvest()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, default=str, indent=2), encoding="utf-8")
    print(f"Wrote {len(data)} payloads to {OUT}")


if __name__ == "__main__":
    main_cli()
