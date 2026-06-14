"""Auto Dashboard chart audit report for domain fixtures."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
FIX_DIR = REPO_ROOT / "test-fixtures" / "domains"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
from services.auto_dashboard_opportunities import audit_dashboard_charts  # noqa: E402
from tests.test_auto_dashboard_opportunities import _deps  # noqa: E402

FIXTURES = (
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


def audit() -> list[dict]:
    rows: list[dict] = []
    for name in FIXTURES:
        path = FIX_DIR / name
        if not path.is_file():
            continue
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
        kind = str(dash.get("kind") or "generic")
        for row in audit_dashboard_charts(df, profile, kind, _deps(), kpi_cards=dash.get("cards")):
            row["fixture"] = name
            rows.append(row)
    main.df = None
    main.dataset_profile = None
    return rows


if __name__ == "__main__":
    report = audit()
    out = REPO_ROOT / "backend" / "tests" / "fixtures" / "auto_dashboard_chart_audit.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote {len(report)} chart audit rows to {out}\n")
    bad = [r for r in report if not r.get("renderable")]
    for row in report:
        flag = " OK" if row.get("renderable") else f" FAIL: {row.get('reason')}"
        print(
            f"[{row['fixture']}] {row.get('chart_type')} | {row.get('title')}\n"
            f"  dim={row.get('dimension_column')} met={row.get('metric_column')}{flag}\n"
        )
    if bad:
        sys.exit(1)
