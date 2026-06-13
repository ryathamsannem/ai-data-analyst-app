"""Validate Auto Dashboard KPI cards for all test-fixtures/domains/*.csv."""

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
from services.executive_kpi_cards import infer_executive_domain  # noqa: E402


def _load(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    for col in df.columns:
        if "date" in str(col).lower():
            try:
                df[col] = pd.to_datetime(df[col], errors="coerce")
            except Exception:
                pass
            break
    return df


def validate() -> list[dict]:
    rows: list[dict] = []
    for path in sorted(FIX_DIR.glob("*.csv")):
        df = _load(path)
        profile = main.build_profile(df)
        main.df = df
        main.dataset_profile = profile
        main.column_mapping = {k: None for k in main.column_mapping}
        proposed, _ = main.compute_semantic_column_mapping(df, profile)
        for key, val in proposed.items():
            main.column_mapping[key] = val

        dash = main.build_auto_dashboard()
        exec_domain = infer_executive_domain([str(c) for c in df.columns.tolist()])
        kpi_domain = main.infer_kpi_domain()
        dataset_kind = main.infer_dataset_kind()
        auto_kind = infer = main.infer_auto_dashboard_kind()

        cards = dash.get("cards") or []
        rows.append(
            {
                "file": path.name,
                "rows": int(len(df)),
                "columns": [str(c) for c in df.columns.tolist()],
                "infer_dataset_kind": dataset_kind,
                "infer_executive_domain": exec_domain,
                "infer_kpi_domain": kpi_domain,
                "infer_auto_dashboard_kind": auto_kind,
                "dashboard_kind": dash.get("kind"),
                "type_label": dash.get("type_label"),
                "cards": [
                    {
                        "title": c.get("title"),
                        "value": c.get("value"),
                        "subtitle": c.get("subtitle"),
                    }
                    for c in cards
                ],
                "na_titles": [
                    str(c.get("title"))
                    for c in cards
                    if str(c.get("value", "")).strip().upper() == "N/A"
                ],
            }
        )
    main.df = None
    main.dataset_profile = None
    return rows


if __name__ == "__main__":
    data = validate()
    out = REPO_ROOT / "backend" / "tests" / "fixtures" / "kpi_validation_baseline.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"Wrote {len(data)} fixture reports to {out}")
    for row in data:
        na = row["na_titles"]
        print(
            f"\n{row['file']}: exec={row['infer_executive_domain']} kind={row['dashboard_kind']} "
            f"kpi_domain={row['infer_kpi_domain']} cards={len(row['cards'])} na={na or 'none'}"
        )
        for c in row["cards"]:
            sub = f" ({c['subtitle']})" if c.get("subtitle") else ""
            print(f"  - {c['title']}: {c['value']}{sub}")
