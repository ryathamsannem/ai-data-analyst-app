"""One-off confidence breakdown for domain 1k fixtures."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
FIX = REPO / "test-fixtures" / "domain_upload_1k"
sys.path.insert(0, str(BACKEND))

import main  # noqa: E402
from services.executive_kpi_cards import infer_executive_domain  # noqa: E402
from services.file_parsers import load_dataframe_from_upload  # noqa: E402


def aggregate(meta: dict) -> str:
    roles = meta.get("roles") or {}
    rank = {"low": 0, "medium": 1, "high": 2}
    worst = "high"
    for key in ("sales", "product", "date", "profit"):
        conf = str((roles.get(key) or {}).get("confidence") or "low").lower()
        if rank[conf] < rank[worst]:
            worst = conf
    for key in ("region", "customer"):
        role = roles.get(key) or {}
        if not role.get("selected"):
            continue
        conf = str(role.get("confidence") or "low").lower()
        if rank[conf] < rank[worst]:
            worst = conf
    return worst


def parse(name: str) -> tuple[dict, dict]:
    path = FIX / name
    raw = path.read_bytes()
    df, _ = load_dataframe_from_upload(raw, path.name)
    df = main.clean_dataframe(df)
    for col in df.columns:
        cl = str(col).lower()
        if "date" in cl or cl in ("month", "report_month"):
            df[col] = pd.to_datetime(df[col], errors="coerce")
    profile = main.build_profile(df)
    return main.compute_semantic_column_mapping(df, profile)


def breakdown(name: str) -> dict:
    proposed, meta = parse(name)
    cols = pd.read_csv(FIX / name).columns.tolist()
    roles = meta.get("roles") or {}
    out: dict = {
        "file": name,
        "exec_domain": infer_executive_domain(cols),
        "map_domain": meta.get("domain"),
        "aggregate_test_helper": aggregate(meta),
        "proposed": proposed,
        "roles": {},
    }
    main.column_mapping_metadata = meta
    out["aggregate_backend"] = main._aggregate_mapping_confidence_from_meta()
    for rk in ("sales", "profit", "date", "product", "region", "customer"):
        r = roles.get(rk) or {}
        top = r.get("top_candidates") or []
        out["roles"][rk] = {
            "selected": r.get("selected"),
            "confidence": r.get("confidence"),
            "top1": top[0] if top else None,
            "top2": top[1] if len(top) > 1 else None,
            "top3": top[2] if len(top) > 2 else None,
        }
    return out


def compact_summary(name: str) -> None:
    proposed, meta = parse(name)
    roles = meta.get("roles") or {}
    main.column_mapping_metadata = meta
    print(name)
    print(f"  aggregate: {main._aggregate_mapping_confidence_from_meta()}")
    print(f"  proposed: {proposed}")
    for rk in ("sales", "profit", "date", "product", "region", "customer"):
        r = roles.get(rk) or {}
        top = r.get("top_candidates") or []
        t1 = top[0] if top else {}
        t2 = top[1] if len(top) > 1 else {}
        gap = float(t1.get("score") or 0) - float(t2.get("score") or 0)
        print(
            f"  {rk}: sel={r.get('selected')} conf={r.get('confidence')} "
            f"s1={t1.get('score')} s2={t2.get('score')} gap={gap:.1f}"
        )
    print()


if __name__ == "__main__":
    files = sys.argv[1:] or [
        "healthcare_patient_1k.csv",
        "saas_subscription_1k.csv",
        "supply_chain_logistics_1k.csv",
        "banking_financial_1k.csv",
    ]
    if "--json" in files:
        files.remove("--json")
        for fn in files:
            print(json.dumps(breakdown(fn), indent=2, default=str))
    else:
        for fn in files:
            compact_summary(fn)
