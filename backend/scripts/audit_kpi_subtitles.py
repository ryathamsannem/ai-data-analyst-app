"""KPI subtitle audit report for domain fixtures."""

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
from services.kpi_subtitles import audit_subtitle  # noqa: E402

AUDIT_FIXTURES = (
    "hr.csv",
    "retail.csv",
    "sales.csv",
    "operations.csv",
    "dashboard_showcase_dataset.csv",
)


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


def audit() -> list[dict]:
    rows: list[dict] = []
    for name in AUDIT_FIXTURES:
        path = FIX_DIR / name
        df = _load(path)
        profile = main.build_profile(df)
        main.df = df
        main.dataset_profile = profile
        main.column_mapping = {k: None for k in main.column_mapping}
        proposed, _ = main.compute_semantic_column_mapping(df, profile)
        for key, val in proposed.items():
            main.column_mapping[key] = val
        dash = main.build_auto_dashboard()
        for card in dash.get("cards") or []:
            meta = card.get("subtitle_meta") or {}
            dim = str(meta.get("source_dimension") or "")
            met = str(meta.get("source_metric") or "")
            subtitle = str(card.get("subtitle") or "")
            issues = audit_subtitle(subtitle, dim, [str(c) for c in df.columns.tolist()])
            rows.append(
                {
                    "fixture": name,
                    "title": card.get("title"),
                    "value": card.get("value"),
                    "subtitle": subtitle,
                    "source_dimension": dim or None,
                    "source_metric": met or None,
                    "issues": issues,
                }
            )
    main.df = None
    main.dataset_profile = None
    return rows


if __name__ == "__main__":
    report = audit()
    out = REPO_ROOT / "backend" / "tests" / "fixtures" / "kpi_subtitle_audit.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote {len(report)} KPI subtitle rows to {out}\n")
    for row in report:
        flag = " OK" if not row["issues"] else f" ISSUES: {row['issues']}"
        print(
            f"[{row['fixture']}] {row['title']}\n"
            f"  value: {row['value']}\n"
            f"  subtitle: {row['subtitle'] or '(none)'}\n"
            f"  dim: {row['source_dimension']} | metric: {row['source_metric']}{flag}\n"
        )
    bad = [r for r in report if r["issues"]]
    if bad:
        sys.exit(1)
